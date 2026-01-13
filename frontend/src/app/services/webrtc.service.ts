import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { MatchmakingService, SignalingMessage } from './matchmaking.service';
import { environment } from '../../environments/environment';

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
  
  // Message queue to handle async race conditions
  private messageQueue: SignalingMessage[] = [];
  private isProcessing = false;
  private isInitialized = false;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private useWebSocketFallback = false;
  
  messages$ = this.messagesSubject.asObservable();
  connectionReady$ = this.connectionReadySubject.asObservable();
  
  // Default ICE servers (STUN only) - will be enhanced with TURN from server
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
  ];
  private iceServersLoaded = false;
  
  private get rtcConfig(): RTCConfiguration {
    return {
      iceServers: this.iceServers,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    };
  }
  
  constructor() {
    this.matchmaking.onMessage$.subscribe((message) => {
      this.queueMessage(message);
    });
    
    // Fetch ICE servers from worker on startup
    this.fetchIceServers();
  }
  
  private async fetchIceServers(): Promise<void> {
    try {
      // Convert WebSocket URL to HTTP URL for the ICE servers endpoint
      const wsUrl = environment.workerUrl;
      const httpUrl = wsUrl.replace('wss://', 'https://').replace('ws://', 'http://').replace('/connect', '/ice-servers');
      
      const response = await fetch(httpUrl);
      if (response.ok) {
        const data = await response.json();
        if (data.iceServers && data.iceServers.length > 0) {
          this.iceServers = data.iceServers;
          console.log('[WebRTC] Loaded ICE servers from server:', this.iceServers.length, 'servers');
          
          // Check if we have TURN
          const hasTurn = this.iceServers.some(s => 
            (typeof s.urls === 'string' && s.urls.startsWith('turn:')) ||
            (Array.isArray(s.urls) && s.urls.some(u => u.startsWith('turn:')))
          );
          console.log('[WebRTC] TURN available:', hasTurn);
        }
      }
      this.iceServersLoaded = true;
    } catch (e) {
      console.warn('[WebRTC] Could not fetch ICE servers, using defaults:', e);
      this.iceServersLoaded = true; // Still mark as loaded to not block connections
    }
  }
  
  private async waitForIceServers(): Promise<void> {
    // Wait up to 3 seconds for ICE servers to load
    const maxWait = 3000;
    const interval = 50;
    let waited = 0;
    
    while (!this.iceServersLoaded && waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, interval));
      waited += interval;
    }
  }
  
  private queueMessage(message: SignalingMessage): void {
    this.messageQueue.push(message);
    this.processQueue();
  }
  
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      await this.handleSignalingMessage(message);
    }
    
    this.isProcessing = false;
  }
  
  private async handleSignalingMessage(message: SignalingMessage): Promise<void> {
    switch (message.type) {
      case 'matched':
        await this.initConnection(message.role === 'initiator');
        break;
        
      case 'offer':
        if (!this.isInitialized || !this.peerConnection) {
          console.error('[WebRTC] Received offer but not initialized');
          break;
        }
        if (message.payload) {
          try {
            await this.peerConnection.setRemoteDescription(
              new RTCSessionDescription(message.payload as RTCSessionDescriptionInit)
            );
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            this.matchmaking.send({ type: 'answer', payload: answer });
            console.log('[WebRTC] Sent answer');
          } catch (e) {
            console.error('[WebRTC] Error handling offer:', e);
          }
        }
        break;
        
      case 'answer':
        if (!this.isInitialized || !this.peerConnection) {
          console.error('[WebRTC] Received answer but not initialized');
          break;
        }
        if (message.payload) {
          try {
            await this.peerConnection.setRemoteDescription(
              new RTCSessionDescription(message.payload as RTCSessionDescriptionInit)
            );
            console.log('[WebRTC] Set remote description (answer)');
          } catch (e) {
            console.error('[WebRTC] Error handling answer:', e);
          }
        }
        break;
        
      case 'ice-candidate':
        if (!this.peerConnection) {
          console.warn('[WebRTC] Received ICE candidate but no peer connection');
          break;
        }
        if (message.payload) {
          try {
            const candidate = new RTCIceCandidate(message.payload as RTCIceCandidateInit);
            const candidateStr = (message.payload as RTCIceCandidateInit).candidate || '';
            const type = candidateStr.includes('typ relay') ? 'relay' : 
                        candidateStr.includes('typ srflx') ? 'srflx' : 
                        candidateStr.includes('typ host') ? 'host' : 'unknown';
            console.log(`[WebRTC] Remote ICE candidate: ${type} - ${candidateStr.substring(0, 60)}...`);
            await this.peerConnection.addIceCandidate(candidate);
          } catch (e) {
            console.error('[WebRTC] Error adding ICE candidate:', e);
          }
        }
        break;
        
      case 'partner-disconnected':
        this.cleanup();
        break;
        
      case 'chat-message':
        // Handle messages relayed through WebSocket (fallback mode)
        if (message.payload) {
          const payload = message.payload as { text: string };
          const chatMessage: ChatMessage = {
            id: crypto.randomUUID(),
            text: payload.text,
            from: 'stranger',
            timestamp: new Date()
          };
          this.messagesSubject.next(chatMessage);
        }
        break;
    }
  }
  
  private async initConnection(isInitiator: boolean): Promise<void> {
    console.log('[WebRTC] Initializing connection, initiator:', isInitiator);
    
    // Wait for ICE servers to be loaded (including TURN)
    await this.waitForIceServers();
    console.log('[WebRTC] ICE servers ready:', this.iceServers.length, 'servers');
    
    this.isInitialized = false;
    this.cleanup();
    
    this.peerConnection = new RTCPeerConnection(this.rtcConfig);
    
    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const candidateType = event.candidate.type || 'unknown';
        const protocol = event.candidate.protocol || 'unknown';
        console.log(`[WebRTC] Local ICE candidate: ${candidateType} (${protocol}) - ${event.candidate.candidate.substring(0, 80)}...`);
        
        this.matchmaking.send({
          type: 'ice-candidate',
          payload: event.candidate.toJSON()
        });
      } else {
        console.log('[WebRTC] ICE gathering complete');
      }
    };
    
    // Connection state monitoring
    this.peerConnection.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', this.peerConnection?.connectionState);
      if (this.peerConnection?.connectionState === 'connected') {
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        this.matchmaking.setChatting();
      } else if (this.peerConnection?.connectionState === 'failed') {
        console.warn('[WebRTC] P2P connection failed');
        // Clear timeout since we're handling failure now
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        // Fall back to WebSocket relay
        this.enableWebSocketFallback();
      }
    };
    
    // ICE connection state monitoring
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE connection state:', this.peerConnection?.iceConnectionState);
      if (this.peerConnection?.iceConnectionState === 'failed') {
        console.error('[WebRTC] ICE connection failed - attempting restart');
        this.peerConnection?.restartIce();
      } else if (this.peerConnection?.iceConnectionState === 'disconnected') {
        console.warn('[WebRTC] ICE disconnected - waiting for reconnection...');
      }
    };
    
    // ICE gathering state monitoring  
    this.peerConnection.onicegatheringstatechange = () => {
      console.log('[WebRTC] ICE gathering state:', this.peerConnection?.iceGatheringState);
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
    
    this.isInitialized = true;
    console.log('[WebRTC] Connection initialized, ready for signaling');
    
    // Set connection timeout - if not connected within 10 seconds, fall back to WebSocket relay
    this.connectionTimeout = setTimeout(() => {
      if (this.peerConnection?.connectionState !== 'connected' && !this.useWebSocketFallback) {
        console.warn('[WebRTC] Connection timeout reached');
        this.enableWebSocketFallback();
      }
    }, 10000);
  }
  
  private setupDataChannel(): void {
    if (!this.dataChannel) return;
    
    this.dataChannel.onopen = () => {
      console.log('[WebRTC] Data channel open - ready to chat!');
      // Clear connection timeout
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      this.connectionReadySubject.next();
      // Update status to chatting as soon as data channel opens (faster than waiting for connectionState)
      this.matchmaking.setChatting();
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
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      text,
      from: 'me',
      timestamp: new Date()
    };
    
    // Try P2P first, fall back to WebSocket relay
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({ text }));
    } else if (this.useWebSocketFallback) {
      // Use WebSocket relay through the matchmaking server
      this.matchmaking.send({ type: 'chat-message', payload: { text } });
    } else {
      console.warn('[WebRTC] Cannot send message, no connection available');
      return null;
    }
    
    this.messagesSubject.next(message);
    return message;
  }
  
  private enableWebSocketFallback(): void {
    if (this.useWebSocketFallback) return; // Already in fallback mode
    
    console.log('[WebRTC] Enabling WebSocket relay fallback');
    this.useWebSocketFallback = true;
    
    // Close P2P components but keep WebSocket alive
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    // Notify that we're ready to chat (via relay)
    this.matchmaking.setChatting();
  }
  
  isConnected(): boolean {
    return this.dataChannel?.readyState === 'open' || this.useWebSocketFallback;
  }
  
  cleanup(): void {
    this.isInitialized = false;
    this.useWebSocketFallback = false;
    
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
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
