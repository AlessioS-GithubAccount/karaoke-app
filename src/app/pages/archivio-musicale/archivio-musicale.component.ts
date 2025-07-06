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
  searchText: string = ''

  constructor(
    private karaokeService: KaraokeService,
    private authService: AuthService,
    private router: Router
  ) {}

ngOnInit(): void {
  this.isAdmin = this.authService.getRole() === 'admin';

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

get archivioFiltrato(): any[] {
  const search = this.searchText.trim().toLowerCase();
  if (!search) return this.archivio;

  return this.archivio.filter(c => {
    const parole = (c.artista + ' ' + c.canzone).toLowerCase().split(/\s+/);
    return parole.some(parola => parola.startsWith(search));
  });
}


eliminaCanzone(id: number): void {
  if (confirm('Sei sicuro di voler eliminare questa canzone?')) {
    this.karaokeService.deleteCanzone(id).subscribe({
      next: () => {
        this.archivio = this.archivio.filter(c => c.id !== id);
      },
      error: (err) => console.error('Errore durante l\'eliminazione:', err)
    });
  }
}


  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
