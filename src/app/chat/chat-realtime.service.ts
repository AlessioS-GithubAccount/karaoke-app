import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ChatMessage {
  id: string;
  author: string;
  text: string;
  time: number;     // epoch ms
  userId?: number;  // mittente
  toUserId?: number;
}

export interface OnlineUser {
  id: number;
  username: string;
}

@Injectable({ providedIn: 'root' })
export class ChatRealtimeService {
  private socket?: Socket;

  // ===== Presence =====
  private _onlineUsers$ = new BehaviorSubject<OnlineUser[]>([]);
  public onlineUsers$ = this._onlineUsers$.asObservable();

  private _activePeer$ = new BehaviorSubject<OnlineUser | null>(null);
  public activePeer$ = this._activePeer$.asObservable();

  // ===== Messaggi DM =====
  private _dmMessage$ = new Subject<ChatMessage>();      // stream di singoli DM in arrivo
  public dmMessage$ = this._dmMessage$.asObservable();

  connect(): void {
    if (this.socket && this.socket.connected) return;

    const token = localStorage.getItem('token') || '';

    this.socket = io(environment.wsUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      auth: { token },
      extraHeaders: token ? { Authorization: `Bearer ${token}` } : {}
    });

    // ====== Presence ======
    this.socket.on('presence:list', (users: OnlineUser[]) => {
      this._onlineUsers$.next(this.filterOutMe(users));
    });
    this.socket.on('presence:online', (u: OnlineUser) => {
      const list = this._onlineUsers$.value.slice();
      if (!list.find(x => x.id === u.id)) {
        this._onlineUsers$.next(this.filterOutMe([...list, u]));
      }
    });
    this.socket.on('presence:offline', (u: OnlineUser) => {
      const list = this._onlineUsers$.value.filter(x => x.id !== u.id);
      this._onlineUsers$.next(list);
      // se sto chattando con lui, mantengo comunque l’ultima conversazione aperta (solo stato offline in UI)
    });

    // ====== Messaggi / History ======
    this.socket.on('dm:message', (m: any) => {
      this._dmMessage$.next(this.mapMsg(m));
    });

    this.socket.on('dm:history', (arr: any[]) => {
      if (Array.isArray(arr)) {
        for (const m of arr) this._dmMessage$.next(this.mapMsg(m));
      }
    });

    // opzionali: log errori
    this.socket.on('connect_error', (err: any) => {
      console.error('[socket] connect_error', err?.message || err);
    });
    this.socket.on('error', (err: any) => {
      console.error('[socket] error', err?.message || err);
    });

    this.socket.on('connect', () => {
      // all’avvio chiediamo la lista online
      this.socket?.emit('presence:list');
    });
  }

  disconnect(): void {
    if (!this.socket) return;
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = undefined;
  }

  /** Seleziona il peer e apre la stanza DM + richiede history */
  selectPeer(peer: OnlineUser): void {
    this._activePeer$.next(peer);
    this.socket?.emit('dm:open', { peerId: peer.id });
    this.socket?.emit('dm:history', { peerId: peer.id, limit: 50 });
  }

  /** Invia messaggio al peer attivo */
  sendToActive(text: string): void {
    const p = this._activePeer$.value;
    if (!p || !text?.trim()) return;
    this.socket?.emit('dm:send', { peerId: p.id, text });
  }

  // ===== Helpers =====

  private mapMsg(m: any): ChatMessage {
    return {
      id: m?.id ?? (globalThis.crypto?.randomUUID?.() ?? String(Date.now())),
      author: m?.fromName ?? m?.author ?? m?.username ?? 'User',
      text: String(m?.text ?? ''),
      time: typeof m?.time === 'number' ? m.time : Date.now(),
      userId: typeof m?.fromId === 'number' ? m.fromId : (typeof m?.userId === 'number' ? m.userId : undefined),
      toUserId: typeof m?.toId === 'number' ? m.toId : undefined,
    };
  }

  private filterOutMe(list: OnlineUser[]): OnlineUser[] {
    const myId = this.getMyUserId();
    if (!myId) return list;
    return list.filter(u => u.id !== myId);
  }

  private getMyUserId(): number | null {
    try {
      const token = localStorage.getItem('token');
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return typeof payload?.id === 'number' ? payload.id : null;
    } catch {
      return null;
    }
  }
}
