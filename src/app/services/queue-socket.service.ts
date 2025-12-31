import { Injectable, NgZone } from '@angular/core';
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

  constructor(private zone: NgZone) {}

  connect(): void {
    const base = this.getSocketBaseUrl();

    // ✅ se esiste già, prova a riconnettere se non è connessa
    if (this.socket) {
      if (!this.socket.connected) this.socket.connect();
      return;
    }

    this.socket = io(base, {
      path: '/socket-queue',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 50,
      reconnectionDelay: 500,
      withCredentials: false,
    });

    this.socket.on('connect', () => {
      console.log('[queue-socket] connected', this.socket?.id, 'base=', base);
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[queue-socket] connect_error', err?.message || err);
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[queue-socket] disconnected', reason);
    });

    this.socket.on('queue:hello', (data) => {
      console.log('[queue-socket] hello', data);
    });

    this.socket.on('queue:changed', (evt: QueueChangedEvent) => {
      // ✅ IMPORTANTISSIMO: rientra nella zone Angular
      this.zone.run(() => this.changed$.next(evt || {}));
    });
  }

  disconnect(): void {
    try {
      this.socket?.removeAllListeners();
      this.socket?.disconnect();
    } catch {}
    this.socket = undefined;
  }

  onQueueChanged$(): Observable<QueueChangedEvent> {
    return this.changed$.asObservable();
  }

  private getSocketBaseUrl(): string {
    const anyEnv = environment as any;

    if (anyEnv.socketBaseUrl && typeof anyEnv.socketBaseUrl === 'string') {
      return anyEnv.socketBaseUrl;
    }

    const api = (environment as any).baseUrl as string | undefined;
    if (!api || !api.startsWith('http')) return window.location.origin;

    try {
      const u = new URL(api);
      return u.origin;
    } catch {
      return window.location.origin;
    }
  }
}
