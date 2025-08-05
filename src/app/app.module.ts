import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule, HttpClient, HTTP_INTERCEPTORS } from '@angular/common/http';  // importa anche HTTP_INTERCEPTORS
import { AppRoutingModule } from './app-routing.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Import ngx-translate core and http loader
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

import { CapitalizeWordsPipe } from './capitalize-words.pipe';

import { ToastrModule } from 'ngx-toastr';

import { AppComponent } from './app.component';
import { PrenotaCanzoniComponent } from './pages/prenota-canzoni/prenota-canzoni.component';
import { ListaCanzoniComponent } from './pages/lista-canzoni/lista-canzoni.component';
import { KaraokeService } from './services/karaoke.service';
import { ClassificaComponent } from './pages/lista-canzoni/classifica/classifica.component';
import { ArchivioMusicaleComponent } from './pages/archivio-musicale/archivio-musicale.component';
import { LoginComponent } from './AUTH_login/login.component';
import { RegisterComponent } from './AUTH_register/register.component';
import { HomepageComponent } from './pages/homepage/homepage.component';
import { ForgotPasswordComponent } from './pages/forgot-password/forgot-password.component';

// Import DragDropModule from Angular CDK
import { DragDropModule } from '@angular/cdk/drag-drop';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';


// Import dell'interceptor
import { TokenInterceptor  } from './Authguards/Interceptor';
import { ConfirmDialogComponent } from './shared/confirm-dialog/confirm-dialog.component';  
import { MatDialogModule } from '@angular/material/dialog';

// Factory function per HttpLoader
export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, './assets/i18n/', '.json');
}

@NgModule({
  declarations: [
    AppComponent,
    CapitalizeWordsPipe,
    PrenotaCanzoniComponent,
    ListaCanzoniComponent,
    ClassificaComponent,
    ArchivioMusicaleComponent,
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
    // ngx-translate module
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient]
      }
    }),
     ToastrModule.forRoot({
      positionClass: 'toast-center-bottom', // puoi cambiare posizione
      timeOut: 5000,
      progressBar: true,
      closeButton: false,
      preventDuplicates: true,
    }),
  ],
  providers: [
    KaraokeService,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: TokenInterceptor ,
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
