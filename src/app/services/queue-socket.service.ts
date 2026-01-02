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

  // ✅ DEBUG toggle
  private readonly DEBUG = true;

  constructor(private zone: NgZone) {}

  connect(): void {
    const base = this.getSocketBaseUrl();
    const url = `${base}/queue`; // ✅ namespace /queue

    if (this.DEBUG) {
      console.log('[queue-socket] connect() called');
      console.log('[queue-socket] base computed =', base);
      console.log('[queue-socket] url (namespace) =', url);
    }

    // se esiste già, prova a riconnettere se non è connessa
    if (this.socket) {
      if (this.DEBUG) {
        console.log('[queue-socket] socket already exists. connected=', this.socket.connected);
      }
      if (!this.socket.connected) {
        try {
          this.socket.connect();
        } catch {}
      }
      return;
    }

    // ✅ Con namespace /queue, path torna quello standard /socket.io
    this.socket = io(url, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 50,
      reconnectionDelay: 500,
      timeout: 10000,
      withCredentials: false,
    });

    // utile per test manuali da console: window.__queueSocket
    (window as any).__queueSocket = this.socket;

    // engine-level debug
    this.socket.io.on('reconnect_attempt', (attempt: number) => {
      if (this.DEBUG) console.log('[queue-socket] reconnect_attempt', attempt);
    });

    this.socket.io.on('reconnect_error', (e: unknown) => {
      if (this.DEBUG) console.warn('[queue-socket] reconnect_error', e);
    });

    this.socket.io.on('error', (e: unknown) => {
      if (this.DEBUG) console.warn('[queue-socket] io.error', e);
    });

    this.socket.on('connect', () => {
      console.log('[queue-socket] CONNECT OK id=', this.socket?.id);

      // ✅ ping test con ack
      this.socket?.emit('queue:ping', (res: any) => {
        console.log('[queue-socket] PING ACK =>', res);
      });
    });

    this.socket.on('connect_error', (err: any) => {
      console.warn('[queue-socket] CONNECT ERROR =>', err?.message || err);
      if (this.DEBUG) console.warn('[queue-socket] connect_error details =>', err);
    });

    this.socket.on('disconnect', (reason: Socket.DisconnectReason) => {
      console.warn('[queue-socket] DISCONNECTED =>', reason);
    });

    this.socket.on('queue:hello', (data: any) => {
      console.log('[queue-socket] HELLO =>', data);
    });

    // ✅ FIX noImplicitAny (event tipizzato)
    this.socket.onAny((event: string, ...args: any[]) => {
      if (this.DEBUG) console.log('[queue-socket] onAny =>', event, args);
    });

    this.socket.on('queue:changed', (evt: QueueChangedEvent) => {
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
      return anyEnv.socketBaseUrl.replace(/\/+$/, ''); // no trailing slash
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
