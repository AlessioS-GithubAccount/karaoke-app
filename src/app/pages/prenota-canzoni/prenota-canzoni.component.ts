import { Component, OnInit, OnDestroy } from '@angular/core';
import { NgForm } from '@angular/forms';
import { KaraokeService } from '../../services/karaoke.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { QueueSocketService } from '../../services/queue-socket.service';
import { Subscription, debounceTime, filter } from 'rxjs';

@Component({
  selector: 'app-prenota-canzoni',
  templateUrl: './prenota-canzoni.component.html',
  styleUrls: ['./prenota-canzoni.component.scss']
})
export class PrenotaCanzoniComponent implements OnInit, OnDestroy {
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

  // ✅ DOPPIONI
  isDuplicate = false;
  duplicateMsg = '';

  private queueCache: any[] = [];
  private subs = new Subscription();
  private dupTimer: any = null;

  constructor(
    private karaokeService: KaraokeService,
    private authService: AuthService,
    private router: Router,
    private toastr: ToastrService,
    private queueSocket: QueueSocketService
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

    // ✅ realtime queue (il connect è idempotente nel tuo service)
    this.queueSocket.connect();

    // Se sei guest, prova a recuperare l'identità guest già presente
    if (isGuest) {
      this.guestId = this.authService.getGuestId();

      if (!this.guestId) {
        this.authService.enterGuest().subscribe({
          next: () => {
            this.guestId = this.authService.getGuestId();
            this.showAccessPrompt = false;
            this.loadArchivio();
            this.loadQueueCache(true);
            this.installRealtimeQueueRefresh();
          },
          error: (err) => {
            console.error('Errore enterGuest() in ngOnInit:', err);
            this.showAccessPrompt = true;
          }
        });
        return;
      }
    } else {
      this.guestId = null;
    }

    this.loadArchivio();
    this.loadQueueCache(true);
    this.installRealtimeQueueRefresh();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (this.dupTimer) clearTimeout(this.dupTimer);
  }

  private installRealtimeQueueRefresh(): void {
    // ✅ ricarica cache quando cambia la queue (added/deleted/updated/reordered/reset)
    this.subs.add(
      this.queueSocket.onQueueChanged$().pipe(
        filter(evt => {
          const t = String(evt?.type || '');
          return t === 'added' || t === 'deleted' || t === 'updated' || t === 'reordered' || t === 'reset';
        }),
        debounceTime(200)
      ).subscribe(() => this.loadQueueCache(true))
    );
  }

  loadArchivio(): void {
    this.karaokeService.getArchivioMusicale().subscribe((data) => {
      this.archivio = data || [];
    });
  }

  private loadQueueCache(recheck: boolean): void {
    this.karaokeService.getCanzoni().subscribe({
      next: (rows) => {
        this.queueCache = rows || [];
        if (recheck) this.recomputeDuplicate();
      },
      error: (err) => {
        console.warn('Impossibile ricaricare cache queue:', err);
        // non blocco UI
      }
    });
  }

  filterArtisti() {
    const input = (this.formData.artista || '').toLowerCase();
    this.artistiFiltrati = input === ''
      ? []
      : [...new Set(
          this.archivio
            .map(e => e.artista)
            .filter(a => (a || '').toLowerCase().startsWith(input))
        )];

    this.scheduleDuplicateCheck();
  }

  filterCanzoni() {
    const input = (this.formData.canzone || '').toLowerCase();
    this.canzoniFiltrate = input === ''
      ? []
      : [...new Set(
          this.archivio
            .map(e => e.canzone)
            .filter(c => (c || '').toLowerCase().startsWith(input))
        )];

    this.scheduleDuplicateCheck();
  }

  validateMicrofoni() {
    const val = this.formData.num_microfoni;
    this.microfoniInvalid = (val < 1 || val > 3 || val === null || val === undefined);
  }

  // ✅ debounce leggero per non ricontrollare ad ogni singolo carattere
  private scheduleDuplicateCheck(): void {
    if (this.dupTimer) clearTimeout(this.dupTimer);
    this.dupTimer = setTimeout(() => this.recomputeDuplicate(), 150);
  }

  private normalizeForCompare(s: any): string {
    const str = String(s || '');
    return str
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // accenti
      .replace(/\bthe\b/gi, '')                          // "the" isolato
      .replace(/['’`"]/g, '')                            // apostrofi/virgolette
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private recomputeDuplicate(): void {
    const artista = this.normalizeForCompare(this.formData.artista);
    const canzone = this.normalizeForCompare(this.formData.canzone);

    if (!artista || !canzone) {
      this.isDuplicate = false;
      this.duplicateMsg = '';
      return;
    }

    const found = this.queueCache.some(r =>
      this.normalizeForCompare(r?.artista) === artista &&
      this.normalizeForCompare(r?.canzone) === canzone
    );

    this.isDuplicate = found;
    this.duplicateMsg = found
      ? 'Questa canzone è già presente in lista. Scegline un’altra.'
      : '';
  }

  onSubmit(form: NgForm) {
    this.validateMicrofoni();

    // ✅ check last-second
    this.recomputeDuplicate();
    if (this.isDuplicate) {
      this.toastr.warning(this.duplicateMsg, 'Attenzione');
      return;
    }

    if (form.valid && !this.microfoniInvalid) {
      const userId = this.authService.getUserId();
      const resolvedGuestId = this.authService.getGuestId() || this.guestId;

      if (!userId && !resolvedGuestId) {
        this.toastr.error('Sessione ospite non valida. Rientra come ospite e riprova.', 'Errore');
        this.showAccessPrompt = true;
        return;
      }

      const canzonePayload = {
        ...this.formData,
        user_id: userId || null,
        guest_id: userId ? null : resolvedGuestId
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
          this.isDuplicate = false;
          this.duplicateMsg = '';

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

          // ✅ backend duplicate
          if (err?.status === 409) {
            const msg = err?.error?.message || 'Questa canzone è già in lista.';
            this.toastr.warning(msg, 'Doppione');
            this.loadQueueCache(true);
            return;
          }

          this.toastr.error('Errore durante il salvataggio. Riprova.', 'Errore');
        }
      });
    } else {
      this.toastr.warning(
        'Per favore, inserisci un numero di microfoni valido da 1 a 3 e compila tutti i campi obbligatori.',
        'Attenzione'
      );
    }
  }

  logout(): void {
    if (this.authService.isLoggedIn()) {
      this.authService.logout();
      this.router.navigate(['/login']);
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  enterAsGuest(): void {
    this.authService.enterGuest().subscribe({
      next: () => {
        this.guestId = this.authService.getGuestId();
        this.showAccessPrompt = false;
        this.loadArchivio();
        this.loadQueueCache(true);
      },
      error: (err) => {
        console.error('Errore durante enterGuest():', err);
        this.toastr.error('Impossibile entrare come ospite. Riprova.', 'Errore');
      }
    });
  }
}
