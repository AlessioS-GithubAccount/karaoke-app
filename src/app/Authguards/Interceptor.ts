import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpErrorResponse,
  HttpClient
} from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';

@Injectable()
export class TokenInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

  constructor(private http: HttpClient) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = localStorage.getItem('token');
    let request = req;

    if (token) {
      request = this.addTokenHeader(req, token);
    }

    return next.handle(request).pipe(
      catchError((error) => {
        if (error instanceof HttpErrorResponse && error.status === 403) {
          return this.handle403Error(request, next);
        }
        return throwError(() => error);
      })
    );
  }

  private addTokenHeader(request: HttpRequest<any>, token: string): HttpRequest<any> {
    return request.clone({
      headers: request.headers.set('Authorization', `Bearer ${token}`)
    });
  }

  private handle403Error(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      const refreshToken = localStorage.getItem('refresh_token');
      return this.http.post<any>('http://localhost:3000/api/auth/token', { refreshToken }).pipe(
        switchMap((res) => {
          this.isRefreshing = false;
          localStorage.setItem('token', res.token);
          this.refreshTokenSubject.next(res.token);
          return next.handle(this.addTokenHeader(request, res.token));
        }),
        catchError((err) => {
          this.isRefreshing = false;

          // ⛔ Fallimento nel refresh token: effettua logout anche sul backend se possibile
          const username = localStorage.getItem('username');
          if (username) {
            this.http.post('http://localhost:3000/api/auth/logout', { username }).subscribe({
              next: () => console.log('Logout notificato al backend dopo refresh fallito'),
              error: (e) => console.error('Errore logout backend dopo refresh fallito:', e)
            });
          }

          // ⛔ Pulizia totale del localStorage
          localStorage.removeItem('token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('role');
          localStorage.removeItem('username');
          localStorage.removeItem('guestId');

          // 👉 opzionale: forzare logout frontend o reindirizzamento
          // window.location.href = '/login'; // o router.navigate(['/login'])

          return throwError(() => err);
        })
      );
    } else {
      return this.refreshTokenSubject.pipe(
        filter((token) => token != null),
        take(1),
        switchMap((token) => next.handle(this.addTokenHeader(request, token!)))
      );
    }
  }
}
