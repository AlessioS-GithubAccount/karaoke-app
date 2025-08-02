import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-modify-profile',
  templateUrl: './modify-profile.component.html',
  styleUrls: ['./modify-profile.component.css']
})
export class ModifyProfileComponent implements OnInit {
  apiUrl = 'https://karaoke-app-6byu.onrender.com/api';  // aggiornata

  formOldPassword: FormGroup;
  formSecretAnswer: FormGroup;

  errorMessage = '';
  successMessage = '';

  constructor(
    private http: HttpClient,
    private fb: FormBuilder,
    private translate: TranslateService,
    private router: Router,
    private toastr: ToastrService,
    private dialog: MatDialog
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
      this.toastr.error(this.translate.instant('privacy.error_fill_fields'));
      return;
    }

    const payload = this.formOldPassword.value;

    this.http.post(`${this.apiUrl}/user/change-password/by-old`, payload)
      .subscribe({
        next: (res: any) => {
          const msg = res.message || this.translate.instant('privacy.success_password_changed');
          this.toastr.success(msg);
          this.formOldPassword.reset();
        },
        error: (err) => {
          const msg = err.error?.message || this.translate.instant('privacy.error_password_change');
          this.toastr.error(msg);
        }
      });
  }

  changePasswordBySecret() {
    if (this.formSecretAnswer.invalid) {
      this.toastr.error(this.translate.instant('privacy.error_fill_fields'));
      return;
    }

    const payload = this.formSecretAnswer.value;

    this.http.post(`${this.apiUrl}/user/change-password/by-secret`, payload)
      .subscribe({
        next: (res: any) => {
          const msg = res.message || this.translate.instant('privacy.success_password_changed');
          this.toastr.success(msg);
          this.formSecretAnswer.reset();
        },
        error: (err) => {
          const msg = err.error?.message || this.translate.instant('privacy.error_password_change');
          this.toastr.error(msg);
        }
      });
  }

  goBackToProfile() {
    this.router.navigate(['/user-profile']);
  }
}
