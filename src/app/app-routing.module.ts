import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { LoginComponent } from './AUTH_login/login.component';
import { RegisterComponent } from './AUTH_register/register.component';
import { ForgotPasswordComponent } from './pages/forgot-password/forgot-password.component';
import { PrenotaCanzoniComponent } from './pages/prenota-canzoni/prenota-canzoni.component';
import { ListaCanzoniComponent } from './pages/lista-canzoni/lista-canzoni.component';
import { ClassificaComponent } from './pages/classifica/classifica.component';
import { HomepageComponent } from './pages/homepage/homepage.component';
import { ModifyProfileComponent } from './pages/user-profile/modify-profile/modify-profile.component';

import { AuthGuard } from './Authguards/auth.guard';

const routes: Routes = [
  { path: '', component: HomepageComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'prenota-canzoni', component: PrenotaCanzoniComponent },
  { path: 'classifica-top20', component: ClassificaComponent },

  // Pagina profilo principale
  { 
    path: 'user-profile', 
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/user-profile/user-profile.module').then(m => m.UserProfileModule)
  },

  {
    path: 'lista-canzoni',
    loadChildren: () =>
      import('./pages/lista-canzoni/lista-canzoni.module').then(m => m.ListaCanzoniModule)
  },

  {
    path: 'archivio-musicale',
    loadChildren: () => import('./pages/archivio-musicale/archivio-musicale.module').then(m => m.ArchivioMusicaleModule)
  },

  { path: '**', redirectTo: '', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
