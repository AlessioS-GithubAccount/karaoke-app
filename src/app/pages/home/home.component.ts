import { Component } from '@angular/core';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent {
  formData = {
    nome: '',
    artista: '',
    canzone: '',
    tonalita: '',
    note: ''
  };

  onSubmit(form: any) {
    console.log('Form inviato:', this.formData);
    // Qui puoi salvare i dati, fare chiamate HTTP, ecc.
  }
}
