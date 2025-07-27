import { Component, OnInit } from '@angular/core';
import { NgForm } from '@angular/forms';
import { KaraokeService } from '../../services/karaoke.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import { ToastrService } from 'ngx-toastr';

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

  microfoniInvalid = false;
  guestId: string | null = null;
  isLoggedIn = false;
  isAdmin = false;
  showAccessPrompt = false;

  constructor(
    private karaokeService: KaraokeService,
    private authService: AuthService,
    private router: Router,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    const isUser = this.authService.isUser();
    const isGuest = this.authService.isGuest();

    if (!isUser && !isGuest) {
      this.showAccessPrompt = true;
      return;
    }

    this.showAccessPrompt = false;
    this.isLoggedIn = isUser;
    this.isAdmin = this.authService.getRole() === 'admin';

    if (isGuest) {
      this.guestId = this.authService.getGuestId();
    } else {
      // crea un nuovo guestId se necessario
      this.guestId = uuidv4();
      localStorage.setItem('guestId', this.guestId);
    }

    this.loadArchivio();
  }

  loadArchivio(): void {
    this.karaokeService.getArchivioMusicale().subscribe((data) => {
      this.archivio = data;
    });
  }

  filterArtisti() {
    const input = (this.formData.artista || '').toLowerCase();
    this.artistiFiltrati = input === ''
      ? []
      : [...new Set(this.archivio
          .map(e => e.artista)
          .filter(a => a.toLowerCase().startsWith(input)))];
  }

  filterCanzoni() {
    const input = (this.formData.canzone || '').toLowerCase();
    this.canzoniFiltrate = input === ''
      ? []
      : [...new Set(this.archivio
          .map(e => e.canzone)
          .filter(c => c.toLowerCase().startsWith(input)))];
  }

  validateMicrofoni() {
    const val = this.formData.num_microfoni;
    this.microfoniInvalid = (val < 1 || val > 3 || val === null || val === undefined);
  }

  onSubmit(form: NgForm) {
    this.validateMicrofoni();

    if (form.valid && !this.microfoniInvalid) {
      const userId = this.authService.getUserId();
      const canzonePayload = {
        ...this.formData,
        user_id: userId || null,
        guest_id: userId ? null : this.guestId
      };

      this.karaokeService.addCanzone(canzonePayload).subscribe({
        next: (response) => {
          this.toastr.success('Buon divertimento!', `Ciao ${this.formData.nome}, la canzone è in coda! `);
          form.resetForm({
            num_microfoni: 1,
            accetta_partecipanti: false
          });
          this.microfoniInvalid = false;
          this.artistiFiltrati = [];
          this.canzoniFiltrate = [];

          const insertedId = response.canzoneId || response.insertId || response.id;
          this.router.navigate(['/lista-canzoni'], { queryParams: { scrollToId: insertedId } });
        },
        error: (err) => {
          console.error('Errore durante l\'invio dei dati', err);
          this.toastr.error('Errore durante il salvataggio. Riprova.', 'Errore');
        }
      });
    } else {
      this.toastr.warning('Per favore, inserisci un numero di microfoni valido da 1 a 3 e compila tutti i campi obbligatori.', 'Attenzione');
    }
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  enterAsGuest(): void {
    this.guestId = uuidv4();
    localStorage.setItem('guestId', this.guestId);
    this.showAccessPrompt = false;
    this.loadArchivio();
  }
}
