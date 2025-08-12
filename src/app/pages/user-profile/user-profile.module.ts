import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthGuard } from '../../Authguards/auth.guard';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { UserProfileComponent } from './user-profile.component';
import { PrivacyComponent } from './privacy/privacy.component';
import { ModifyProfileComponent } from './modify-profile/modify-profile.component';

@NgModule({
  declarations: [
    UserProfileComponent,
    PrivacyComponent,
    ModifyProfileComponent
  ],
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule.forChild([
      { path: '', component: UserProfileComponent, canActivate: [AuthGuard] },  // /user-profile
       { 
          path: 'wishlist', 
          loadChildren: () => import('./wishlist/wishlist.module').then(m => m.WishlistModule), 
          canActivate: [AuthGuard] 
        },
        {
          path: 'user-canzoni',
          loadChildren: () => import('./userCanzoni/user-canzoni/user-canzoni.module').then(m => m.UserCanzoniModule),
          canActivate: [AuthGuard]
        },
      { path: 'privacy', component: PrivacyComponent, canActivate: [AuthGuard] }, // /user-profile/privacy
      { path: 'modify-profile', component: ModifyProfileComponent, canActivate: [AuthGuard] }, // /user-profile/modify-profile
    ])
  ]
})
export class UserProfileModule { }
