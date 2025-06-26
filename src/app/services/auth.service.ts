import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { jwtDecode } from 'jwt-decode';  // Import nominato per v4+

interface LoginResponse {
  message: string;
  token: string;
  ruolo: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private loginUrl = 'http://localhost:3000/api/auth/login';
  private logoutUrl = 'http://localhost:3000/api/auth/logout';

  constructor(private http: HttpClient) {}

  login(username: string, password: string): Observable<LoginResponse> {
    return new Observable<LoginResponse>((observer) => {
      this.http.post<LoginResponse>(this.loginUrl, { username, password }).subscribe({
        next: (res) => {
          localStorage.setItem('token', res.token);
          localStorage.setItem('role', res.ruolo);
          localStorage.setItem('username', username);
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
    localStorage.removeItem('role');
    localStorage.removeItem('username');
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem('token');
  }

  getUserId(): number | null {
    const token = localStorage.getItem('token');
    if (!token) return null;

    try {
      const decoded: any = jwtDecode(token);
      console.log('Decoded token:', decoded);
      return decoded.id || null;
    } catch (e) {
      console.log('AuthService.getUserId() failed to decode token', e);
      return null;
    }
  }

  getRole(): string | null {
    return localStorage.getItem('role');
  }
}
