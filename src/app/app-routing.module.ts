import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ListaCanzoniComponent } from './pages/lista-canzoni/lista-canzoni.component';
import { HomeComponent } from './pages/home/home.component'; // aggiunto

const routes: Routes = [
  { path: '', component: HomeComponent }, // home come root
  { path: 'lista-canzoni', component: ListaCanzoniComponent },
  { path: '**', redirectTo: '', pathMatch: 'full' } // redirect generico
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
