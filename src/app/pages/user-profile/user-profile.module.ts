import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthGuard } from '../../Authguards/auth.guard';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { UserProfileComponent } from './user-profile.component';
import { UserCanzoniComponent } from './userCanzoni/user-canzoni/user-canzoni.component';
import { PrivacyComponent } from './privacy/privacy.component';
import { WishlistComponent } from './wishlist/wishlist.component';
import { ModifyProfileComponent } from './modify-profile/modify-profile.component';

@NgModule({
  declarations: [
    UserProfileComponent,
    UserCanzoniComponent,
    PrivacyComponent,
    WishlistComponent,
    ModifyProfileComponent
  ],
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule.forChild([
      { path: '', component: UserProfileComponent, canActivate: [AuthGuard] },  // /user-profile
      { path: 'storico', component: UserCanzoniComponent, canActivate: [AuthGuard] }, // /user-profile/storico
      { path: 'privacy', component: PrivacyComponent, canActivate: [AuthGuard] }, // /user-profile/privacy
      { path: 'wishlist', component: WishlistComponent, canActivate: [AuthGuard] }, // /user-profile/wishlist
      { path: 'modify-profile', component: ModifyProfileComponent, canActivate: [AuthGuard] }, // /user-profile/modify-profile
    ])
  ]
})
export class UserProfileModule { }
