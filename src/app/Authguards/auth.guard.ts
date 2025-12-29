import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(private authService: AuthService, private router: Router) {}

  canActivate(): boolean {
    // Permette accesso a user/admin autenticati o a guest (guest_token o guestId legacy)
    if (this.authService.canPartecipate()) {
      return true;
    } else {
      this.router.navigate(['/login']);
      return false;
    }
  }
}
