import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface OnlineUser { id: number; username: string; }

export interface ChatMessage {
  id: string;
  clientId?: string;
  author: string;
  text: string;
  time: number;        // epoch ms
  userId: number;      // mittente
  toUserId?: number;   // destinatario (solo per DM)
}

type JwtPayload = { id?: number | string; ruolo?: string; username?: string; [k: string]: any };

@Injectable({ providedIn: 'root' })
export class ChatRealtimeService {
  // ===== Config presenza =====
  private readonly PRESENCE_TTL_MS = 60 * 60 * 1000; // 1 ora
  private readonly CHECK_INTERVAL_MS = 15 * 1000;    // ogni 15s ricontrollo

  private socket?: Socket;
  private myUserId: number | null = null;

  // Dedup messaggi by message-id
  private seenIds = new Set<string>();

  // Presence (lista peers online)
  private _onlineUsers = new BehaviorSubject<OnlineUser[]>([]);
  public  onlineUsers$ = this._onlineUsers.asObservable();

  // Peer attivo corrente (selezionato nella UI)
  private _activePeer = new BehaviorSubject<OnlineUser | null>(null);
  public  activePeer$ = this._activePeer.asObservable();

  // Stream dei messaggi DM (sia history che live)
  private _dmMessage$ = new Subject<ChatMessage>();
  public  dmMessage$ = this._dmMessage$.asObservable();

  // === UNREAD ===
  private _unreadByPeer = new BehaviorSubject<Map<number, number>>(new Map());
  public  unreadByPeer$ = this._unreadByPeer.asObservable();

  private _totalUnread = new BehaviorSubject<number>(0);
  public  totalUnread$ = this._totalUnread.asObservable();

  // === MANUAL OFFLINE (toggle utente) ===
  private _manualOffline = new BehaviorSubject<boolean>(this.readManualOffline());
  public  manualOffline$ = this._manualOffline.asObservable();
  get manualOffline(): boolean { return this._manualOffline.value; }

  // Presence manager
  private presenceTimer: number | null = null;
  private presenceInited = false;

  // ✅ ref-count start/stop (così AppComponent + ChatComponent non si pestano)
  private startCount = 0;
  private get started(): boolean { return this.startCount > 0; }

  // Unload hooks
  private unloadHooksInstalled = false;
  private readonly onBeforeUnload = () => {
    try { localStorage.setItem('presence.lastActivity', String(Date.now())); } catch {}
  };
  private readonly onPageHide = () => {
    try { localStorage.setItem('presence.lastActivity', String(Date.now())); } catch {}
  };
  private readonly onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      try { localStorage.setItem('presence.lastActivity', String(Date.now())); } catch {}
    } else {
      this.touchActivity();
    }
  };

  constructor() {}

  // ===========================
  // PUBLIC START/STOP
  // ===========================

  /**
   * Avvia chat+presence. Chiamalo SOLO per user/admin (mai per guest/anon).
   * Safe se chiamato più volte: usa ref-count.
   */
  start(): void {
    this.startCount++;
    if (this.startCount > 1) return;

    this.installUnloadHooks();
    this.initPresenceManager();
    this.touchActivity();
    this.ensureConnected();
  }

  /** Ferma tutto (ref-count). Chiude davvero solo quando startCount torna a 0. */
  stop(): void {
    this.startCount = Math.max(0, this.startCount - 1);
    if (this.startCount > 0) return;

    this.teardownPresenceManager();
    this.disconnect();
    this.uninstallUnloadHooks();
  }

  // ===========================
  // PRESENZA / ATTIVITÀ
  // ===========================

  touchActivity(): void {
    try { localStorage.setItem('presence.lastActivity', String(Date.now())); } catch {}
    if (!this.started) return;
    if (!this.manualOffline) this.ensureConnected();
  }

  private installUnloadHooks(): void {
    if (this.unloadHooksInstalled) return;
    this.unloadHooksInstalled = true;

    window.addEventListener('beforeunload', this.onBeforeUnload);
    window.addEventListener('pagehide', this.onPageHide);
    document.addEventListener('visibilitychange', this.onVisibilityChange as any, { passive: true as any });
  }

  private uninstallUnloadHooks(): void {
    if (!this.unloadHooksInstalled) return;
    this.unloadHooksInstalled = false;

    window.removeEventListener('beforeunload', this.onBeforeUnload);
    window.removeEventListener('pagehide', this.onPageHide);
    document.removeEventListener('visibilitychange', this.onVisibilityChange as any);
  }

  private initPresenceManager(): void {
    if (this.presenceInited) return;
    this.presenceInited = true;

    this.evaluatePresence();
    window.addEventListener('storage', this.onStorageActivity);
    this.presenceTimer = window.setInterval(() => this.evaluatePresence(), this.CHECK_INTERVAL_MS);
  }

  private teardownPresenceManager(): void {
    if (!this.presenceInited) return;
    this.presenceInited = false;

    window.removeEventListener('storage', this.onStorageActivity);
    if (this.presenceTimer != null) {
      window.clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }
  }

  setManualOffline(off: boolean): void {
    try { localStorage.setItem('presence.manualOffline', off ? '1' : '0'); } catch {}
    this._manualOffline.next(off);

    if (!this.started) return;

    if (off) {
      try { this.socket?.emit('presence:manual', { off: true }); } catch {}
      this.disconnect();
    } else {
      try { this.socket?.emit('presence:manual', { off: false }); } catch {}
      this.touchActivity();
      this.ensureConnected();
    }
  }

  // ===========================
  // SOCKET & CHAT
  // ===========================

  private connect(): void {
    if (!this.started) return;
    if (this.manualOffline) return;

    const info = this.getValidUserTokenInfo();
    if (!info) {
      this.disconnect();
      return;
    }

    const base = this.getSocketBaseUrl();
    const path = (environment as any).chatSocketPath || '/socket.io';

    if (!this.socket) {
      this.socket = io(base, {
        path,
        transports: ['polling', 'websocket'],
        upgrade: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 600,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        autoConnect: false,
        withCredentials: false,
        forceNew: true,   // evita “riuso” manager tra servizi
        auth: { token: info.token }
      });

      this.registerListeners(this.socket);
    } else {
      (this.socket as any).auth = { token: info.token };
    }

    if (!this.socket.connected) {
      try { this.socket.connect(); } catch {}
    }
  }

  private registerListeners(s: Socket): void {
    const setList = (list: OnlineUser[]) => {
      this._onlineUsers.next(Array.isArray(list) ? list : []);
    };

    s.on('users:list', (list: OnlineUser[]) => setList(list));
    s.on('presence:list', (list: OnlineUser[]) => setList(list));

    s.on('users:online', (u: OnlineUser) => {
      const cur = this._onlineUsers.value;
      if (!cur.find(x => x.id === u.id)) this._onlineUsers.next([...cur, u]);
    });

    s.on('users:offline', (u: OnlineUser) => {
      this._onlineUsers.next(this._onlineUsers.value.filter(x => x.id !== u.id));
    });

    s.on('presence:update', (u: OnlineUser & { status?: string }) => {
      const cur = this._onlineUsers.value.slice();
      const idx = cur.findIndex(x => x.id === u.id);
      if (idx >= 0) cur[idx] = { id: u.id, username: u.username };
      else cur.push({ id: u.id, username: u.username });
      this._onlineUsers.next(cur);
    });

    s.on('presence:remove', (u: { id: number }) => {
      this._onlineUsers.next(this._onlineUsers.value.filter(x => x.id !== u.id));
    });

    s.on('chat:dm:history', (payload: { peerId: number; messages: any[] }) => {
      const arr = Array.isArray(payload?.messages) ? payload.messages : [];
      for (const m of arr) {
        const mapped = this.mapIncoming(m);
        if (mapped) this._dmMessage$.next(mapped);
      }
    });

    const handleIncoming = (m: any) => {
      const mapped = this.mapIncoming(m);
      if (!mapped) return;

      // dedup: non far crescere infinito
      if (this.seenIds.size > 5000) this.seenIds.clear();

      if (this.seenIds.has(mapped.id)) return;
      this.seenIds.add(mapped.id);

      this._dmMessage$.next(mapped);
      if (this.isIncomingDmToMe(mapped)) this.incUnread(mapped.userId);
    };

    s.on('chat:message', handleIncoming);
    s.on('chat:dm:message', handleIncoming);

    s.on('connect', () => {
      try { s.emit('presence:get'); } catch {}
    });

    s.on('connect_error', (err: any) => {
      console.error('[chat-ws] connect_error', err?.message || err);
    });

    s.on('error', (err: any) => {
      console.error('[chat-ws] error', err?.message || err);
    });
  }

  selectPeer(u: OnlineUser): void {
    this._activePeer.next(u);
    this.markRead(u.id);
    if (!this.socket?.connected) return;
    this.socket.emit('chat:dm:open', { peerId: u.id });
  }

  sendToActive(text: string, opts?: { clientId?: string; time?: number }): void {
    const peer = this._activePeer.value;
    if (!peer || !this.socket?.connected) return;

    const payload: any = { to: peer.id, text };
    if (opts?.clientId) payload.clientId = opts.clientId;
    if (opts?.time) payload.time = opts.time;

    this.socket.emit('chat:dm:send', payload);
  }

  private disconnect(): void {
    try {
      this.socket?.removeAllListeners();
      this.socket?.disconnect();
    } catch {
      // ignore
    } finally {
      this.socket = undefined;
      this.seenIds.clear();
      this._onlineUsers.next([]);
      this.myUserId = null;
    }
  }

  // ===========================
  // UNREAD API
  // ===========================

  markRead(peerId: number): void {
    const map = new Map(this._unreadByPeer.value);
    if (map.has(peerId)) {
      map.set(peerId, 0);
      this._unreadByPeer.next(map);
      this.recomputeTotal(map);
    }
  }

  get totalUnread(): number {
    return this._totalUnread.value;
  }

  // ===========================
  // HELPERS
  // ===========================

  private mapIncoming(m: any): ChatMessage | null {
    if (!m) return null;

    const fromUserId = Number(m?.fromUserId ?? m?.userId ?? 0);
    const toUserId =
      m?.toUserId != null
        ? Number(m.toUserId)
        : (m?.to != null ? Number(m.to) : undefined);

    if (!fromUserId || !Number.isFinite(fromUserId)) return null;

    // id: preferisci id server, poi clientId, poi fallback
    const id = String(
      m?.id ??
      m?.messageId ??
      m?.clientId ??
      (globalThis.crypto?.randomUUID?.() ?? Date.now())
    );

    return {
      id,
      clientId: m?.clientId ? String(m.clientId) : undefined,
      author: String(m?.author ?? ''),
      text: String(m?.text ?? ''),
      time: Number(m?.time ?? Date.now()),
      userId: fromUserId,
      toUserId
    };
  }

  private isIncomingDmToMe(m: ChatMessage): boolean {
    if (!this.myUserId) return false;
    if (m.toUserId != null) return m.userId !== this.myUserId && m.toUserId === this.myUserId;
    return m.userId !== this.myUserId;
  }

  private incUnread(peerId: number): void {
    const map = new Map(this._unreadByPeer.value);
    map.set(peerId, (map.get(peerId) ?? 0) + 1);
    this._unreadByPeer.next(map);
    this.recomputeTotal(map);
  }

  private recomputeTotal(map: Map<number, number>): void {
    let tot = 0;
    map.forEach(v => { if (v > 0) tot += v; });
    this._totalUnread.next(tot);
  }

  // ===========================
  // PRESENCE MANAGER INTERNALS
  // ===========================

  private evaluatePresence(): void {
    if (!this.started) return;

    if (this.manualOffline) {
      this.disconnect();
      return;
    }

    if (!this.getValidUserTokenInfo()) {
      this.disconnect();
      return;
    }

    const last = this.readLastActivity();
    const age = Date.now() - last;

    if (age <= this.PRESENCE_TTL_MS) this.ensureConnected();
    else this.disconnect();
  }

  private ensureConnected(): void {
    if (!this.started) return;
    if (this.manualOffline) return;
    if (this.socket?.connected) return;
    this.connect();
  }

  private readLastActivity(): number {
    const v = Number(localStorage.getItem('presence.lastActivity') || 0);
    return Number.isFinite(v) && v > 0 ? v : Date.now();
  }

  private readManualOffline(): boolean {
    return localStorage.getItem('presence.manualOffline') === '1';
  }

  private readonly onStorageActivity = (e: StorageEvent) => {
    if (!this.started) return;

    if (e.key === 'presence.lastActivity' || e.key === 'presence.manualOffline') {
      if (e.key === 'presence.manualOffline') this._manualOffline.next(this.readManualOffline());
      this.evaluatePresence();
    }
  };

  // ===========================
  // TOKEN VALIDATION
  // ===========================

  private getValidUserTokenInfo(): { token: string; payload: JwtPayload } | null {
    const raw = (localStorage.getItem('token') || '').trim();
    const token = raw.replace(/^Bearer\s+/i, '').trim();

    if (!token || token.split('.').length !== 3) return null;

    const payload = this.decodeJwtPayload(token);
    if (!payload) return null;

    if (payload.ruolo === 'guest') return null;

    const idNum = typeof payload.id === 'string' ? Number(payload.id) : payload.id;
    if (typeof idNum !== 'number' || !Number.isFinite(idNum)) return null;

    this.myUserId = idNum;
    return { token, payload };
  }

  private decodeJwtPayload(token: string): JwtPayload | null {
    try {
      const part = token.split('.')[1] || '';
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(b64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  // ===========================
  // URL NORMALIZATION
  // ===========================

  private getSocketBaseUrl(): string {
    const anyEnv = environment as any;

    // 1) prefer socketBaseUrl (http/https)
    let base = (anyEnv.socketBaseUrl as string | undefined) || '';

    // 2) fallback wsUrl (spesso la gente lo mette wss://... -> lo normalizzo in https://...)
    if (!base) base = (anyEnv.wsUrl as string | undefined) || '';

    // 3) fallback baseUrl origin
    if (!base) {
      const api = (anyEnv.baseUrl as string | undefined) || '';
      if (api && api.startsWith('http')) {
        try { base = new URL(api).origin; } catch {}
      }
    }

    // 4) ultimo fallback
    if (!base) base = window.location.origin;

    base = String(base).trim().replace(/\/+$/, '');

    // Normalizza ws/wss -> http/https (socket.io vuole handshake HTTP)
    if (base.startsWith('wss://')) base = 'https://' + base.slice(6);
    if (base.startsWith('ws://')) base = 'http://' + base.slice(5);

    return base;
  }
}
