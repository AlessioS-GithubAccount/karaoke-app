import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

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
export class UserProfileComponent implements OnInit {
  username: string | null = '';
  esibizioni: Esibizione[] = [];
  loading = true;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.username = localStorage.getItem('username');
    if (this.username) {
      this.fetchUserData(this.username);
    } else {
      this.loading = false;
    }
  }

  fetchUserData(username: string): void {
    this.http.get<{ id: number }>(`http://localhost:3000/api/users/by-username/${username}`)
      .subscribe({
        next: (user) => {
          this.http.get<Esibizione[]>(`http://localhost:3000/api/esibizioni/user/${user.id}`)
            .subscribe({
              next: (esibizioni) => {
                const votiRequests = esibizioni.map((e) =>
                  this.http.get<{ emoji: string; count: number }[]>(`http://localhost:3000/api/esibizioni/${e.id}/voti`)
                );

                Promise.all(votiRequests.map(r => r.toPromise()))
                  .then(results => {
                    this.esibizioni = esibizioni.map((e, i) => ({
                      ...e,
                      voti: results[i] ?? []  // ← fallback a array vuoto se undefined
                    }));
                    this.loading = false;
                  });
              },
              error: () => this.loading = false
            });
        },
        error: () => this.loading = false
      });
  }
}
