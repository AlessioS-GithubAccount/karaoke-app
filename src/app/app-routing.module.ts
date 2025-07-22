import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { LoginComponent } from './AUTH_login/login.component';
import { RegisterComponent } from './AUTH_register/register.component';
import { ForgotPasswordComponent } from './pages/forgot-password/forgot-password.component';
import { PrenotaCanzoniComponent } from './pages/prenota-canzoni/prenota-canzoni.component';
import { ListaCanzoniComponent } from './pages/lista-canzoni/lista-canzoni.component';
import { ClassificaComponent } from './pages/lista-canzoni/classifica/classifica.component';
import { ArchivioMusicaleComponent } from './pages/archivio-musicale/archivio-musicale.component';
import { UserProfileComponent } from './pages/user-profile/user-profile.component';
import { UserCanzoniComponent } from './pages/user-profile/userCanzoni/user-canzoni/user-canzoni.component';
import { HomepageComponent } from './pages/homepage/homepage.component';
import { PrivacyComponent } from './pages/user-profile/privacy/privacy.component';
import { WishlistComponent } from './pages/user-profile/wishlist/wishlist.component';
import { ModifyProfileComponent } from './pages/user-profile/modify-profile/modify-profile.component';

import { AuthGuard } from './Authguards/auth.guard';

const routes: Routes = [
  { path: '', component: HomepageComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'prenota-canzoni', component: PrenotaCanzoniComponent },
  { path: 'lista-canzoni', component: ListaCanzoniComponent },
  { path: 'classifica-top20', component: ClassificaComponent },
  { path: 'archivio-musicale', component: ArchivioMusicaleComponent },
  {path: 'modify-profile', component: ModifyProfileComponent},

  // Pagina profilo principale
  { path: 'user-profile', component: UserProfileComponent, canActivate: [AuthGuard] },

  // Le pagine sotto, ora indipendenti e non più figlie di user-profile
  { path: 'storico', component: UserCanzoniComponent, canActivate: [AuthGuard] },
  { path: 'privacy', component: PrivacyComponent, canActivate: [AuthGuard] },
  { path: 'wishlist', component: WishlistComponent, canActivate: [AuthGuard] },

  { path: '**', redirectTo: '', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
