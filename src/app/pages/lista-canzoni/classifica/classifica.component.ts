import { Component, OnInit } from '@angular/core';
import { KaraokeService } from '../../../services/karaoke.service';

@Component({
  selector: 'app-classifica',
  templateUrl: './classifica.component.html',
  styleUrls: ['./classifica.component.css']
})
export class ClassificaComponent implements OnInit {
  topCanzoni: any[] = [];
  topNum: number = 30; // Cambia qui per top20, top30, top50...

  constructor(private karaokeService: KaraokeService) {}

  ngOnInit(): void {
    this.caricaClassifica();
  }

caricaClassifica(): void {
  this.karaokeService.getTopN(this.topNum).subscribe({
    next: (data: any[]) => {
      // Log per debug
      console.log('Dati ricevuti:', data);

      // Mappa per eliminare duplicati (se serve)
      const uniqueMap = new Map<string, any>();
      data.forEach((item: any) => {
        const key = `${item.artista.toLowerCase()}|${item.canzone.toLowerCase()}`;
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, {
            ...item,
            artista: this.capitalizeWords(item.artista),
            canzone: this.capitalizeWords(item.canzone)
          });
        }
      });
      // Trasformo in array
      const uniqueArray = Array.from(uniqueMap.values());

      // Ordino per num_richieste discendente
      this.topCanzoni = uniqueArray.sort((a, b) => b.num_richieste - a.num_richieste);
    },
    error: (err: any) => {
      console.error('Errore nel caricamento della classifica:', err);
    }
  });
}




  private capitalizeWords(str: string): string {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) =>
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }
}
