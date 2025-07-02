import { Component, OnInit, Renderer2 } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from './services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']  // o .css se usi css
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
    // Dark mode da localStorage
    const savedMode = localStorage.getItem('darkMode');
    this.darkMode = savedMode === 'true';
    this.updateBodyClass();

    // Configura lingue ngx-translate
    this.translate.addLangs(['en', 'it']);
    this.translate.setDefaultLang('en');

    // Lingua salvata o browser
    const savedLang = localStorage.getItem('lang');
    const browserLang = this.translate.getBrowserLang();
    if (savedLang) {
      this.currentLang = savedLang;
    } else if (browserLang && browserLang.match(/en|it/)) {
      this.currentLang = browserLang;
    } else {
      this.currentLang = 'en';
    }
    this.translate.use(this.currentLang);
  }

  toggleDarkMode(): void {
    this.darkMode = !this.darkMode;
    localStorage.setItem('darkMode', this.darkMode.toString());
    this.updateBodyClass();
  }

  updateBodyClass(): void {
    if (this.darkMode) {
      this.renderer.addClass(document.body, 'dark-mode');
      this.renderer.addClass(document.body, 'bg-dark');
      this.renderer.addClass(document.body, 'text-light');
    } else {
      this.renderer.removeClass(document.body, 'dark-mode');
      this.renderer.removeClass(document.body, 'bg-dark');
      this.renderer.removeClass(document.body, 'text-light');
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
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/user-profile']);
    } else {
      this.router.navigate(['/login']);
    }
    this.menuOpen = false;
  }
}
