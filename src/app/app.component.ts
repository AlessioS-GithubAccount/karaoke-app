import { Component, OnInit, Renderer2, HostListener, ElementRef, inject, OnDestroy } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from './services/auth.service';
import { Router } from '@angular/router';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { ChatRealtimeService } from './chat/chat-realtime.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  darkMode = false;
  menuOpen = false;
  currentLang = 'en';

  // 🔔 totale non letti per badge navbar
  unreadTotal = 0;

  private subs: Subscription[] = [];

  // Service Worker opzionale (in dev potrebbe non esserci)
  private swUpdate = inject(SwUpdate, { optional: true });

  constructor(
    private renderer: Renderer2,
    private translate: TranslateService,
    private authService: AuthService,
    private router: Router,
    private eRef: ElementRef,
    private toastr: ToastrService,
    private realtime: ChatRealtimeService
  ) {}

  ngOnInit(): void {
    // Se siamo appena rientrati dopo un aggiornamento, mostra esito
    const justUpdated = sessionStorage.getItem('justUpdated');
    if (justUpdated === '1') {
      sessionStorage.removeItem('justUpdated');
      this.toastr.success('App aggiornata all’ultima versione ✅', 'Aggiornamento', {
        timeOut: 4000
      });
    }

    // Modalità scura
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

    // Effetto animazione navbar
    setTimeout(() => this.triggerNavbarAnimation(), 100);

    // ====== CHAT REALTIME per badge navbar ======
    // se l'utente è loggato, assicura la connessione realtime
    if (this.authService.isLoggedIn()) {
      this.realtime.connect();
    }

    // inizializza il totale non letti da localStorage (se presente)
    this.unreadTotal = this.loadTotalUnreadFromStorage();

    // ascolta gli aggiornamenti del totale non letti
    this.subs.push(
      this.realtime.totalUnread$.subscribe(n => {
        this.unreadTotal = n;
      })
    );

    // ====== AGGIORNAMENTI PWA: AUTO + TOAST ======
    if (this.swUpdate?.isEnabled) {
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
          case 'NO_NEW_VERSION_DETECTED':
          default:
            break;
        }
      });

      // Controlli aggiornamenti:
      this.checkForUpdateSafe(); // all’avvio
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.checkForUpdateSafe();
      });
      window.addEventListener('online', () => this.checkForUpdateSafe());
      setInterval(() => this.checkForUpdateSafe(), 5 * 60 * 1000); // ogni 5 min
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  private loadTotalUnreadFromStorage(): number {
    try {
      const raw = localStorage.getItem('chat_unread');
      if (!raw) return 0;
      const obj = JSON.parse(raw);
      let tot = 0;
      for (const k of Object.keys(obj)) {
        const v = Number((obj as any)[k]);
        if (v > 0) tot += v;
      }
      return tot;
    } catch {
      return 0;
    }
  }

  private async checkForUpdateSafe() {
    try {
      await this.swUpdate?.checkForUpdate();
    } catch {
      // ignora eventuali errori silenziosamente
    }
  }

  private async activateUpdateAndReload() {
    try {
      await this.swUpdate?.activateUpdate();
    } catch {
      // anche se fallisce l'attivazione esplicita, il reload solitamente riallinea
    }
    location.reload();
  }

  // ====== UI esistente ======

  @HostListener('window:scroll', [])
  onWindowScroll(): void {
    if (window.scrollY === 0) {
      this.triggerNavbarAnimation();
    }
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
      // Forza reflow per ripristinare animazione
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

  get isLightMode(): boolean {
    return !this.darkMode;
  }

  // 🔒 esposto al template per mostrare la voce "Chat" solo ai loggati (se vuoi usarlo nel template)
  get isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }
}
