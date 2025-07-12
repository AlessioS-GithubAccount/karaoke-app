import { Component, OnInit, Renderer2, HostListener } from '@angular/core';
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
    private router: Router
  ) {}

  ngOnInit(): void {
    const savedMode = localStorage.getItem('darkMode');
    this.darkMode = savedMode === 'true';
    this.updateBodyClass();

    this.translate.addLangs(['en', 'it']);
    this.translate.setDefaultLang('en');

    const savedLang = localStorage.getItem('lang');
    const browserLang = this.translate.getBrowserLang();
    this.currentLang = savedLang || (browserLang?.match(/en|it/) ? browserLang : 'en');
    this.translate.use(this.currentLang);

    // 👉 Animazione all'avvio
    setTimeout(() => this.triggerNavbarAnimation(), 100);
  }

  // 👂 Ascolta scroll
  @HostListener('window:scroll', [])
  onWindowScroll(): void {
    if (window.scrollY === 0) {
      this.triggerNavbarAnimation();
    }
  }

  // 👇 Applica l'effetto
  triggerNavbarAnimation(): void {
    const navbar = document.querySelector('.navbar');
    if (navbar) {
      navbar.classList.remove('animate-in'); // reset per riapplicare
      void (navbar as HTMLElement).offsetWidth; // forza il reflow
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
      this.renderer.removeClass(document.body, 'light-mode');
    } else {
      this.renderer.addClass(document.body, 'light-mode');
    }
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
    this.menuOpen = false;
  }

  switchLanguage(lang: string): void {
    this.currentLang = lang;
    this.translate.use(lang);
    localStorage.setItem('lang', lang);
    this.menuOpen = false;
  }

  goToLogin(event: Event): void {
    event.preventDefault();
    this.router.navigate([this.authService.isLoggedIn() ? '/user-profile' : '/login']);
    this.menuOpen = false;
  }
}
