import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { jwtDecode } from 'jwt-decode';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private baseUrl = environment.baseUrl;

  private loginUrl = `${this.baseUrl}/auth/login`;
  private logoutUrl = `${this.baseUrl}/auth/logout`;
  private refreshUrl = `${this.baseUrl}/auth/token`;

  // ⚠️ NON chiamare hasValidToken() qui: i Subject non esistono ancora
  private loggedIn = new BehaviorSubject<boolean>(false);
  public isLoggedIn$ = this.loggedIn.asObservable();

  private currentUserSubject = new BehaviorSubject<any | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    // Inizializza lo stato SOLO dopo che i Subject esistono
    const valid = this.hasValidToken();
    this.loggedIn.next(valid);
    if (valid) {
      this.loadUserFromStorage();
    } else {
      this.clearStorage();
      this.currentUserSubject.next(null);
    }
  }

  private loadUserFromStorage() {
    const username = localStorage.getItem('username');
    if (username) {
      this.http.get<any>(`${this.baseUrl}/users/by-username/${username}`).subscribe({
        next: (user) => this.currentUserSubject.next(user),
        error: () => this.currentUserSubject.next(null),
      });
    } else {
      this.currentUserSubject.next(null);
    }
  }

  getUtenteLoggato(): Observable<any | null> {
    return this.currentUser$;
  }

  reloadUtenteLoggato() {
    this.loadUserFromStorage();
  }

  login(username: string, password: string): Observable<any> {
    return new Observable<any>((observer) => {
      this.http.post<any>(this.loginUrl, { username, password }).subscribe({
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

  // 👇 invia anche refreshToken al backend
  logout(): void {
    const username = localStorage.getItem('username');
    const refreshToken = localStorage.getItem('refresh_token');

    if (username || refreshToken) {
      this.http.post(this.logoutUrl, { username, refreshToken }).subscribe({
        next: () => console.log('Logout notificato al backend'),
        error: (err) => console.error('Errore logout backend:', err),
      });
    }

    this.clearStorage();
    this.loggedIn.next(false);
    this.currentUserSubject.next(null);
  }

  isLoggedIn(): boolean {
    return this.loggedIn.value;
  }

  /** 🔒 P U R A: nessun side-effect, solo calcolo booleano */
  private hasValidToken(): boolean {
    const token = localStorage.getItem('token');
    if (!token) return false;

    try {
      const decoded: any = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);
      if (decoded?.exp == null) return true; // se non hai exp, considera valido (o metti false se preferisci)
      return decoded.exp > now;
    } catch {
      return false;
    }
  }

  private clearStorage() {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    localStorage.removeItem('guestId');
  }

  getUserId(): number | null {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const decoded: any = jwtDecode(token);
      return typeof decoded?.id === 'number' ? decoded.id : null;
    } catch (e) {
      console.log('AuthService.getUserId() failed to decode token', e);
      return null;
    }
  }

  getRole(): string | null {
    return localStorage.getItem('role');
  }

  refreshToken(): Observable<{ token: string }> {
    const refresh = localStorage.getItem('refresh_token');
    return this.http.post<{ token: string }>(this.refreshUrl, { refreshToken: refresh });
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  isUser(): boolean {
    return this.isLoggedIn();
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
