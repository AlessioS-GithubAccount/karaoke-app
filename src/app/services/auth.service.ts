import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { jwtDecode } from 'jwt-decode';

interface LoginResponse {
  message: string;
  token: string;
  refreshToken: string;
  ruolo: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private loginUrl = 'http://localhost:3000/api/auth/login';
  private logoutUrl = 'http://localhost:3000/api/auth/logout';
  private refreshUrl = 'http://localhost:3000/api/auth/token';

  // Stato login BehaviorSubject inizializzato in base a validità token
  private loggedIn = new BehaviorSubject<boolean>(this.hasValidToken());
  public isLoggedIn$ = this.loggedIn.asObservable();

  // Caching utente loggato
  private currentUserSubject = new BehaviorSubject<any | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadUserFromStorage();
  }

  private loadUserFromStorage() {
    const username = localStorage.getItem('username');
    if (username) {
      this.http.get<any>(`http://localhost:3000/api/users/by-username/${username}`).subscribe({
        next: user => this.currentUserSubject.next(user),
        error: () => this.currentUserSubject.next(null),
      });
    } else {
      this.currentUserSubject.next(null);
    }
  }

  // Metodo pubblico per ottenere l'utente loggato come Observable
  getUtenteLoggato(): Observable<any | null> {
    return this.currentUser$;
  }

  // Ricarica manuale utente loggato (es. dopo login)
  reloadUtenteLoggato() {
    this.loadUserFromStorage();
  }

  login(username: string, password: string): Observable<LoginResponse> {
    console.log('Invio richiesta login a backend', { username, password })
    return new Observable<LoginResponse>((observer) => {
      this.http.post<LoginResponse>(this.loginUrl, { username, password }).subscribe({
        next: (res) => {
          localStorage.setItem('token', res.token);
          localStorage.setItem('refresh_token', res.refreshToken);
          localStorage.setItem('role', res.ruolo);
          localStorage.setItem('username', username);

          this.loggedIn.next(true);
          this.reloadUtenteLoggato();

          observer.next(res);
        },
        error: (err) => observer.error(err),
      });
    });
  }

  logout(): void {
    const username = localStorage.getItem('username');
    if (username) {
      this.http.post(this.logoutUrl, { username }).subscribe({
        next: () => console.log('Logout notificato al backend'),
        error: (err) => console.error('Errore logout backend:', err),
      });
    }

    localStorage.removeItem('guestId');
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');

    this.loggedIn.next(false);
    this.currentUserSubject.next(null);
  }

  isLoggedIn(): boolean {
    return this.loggedIn.value;
  }

  private hasValidToken(): boolean {
    const token = localStorage.getItem('token');
    if (!token) return false;

    // Facoltativo: verifica scadenza token con jwtDecode e controllo data scadenza
    try {
      const decoded: any = jwtDecode(token);
      if (decoded.exp) {
        const now = Date.now().valueOf() / 1000;
        if (decoded.exp < now) {
          // token scaduto
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  getUserId(): number | null {
    const token = localStorage.getItem('token');
    if (!token) return null;

    try {
      const decoded: any = jwtDecode(token);
      return decoded.id || null;
    } catch (e) {
      console.log('AuthService.getUserId() failed to decode token', e);
      return null;
    }
  }

  getRole(): string | null {
    return localStorage.getItem('role');
  }

  refreshToken(): Observable<any> {
    const refresh = localStorage.getItem('refresh_token');
    return this.http.post<{ token: string }>(this.refreshUrl, { refreshToken: refresh });
  }

  getToken(): string | null {
  return localStorage.getItem('token');
}

isUser(): boolean {
  return this.isLoggedIn(); // già fa verifica token valido
}

isGuest(): boolean {
  return !this.isUser() && !!localStorage.getItem('guestId');
}

canPartecipate(): boolean {
  return this.isUser() || this.isGuest();
}

getGuestId(): string | null {
  return localStorage.getItem('guestId');
}


}
