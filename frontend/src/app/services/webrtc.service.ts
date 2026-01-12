import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { MatchmakingService, SignalingMessage } from './matchmaking.service';

export interface ChatMessage {
  id: string;
  text: string;
  from: 'me' | 'stranger';
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class WebRTCService {
  private matchmaking = inject(MatchmakingService);
  
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  
  private messagesSubject = new Subject<ChatMessage>();
  private connectionReadySubject = new Subject<void>();
  
  messages$ = this.messagesSubject.asObservable();
  connectionReady$ = this.connectionReadySubject.asObservable();
  
  private readonly rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };
  
  constructor() {
    this.matchmaking.onMessage$.subscribe((message) => {
      this.handleSignalingMessage(message);
    });
  }
  
  private async handleSignalingMessage(message: SignalingMessage): Promise<void> {
    switch (message.type) {
      case 'matched':
        await this.initConnection(message.role === 'initiator');
        break;
        
      case 'offer':
        if (message.payload && this.peerConnection) {
          await this.peerConnection.setRemoteDescription(
            new RTCSessionDescription(message.payload as RTCSessionDescriptionInit)
          );
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          this.matchmaking.send({ type: 'answer', payload: answer });
        }
        break;
        
      case 'answer':
        if (message.payload && this.peerConnection) {
          await this.peerConnection.setRemoteDescription(
            new RTCSessionDescription(message.payload as RTCSessionDescriptionInit)
          );
        }
        break;
        
      case 'ice-candidate':
        if (message.payload && this.peerConnection) {
          try {
            await this.peerConnection.addIceCandidate(
              new RTCIceCandidate(message.payload as RTCIceCandidateInit)
            );
          } catch (e) {
            console.error('[WebRTC] Error adding ICE candidate:', e);
          }
        }
        break;
        
      case 'partner-disconnected':
        this.cleanup();
        break;
    }
  }
  
  private async initConnection(isInitiator: boolean): Promise<void> {
    console.log('[WebRTC] Initializing connection, initiator:', isInitiator);
    
    this.cleanup();
    
    this.peerConnection = new RTCPeerConnection(this.rtcConfig);
    
    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.matchmaking.send({
          type: 'ice-candidate',
          payload: event.candidate.toJSON()
        });
      }
    };
    
    // Connection state monitoring
    this.peerConnection.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', this.peerConnection?.connectionState);
      if (this.peerConnection?.connectionState === 'connected') {
        this.matchmaking.setChatting();
      }
    };
    
    if (isInitiator) {
      // Create data channel
      this.dataChannel = this.peerConnection.createDataChannel('chat', {
        ordered: true
      });
      this.setupDataChannel();
      
      // Create and send offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      this.matchmaking.send({ type: 'offer', payload: offer });
    } else {
      // Wait for data channel from initiator
      this.peerConnection.ondatachannel = (event) => {
        console.log('[WebRTC] Data channel received');
        this.dataChannel = event.channel;
        this.setupDataChannel();
      };
    }
  }
  
  private setupDataChannel(): void {
    if (!this.dataChannel) return;
    
    this.dataChannel.onopen = () => {
      console.log('[WebRTC] Data channel open');
      this.connectionReadySubject.next();
    };
    
    this.dataChannel.onclose = () => {
      console.log('[WebRTC] Data channel closed');
    };
    
    this.dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          text: data.text,
          from: 'stranger',
          timestamp: new Date()
        };
        this.messagesSubject.next(message);
      } catch (e) {
        console.error('[WebRTC] Failed to parse message:', e);
      }
    };
  }
  
  sendMessage(text: string): ChatMessage | null {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.warn('[WebRTC] Cannot send message, data channel not ready');
      return null;
    }
    
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      text,
      from: 'me',
      timestamp: new Date()
    };
    
    this.dataChannel.send(JSON.stringify({ text }));
    this.messagesSubject.next(message);
    
    return message;
  }
  
  isConnected(): boolean {
    return this.dataChannel?.readyState === 'open';
  }
  
  cleanup(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
}
