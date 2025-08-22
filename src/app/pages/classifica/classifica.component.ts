import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { KaraokeService } from '../../services/karaoke.service';
import { AuthService } from '../../services/auth.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { TranslateService } from '@ngx-translate/core';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-classifica',
  templateUrl: './classifica.component.html',
  styleUrls: ['./classifica.component.scss']
})
export class ClassificaComponent implements OnInit, OnDestroy {
  isLoading = false;
  topCanzoni: any[] = [];
  topNum = 30;

  // ruoli
  isAdmin = false;
  isUser = false;
  isGuest = false;
  canUseActions = false;

  // snapshot è read-only
  showDelete = false;

  // responsive
  isMobileView = false;

  // metadati snapshot
  lastUpdated: string | null = null;   // created_at
  snapshotDate: string | null = null;  // snapshot_date

  // auto refresh
  autoRefreshSec = 60;
  private refreshTimer: any = null;

  constructor(
    private karaokeService: KaraokeService,
    private authService: AuthService,
    private translate: TranslateService,
    private dialog: MatDialog,
    private toast: ToastrService
  ) {}

  ngOnInit(): void {
    const ruolo = this.authService.getRole();
    this.isAdmin = ruolo === 'admin';
    this.isUser = ruolo === 'user' || ruolo === 'client';
    this.isGuest = ruolo === 'guest';
    this.canUseActions = this.isAdmin || this.isUser;

    // Snapshot = read-only
    this.showDelete = false;

    this.checkViewport();
    this.caricaClassifica();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
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

  private startAutoRefresh() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => this.caricaClassifica(), this.autoRefreshSec * 1000);
  }

  // Carica lo snapshot del giorno
  caricaClassifica(): void {
    this.isLoading = true;
    this.karaokeService.getSnapshotTop(this.topNum)
      .pipe(finalize(() => this.isLoading = false))
      .subscribe({
        next: (data: any[]) => {
          // già ordinati dal backend (position ASC)
          this.topCanzoni = (data || []).map((item: any) => ({
            ...item,
            artista: this.capitalizeWords(item.artista),
            canzone: this.capitalizeWords(item.canzone)
          }));

          if (this.topCanzoni.length) {
            this.snapshotDate = this.topCanzoni[0].snapshot_date ?? null;
            this.lastUpdated = this.topCanzoni[0].created_at ?? null;
          } else {
            this.snapshotDate = null;
            this.lastUpdated = null;
          }
        },
        error: (err) => {
          console.error('Errore nel caricamento dello snapshot:', err);
        }
      });
  }

  // Rimane per la vista "live" (qui non usata)
  eliminaCanzone(id: number): void {
    if (!this.isAdmin) return;

    this.translate.get('toast.DELETE_CONFIRM').subscribe(confirmMsg => {
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        width: '350px',
        data: { message: confirmMsg }
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          this.karaokeService.deleteFromClassifica(id).subscribe({
            next: () => {
              this.topCanzoni = this.topCanzoni.filter(c => c.id !== id);
              this.translate.get('toast.CONFIRM_DELETE').subscribe(msg => this.toast.success(msg));
            },
            error: (err) => {
              console.error('Errore durante eliminazione dalla classifica:', err);
              this.translate.get('toast.ERROR_LIST').subscribe(msg => this.toast.error(msg));
            }
          });
        }
      });
    });
  }

  // trackBy opzionale (aggiungilo negli *ngFor se vuoi)
  trackByRow = (_: number, c: any) =>
    `${c.position ?? ''}-${c.artista ?? ''}-${c.canzone ?? ''}`;

  private capitalizeWords(str: string): string {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) =>
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }
}
