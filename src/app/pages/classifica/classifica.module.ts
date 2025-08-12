import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClassificaComponent } from './classifica.component';
import { RouterModule, Routes } from '@angular/router';  // <--- import router
import { MatDialogModule } from '@angular/material/dialog';
import { ToastrModule } from 'ngx-toastr';
import { TranslateModule } from '@ngx-translate/core';

const routes: Routes = [
  { path: '', component: ClassificaComponent }
];

@NgModule({
  declarations: [ClassificaComponent],
  imports: [
    CommonModule,
    MatDialogModule,
    ToastrModule.forRoot(),
    TranslateModule,
    RouterModule.forChild(routes)  // <--- aggiunto routing interno
  ]
})
export class ClassificaModule {}
