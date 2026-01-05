import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
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
import { Subscription } from 'rxjs';
import { QueueSocketService, QueueChangedEvent } from '../../services/queue-socket.service';

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
  posizione?: number;

  /** Admin-only: se true la canzone resta "bloccata" (fuori dall'algoritmo) */
  priority_lock?: boolean;

  votoEmoji?: string;
  inWishlist?: boolean;
}

type SingerKey = string;

@Component({
  selector: 'app-lista-canzoni',
  templateUrl: './lista-canzoni.component.html',
  styleUrls: ['./lista-canzoni.component.css']
})
export class ListaCanzoniComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChildren('rigaCanzone') righeCanzoni!: QueryList<ElementRef>;

  canzoni: Canzone[] = [];
  private allCanzoni: Canzone[] = [];

  isAdmin = false;
  userId: number | null = null;
  guestId: string | null = null;
  puoPartecipare = false;

  nomePartecipanteMap: { [id: number]: string } = {};
  mostraInputPartecipazione: { [id: number]: boolean } = {};

  isLoading = true;
  isMobileView = false;
  isTabletView = false;

  emojisVoto = [
    { icon: 'fa-thumbs-up', label: '👍' },
    { icon: 'fa-face-meh', label: '😐' },
    { icon: 'fa-face-laugh-squint', label: '😂' },
    { icon: 'fa-heart', label: '❤' }
  ];

  editingIndex: number | null = null;
  editedCanzone: Canzone | null = null;
  scrollToId: number | null = null;

  private qpSub?: Subscription;
  private changesSub?: Subscription;
  private queueSub?: Subscription;

  private reloadTimer: any = null;
  private readonly RELOAD_DEBOUNCE_MS = 150;

  private fetchInFlight = false;
  private pendingReload = false;

  private scrollIntervalId: any = null;

  private readonly onResize = () => this.checkViewport();
  private readonly DEBUG = true;

  // =========================
  // AUTO-BALANCE (ALGORITMO)
  // =========================
  private readonly AUTO_BALANCE_ENABLED = true;
  private readonly MAX_GAP_SONGS = 8;             // massimo gap (slot) tra due canzoni dello stesso cantante
  private readonly AUTO_BALANCE_DEBOUNCE_MS = 250;

  private autoBalanceTimer: any = null;
  private autoBalanceInFlight = false;
  private lastSentOrderSig = '';
  private lastManualReorderAt = 0;                // cooldown dopo drag&drop manuale

  constructor(
    private karaokeService: KaraokeService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private dialog: MatDialog,
    private translate: TranslateService,
    private queueSocket: QueueSocketService
  ) {}

  ngOnInit(): void {
    this.isAdmin = this.authService.getRole() === 'admin';
    this.userId = this.authService.getUserId();
    this.guestId = this.authService.getGuestId();
    this.puoPartecipare = this.authService.canPartecipate();

    this.checkViewport();
    window.addEventListener('resize', this.onResize);

    // realtime queue: connetti (idempotente) + ascolta changed
    this.queueSocket.connect();
    this.queueSub = this.queueSocket.onQueueChanged$().subscribe((evt: QueueChangedEvent) => {
      if (this.DEBUG) console.log('[lista-canzoni] queue:changed =>', evt);

      // opzionale: filtra eventi inutili
      const t = String(evt?.type || '');
      // se vuoi, limita così:
      // if (!['added','deleted','cantata','updated','reset','priority:lock','reordered','manual'].includes(t)) return;

      this.scheduleReloadSongs();
    });

    this.qpSub = this.route.queryParams.subscribe(params => {
      const fromQuery = params['scrollToId'] ? +params['scrollToId'] : null;
      const fromSession = sessionStorage.getItem('scrollToSongId');
      this.scrollToId = fromQuery ?? (fromSession ? +fromSession : null);
      if (fromSession) sessionStorage.removeItem('scrollToSongId');
    });

    this.caricaCanzoni();
  }

  ngAfterViewInit(): void {
    this.changesSub = this.righeCanzoni.changes.subscribe(() => {
      if (this.scrollToId != null) this.scheduleScrollTo(this.scrollToId);
    });
  }

  ngOnDestroy(): void {
    this.qpSub?.unsubscribe();
    this.changesSub?.unsubscribe();
    this.queueSub?.unsubscribe();

    window.removeEventListener('resize', this.onResize);

    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }

    if (this.scrollIntervalId) {
      clearInterval(this.scrollIntervalId);
      this.scrollIntervalId = null;
    }

    if (this.autoBalanceTimer) {
      clearTimeout(this.autoBalanceTimer);
      this.autoBalanceTimer = null;
    }
  }

  private scheduleReloadSongs(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);

    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;

      if (this.fetchInFlight) {
        this.pendingReload = true;
        return;
      }

      this.caricaCanzoni();
    }, this.RELOAD_DEBOUNCE_MS);
  }

  checkViewport(): void {
    const w = window.innerWidth;
    this.isMobileView = w <= 480;
    this.isTabletView = w > 480 && w <= 768;
  }

  onDrop(event: CdkDragDrop<Canzone[]>): void {
    if (!this.isAdmin) return;

    this.lastManualReorderAt = Date.now();

    moveItemInArray(this.canzoni, event.previousIndex, event.currentIndex);
    // mantieni sync con sorgente
    this.allCanzoni = [...this.canzoni];
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

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  scrollToBottom(): void {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  private tryScrollTo(id: number): boolean {
    const el = document.getElementById('canzone-' + id);
    if (!el) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight');
    setTimeout(() => el.classList.remove('highlight'), 3000);
    return true;
  }

  private scheduleScrollTo(id: number): void {
    if (this.scrollIntervalId) clearInterval(this.scrollIntervalId);

    let tries = 0;
    const maxTries = 80;

    this.scrollIntervalId = setInterval(() => {
      tries++;
      const ok = this.tryScrollTo(id);
      if (ok || tries >= maxTries) {
        clearInterval(this.scrollIntervalId);
        this.scrollIntervalId = null;
        if (ok) this.scrollToId = null;
      }
    }, 50);
  }

  salvaOrdine(): void {
    const nuovaLista = this.canzoni.map((c, index) => ({ id: c.id, posizione: index + 1 }));
    this.karaokeService.riordinaCanzoni(nuovaLista).subscribe({
      next: () => this.translate.get('toast.ORDER_SAVED').subscribe(msg => this.toastr.success(msg)),
      error: (err) => {
        console.error('Errore salvataggio ordine:', err);
        this.translate.get('toast.ORDER_SAVE_ERROR').subscribe(msg => this.toastr.error(msg));
      }
    });
  }

  caricaCanzoni(): void {
    this.isLoading = true;
    this.fetchInFlight = true;

    this.karaokeService.getCanzoni().subscribe({
      next: (data: Canzone[]) => {
        const normalized = (data || []).map((c: any) => ({
          ...c,
          priority_lock: !!c.priority_lock
        }));

        this.allCanzoni = normalized;
        this.applyFilteringAndSorting();

        this.isLoading = false;
        this.fetchInFlight = false;

        if (this.scrollToId != null) this.scheduleScrollTo(this.scrollToId);

        // ✅ AUTO-BALANCE (solo admin)
        this.scheduleAutoBalance();

        if (this.pendingReload) {
          this.pendingReload = false;
          this.scheduleReloadSongs();
        }
      },
      error: (err) => {
        console.error('Errore nel recupero delle canzoni:', err);
        this.translate.get('toast.FETCH_SONGS_ERROR').subscribe(msg => this.toastr.error(msg));
        this.isLoading = false;
        this.fetchInFlight = false;
      }
    });
  }

  /**
   * Mantiene un ordinamento stabile (posizione -> id).
   */
  private applyFilteringAndSorting(): void {
    const list = [...(this.allCanzoni || [])];
    list.sort((a, b) => {
      const pa = (a.posizione ?? a.id ?? 0);
      const pb = (b.posizione ?? b.id ?? 0);
      return pa - pb;
    });
    this.canzoni = list;
  }

  // =========================
  // AUTO-BALANCE (ALGORITMO)
  // =========================

  private scheduleAutoBalance(): void {
    if (!this.AUTO_BALANCE_ENABLED) return;
    if (!this.isAdmin) return; // solo admin può salvare l'ordine in DB

    // cooldown: se admin ha appena fatto drag&drop manuale, non sovrascrivere subito
    if (Date.now() - this.lastManualReorderAt < 3000) return;

    if (this.autoBalanceTimer) clearTimeout(this.autoBalanceTimer);

    this.autoBalanceTimer = setTimeout(() => {
      this.autoBalanceTimer = null;
      this.autoBalanceNow();
    }, this.AUTO_BALANCE_DEBOUNCE_MS);
  }

  private autoBalanceNow(): void {
    if (!this.AUTO_BALANCE_ENABLED) return;
    if (!this.isAdmin) return;
    if (this.autoBalanceInFlight) return;

    const current = [...this.canzoni];
    if (current.length < 3) return;

    const balanced = this.buildBalancedOrder(current);

    const currSig = this.orderSignature(current);
    const newSig = this.orderSignature(balanced);

    if (newSig === currSig) return;
    if (newSig === this.lastSentOrderSig) return;

    // aggiorna UI subito (admin)
    this.canzoni = balanced.map((c, idx) => ({ ...c, posizione: idx + 1 }));
    this.allCanzoni = [...this.canzoni];

    const nuovaLista = this.canzoni.map((c, index) => ({ id: c.id, posizione: index + 1 }));

    this.autoBalanceInFlight = true;

    this.karaokeService.riordinaCanzoni(nuovaLista).subscribe({
      next: () => {
        this.lastSentOrderSig = newSig;
        // niente toast (altrimenti spam)
      },
      error: (err) => {
        console.error('[auto-balance] errore riordina:', err);
        // fallback: al prossimo reload ritenterà
      },
      complete: () => {
        this.autoBalanceInFlight = false;
      }
    });
  }

  private orderSignature(list: Canzone[]): string {
    // firma semplice e veloce dell’ordine corrente
    return (list || []).map(s => s.id).join(',');
    // se vuoi più robusto: includi anche priority_lock/cantata
  }

  private singerKeyOf(s: Canzone): SingerKey {
    if (s.user_id != null) return `u:${s.user_id}`;
    if (s.guest_id) return `g:${s.guest_id}`;
    return `a:${s.id}`; // fallback (non dovrebbe servire)
  }

  /**
   * Crea un nuovo ordine:
   * - mantiene fisse le canzoni con priority_lock=1
   * - mantiene fisse le canzoni cantata=1 (non vogliamo “rimescolare” lo storico durante la serata)
   * - riempie gli slot liberi distribuendo equamente i cantanti
   * - best-effort per rispettare gap massimo MAX_GAP_SONGS
   */
  private buildBalancedOrder(currentOrder: Canzone[]): Canzone[] {
    const n = currentOrder.length;
    if (n <= 2) return currentOrder;

    // slot fissi per indice
    const fixedByIndex = new Map<number, Canzone>();
    const movable: Canzone[] = [];

    for (let i = 0; i < n; i++) {
      const s = currentOrder[i];
      const fixed = !!s.priority_lock || !!s.cantata;
      if (fixed) fixedByIndex.set(i, s);
      else movable.push(s);
    }

    // raggruppa canzoni mobili per cantante (mantieni ordine di arrivo -> posizione)
    const groups = new Map<SingerKey, Canzone[]>();
    for (const s of movable) {
      const k = this.singerKeyOf(s);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(s);
    }

    // conteggio canzoni già cantate (per fairness)
    const sungCount = new Map<SingerKey, number>();
    for (const s of currentOrder) {
      if (s.cantata) {
        const k = this.singerKeyOf(s);
        sungCount.set(k, (sungCount.get(k) || 0) + 1);
      }
    }

    // prima occorrenza (tiebreak: chi ha prenotato prima)
    const firstSeenIndex = new Map<SingerKey, number>();
    for (let i = 0; i < currentOrder.length; i++) {
      const s = currentOrder[i];
      if (s.cantata) continue; // mi interessa l'ordine di chi è ancora "attivo" in coda
      const k = this.singerKeyOf(s);
      if (!firstSeenIndex.has(k)) firstSeenIndex.set(k, i);
    }

    // stato runtime
    const placedCount = new Map<SingerKey, number>();
    const lastPlacedIndex = new Map<SingerKey, number>();

    // risultato
    const result: Canzone[] = new Array(n);

    const activeSingers = () =>
      Array.from(groups.keys()).filter(k => (groups.get(k)?.length || 0) > 0);

    for (let idx = 0; idx < n; idx++) {
      const fixedSong = fixedByIndex.get(idx);
      if (fixedSong) {
        result[idx] = fixedSong;

        // IMPORTANT: se è priority_lock (quindi ancora da cantare), aggiorna lastPlacedIndex
        // così il gap considera anche questi slot fissi.
        if (!fixedSong.cantata) {
          const k = this.singerKeyOf(fixedSong);
          lastPlacedIndex.set(k, idx);
        }

        continue;
      }

      const singers = activeSingers();
      if (singers.length === 0) {
        // safety: non dovrebbe succedere
        break;
      }

      const chosen = this.pickNextSinger(
        singers,
        idx,
        lastPlacedIndex,
        sungCount,
        placedCount,
        firstSeenIndex
      );

      const q = groups.get(chosen)!;
      const song = q.shift()!;
      result[idx] = song;

      placedCount.set(chosen, (placedCount.get(chosen) || 0) + 1);
      lastPlacedIndex.set(chosen, idx);
    }

    // fill eventuali buchi (safety)
    const leftovers: Canzone[] = [];
    for (const [k, q] of groups.entries()) {
      leftovers.push(...q);
    }
    for (let i = 0; i < result.length; i++) {
      if (!result[i] && leftovers.length) result[i] = leftovers.shift()!;
    }

    return result.filter(Boolean);
  }

  private pickNextSinger(
    candidates: SingerKey[],
    idx: number,
    lastPlacedIndex: Map<SingerKey, number>,
    sungCount: Map<SingerKey, number>,
    placedCount: Map<SingerKey, number>,
    firstSeenIndex: Map<SingerKey, number>
  ): SingerKey {
    const gapOf = (k: SingerKey) => {
      const last = lastPlacedIndex.get(k);
      if (last == null) return 9999; // mai ancora piazzato: consideralo “in attesa”
      return Math.max(0, idx - last - 1);
    };

    // prima: chi sta per superare il gap massimo (best-effort)
    const urgent = candidates.filter(k => gapOf(k) >= this.MAX_GAP_SONGS);

    const pool = urgent.length ? urgent : candidates;

    // ordina per:
    // 1) meno canzoni già cantate (fairness serata)
    // 2) meno canzoni già piazzate dall’algoritmo (round-robin)
    // 3) chi ha prenotato prima (firstSeenIndex)
    // 4) chi aspetta da più slot (gap desc) -> solo come ultimo tiebreak
    pool.sort((a, b) => {
      const sa = sungCount.get(a) || 0;
      const sb = sungCount.get(b) || 0;
      if (sa !== sb) return sa - sb;

      const pa = placedCount.get(a) || 0;
      const pb = placedCount.get(b) || 0;
      if (pa !== pb) return pa - pb;

      const fa = firstSeenIndex.get(a) ?? 999999;
      const fb = firstSeenIndex.get(b) ?? 999999;
      if (fa !== fb) return fa - fb;

      const ga = gapOf(a);
      const gb = gapOf(b);
      return gb - ga; // più gap -> prima
    });

    return pool[0];
  }

  // =========================
  // AZIONI VARIE
  // =========================

  toggleCantata(index: number): void {
    if (!this.isAdmin) return;

    const canzone = this.canzoni[index];
    const nuovoStato = !canzone.cantata;

    this.karaokeService.aggiornaCantata(canzone.id, nuovoStato).subscribe({
      next: () => (canzone.cantata = nuovoStato),
      error: (err) => {
        console.error('Errore aggiornamento cantata:', err);
        this.translate.get('toast.CANTATA_UPDATE_ERROR').subscribe(msg => this.toastr.error(msg));
      }
    });
  }

  /**
   * Admin: toggle "priority lock".
   * Se attivo, la canzone viene esclusa dall'algoritmo e resta "bloccata".
   */
  togglePriorityLock(index: number, event?: Event): void {
    event?.stopPropagation();
    if (!this.isAdmin) return;

    const canzone = this.canzoni[index];
    if (!canzone) return;

    const prev = !!canzone.priority_lock;
    const next = !prev;

    // ottimismo UI
    canzone.priority_lock = next;

    this.karaokeService.setPriorityLock(canzone.id, next).subscribe({
      next: () => {
        // niente toast (evita spam)
      },
      error: (err) => {
        console.error('Errore aggiornamento priority_lock:', err);
        canzone.priority_lock = prev;
        this.toastr.error('Errore aggiornamento Priority');
      }
    });
  }

  resetLista(): void {
    if (!this.isAdmin) return;

    this.translate.get('toast.RESET_LIST_CONFIRM').subscribe(confirmMsg => {
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        data: { message: confirmMsg },
        width: '400px'
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          this.karaokeService.resetLista('karaokeadmin').subscribe({
            next: () => {
              this.translate.get('toast.LIST_RESET_SUCCESS').subscribe(msg => this.toastr.success(msg));
              this.caricaCanzoni();
            },
            error: (err) => {
              console.error('Errore nel reset:', err);
              this.translate.get('toast.LIST_RESET_ERROR').subscribe(msg => this.toastr.error(msg));
            }
          });
        }
      });
    });
  }

  partecipazioneCompleta(canzone: Canzone): boolean {
    return canzone.partecipanti_add >= 3;
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
    if (!nome) {
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

  eliminaCanzone(id: number, index: number): void {
    if (!this.canEditOrDelete(this.canzoni[index])) return;

    this.translate.get('toast.DELETE_CONFIRM').subscribe(translatedMessage => {
      const dialogRef = this.dialog.open(ConfirmDialogComponent, { data: { message: translatedMessage } });

      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          this.karaokeService.deleteCanzone(id).subscribe({
            next: () => {
              this.translate.get('toast.SUCCESS_LIST').subscribe(msg => this.toastr.success(msg));
              this.caricaCanzoni();
            },
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
        this.translate.get('toast.VOTE_SUCCESS', { emoji, song: canzone.nome }).subscribe(msg => this.toastr.success(msg));
      },
      error: (err) => {
        console.error('Errore voto emoji:', err);
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
