import { Component, OnInit } from '@angular/core';
import { NgForm } from '@angular/forms';
import { KaraokeService } from '../../services/karaoke.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
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

    // Se sei guest, prova a recuperare l'identità guest già presente
    if (isGuest) {
      this.guestId = this.authService.getGuestId();

      // Se per qualche motivo risulta guest ma non ho guestId, provo a rigenerarlo via backend
      if (!this.guestId) {
        this.authService.enterGuest().subscribe({
          next: () => {
            this.guestId = this.authService.getGuestId();
            this.loadArchivio();
          },
          error: (err) => {
            console.error('Errore enterGuest() in ngOnInit:', err);
            this.showAccessPrompt = true;
          }
        });
        return;
      }
    } else {
      // Se sei user/admin NON creare guestId
      this.guestId = null;
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

      // Per ora manteniamo user_id/guest_id perché il backend attuale li richiede.
      // In seguito li toglieremo e li dedurremo dal token lato backend.
      const canzonePayload = {
        ...this.formData,
        user_id: userId || null,
        guest_id: userId ? null : (this.authService.getGuestId() || this.guestId)
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

          const insertedId = response?.canzoneId ?? response?.insertId ?? response?.id ?? null;

          if (insertedId != null) {
            sessionStorage.setItem('scrollToSongId', String(insertedId));
          }

          this.router.navigate(['/lista-canzoni'], {
            queryParams: insertedId != null ? { scrollToId: insertedId } : {}
          });
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
    // Se per qualche motivo qui venisse richiamato da guest, non fare logout (e non distruggere identità guest)
    if (this.authService.isLoggedIn()) {
      this.authService.logout();
      this.router.navigate(['/login']);
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  enterAsGuest(): void {
    // Entra come guest tramite backend: l'identità non la genera più il client
    this.authService.enterGuest().subscribe({
      next: () => {
        this.guestId = this.authService.getGuestId();
        this.showAccessPrompt = false;
        this.loadArchivio();
      },
      error: (err) => {
        console.error('Errore durante enterGuest():', err);
        this.toastr.error('Impossibile entrare come ospite. Riprova.', 'Errore');
      }
    });
  }
}
