import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { HomeComponent } from './pages/home/home.component';
import { ListaCanzoniComponent } from './pages/lista-canzoni/lista-canzoni.component';
import { ClassificaComponent } from './pages/lista-canzoni/classifica/classifica.component'; 
import { ArchivioMusicaleComponent } from './pages/archivio-musicale/archivio-musicale.component'; 

const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'lista-canzoni', component: ListaCanzoniComponent },
  { path: 'classifica-top20', component: ClassificaComponent }, 
  { path: 'archivio-musicale', component: ArchivioMusicaleComponent },
  { path: '**', redirectTo: '', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
