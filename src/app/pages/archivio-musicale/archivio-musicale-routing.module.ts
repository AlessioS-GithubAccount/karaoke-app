import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ArchivioMusicaleComponent } from './archivio-musicale.component';

const routes: Routes = [
  { path: '', component: ArchivioMusicaleComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ArchivioMusicaleRoutingModule { }
