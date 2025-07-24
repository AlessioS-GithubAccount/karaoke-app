import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-modify-profile',
  templateUrl: './modify-profile.component.html',
  styleUrls: ['./modify-profile.component.css']
})
export class ModifyProfileComponent implements OnInit {
  apiUrl = 'http://localhost:3000/api';

  formOldPassword: FormGroup;
  formSecretAnswer: FormGroup;

  errorMessage = '';
  successMessage = '';

  constructor(
    private http: HttpClient,
    private fb: FormBuilder,
    private translate: TranslateService, 
    private router: Router
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

  ngOnInit(): void {}

  changePasswordByOld() {
    if (this.formOldPassword.invalid) {
      this.errorMessage = this.translate.instant('privacy.error_fill_fields');
      this.successMessage = '';
      return;
    }

    const payload = this.formOldPassword.value;

    this.http.post(`${this.apiUrl}/user/change-password/by-old`, payload)
      .subscribe({
        next: (res: any) => {
          this.successMessage = res.message || this.translate.instant('privacy.success_password_changed');
          this.errorMessage = '';
          this.formOldPassword.reset();
        },
        error: (err) => {
          this.errorMessage = err.error?.message || this.translate.instant('privacy.error_password_change');
          this.successMessage = '';
        }
      });
  }

  changePasswordBySecret() {
    if (this.formSecretAnswer.invalid) {
      this.errorMessage = this.translate.instant('privacy.error_fill_fields');
      this.successMessage = '';
      return;
    }

    const payload = this.formSecretAnswer.value;

    this.http.post(`${this.apiUrl}/user/change-password/by-secret`, payload)
      .subscribe({
        next: (res: any) => {
          this.successMessage = res.message || this.translate.instant('privacy.success_password_changed');
          this.errorMessage = '';
          this.formSecretAnswer.reset();
        },
        error: (err) => {
          this.errorMessage = err.error?.message || this.translate.instant('privacy.error_password_change');
          this.successMessage = '';
        }
      });
  }

  goBackToProfile() {
  // Logica per tornare al profilo, es. navigare a un'altra route
  this.router.navigate(['/user-profile']);
}
}
