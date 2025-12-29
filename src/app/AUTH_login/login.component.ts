import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd, NavigationStart, Event as RouterEvent } from '@angular/router';
import { AuthService } from '../services/auth.service';
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

    // Se esistevano dati guest, puliscili (stai entrando come utente)
    if (localStorage.getItem('guestId')) {
      localStorage.removeItem('guestId');
    }
    if (localStorage.getItem('guest_token')) {
      localStorage.removeItem('guest_token');
    }

    performance.mark('login:click');
    this.isLoading = true;

    this.authService.login(this.username, this.password).subscribe({
      next: (res) => {
        performance.mark('login:success');
        this.measureAndLog('login:roundtrip', 'login:click', 'login:success');

        this.isLoading = false;
        this.translate.get(['toast.loginSuccess', 'toast.SUCCESS']).subscribe(translations => {
          this.toastr.success(translations['toast.loginSuccess'], translations['toast.SUCCESS']);
        });

        const goAdmin = (tipo === 'admin' || res.ruolo === 'admin');

        this.trackNextNavigationOnce();

        if (goAdmin) {
          this.router.navigate(['/admin']);
        } else {
          this.router.navigate(['/user-profile']);
        }
      },
      error: (err) => {
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
    performance.mark('guest:click');
    this.isLoading = true;

    // Se per qualche motivo ci sono credenziali user residue, puliscile (guest deve restare guest)
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('role');
      localStorage.removeItem('username');
    } catch {}

    this.authService.enterGuest().subscribe({
      next: () => {
        performance.mark('guest:success');
        this.measureAndLog('guest:roundtrip', 'guest:click', 'guest:success');

        this.isLoading = false;

        this.translate.get(['toast.loginGuest', 'toast.INFO']).subscribe(translations => {
          this.toastr.info(translations['toast.loginGuest'], translations['toast.INFO']);
        });

        this.trackNextNavigationOnce();
        this.router.navigate(['/prenota-canzoni']);
      },
      error: (err) => {
        performance.mark('guest:error');
        this.measureAndLog('guest:roundtrip:error', 'guest:click', 'guest:error');

        this.isLoading = false;

        console.error('Errore durante enterGuest() in loginOspite():', err);
        this.translate.get(['toast.ERROR']).subscribe(translations => {
          this.toastr.error('Impossibile entrare come ospite. Riprova.', translations['toast.ERROR']);
        });
      }
    });
  }
}
