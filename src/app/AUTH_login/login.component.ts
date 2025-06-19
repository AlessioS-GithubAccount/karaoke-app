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
  domandaRecupero: string = '';
  rispostaRecupero: string = '';

  constructor(private router: Router) {}

  login(tipo: 'admin' | 'client') {
    // Controllo campi richiesti
    if (!this.username || !this.password || !this.domandaRecupero || !this.rispostaRecupero) {
      alert('Per favore compila tutti i campi, inclusa la domanda di recupero e la risposta.');
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
