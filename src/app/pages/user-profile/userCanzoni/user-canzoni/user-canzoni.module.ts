import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserCanzoniComponent } from './user-canzoni.component';
import { HttpClientModule } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { MatDialogModule } from '@angular/material/dialog';
import { ToastrModule } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../../../../Authguards/auth.guard';

const routes: Routes = [
  {
    path: '',
    component: UserCanzoniComponent,
    canActivate: [AuthGuard]
  }
];

@NgModule({
  declarations: [UserCanzoniComponent],
  imports: [
    CommonModule,
    HttpClientModule,
    TranslateModule,
    MatDialogModule,
    ToastrModule.forRoot(),
    FormsModule,
    RouterModule.forChild(routes)  // routing interno
  ]
})
export class UserCanzoniModule {}
