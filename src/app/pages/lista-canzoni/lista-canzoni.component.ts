import { Component, OnInit } from '@angular/core';
import { KaraokeService } from '../../services/karaoke.service';

@Component({
  selector: 'app-lista-canzoni',
  templateUrl: './lista-canzoni.component.html',
  styleUrls: ['./lista-canzoni.component.css']
})
export class ListaCanzoniComponent implements OnInit {
  canzoni: any[] = [];
  top20: any[] = [];
  cantate: boolean[] = [];
  isAdmin: boolean = true; // Simulazione admin

  constructor(private karaokeService: KaraokeService) {}

  ngOnInit(): void {
    this.caricaCanzoni();
    this.caricaTop20();
  }

  caricaCanzoni(): void {
    this.karaokeService.getCanzoni().subscribe({
      next: (data) => {
        this.canzoni = data;
        this.cantate = new Array(data.length).fill(false);
      },
      error: (err) => {
        console.error('Errore nel recupero delle canzoni:', err);
      }
    });
  }

  caricaTop20(): void {
    this.karaokeService.getTop20().subscribe({
      next: (data) => {
        this.top20 = data;
      },
      error: (err) => {
        console.error('Errore nel recupero della Top 20:', err);
      }
    });
  }

  toggleCantata(index: number): void {
    this.cantate[index] = !this.cantate[index];
  }

  eGiaCantata(index: number): boolean {
    return this.cantate[index];
  }

  get numeroCantate(): number {
    return this.cantate.filter(c => c).length;
  }

  resetLista(): void {
    if (confirm('Sei sicuro di voler resettare la lista giornaliera?')) {
      this.karaokeService.resetLista().subscribe({
        next: () => {
          alert('Lista giornaliera resettata ✅');
          this.caricaCanzoni();
        },
        error: (err) => {
          console.error('Errore durante il reset:', err);
          alert('Errore durante il reset ❌');
        }
      });
    }
  }

  partecipaAllaCanzone(canzone: any): void {
    if (canzone.partecipanti_add < 2 && canzone.accetta_partecipanti) {
      this.karaokeService.aggiungiPartecipante(canzone.id).subscribe({
        next: () => this.caricaCanzoni(),
        error: (err) => {
          console.error('Errore nella partecipazione:', err);
          alert('Errore durante la partecipazione ❌');
        }
      });
    }
  }

  partecipazioneCompleta(canzone: any): boolean {
    return canzone.partecipanti_add >= 2;
  }
}
