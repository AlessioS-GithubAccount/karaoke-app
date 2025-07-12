import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { v4 as uuidv4 } from 'uuid';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  username: string = '';
  password: string = '';

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  login(tipo: 'admin' | 'client' = 'client') {
    if (!this.username || !this.password) {
      alert('Per favore compila username e password.');
      return;
    }

    // Rimuove eventuali guest ID precedenti
    if (localStorage.getItem('guestId')) {
      console.warn('Rimosso guestId residuo');
      localStorage.removeItem('guestId');
    }

    this.authService.login(this.username, this.password).subscribe({
      next: (res) => {
        // Reindirizza in base al ruolo
        if (tipo === 'admin' || res.ruolo === 'admin') {
          this.router.navigate(['/admin']);
        } else {
          this.router.navigate(['/user-profile']);
        }
      },
      error: (err) => {
        alert('Login fallito: ' + (err.error?.message || 'Controlla username e password'));
      }
    });
  }

  loginOspite() {
    const guestId = uuidv4();
    localStorage.setItem('guestId', guestId);
    this.router.navigate(['/prenota-canzoni']);
  }
}
