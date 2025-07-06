import { Component, OnInit } from '@angular/core';
import { KaraokeService } from '../../services/karaoke.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-archivio-musicale',
  templateUrl: './archivio-musicale.component.html',
  styleUrls: ['./archivio-musicale.component.scss']
})
export class ArchivioMusicaleComponent implements OnInit {
  archivio: any[] = [];
  isAdmin: boolean = false;
  isUser: boolean = false;
  isGuest: boolean = false;
  canUseActions: boolean = false;
  searchText: string = '';

  constructor(
    private karaokeService: KaraokeService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const ruolo = this.authService.getRole(); // es. 'admin', 'user', 'guest', o altro
    this.isAdmin = ruolo === 'admin';
    this.isUser = ruolo === 'user';
    this.isGuest = ruolo === 'guest';
    this.canUseActions = this.isAdmin || this.isUser || this.isGuest;

    this.karaokeService.getArchivioMusicale().subscribe({
      next: (data) => {
        this.archivio = data.filter((item, index, self) =>
          index === self.findIndex((t) =>
            t.canzone === item.canzone && t.artista === item.artista
          )
        );
      },
      error: (err) => console.error('Errore nel caricamento archivio:', err)
    });
  }

  aggiungiAWishlist(item: any): void {
    // Chiama il servizio o emetti evento per aggiungere a wishlist
    this.karaokeService.aggiungiAWishlist({ artista: item.artista, canzone: item.canzone }).subscribe({
      next: () => alert(`"${item.canzone}" di ${item.artista} aggiunta alla wishlist!`),
      error: (err) => console.error('Errore aggiungendo alla wishlist:', err)
    });
  }

get archivioFiltrato(): any[] {
  const search = this.searchText.trim().toLowerCase();
  if (!search) return this.archivio;

  return this.archivio.filter(c => {
    const parole = (c.artista + ' ' + c.canzone).toLowerCase().split(/\s+/);
    return parole.some(parola => parola.startsWith(search));
  });
}


eliminaCanzone(id: number): void {
  if (confirm('Sei sicuro di voler eliminare questa canzone dall\'archivio?')) {
    this.karaokeService.deleteFromArchivio(id).subscribe({
      next: () => {
        this.archivio = this.archivio.filter(c => c.id !== id);
      },
      error: (err) => console.error('Errore durante l\'eliminazione dall\'archivio:', err)
    });
  }
}



  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
