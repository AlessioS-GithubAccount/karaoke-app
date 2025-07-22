import { Component, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { NgForm } from '@angular/forms';

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

  @ViewChild('registerForm') registerForm!: NgForm;

  constructor(private http: HttpClient, private router: Router) {}

  register() {
    // Controllo campi obbligatori
    if (!this.username || !this.password || !this.domandaRecupero || !this.rispostaRecupero) {
      alert("⚠️ Compila tutti i campi obbligatori!");
      return;
    }

    const payload = {
      username: this.username,
      password: this.password,
      domandaRecupero: this.domandaRecupero,
      rispostaRecupero: this.rispostaRecupero,
      keypass: this.keypass
    };

    this.http.post('http://localhost:3000/api/auth/register', payload).subscribe({
      next: (res: any) => {
        alert("✅ Registrazione completata con ruolo: " + (res.message || 'utente registrato'));

        // Reset form solo dopo successo
        this.registerForm.resetForm();

        // Naviga al login
        this.router.navigate(['/login']);
      },
      error: (err) => {
        console.error('Errore registrazione:', err);

        if (err.status === 409) {
          alert('❌ Username già in uso. Scegli un altro username.');
        } else if (err.error?.message) {
          alert(`❌ Errore: ${err.error.message}`);
        } else {
          alert('❌ Errore durante la registrazione. Riprova più tardi.');
        }
      }
    });
  }
}
