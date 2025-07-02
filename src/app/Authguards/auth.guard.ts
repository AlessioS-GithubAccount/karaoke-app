import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(private authService: AuthService, private router: Router) {}

    canActivate(): boolean {
    if (this.authService.isLoggedIn() || localStorage.getItem('guestId')) {
        // Sei loggato oppure sei guest, permetti accesso
        return true;
    } else {
        // Non loggato né guest, vai al login
        this.router.navigate(['/login']);
        return false;
    }
    }
}
