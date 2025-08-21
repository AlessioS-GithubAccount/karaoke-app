import { Component, OnInit, HostListener } from '@angular/core';
import { KaraokeService } from '../../services/karaoke.service';
import { AuthService } from '../../services/auth.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { TranslateService } from '@ngx-translate/core';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-classifica',
  templateUrl: './classifica.component.html',
  styleUrls: ['./classifica.component.scss']
})
export class ClassificaComponent implements OnInit {
  isLoading: boolean = false;
  topCanzoni: any[] = [];
  topNum: number = 30;

  // ruoli
  isAdmin: boolean = false;
  isUser: boolean = false;
  isGuest: boolean = false;
  canUseActions: boolean = false;

  // snapshot è read-only: non mostriamo delete
  showDelete: boolean = false;

  // responsive
  isMobileView: boolean = false;

  // metadati snapshot
  lastUpdated: string | null = null;    // created_at
  snapshotDate: string | null = null;   // snapshot_date

  constructor(
    private karaokeService: KaraokeService,
    private authService: AuthService,
    private translate: TranslateService,
    private dialog: MatDialog,
    private toast: ToastrService
  ) {}

  ngOnInit(): void {
    const ruolo = this.authService.getRole();
    console.log('Ruolo utente:', ruolo);

    this.isAdmin = ruolo === 'admin';
    this.isUser = ruolo === 'user' || ruolo === 'client';
    this.isGuest = ruolo === 'guest';
    this.canUseActions = this.isAdmin || this.isUser;

    // Snapshot = read-only
    this.showDelete = false;

    this.checkViewport();
    this.caricaClassifica();
  }

  @HostListener('window:resize', [])
  onResize() {
    this.checkViewport();
  }

  checkViewport() {
    this.isMobileView = window.innerWidth <= 768;
  }

  // Carica lo snapshot del giorno
  caricaClassifica(): void {
    this.isLoading = true;

    this.karaokeService.getSnapshotTop(this.topNum).subscribe({
      next: (data: any[]) => {
        console.log('Snapshot ricevuto:', data);

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

        this.isLoading = false;
      },
      error: (err) => {
        console.error('Errore nel caricamento dello snapshot:', err);
        this.isLoading = false;
      }
    });
  }

  // Rimane per eventuale vista "live"; non usata nello snapshot (showDelete=false)
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

  private capitalizeWords(str: string): string {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) =>
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }
}
