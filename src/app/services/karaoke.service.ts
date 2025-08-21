import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class KaraokeService {
  private baseUrl = environment.baseUrl;

  private apiUrl = `${this.baseUrl}/canzoni`;
  private resetUrl = `${this.baseUrl}/reset-canzoni`;
  private top20Url = `${this.baseUrl}/top20`;
  private archivioUrl = `${this.baseUrl}/archivio-musicale`;
  private classificaUrl = `${this.baseUrl}/classifica`;
  private votiUrl = `${this.baseUrl}/voti`;

  // Snapshot endpoints
  private snapshotTopUrl = `${this.baseUrl}/classifica/snapshot/top`;

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

  // Aggiunge un partecipante (contatore) semplice
  aggiungiPartecipante(idCanzone: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/${idCanzone}/partecipa`, {});
  }

  // Classifica "live" (ordinata su num_richieste)
  getClassifica(): Observable<any[]> {
    return this.http.get<any[]>(this.classificaUrl);
  }

  // ✅ Classifica "snapshot del giorno"
  getSnapshotTop(n: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.snapshotTopUrl}?n=${n}`);
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

  getArchivioMusicalePaginated(page: number, limit: number): Observable<any> {
    return this.http.get<any>(`${this.archivioUrl}?page=${page}&limit=${limit}`);
  }

  getArchivioMusicaleSearch(query: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.archivioUrl}/search?q=${encodeURIComponent(query)}`);
  }

  deleteCanzone(id: number): Observable<any> {
    const token = localStorage.getItem('token');
    return this.http.delete(`${this.apiUrl}/${id}`, {
      headers: new HttpHeaders({
        Authorization: `Bearer ${token}`
      })
    });
  }

  deleteFromArchivio(id: number): Observable<any> {
    const token = localStorage.getItem('token') || '';
    return this.http.delete(`${this.archivioUrl}/${id}`, {
      headers: new HttpHeaders({
        Authorization: `Bearer ${token}`
      })
    });
  }

  deleteFromClassifica(id: number): Observable<any> {
    const token = localStorage.getItem('token') || '';
    return this.http.delete(`${this.baseUrl}/classifica/${id}`, {
      headers: new HttpHeaders({
        Authorization: `Bearer ${token}`
      })
    });
  }

  aggiornaCanzone(
    id: number,
    dati: { nome: string; artista: string; canzone: string; tonalita?: string; note?: string; accetta_partecipanti?: boolean }
  ): Observable<any> {
    const token = localStorage.getItem('token');
    return this.http.put(`${this.apiUrl}/${id}`, dati, {
      headers: new HttpHeaders({
        Authorization: `Bearer ${token}`
      })
    });
  }

  // Getter/Setter nome utente (facoltativi)
  setNomeUtente(nome: string): void {
    this.nomeUtente = nome;
  }

  getNomeUtente(): string {
    return this.nomeUtente;
  }

  // Voti emoji (crea/aggiorna)
  votaEmoji(canzoneId: number, voterId: number, emoji: string): Observable<any> {
    const body = { canzone_id: canzoneId, voter_id: voterId, emoji };
    return this.http.post(`${this.baseUrl}/voti`, body);
  }

  // Classifica "live" top N
  getTopN(n: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/classifica/top?n=${n}`);
  }

  // Riordino lista
  riordinaCanzoni(listaOrdinata: { id: number; posizione: number }[]): Observable<any> {
    return this.http.post(`${this.baseUrl}/canzoni/riordina`, listaOrdinata);
  }

  // Aggiunta partecipante con nome (autenticata)
  aggiungiPartecipanteCompleto(idCanzone: number, nomePartecipante: string): Observable<any> {
    const token = localStorage.getItem('token') || '';
    return this.http.post(
      `${this.baseUrl}/canzoni/${idCanzone}/aggiungi-partecipante`,
      { nomePartecipante },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
  }

  // Wishlist
  aggiungiAWishlist(data: { user_id: number; artista: string; canzone: string }): Observable<any> {
    return this.http.post(`${this.baseUrl}/wishlist`, data);
  }
}
