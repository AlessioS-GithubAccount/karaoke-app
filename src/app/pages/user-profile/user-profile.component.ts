import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { HttpClient } from '@angular/common/http';


interface Esibizione {
  esibizione_id: number;
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
  private userSub?: Subscription;

  constructor(private authService: AuthService, private http: HttpClient) {}

  ngOnInit(): void {
    // Ascolta stato login
    this.loginSub = this.authService.isLoggedIn$.subscribe(loggedIn => {
      this.isLoggedIn = loggedIn;
      if (loggedIn) {
        // Se loggato, sottoscrivi l’utente
        this.userSub = this.authService.getUtenteLoggato().subscribe(user => {
          if (user && user.id) {
            this.username = user.username ?? null;  // <-- Assegna qui username
            this.fetchEsibizioni(user.id);
          } else {
            this.username = null;
            this.esibizioni = [];
            this.loading = false;
          }
        });
      } else {
        this.username = null;
        this.esibizioni = [];
        this.loading = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.loginSub?.unsubscribe();
    this.userSub?.unsubscribe();
  }

  private fetchEsibizioni(userId: number): void {
    this.loading = true;
    this.http.get<Esibizione[]>(`http://localhost:3000/api/esibizioni/user/${userId}`).subscribe({
      next: (esibizioni) => {
        const votiRequests = esibizioni.map(e =>
          this.http.get<{ emoji: string; count: number }[]>(`http://localhost:3000/api/esibizioni/${e.esibizione_id}/voti`).toPromise()
            .catch(() => [])  // Gestisci voti assenti o errori come array vuoto
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
      error: () => {
        this.loading = false;
        this.esibizioni = [];
      }
    });
  }
}
