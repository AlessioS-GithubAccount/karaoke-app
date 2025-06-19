import { Component, OnInit } from '@angular/core';
import { KaraokeService } from '../../services/karaoke.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-lista-canzoni',
  templateUrl: './lista-canzoni.component.html',
  styleUrls: ['./lista-canzoni.component.css']
})
export class ListaCanzoniComponent implements OnInit {
  canzoni: any[] = [];
  top20: any[] = [];
  isAdmin: boolean = true; // Simulazione admin

  constructor(
    private karaokeService: KaraokeService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.caricaCanzoni();
    this.caricaTop20();
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

  caricaTop20(): void {
    this.karaokeService.getTop20().subscribe({
      next: (data) => this.top20 = data,
      error: (err) => console.error('Errore nel recupero della Top 20:', err)
    });
  }

  toggleCantata(index: number): void {
    const canzone = this.canzoni[index];
    const nuovoStato = !canzone.cantata;

    this.karaokeService.aggiornaCantata(canzone.id, nuovoStato).subscribe({
      next: () => {
        this.canzoni[index].cantata = nuovoStato;
      },
      error: (err) => {
        console.error('Errore aggiornamento cantata:', err);
        alert('Errore durante l\'aggiornamento dello stato cantata');
      }
    });
  }

  get numeroCantate(): number {
    return this.canzoni.filter(c => c.cantata).length;
  }

  resetLista(): void {
    if (confirm('Sei sicuro di voler resettare la lista giornaliera?')) {
      const pwd = prompt('Inserisci la password di amministratore');
      if (pwd) {
        this.karaokeService.resetLista(pwd).subscribe({
          next: () => {
            alert('Lista giornaliera resettata ✅');
            this.caricaCanzoni();
          },
          error: (err) => {
            console.error('Errore durante il reset:', err);
            alert('Errore durante il reset ❌');
          }
        });
      } else {
        alert('Password non inserita, operazione annullata.');
      }
    }
  }

  partecipaAllaCanzone(canzone: any): void {
    if (canzone.partecipanti_add < 3 && canzone.accetta_partecipanti) {
      this.karaokeService.aggiungiPartecipante(canzone.id).subscribe({
        next: (response) => {
          canzone.partecipanti_add = response.partecipanti_add;
          this.karaokeService.getNomePartecipante(canzone.id).subscribe({
            next: (data) => {
              alert(`Canterai insieme a ${data.nome}`);
            },
            error: (err) => {
              console.error('Errore recupero nome partecipante:', err);
              alert('Partecipazione avvenuta, ma non è stato possibile recuperare il nome.');
            }
          });
        },
        error: (err) => {
          console.error('Errore nella partecipazione:', err);
          alert(err.error?.message || 'Errore durante la partecipazione ❌');
        }
      });
    } else {
      alert('Non è possibile partecipare a questa canzone.');
    }
  }

  partecipazioneCompleta(canzone: any): boolean {
    return canzone.partecipanti_add >= 3;
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
