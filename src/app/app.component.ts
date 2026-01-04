import {
  Component,
  OnInit,
  Renderer2,
  HostListener,
  ElementRef,
  inject,
  OnDestroy,
  isDevMode
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from './services/auth.service';
import { Router, NavigationEnd } from '@angular/router';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { ToastrService } from 'ngx-toastr';
import { Subscription, filter } from 'rxjs';
import { ChatRealtimeService } from './chat/chat-realtime.service';
import { QueueSocketService } from './services/queue-socket.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  darkMode = false;
  menuOpen = false;
  currentLang = 'en';

  // 🔔 totale non letti per badge in navbar
  unreadTotal = 0;

  // ✅ chat visibile/attiva solo per user/admin loggati (no guest)
  canUseChat = false;

  // ✅ nome utente per saluto navbar
  navUsername = '';

  private subs: Subscription[] = [];

  // listeners attività (rimossi su destroy)
  private activityHandler?: () => void;

  // Service Worker opzionale (in dev potrebbe non esserci)
  private swUpdate = inject(SwUpdate, { optional: true });

  constructor(
    private renderer: Renderer2,
    private translate: TranslateService,
    private authService: AuthService,
    private router: Router,
    private eRef: ElementRef,
    private toastr: ToastrService,
    private chatRealtime: ChatRealtimeService,
    private queueSocket: QueueSocketService
  ) {}

  ngOnInit(): void {
    // === Rimuovo l'overlay di loading il prima possibile ===
    this.removeAppLoader();

    // ✅ QUEUE REALTIME (PUBBLICA): connetto sempre (guest/anon inclusi)
    this.queueSocket.connect();

    // ✅ inizializza subito username da storage (per non vedere vuoto al primo render)
    this.navUsername = (localStorage.getItem('username') || '').trim();

    // ✅ aggiorna navUsername quando cambia currentUser (se arriva dal backend)
    this.subs.push(
      this.authService.currentUser$.subscribe((u) => {
        const name = this.resolveNavUsername(u);
        if (name) this.navUsername = name;
      })
    );

    // ✅ NavigationEnd: rimuovi loader; se chat attiva, registra activity
    this.subs.push(
      this.router.events
        .pipe(filter(e => e instanceof NavigationEnd))
        .subscribe(() => {
          if (this.canUseChat) this.safeTouchActivity();
          this.removeAppLoader();
        })
    );

    // === CHAT REALTIME + BADGE (solo user/admin loggati) ===
    this.subs.push(
      this.authService.isLoggedIn$.subscribe((isLogged) => {
        const ruolo = this.readJwtRole(); // 'user' | 'admin' | 'guest' | null
        const canUse = isLogged && ruolo !== 'guest' && ruolo !== null;

        this.canUseChat = canUse;

        if (isLogged) {
          // se loggato, prova a tenere username aggiornato (fallback storage)
          this.navUsername = (localStorage.getItem('username') || this.navUsername || '').trim();
        } else {
          this.navUsername = '';
        }

        if (canUse) {
          // ✅ avvio globale: così il badge si aggiorna anche fuori dalla pagina chat
          this.chatRealtime.start();

          this.safeTouchActivity();
          this.installActivityListeners();
        } else {
          // guest/anon/logout
          try { this.chatRealtime.stop(); } catch {}
          try { this.chatRealtime.resetUnread(); } catch {}
          this.unreadTotal = 0;
          this.removeActivityListeners();
        }
      })
    );

    // 🔔 Totale non letti per badge
    this.subs.push(
      this.chatRealtime.totalUnread$.subscribe(n => {
        this.unreadTotal = this.canUseChat ? (n || 0) : 0;
      })
    );

    // === Toast post-update PWA ===
    const justUpdated = sessionStorage.getItem('justUpdated');
    if (justUpdated === '1') {
      sessionStorage.removeItem('justUpdated');
      this.toastr.success('App aggiornata all’ultima versione ✅', 'Aggiornamento', { timeOut: 4000 });
    }

    // Dark mode
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode === null) {
      this.darkMode = true;
      localStorage.setItem('darkMode', 'true');
    } else {
      this.darkMode = savedMode === 'true';
    }
    this.updateBodyClass();

    // Lingue
    this.translate.addLangs(['en', 'it']);
    this.translate.setDefaultLang('en');
    const savedLang = localStorage.getItem('lang');
    const browserLang = this.translate.getBrowserLang();
    this.currentLang = savedLang || (browserLang?.match(/en|it/) ? browserLang : 'en');
    this.translate.use(this.currentLang);

    // Effetto navbar
    setTimeout(() => {
      this.triggerNavbarAnimation();
      this.removeAppLoader();
    }, 100);

    // ====== AGGIORNAMENTI PWA ======
    if (this.swUpdate?.isEnabled && !isDevMode()) {
      this.swUpdate.versionUpdates.subscribe((e: VersionEvent) => {
        switch (e.type) {
          case 'VERSION_DETECTED':
            this.toastr.info('Sto scaricando un aggiornamento…', 'Aggiornamento', { timeOut: 3000 });
            break;
          case 'VERSION_READY':
            this.toastr.info('Nuova versione pronta. Installo e riapro…', 'Aggiornamento', { timeOut: 2500 });
            sessionStorage.setItem('justUpdated', '1');
            this.activateUpdateAndReload();
            break;
          case 'VERSION_INSTALLATION_FAILED':
            this.toastr.error('Installazione aggiornamento non riuscita.', 'Aggiornamento', { timeOut: 5000 });
            break;
          default:
            break;
        }
      });

      this.checkForUpdateSafe();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.checkForUpdateSafe();
      });
      window.addEventListener('online', () => this.checkForUpdateSafe());
      setInterval(() => this.checkForUpdateSafe(), 5 * 60 * 1000);
    }

    // Failsafe finale
    setTimeout(() => this.removeAppLoader(), 6000);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.removeActivityListeners();

    try { this.chatRealtime.stop(); } catch {}
  }

  // ===========================
  // Username helper
  // ===========================
  private resolveNavUsername(u: any | null): string {
    const fromUser =
      (u?.username ?? u?.name ?? u?.nome ?? u?.displayName ?? '').toString().trim();

    const fromStorage = (localStorage.getItem('username') || '').trim();

    // priorità: backend user → storage
    return (fromUser || fromStorage || '').trim();
  }

  // ===========================
  // Presence "soft"
  // ===========================
  private safeTouchActivity(): void {
    try {
      this.chatRealtime.touchActivity();
    } catch {}
  }

  private installActivityListeners(): void {
    if (this.activityHandler) return;

    const touch = () => this.safeTouchActivity();
    this.activityHandler = touch;

    window.addEventListener('click', touch);
    window.addEventListener('keydown', touch);
    window.addEventListener('mousemove', touch, { passive: true });
    window.addEventListener('scroll', touch, { passive: true });
    window.addEventListener('touchstart', touch, { passive: true });
  }

  private removeActivityListeners(): void {
    const touch = this.activityHandler;
    if (!touch) return;

    window.removeEventListener('click', touch);
    window.removeEventListener('keydown', touch);
    window.removeEventListener('mousemove', touch as any);
    window.removeEventListener('scroll', touch as any);
    window.removeEventListener('touchstart', touch as any);

    this.activityHandler = undefined;
  }

  // ===========================
  // JWT ROLE
  // ===========================
  private readJwtRole(): string | null {
    const raw = (localStorage.getItem('token') || '').trim();
    const token = raw.replace(/^Bearer\s+/i, '').trim();
    if (!token || token.split('.').length !== 3) return null;

    try {
      const part = token.split('.')[1] || '';
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(b64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const payload = JSON.parse(json);
      return typeof payload?.ruolo === 'string' ? payload.ruolo : null;
    } catch {
      return null;
    }
  }

  private async checkForUpdateSafe() {
    try { await this.swUpdate?.checkForUpdate(); } catch {}
  }

  private async activateUpdateAndReload() {
    try { await this.swUpdate?.activateUpdate(); } catch {}
    location.reload();
  }

  /** Nasconde/sgancia l'overlay #app-loading se ancora presente */
  private removeAppLoader(): void {
    const el = document.getElementById('app-loading');
    if (el) {
      (el as HTMLElement).style.display = 'none';
      requestAnimationFrame(() => el.remove());
    }
  }

  // ====== UI ======
  @HostListener('window:scroll', [])
  onWindowScroll(): void {
    if (window.scrollY === 0) this.triggerNavbarAnimation();
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.menuOpen && !this.eRef.nativeElement.querySelector('.navbar')?.contains(target)) {
      this.closeMenu();
    }
  }

  triggerNavbarAnimation(): void {
    const navbar = document.querySelector('.navbar');
    if (navbar) {
      navbar.classList.remove('animate-in');
      void (navbar as HTMLElement).offsetWidth;
      navbar.classList.add('animate-in');
    }
  }

  toggleDarkMode(): void {
    this.darkMode = !this.darkMode;
    localStorage.setItem('darkMode', this.darkMode.toString());
    this.updateBodyClass();
  }

  updateBodyClass(): void {
    if (this.darkMode) {
      this.renderer.addClass(document.body, 'dark-mode');
      this.renderer.removeClass(document.body, 'light-mode');
    } else {
      this.renderer.addClass(document.body, 'light-mode');
      this.renderer.removeClass(document.body, 'dark-mode');
    }
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
    document.body.style.overflow = this.menuOpen ? 'hidden' : 'auto';
  }

  closeMenu(): void {
    this.menuOpen = false;
    document.body.style.overflow = 'auto';
  }

  logout(): void {
    this.authService.logout();

    try { this.chatRealtime.stop(); } catch {}
    try { this.chatRealtime.resetUnread(); } catch {}
    this.unreadTotal = 0;
    this.canUseChat = false;
    this.navUsername = '';

    this.router.navigate(['/login']);
    this.closeMenu();
  }

  switchLanguage(lang: string): void {
    this.currentLang = lang;
    this.translate.use(lang);
    localStorage.setItem('lang', lang);
    this.closeMenu();
  }

  goToLogin(event: Event): void {
    event.preventDefault();
    this.router.navigate([this.authService.isLoggedIn() ? '/user-profile' : '/login']);
    this.closeMenu();
  }

  // ✅ testo saluto in base lingua
  get helloText(): string {
    return this.currentLang === 'it' ? 'Ciao' : 'Hi';
  }

  get isLightMode(): boolean { return !this.darkMode; }
  get isLoggedIn(): boolean { return this.authService.isLoggedIn(); }
}
