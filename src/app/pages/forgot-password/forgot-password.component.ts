import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.css']
})
export class ForgotPasswordComponent {
  step = 1; // 1=username, 2=risposta, 3=nuova password
  username = '';
  domanda = '';
  risposta = '';
  nuovaPassword = '';
  errorMessage = '';
  successMessage = '';

  constructor(private http: HttpClient) {}

 cercaDomanda() {
  this.errorMessage = '';
  this.successMessage = '';
  if (!this.username) {
    this.errorMessage = "Inserisci lo username.";
    return;
  }
  this.http.get<{ domanda: string }>(`http://localhost:3000/api/auth/forgot-password/question/${this.username}`)
    .subscribe({
      next: (res) => {
        this.domanda = res.domanda;
        if (this.domanda) {
          this.step = 2;
        } else {
          this.errorMessage = "Domanda segreta assente.";
        }
      },
      error: () => {
        this.errorMessage = "Utente non trovato o errore server.";
      }
    });
}


verificaRisposta() {
  this.errorMessage = '';
  this.successMessage = '';

  if (!this.risposta) {
    this.errorMessage = "Inserisci la risposta.";
    return;
  }

  const payload = {
    username: this.username,
    risposta: this.risposta
  };

  this.http.post<{ valid: boolean }>('http://localhost:3000/api/auth/forgot-password/verify', payload)
    .subscribe({
      next: (res) => {
        if (res.valid) {
          this.step = 3;
        } else {
          this.errorMessage = "Risposta errata.";
        }
      },
      error: () => {
        this.errorMessage = "Errore durante la verifica della risposta.";
      }
    });
}


  aggiornaPassword() {
    this.errorMessage = '';
    this.successMessage = '';
    if (!this.nuovaPassword) {
      this.errorMessage = "Inserisci una nuova password.";
      return;
    }
    const payload = { username: this.username, nuovaPassword: this.nuovaPassword };
    this.http.post<{ message: string }>('http://localhost:3000/api/auth/forgot-password/reset', payload)
      .subscribe({
        next: (res) => {
          this.successMessage = res.message || "Password aggiornata con successo!";
          this.step = 1;
          this.username = '';
          this.domanda = '';
          this.risposta = '';
          this.nuovaPassword = '';
        },
        error: () => {
          this.errorMessage = "Errore aggiornamento password.";
        }
      });
  }
}
