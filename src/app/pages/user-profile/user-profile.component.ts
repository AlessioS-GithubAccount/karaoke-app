import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.css']
})
export class UserProfileComponent implements OnInit, OnDestroy {
  username: string | null = null;
  isLoggedIn = false;

  private loginSub?: Subscription;
  private userSub?: Subscription;

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    // Osserva lo stato di login
    this.loginSub = this.authService.isLoggedIn$.subscribe(loggedIn => {
      this.isLoggedIn = loggedIn;

      if (loggedIn) {
        this.userSub = this.authService.getUtenteLoggato().subscribe(user => {
          this.username = user?.username ?? null;
        });
      } else {
        this.username = null;
      }
    });
  }

  ngOnDestroy(): void {
    this.loginSub?.unsubscribe();
    this.userSub?.unsubscribe();
  }
}
