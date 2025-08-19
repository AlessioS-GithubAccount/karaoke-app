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

  // responsive
  isMobileView: boolean = false;

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

  caricaClassifica(): void {
  this.isLoading = true;

      // Primo tentativo: carica snapshot
      this.karaokeService.getSnapshotTopN(this.topNum).subscribe({
      next: (data: any[]) => {
        if (data.length > 0) {
          this.processaDatiClassifica(data);
        } else {
          // Se snapshot vuoto, fallback alla classifica live
          console.log('Snapshot vuoto, carico classifica live...');
          this.karaokeService.getTopN(this.topNum).subscribe({
            next: (liveData: any[]) => this.processaDatiClassifica(liveData),
            error: (err) => {
              console.error('Errore caricamento classifica live:', err);
              this.isLoading = false;
            }
          });
        }
      },
      error: (err) => {
        console.error('Errore nel caricamento snapshot:', err);
        // fallback: classifica live
        this.karaokeService.getTopN(this.topNum).subscribe({
          next: (liveData: any[]) => this.processaDatiClassifica(liveData),
          error: (err) => {
            console.error('Errore caricamento classifica live:', err);
            this.isLoading = false;
          }
        });
      }
    });
  }

  // Metodo helper per processare e ordinare i dati
  private processaDatiClassifica(data: any[]): void {
    const uniqueMap = new Map<string, any>();
    data.forEach((item: any) => {
      const key = `${item.artista.toLowerCase()}|${item.canzone.toLowerCase()}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          ...item,
          artista: this.capitalizeWords(item.artista),
          canzone: this.capitalizeWords(item.canzone)
        });
      }
    });

    this.topCanzoni = Array.from(uniqueMap.values())
      .sort((a, b) => b.num_richieste - a.num_richieste);

    this.isLoading = false;
  }


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
