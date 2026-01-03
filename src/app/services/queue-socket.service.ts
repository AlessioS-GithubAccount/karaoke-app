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
    // non ricreare
    if (this.socket) {
      if (this.DEBUG) console.log('[queue-socket] connect() but socket exists. connected=', this.socket.connected);
      if (!this.socket.connected) {
        try { this.socket.connect(); } catch {}
      }

      return;
    }

    const base = this.getSocketBaseUrl();
    const path = (environment as any).queueSocketPath || '/socket.io';
    const url = `${base}/queue`;

    if (this.DEBUG) {
      console.log('[queue-socket] base=', base);
      console.log('[queue-socket] path=', path);
      console.log('[queue-socket] url=', url);
    }

    this.socket = io(url, {
      path,
      transports: ['polling', 'websocket'],
      upgrade: true,

      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
      timeout: 20000,

      withCredentials: false,
      forceNew: true,
    });

    (window as any).__queueSocket = this.socket;

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
      this.socket?.emit('queue:ping', (res: any) => {
        if (this.DEBUG) console.log('[queue-socket] PING ACK =>', res);
      });
    });

    this.socket.on('disconnect', (reason: string) => {
      console.warn('[queue-socket] disconnected reason=', reason);
    });

    this.socket.on('connect_error', (err: any) => {
      console.warn('[queue-socket] connect_error', err?.message || err, err);
    });

    this.socket.on('queue:hello', (data: any) => {
      if (this.DEBUG) console.log('[queue-socket] HELLO =>', data);
    });

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

    let base =
      (typeof anyEnv.socketBaseUrl === 'string' && anyEnv.socketBaseUrl.trim()) ? anyEnv.socketBaseUrl.trim()
      : (typeof anyEnv.wsUrl === 'string' && anyEnv.wsUrl.trim()) ? anyEnv.wsUrl.trim()
      : '';

    if (!base) {
      const api = (anyEnv.baseUrl as string | undefined) || '';
      if (api && api.startsWith('http')) {
        try { base = new URL(api).origin; } catch {}
      }
    }

    if (!base) base = window.location.origin;
    base = base.replace(/\/+$/, '');

    // ✅ fondamentale: socket.io fa handshake HTTP, quindi ws/wss va normalizzato
    if (base.startsWith('wss://')) base = 'https://' + base.slice(6);
    if (base.startsWith('ws://'))  base = 'http://' + base.slice(5);

    return base;
  }
}
