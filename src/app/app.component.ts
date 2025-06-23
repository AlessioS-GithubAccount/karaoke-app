import { Component, Renderer2, OnInit } from '@angular/core';
import { NgForm } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  formData = {
    nome: '',
    artista: '',
    canzone: '',
    tonalita: '',
    note: '',
  };

  menuOpen = false; // Stato del burger menu
  darkMode = false; // Stato tema dark/light

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router,
    private renderer: Renderer2
  ) {}

  ngOnInit() {
    const savedMode = localStorage.getItem('darkMode');
    this.darkMode = savedMode === 'true';
    this.updateBodyClass();
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }

  toggleDarkMode() {
    this.darkMode = !this.darkMode;
    localStorage.setItem('darkMode', String(this.darkMode));
    this.updateBodyClass();
  }

  private updateBodyClass() {
    if (this.darkMode) {
      this.renderer.addClass(document.body, 'bg-dark');
      this.renderer.addClass(document.body, 'text-light');
    } else {
      this.renderer.removeClass(document.body, 'bg-dark');
      this.renderer.removeClass(document.body, 'text-light');
    }
  }

  onSubmit(form: NgForm) {
    if (form.valid) {
      this.http.post('http://localhost:3000/api/canzoni', this.formData).subscribe({
        next: (response) => {
          console.log('Dati salvati nel backend:', response);
          alert(`Ciao ${this.formData.nome}, la canzone è in coda! 🎤`);
          form.resetForm();
        },
        error: (err) => {
          console.error('Errore durante l\'invio dei dati', err);
          alert('Errore durante il salvataggio. Riprova.');
        }
      });
    }
  }

  goToLogin(event: Event) {
  event.preventDefault(); // ⛔ blocca comportamento predefinito
  if (this.authService.isLoggedIn()) {
    this.router.navigate(['/user-profile']);
  } else {
    this.router.navigate(['/login']);
  }
  this.menuOpen = false;
}

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
