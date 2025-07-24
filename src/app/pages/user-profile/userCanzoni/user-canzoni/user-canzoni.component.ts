import { Component, OnInit, HostListener } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../../services/auth.service';
import { Router } from '@angular/router';

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

  private backendUrl = 'http://localhost:3000/api';

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkWindowSize();

    this.auth.getUtenteLoggato().subscribe(user => {
      if (user && user.id) {
        this.userId = user.id;
        this.loadEsibizioni(this.userId);
        this.loadWishlist();
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

  loadEsibizioni(id: number): void {
    this.http.get<any[]>(`${this.backendUrl}/esibizioni/user/${id}`, {
      headers: this.getAuthHeaders()
    }).subscribe({
      next: res => {
        this.esibizioni = res.map(e => ({
          esibizione_id: e.id,
          artista: e.artista,
          canzone: e.canzone,
          tonalita: e.tonalita,
          data_esibizione: e.data_esibizione,
          partecipante_2: e.partecipante_2,
          partecipante_3: e.partecipante_3,
          voti: Array.isArray(e.voti) ? e.voti : []
        }));
      },
      error: err => {
        console.error('Errore caricamento esibizioni:', err);
      }
    });
  }

  loadWishlist(): void {
    this.http.get<any[]>(`${this.backendUrl}/wishlist`, {
      headers: this.getAuthHeaders()
    }).subscribe({
      next: res => this.wishlist = res,
      error: err => console.error('Errore caricamento wishlist:', err)
    });
  }

  eliminaCanzone(id: number): void {
    if (confirm('Sei sicuro di voler eliminare questa esibizione?')) {
      this.http.delete(`${this.backendUrl}/esibizioni/${id}`, {
        headers: this.getAuthHeaders()
      }).subscribe({
        next: () => {
          alert('Esibizione eliminata con successo!');
          this.loadEsibizioni(this.userId);
        },
        error: err => {
          console.error('Errore durante l\'eliminazione:', err);
          alert('Errore durante l\'eliminazione dell\'esibizione.');
        }
      });
    }
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
    if (!confirm('Sei sicuro di voler eliminare questa canzone dalla wishlist?')) return;

    this.http.delete(`${this.backendUrl}/wishlist/${id}`, {
      headers: this.getAuthHeaders()
    }).subscribe({
      next: () => this.loadWishlist(),
      error: err => console.error('Errore rimozione wishlist:', err)
    });
  }

  aggiungiRiga(): void {
    this.wishlist.push({ canzone: '', artista: '', tonalita: '' });
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
    switch (emoji) {
      case '👍': return 'fa-thumbs-up';
      case '👎': return 'fa-thumbs-down';
      case '❤️': return 'fa-heart';
      case '🔥': return 'fa-fire';
      case '😊': return 'fa-smile';
      case '😢': return 'fa-face-sad-tear'; // FontAwesome 6 pro, modifica se necessario
      case '⭐': return 'fa-star';
      case '🎵': return 'fa-music';
      default:
        return 'fa-circle';
    }
  }
}
