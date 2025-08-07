import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { MatDialogModule } from '@angular/material/dialog';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';
import { ArchivioMusicaleComponent } from './archivio-musicale.component';


const routes: Routes = [
  { path: '', component: ArchivioMusicaleComponent }
];

@NgModule({
  declarations: [ArchivioMusicaleComponent],
  imports: [  
    RouterModule.forChild(routes),
    CommonModule,
    TranslateModule,
    ToastrModule,
    MatDialogModule,
    FormsModule,
    ReactiveFormsModule
  ]
})
export class ArchivioMusicaleModule { }
