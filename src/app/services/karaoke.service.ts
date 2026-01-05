import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

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

  private nomeUtente: string = '';

  constructor(private http: HttpClient) {}

  // =========================
  // Helpers token/headers
  // =========================
  private getUserToken(): string | null {
    const raw = (localStorage.getItem('token') || '').trim();
    const t = raw.replace(/^Bearer\s+/i, '').trim();
    return t || null;
  }

  private getGuestToken(): string | null {
    const t = (localStorage.getItem('guest_token') || '').trim();
    return t || null;
  }

  private authHeaders(token: string | null): HttpHeaders {
    let headers = new HttpHeaders();
    if (token) headers = headers.set('Authorization', `Bearer ${token}`);
    return headers;
  }

  /** Usa token user se presente, altrimenti guest_token */
  private bestEffortAuthHeaders(): HttpHeaders {
    const userToken = this.getUserToken();
    if (userToken) return this.authHeaders(userToken);

    const guestToken = this.getGuestToken();
    if (guestToken) return this.authHeaders(guestToken);

    return new HttpHeaders();
  }

  /** Solo user/admin (NO guest) */
  private userAuthHeaders(): HttpHeaders {
    return this.authHeaders(this.getUserToken());
  }

  // =========================
  // API
  // =========================
  getCanzoni(): Observable<any[]> {
    const ts = Date.now();
    return this.http.get<any[]>(`${this.apiUrl}?_=${ts}`);
  }

  addCanzone(canzone: any): Observable<any> {
    const headers = this.bestEffortAuthHeaders();
    return this.http.post(this.apiUrl, canzone, { headers });
  }

  resetLista(password: string): Observable<any> {
    return this.http.post(this.resetUrl, { password });
  }

  aggiungiPartecipante(idCanzone: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/${idCanzone}/partecipa`, {});
  }

  aggiornaCantata(idCanzone: number, cantata: boolean): Observable<any> {
    return this.http.put(`${this.apiUrl}/${idCanzone}/cantata`, { cantata });
  }

  getNomePartecipante(idCanzone: number): Observable<{ nome: string }> {
    return this.http.get<{ nome: string }>(`${this.apiUrl}/${idCanzone}/nome-partecipante`);
  }

  getArchivioMusicale(): Observable<any[]> {
    const ts = Date.now();
    return this.http.get<any[]>(`${this.archivioUrl}?_=${ts}`);
  }

  getArchivioMusicalePaginated(page: number, limit: number): Observable<any> {
    const ts = Date.now();
    return this.http.get<any>(`${this.archivioUrl}?page=${page}&limit=${limit}&_=${ts}`);
  }

  getArchivioMusicaleSearch(query: string): Observable<any[]> {
    const ts = Date.now();
    return this.http.get<any[]>(`${this.archivioUrl}/search?q=${encodeURIComponent(query)}&_=${ts}`);
  }

  deleteCanzone(id: number): Observable<any> {
    const headers = this.userAuthHeaders();
    return this.http.delete(`${this.apiUrl}/${id}`, { headers });
  }

  deleteFromArchivio(id: number): Observable<any> {
    const headers = this.userAuthHeaders();
    return this.http.delete(`${this.archivioUrl}/${id}`, { headers });
  }

  // =========================
  // CLASSIFICA (LIVE: tabella `classifica`)
  // =========================
  getClassifica(): Observable<any[]> {
    const ts = Date.now();
    return this.http.get<any[]>(`${this.classificaUrl}?_=${ts}`);
  }

  getTopN(n: number): Observable<any[]> {
    const ts = Date.now();
    return this.http.get<any[]>(`${this.classificaUrl}/top?n=${n}&_=${ts}`);
  }

  deleteFromClassifica(id: number): Observable<any> {
    const headers = this.userAuthHeaders();
    return this.http.delete(`${this.classificaUrl}/${id}`, { headers });
  }

  aggiornaCanzone(
    id: number,
    dati: { nome: string; artista: string; canzone: string; tonalita?: string; note?: string; accetta_partecipanti?: boolean }
  ): Observable<any> {
    const headers = this.userAuthHeaders();
    return this.http.put(`${this.apiUrl}/${id}`, dati, { headers });
  }

  // Getter/Setter nome utente (facoltativi)
  setNomeUtente(nome: string): void {
    this.nomeUtente = nome;
  }

  getNomeUtente(): string {
    return this.nomeUtente;
  }

  // Voti emoji (pubblico nel backend)
  votaEmoji(canzoneId: number, voterId: string | number, emoji: string): Observable<any> {
    const body = { canzone_id: canzoneId, voter_id: voterId, emoji };
    return this.http.post(this.votiUrl, body);
  }

  // Riordino lista (admin)
  riordinaCanzoni(listaOrdinata: { id: number; posizione: number }[]): Observable<any> {
    const headers = this.userAuthHeaders();
    return this.http.post(`${this.baseUrl}/canzoni/riordina`, listaOrdinata, { headers });
  }

  // Aggiunta partecipante con nome (backend richiede user token)
  aggiungiPartecipanteCompleto(idCanzone: number, nomePartecipante: string): Observable<any> {
    const headers = this.userAuthHeaders();
    return this.http.post(
      `${this.baseUrl}/canzoni/${idCanzone}/aggiungi-partecipante`,
      { nomePartecipante },
      { headers }
    );
  }

  // Wishlist (se già la usi così nel progetto la lascio intatta)
  aggiungiAWishlist(data: { user_id: number; artista: string; canzone: string }): Observable<any> {
    const headers = this.userAuthHeaders();
    return this.http.post(`${this.baseUrl}/wishlist`, data, { headers });
  }
}
