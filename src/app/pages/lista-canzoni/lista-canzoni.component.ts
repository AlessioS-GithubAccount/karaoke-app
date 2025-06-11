import { Component, OnInit } from '@angular/core';
import { KaraokeService } from '../../services/karaoke.service';

@Component({
  selector: 'app-lista-canzoni',
  templateUrl: './lista-canzoni.component.html',
  styleUrls: ['./lista-canzoni.component.css']
})
export class ListaCanzoniComponent implements OnInit {
  canzoni: any[] = [];

  constructor(private karaokeService: KaraokeService) {}

  ngOnInit(): void {
    this.caricaCanzoni();
  }

  caricaCanzoni(): void {
    this.karaokeService.getCanzoni().subscribe({
      next: (data) => {
        this.canzoni = data;
      },
      error: (err) => {
        console.error('Errore nel recupero delle canzoni:', err);
      }
    });
  }
}
