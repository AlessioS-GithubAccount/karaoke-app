import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-wishlist',
  templateUrl: './wishlist.component.html',
  styleUrls: ['./wishlist.component.css']
})
export class WishlistComponent implements OnInit {
  wishlist: any[] = [];
  private backendUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient, private auth: AuthService, private router: Router) {}

  ngOnInit(): void {
    this.loadWishlist();
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
      next: res => this.wishlist = res,
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
  }

    ritornaAlProfilo() {
  this.router.navigate(['/user-profile']); // oppure l'URL corretto del tuo profilo
}
}
