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
        this.top20 = data;
      },
      error: (err) => {
        console.error('Errore nel caricamento della classifica:', err);
      }
    });
  }
}
