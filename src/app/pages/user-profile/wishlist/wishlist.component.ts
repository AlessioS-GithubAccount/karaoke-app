import { Component, OnInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';
import { Router } from '@angular/router';
import { ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-wishlist',
  templateUrl: './wishlist.component.html',
  styleUrls: ['./wishlist.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class WishlistComponent implements OnInit {

  wishlist: any[] = [];
  private backendUrl = 'http://localhost:3000/api';

  isMobile: boolean = false;  // <-- aggiunta

  @ViewChild('bottom') bottom!: ElementRef;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkScreenSize();   // Controlla subito la dimensione
    this.loadWishlist();
  }

  // Listener per aggiornare la variabile al resize
  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.checkScreenSize();
  }

  private checkScreenSize(): void {
    this.isMobile = window.innerWidth <= 768;  // breakpoint comune per mobile
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  loadWishlist(): void {
    this.http.get<any[]>(`${this.backendUrl}/wishlist`, {
      headers: this.getAuthHeaders()
    }).subscribe({
      next: res => {
        console.log('Wishlist caricata:', res);
        this.wishlist = res;
      },
      error: err => console.error('Errore caricamento wishlist:', err)
    });
  }

  salvaWishlist(song: any): void {
    this.http.post(`${this.backendUrl}/wishlist`, song, {
      headers: this.getAuthHeaders()
    }).subscribe({
      next: () => this.loadWishlist(),
      error: err => console.error('Errore salvataggio wishlist:', err)
    });
  }

  rimuoviWishlist(id: number): void {
    const conferma = confirm('Sei sicuro di voler eliminare questa canzone dalla wishlist?');
    if (!conferma) return;

    this.http.delete(`${this.backendUrl}/wishlist/${id}`, {
      headers: this.getAuthHeaders()
    }).subscribe({
      next: () => this.loadWishlist(),
      error: err => console.error('Errore rimozione wishlist:', err)
    });
  }

  aggiungiRiga(): void {
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
        (!song.tonalita || song.tonalita.trim() === '')
    );
  }
}
