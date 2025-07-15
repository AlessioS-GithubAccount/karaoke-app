import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { v4 as uuidv4 } from 'uuid';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit, OnDestroy {

  username: string = '';
  password: string = '';

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Applica il tema salvato (se presente)
    const savedTheme = localStorage.getItem('theme'); // può essere 'light' o 'dark'
    
    if (savedTheme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }

  ngOnDestroy(): void {
    // Non rimuove light-mode se fa parte del tema salvato
    // Quindi non serve modificare nulla qui
  }

  login(tipo: 'admin' | 'client' = 'client'): void {
    if (!this.username || !this.password) {
      alert('Per favore compila username e password.');
      return;
    }

    // Se esiste un guest ID precedente, rimuovilo
    if (localStorage.getItem('guestId')) {
      localStorage.removeItem('guestId');
    }

    this.authService.login(this.username, this.password).subscribe({
      next: (res) => {
        if (tipo === 'admin' || res.ruolo === 'admin') {
          this.router.navigate(['/admin']);
        } else {
          this.router.navigate(['/user-profile']);
        }
      },
      error: (err) => {
        alert('Login fallito: ' + (err.error?.message || 'Controlla username e password'));
      }
    });
  }

  loginOspite(): void {
    const guestId = uuidv4();
    localStorage.setItem('guestId', guestId);
    this.router.navigate(['/prenota-canzoni']);
  }
}
