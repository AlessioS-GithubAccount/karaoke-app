import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { ChatComponent } from './chat.component';

const routes: Routes = [
  // ⚠️ niente guard qui: vogliamo mostrare il "gate" dentro il componente
  { path: '', component: ChatComponent }
];

@NgModule({
  declarations: [ChatComponent],
  imports: [
    CommonModule,
    FormsModule,          // necessario per [(ngModel)]
    RouterModule.forChild(routes),
  ],
})
export class ChatModule {}
