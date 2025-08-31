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
    // Aggiorna il "lastActivity" così il server ti tiene in grace 1h anche se chiudi la tab
    try { localStorage.setItem('presence.lastActivity', String(Date.now())); } catch {}
    // Non mandiamo nessun "manual offline" qui.
  };
  private onPageHide = () => {
    try { localStorage.setItem('presence.lastActivity', String(Date.now())); } catch {}
  };
  private onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      try { localStorage.setItem('presence.lastActivity', String(Date.now())); } catch {}
    } else {
      // al ritorno in foreground, conta come attività
      this.touchActivity();
    }
  };

  // ====== API Presenza pubbliche ======

  /** Segna attività (click/scroll/route change/...) e salva in localStorage. */
  touchActivity(): void {
    localStorage.setItem('presence.lastActivity', String(Date.now()));
    if (!this.manualOffline) {
      this.ensureConnected();
    }
  }

  /**
   * Installa gli hook di unload/visibilità per mantenere aggiornato lastActivity
   * anche quando l’utente chiude la tab o passa in background.
   */
  installUnloadHooks(): void {
    if (this.unloadHooksInstalled) return;
    this.unloadHooksInstalled = true;

    window.addEventListener('beforeunload', this.onBeforeUnload);
    // pagehide copre Safari/iOS
    window.addEventListener('pagehide', this.onPageHide);
    document.addEventListener('visibilitychange', this.onVisibilityChange, { passive: true as any });
  }

  /**
   * Avvia il gestore di presenza globale: mantiene online l’utente
   * per 1h dall’ultima attività in app, anche fuori dal componente Chat.
   * Può essere chiamato più volte, è idempotente.
   */
  initPresenceManager(): void {
    if (this.presenceInited) return;
    this.presenceInited = true;

    // Primo check immediato
    this.evaluatePresence();

    // Storage listener → sincronizza attività tra TAB/finestre
    window.addEventListener('storage', this.onStorageActivity);

    // Timer periodico per valutare presenza
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
      // Avvisa il server che vai OFFLINE manualmente
      try { this.socket?.emit('presence:manual', { off: true }); } catch {}
      // Stacca la socket locale
      this.disconnect();
    } else {
      // 👉 NUOVO: avvisa il server che torni a gestione automatica (facoltativo ma pulito)
      try { this.socket?.emit('presence:manual', { off: false }); } catch {}
      // Torno online: registro attività per innescare la connessione
      this.touchActivity();
    }
  }

  // ====== Socket & Chat ======

  connect(): void {
    if (this.socket?.connected) return;
    if (this.manualOffline) return; // non connettere se utente ha scelto offline

    const raw = localStorage.getItem('token') || '';
    const token = raw.replace(/^Bearer\s+/i, '');

    try {
      const payload = JSON.parse(atob((token.split('.')[1] || '')));
      this.myUserId = typeof payload?.id === 'number' ? payload.id : null;
    } catch {
      this.myUserId = null;
    }

    if (!token) return; // se non loggato, non connettere

    this.socket = io(environment.wsUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      auth: { token }, // token nudo, senza "Bearer"
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

    // ===== DM: history ===== (non incrementa unread)
    this.socket.on('chat:dm:history', (payload: { peerId: number; messages: any[] }) => {
      const arr = Array.isArray(payload?.messages) ? payload.messages : [];
      for (const m of arr) {
        const mapped = this.mapIncoming(m);
        if (mapped) {
          // history non entra in seenIds così i live non vengono filtrati
          this._dmMessage$.next(mapped);
        }
      }
    });

    const handleIncoming = (m: any) => {
      const mapped = this.mapIncoming(m);
      if (!mapped) return;

      // dedup
      if (this.seenIds.has(mapped.id)) return;
      this.seenIds.add(mapped.id);

      this._dmMessage$.next(mapped);

      // incrementa il contatore se è un DM in arrivo verso di me
      if (this.isIncomingDmToMe(mapped)) {
        this.incUnread(mapped.userId);
      }
    };

    // ===== Nuovi messaggi =====
    this.socket.on('chat:message', handleIncoming);
    // Alcuni backend emettono anche questo: con dedup siamo safe
    this.socket.on('chat:dm:message', handleIncoming);
  }

  selectPeer(u: OnlineUser): void {
    this._activePeer.next(u);
    this.markRead(u.id); // azzero subito quando apro
    if (!this.socket?.connected) return;
    this.socket.emit('chat:dm:open', { peerId: u.id });
  }

  sendToActive(text: string): void {
    const peer = this._activePeer.value;
    if (!peer || !this.socket?.connected) return;
    // lato server gestiamo "chat:dm:send"
    this.socket.emit('chat:dm:send', { to: peer.id, text });
  }

  disconnect(): void {
    try {
      this.socket?.removeAllListeners();
      this.socket?.disconnect();
    } finally {
      this.socket = undefined;
      this.seenIds.clear();
      // Svuoto la lista online (server non spingerà più aggiornamenti)
      this._onlineUsers.next([]);
    }
  }

  // ===== UNREAD API =====
  /** Azzera i non letti di un peer */
  markRead(peerId: number): void {
    const map = new Map(this._unreadByPeer.value);
    if (map.has(peerId)) {
      map.set(peerId, 0);
      this._unreadByPeer.next(map);
      this.recomputeTotal(map);
    }
  }

  /** Azzera tutti i non letti */
  resetAllUnread(): void {
    const map = new Map<number, number>();
    this._unreadByPeer.next(map);
    this._totalUnread.next(0);
  }

  /** (facoltativo) Legge sincrona del totale */
  get totalUnread(): number {
    return this._totalUnread.value;
  }

  /** (facoltativo) Legge sincrona del per-peer */
  getUnreadForPeer(peerId: number): number {
    return this._unreadByPeer.value.get(peerId) ?? 0;
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

  /** True se è un DM in arrivo verso di me (fallback se manca toUserId) */
  private isIncomingDmToMe(m: ChatMessage): boolean {
    if (!this.myUserId) return false;
    if (m.toUserId != null) {
      return m.userId !== this.myUserId && m.toUserId === this.myUserId;
    }
    // Fallback: se non c'è toUserId ma il messaggio arriva e non sono io il mittente,
    // trattalo come DM per me (tipico backend che omette "to").
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
      // Offline forzato → disconnetti subito
      this.disconnect();
      return;
    }

    const last = this.readLastActivity();
    const age = Date.now() - last;

    if (age <= this.PRESENCE_TTL_MS) {
      // Attività recente → assicurati connesso
      this.ensureConnected();
    } else {
      // Inattivo da > 1h → disconnetti
      this.disconnect();
    }
  }

  private ensureConnected(): void {
    if (!this.socket?.connected) {
      this.connect();
    }
  }

  private readLastActivity(): number {
    const v = Number(localStorage.getItem('presence.lastActivity') || 0);
    return Number.isFinite(v) && v > 0 ? v : Date.now();
    // default: se non c'è, considero ora (ti porta online appena apri l'app)
  }

  private readManualOffline(): boolean {
    return localStorage.getItem('presence.manualOffline') === '1';
  }

  private onStorageActivity = (e: StorageEvent) => {
    if (e.key === 'presence.lastActivity' || e.key === 'presence.manualOffline') {
      // sincronizza stato tra tab
      if (e.key === 'presence.manualOffline') {
        this._manualOffline.next(this.readManualOffline());
      }
      this.evaluatePresence();
    }
  };
}
