import { Component, OnInit, Renderer2, HostListener, ElementRef } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from './services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  darkMode = false;
  menuOpen = false;
  currentLang = 'en';

  constructor(
    private renderer: Renderer2,
    private translate: TranslateService,
    private authService: AuthService,
    private router: Router,
    private eRef: ElementRef
  ) {}

  ngOnInit(): void {
    // Recupera modalità scura dal localStorage
    const savedMode = localStorage.getItem('darkMode');

    if (savedMode === null) {
      this.darkMode = true;
      localStorage.setItem('darkMode', 'true'); // salva come default
    } else {
      this.darkMode = savedMode === 'true';
    }
    this.updateBodyClass();

    // Setup lingue
    this.translate.addLangs(['en', 'it']);
    this.translate.setDefaultLang('en');

    const savedLang = localStorage.getItem('lang');
    const browserLang = this.translate.getBrowserLang();
    this.currentLang = savedLang || (browserLang?.match(/en|it/) ? browserLang : 'en');
    this.translate.use(this.currentLang);

    // Effetto animazione navbar all'avvio
    setTimeout(() => this.triggerNavbarAnimation(), 100);
  }

  // Riassegna animazione navbar quando si scrolla in cima
  @HostListener('window:scroll', [])
  onWindowScroll(): void {
    if (window.scrollY === 0) {
      this.triggerNavbarAnimation();
    }
  }

  // Chiude il menu se clicco fuori dalla navbar e menu aperto
  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.menuOpen && !this.eRef.nativeElement.querySelector('.navbar')?.contains(target)) {
      this.closeMenu();
    }
  }

  // Animazione navbar: togli e riaggiungi classe per riavviare animazione CSS
  triggerNavbarAnimation(): void {
    const navbar = document.querySelector('.navbar');
    if (navbar) {
      navbar.classList.remove('animate-in');
      // Forza reflow per ripristinare animazione
      void (navbar as HTMLElement).offsetWidth;
      navbar.classList.add('animate-in');
    }
  }

  // Attiva/disattiva modalità scura
  toggleDarkMode(): void {
    this.darkMode = !this.darkMode;
    localStorage.setItem('darkMode', this.darkMode.toString());
    this.updateBodyClass();
  }

  // Aggiorna classi body in base a modalità scura o chiara
  updateBodyClass(): void {
    if (this.darkMode) {
      this.renderer.addClass(document.body, 'dark-mode');
      this.renderer.removeClass(document.body, 'light-mode');
    } else {
      this.renderer.addClass(document.body, 'light-mode');
      this.renderer.removeClass(document.body, 'dark-mode');
    }
  }

  // Apre/chiude menu e blocca lo scroll del body quando menu aperto
  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
    document.body.style.overflow = this.menuOpen ? 'hidden' : 'auto';
  }

  // Chiude menu e riabilita scroll body
  closeMenu(): void {
    this.menuOpen = false;
    document.body.style.overflow = 'auto';
  }

  // Logout e redirect alla pagina di login
  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
    this.closeMenu();
  }

  // Cambia lingua e salva scelta su localStorage, chiude menu
  switchLanguage(lang: string): void {
    this.currentLang = lang;
    this.translate.use(lang);
    localStorage.setItem('lang', lang);
    this.closeMenu();
  }

  // Gestisce il click sul link login/profilo utente
  goToLogin(event: Event): void {
    event.preventDefault();
    this.router.navigate([this.authService.isLoggedIn() ? '/user-profile' : '/login']);
    this.closeMenu();
  }

  // Getter utile per template per stato light mode
  get isLightMode(): boolean {
    return !this.darkMode;
  }
}
