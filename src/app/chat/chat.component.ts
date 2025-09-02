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

type ThreadsMap = Record<string, UiMessage[]>;

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
  private myUserId = this.getMyUserId();
  private isFocused = true;

  // anti-doppio invio
  private lastSendTs = 0;
  private lastSig = '';
  private mkSig(text: string, peerId: number) {
    return `${peerId}|${text.trim()}`;
  }

  private storageKeyThreads = this.myUserId ? `chat:${this.myUserId}:threads` : 'chat:0:threads';
  private storageKeyUnread  = this.myUserId ? `chat:${this.myUserId}:unread`  : 'chat:0:unread';
  private storageKeyActive  = this.myUserId ? `chat:${this.myUserId}:active`  : 'chat:0:active';

  constructor(private realtime: ChatRealtimeService, private router: Router) {}

  ngOnInit(): void {
    this.mustLogin = !Boolean(localStorage.getItem('token'));

    // ❌ niente connect() qui: il service si auto-connette da solo nel constructor
    // (ok solo segnare attività)
    this.realtime.touchActivity?.();

    this.isOnline = !this.realtime.manualOffline;
    this.subs.push(this.realtime.manualOffline$.subscribe(off => this.isOnline = !off));

    this.loadAllFromStorage();

    this.subs.push(
      this.realtime.onlineUsers$.subscribe(list => {
        const myId = this.myUserId;
        this.online = myId ? list.filter(u => u.id !== myId) : list;
      })
    );

    this.subs.push(
      this.realtime.unreadByPeer$.subscribe(map => {
        const obj: Record<number, number> = {};
        map.forEach((v, k) => obj[k] = v);
        this.unreadByPeer = obj;
        this.persistUnread();
      })
    );

    this.subs.push(
      this.realtime.activePeer$.subscribe(peer => {
        this.activePeer = peer;
        const thread = peer ? (this.messagesByPeer.get(peer.id) || []) : [];
        this.messages = thread.slice();

        if (peer) {
          this.realtime.markRead(peer.id);
          this.persistActivePeer(peer.id);
        } else {
          this.persistActivePeer(null);
        }

        setTimeout(() => {
          const el = document.getElementById('chat-scroll');
          if (el) el.scrollTop = el.scrollHeight;
        }, 0);
      })
    );

    this.subs.push(
      this.realtime.dmMessage$.subscribe((m: ChatMessage) => {
        const peerId =
          (m.userId && m.userId !== this.myUserId) ? m.userId :
          (m.toUserId && m.toUserId !== this.myUserId) ? m.toUserId :
          null;
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

          setTimeout(() => {
            const el = document.getElementById('chat-scroll');
            if (el) el.scrollTop = el.scrollHeight;
          }, 0);
        }
      })
    );

    window.addEventListener('focus', this.onFocus);
    window.addEventListener('blur', this.onBlur);

    const savedActive = this.readActivePeer();
    if (savedActive && !this.activePeer) {
      const fake: OnlineUser = { id: savedActive, username: '' };
      this.realtime.selectPeer(fake);
    }
  }

  toggleOnline(): void {
    const nextOnline = !this.isOnline;
    if (nextOnline) this.realtime.touchActivity();
    this.realtime.setManualOffline(!nextOnline);
  }

  selectPeer(u: OnlineUser): void {
    this.realtime.selectPeer(u);
  }

  // form-safe + anti-doppio
  send(event?: Event): void {
    if (event) event.preventDefault();

    const text = this.inputText.trim();
    if (!text || !this.activePeer) return;

    const pid = this.activePeer.id;
    const sig = this.mkSig(text, pid);
    const now = Date.now();

    if (sig === this.lastSig && now - this.lastSendTs < 500) return;
    this.lastSig = sig;
    this.lastSendTs = now;

    this.realtime.sendToActive(text);

    const clientId = globalThis.crypto?.randomUUID?.() ?? String(now);
    const ui: UiMessage = {
      id: clientId,
      author: this.getMyUsername(),
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

    this.realtime.markRead(pid);
    this.persistThread(pid, arr);

    setTimeout(() => {
      const el = document.getElementById('chat-scroll');
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  }

  goLogin(): void {
    this.router.navigate(['/login']);
  }

  trackByMsg = (_: number, m: UiMessage) => m.id ?? _; // usato nel template
  trackByIndex(i: number): number { return i; }        // legacy

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    window.removeEventListener('focus', this.onFocus);
    window.removeEventListener('blur', this.onBlur);
  }

  private getMyUserId(): number | null {
    try {
      const token = localStorage.getItem('token');
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return typeof payload?.id === 'number' ? payload.id : null;
    } catch { return null; }
  }

  private getMyUsername(): string {
    return localStorage.getItem('username') || 'Me';
  }

  private onFocus = () => {
    this.isFocused = true;
    if (this.activePeer) this.realtime.markRead(this.activePeer.id);
  };

  private onBlur = () => { this.isFocused = false; };

  private persistThread(peerId: number, arr: UiMessage[]): void {
    try {
      const all: ThreadsMap = this.readAllThreads();
      all[String(peerId)] = arr.map(m => ({
        ...m,
        time: new Date(m.time).toISOString() as unknown as any
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
    const all = this.readAllThreads();
    for (const key of Object.keys(all)) {
      const pid = Number(key);
      const arr = all[key].map(m => ({
        ...m,
        time: new Date(m.time)
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

  private readAllThreads(): ThreadsMap {
    try {
      const raw = localStorage.getItem(this.storageKeyThreads);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as ThreadsMap;
    } catch {}
    return {};
  }

  private readActivePeer(): number | null {
    try {
      const raw = localStorage.getItem(this.storageKeyActive);
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    } catch { return null; }
  }

  private compactThreadsAndRetry(peerId: number, arr: UiMessage[]): void {
    try {
      const all = this.readAllThreads();
      const entries = Object.entries(all);
      if (entries.length === 0) return;

      entries.sort((a, b) => {
        const lastA = (a[1].at(-1)?.time) ? new Date(a[1].at(-1)!.time as any).getTime() : 0;
        const lastB = (b[1].at(-1)?.time) ? new Date(b[1].at(-1)!.time as any).getTime() : 0;
        return lastA - lastB;
      });

      const toRemove = Math.min(2, Math.max(1, Math.floor(entries.length / 5)));
      for (let i = 0; i < toRemove; i++) delete all[entries[i][0]];

      localStorage.setItem(this.storageKeyThreads, JSON.stringify(all));
      this.persistThread(peerId, arr);
    } catch {
      const truncated = arr.slice(-Math.ceil(arr.length / 2));
      try {
        const all = this.readAllThreads();
        all[String(peerId)] = truncated.map(m => ({ ...m, time: new Date(m.time).toISOString() as any }));
        localStorage.setItem(this.storageKeyThreads, JSON.stringify(all));
      } catch {}
    }
  }
}
