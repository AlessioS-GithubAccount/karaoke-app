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

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
})
export class ChatComponent implements OnInit, OnDestroy {
  mustLogin = false;

  // Presence
  online: OnlineUser[] = [];
  activePeer: OnlineUser | null = null;

  // Stato presenza manuale (UI + storage)
  isOnline = true;

  // Stato chat
  inputText = '';
  messages: UiMessage[] = [];                     // thread attivo
  private messagesByPeer = new Map<number, UiMessage[]>(); // thread per peerId

  // Unread (mostrati nella lista)
  unreadByPeer: Record<number, number> = {};

  private subs: Subscription[] = [];
  private myUserId = this.getMyUserId();
  private isFocused = true;

  constructor(private realtime: ChatRealtimeService, private router: Router) {}

  ngOnInit(): void {
    this.mustLogin = !Boolean(localStorage.getItem('token'));

    // Presenza manuale: carico da storage (default true)
    const saved = localStorage.getItem('chat:manualOnline');
    this.isOnline = saved !== '0';
    this.realtime.setManualOnline(this.isOnline);

    this.realtime.connect();

    // Presence list
    this.subs.push(
      this.realtime.onlineUsers$.subscribe(list => {
        // (opzionale) escludi me stesso dalla lista
        const myId = this.myUserId;
        this.online = myId ? list.filter(u => u.id !== myId) : list;
      })
    );

    // Unread map → oggetto per il template
    this.subs.push(
      this.realtime.unreadByPeer$.subscribe(map => {
        const obj: Record<number, number> = {};
        map.forEach((v, k) => obj[k] = v);
        this.unreadByPeer = obj;
      })
    );

    // Active peer changes
    this.subs.push(
      this.realtime.activePeer$.subscribe(peer => {
        this.activePeer = peer;
        const thread = peer ? (this.messagesByPeer.get(peer.id) || []) : [];
        this.messages = thread.slice();

        // quando apro un peer, azzero i non letti
        if (peer) this.realtime.markRead(peer.id);

        // autoscroll
        setTimeout(() => {
          const el = document.getElementById('chat-scroll');
          if (el) el.scrollTop = el.scrollHeight;
        }, 0);
      })
    );

    // DM messages stream (tutti i DM, li smisto per peer)
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
        this.messagesByPeer.set(peerId, arr);

        if (this.activePeer?.id === peerId) {
          this.messages = arr.slice();

          // se sto guardando la chat ed ho focus, considera "letti"
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
  }

  /** Toggle online/offline (UI + storage + ping servizio) */
  toggleOnline(): void {
    this.isOnline = !this.isOnline;
    localStorage.setItem('chat:manualOnline', this.isOnline ? '1' : '0');
    this.realtime.setManualOnline(this.isOnline);
  }

  selectPeer(u: OnlineUser): void {
    this.realtime.selectPeer(u);
  }

  send(): void {
    const text = this.inputText.trim();
    if (!text || !this.activePeer) return;

    // invio al peer attivo
    this.realtime.sendToActive(text);

    // eco immediato in UI (il server manderà comunque l'evento chat:message)
    const ui: UiMessage = {
      id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
      author: this.getMyUsername(),
      text,
      time: new Date(),
      me: true,
    };
    const arr = this.messagesByPeer.get(this.activePeer.id) || [];
    arr.push(ui);
    this.messagesByPeer.set(this.activePeer.id, arr);
    this.messages = arr.slice();
    this.inputText = '';

    // quando scrivo, ovviamente non ci sono non letti per questa chat
    this.realtime.markRead(this.activePeer.id);

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
    this.realtime.disconnect();
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
}
