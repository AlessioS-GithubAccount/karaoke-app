import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ChatUiService {
  private input$ = new BehaviorSubject<string>('');
  inputValue$ = this.input$.asObservable();

  setInput(v: string) {
    this.input$.next(v);
  }

  clearInput() {
    this.input$.next('');
  }
}
