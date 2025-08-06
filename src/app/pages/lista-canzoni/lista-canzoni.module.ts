import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ListaCanzoniComponent } from './lista-canzoni.component';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  { path: '', component: ListaCanzoniComponent }
];

@NgModule({
  declarations: [ListaCanzoniComponent],
  imports: [
    RouterModule.forChild(routes),
    CommonModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule
  ]
})
export class ListaCanzoniModule {}
