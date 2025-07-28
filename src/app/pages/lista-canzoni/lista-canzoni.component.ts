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
    window.addEventListener('resize', () => this.checkViewport());

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
      next: () => {
        this.translate.get('toast.ORDER_SAVED').subscribe(msg => this.toastr.success(msg));
      },
      error: (err) => {
        console.error('Errore salvataggio ordine:', err);
        this.translate.get('toast.ORDER_SAVE_ERROR').subscribe(msg => this.toastr.error(msg));
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
        this.translate.get('toast.FETCH_SONGS_ERROR').subscribe(msg => this.toastr.error(msg));
        this.isLoading = false;
      }
    });
  }

  caricaTop20(): void {
    this.karaokeService.getTop20().subscribe({
      next: (data) => this.top20 = data,
      error: (err) => {
        console.error('Errore nel recupero della Top 20:', err);
        this.translate.get('toast.TOP20_ERROR').subscribe(msg => this.toastr.error(msg));
      }
    });
  }

  toggleCantata(index: number): void {
    if (!this.isAdmin) return;
    const canzone = this.canzoni[index];
    const nuovoStato = !canzone.cantata;
    this.karaokeService.aggiornaCantata(canzone.id, nuovoStato).subscribe({
      next: () => canzone.cantata = nuovoStato,
      error: (err) => {
        console.error('Errore aggiornamento cantata:', err);
        this.translate.get('toast.CANTATA_UPDATE_ERROR').subscribe(msg => this.toastr.error(msg));
      }
    });
  }

  resetLista(): void {
    if (!this.isAdmin) return;
    this.translate.get('toast.RESET_LIST_CONFIRM').subscribe(confirmMsg => {
      if (confirm(confirmMsg)) {
        this.karaokeService.resetLista('karaokeadmin').subscribe({
          next: () => this.translate.get('toast.LIST_RESET_SUCCESS').subscribe(msg => this.toastr.success(msg)),
          error: (err) => {
            console.error('Errore nel reset:', err);
            this.translate.get('toast.LIST_RESET_ERROR').subscribe(msg => this.toastr.error(msg));
          }
        });
      }
    });
  }

  partecipaAllaCanzone(canzone: Canzone): void {
    if (!this.authService.canPartecipate()) {
      this.translate.get('toast.LOGIN_REQUIRED').subscribe(msg => this.toastr.info(msg));
      return;
    }
    if (this.authService.isGuest() && canzone.user_id === null && canzone.guest_id !== this.guestId) {
      this.translate.get('toast.GUEST_FORBIDDEN').subscribe(msg => this.toastr.warning(msg));
      return;
    }
    if (!this.mostraInputPartecipazione[canzone.id]) {
      this.mostraInputPartecipazione[canzone.id] = true;
      return;
    }
    const nome = this.nomePartecipanteMap[canzone.id]?.trim();
    if (!nome || nome.length === 0) {
      this.translate.get('toast.INVALID_NAME').subscribe(msg => this.toastr.warning(msg));
      return;
    }
    if (canzone.partecipanti_add >= 3) {
      this.translate.get('toast.MAX_PARTICIPANTS').subscribe(msg => this.toastr.warning(msg));
      return;
    }
    if (!canzone.accetta_partecipanti) {
      this.translate.get('toast.NO_MORE_PARTICIPANTS').subscribe(msg => this.toastr.warning(msg));
      return;
    }
    this.karaokeService.aggiungiPartecipanteCompleto(canzone.id, nome).subscribe({
      next: () => {
        this.translate.get('toast.JOIN_SUCCESS', { name: canzone.nome }).subscribe(msg => this.toastr.success(msg));
        this.mostraInputPartecipazione[canzone.id] = false;
        this.nomePartecipanteMap[canzone.id] = '';
        this.caricaCanzoni();
      },
      error: (err) => {
        console.error('Errore nella partecipazione:', err);
        this.translate.get('toast.WISHLIST_ERROR').subscribe(msg => this.toastr.error(err.error?.message || msg));
      }
    });
  }

  partecipazioneCompleta(canzone: Canzone): boolean {
    return canzone.partecipanti_add >= 3;
  }

  eliminaCanzone(id: number, index: number): void {
    if (!this.canEditOrDelete(this.canzoni[index])) return;
    this.translate.get('toast.DELETE_CONFIRM').subscribe(translatedMessage => {
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        data: { message: translatedMessage }
      });
      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          this.karaokeService.deleteCanzone(id).subscribe({
            next: () => this.translate.get('toast.SUCCESS_LIST').subscribe(msg => this.toastr.success(msg)),
            error: (err) => {
              console.error('Errore eliminazione canzone:', err);
              this.translate.get('toast.ERROR_LIST').subscribe(msg => this.toastr.error(msg));
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
        this.translate.get('toast.SAVE_SUCCESS').subscribe(msg => this.toastr.success(msg));
      },
      error: (err) => {
        console.error('Errore durante il salvataggio:', err);
        this.translate.get('toast.SAVE_ERROR').subscribe(msg => this.toastr.error(msg));
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
      this.translate.get('toast.VOTE_LOGIN_REQUIRED').subscribe(msg => this.toastr.info(msg));
      return;
    }
    const canzone = this.canzoni[index];
    this.karaokeService.votaEmoji(canzone.id, this.userId!, emoji).subscribe({
      next: () => {
        canzone.votoEmoji = emoji;
        this.translate.get('toast.VOTE_SUCCESS', { emoji: emoji, song: canzone.nome }).subscribe(msg => this.toastr.success(msg));
      },
      error: (err) => {
        console.error('Errore nel salvataggio del voto emoji:', err);
        this.translate.get('toast.VOTE_ERROR').subscribe(msg => this.toastr.error(msg));
      }
    });
  }

  aggiungiAWishlist(canzone: Canzone): void {
    if (!this.userId) {
      this.translate.get('toast.WISHLIST_LOGIN').subscribe(msg => this.toastr.info(msg));
      return;
    }

    canzone.inWishlist = !canzone.inWishlist;

    this.karaokeService.aggiungiAWishlist({
      user_id: this.userId,
      artista: canzone.artista,
      canzone: canzone.canzone
    }).subscribe({
      next: () => {
        const chiave = canzone.inWishlist ? 'toast.WISHLIST_ADD' : 'toast.WISHLIST_REMOVE';
        this.translate.get(chiave).subscribe(msg => this.toastr.success(msg));
      },
      error: (err) => {
        console.error('Errore wishlist:', err);
        this.translate.get('toast.WISHLIST_ERROR').subscribe(msg => this.toastr.error(msg));
        canzone.inWishlist = !canzone.inWishlist;
      }
    });
  }
}
