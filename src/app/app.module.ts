import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { AppRoutingModule } from './app-routing.module';
import { FormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { HomeComponent } from './pages/home/home.component';
import { ListaCanzoniComponent } from './pages/lista-canzoni/lista-canzoni.component';

import { KaraokeService } from './services/karaoke.service';

@NgModule({
  declarations: [
    AppComponent,
    HomeComponent,
    ListaCanzoniComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    HttpClientModule
  ],
  providers: [KaraokeService],
  bootstrap: [AppComponent]
})
export class AppModule { }
