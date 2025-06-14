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
    num_microfoni: 1,              // default 1 microfono
    accetta_partecipanti: false,   // default no partecipanti
    partecipanti_add: 1
  };

  microfoniInvalid = false;

  constructor(private karaokeService: KaraokeService) {}

  validateMicrofoni() {
    const val = this.formData.num_microfoni;
    this.microfoniInvalid = (val < 1 || val > 3 || val === null || val === undefined);
  }

  onSubmit(form: NgForm) {
    this.validateMicrofoni();

    if (form.valid && !this.microfoniInvalid) {
      this.karaokeService.addCanzone(this.formData).subscribe({
        next: (response) => {
          console.log('Dati salvati nel backend:', response);
          alert(`Ciao ${this.formData.nome}, la canzone è in coda! 🎤`);
          form.resetForm({
            num_microfoni: 1,
            accetta_partecipanti: false
          });
          this.microfoniInvalid = false;
        },
        error: (err) => {
          console.error('Errore durante l\'invio dei dati', err);
          alert('Errore durante il salvataggio. Riprova.');
        }
      });
    } else {
      alert('Per favore, inserisci un numero di microfoni valido da 1 a 3.');
    }
  }
}
