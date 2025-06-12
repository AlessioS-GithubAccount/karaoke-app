import { Component } from '@angular/core';
import { NgForm } from '@angular/forms';
import { KaraokeService } from '../../services/karaoke.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent {
  formData = {
    nome: '',
    artista: '',
    canzone: '',
    tonalita: '',
    note: '',
    cantanti_add: 1,              // default 1 microfono
    accetta_partecipanti: false  // default no partecipanti
  };

  constructor(private karaokeService: KaraokeService) {}

  onSubmit(form: NgForm) {
    if (form.valid) {
      this.karaokeService.addCanzone(this.formData).subscribe({
        next: (response) => {
          console.log('Dati salvati nel backend:', response);
          alert(`Ciao ${this.formData.nome}, la canzone è in coda! 🎤`);
          form.resetForm({
            cantanti_add: 1,
            accetta_partecipanti: false
          });
        },
        error: (err) => {
          console.error('Errore durante l\'invio dei dati', err);
          alert('Errore durante il salvataggio. Riprova.');
        }
      });
    }
  }
}
