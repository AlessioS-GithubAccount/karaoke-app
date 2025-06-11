import { Component } from '@angular/core';
import { NgForm } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  formData = {
    nome: '',
    artista: '',
    canzone: '',
    tonalita: '',
    note: ''
  };

  constructor(private http: HttpClient) {}

  onSubmit(form: NgForm) {
    if (form.valid) {
      this.http.post('http://localhost:3000/api/canzoni', this.formData).subscribe({
        next: (response) => {
          console.log('Dati salvati nel backend:', response);
          alert(`Ciao ${this.formData.nome}, la canzone è in coda! 🎤`);
          form.resetForm();
        },
        error: (err) => {
          console.error('Errore durante l\'invio dei dati', err);
          alert('Errore durante il salvataggio. Riprova.');
        }
      });
    }
  }
}
