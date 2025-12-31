import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { ChatRealtimeService, ChatMessage, OnlineUser } from './chat-realtime.service';
import { Router } from '@angular/router';

interface UiMessage {
  id: string;
  author: string;
  text: string;
  time: Date;
  me: boolean;
}

interface StoredUiMessage {
  id: string;
  author: string;
  text: string;
  time: string; // ISO
  me: boolean;
}

type ThreadsMapStored = Record<string, StoredUiMessage[]>;

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
})
export class ChatComponent implements OnInit, OnDestroy {
  private static readonly THREAD_MAX = 200;

  mustLogin = false;

  online: OnlineUser[] = [];
  activePeer: OnlineUser | null = null;

  inputText = '';
  messages: UiMessage[] = [];
  private messagesByPeer = new Map<number, UiMessage[]>();

  unreadByPeer: Record<number, number> = {};
  isOnline = true;

  private subs: Subscription[] = [];
  private myUserId: number | null = null;
  private myUsername = 'Me';
  private isFocused = true;

  // anti-doppio invio
  private lastSendTs = 0;
  private lastSig = '';
  private mkSig(text: string, peerId: number) {
    return `${peerId}|${text.trim()}`;
  }

  // dedup locale: clientId dei messaggi appena inviati da QUESTA tab
  private sentClientIds = new Set<string>();
  private rememberSent(clientId: string) {
    this.sentClientIds.add(clientId);
    if (this.sentClientIds.size > 300) {
      const first = this.sentClientIds.values().next().value as string | undefined;
      if (first) this.sentClientIds.delete(first);
    }
    setTimeout(() => this.sentClientIds.delete(clientId), 20000);
  }

  // storage keys (calcolate in ngOnInit dopo myUserId)
  private storageKeyThreads = 'chat:0:threads';
  private storageKeyUnread = 'chat:0:unread';
  private storageKeyActive = 'chat:0:active';

  constructor(private realtime: ChatRealtimeService, private router: Router) {}

  ngOnInit(): void {
    // 1) Verifica token user/admin (NO guest)
    const auth = this.readValidUserAuthFromStorage();
    this.mustLogin = !Boolean(auth);

    if (this.mustLogin) {
      // Non avviare la chat/presence manager
      this.isOnline = false;
      this.loadAllFromStorage(); // opzionale
      window.addEventListener('focus', this.onFocus);
      window.addEventListener('blur', this.onBlur);
      return;
    }

    // 2) Set identità e chiavi storage
    this.myUserId = auth!.id;
    this.myUsername = auth!.username || 'Me';

    this.storageKeyThreads = `chat:${this.myUserId}:threads`;
    this.storageKeyUnread = `chat:${this.myUserId}:unread`;
    this.storageKeyActive = `chat:${this.myUserId}:active`;

    // 3) Avvia realtime SOLO qui (niente autoboot nel service)
    this.realtime.start();
    this.realtime.touchActivity();

    this.isOnline = !this.realtime.manualOffline;
    this.subs.push(this.realtime.manualOffline$.subscribe(off => (this.isOnline = !off)));

    // 4) Load storage
    this.loadAllFromStorage();

    // 5) Sottoscrizioni realtime
    this.subs.push(
      this.realtime.onlineUsers$.subscribe(list => {
        const myId = this.myUserId;
        this.online = myId ? list.filter(u => u.id !== myId) : list;
      })
    );

    this.subs.push(
      this.realtime.unreadByPeer$.subscribe(map => {
        const obj: Record<number, number> = {};
        map.forEach((v, k) => (obj[k] = v));
        this.unreadByPeer = obj;
        this.persistUnread();
      })
    );

    this.subs.push(
      this.realtime.activePeer$.subscribe(peer => {
        this.activePeer = peer;

        const thread = peer ? this.messagesByPeer.get(peer.id) || [] : [];
        this.messages = thread.slice();

        if (peer) {
          this.realtime.markRead(peer.id);
          this.persistActivePeer(peer.id);
        } else {
          this.persistActivePeer(null);
        }

        setTimeout(() => this.scrollToBottomNow(), 0);
      })
    );

    // DEDUP in arrivo con clientId
    this.subs.push(
      this.realtime.dmMessage$.subscribe((m: ChatMessage) => {
        if (!this.myUserId) return;

        // Se il server ci rimanda il nostro invio con lo stesso clientId, ignoralo in QUESTA tab
        if (m.clientId && this.sentClientIds.has(m.clientId)) return;

        const peerId =
          m.userId && m.userId !== this.myUserId
            ? m.userId
            : m.toUserId && m.toUserId !== this.myUserId
              ? m.toUserId
              : null;

        if (!peerId) return;

        const ui: UiMessage = {
          id: m.id,
          author: m.author || 'User',
          text: m.text,
          time: new Date(typeof m.time === 'number' ? m.time : Date.now()),
          me: m.userId === this.myUserId,
        };

        const arr = this.messagesByPeer.get(peerId) || [];
        arr.push(ui);

        if (arr.length > ChatComponent.THREAD_MAX) {
          arr.splice(0, arr.length - ChatComponent.THREAD_MAX);
        }

        this.messagesByPeer.set(peerId, arr);
        this.persistThread(peerId, arr);

        if (this.activePeer?.id === peerId) {
          this.messages = arr.slice();
          if (this.isFocused) this.realtime.markRead(peerId);
          setTimeout(() => this.scrollToBottomNow(), 0);
        }
      })
    );

    // Focus/blur
    window.addEventListener('focus', this.onFocus);
    window.addEventListener('blur', this.onBlur);

    // Ripristina peer attivo
    const savedActive = this.readActivePeer();
    if (savedActive && !this.activePeer) {
      const fake: OnlineUser = { id: savedActive, username: '' };
      this.realtime.selectPeer(fake);
    }
  }

  toggleOnline(): void {
    if (this.mustLogin) return;

    const nextOnline = !this.isOnline;
    if (nextOnline) this.realtime.touchActivity();
    this.realtime.setManualOffline(!nextOnline);
  }

  selectPeer(u: OnlineUser): void {
    if (this.mustLogin) return;
    this.realtime.touchActivity();
    this.realtime.selectPeer(u);
  }

  send(event?: Event): void {
    if (event) event.preventDefault();
    if (this.mustLogin) return;
    if (!this.myUserId) return;
    if (!this.isOnline) return;

    const text = this.inputText.trim();
    if (!text || !this.activePeer) return;

    const pid = this.activePeer.id;
    const sig = this.mkSig(text, pid);
    const now = Date.now();

    if (sig === this.lastSig && now - this.lastSendTs < 500) return;
    this.lastSig = sig;
    this.lastSendTs = now;

    // genera clientId e invialo al server
    const clientId = globalThis.crypto?.randomUUID?.() ?? String(now);
    this.realtime.sendToActive(text, { clientId, time: now });

    // echo locale
    const ui: UiMessage = {
      id: clientId,
      author: this.myUsername || 'Me',
      text,
      time: new Date(now),
      me: true,
    };

    const arr = this.messagesByPeer.get(pid) || [];
    arr.push(ui);

    if (arr.length > ChatComponent.THREAD_MAX) {
      arr.splice(0, arr.length - ChatComponent.THREAD_MAX);
    }

    this.messagesByPeer.set(pid, arr);
    this.messages = arr.slice();
    this.inputText = '';

    this.rememberSent(clientId);
    this.realtime.markRead(pid);
    this.persistThread(pid, arr);

    setTimeout(() => this.scrollToBottomNow(), 0);
  }

  goLogin(): void {
    this.router.navigate(['/login']);
  }

  // ✅ trackBy corretto per lista utenti (evita glitch quando cambia l’array)
  trackByUserId = (_: number, u: OnlineUser) => u?.id ?? _;

  trackByMsg = (_: number, m: UiMessage) => m.id ?? _;
  trackByIndex(i: number): number { return i; }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    window.removeEventListener('focus', this.onFocus);
    window.removeEventListener('blur', this.onBlur);

    // ✅ stop: la chat resta attiva solo in questa pagina
    if (!this.mustLogin) {
      this.realtime.stop();
    }
  }

  private onFocus = () => {
    this.isFocused = true;
    if (!this.mustLogin) {
      this.realtime.touchActivity();
      if (this.activePeer) this.realtime.markRead(this.activePeer.id);
    }
  };

  private onBlur = () => {
    this.isFocused = false;
  };

  private scrollToBottomNow(): void {
    const el = document.getElementById('chat-scroll');
    if (el) el.scrollTop = el.scrollHeight;
  }

  // ===========================
  // STORAGE
  // ===========================

  private persistThread(peerId: number, arr: UiMessage[]): void {
    try {
      const all: ThreadsMapStored = this.readAllThreadsStored();
      all[String(peerId)] = arr.map(m => ({
        id: m.id,
        author: m.author,
        text: m.text,
        me: m.me,
        time: m.time.toISOString(),
      }));
      localStorage.setItem(this.storageKeyThreads, JSON.stringify(all));
    } catch {
      this.compactThreadsAndRetry(peerId, arr);
    }
  }

  private persistUnread(): void {
    try {
      localStorage.setItem(this.storageKeyUnread, JSON.stringify(this.unreadByPeer || {}));
    } catch {}
  }

  private persistActivePeer(peerId: number | null): void {
    try {
      if (peerId == null) localStorage.removeItem(this.storageKeyActive);
      else localStorage.setItem(this.storageKeyActive, String(peerId));
    } catch {}
  }

  private loadAllFromStorage(): void {
    const all = this.readAllThreadsStored();
    for (const key of Object.keys(all)) {
      const pid = Number(key);
      const arr = (all[key] || []).map(m => ({
        id: m.id,
        author: m.author,
        text: m.text,
        me: m.me,
        time: new Date(m.time),
      }));
      this.messagesByPeer.set(pid, arr);
    }

    try {
      const raw = localStorage.getItem(this.storageKeyUnread);
      if (raw) this.unreadByPeer = JSON.parse(raw) as Record<number, number>;
    } catch {}

    const active = this.readActivePeer();
    if (active && !this.activePeer) {
      const thread = this.messagesByPeer.get(active) || [];
      this.messages = thread.slice();
    }
  }

  private readAllThreadsStored(): ThreadsMapStored {
    try {
      const raw = localStorage.getItem(this.storageKeyThreads);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as ThreadsMapStored;
    } catch {}
    return {};
  }

  private readActivePeer(): number | null {
    try {
      const raw = localStorage.getItem(this.storageKeyActive);
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  private compactThreadsAndRetry(peerId: number, arr: UiMessage[]): void {
    try {
      const all = this.readAllThreadsStored();
      const entries = Object.entries(all);
      if (entries.length === 0) return;

      entries.sort((a, b) => {
        const lastA = a[1]?.at(-1)?.time ? new Date(a[1].at(-1)!.time).getTime() : 0;
        const lastB = b[1]?.at(-1)?.time ? new Date(b[1].at(-1)!.time).getTime() : 0;
        return lastA - lastB;
      });

      const toRemove = Math.min(2, Math.max(1, Math.floor(entries.length / 5)));
      for (let i = 0; i < toRemove; i++) delete all[entries[i][0]];

      localStorage.setItem(this.storageKeyThreads, JSON.stringify(all));
      this.persistThread(peerId, arr);
    } catch {
      const truncated = arr.slice(-Math.ceil(arr.length / 2));
      try {
        const all = this.readAllThreadsStored();
        all[String(peerId)] = truncated.map(m => ({
          id: m.id,
          author: m.author,
          text: m.text,
          me: m.me,
          time: m.time.toISOString(),
        }));
        localStorage.setItem(this.storageKeyThreads, JSON.stringify(all));
      } catch {}
    }
  }

  // ===========================
  // AUTH HELPERS
  // ===========================

  private readValidUserAuthFromStorage(): { id: number; username: string; ruolo: string } | null {
    const raw = (localStorage.getItem('token') || '').trim();
    const token = raw.replace(/^Bearer\s+/i, '').trim();
    if (!token || token.split('.').length !== 3) return null;

    const payload = this.decodeJwtPayload(token);
    if (!payload) return null;

    const ruolo = String(payload?.ruolo ?? '');
    if (ruolo === 'guest') return null;

    const id = payload?.id;
    if (typeof id !== 'number' || !Number.isFinite(id)) return null;

    const username = String(payload?.username ?? localStorage.getItem('username') ?? 'Me');
    return { id, username, ruolo };
  }

  private decodeJwtPayload(token: string): any | null {
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
}
