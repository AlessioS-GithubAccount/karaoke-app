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

  private readonly DEBUG = true;

  connect(): void {
    // ✅ se esiste già, non ricrearla
    if (this.socket) {
      if (this.DEBUG) {
        console.log('[queue-socket] connect() called but socket exists. connected=', this.socket.connected);
      }
      // se è stata disconnessa manualmente, prova a riconnettere
      if (!this.socket.connected) {
        try { this.socket.connect(); } catch {}
      }
      return;
    }

    const base = this.getSocketBaseUrl(); // es: https://karaoke-app-6byu.onrender.com
    if (this.DEBUG) console.log('[queue-socket] base=', base);

    // ✅ IMPORTANTISSIMO: path deve combaciare con il backend: path: '/socket-queue'
    this.socket = io(base, {
      path: '/socket-queue',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 50,
      reconnectionDelay: 700,
      timeout: 10000,
      withCredentials: false
    });

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

      // ping test con ack
      this.socket?.emit('queue:ping', (res: any) => {
        if (this.DEBUG) console.log('[queue-socket] PING ACK =>', res);
      });
    });

    this.socket.on('connect_error', (err: any) => {
      console.warn('[queue-socket] CONNECT ERROR =>', err?.message || err);
      if (this.DEBUG) console.warn('[queue-socket] connect_error details =>', err);
    });

    this.socket.on('disconnect', (reason: Socket.DisconnectReason) => {
      if (this.DEBUG) console.warn('[queue-socket] DISCONNECTED =>', reason);
    });

    this.socket.on('queue:hello', (data: any) => {
      if (this.DEBUG) console.log('[queue-socket] HELLO =>', data);
    });

    // noImplicitAny OK
    this.socket.onAny((event: string, ...args: any[]) => {
      if (this.DEBUG) console.log('[queue-socket] onAny =>', event, args);
    });

    // ✅ evento che emetti dal backend: ioQueue.emit('queue:changed', ...)
    this.socket.on('queue:changed', (evt: QueueChangedEvent) => {
      this.zone.run(() => this.changed$.next(evt || {}));
    });
  }

  constructor(private zone: NgZone) {}

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

    // preferisci socketBaseUrl se lo hai
    if (anyEnv.socketBaseUrl && typeof anyEnv.socketBaseUrl === 'string') {
      return anyEnv.socketBaseUrl.replace(/\/+$/, '');
    }
    if (anyEnv.wsUrl && typeof anyEnv.wsUrl === 'string') {
      return anyEnv.wsUrl.replace(/\/+$/, '');
    }

    // fallback: deriva dall'API baseUrl
    const api = (environment as any).baseUrl as string | undefined;
    if (!api || !api.startsWith('http')) return window.location.origin;

    try {
      return new URL(api).origin;
    } catch {
      return window.location.origin;
    }
  }
}
