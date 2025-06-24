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

  // ✅ Metodo corretto per il reset
  resetLista(): Observable<any> {
    return this.http.delete(this.resetUrl);
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

  getNomePartecipante(idCanzone: number): Observable<{ nome: string }> {
    return this.http.get<{ nome: string }>(`${this.apiUrl}/${idCanzone}/nome-partecipante`);
  }

  getArchivioMusicale(): Observable<any[]> {
    return this.http.get<any[]>('http://localhost:3000/api/archivio-musicale');
  }

  deleteCanzone(id: number) {
  const token = localStorage.getItem('token');
  return this.http.delete(`${this.apiUrl}/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

aggiornaCanzone(id: number, dati: { nome: string, artista: string, canzone: string }): Observable<any> {
  return this.http.put(`http://localhost:3000/api/canzoni/${id}`, dati);
}


}
