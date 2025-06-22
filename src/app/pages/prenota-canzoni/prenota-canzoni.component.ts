import { Component, OnInit } from '@angular/core';
import { NgForm } from '@angular/forms';
import { KaraokeService } from '../../services/karaoke.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { FormControl } from '@angular/forms';
import { debounceTime, startWith } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

@Component({
  selector: 'app-prenota-canzoni',
  templateUrl: './prenota-canzoni.component.html',
  styleUrls: ['./prenota-canzoni.component.scss']
})
export class PrenotaCanzoniComponent implements OnInit {
  formData = {
    nome: '',
    artista: '',
    canzone: '',
    tonalita: '',
    note: '',
    num_microfoni: 1,
    accetta_partecipanti: false,
    partecipanti_add: 1
  };

  archivio: any[] = [];
  artistiFiltrati: string[] = [];
  canzoniFiltrate: string[] = [];

  artistaControl = new FormControl('');
  canzoneControl = new FormControl('');

  microfoniInvalid = false;
  guestId: string = '';

  constructor(
    private karaokeService: KaraokeService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // 🧑‍🎤 Imposta guestId se non presente
    this.guestId = sessionStorage.getItem('guestId') || uuidv4();
    sessionStorage.setItem('guestId', this.guestId);

    this.karaokeService.getArchivioMusicale().subscribe((data) => {
      this.archivio = data;

      this.artistaControl.valueChanges
        .pipe(debounceTime(200), startWith(''))
        .subscribe(val => {
          const input = (val || '').toLowerCase();
          this.artistiFiltrati = input === ''
            ? []
            : [...new Set(this.archivio
                .map(e => e.artista)
                .filter(a => a.toLowerCase().startsWith(input)))];
        });

      this.canzoneControl.valueChanges
        .pipe(debounceTime(200), startWith(''))
        .subscribe(val => {
          const input = (val || '').toLowerCase();
          this.canzoniFiltrate = input === ''
            ? []
            : [...new Set(this.archivio
                .map(e => e.canzone)
                .filter(c => c.toLowerCase().startsWith(input)))];
        });
    });
  }

  validateMicrofoni() {
    const val = this.formData.num_microfoni;
    this.microfoniInvalid = (val < 1 || val > 3 || val === null || val === undefined);
  }

  onSubmit(form: NgForm) {
    this.validateMicrofoni();

    if (form.valid && !this.microfoniInvalid) {
      this.formData.artista = this.artistaControl.value || '';
      this.formData.canzone = this.canzoneControl.value || '';

      const userId = this.authService.getUserId(); // deve restituire null o id numerico
      const canzonePayload = {
        ...this.formData,
        user_id: userId || null,
        guest_id: userId ? null : this.guestId
      };

      this.karaokeService.addCanzone(canzonePayload).subscribe({
        next: (response) => {
          console.log('Dati salvati nel backend:', response);
          alert(`Ciao ${this.formData.nome}, la canzone è in coda! 🎤`);
          form.resetForm({
            num_microfoni: 1,
            accetta_partecipanti: false
          });
          this.microfoniInvalid = false;
          this.artistaControl.setValue('');
          this.canzoneControl.setValue('');
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

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
