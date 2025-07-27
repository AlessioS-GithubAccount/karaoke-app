import {
  Component,
  OnInit,
  QueryList,
  ViewChildren,
  ElementRef
} from '@angular/core';
import { KaraokeService } from '../../services/karaoke.service';
import { AuthService } from '../../services/auth.service';
import { Router, ActivatedRoute } from '@angular/router';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { TranslateService } from '@ngx-translate/core';

interface Canzone {
  id: number;
  nome: string;
  artista: string;
  canzone: string;
  tonalita?: string;
  note?: string;
  cantata: boolean;
  partecipanti_add: number;
  accetta_partecipanti: boolean;
  user_id?: number | null;
  guest_id?: string | null;
  numero_richieste?: number;
  votoEmoji?: string;
  inWishlist?: boolean;
}

@Component({
  selector: 'app-lista-canzoni',
  templateUrl: './lista-canzoni.component.html',
  styleUrls: ['./lista-canzoni.component.css']
})
export class ListaCanzoniComponent implements OnInit {
  @ViewChildren('rigaCanzone') righeCanzoni!: QueryList<ElementRef>;

  canzoni: Canzone[] = [];
  top20: any[] = [];
  isAdmin = false;
  userId: number | null = null;
  guestId: string | null = null;
  puoPartecipare = false;
  nomePartecipanteMap: { [id: number]: string } = {};
  mostraInputPartecipazione: { [id: number]: boolean } = {};
  isLoading = true;
  isMobileView: boolean = false;
  isTabletView: boolean = false;

  emojisVoto = [
    { icon: 'fa-thumbs-up', label: '👍' },
    { icon: 'fa-face-meh', label: '😐' },
    { icon: 'fa-face-laugh-squint', label: '😂' },
    { icon: 'fa-heart', label: '❤' }
  ];

  editingIndex: number | null = null;
  editedCanzone: Canzone | null = null;
  scrollToId: number | null = null;

  constructor(
    private karaokeService: KaraokeService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private dialog: MatDialog,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.isAdmin = this.authService.getRole() === 'admin';
    this.userId = this.authService.getUserId();
    this.guestId = this.authService.getGuestId();
    this.puoPartecipare = this.authService.canPartecipate();

    this.checkViewport();
    window.addEventListener('resize', () => {
      this.checkViewport();
    });

    this.route.queryParams.subscribe(params => {
      this.scrollToId = params['scrollToId'] ? +params['scrollToId'] : null;
    });

    this.caricaCanzoni();
    this.caricaTop20();
  }

  checkViewport() {
    const w = window.innerWidth;
    this.isMobileView = w <= 480;
    this.isTabletView = w > 480 && w <= 768;
  }

  onDrop(event: CdkDragDrop<Canzone[]>): void {
    if (!this.isAdmin) return;
    moveItemInArray(this.canzoni, event.previousIndex, event.currentIndex);
    this.salvaOrdine();

    setTimeout(() => {
      this.righeCanzoni.forEach((riga: ElementRef) => {
        const el = riga.nativeElement as HTMLElement;
        el.classList.remove('drag-alone-fix');
        void el.offsetWidth;
        el.classList.add('drag-alone-fix');
      });
    }, 10);
  }

  salvaOrdine(): void {
    const nuovaLista = this.canzoni.map((c, index) => ({
      id: c.id,
      posizione: index + 1
    }));

    this.karaokeService.riordinaCanzoni(nuovaLista).subscribe({
      next: () => this.toastr.success('Ordine salvato con successo ✅'),
      error: (err) => {
        console.error('Errore salvataggio ordine:', err);
        this.toastr.error('Errore nel salvataggio del nuovo ordine');
      }
    });
  }

  caricaCanzoni(): void {
    this.isLoading = true;

    this.karaokeService.getCanzoni().subscribe({
      next: (data: Canzone[]) => {
        this.canzoni = data;

        setTimeout(() => {
          this.isLoading = false;

          if (this.scrollToId !== null) {
            const el = document.getElementById('canzone-' + this.scrollToId);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('highlight');
              setTimeout(() => el.classList.remove('highlight'), 3000);
            }
          }
        }, 400);
      },
      error: (err) => {
        console.error('Errore nel recupero delle canzoni:', err);
        this.isLoading = false;
        this.toastr.error('Errore nel recupero delle canzoni');
      }
    });
  }

  caricaTop20(): void {
    this.karaokeService.getTop20().subscribe({
      next: (data) => this.top20 = data,
      error: (err) => {
        console.error('Errore nel recupero della Top 20:', err);
        this.toastr.error('Errore nel recupero della Top 20');
      }
    });
  }

  toggleCantata(index: number): void {
    if (!this.isAdmin) return;
    const canzone = this.canzoni[index];
    const nuovoStato = !canzone.cantata;

    this.karaokeService.aggiornaCantata(canzone.id, nuovoStato).subscribe({
      next: () => {
        this.canzoni[index].cantata = nuovoStato;
      },
      error: (err) => {
        console.error('Errore aggiornamento cantata:', err);
        this.toastr.error('Errore durante l\'aggiornamento dello stato cantata');
      }
    });
  }

  numeroCantate(): number {
    return this.canzoni.filter(c => c.cantata).length;
  }

  resetLista(): void {
    if (!this.isAdmin) return;
    if (confirm('Sei sicuro di voler resettare la lista giornaliera?')) {
      this.karaokeService.resetLista('karaokeadmin').subscribe({
        next: () => {
          this.toastr.success('Lista resettata con successo');
          this.caricaCanzoni();
        },
        error: (error) => {
          console.error('Errore nel reset:', error);
          this.toastr.error('Errore durante il reset della lista');
        }
      });
    }
  }

  partecipaAllaCanzone(canzone: Canzone): void {
    if (!this.authService.canPartecipate()) {
      this.toastr.info('Devi essere loggato o registrato come ospite per partecipare!');
      return;
    }

    if (this.authService.isGuest() && canzone.user_id === null && canzone.guest_id !== this.guestId) {
      this.toastr.warning('Non puoi partecipare a questa canzone perché non sei il guest che l\'ha creata.');
      return;
    }

    if (!this.mostraInputPartecipazione[canzone.id]) {
      this.mostraInputPartecipazione[canzone.id] = true;
      return;
    }

    const nome = this.nomePartecipanteMap[canzone.id]?.trim();
    if (!nome || nome.length === 0) {
      this.toastr.warning('Nome non valido.');
      return;
    }

    if (canzone.partecipanti_add >= 3) {
      this.toastr.warning('Questa canzone ha già 3 partecipanti.');
      return;
    }

    if (!canzone.accetta_partecipanti) {
      this.toastr.warning('Questa canzone non accetta altri partecipanti.');
      return;
    }

    this.karaokeService.aggiungiPartecipanteCompleto(canzone.id, nome).subscribe({
      next: () => {
        this.toastr.success(`Partecipazione registrata con successo! Canterai con ${canzone.nome}`);
        this.mostraInputPartecipazione[canzone.id] = false;
        this.nomePartecipanteMap[canzone.id] = '';
        this.caricaCanzoni();
      },
      error: (err) => {
        console.error('Errore nella partecipazione:', err);
        this.toastr.error(err.error?.message || 'Errore durante la partecipazione ❌');
      }
    });
  }

  partecipazioneCompleta(canzone: Canzone): boolean {
    return canzone.partecipanti_add >= 3;
  }

  eliminaCanzone(id: number, index: number): void {
  if (!this.canEditOrDelete(this.canzoni[index])) return;

  this.translate.get('toast.confermaEliminazione').subscribe(translatedMessage => {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        message: translatedMessage
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.karaokeService.deleteCanzone(id).subscribe({
          next: () => {
            this.toastr.success(this.translate.instant('toast.SUCCESS')); // opzionale traduzione
            this.canzoni.splice(index, 1);
          },
          error: (err) => {
            console.error('Errore eliminazione canzone:', err);
            this.toastr.error(this.translate.instant('toast.ERROR')); // opzionale traduzione
          }
        });
      }
    });
  });
}


  modifica(index: number): void {
    if (!this.canEditOrDelete(this.canzoni[index])) return;
    this.editingIndex = index;
    this.editedCanzone = { ...this.canzoni[index] };
  }

  annullaModifica(): void {
    this.editingIndex = null;
    this.editedCanzone = null;
  }

  salvaModifica(index: number): void {
    if (!this.canEditOrDelete(this.canzoni[index])) return;
    if (!this.editedCanzone) return;

    this.karaokeService.aggiornaCanzone(this.editedCanzone.id, this.editedCanzone).subscribe({
      next: () => {
        this.canzoni[index] = { ...this.editedCanzone! };
        this.editingIndex = null;
        this.editedCanzone = null;
        this.toastr.success('Modifica salvata con successo');
      },
      error: (err) => {
        console.error('Errore durante il salvataggio:', err);
        this.toastr.error('Errore durante il salvataggio della canzone');
      }
    });
  }

  canEditOrDelete(canzone: Canzone): boolean {
    return this.isAdmin || (this.userId !== null && canzone.user_id === this.userId);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  votaCanzone(index: number, emoji: string): void {
    if (!this.userId) {
      this.toastr.info('Devi essere loggato per votare!');
      return;
    }

    const canzone = this.canzoni[index];
    this.karaokeService.votaEmoji(canzone.id, this.userId!, emoji).subscribe({
      next: () => {
        canzone.votoEmoji = emoji;
        this.toastr.success(`Hai votato ${emoji} per "${canzone.nome}"`);
      },
      error: (err) => {
        console.error('Errore nel salvataggio del voto emoji:', err);
        this.toastr.error('Errore nel salvataggio del voto emoji');
      }
    });
  }

  aggiungiAWishlist(canzone: Canzone): void {
    if (!this.userId) {
      this.toastr.info('Devi essere loggato per aggiungere la canzone in wishlist.');
      return;
    }

    canzone.inWishlist = !canzone.inWishlist;

    this.karaokeService.aggiungiAWishlist({
      user_id: this.userId,
      artista: canzone.artista,
      canzone: canzone.canzone
    }).subscribe({
      next: () =>
        this.toastr.success(
          canzone.inWishlist
            ? 'Canzone aggiunta alla wishlist! ✅'
            : 'Canzone rimossa dalla wishlist! ❌'
        ),
      error: (err) => {
        console.error('Errore wishlist:', err);
        this.toastr.error('Errore durante l\'aggiunta alla wishlist ❌');
        canzone.inWishlist = !canzone.inWishlist;
      }
    });
  }
}
