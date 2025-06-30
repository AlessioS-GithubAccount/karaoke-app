import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../../services/auth.service';

@Component({
  selector: 'app-user-canzoni',
  templateUrl: './user-canzoni.component.html',
  styleUrls: ['./user-canzoni.component.css']
})
export class UserCanzoniComponent implements OnInit {
  esibizioni: any[] = [];
  wishlist: any[] = [];
  userId!: number;

  private backendUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient, private auth: AuthService) {}

  ngOnInit(): void {
    this.auth.getUtenteLoggato().subscribe(user => {
      if (user && user.id) {
        this.userId = user.id;
        this.loadEsibizioni(this.userId);
        this.loadWishlist();
      }
    });
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  loadEsibizioni(id: number): void {
    this.http.get<any[]>(`${this.backendUrl}/esibizioni/user/${id}`, { headers: this.getAuthHeaders() }).subscribe({
      next: res => this.esibizioni = res,
      error: err => console.error('Errore caricamento esibizioni:', err)
    });
  }

  loadWishlist(): void {
    this.http.get<any[]>(`${this.backendUrl}/wishlist`, { headers: this.getAuthHeaders() }).subscribe({
      next: res => this.wishlist = res,
      error: err => console.error('Errore caricamento wishlist:', err)
    });
  }

  eliminaCanzone(id: number): void {
    if (confirm('Sei sicuro di voler eliminare questa esibizione?')) {
      this.http.delete(`${this.backendUrl}/esibizioni/${id}`, { headers: this.getAuthHeaders() }).subscribe({
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
    this.http.post(`${this.backendUrl}/wishlist`, song, { headers: this.getAuthHeaders() }).subscribe({
      next: () => this.loadWishlist(),
      error: err => console.error('Errore salvataggio wishlist:', err)
    });
  }

rimuoviWishlist(id: number): void {
  const conferma = confirm('Sei sicuro di voler eliminare questa canzone dalla wishlist?');
  if (!conferma) return;

  const token = this.auth.getToken();
  this.http.delete(`${this.backendUrl}/wishlist/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  }).subscribe({
    next: () => this.loadWishlist(),
    error: err => console.error('Errore rimozione wishlist:', err)
  });
}


  aggiungiRiga(): void {
    this.wishlist.push({ canzone: '', artista: '', tonalita: '' });
  }

  formattaVoti(voti: any[]): string {
    if (!voti) return '';
    return voti.map(v => `${v.emoji} (${v.count})`).join(', ');
  }
}
