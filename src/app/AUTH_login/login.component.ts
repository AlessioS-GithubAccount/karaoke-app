import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  username: string = '';
  password: string = '';

  constructor(private authService: AuthService, private router: Router) {}

  login(tipo: 'admin' | 'client' = 'client') {
    if (!this.username || !this.password) {
      alert('Per favore compila username e password.');
      return;
    }

    this.authService.login(this.username, this.password).subscribe({
      next: (res) => {
        localStorage.setItem('token', res.token);
        localStorage.setItem('ruolo', res.ruolo);

        // Usa il ruolo o il tipo per navigare
        if (tipo === 'admin' || res.ruolo === 'admin') {
          this.router.navigate(['/admin']);
        } else {
          this.router.navigate(['/prenota-canzoni']);
        }
      },
      error: (err) => {
        alert('Login fallito: ' + (err.error?.message || 'Controlla username e password'));
      }
    });
  }

  loginOspite() {
    this.router.navigate(['/prenota-canzoni']);
  }
}
