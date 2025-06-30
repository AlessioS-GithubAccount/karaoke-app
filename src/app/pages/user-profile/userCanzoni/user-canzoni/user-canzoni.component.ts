import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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

  constructor(private http: HttpClient, private auth: AuthService) {}

    ngOnInit(): void {
      this.auth.getUtenteLoggato().subscribe((user: any) => {
      if (user && user.id) {
        this.userId = user.id;
        this.loadEsibizioni(this.userId);
      }
    });
  }

  loadEsibizioni(id: number): void {
    this.http.get<any[]>(`http://localhost:3000/api/esibizioni/user/${id}`).subscribe({
      next: res => this.esibizioni = res,
      error: err => console.error('Errore caricamento esibizioni:', err)
    });
  }

  loadWishlist() {
    this.http.get('/api/wishlist').subscribe((res: any) => {
      this.wishlist = res;
    });
  }

eliminaCanzone(id: number) {
  const conferma = confirm('Sei sicuro di voler eliminare questa esibizione?');

  if (conferma) {
    this.http.delete(`http://localhost:3000/api/esibizioni/${id}`).subscribe({
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



  salvaWishlist(song: any) {
    this.http.post('/api/wishlist', song).subscribe(() => this.loadWishlist());
  }

  rimuoviWishlist(id: number) {
    this.http.delete(`/api/wishlist/${id}`).subscribe(() => this.loadWishlist());
  }

  aggiungiRiga() {
    this.wishlist.push({ canzone: '', artista: '', tonalita: '' });
  }

  formattaVoti(voti: any[]): string {
    return voti.map(v => `${v.emoji} (${v.count})`).join(', ');
  }
}
