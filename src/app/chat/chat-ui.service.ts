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
  userId: number;    // mittente (server: userId / fromUserId)
  toUserId?: number; // destinatario (server: to / toUserId)
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

    const token = localStorage.getItem('token') || '';

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
      auth: { token },
      extraHeaders: token ? { Authorization: `Bearer ${token}` } : {}
    });

    this.socket.on('connect', () => {
      // console.log('[ws] connected');
    });

    this.socket.on('connect_error', (err: any) => {
      console.error('[ws] connect_error', err?.message || err);
    });

    this.socket.on('error', (err: any) => {
      console.error('[ws] error', err?.message || err);
    });

    // ===== Presence =====
    // compat: supportiamo sia users:* sia presence:*
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
    this.socket.on('presence:update', (u: OnlineUser & { status?: string }) => {
      const cur = this._onlineUsers.value.slice();
      const i = cur.findIndex(x => x.id === u.id);
      if (i === -1) {
        this._onlineUsers.next([...cur, { id: u.id, username: u.username }]);
      } else {
        cur[i] = { id: u.id, username: u.username };
        this._onlineUsers.next(cur);
      }
    });

    this.socket.on('users:offline', (u: OnlineUser) => {
      this._onlineUsers.next(this._onlineUsers.value.filter(x => x.id !== u.id));
    });
    this.socket.on('presence:remove', (u: OnlineUser) => {
      this._onlineUsers.next(this._onlineUsers.value.filter(x => x.id !== u.id));
    });

    // ===== HISTORY =====
    this.socket.on('chat:dm:history', (payload: { peerId: number; messages: any[] }) => {
      const arr = Array.isArray(payload?.messages) ? payload.messages : [];
      for (const m of arr) {
        const mapped = this.mapIncoming(m);
        if (mapped) this._dmMessage$.next(mapped);
      }
    });
    // globale (se mai usi la stanza globale)
    this.socket.on('chat:history', (arr: any[]) => {
      if (!Array.isArray(arr)) return;
      for (const m of arr) {
        const mapped = this.mapIncoming(m);
        if (mapped) this._dmMessage$.next(mapped);
      }
    });

    // ===== NEW MESSAGES =====
    // 1) evento specifico DM (solo chi ha fatto join della room via chat:dm:open)
    this.socket.on('chat:dm:message', (m: any) => {
      const mapped = this.mapIncoming(m);
      if (mapped) this._dmMessage$.next(mapped);
    });

    // 2) evento generico che il server invia sempre ai socket dei 2 utenti
    this.socket.on('chat:message', (m: any) => {
      const mapped = this.mapIncoming(m);
      if (mapped) this._dmMessage$.next(mapped);
    });
  }

  selectPeer(u: OnlineUser): void {
    this._activePeer.next(u);
    if (!this.socket?.connected) return;
    // join room DM + ricevi history DM
    this.socket.emit('chat:dm:open', { peerId: u.id });
  }

  sendToActive(text: string): void {
    const peer = this._activePeer.value;
    if (!peer || !this.socket?.connected) return;
    this.socket.emit('chat:dm:send', { to: peer.id, text });
    // niente eco locale qui: il component lo aggiunge per UX istantanea
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = undefined;
  }

  // ===== helpers =====
  private mapIncoming(m: any): ChatMessage | null {
    if (!m) return null;

    const fromUserId =
      m?.fromUserId != null ? Number(m.fromUserId) :
      m?.userId     != null ? Number(m.userId)     : 0;

    const toUserId =
      m?.toUserId   != null ? Number(m.toUserId)   :
      m?.to         != null ? Number(m.to)         : undefined;

    if (!fromUserId) return null;

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
