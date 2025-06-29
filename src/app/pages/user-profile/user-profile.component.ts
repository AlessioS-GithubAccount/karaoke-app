import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';


interface Esibizione {
  id: number;
  artista: string;
  canzone: string;
  tonalita: string;
  data_esibizione: string;
  voti: { emoji: string, count: number }[];
}

@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.css']
})
export class UserProfileComponent implements OnInit, OnDestroy {
  username: string | null = null;
  esibizioni: Esibizione[] = [];
  loading = true;
  isLoggedIn = false;
  private loginSub?: Subscription;

  constructor(private http: HttpClient, private authService: AuthService) {}

  ngOnInit(): void {
    this.loginSub = this.authService.isLoggedIn$.subscribe(loggedIn => {
      this.isLoggedIn = loggedIn;

      if (loggedIn) {
        const username = localStorage.getItem('username');
        if (username) {
          this.loading = true;
          this.fetchUserData(username);
        }
      } else {
        this.esibizioni = [];
        this.loading = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.loginSub?.unsubscribe();
  }

  fetchUserData(username: string): void {
    this.http.get<{ id: number }>(`http://localhost:3000/api/users/by-username/${username}`)
      .subscribe({
        next: (user) => {
          this.http.get<Esibizione[]>(`http://localhost:3000/api/esibizioni/user/${user.id}`)
            .subscribe({
              next: (esibizioni) => {
                const votiRequests = esibizioni.map((e) =>
                  this.http.get<{ emoji: string; count: number }[]>(`http://localhost:3000/api/esibizioni/${e.id}/voti`).toPromise()
                );

                Promise.all(votiRequests)
                  .then(results => {
                    this.esibizioni = esibizioni.map((e, i) => ({
                      ...e,
                      voti: results[i] ?? []
                    }));
                    this.loading = false;
                  })
                  .catch(() => this.loading = false);
              },
              error: () => this.loading = false
            });
        },
        error: () => this.loading = false
      });
  }
}
