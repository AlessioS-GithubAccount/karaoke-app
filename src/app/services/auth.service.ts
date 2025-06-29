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

  // BehaviorSubject per stato login, inizializzato in base al token esistente
  private loggedIn = new BehaviorSubject<boolean>(this.hasValidToken());

  // Observable pubblico per iscriversi ai cambi di stato login
  public isLoggedIn$ = this.loggedIn.asObservable();

  constructor(private http: HttpClient) {}

  login(username: string, password: string): Observable<LoginResponse> {
    return new Observable<LoginResponse>((observer) => {
      this.http.post<LoginResponse>(this.loginUrl, { username, password }).subscribe({
        next: (res) => {
          localStorage.setItem('token', res.token);
          localStorage.setItem('refresh_token', res.refreshToken);
          localStorage.setItem('role', res.ruolo);
          localStorage.setItem('username', username);

          this.loggedIn.next(true); // Notifica login

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

    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');

    this.loggedIn.next(false); // Notifica logout
  }

  isLoggedIn(): boolean {
    return this.loggedIn.value;
  }

  private hasValidToken(): boolean {
    const token = localStorage.getItem('token');
    if (!token) return false;
    // Eventuale controllo di validità del token qui
    return true;
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
}
