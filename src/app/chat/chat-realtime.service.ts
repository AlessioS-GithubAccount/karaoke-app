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
  // ===== Config presenza =====
  private readonly PRESENCE_TTL_MS = 60 * 60 * 1000; // 1 ora
  private readonly CHECK_INTERVAL_MS = 15 * 1000;    // ogni 15s ricontrollo

  private socket?: Socket;
  private myUserId: number | null = null;

  // Dedup messaggi
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

  // Unload hooks
  private unloadHooksInstalled = false;
  private onBeforeUnload = () => {
    try { localStorage.setItem('presence.lastActivity', String(Date.now())); } catch {}
  };
  private onPageHide = () => {
    try { localStorage.setItem('presence.lastActivity', String(Date.now())); } catch {}
  };
  private onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      try { localStorage.setItem('presence.lastActivity', String(Date.now())); } catch {}
    } else {
      this.touchActivity();
    }
  };

  // ===== AUTO-BOOT DEL PRESENCE MANAGER =====
  constructor() {
    // Avvio “safe”: se non c’è token non si connette comunque
    queueMicrotask(() => {
      this.installUnloadHooks();
      this.initPresenceManager();
      this.touchActivity();     // porta “in vita” la presenza appena entro in app
      this.connect();           // connessione esplicita (no-op se manualOffline o senza token)
    });
  }

  // ====== API Presenza pubbliche ======

  /** Segna attività e, se non in manual offline, garantisce la connessione. */
  touchActivity(): void {
    localStorage.setItem('presence.lastActivity', String(Date.now()));
    if (!this.manualOffline) this.ensureConnected();
  }

  /** Hook di unload/visibilità per mantenere aggiornato lastActivity. */
  installUnloadHooks(): void {
    if (this.unloadHooksInstalled) return;
    this.unloadHooksInstalled = true;

    window.addEventListener('beforeunload', this.onBeforeUnload);
    window.addEventListener('pagehide', this.onPageHide);
    document.addEventListener('visibilitychange', this.onVisibilityChange, { passive: true as any });
  }

  /** Avvia il gestore presenza globale (idempotente). */
  initPresenceManager(): void {
    if (this.presenceInited) return;
    this.presenceInited = true;

    this.evaluatePresence(); // primo check immediato
    window.addEventListener('storage', this.onStorageActivity);
    this.presenceTimer = window.setInterval(() => this.evaluatePresence(), this.CHECK_INTERVAL_MS);
  }

  /**
   * Imposta manualmente offline/online.
   * - true  => offline forzato (disconnessione immediata, scompari dalla lista)
   * - false => torni gestito dal presence manager (se c’è attività < 1h, resti connesso)
   */
  setManualOffline(off: boolean): void {
    localStorage.setItem('presence.manualOffline', off ? '1' : '0');
    this._manualOffline.next(off);

    if (off) {
      try { this.socket?.emit('presence:manual', { off: true }); } catch {}
      this.disconnect();
    } else {
      try { this.socket?.emit('presence:manual', { off: false }); } catch {}
      this.touchActivity();
      this.connect();
    }
  }

  // ====== Socket & Chat ======

  connect(): void {
    if (this.socket?.connected) return;
    if (this.manualOffline) return;

    const raw = localStorage.getItem('token') || '';
    const token = raw.replace(/^Bearer\s+/i, '');
    if (!token) return;

    try {
      const payload = JSON.parse(atob((token.split('.')[1] || '')));
      this.myUserId = typeof payload?.id === 'number' ? payload.id : null;
    } catch {
      this.myUserId = null;
    }

    this.socket = io(environment.wsUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'], // fallback robusto
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      auth: { token },
      autoConnect: true
    });

    // Listener PRIMA dello snapshot
    this.registerListeners(this.socket);
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

    // Nuovi messaggi (dedup)
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
      console.error('[ws] connect_error', err?.message || err);
    });
    s.on('error', (err: any) => {
      console.error('[ws] error', err?.message || err);
    });
  }

  selectPeer(u: OnlineUser): void {
    this._activePeer.next(u);
    this.markRead(u.id);
    if (!this.socket?.connected) return;
    this.socket.emit('chat:dm:open', { peerId: u.id });
  }

  sendToActive(text: string): void {
    const peer = this._activePeer.value;
    if (!peer || !this.socket?.connected) return;
    this.socket.emit('chat:dm:send', { to: peer.id, text });
  }

  disconnect(): void {
    try {
      this.socket?.removeAllListeners();
      this.socket?.disconnect();
    } finally {
      this.socket = undefined;
      this.seenIds.clear();
      this._onlineUsers.next([]);
    }
  }

  // ===== UNREAD API =====
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

  // ===== helpers =====
  private mapIncoming(m: any): ChatMessage | null {
    if (!m) return null;

    const fromUserId = Number(m?.fromUserId ?? m?.userId ?? 0);
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

  // ===== Presence manager internals =====
  private evaluatePresence(): void {
    if (this.manualOffline) {
      this.disconnect();
      return;
    }
    const last = this.readLastActivity();
    const age = Date.now() - last;
    if (age <= this.PRESENCE_TTL_MS) this.ensureConnected();
    else this.disconnect();
  }

  private ensureConnected(): void {
    if (!this.socket?.connected) this.connect();
  }

  private readLastActivity(): number {
    const v = Number(localStorage.getItem('presence.lastActivity') || 0);
    return Number.isFinite(v) && v > 0 ? v : Date.now();
  }

  private readManualOffline(): boolean {
    return localStorage.getItem('presence.manualOffline') === '1';
  }

  private onStorageActivity = (e: StorageEvent) => {
    if (e.key === 'presence.lastActivity' || e.key === 'presence.manualOffline') {
      if (e.key === 'presence.manualOffline') this._manualOffline.next(this.readManualOffline());
      this.evaluatePresence();
    }
  };
}
