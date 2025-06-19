import { Component } from '@angular/core';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent {
  username: string = '';
  password: string = '';
  domandaRecupero: string = '';
  rispostaRecupero: string = '';

  register() {
    if (!this.username || !this.password || !this.domandaRecupero || !this.rispostaRecupero) {
      alert("Compila tutti i campi!");
      return;
    }

    // Qui potresti inviare i dati a un servizio backend
    console.log("✅ Registrazione avviata:", {
      username: this.username,
      password: this.password,
      domandaRecupero: this.domandaRecupero,
      rispostaRecupero: this.rispostaRecupero
    });

    alert("Registrazione completata!");
  }
}
