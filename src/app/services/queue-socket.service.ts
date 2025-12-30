import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../environments/environment';

export type QueueChangedEvent = {
  type?: string;
  ts?: number;
  [key: string]: any;
};

@Injectable({ providedIn: 'root' })
export class QueueSocketService {
  private socket?: Socket;
  private changed$ = new Subject<QueueChangedEvent>();

  /** Chiamalo UNA volta (es: AppComponent) */
  connect(): void {
    if (this.socket?.connected) return;
    if (this.socket) return; // già istanziata

    const base = this.getSocketBaseUrl();

    this.socket = io(base, {
      path: '/socket-queue',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      withCredentials: false,
    });

    this.socket.on('connect', () => {
      // console.log('[queue-socket] connected', this.socket?.id);
    });

    this.socket.on('connect_error', (err) => {
      // console.warn('[queue-socket] connect_error', err?.message || err);
    });

    this.socket.on('queue:hello', (_data) => {
      // opzionale
    });

    this.socket.on('queue:changed', (evt: QueueChangedEvent) => {
      this.changed$.next(evt || {});
    });
  }

  disconnect(): void {
    try {
      this.socket?.disconnect();
      this.socket?.removeAllListeners();
    } catch {}
    this.socket = undefined;
  }

  onQueueChanged$(): Observable<QueueChangedEvent> {
    return this.changed$.asObservable();
  }

  private getSocketBaseUrl(): string {
    // caso 1: hai messo environment.socketBaseUrl (consigliato)
    const anyEnv = environment as any;
    if (anyEnv.socketBaseUrl && typeof anyEnv.socketBaseUrl === 'string') {
      return anyEnv.socketBaseUrl;
    }

    // caso 2: deriviamo dall’environment.baseUrl che tu usi per le API
    // es: https://xxx.onrender.com/api  -> https://xxx.onrender.com
    const api = (environment as any).baseUrl as string | undefined;

    // se baseUrl è relativo (/api) o mancante, uso origin corrente
    if (!api || !api.startsWith('http')) {
      return window.location.origin;
    }

    try {
      const u = new URL(api);
      return u.origin;
    } catch {
      return window.location.origin;
    }
  }
}
