import { Injectable } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'waiting' | 'matched' | 'chatting' | 'partner-left';

export interface SignalingMessage {
  type: 'matched' | 'waiting' | 'offer' | 'answer' | 'ice-candidate' | 'partner-disconnected';
  role?: 'initiator' | 'receiver';
  payload?: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

@Injectable({
  providedIn: 'root'
})
export class MatchmakingService {
  private ws: WebSocket | null = null;
  private messages$ = new Subject<SignalingMessage>();
  private statusSubject = new BehaviorSubject<ConnectionStatus>('disconnected');
  
  status$ = this.statusSubject.asObservable();
  
  get currentStatus(): ConnectionStatus {
    return this.statusSubject.value;
  }
  
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    
    this.statusSubject.next('connecting');
    
    this.ws = new WebSocket(environment.workerUrl);
    
    this.ws.onopen = () => {
      console.log('[Matchmaking] Connected to server');
      this.send({ type: 'find-match' });
    };
    
    this.ws.onmessage = (event) => {
      try {
        const message: SignalingMessage = JSON.parse(event.data);
        console.log('[Matchmaking] Received:', message.type);
        
        if (message.type === 'waiting') {
          this.statusSubject.next('waiting');
        } else if (message.type === 'matched') {
          this.statusSubject.next('matched');
        } else if (message.type === 'partner-disconnected') {
          this.statusSubject.next('partner-left');
        }
        
        this.messages$.next(message);
      } catch (e) {
        console.error('[Matchmaking] Failed to parse message:', e);
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('[Matchmaking] WebSocket error:', error);
    };
    
    this.ws.onclose = () => {
      console.log('[Matchmaking] Disconnected from server');
      this.statusSubject.next('disconnected');
    };
  }
  
  send(message: { type: string; payload?: unknown }): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
  
  findNext(): void {
    this.statusSubject.next('waiting');
    this.send({ type: 'next' });
  }
  
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.statusSubject.next('disconnected');
  }
  
  setChatting(): void {
    this.statusSubject.next('chatting');
  }
  
  get onMessage$() {
    return this.messages$.asObservable();
  }
}
