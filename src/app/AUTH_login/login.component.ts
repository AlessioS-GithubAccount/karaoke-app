import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd, NavigationStart, Event as RouterEvent } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { v4 as uuidv4 } from 'uuid';
import { ToastrService } from 'ngx-toastr';
import { TranslateService } from '@ngx-translate/core';
import { filter, take } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {

  username: string = '';
  password: string = '';
  isLoading: boolean = false;

  private navSub?: Subscription;

  // HINT opzionale: se vuoi prefetch dei moduli target, lascia questi import dinamici
  // (non necessari per il profiling, ma utili dopo)
  // const preloadUserProfile = () => import('../pages/user-profile/user-profile.module');
  // const preloadAdmin = () => import('../pages/admin/admin.module');

  constructor(
    private authService: AuthService,
    private router: Router,
    private toastr: ToastrService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    // niente qui
  }

  private measureAndLog(measureName: string, startMark: string, endMark: string) {
    try {
      performance.measure(measureName, startMark, endMark);
      const entry = performance.getEntriesByName(measureName).at(-1);
      if (entry) {
        console.log(`[PERF] ${measureName}: ${entry.duration.toFixed(1)} ms`);
      }
    } catch (e) {
      // se mancano mark per qualche motivo, evita crash
    }
  }

  private trackNextNavigationOnce() {
    // Cancella eventuali sub precedenti
    this.navSub?.unsubscribe();

    // Mark di start navigation (non appena Router emette NavigationStart)
    const startSub = this.router.events
      .pipe(filter((ev: RouterEvent): ev is NavigationStart => ev instanceof NavigationStart), take(1))
      .subscribe(() => {
        performance.mark('nav:start');
        startSub.unsubscribe();
      });

    // Mark di end navigation
    this.navSub = this.router.events
      .pipe(filter((ev: RouterEvent): ev is NavigationEnd => ev instanceof NavigationEnd), take(1))
      .subscribe(() => {
        performance.mark('nav:end');
        this.measureAndLog('nav:duration', 'nav:start', 'nav:end');
        this.navSub?.unsubscribe();
      });
  }

  login(tipo: 'admin' | 'client' = 'client'): void {
    if (!this.username || !this.password) {
      this.translate.get(['toast.loginError', 'toast.ERROR']).subscribe(translations => {
        this.toastr.error(translations['toast.loginError'], translations['toast.ERROR']);
      });
      return;
    }

    // Se c'era guestId, pulisci
    if (localStorage.getItem('guestId')) {
      localStorage.removeItem('guestId');
    }

    // MARK: click login
    performance.mark('login:click');
    this.isLoading = true;

    // Profiling solo login (se poi vorrai prefetch: avvia in parallelo qui)
    this.authService.login(this.username, this.password).subscribe({
      next: (res) => {
        // MARK: risposta login ok
        performance.mark('login:success');
        this.measureAndLog('login:roundtrip', 'login:click', 'login:success');

        this.isLoading = false;
        this.translate.get(['toast.loginSuccess', 'toast.SUCCESS']).subscribe(translations => {
          this.toastr.success(translations['toast.loginSuccess'], translations['toast.SUCCESS']);
        });

        const goAdmin = (tipo === 'admin' || res.ruolo === 'admin');

        // Traccia la navigation successiva una sola volta
        this.trackNextNavigationOnce();

        if (goAdmin) {
          this.router.navigate(['/admin']);
        } else {
          this.router.navigate(['/user-profile']);
        }
      },
      error: (err) => {
        // MARK: errore login
        performance.mark('login:error');
        this.measureAndLog('login:roundtrip:error', 'login:click', 'login:error');

        this.isLoading = false;
        this.translate.get(['toast.loginError', 'toast.ERROR']).subscribe(translations => {
          this.toastr.error(translations['toast.loginError'], translations['toast.ERROR']);
        });
      }
    });
  }

  loginOspite(): void {
    // MARK: click login ospite
    performance.mark('guest:click');

    const guestId = uuidv4();
    localStorage.setItem('guestId', guestId);

    this.translate.get(['toast.loginGuest', 'toast.INFO']).subscribe(translations => {
      this.toastr.info(translations['toast.loginGuest'], translations['toast.INFO']);
    });

    // Misura la navigation anche per ospite
    this.trackNextNavigationOnce();
    this.router.navigate(['/prenota-canzoni']);
  }
}
