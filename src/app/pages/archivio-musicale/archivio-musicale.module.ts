import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ArchivioMusicaleComponent } from './archivio-musicale.component'; 
import { RouterModule, Routes } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

const routes: Routes = [
  { path: '', component: ArchivioMusicaleComponent }
];

@NgModule({
  imports: [  
    RouterModule.forChild(routes),
    CommonModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
  ]
})
export class ArchivioMusicaleModule { }
