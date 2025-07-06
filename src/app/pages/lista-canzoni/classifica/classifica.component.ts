import { Component, OnInit } from '@angular/core';
import { KaraokeService } from '../../../services/karaoke.service';
import { AuthService } from '../../../services/auth.service'; // se ce l'hai

@Component({
  selector: 'app-classifica',
  templateUrl: './classifica.component.html',
  styleUrls: ['./classifica.component.css']
})
export class ClassificaComponent implements OnInit {
  topCanzoni: any[] = [];
  topNum: number = 30;
  isAdmin: boolean = false;

  constructor(
    private karaokeService: KaraokeService,
    private authService: AuthService  // supponendo ci sia
  ) {}

  ngOnInit(): void {
    this.isAdmin = this.authService.getRole() === 'admin';  // o altro modo
    this.caricaClassifica();
  }

  caricaClassifica(): void {
    this.karaokeService.getTopN(this.topNum).subscribe({
      next: (data: any[]) => {
        console.log('Dati caricati da backend:', data);
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
        this.topCanzoni = Array.from(uniqueMap.values())
          .sort((a, b) => b.num_richieste - a.num_richieste);
      },
      error: (err) => console.error('Errore nel caricamento della classifica:', err)
    });
  }

  eliminaCanzone(id: number): void {
    if (!this.isAdmin) return; // sicurezza extra

    if (confirm('Sei sicuro di voler eliminare questa canzone dalla classifica?')) {
      this.karaokeService.deleteFromClassifica(id).subscribe({
        next: () => {
          this.topCanzoni = this.topCanzoni.filter(c => c.id !== id);
        },
        error: (err) => {
          console.error('Errore durante eliminazione dalla classifica:', err);
          alert('Errore durante l\'eliminazione');
        }
      });
    }
  }

  logId(id: any) {
  console.log('ID della canzone:', id);
  return '';
}


  private capitalizeWords(str: string): string {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) =>
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }
}
