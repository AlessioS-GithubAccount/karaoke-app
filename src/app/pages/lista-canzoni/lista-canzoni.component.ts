import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-lista-canzoni',
  templateUrl: './lista-canzoni.component.html',
  styleUrls: ['./lista-canzoni.component.css']
})
export class ListaCanzoniComponent implements OnInit {
  canzoni: any[] = [];

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.caricaCanzoni();
  }

  caricaCanzoni(): void {
    this.http.get<any[]>('http://localhost:3000/api/canzoni').subscribe({
      next: (data) => {
        this.canzoni = data;
      },
      error: (err) => {
        console.error('Errore nel recupero delle canzoni:', err);
      }
    });
  }
}
