import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  username: string = '';
  password: string = '';

  constructor(private router: Router) {}

  login(tipo: 'admin' | 'client') {
    // Controllo campi richiesti senza domanda e risposta segreta
    if (!this.username || !this.password) {
      alert('Per favore compila username e password.');
      return;
    }

    // Qui potresti integrare il servizio di autenticazione
    if (tipo === 'admin') {
      // Login admin
      this.router.navigate(['/admin']);
    } else {
      // Login client
      this.router.navigate(['/home']);
    }
  }

  loginOspite() {
    this.router.navigate(['/home']);
  }
}
