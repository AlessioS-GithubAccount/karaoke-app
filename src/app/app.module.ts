import { NgModule, isDevMode } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule, HttpClient, HTTP_INTERCEPTORS } from '@angular/common/http';
import { AppRoutingModule } from './app-routing.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// ngx-translate
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

import { CapitalizeWordsPipe } from './capitalize-words.pipe';

import { ToastrModule } from 'ngx-toastr';

import { AppComponent } from './app.component';
import { PrenotaCanzoniComponent } from './pages/prenota-canzoni/prenota-canzoni.component';
import { KaraokeService } from './services/karaoke.service';
import { LoginComponent } from './AUTH_login/login.component';
import { RegisterComponent } from './AUTH_register/register.component';
import { HomepageComponent } from './pages/homepage/homepage.component';
import { ForgotPasswordComponent } from './pages/forgot-password/forgot-password.component';

// Angular CDK / Animations / Material
import { DragDropModule } from '@angular/cdk/drag-drop';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialogModule } from '@angular/material/dialog';

// Interceptor
import { TokenInterceptor } from './Authguards/Interceptor';
import { ConfirmDialogComponent } from './shared/confirm-dialog/confirm-dialog.component';

// Service Worker
import { ServiceWorkerModule } from '@angular/service-worker';

// Factory per i18n http loader
export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, './assets/i18n/', '.json');
}

@NgModule({
  declarations: [
    AppComponent,
    CapitalizeWordsPipe,
    PrenotaCanzoniComponent,
    LoginComponent,
    RegisterComponent,
    HomepageComponent,
    ForgotPasswordComponent,
    ConfirmDialogComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    MatDialogModule,
    DragDropModule,

    // ngx-translate
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient]
      }
    }),

    ToastrModule.forRoot({
      positionClass: 'toast-center-bottom', // se vuoi standard: 'toast-bottom-center'
      timeOut: 5000,
      progressBar: true,
      closeButton: false,
      preventDuplicates: true,
    }),

    // Service Worker: registra SUBITO in produzione
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerImmediately'
    }),
  ],
  providers: [
    KaraokeService,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: TokenInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
