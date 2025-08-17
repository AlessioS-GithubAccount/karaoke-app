import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { v4 as uuidv4 } from 'uuid';
import { ToastrService } from 'ngx-toastr';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {

  username: string = '';
  password: string = '';
  isLoading: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private toastr: ToastrService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    // Rimosso codice di gestione tema
  }

  login(tipo: 'admin' | 'client' = 'client'): void {
    if (!this.username || !this.password) {
      this.translate.get(['toast.loginError', 'toast.ERROR']).subscribe(translations => {
        this.toastr.error(translations['toast.loginError'], translations['toast.ERROR']);
      });
      return;
    }

    if (localStorage.getItem('guestId')) {
      localStorage.removeItem('guestId');
    }

    this.isLoading = true;

    this.authService.login(this.username, this.password).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.translate.get(['toast.loginSuccess', 'toast.SUCCESS']).subscribe(translations => {
          this.toastr.success(translations['toast.loginSuccess'], translations['toast.SUCCESS']);
        });

        if (tipo === 'admin' || res.ruolo === 'admin') {
          this.router.navigate(['/admin']);
        } else {
          this.router.navigate(['/user-profile']);
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.translate.get(['toast.loginError', 'toast.ERROR']).subscribe(translations => {
          this.toastr.error(translations['toast.loginError'], translations['toast.ERROR']);
        });
      }
    });
  }

  loginOspite(): void {
    const guestId = uuidv4();
    localStorage.setItem('guestId', guestId);

    this.translate.get(['toast.loginGuest', 'toast.INFO']).subscribe(translations => {
      this.toastr.info(translations['toast.loginGuest'], translations['toast.INFO']);
    });

    this.router.navigate(['/prenota-canzoni']);
  }
}
