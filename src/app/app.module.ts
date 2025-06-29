import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { AppRoutingModule } from './app-routing.module';
import { FormsModule } from '@angular/forms';
import { CapitalizeWordsPipe } from './capitalize-words.pipe';
import { ReactiveFormsModule } from '@angular/forms';

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
    ForgotPasswordComponent  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    HttpClientModule,
    ReactiveFormsModule
  ],
  providers: [KaraokeService],
  bootstrap: [AppComponent]
})
export class AppModule { }
