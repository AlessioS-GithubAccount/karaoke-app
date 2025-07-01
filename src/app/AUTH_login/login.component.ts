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

    //bugprevent si assicura che non rimangano guest_id residui 
    if (localStorage.getItem('guest_id')) {
      console.warn('Rimosso guest_id residuo');
      localStorage.removeItem('guest_id');
    }


    this.authService.login(this.username, this.password).subscribe({
      next: (res) => {
        // Navigazione basata sul ruolo
        if (tipo === 'admin' || res.ruolo === 'admin') {
          this.router.navigate(['/admin']);
        } else {
          // Reindirizza l'utente client alla pagina profilo
          this.router.navigate(['/user-profile']);
        }
      },
      error: (err) => {
        alert('Login fallito: ' + (err.error?.message || 'Controlla username e password'));
      }
    });
  }

  loginOspite() {
    // Puoi modificare anche questa rotta se vuoi
    this.router.navigate(['/prenota-canzoni']);
  }
}
