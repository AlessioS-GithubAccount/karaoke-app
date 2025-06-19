import { Component, OnInit } from '@angular/core';
import { KaraokeService } from '../../services/karaoke.service';

@Component({
  selector: 'app-archivio-musicale',
  templateUrl: './archivio-musicale.component.html',
  styleUrls: ['./archivio-musicale.component.scss']
})
export class ArchivioMusicaleComponent implements OnInit {

  archivio: any[] = []; // ✅ questa è la variabile usata nel tuo HTML

  constructor(private karaokeService: KaraokeService) {}

  ngOnInit(): void {
    this.karaokeService.getTop20().subscribe({
      next: (data) => this.archivio = data,
      error: (err) => console.error('Errore nel caricamento archivio:', err)
    });
  }
}
