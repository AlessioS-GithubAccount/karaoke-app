import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class KaraokeService {
  private apiUrl = 'http://localhost:3000/api/canzoni';
  private resetUrl = 'http://localhost:3000/api/reset-canzoni';
  private top20Url = 'http://localhost:3000/api/top20';

  // Variabile privata per memorizzare il nome dell'utente
  private nomeUtente: string = '';

  constructor(private http: HttpClient) {}

  // Metodi HTTP già esistenti
  getCanzoni(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  addCanzone(canzone: any): Observable<any> {
    return this.http.post(this.apiUrl, canzone);
  }

  resetLista(password: string): Observable<any> {
    return this.http.post(this.resetUrl, { password });
  }

  getTop20(): Observable<any[]> {
    return this.http.get<any[]>(this.top20Url);
  }

  aggiungiPartecipante(idCanzone: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/${idCanzone}/partecipa`, {});
  }

  getClassifica(): Observable<any[]> {
    return this.http.get<any[]>('/api/classifica');
  }

  aggiornaCantata(idCanzone: number, cantata: boolean): Observable<any> {
    return this.http.put(`${this.apiUrl}/${idCanzone}/cantata`, { cantata });
  }

  // --- Metodo per recuperare da DB il nome del client che sceglie la canzone dal form ---
  getNomePartecipante(idCanzone: number): Observable<{ nome: string }> {
    return this.http.get<{ nome: string }>(`${this.apiUrl}/${idCanzone}/nome-partecipante`);
 }

  getArchivioMusicale(): Observable<any[]> {
   return this.http.get<any[]>('http://localhost:3000/api/archivio-musicale');
  }
}
