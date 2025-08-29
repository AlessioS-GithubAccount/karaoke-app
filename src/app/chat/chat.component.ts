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
  // Gate (vedi guard: di solito non serve, ma lo teniamo)
  mustLogin = false;

  // Presence
  online: OnlineUser[] = [];
  activePeer: OnlineUser | null = null;

  // Stato chat
  inputText = '';
  messages: UiMessage[] = [];                     // thread attivo
  private messagesByPeer = new Map<number, UiMessage[]>(); // thread per peerId

  private subs: Subscription[] = [];
  private myUserId = this.getMyUserId();
  private myUsername = localStorage.getItem('username') || 'Me';

  constructor(private realtime: ChatRealtimeService, private router: Router) {}

  ngOnInit(): void {
    // se non loggato mostro gate (NB: se la route è protetta da guard, non arriverai qui)
    this.mustLogin = !Boolean(localStorage.getItem('token'));

    this.realtime.connect();

    // Presence list
    this.subs.push(
      this.realtime.onlineUsers$.subscribe(list => {
        this.online = list;
      })
    );

    // Active peer changes
    this.subs.push(
      this.realtime.activePeer$.subscribe(peer => {
        this.activePeer = peer;
        const thread = peer ? (this.messagesByPeer.get(peer.id) || []) : [];
        this.messages = thread.slice();
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
          // se il messaggio è in arrivo da qualcuno -> quel qualcuno è il peer
          (m.userId && m.userId !== this.myUserId) ? m.userId :
          // se è un eco dal server dei miei messaggi -> il peer è il destinatario
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
          setTimeout(() => {
            const el = document.getElementById('chat-scroll');
            if (el) el.scrollTop = el.scrollHeight;
          }, 0);
        }
      })
    );
  }

  selectPeer(u: OnlineUser): void {
    this.realtime.selectPeer(u);
  }

  send(): void {
    const text = this.inputText.trim();
    if (!text || !this.activePeer) return;

    // invio al peer attivo
    this.realtime.sendToActive(text);

    // eco immediato in UI (il server manderà comunque l'evento dm:message)
    const ui: UiMessage = {
      id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
      author: this.myUsername,
      text,
      time: new Date(),
      me: true,
    };
    const arr = this.messagesByPeer.get(this.activePeer.id) || [];
    arr.push(ui);
    this.messagesByPeer.set(this.activePeer.id, arr);
    this.messages = arr.slice();
    this.inputText = '';

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
}
