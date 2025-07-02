import { Component, OnInit } from '@angular/core';
import { KaraokeService } from '../../services/karaoke.service';
import { AuthService } from '../../services/auth.service';
import { Router, ActivatedRoute } from '@angular/router';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

interface Canzone {
  id: number;
  nome: string;
  artista: string;
  canzone: string;
  tonalita?: string;
  note?: string;
  cantata: boolean;
  partecipanti_add: number;
  accetta_partecipanti: boolean;
  user_id?: number;
  guest_id?: number | null;
  numero_richieste?: number;
  votoEmoji?: string;
}

@Component({
  selector: 'app-lista-canzoni',
  templateUrl: './lista-canzoni.component.html',
  styleUrls: ['./lista-canzoni.component.css']
})
export class ListaCanzoniComponent implements OnInit {
  canzoni: Canzone[] = [];
  top20: any[] = [];
  isAdmin: boolean = false;
  userId: number | null = null;
  guestId: string | null = null; // identif guest anonimo

  emojisVoto: string[] = ['😐', '😂', '👍', '😎', '🤩', '❤', '🔥'];

  editingIndex: number | null = null;
  editedCanzone: Canzone | null = null;

  scrollToId: number | null = null;

  constructor(
    private karaokeService: KaraokeService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.isAdmin = this.authService.getRole() === 'admin';
    this.userId = this.authService.getUserId();

    // Prendo il parametro query scrollToId se presente
    this.route.queryParams.subscribe(params => {
      this.scrollToId = params['scrollToId'] ? +params['scrollToId'] : null;
    });

    this.caricaCanzoni();
    this.caricaTop20();
  }

  onDrop(event: CdkDragDrop<Canzone[]>) {
    moveItemInArray(this.canzoni, event.previousIndex, event.currentIndex);
    // puoi salvare subito, oppure mostrare un bottone "Salva ordine"
    this.salvaOrdine(); // oppure metti un pulsante manuale
  }

  generateGuestId(): string {
    return 'guest-' + Math.random().toString(36).substring(2, 15);
  }

  salvaOrdine(): void {
    const nuovaLista = this.canzoni.map((c, index) => ({
      id: c.id,
      posizione: index + 1
    }));

    // permette modifica ordine canzoni tramite drag & drop
    this.karaokeService.riordinaCanzoni(nuovaLista).subscribe({
      next: () => alert('Ordine salvato con successo ✅'),
      error: (err) => {
        console.error('Errore salvataggio ordine:', err);
        alert('Errore nel salvataggio del nuovo ordine');
      }
    });
  }

  caricaCanzoni(): void {
    this.karaokeService.getCanzoni().subscribe({
      next: (data: Canzone[]) => {
        this.canzoni = data;

        if (this.scrollToId !== null) {
          // Aspetto rendering prima di scrollare
          setTimeout(() => {
            const el = document.getElementById('canzone-' + this.scrollToId);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('highlight');
              setTimeout(() => el.classList.remove('highlight'), 3000);
            }
          }, 100);
        }
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
    if (!this.isAdmin) return;
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

  numeroCantate(): number {
    return this.canzoni.filter(c => c.cantata).length;
  }

  resetLista(): void {
    if (!this.isAdmin) return;
    if (confirm('Sei sicuro di voler resettare la lista giornaliera?')) {
      this.karaokeService.resetLista('karaokeadmin').subscribe({
        next: () => {
          alert('Lista resettata con successo');
          this.caricaCanzoni();
        },
        error: (error) => {
          console.error('Errore nel reset:', error);
          alert('Errore durante il reset della lista');
        }
      });
    }
  }

  partecipaAllaCanzone(canzone: Canzone): void {
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

  partecipazioneCompleta(canzone: Canzone): boolean {
    return canzone.partecipanti_add >= 3;
  }

  eliminaCanzone(id: number, index: number): void {
    if (!this.canEditOrDelete(this.canzoni[index])) return;
    if (confirm('Sei sicuro di voler eliminare questa canzone?')) {
      this.karaokeService.deleteCanzone(id).subscribe({
        next: () => {
          alert('Canzone eliminata con successo');
          this.canzoni.splice(index, 1);
        },
        error: (err) => {
          console.error('Errore eliminazione canzone:', err);
          alert('Errore durante l\'eliminazione della canzone');
        }
      });
    }
  }

  modifica(index: number): void {
    if (!this.canEditOrDelete(this.canzoni[index])) return;
    this.editingIndex = index;
    this.editedCanzone = { ...this.canzoni[index] };
  }

  annullaModifica(): void {
    this.editingIndex = null;
    this.editedCanzone = null;
  }

  salvaModifica(index: number): void {
    if (!this.canEditOrDelete(this.canzoni[index])) return;

    if (!this.editedCanzone) return;

    this.karaokeService.aggiornaCanzone(this.editedCanzone.id, this.editedCanzone).subscribe({
      next: () => {
        this.canzoni[index] = { ...this.editedCanzone! };
        this.editingIndex = null;
        this.editedCanzone = null;
        alert('Modifica salvata con successo');
      },
      error: (err) => {
        console.error('Errore durante il salvataggio:', err);
        alert('Errore durante il salvataggio della canzone');
      }
    });
  }

  canEditOrDelete(canzone: Canzone): boolean {
    return this.isAdmin || (this.userId !== null && canzone.user_id === this.userId);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  votaCanzone(index: number, emoji: string): void {
    if (!this.userId) {
      alert('Devi essere loggato per votare!');
      return;
    }

    const canzone = this.canzoni[index];
    this.karaokeService.votaEmoji(canzone.id, this.userId!, emoji).subscribe({
      next: () => {
        canzone.votoEmoji = emoji;
        console.log(`Hai votato ${emoji} per "${canzone.nome}"`);
      },
      error: (err) => {
        console.error('Errore nel salvataggio del voto emoji:', err);
        alert('Errore nel salvataggio del voto emoji');
      }
    });
  }
}
