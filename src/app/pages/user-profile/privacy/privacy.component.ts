import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-privacy',
  templateUrl: './privacy.component.html',
  styleUrls: ['./privacy.component.css']
})
export class PrivacyComponent implements OnInit {
  apiUrl = 'https://karaoke-app-6byu.onrender.com/api';  // aggiornato
  userData: any = null;
  errorMessage = '';
  successMessage = '';
  translatedSecretQuestion: string = '';

  formOldPassword: FormGroup;
  formSecretAnswer: FormGroup;

  constructor(
    private http: HttpClient,
    private fb: FormBuilder,
    private authService: AuthService,
    private translate: TranslateService
  ) {
    this.formOldPassword = this.fb.group({
      vecchiaPassword: ['', Validators.required],
      nuovaPassword: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.formSecretAnswer = this.fb.group({
      risposta: ['', Validators.required],
      nuovaPassword: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit(): void {
    this.loadUserProfile();
  }

  loadUserProfile() {
    this.http.get(`${this.apiUrl}/user/profile`)
      .subscribe({
        next: (data: any) => {
          this.userData = data;
          this.errorMessage = '';

          if (this.userData && this.userData.domanda_recupero) {
            this.translate.get(`privacy.secret_questions.${this.userData.domanda_recupero}`)
              .subscribe(translated => {
                this.translatedSecretQuestion = translated;
              });
          }
        },
        error: (err) => {
          this.errorMessage = err.error?.message || 'Errore nel caricamento dati utente';
          this.userData = null;
        }
      });
  }

  changePasswordByOld() {
    if (this.formOldPassword.invalid) {
      this.errorMessage = 'Compila tutti i campi correttamente.';
      this.successMessage = '';
      return;
    }
    const payload = this.formOldPassword.value;

    this.http.post(`${this.apiUrl}/user/change-password/by-old`, payload)
      .subscribe({
        next: (res: any) => {
          this.successMessage = res.message || 'Password cambiata con successo';
          this.errorMessage = '';
          this.formOldPassword.reset();
        },
        error: (err) => {
          this.errorMessage = err.error?.message || 'Errore durante il cambio password';
          this.successMessage = '';
        }
      });
  }

  changePasswordBySecret() {
    if (this.formSecretAnswer.invalid) {
      this.errorMessage = 'Compila tutti i campi correttamente.';
      this.successMessage = '';
      return;
    }
    const payload = this.formSecretAnswer.value;

    this.http.post(`${this.apiUrl}/user/change-password/by-secret`, payload)
      .subscribe({
        next: (res: any) => {
          this.successMessage = res.message || 'Password cambiata con successo';
          this.errorMessage = '';
          this.formSecretAnswer.reset();
        },
        error: (err) => {
          this.errorMessage = err.error?.message || 'Errore durante il cambio password';
          this.successMessage = '';
        }
      });
  }
}
