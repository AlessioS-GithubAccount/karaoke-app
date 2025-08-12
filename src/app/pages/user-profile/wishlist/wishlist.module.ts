import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WishlistComponent } from './wishlist.component';
import { AuthGuard } from '../../../Authguards/auth.guard';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { MatDialogModule } from '@angular/material/dialog';
import { ToastrModule } from 'ngx-toastr';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    component: WishlistComponent,
    canActivate: [AuthGuard]
  }
];

@NgModule({
  declarations: [WishlistComponent],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatDialogModule,
    ToastrModule,
    RouterModule.forChild(routes)  // qui il routing interno
  ]
})
export class WishlistModule {}
