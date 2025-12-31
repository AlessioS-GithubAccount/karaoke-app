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

type JwtPayload = { id?: number; ruolo?: string; username?: string; [k: string]: any };

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

  // Lifecycle service
  private started = false;

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

  // ✅ niente più autoboot in constructor
  constructor() {}

  // ===========================
  // PUBLIC START/STOP
  // ===========================

  /**
   * Avvia chat+presence. Chiamalo SOLO per user/admin (mai per guest/anon),
   * es: quando entri nella pagina Chat oppure subito dopo login user/admin.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    this.installUnloadHooks();
    this.initPresenceManager();
    this.touchActivity(); // segna attività e prova connessione (se possibile)
    this.ensureConnected();
  }

  /** Ferma tutto (utile in logout o quando lasci l’area chat se vuoi). */
  stop(): void {
    this.started = false;

    this.teardownPresenceManager();
    this.disconnect();

    // opzionale: puoi anche rimuovere gli hooks (non obbligatorio)
    this.uninstallUnloadHooks();
  }

  // ===========================
  // PRESENZA / ATTIVITÀ
  // ===========================

  /** Segna attività e, se non in manual offline, garantisce la connessione. */
  touchActivity(): void {
    try { localStorage.setItem('presence.lastActivity', String(Date.now())); } catch {}
    if (!this.started) return;
    if (!this.manualOffline) this.ensureConnected();
  }

  /** Hook di unload/visibilità per mantenere aggiornato lastActivity. */
  private installUnloadHooks(): void {
    if (this.unloadHooksInstalled) return;
    this.unloadHooksInstalled = true;

    window.addEventListener('beforeunload', this.onBeforeUnload);
    window.addEventListener('pagehide', this.onPageHide);
    document.addEventListener('visibilitychange', this.onVisibilityChange, { passive: true as any });
  }

  private uninstallUnloadHooks(): void {
    if (!this.unloadHooksInstalled) return;
    this.unloadHooksInstalled = false;

    window.removeEventListener('beforeunload', this.onBeforeUnload);
    window.removeEventListener('pagehide', this.onPageHide);
    document.removeEventListener('visibilitychange', this.onVisibilityChange as any);
  }

  /** Avvia il gestore presenza globale (idempotente). */
  private initPresenceManager(): void {
    if (this.presenceInited) return;
    this.presenceInited = true;

    this.evaluatePresence(); // primo check immediato
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

  /**
   * Imposta manualmente offline/online.
   * - true  => offline forzato (disconnessione immediata)
   * - false => ritorni gestito dal presence manager
   */
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

  /** Connette (o riconnette) SOLO se token user/admin valido. */
  private connect(): void {
    if (!this.started) return;
    if (this.manualOffline) return;

    const info = this.getValidUserTokenInfo();
    if (!info) {
      // niente token valido → niente chat
      this.disconnect();
      return;
    }

    // 1) Istanzia una sola volta
    if (!this.socket) {
      const base = (environment as any).socketBaseUrl || (environment as any).wsUrl;

      this.socket = io(base, {
        path: '/socket.io',
        transports: ['polling', 'websocket'], // fallback robusto
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 600,
        autoConnect: false, // ✅ fondamentale: controlliamo noi
        auth: { token: info.token }
      });

      this.registerListeners(this.socket);
    } else {
      // 2) aggiorna auth token se cambiato
      (this.socket as any).auth = { token: info.token };
    }

    // 3) Connetti solo se non già connessa
    if (!this.socket.connected) {
      try { this.socket.connect(); } catch {}
    }
  }

  private registerListeners(s: Socket): void {
    const setList = (list: OnlineUser[]) => {
      this._onlineUsers.next(Array.isArray(list) ? list : []);
    };

    // Presence snapshot + incrementali
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

    // History DM (non incrementa unread)
    s.on('chat:dm:history', (payload: { peerId: number; messages: any[] }) => {
      const arr = Array.isArray(payload?.messages) ? payload.messages : [];
      for (const m of arr) {
        const mapped = this.mapIncoming(m);
        if (mapped) this._dmMessage$.next(mapped);
      }
    });

    // Nuovi messaggi (dedup by id)
    const handleIncoming = (m: any) => {
      const mapped = this.mapIncoming(m);
      if (!mapped) return;
      if (this.seenIds.has(mapped.id)) return;
      this.seenIds.add(mapped.id);

      this._dmMessage$.next(mapped);
      if (this.isIncomingDmToMe(mapped)) this.incUnread(mapped.userId);
    };

    s.on('chat:message', handleIncoming);
    s.on('chat:dm:message', handleIncoming);

    // Connessione / errori
    s.on('connect', () => {
      try { s.emit('presence:get'); } catch {}
    });

    s.on('connect_error', (err: any) => {
      console.error('[chat-ws] connect_error', err?.message || err);
    });

    s.on('error', (err: any) => {
      console.error('[chat-ws] error', err?.message || err);
    });

    s.on('disconnect', (reason) => {
      // se sei ancora started e non in manualOffline, il reconnect di socket.io farà il suo lavoro.
      // qui teniamo solo log se vuoi:
      // console.warn('[chat-ws] disconnected', reason);
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

  resetAllUnread(): void {
    const map = new Map<number, number>();
    this._unreadByPeer.next(map);
    this._totalUnread.next(0);
  }

  get totalUnread(): number {
    return this._totalUnread.value;
  }

  getUnreadForPeer(peerId: number): number {
    return this._unreadByPeer.value.get(peerId) ?? 0;
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
        : (typeof m?.to === 'number' ? Number(m.to) : undefined);

    return {
      id: String(m?.id ?? (globalThis.crypto?.randomUUID?.() ?? Date.now())),
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

    // se non ho un token user/admin valido → stacco
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

    // deve essere JWT (3 parti)
    if (!token || token.split('.').length !== 3) return null;

    const payload = this.decodeJwtPayload(token);
    if (!payload) return null;

    // blocca guest
    if (payload.ruolo === 'guest') return null;

    // deve avere id numerico
    if (typeof payload.id !== 'number' || !Number.isFinite(payload.id)) return null;

    // salva myUserId
    this.myUserId = payload.id;

    return { token, payload };
  }

  private decodeJwtPayload(token: string): JwtPayload | null {
    try {
      const part = token.split('.')[1] || '';
      // base64url -> base64
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
}
