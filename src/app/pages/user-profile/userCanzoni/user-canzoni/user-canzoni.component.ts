import { Component, OnInit, HostListener } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../../services/auth.service';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../../../shared/confirm-dialog/confirm-dialog.component';
import { TranslateService } from '@ngx-translate/core';

interface VotoEmoji {
  emoji: string;
  count: number;
}

interface Esibizione {
  esibizione_id: number;
  artista: string;
  canzone: string;
  tonalita: string;
  data_esibizione: string;
  voti: VotoEmoji[];
  partecipante_2?: string;
  partecipante_3?: string;
}

@Component({
  selector: 'app-user-canzoni',
  templateUrl: './user-canzoni.component.html',
  styleUrls: ['./user-canzoni.component.css']
})
export class UserCanzoniComponent implements OnInit {
  esibizioni: Esibizione[] = [];
  wishlist: any[] = [];
  userId!: number;
  isMobile = false;
  totalPages: number = 0;


  private backendUrl = 'http://localhost:3000/api';

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private router: Router,
    private toastr: ToastrService,
    private dialog: MatDialog,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.checkWindowSize();

    this.auth.getUtenteLoggato().subscribe(user => {
      if (user && user.id) {
        this.userId = user.id;
        this.loadEsibizioni(this.userId, 1);
      }
    });
  }

  @HostListener('window:resize')
  onResize() {
    this.checkWindowSize();
  }

  private checkWindowSize() {
    this.isMobile = window.innerWidth <= 768; // breakpoint per mobile
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }
  

  loadEsibizioni(id: number, page: number = 1): void {
  const pageSize = this.pageSize;

  this.http.get<any>(`${this.backendUrl}/esibizioni/user/${id}?page=${page}&pageSize=${pageSize}`, {
    headers: this.getAuthHeaders()
  }).subscribe({
    next: res => {
      this.esibizioni = res.esibizioni.map((e: any) => ({
        esibizione_id: e.id,
        artista: e.artista,
        canzone: e.canzone,
        tonalita: e.tonalita,
        data_esibizione: e.data_esibizione,
        partecipante_2: e.partecipante_2,
        partecipante_3: e.partecipante_3,
        voti: Array.isArray(e.voti) ? e.voti : []
      }));
      
      this.totalPages = res.totalPages;
      this.currentPage = res.currentPage;
    },
    error: err => {
      console.error('Errore caricamento esibizioni:', err);
    }
  });
}


  eliminaCanzone(id: number): void {
    this.translate.get('toast.DELETE_CONFIRM').subscribe(translatedMessage => {
      this.dialog.open(ConfirmDialogComponent, {
        data: { message: translatedMessage },
        width: '400px'
      }).afterClosed().subscribe(result => {
        if (result) {
          this.http.delete(`${this.backendUrl}/esibizioni/${id}`, {
            headers: this.getAuthHeaders()
          }).subscribe({
            next: () => {
              this.translate.get('toast.CONFIRM_DELETE').subscribe(msg => this.toastr.success(msg));
              this.loadEsibizioni(this.userId);
            },
            error: err => {
              console.error('Errore durante l\'eliminazione:', err);
              this.translate.get('toast.ERROR_DELETE').subscribe(msg => this.toastr.error(msg));
            }
          });
        }
      });
    });
  }


  formattaVoti(voti: VotoEmoji[]): string {
    if (!voti || voti.length === 0) return '—';
    return voti.map(v => `${v.emoji} (${v.count})`).join(', ');
  }

  ritornaAlProfilo() {
    this.router.navigate(['/user-profile']); // o percorso corretto del profilo
  }

  // Mappa emoji testuali a classi FontAwesome per icone
  getFaIconClass(emoji: string): string {
  if (!emoji) return 'fa-circle';

  // Rimuove spazi e variation selector-16 (fe0f)
   const normalized = emoji
    .replace(/\s/g, '')       // rimuove spazi
    .replace(/\uFE0F/g, '')   // rimuove variation selector-16
    .trim(); 

    console.log('Emoji originale:', emoji);
  console.log('Emoji normalizzata:', normalized);

  switch (normalized) {
    case '👍':
      return 'fa-thumbs-up';

    case '😐':
      return 'fa-face-meh';

    case '😂':
      return 'fa-face-laugh-squint';

    case '❤':
    case '❤️':
      return 'fa-heart';

    default:
      return 'fa-circle';
  }
}


  //function di paginazione per lazy-loading
  pageSize = 8;
  currentPage = 1;

  get paginatedEsibizioni(): Esibizione[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.esibizioni.slice(start, start + this.pageSize);
  }


  changePage(delta: number): void {
  const nextPage = this.currentPage + delta;
  if (nextPage >= 1 && nextPage <= this.totalPages) {
    this.loadEsibizioni(this.userId, nextPage);
  }
}

}
