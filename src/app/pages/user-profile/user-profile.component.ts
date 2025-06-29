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
  username: string | null = null;
  esibizioni: Esibizione[] = [];
  loading = true;
  isLoggedIn = false;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    const token = localStorage.getItem('token');
    const isGuest = sessionStorage.getItem('guestId');
    this.username = localStorage.getItem('username');
    const role = localStorage.getItem('role');

    this.isLoggedIn = ( !!token && (role === 'user' || role === 'admin') ) || !!isGuest;

    if (this.isLoggedIn && this.username) {
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
                  this.http.get<{ emoji: string; count: number }[]>(`http://localhost:3000/api/esibizioni/${e.id}/voti`).toPromise()
                );

                Promise.all(votiRequests)
                  .then(results => {
                    this.esibizioni = esibizioni.map((e, i) => ({
                      ...e,
                      voti: results[i] ?? []
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
