import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class KaraokeService {
  private apiUrl = 'http://localhost:3000/api/canzoni';
  private resetUrl = 'http://localhost:3000/api/reset-canzoni'; // endpoint per il reset
  private top20Url = 'http://localhost:3000/api/top20';

  constructor(private http: HttpClient) {}

  getCanzoni(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  addCanzone(canzone: any): Observable<any> {
    return this.http.post(this.apiUrl, canzone);
  }

  // Metodo modificato per inviare la password nel body della richiesta POST
  resetLista(password: string): Observable<any> {
    return this.http.post(this.resetUrl, { password });
  }

  getTop20(): Observable<any[]> {
    return this.http.get<any[]>(this.top20Url);
  }

  aggiungiPartecipante(idCanzone: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/${idCanzone}/partecipa`, {});
  }
}
