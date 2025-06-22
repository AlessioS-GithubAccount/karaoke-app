import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { LoginComponent } from './AUTH_login/login.component';
import { RegisterComponent } from './AUTH_register/register.component'; 
import { PrenotaCanzoniComponent } from './pages/prenota-canzoni/prenota-canzoni.component';
import { ListaCanzoniComponent } from './pages/lista-canzoni/lista-canzoni.component';
import { ClassificaComponent } from './pages/lista-canzoni/classifica/classifica.component';
import { ArchivioMusicaleComponent } from './pages/archivio-musicale/archivio-musicale.component';
import { UserProfileComponent } from './pages/user-profile/user-profile.component';  // <-- importa

const routes: Routes = [
  { path: '', component: LoginComponent }, 
  { path: 'register', component: RegisterComponent },
  { path: 'prenota-canzoni', component: PrenotaCanzoniComponent },  
  { path: 'lista-canzoni', component: ListaCanzoniComponent },
  { path: 'classifica-top20', component: ClassificaComponent },
  { path: 'archivio-musicale', component: ArchivioMusicaleComponent },
  { path: 'user-profile', component: UserProfileComponent },  
  { path: '**', redirectTo: '', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
