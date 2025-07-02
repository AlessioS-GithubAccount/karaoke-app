import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule, HttpClient } from '@angular/common/http';  // importa HttpClient
import { AppRoutingModule } from './app-routing.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Import ngx-translate core and http loader
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

import { CapitalizeWordsPipe } from './capitalize-words.pipe';

import { AppComponent } from './app.component';
import { PrenotaCanzoniComponent } from './pages/prenota-canzoni/prenota-canzoni.component';
import { ListaCanzoniComponent } from './pages/lista-canzoni/lista-canzoni.component';
import { KaraokeService } from './services/karaoke.service';
import { ClassificaComponent } from './pages/lista-canzoni/classifica/classifica.component';
import { ArchivioMusicaleComponent } from './pages/archivio-musicale/archivio-musicale.component';
import { LoginComponent } from './AUTH_login/login.component';
import { RegisterComponent } from './AUTH_register/register.component';
import { UserProfileComponent } from './pages/user-profile/user-profile.component';
import { HomepageComponent } from './pages/homepage/homepage.component';
import { ForgotPasswordComponent } from './pages/forgot-password/forgot-password.component';
import { UserCanzoniComponent } from './pages/user-profile/userCanzoni/user-canzoni/user-canzoni.component';

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
    UserProfileComponent,
    HomepageComponent,
    ForgotPasswordComponent,
    UserCanzoniComponent  
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    // Aggiungi ngx-translate qui
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient]
      }
    }),
  ],
  providers: [KaraokeService],
  bootstrap: [AppComponent]
})
export class AppModule { }
