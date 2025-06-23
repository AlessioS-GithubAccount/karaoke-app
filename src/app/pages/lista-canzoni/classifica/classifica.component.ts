import { Component, OnInit } from '@angular/core';
import { KaraokeService } from '../../../services/karaoke.service';

@Component({
  selector: 'app-classifica',
  templateUrl: './classifica.component.html',
  styleUrls: ['./classifica.component.css']
})
export class ClassificaComponent implements OnInit {
  top20: any[] = [];

  constructor(private karaokeService: KaraokeService) {}

  ngOnInit(): void {
    this.caricaTop20();
  }

  caricaTop20(): void {
    this.karaokeService.getTop20().subscribe({
      next: (data) => {
        // Rimuovo duplicati basati su "artista" + "canzone"
        const uniqueMap = new Map<string, any>();
        data.forEach(item => {
          const key = `${item.artista.toLowerCase()}|${item.canzone.toLowerCase()}`;
          if (!uniqueMap.has(key)) {
            // Capitalizzo artista e canzone con prima lettera maiuscola e resto minuscolo
            uniqueMap.set(key, {
              ...item,
              artista: this.capitalizeWords(item.artista),
              canzone: this.capitalizeWords(item.canzone)
            });
          }
        });
        this.top20 = Array.from(uniqueMap.values());
      },
      error: (err) => {
        console.error('Errore nel caricamento della classifica:', err);
      }
    });
  }

  // Funzione helper per capitalizzare ogni parola (prima lettera maiuscola)
  private capitalizeWords(str: string): string {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) =>
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }
}
