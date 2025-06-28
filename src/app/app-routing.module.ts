import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { LoginComponent } from './AUTH_login/login.component';
import { RegisterComponent } from './AUTH_register/register.component'; 
import { PrenotaCanzoniComponent } from './pages/prenota-canzoni/prenota-canzoni.component';
import { ListaCanzoniComponent } from './pages/lista-canzoni/lista-canzoni.component';
import { ClassificaComponent } from './pages/lista-canzoni/classifica/classifica.component';
import { ArchivioMusicaleComponent } from './pages/archivio-musicale/archivio-musicale.component';
import { UserProfileComponent } from './pages/user-profile/user-profile.component';
import { HomepageComponent } from './pages/homepage/homepage.component';

import { AuthService } from './services/auth.service';  // Importa la guardia di autenticazione

const routes: Routes = [
  { path: '', component: HomepageComponent },   // Home come root
  { path: 'login', component: LoginComponent },  // Login su /login
  { path: 'register', component: RegisterComponent },
  { path: 'prenota-canzoni', component: PrenotaCanzoniComponent },  
  { path: 'lista-canzoni', component: ListaCanzoniComponent },
  { path: 'classifica-top20', component: ClassificaComponent },
  { path: 'archivio-musicale', component: ArchivioMusicaleComponent },
  { path: 'user-profile', component: UserProfileComponent, canActivate: [AuthService] },  // Protetta da AuthGuard
  { path: '**', redirectTo: '', pathMatch: 'full' }  // redirect a home se rotta sconosciuta
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
