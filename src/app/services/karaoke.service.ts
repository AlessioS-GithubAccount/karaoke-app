import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class KaraokeService {
  private apiUrl = 'http://localhost:3000/api/canzoni';
  private resetUrl = 'http://localhost:3000/api/reset-canzoni';
  private top20Url = 'http://localhost:3000/api/top20';
  private archivioUrl = 'http://localhost:3000/api/archivio-musicale';
  private classificaUrl = 'http://localhost:3000/api/classifica';
    private votiUrl = 'http://localhost:3000/api/voti';  

  private nomeUtente: string = '';

  constructor(private http: HttpClient) {}

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
    return this.http.get<any[]>(this.classificaUrl);
  }

  aggiornaCantata(idCanzone: number, cantata: boolean): Observable<any> {
    return this.http.put(`${this.apiUrl}/${idCanzone}/cantata`, { cantata });
  }

  getNomePartecipante(idCanzone: number): Observable<{ nome: string }> {
    return this.http.get<{ nome: string }>(`${this.apiUrl}/${idCanzone}/nome-partecipante`);
  }

  getArchivioMusicale(): Observable<any[]> {
    return this.http.get<any[]>(this.archivioUrl);
  }

  deleteCanzone(id: number): Observable<any> {
    const token = localStorage.getItem('token');
    return this.http.delete(`${this.apiUrl}/${id}`, {
      headers: new HttpHeaders({
        Authorization: `Bearer ${token}`
      })
    });
  }

  aggiornaCanzone(id: number, dati: { nome: string, artista: string, canzone: string, tonalita?: string, note?: string, accetta_partecipanti?: boolean }): Observable<any> {
    const token = localStorage.getItem('token');
    return this.http.put(`${this.apiUrl}/${id}`, dati, {
      headers: new HttpHeaders({
        Authorization: `Bearer ${token}`
      })
    });
  }

  // Getter e Setter per nome utente (facoltativi)
  setNomeUtente(nome: string): void {
    this.nomeUtente = nome;
  }

  getNomeUtente(): string {
    return this.nomeUtente;
  }

   // Metodo per inviare o aggiornare un voto emoji
  votaEmoji(canzoneId: number, voterId: number, emoji: string): Observable<any> {
    const body = { canzone_id: canzoneId, voter_id: voterId, emoji };
    return this.http.post('http://localhost:3000/api/voti', body);
  }


 getTopN(n: number): Observable<any[]> {
  return this.http.get<any[]>(`http://localhost:3000/api/classifica/top?n=${n}`);
}
}
