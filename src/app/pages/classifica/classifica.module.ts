import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClassificaComponent } from './classifica.component';
import { MatDialogModule } from '@angular/material/dialog';
import { ToastrModule } from 'ngx-toastr';
import { TranslateModule } from '@ngx-translate/core';

@NgModule({
  declarations: [ClassificaComponent],
  imports: [
    CommonModule,
    MatDialogModule,
    ToastrModule.forRoot(),
    TranslateModule
  ]
})
export class ClassificaModule {}
