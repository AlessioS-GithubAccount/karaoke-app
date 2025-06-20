import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';

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
  keypass: string = '';  // campo PIN admin

  constructor(private http: HttpClient) {}

  register() {
    if (!this.username || !this.password || !this.domandaRecupero || !this.rispostaRecupero) {
      alert("Compila tutti i campi!");
      return;
    }

    const payload = {
      username: this.username,
      password: this.password,
      domandaRecupero: this.domandaRecupero,
      rispostaRecupero: this.rispostaRecupero,
      keypass: this.keypass  // invio il PIN segreto al backend
    };

    this.http.post('http://localhost:3000/api/auth/register', payload).subscribe({
      next: (res: any) => {
        alert("✅ Registrazione completata con ruolo: " + res.message);
      },
      error: (err) => {
        console.error('Errore registrazione:', err);
        alert('❌ Errore durante la registrazione');
      }
    });
  }
}
