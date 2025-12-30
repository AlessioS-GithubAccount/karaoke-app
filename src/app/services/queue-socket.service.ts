import { Injectable, NgZone } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Subject, Subscription, timer } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class QueueSocketService {
  private socket: Socket | null = null;

  // Notifica quando il server dice "queue cambiata"
  private changed$ = new Subject<{ type?: string; ts?: number; [k: string]: any }>();

  // Stato connessione
  private connected$ = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpClient, private zone: NgZone) {}

  /** URL base API (uguale a quello che usi nel resto dell'app) */
  private apiBase(): string {
    // Se hai già un environment.ts, usa quello.
    // Qui metto fallback:
    return (window as any).__API_BASE__ || 'http://localhost:3000';
  }

  /** Connette la socket pubblica queue */
  connect(): void {
    if (this.socket) return;

    const base = this.apiBase();

    this.socket = io(base, {
      path: '/socket-queue',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 8000
    });

    this.socket.on('connect', () => {
      this.zone.run(() => this.connected$.next(true));
    });

    this.socket.on('disconnect', () => {
      this.zone.run(() => this.connected$.next(false));
    });

    this.socket.on('connect_error', () => {
      // niente crash, solo stato false
      this.zone.run(() => this.connected$.next(false));
    });

    this.socket.on('queue:hello', (data) => {
      // opzionale: debug
      // console.log('[queue] hello', data);
    });

    this.socket.on('queue:changed', (payload) => {
      this.zone.run(() => this.changed$.next(payload || {}));
    });
  }

  disconnect(): void {
    if (!this.socket) return;
    try {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    } catch {}
    this.socket = null;
    this.connected$.next(false);
  }

  onChanged() {
    return this.changed$.asObservable();
  }

  isConnected() {
    return this.connected$.asObservable();
  }

  /** Helper: ricarica la queue via HTTP */
  fetchQueue() {
    return this.http.get<any[]>(`${this.apiBase()}/api/canzoni`);
  }
}
