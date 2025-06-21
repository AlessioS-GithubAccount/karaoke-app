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

  constructor(
    private karaokeService: KaraokeService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
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

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
