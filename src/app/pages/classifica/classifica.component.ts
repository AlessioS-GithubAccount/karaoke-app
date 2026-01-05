import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { KaraokeService } from '../../services/karaoke.service';
import { AuthService } from '../../services/auth.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { TranslateService } from '@ngx-translate/core';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Subscription, debounceTime, filter } from 'rxjs';
import { QueueSocketService } from '../../services/queue-socket.service';

type ClassificaRow = {
  id: number;
  artista: string;
  canzone: string;
  num_richieste: number;
};

@Component({
  selector: 'app-classifica',
  templateUrl: './classifica.component.html',
  styleUrls: ['./classifica.component.scss']
})
export class ClassificaComponent implements OnInit, OnDestroy {
  isLoading = false;
  topCanzoni: ClassificaRow[] = [];
  topNum = 30;

  isAdmin = false;
  isUser = false;
  isGuest = false;

  isMobileView = false;

  private subs = new Subscription();

  constructor(
    private karaokeService: KaraokeService,
    private authService: AuthService,
    private translate: TranslateService,
    private dialog: MatDialog,
    private toast: ToastrService,
    private queueSocket: QueueSocketService
  ) {}

  ngOnInit(): void {
     this.queueSocket.connect();
    const ruolo = this.authService.getRole();
    this.isAdmin = ruolo === 'admin';
    this.isUser = ruolo === 'user' || ruolo === 'client';
    this.isGuest = ruolo === 'guest';

    this.checkViewport();
    this.caricaClassifica();

    // ✅ REALTIME: ricarica classifica quando arriva queue:changed
    // Nel backend attuale emetti:
    // - added (nuova prenotazione => aggiorna num_richieste in classifica)
    // - classifica:deleted (admin elimina una riga)
    // + altri eventi che comunque possono richiedere refresh UI (non fa male)
    this.subs.add(
      this.queueSocket.onQueueChanged$().pipe(
        filter(evt => {
          const t = String(evt?.type || '');
          return (
            t === 'added' ||
            t === 'classifica:deleted' ||
            t === 'updated' ||
            t === 'deleted' ||
            t === 'reordered' ||
            t === 'cantata' ||
            t === 'reset'
          );
        }),
        debounceTime(150)
      ).subscribe(() => this.caricaClassifica())
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  @HostListener('window:resize', [])
  onResize() {
    this.checkViewport();
  }

  @HostListener('document:visibilitychange', [])
  onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      this.caricaClassifica();
    }
  }

  checkViewport() {
    this.isMobileView = window.innerWidth <= 768;
  }

  onManualRefresh() {
    this.caricaClassifica();
  }

  caricaClassifica(): void {
    this.isLoading = true;

    this.karaokeService.getTopN(this.topNum).subscribe({
      next: (data: any[]) => {
        const rows: ClassificaRow[] = (data || []).map((item: any) => ({
          id: Number(item.id),
          artista: this.capitalizeWords(String(item.artista || '')),
          canzone: this.capitalizeWords(String(item.canzone || '')),
          num_richieste: Number(item.num_richieste || 0),
        }));

        this.topCanzoni = rows;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Errore nel caricamento classifica live:', err);
        this.isLoading = false;
      }
    });
  }

  eliminaCanzone(id: number): void {
    if (!this.isAdmin) return;

    this.translate.get('toast.DELETE_CONFIRM').subscribe(confirmMsg => {
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        width: '350px',
        data: { message: confirmMsg }
      });

      dialogRef.afterClosed().subscribe(result => {
        if (!result) return;

        this.karaokeService.deleteFromClassifica(id).subscribe({
          next: () => {
            // ottimismo UI (poi arriva anche realtime)
            this.topCanzoni = this.topCanzoni.filter(c => c.id !== id);
            this.translate.get('toast.CONFIRM_DELETE').subscribe(msg => this.toast.success(msg));
          },
          error: (err) => {
            console.error('Errore durante eliminazione dalla classifica:', err);
            this.translate.get('toast.ERROR_LIST').subscribe(msg => this.toast.error(msg));
          }
        });
      });
    });
  }

  private capitalizeWords(str: string): string {
    const s = (str || '').trim();
    if (!s) return '';
    return s.replace(/\w\S*/g, (txt) =>
      txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase()
    );
  }
}
