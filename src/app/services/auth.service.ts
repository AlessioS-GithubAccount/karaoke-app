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

  // nuovo endpoint guest 
  private guestUrl = `${this.baseUrl}/auth/guest`;

  // NON chiamare hasValidToken() qui: i Subject non esistono ancora
  private loggedIn = new BehaviorSubject<boolean>(false);
  public isLoggedIn$ = this.loggedIn.asObservable();

  private currentUserSubject = new BehaviorSubject<any | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    // Inizializza lo stato SOLO dopo che i Subject esistono
    const validUser = this.hasValidUserToken();
    this.loggedIn.next(validUser);

    if (validUser) {
      this.loadUserFromStorage();
    } else {
      // pulizia SOLO user-auth (non toccare guest)
      this.clearUserStorageOnly();
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

          // quando fai login user/admin, resti loggato anche se esiste un guest_token
          this.loggedIn.next(true);
          this.reloadUtenteLoggato();

          observer.next(res);
        },
        error: (err) => observer.error(err),
      });
    });
  }

  // invia anche refreshToken al backend
  // Questo logout è SOLO per user/admin (il bottone è invisible ai guest)
  logout(): void {
    const username = localStorage.getItem('username');
    const refreshToken = localStorage.getItem('refresh_token');

    if (username || refreshToken) {
      this.http.post(this.logoutUrl, { username, refreshToken }).subscribe({
        next: () => console.log('Logout notificato al backend'),
        error: (err) => console.error('Errore logout backend:', err),
      });
    }

    // pulizia SOLO user (non toccare guest_token / guestId)
    this.clearUserStorageOnly();
    this.loggedIn.next(false);
    this.currentUserSubject.next(null);
  }

  isLoggedIn(): boolean {
    return this.loggedIn.value;
  }

  // =========================
  //  TOKEN HELPERS
  // =========================

  // nessun side-effect, solo calcolo booleano (USER token)
  private hasValidUserToken(): boolean {
    return this.hasValidJwtInStorage('token');
  }

  // valida un JWT in localStorage (controlla solo exp se presente)
  private hasValidJwtInStorage(storageKey: string): boolean {
    const token = localStorage.getItem(storageKey);
    if (!token) return false;

    try {
      const decoded: any = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);
      if (decoded?.exp == null) return true; // se non hai exp, considera valido
      return decoded.exp > now;
    } catch {
      return false;
    }
  }

  // Pulizia credenziali SOLO user/admin (NON tocca guest)
  private clearUserStorageOnly() {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');

    // NON rimuovere questi (serve stabilità guest)
    // localStorage.removeItem('guest_token');
    // localStorage.removeItem('guestId');
  }

  // =========================
  //  USER INFO
  // =========================

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
    // user/admin sono entrambi "user autenticati"
    return this.isLoggedIn();
  }

  // =========================
  //  GUEST (compat + nuovo guest_token)
  // =========================

  /**
   * Entra come guest:
   * - chiama /auth/guest
   * - salva guest_token
   * - NON altera loggedIn (resta false)
   */
  enterGuest(): Observable<any> {
    return new Observable<any>((observer) => {
      // L'interceptor attaccherà automaticamente guest_token se già presente.
      // Se il backend è idempotente, se il token è valido ti rimanda lo stesso.
      this.http.post<any>(this.guestUrl, {}).subscribe({
        next: (res) => {
          const token = res?.guestToken || res?.guest_token || res?.token || null;
          if (token) {
            localStorage.setItem('guest_token', token);
          }

          // compat: se backend manda guest_id, lo salva anche come guestId (temporaneo)
          const gid = res?.guest_id || res?.guestId || null;
          if (gid) {
            localStorage.setItem('guestId', String(gid));
          }

          observer.next(res);
        },
        error: (err) => observer.error(err),
      });
    });
  }

  // guest token (nuovo)
  getGuestToken(): string | null {
    return localStorage.getItem('guest_token');
  }

  // guestId legacy (vecchio), tenuto per compat finché aggiorniamo i componenti
  getGuestId(): string | null {
    // priorità: estraiamo dal guest_token se possibile
    const token = localStorage.getItem('guest_token');
    if (token) {
      try {
        const decoded: any = jwtDecode(token);
        if (decoded?.guest_id) return String(decoded.guest_id);
      } catch {}
    }
    return localStorage.getItem('guestId');
  }

  /**
   * Guest = NON user + (guest_token valido OR guestId legacy presente)
   * (Così non rompiamo la tua app mentre migriamo i componenti.)
   */
  isGuest(): boolean {
    const hasGuestTokenValid = this.hasValidJwtInStorage('guest_token');
    const hasLegacyGuestId = !!localStorage.getItem('guestId');
    return !this.isUser() && (hasGuestTokenValid || hasLegacyGuestId);
  }

  canPartecipate(): boolean {
    return this.isUser() || this.isGuest();
  }
}
