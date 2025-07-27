import { Component, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { NgForm } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent {
  username: string = '';
  password: string = '';
  domandaRecupero: string = '';
  rispostaRecupero: string = '';
  keypass: string = ''; // campo PIN admin

  @ViewChild('registerForm') registerForm!: NgForm;

  constructor(
    private http: HttpClient,
    private router: Router,
    private toastrService: ToastrService,
    private translate: TranslateService
  ) {}

  register() {
    if (!this.username || !this.password || !this.domandaRecupero || !this.rispostaRecupero) {
      this.translate.get(['REGISTER.FILL_REQUIRED_FIELDS', 'toast.ERROR']).subscribe(translations => {
        this.toastrService.error(translations['REGISTER.FILL_REQUIRED_FIELDS'], translations['toast.ERROR']);
      });
      return;
    }

    const payload = {
      username: this.username,
      password: this.password,
      domandaRecupero: this.domandaRecupero,
      rispostaRecupero: this.rispostaRecupero,
      keypass: this.keypass
    };

    this.http.post('http://localhost:3000/api/auth/register', payload).subscribe({
      next: (res: any) => {
        const msgKey = res.message ? 'REGISTER.SUCCESS_ROLE' : 'REGISTER.SUCCESS_DEFAULT';
        this.translate.get([msgKey, 'toast.SUCCESS'], { role: res.message }).subscribe(translations => {
          this.toastrService.success(translations[msgKey], translations['toast.SUCCESS']);
        });

        this.registerForm.resetForm();
        this.router.navigate(['/login']);
      },
      error: (err) => {
        if (err.status === 409) {
          this.translate.get(['REGISTER.USERNAME_TAKEN', 'toast.ERROR']).subscribe(translations => {
            this.toastrService.error(translations['REGISTER.USERNAME_TAKEN'], translations['toast.ERROR']);
          });
        } else if (err.error?.message) {
          this.translate.get([err.error.message, 'toast.ERROR']).subscribe(translations => {
            if (translations[err.error.message] !== err.error.message) {
              this.toastrService.error(translations[err.error.message], translations['toast.ERROR']);
            } else {
              this.translate.get(['REGISTER.ERROR_GENERIC', 'toast.ERROR']).subscribe(fallback => {
                this.toastrService.error(fallback['REGISTER.ERROR_GENERIC'], fallback['toast.ERROR']);
              });
            }
          });
        } else {
          this.translate.get(['REGISTER.ERROR_GENERIC', 'toast.ERROR']).subscribe(translations => {
            this.toastrService.error(translations['REGISTER.ERROR_GENERIC'], translations['toast.ERROR']);
          });
        }
      }
    });
  }
}
