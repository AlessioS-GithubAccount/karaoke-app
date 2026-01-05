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
    // ✅ FIX: chiave corretta usata in tutto il resto del progetto
    return localStorage.getItem('guest_token');
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
    // ✅ FIX: cache-bust per garantire lista aggiornata dopo queue:changed
    const ts = Date.now();
    return this.http.get<any[]>(`${this.apiUrl}?_=${ts}`);
  }

  /**
   * POST /canzoni
   * - se sei loggato: manda token user
   * - se sei guest: manda guest_token
   * - se non hai token: funziona SOLO se passi guest_id/user_id nel body (compat vecchia)
   */
  addCanzone(canzone: any): Observable<any> {
    const headers = this.bestEffortAuthHeaders();
    return this.http.post(this.apiUrl, canzone, { headers });
  }

  resetLista(password: string): Observable<any> {
    // backend usa password nel body (no token richiesto)
    return this.http.post(this.resetUrl, { password });
  }

  // Aggiunge un partecipante (contatore semplice)
  aggiungiPartecipante(idCanzone: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/${idCanzone}/partecipa`, {});
  }

  // Classifica "live" (se hai un endpoint GET /classifica)
  getClassifica(): Observable<any[]> {
    return this.http.get<any[]>(this.classificaUrl);
  }

  aggiornaCantata(idCanzone: number, cantata: boolean): Observable<any> {
  const headers = this.userAuthHeaders(); // admin token
  return this.http.put(`${this.apiUrl}/${idCanzone}/cantata`, { cantata }, { headers });
  }

  /**
   * Admin: blocca/sblocca la canzone dall'algoritmo (priority lock).
   * Backend atteso: PUT /api/canzoni/:id/priority-lock { priority_lock: 0|1 }
   */
  setPriorityLock(idCanzone: number, locked: boolean): Observable<any> {
  const headers = this.userAuthHeaders(); // admin token
  return this.http.put(`${this.apiUrl}/${idCanzone}/priority-lock`, { locked }, { headers });
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
    // backend: verifyToken + owner/admin
    const headers = this.userAuthHeaders();
    return this.http.delete(`${this.apiUrl}/${id}`, { headers });
  }

  deleteFromArchivio(id: number): Observable<any> {
    // backend: verifyToken + admin
    const headers = this.userAuthHeaders();
    return this.http.delete(`${this.archivioUrl}/${id}`, { headers });
  }

  deleteFromClassifica(id: number): Observable<any> {
    // backend: verifyToken + admin
    const headers = this.userAuthHeaders();
    return this.http.delete(`${this.baseUrl}/classifica/${id}`, { headers });
  }

  aggiornaCanzone(
    id: number,
    dati: { nome: string; artista: string; canzone: string; tonalita?: string; note?: string; accetta_partecipanti?: boolean }
  ): Observable<any> {
    // backend: verifyToken + owner/admin
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

  // Voti emoji (crea/aggiorna) - nel tuo backend è pubblico
  votaEmoji(canzoneId: number, voterId: number, emoji: string): Observable<any> {
    const body = { canzone_id: canzoneId, voter_id: voterId, emoji };
    return this.http.post(this.votiUrl, body);
  }

  // Classifica "live" top N
  getTopN(n: number): Observable<any[]> {
    const ts = Date.now();
    return this.http.get<any[]>(`${this.baseUrl}/classifica/top?n=${n}&_=${ts}`);
  }

  // Riordino lista (admin) ✅ ora con token
  riordinaCanzoni(listaOrdinata: { id: number; posizione: number }[]): Observable<any> {
    const headers = this.userAuthHeaders();
    return this.http.post(`${this.baseUrl}/canzoni/riordina`, listaOrdinata, { headers });
  }

  // Aggiunta partecipante con nome (nel backend richiede user token, non guest)
  aggiungiPartecipanteCompleto(idCanzone: number, nomePartecipante: string): Observable<any> {
    const headers = this.userAuthHeaders();
    return this.http.post(
      `${this.baseUrl}/canzoni/${idCanzone}/aggiungi-partecipante`,
      { nomePartecipante },
      { headers }
    );
  }

  // Wishlist (backend: verifyToken) ✅ FIX header
  aggiungiAWishlist(data: { user_id: number; artista: string; canzone: string }): Observable<any> {
    const headers = this.userAuthHeaders();
    return this.http.post(`${this.baseUrl}/wishlist`, data, { headers });
  }
}
