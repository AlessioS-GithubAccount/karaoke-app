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

  constructor(private zone: NgZone) {}

  connect(): void {
    const base = this.getSocketBaseUrl();

    if (this.DEBUG) {
      console.log('[queue-socket] connect() called');
      console.log('[queue-socket] base computed =', base);
    }

    // ✅ se esiste già, esponila comunque per debug
    if (this.socket) {
      (window as any).__queueSocket = this.socket;

      if (this.DEBUG) {
        console.log('[queue-socket] socket already exists. connected=', this.socket.connected);
        console.log('[queue-socket] socket path =', (this.socket.io as any)?.opts?.path);
      }

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
      timeout: 10000,
      withCredentials: false,
      forceNew: true,
    });

    // ✅ ora esiste SEMPRE
    (window as any).__queueSocket = this.socket;

    this.socket.io.on('reconnect_attempt', (n) => {
      if (this.DEBUG) console.log('[queue-socket] reconnect_attempt', n);
    });
    this.socket.io.on('reconnect_error', (e) => {
      if (this.DEBUG) console.warn('[queue-socket] reconnect_error', e);
    });
    this.socket.io.on('error', (e) => {
      if (this.DEBUG) console.warn('[queue-socket] io.error', e);
    });

    this.socket.on('connect', () => {
      console.log('[queue-socket] CONNECT OK id=', this.socket?.id);

      this.socket?.emit('queue:ping', (res: any) => {
        console.log('[queue-socket] PING ACK =>', res);
      });
    });

    this.socket.on('connect_error', (err: any) => {
      console.warn('[queue-socket] CONNECT ERROR =>', err?.message || err);
      if (this.DEBUG) console.warn('[queue-socket] connect_error details =>', err);
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[queue-socket] DISCONNECTED =>', reason);
    });

    this.socket.on('queue:hello', (data) => {
      console.log('[queue-socket] HELLO =>', data);
    });

    this.socket.onAny((event, ...args) => {
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

    const raw =
      (typeof anyEnv.socketBaseUrl === 'string' && anyEnv.socketBaseUrl.trim())
        ? anyEnv.socketBaseUrl.trim()
        : (typeof anyEnv.wsUrl === 'string' && anyEnv.wsUrl.trim())
          ? anyEnv.wsUrl.trim()
          : '';

    if (raw) {
      const normalized = raw.replace(
        /^ws(s)?:\/\//i,
        (_m: string, s?: string) => (s ? 'https://' : 'http://')
      );

      try {
        const u = new URL(normalized);
        return u.origin;
      } catch {}
    }

    const api = (environment as any).baseUrl as string | undefined;
    if (api && api.startsWith('http')) {
      try {
        const u = new URL(api);
        return u.origin;
      } catch {}
    }

    return window.location.origin;
  }
}
