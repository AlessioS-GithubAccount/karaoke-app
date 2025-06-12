import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { HomeComponent } from './pages/home/home.component';
import { ListaCanzoniComponent } from './pages/lista-canzoni/lista-canzoni.component';
import { ClassificaComponent } from './pages/lista-canzoni/classifica/classifica.component'; // 👈 Import nuovo componente

const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'lista-canzoni', component: ListaCanzoniComponent },
  { path: 'classifica-top20', component: ClassificaComponent }, // 👈 Nuova rotta
  { path: '**', redirectTo: '', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
