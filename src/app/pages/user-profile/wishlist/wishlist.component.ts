import { Component, OnInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';
import { Router } from '@angular/router';
import { ViewEncapsulation } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import { TranslateService } from '@ngx-translate/core';

interface WishlistItem {
  id?: number;
  user_id?: number;
  canzone: string;
  artista: string;
  tonalita: string | null;
}

@Component({
  selector: 'app-wishlist',
  templateUrl: './wishlist.component.html',
  styleUrls: ['./wishlist.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class WishlistComponent implements OnInit {

  wishlist: WishlistItem[] = [];
  isLoading: boolean = false;

  private backendUrl = 'https://karaoke-app-6byu.onrender.com/api';  // aggiornata

  // responsive
  isMobile: boolean = false;

  // pagination
  pageSize: number = 8;
  currentPage: number = 1;
  totalPages: number = 0;

  @ViewChild('bottom') bottom!: ElementRef;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private router: Router,
    private toastr: ToastrService,
    private dialog: MatDialog,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.checkScreenSize();
    this.loadWishlist(1);
  }

  @HostListener('window:resize', ['$event'])
  onResize() {
    this.checkScreenSize();
  }

  private checkScreenSize(): void {
    this.isMobile = window.innerWidth <= 768;
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  // ===== PAGINAZIONE =====
  changePage(delta: number): void {
    const next = this.currentPage + delta;
    if (next >= 1 && next <= this.totalPages) {
      this.loadWishlist(next);
    }
  }

  // ===== CRUD =====
loadWishlist(page: number = 1): void {
  this.isLoading = true;

  const url = this.backendUrl + '/wishlist?page=' + page + '&pageSize=' + this.pageSize;

  this.http.get<any>(url, { headers: this.getAuthHeaders() }).subscribe({
    next: (res: any) => {
      // Caso A: backend paginato => { wishlist: [...], totalPages, currentPage }
      if (res && typeof res === 'object' && Array.isArray(res.wishlist)) {
        this.wishlist = res.wishlist;
        this.totalPages = res.totalPages ? res.totalPages : 1;
        this.currentPage = res.currentPage ? res.currentPage : page;
        this.isLoading = false;
        return;
      }

      // Caso B: backend vecchio => res è un array completo => pagino client-side
      if (Array.isArray(res)) {
        const totalItems = res.length;
        const totalPages = Math.ceil(totalItems / this.pageSize) || 1;
        let safePage = page;
        if (safePage > totalPages) safePage = totalPages;
        if (safePage < 1) safePage = 1;

        const start = (safePage - 1) * this.pageSize;
        const end = start + this.pageSize;

        this.wishlist = res.slice(start, end);
        this.totalPages = totalPages;
        this.currentPage = safePage;
        this.isLoading = false;
        return;
      }

      // Formato inatteso
      console.warn('Formato risposta inatteso per wishlist:', res);
      this.wishlist = [];
      this.totalPages = 0;
      this.currentPage = 1;
      this.isLoading = false;
    },
    error: (err: any) => {
      console.error('Errore caricamento wishlist:', err);
      this.isLoading = false;
    }
  });
}


  salvaWishlist(song: WishlistItem): void {
    // Se stai usando lo stesso endpoint per insert/update:
    this.isLoading = true;
    this.http.post(`${this.backendUrl}/wishlist`, song, {
      headers: this.getAuthHeaders()
    }).subscribe({
      next: () => {
        // ricarico la pagina corrente
        this.loadWishlist(this.currentPage);
        this.isLoading = false;
      },
      error: err => {
        console.error('Errore salvataggio wishlist:', err);
        this.isLoading = false;
      }
    });
  }

  rimuoviWishlist(id: number | undefined): void {
    if (!id) return;
    this.translate.get('toast.DELETE_CONFIRM').subscribe(translatedMessage => {
      this.dialog.open(ConfirmDialogComponent, {
        data: { message: translatedMessage },
        width: '400px'
      }).afterClosed().subscribe(result => {
        if (result) {
          this.isLoading = true;
          this.http.delete(`${this.backendUrl}/wishlist/${id}`, {
            headers: this.getAuthHeaders()
          }).subscribe({
            next: () => {
              this.translate.get('toast.WISHLIST_REMOVE').subscribe(msg => this.toastr.success(msg));
              // ricarico la pagina corrente (loadWishlist gestisce il caso pagina > totalPages)
              this.loadWishlist(this.currentPage);
              this.isLoading = false;
            },
            error: err => {
              console.error('Errore rimozione wishlist:', err);
              this.translate.get('toast.WISHLIST_ERROR').subscribe(msg => this.toastr.error(msg));
              this.isLoading = false;
            }
          });
        }
      });
    });
  }

  aggiungiRiga(): void {
    // aggiunge una riga vuota SOLO nella pagina corrente (pattern già usato nel tuo HTML)
    this.wishlist.push({ canzone: '', artista: '', tonalita: '' });
    setTimeout(() => this.scrollToBottom(), 100);
  }

  scrollToBottom(): void {
    if (this.bottom) {
      this.bottom.nativeElement.scrollIntoView({ behavior: 'smooth' });
    }
  }

  ritornaAlProfilo(): void {
    this.router.navigate(['/user-profile']);
  }

  get isWishlistEffettivamenteVuota(): boolean {
    return this.wishlist.length === 0 || this.wishlist.every(
      song =>
        (!song.canzone || song.canzone.trim() === '') &&
        (!song.artista || song.artista.trim() === '') &&
        (!song.tonalita || (song.tonalita as string)?.trim() === '')
    );
  }
}
