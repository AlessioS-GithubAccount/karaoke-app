import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpErrorResponse,
  HttpClient
} from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable()
export class TokenInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject = new BehaviorSubject<string | null>(null);

  private authUrl = `${environment.baseUrl}/auth`;

  constructor(private http: HttpClient) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const userToken = localStorage.getItem('token');
    const guestToken = localStorage.getItem('guest_token');

    // Priorità: se esiste token user lo uso; altrimenti uso guest_token; altrimenti nulla
    const tokenToUse = userToken || guestToken;
    const authReq = tokenToUse ? this.addTokenHeader(req, tokenToUse) : req;

    const isAuthEndpoint =
      authReq.url.includes('/auth/login') ||
      authReq.url.includes('/auth/token') ||
      authReq.url.includes('/auth/logout') ||
      authReq.url.includes('/auth/guest');

    return next.handle(authReq).pipe(
      catchError((error) => {
        // Non tentare refresh sugli endpoint auth (evita loop / comportamenti strani)
        if (isAuthEndpoint) {
          return throwError(() => error);
        }

        // Refresh SOLO se sei un utente loggato (token + refresh_token)
        if (
          error instanceof HttpErrorResponse &&
          (error.status === 401 || error.status === 403)
        ) {
          const hasUserToken = !!localStorage.getItem('token');
          const hasRefresh = !!localStorage.getItem('refresh_token');

          if (hasUserToken && hasRefresh) {
            return this.handleAuthError(authReq, next);
          }
        }

        // Se sei guest (o anonimo), non tentiamo refresh
        return throwError(() => error);
      })
    );
  }

  private addTokenHeader(request: HttpRequest<any>, token: string): HttpRequest<any> {
    return request.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }

  // Gestione centralizzata del refresh token con coda delle richieste durante il refresh
  private handleAuthError(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      const refreshToken = localStorage.getItem('refresh_token');

      // Se non ho refresh token, pulisco solo user-auth e termino
      if (!refreshToken) {
        this.cleanupUserAuth();
        return throwError(() => new Error('Missing refresh token'));
      }

      return this.http.post<{ token: string }>(`${this.authUrl}/token`, { refreshToken }).pipe(
        switchMap((res) => {
          this.isRefreshing = false;

          const newToken = res?.token;
          if (!newToken) {
            this.cleanupUserAuth();
            return throwError(() => new Error('Invalid refresh response'));
          }

          localStorage.setItem('token', newToken);
          this.refreshTokenSubject.next(newToken);

          // ritenta la richiesta originale con il nuovo token
          return next.handle(this.addTokenHeader(request, newToken));
        }),
        catchError((err) => {
          this.isRefreshing = false;

          // Provo a notificare il backend del logout, se ho dati user
          const username = localStorage.getItem('username');
          const rt = localStorage.getItem('refresh_token');
          if (username || rt) {
            this.http.post(`${this.authUrl}/logout`, { username, refreshToken: rt }).subscribe({
              next: () => console.log('Logout notificato al backend dopo refresh fallito'),
              error: (e) => console.error('Errore logout backend dopo refresh fallito:', e)
            });
          }

          // Pulizia SOLO user (non tocca guest)
          this.cleanupUserAuth();
          return throwError(() => err);
        })
      );
    } else {
      // Coda: attendo che il refresh sia completato e riuso il token aggiornato
      return this.refreshTokenSubject.pipe(
        filter((t): t is string => t != null),
        take(1),
        switchMap((t) => next.handle(this.addTokenHeader(request, t)))
      );
    }
  }

  // Pulizia locale delle credenziali SOLO user/admin (NON tocca guest_token / guestId)
  private cleanupUserAuth(): void {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('role');
      localStorage.removeItem('username');

      // NON rimuovere i dati guest: servono per stabilità identità ospite
      // localStorage.removeItem('guest_token');
      // localStorage.removeItem('guestId');
    } catch {}
  }
}
