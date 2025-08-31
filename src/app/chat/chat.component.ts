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

type ThreadsMap = Record<string, UiMessage[]>; // key = peerId string

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
})
export class ChatComponent implements OnInit, OnDestroy {
  private static readonly THREAD_MAX = 200; // max messaggi per thread per non saturare storage

  mustLogin = false;

  // Presence
  online: OnlineUser[] = [];
  activePeer: OnlineUser | null = null;

  // Stato chat
  inputText = '';
  messages: UiMessage[] = [];                     // thread attivo
  private messagesByPeer = new Map<number, UiMessage[]>(); // thread per peerId

  // Unread (mostrati nella lista)
  unreadByPeer: Record<number, number> = {};

  // 🔌 stato online per il toggle UI (deriva da manualOffline del service)
  isOnline = true;

  private subs: Subscription[] = [];
  private myUserId = this.getMyUserId();
  private isFocused = true;

  // ====== Storage keys per utente ======
  private storageKeyThreads = this.myUserId ? `chat:${this.myUserId}:threads` : 'chat:0:threads';
  private storageKeyUnread  = this.myUserId ? `chat:${this.myUserId}:unread`  : 'chat:0:unread';
  private storageKeyActive  = this.myUserId ? `chat:${this.myUserId}:active`  : 'chat:0:active';

  constructor(private realtime: ChatRealtimeService, private router: Router) {}

  ngOnInit(): void {
    this.mustLogin = !Boolean(localStorage.getItem('token'));

    // sync stato online (manual offline invertito)
    this.isOnline = !this.realtime.manualOffline;
    this.subs.push(
      this.realtime.manualOffline$.subscribe(off => this.isOnline = !off)
    );

    // Carica stato locale prima di agganciare gli stream
    this.loadAllFromStorage();

    // Presence list
    this.subs.push(
      this.realtime.onlineUsers$.subscribe(list => {
        const myId = this.myUserId;
        this.online = myId ? list.filter(u => u.id !== myId) : list;
      })
    );

    // Unread map → oggetto per il template (e persiste)
    this.subs.push(
      this.realtime.unreadByPeer$.subscribe(map => {
        const obj: Record<number, number> = {};
        map.forEach((v, k) => obj[k] = v);
        this.unreadByPeer = obj;
        this.persistUnread();
      })
    );

    // Active peer changes
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

    // DM messages stream (tutti i DM, li smisto per peer) + persistenza
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
        // tronca thread se supera la soglia
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

    // focus/blur finestra: se torno con un peer aperto, azzero
    window.addEventListener('focus', this.onFocus);
    window.addEventListener('blur', this.onBlur);

    // Se esiste un peer attivo salvato e non è ancora selezionato, potrei selezionarlo
    const savedActive = this.readActivePeer();
    if (savedActive && !this.activePeer) {
      const fake: OnlineUser = { id: savedActive, username: '' }; // username arriverà dalla presence
      this.realtime.selectPeer(fake);
    }
  }

  // 🔘 switch manuale online/offline
  toggleOnline(): void {
    const nextOnline = !this.isOnline;
    if (nextOnline) this.realtime.touchActivity();
    this.realtime.setManualOffline(!nextOnline);
  }

  selectPeer(u: OnlineUser): void {
    this.realtime.selectPeer(u);
  }

  send(): void {
    const text = this.inputText.trim();
    if (!text || !this.activePeer) return;

    this.realtime.sendToActive(text);

    const ui: UiMessage = {
      id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
      author: this.getMyUsername(),
      text,
      time: new Date(),
      me: true,
    };
    const pid = this.activePeer.id;
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

  trackByIndex(i: number): number {
    return i;
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    window.removeEventListener('focus', this.onFocus);
    window.removeEventListener('blur', this.onBlur);
    // presenza globale gestita in AppComponent → niente disconnect qui
  }

  // ===== Helpers =====
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

  private getMyUsername(): string {
    return localStorage.getItem('username') || 'Me';
  }

  private onFocus = () => {
    this.isFocused = true;
    if (this.activePeer) this.realtime.markRead(this.activePeer.id);
  };

  private onBlur = () => {
    this.isFocused = false;
  };

  // ======== Persistenza locale ========

  /** Salva l'intero thread di un peer nel localStorage (per-utente). */
  private persistThread(peerId: number, arr: UiMessage[]): void {
    try {
      const all: ThreadsMap = this.readAllThreads();
      all[String(peerId)] = arr.map(m => ({
        ...m,
        time: new Date(m.time).toISOString() as unknown as any // serializzo Date
      }));
      localStorage.setItem(this.storageKeyThreads, JSON.stringify(all));
    } catch (e) {
      // Se lo storage è pieno, prova a compattare (rimuovi i thread più vecchi)
      this.compactThreadsAndRetry(peerId, arr);
    }
  }

  /** Salva gli unread correnti. */
  private persistUnread(): void {
    try {
      localStorage.setItem(this.storageKeyUnread, JSON.stringify(this.unreadByPeer || {}));
    } catch {}
  }

  /** Salva l'id del peer attivo (o null). */
  private persistActivePeer(peerId: number | null): void {
    try {
      if (peerId == null) localStorage.removeItem(this.storageKeyActive);
      else localStorage.setItem(this.storageKeyActive, String(peerId));
    } catch {}
  }

  /** Carica tutti i dati da storage (threads, unread, active). */
  private loadAllFromStorage(): void {
    // threads
    const all = this.readAllThreads();
    for (const key of Object.keys(all)) {
      const pid = Number(key);
      const arr = all[key].map(m => ({
        ...m,
        time: new Date(m.time) // rehydrate date
      }));
      this.messagesByPeer.set(pid, arr);
    }

    // unread
    try {
      const raw = localStorage.getItem(this.storageKeyUnread);
      if (raw) {
        const obj = JSON.parse(raw) as Record<number, number>;
        this.unreadByPeer = obj;
      }
    } catch {}

    // active
    const active = this.readActivePeer();
    if (active && !this.activePeer) {
      // Lo stato effettivo del peer sarà completato quando la presence arriva
      // Qui basta ricordare che c'era un thread aperto: lo rifletto in UI subito
      const thread = this.messagesByPeer.get(active) || [];
      this.messages = thread.slice();
    }
  }

  /** Ritorna la mappa completa threads dal localStorage. */
  private readAllThreads(): ThreadsMap {
    try {
      const raw = localStorage.getItem(this.storageKeyThreads);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as ThreadsMap;
    } catch {}
    return {};
  }

  /** Ritorna l'id del peer attivo salvato (se esiste). */
  private readActivePeer(): number | null {
    try {
      const raw = localStorage.getItem(this.storageKeyActive);
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    } catch { return null; }
  }

  /** Se lo storage è pieno, prova a eliminare i thread meno recenti e salva di nuovo. */
  private compactThreadsAndRetry(peerId: number, arr: UiMessage[]): void {
    try {
      const all = this.readAllThreads();
      const entries = Object.entries(all);

      if (entries.length === 0) return; // niente da compattare

      // Stima "recency" dall'ultimo messaggio di ciascun thread
      entries.sort((a, b) => {
        const lastA = (a[1].at(-1)?.time) ? new Date(a[1].at(-1)!.time as any).getTime() : 0;
        const lastB = (b[1].at(-1)?.time) ? new Date(b[1].at(-1)!.time as any).getTime() : 0;
        return lastA - lastB; // i più vecchi davanti
      });

      // Rimuovi i 1-2 thread più vecchi e ritenta
      const toRemove = Math.min(2, Math.max(1, Math.floor(entries.length / 5)));
      for (let i = 0; i < toRemove; i++) {
        delete all[entries[i][0]];
      }

      localStorage.setItem(this.storageKeyThreads, JSON.stringify(all));

      // Ritenta il salvataggio del thread corrente
      this.persistThread(peerId, arr);
    } catch {
      // come fallback, tronca il thread corrente a metà e ritenta ancora una volta
      const truncated = arr.slice(-Math.ceil(arr.length / 2));
      try {
        const all = this.readAllThreads();
        all[String(peerId)] = truncated.map(m => ({ ...m, time: new Date(m.time).toISOString() as any }));
        localStorage.setItem(this.storageKeyThreads, JSON.stringify(all));
      } catch {
        // alla peggio, lasciamo perdere
      }
    }
  }
}
