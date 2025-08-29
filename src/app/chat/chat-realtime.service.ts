import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface OnlineUser { id: number; username: string; }

export interface ChatMessage {
  id: string;
  author: string;
  text: string;
  time: number;      // epoch ms
  userId: number;    // mittente
  toUserId?: number; // destinatario (solo per DM)
}

@Injectable({ providedIn: 'root' })
export class ChatRealtimeService {
  private socket?: Socket;
  private myUserId: number | null = null;

  // Presence (lista peers online)
  private _onlineUsers = new BehaviorSubject<OnlineUser[]>([]);
  public onlineUsers$ = this._onlineUsers.asObservable();

  // Peer attivo corrente (selezionato nella UI)
  private _activePeer = new BehaviorSubject<OnlineUser | null>(null);
  public activePeer$ = this._activePeer.asObservable();

  // Stream dei messaggi DM (sia history che live)
  private _dmMessage$ = new Subject<ChatMessage>();
  public dmMessage$ = this._dmMessage$.asObservable();

  connect(): void {
    if (this.socket?.connected) return;

    // Prendo il token e tolgo un eventuale prefisso "Bearer "
    const raw = localStorage.getItem('token') || '';
    const token = raw.replace(/^Bearer\s+/i, '');

    // ricavo il mio userId dal JWT (se presente)
    try {
      const payload = JSON.parse(atob((token.split('.')[1] || '')));
      this.myUserId = typeof payload?.id === 'number' ? payload.id : null;
    } catch {
      this.myUserId = null;
    }

    this.socket = io(environment.wsUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      auth: { token } // token nudo, senza "Bearer"
      // NB: extraHeaders in browser sono ignorati
    });

    this.socket.on('connect', () => {
      this.socket?.emit('presence:get');
    });

    this.socket.on('connect_error', (err: any) => {
      console.error('[ws] connect_error', err?.message || err);
    });

    this.socket.on('error', (err: any) => {
      console.error('[ws] error', err?.message || err);
    });

    // ===== Presence =====
    this.socket.on('users:list', (list: OnlineUser[]) => {
      this._onlineUsers.next(Array.isArray(list) ? list : []);
    });
    this.socket.on('presence:list', (list: OnlineUser[]) => {
      this._onlineUsers.next(Array.isArray(list) ? list : []);
    });
    this.socket.on('users:online', (u: OnlineUser) => {
      const cur = this._onlineUsers.value;
      if (!cur.find(x => x.id === u.id)) {
        this._onlineUsers.next([...cur, u]);
      }
    });
    this.socket.on('users:offline', (u: OnlineUser) => {
      this._onlineUsers.next(this._onlineUsers.value.filter(x => x.id !== u.id));
    });
    this.socket.on('presence:update', (u: OnlineUser & { status?: string }) => {
      const cur = this._onlineUsers.value.slice();
      const idx = cur.findIndex(x => x.id === u.id);
      if (idx >= 0) cur[idx] = { id: u.id, username: u.username };
      else cur.push({ id: u.id, username: u.username });
      this._onlineUsers.next(cur);
    });
    this.socket.on('presence:remove', (u: { id: number }) => {
      this._onlineUsers.next(this._onlineUsers.value.filter(x => x.id !== u.id));
    });

    // ===== DM: history =====
    this.socket.on('chat:dm:history', (payload: { peerId: number; messages: any[] }) => {
      const arr = Array.isArray(payload?.messages) ? payload.messages : [];
      for (const m of arr) {
        const mapped = this.mapIncoming(m);
        if (mapped) this._dmMessage$.next(mapped);
      }
    });

    // ===== Ascolta SOLO questo per i nuovi messaggi =====
    this.socket.on('chat:message', (m: any) => {
      const mapped = this.mapIncoming(m);
      if (mapped) this._dmMessage$.next(mapped);
    });

    // IMPORTANTE: non ascoltare 'chat:dm:message' per evitare duplicati
    // this.socket.on('chat:dm:message', ...)  // RIMOSSO
  }

  selectPeer(u: OnlineUser): void {
    this._activePeer.next(u);
    if (!this.socket?.connected) return;
    this.socket.emit('chat:dm:open', { peerId: u.id });
  }

  sendToActive(text: string): void {
    const peer = this._activePeer.value;
    if (!peer || !this.socket?.connected) return;
    // Il server ascolta 'chat:send'
    this.socket.emit('chat:send', { to: peer.id, text });
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = undefined;
  }

  // ===== helpers =====
  private mapIncoming(m: any): ChatMessage | null {
    if (!m) return null;

    const fromUserId = Number(
      m?.fromUserId ??
      m?.userId ?? 0
    );

    const toUserId =
      m?.toUserId != null
        ? Number(m.toUserId)
        : (typeof m?.to === 'number' ? Number(m.to) : undefined);

    return {
      id: String(m?.id ?? (globalThis.crypto?.randomUUID?.() ?? Date.now())),
      author: String(m?.author ?? ''),
      text: String(m?.text ?? ''),
      time: Number(m?.time ?? Date.now()),
      userId: fromUserId,
      toUserId
    };
    }
}
