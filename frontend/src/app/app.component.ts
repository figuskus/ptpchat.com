import { Component, inject, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { MatchmakingService, ConnectionStatus } from './services/matchmaking.service';
import { WebRTCService, ChatMessage } from './services/webrtc.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  animations: [
    trigger('messageAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('400ms ease-out', style({ opacity: 1 }))
      ])
    ]),
    trigger('slideUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(30px)' }),
        animate('500ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ],
  template: `
    <div class="app-container">
      <!-- Header -->
      <header class="header" @fadeIn>
        <div class="logo">
          <span class="logo-icon">◈</span>
          <span class="logo-text">PTP<span class="accent">Chat</span></span>
        </div>
        <div class="status-indicator" [class]="status">
          <span class="status-dot"></span>
          <span class="status-text">{{ getStatusText() }}</span>
        </div>
      </header>

      <!-- Main Content -->
      <main class="main-content">
        <!-- Welcome Screen -->
        @if (status === 'disconnected') {
          <div class="welcome-screen" @slideUp>
            <div class="welcome-content">
              <h1 class="title">
                Meet <span class="gradient-text">Strangers</span>
                <br>Instantly
              </h1>
              <p class="subtitle">
                Anonymous peer-to-peer chat. No accounts, no tracking.
                <br>Just pure connection.
              </p>
              <button class="btn-primary" (click)="startChat()">
                <span class="btn-icon">⚡</span>
                Start Chatting
              </button>
              <div class="features">
                <div class="feature">
                  <span class="feature-icon">🔒</span>
                  <span>End-to-end P2P</span>
                </div>
                <div class="feature">
                  <span class="feature-icon">👤</span>
                  <span>Anonymous</span>
                </div>
                <div class="feature">
                  <span class="feature-icon">⚡</span>
                  <span>Instant</span>
                </div>
              </div>
            </div>
          </div>
        }

        <!-- Connecting/Waiting Screen -->
        @if (status === 'connecting' || status === 'waiting' || status === 'matched') {
          <div class="loading-screen" @fadeIn>
            <div class="loader">
              <div class="loader-ring"></div>
              <div class="loader-ring"></div>
              <div class="loader-ring"></div>
            </div>
            <h2 class="loading-text">
              @if (status === 'connecting') {
                Connecting to network...
              } @else if (status === 'waiting') {
                Looking for a stranger...
              } @else {
                Establishing P2P connection...
              }
            </h2>
            <p class="loading-subtext">This usually takes a few seconds</p>
            <button class="btn-secondary" (click)="disconnect()">Cancel</button>
          </div>
        }

        <!-- Chat Screen -->
        @if (status === 'chatting' || status === 'partner-left') {
          <div class="chat-screen" @fadeIn>
            <!-- Messages Area -->
            <div class="messages-container" #messagesContainer>
              @if (messages.length === 0 && status === 'chatting') {
                <div class="chat-intro">
                  <div class="intro-icon">👋</div>
                  <p>You're now connected with a stranger!</p>
                  <p class="intro-hint">Say hello to start the conversation</p>
                </div>
              }
              
              @for (message of messages; track message.id) {
                <div 
                  class="message" 
                  [class.mine]="message.from === 'me'"
                  [class.stranger]="message.from === 'stranger'"
                  @messageAnimation
                >
                  <div class="message-bubble">
                    <span class="message-text">{{ message.text }}</span>
                    <span class="message-time">{{ formatTime(message.timestamp) }}</span>
                  </div>
                </div>
              }

              @if (status === 'partner-left') {
                <div class="system-message" @messageAnimation>
                  <span class="system-icon">👋</span>
                  Stranger has disconnected
                </div>
              }
            </div>

            <!-- Input Area -->
            <div class="input-area">
              @if (status === 'partner-left') {
                <button class="btn-primary full-width" (click)="findNext()">
                  <span class="btn-icon">🔄</span>
                  Find New Stranger
                </button>
              } @else {
                <div class="input-wrapper">
                  <input
                    type="text"
                    [(ngModel)]="messageInput"
                    (keyup.enter)="sendMessage()"
                    placeholder="Type a message..."
                    class="message-input"
                    #messageInputRef
                  />
                  <button 
                    class="btn-send" 
                    (click)="sendMessage()"
                    [disabled]="!messageInput.trim()"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"/>
                    </svg>
                  </button>
                </div>
                <button class="btn-next" (click)="findNext()">
                  Next Stranger
                  <span class="next-icon">→</span>
                </button>
              }
            </div>
          </div>
        }
      </main>

      <!-- Footer -->
      <footer class="footer" @fadeIn>
        <span>Built with WebRTC & Cloudflare Workers</span>
      </footer>
    </div>
  `,
  styles: [`
    .app-container {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      height: 100vh;
      max-width: 900px;
      margin: 0 auto;
      padding: 0 20px;
    }

    // Header
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 0;
      border-bottom: 1px solid var(--border-color);
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 1.5rem;
      font-weight: 700;
    }

    .logo-icon {
      color: var(--accent-primary);
      font-size: 1.8rem;
    }

    .logo-text .accent {
      color: var(--accent-primary);
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: var(--bg-secondary);
      border-radius: 20px;
      font-size: 0.85rem;
      font-family: var(--font-mono);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--text-muted);
    }

    .status-indicator.connecting .status-dot,
    .status-indicator.waiting .status-dot,
    .status-indicator.matched .status-dot {
      background: #fbbf24;
      animation: pulse 1.5s infinite;
    }

    .status-indicator.chatting .status-dot {
      background: var(--accent-primary);
      box-shadow: 0 0 10px var(--accent-primary);
    }

    .status-indicator.partner-left .status-dot {
      background: var(--accent-secondary);
    }

    // Main Content
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    // Welcome Screen
    .welcome-screen {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .welcome-content {
      text-align: center;
      max-width: 600px;
    }

    .title {
      font-size: 3.5rem;
      font-weight: 700;
      line-height: 1.1;
      margin-bottom: 24px;
      letter-spacing: -0.02em;
    }

    .gradient-text {
      background: linear-gradient(135deg, var(--accent-primary), var(--accent-tertiary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subtitle {
      font-size: 1.2rem;
      color: var(--text-secondary);
      margin-bottom: 40px;
      line-height: 1.6;
    }

    .btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 18px 40px;
      background: linear-gradient(135deg, var(--accent-primary), #00cc88);
      color: var(--bg-primary);
      font-size: 1.1rem;
      font-weight: 600;
      border-radius: 12px;
      transition: all var(--transition-medium);
      
      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 40px rgba(0, 255, 170, 0.3);
      }
      
      &:active {
        transform: translateY(0);
      }
    }

    .btn-primary.full-width {
      width: 100%;
      justify-content: center;
    }

    .btn-icon {
      font-size: 1.2rem;
    }

    .features {
      display: flex;
      justify-content: center;
      gap: 40px;
      margin-top: 60px;
    }

    .feature {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-secondary);
      font-size: 0.95rem;
    }

    .feature-icon {
      font-size: 1.2rem;
    }

    // Loading Screen
    .loading-screen {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 30px;
    }

    .loader {
      position: relative;
      width: 80px;
      height: 80px;
    }

    .loader-ring {
      position: absolute;
      width: 100%;
      height: 100%;
      border: 3px solid transparent;
      border-top-color: var(--accent-primary);
      border-radius: 50%;
      animation: spin 1.5s linear infinite;
      
      &:nth-child(2) {
        width: 60%;
        height: 60%;
        top: 20%;
        left: 20%;
        border-top-color: var(--accent-tertiary);
        animation-duration: 1.2s;
        animation-direction: reverse;
      }
      
      &:nth-child(3) {
        width: 30%;
        height: 30%;
        top: 35%;
        left: 35%;
        border-top-color: var(--accent-secondary);
        animation-duration: 0.9s;
      }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .loading-text {
      font-size: 1.5rem;
      font-weight: 500;
    }

    .loading-subtext {
      color: var(--text-muted);
      font-size: 0.9rem;
    }

    .btn-secondary {
      padding: 12px 30px;
      background: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      font-size: 0.95rem;
      
      &:hover {
        border-color: var(--text-secondary);
        color: var(--text-primary);
      }
    }

    // Chat Screen
    .chat-screen {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 20px 0;
      overflow: hidden;
    }

    .messages-container {
      flex: 1;
      overflow-y: auto;
      padding: 20px 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .chat-intro {
      text-align: center;
      padding: 40px;
      color: var(--text-secondary);
      
      .intro-icon {
        font-size: 3rem;
        margin-bottom: 16px;
      }
      
      .intro-hint {
        margin-top: 8px;
        font-size: 0.9rem;
        color: var(--text-muted);
      }
    }

    .message {
      display: flex;
      
      &.mine {
        justify-content: flex-end;
        
        .message-bubble {
          background: linear-gradient(135deg, var(--accent-primary), #00cc88);
          color: var(--bg-primary);
          border-radius: 20px 20px 4px 20px;
        }
        
        .message-time {
          color: rgba(0, 0, 0, 0.5);
        }
      }
      
      &.stranger {
        justify-content: flex-start;
        
        .message-bubble {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: 20px 20px 20px 4px;
        }
      }
    }

    .message-bubble {
      max-width: 70%;
      padding: 12px 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .message-text {
      font-size: 1rem;
      line-height: 1.5;
      word-wrap: break-word;
    }

    .message-time {
      font-size: 0.7rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
      align-self: flex-end;
    }

    .system-message {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 16px;
      background: var(--bg-secondary);
      border-radius: 12px;
      color: var(--text-secondary);
      font-size: 0.95rem;
      margin: 20px 0;
    }

    // Input Area
    .input-area {
      padding-top: 20px;
      border-top: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .input-wrapper {
      display: flex;
      gap: 12px;
    }

    .message-input {
      flex: 1;
      padding: 16px 20px;
      font-size: 1rem;
      border-radius: 12px;
    }

    .btn-send {
      width: 52px;
      height: 52px;
      background: linear-gradient(135deg, var(--accent-primary), #00cc88);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      
      svg {
        width: 22px;
        height: 22px;
        color: var(--bg-primary);
      }
      
      &:hover:not(:disabled) {
        transform: scale(1.05);
      }
      
      &:disabled {
        background: var(--bg-tertiary);
        
        svg {
          color: var(--text-muted);
        }
      }
    }

    .btn-next {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px;
      background: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      font-size: 0.9rem;
      
      &:hover {
        border-color: var(--accent-secondary);
        color: var(--accent-secondary);
      }
      
      .next-icon {
        transition: transform var(--transition-fast);
      }
      
      &:hover .next-icon {
        transform: translateX(4px);
      }
    }

    // Footer
    .footer {
      padding: 20px 0;
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-muted);
      border-top: 1px solid var(--border-color);
    }

    // Responsive
    @media (max-width: 640px) {
      .title {
        font-size: 2.5rem;
      }
      
      .features {
        flex-direction: column;
        gap: 20px;
      }
      
      .message-bubble {
        max-width: 85%;
      }
    }
  `]
})
export class AppComponent implements OnDestroy, AfterViewChecked {
  private matchmaking = inject(MatchmakingService);
  private webrtc = inject(WebRTCService);
  private destroy$ = new Subject<void>();
  
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('messageInputRef') messageInputRef!: ElementRef;
  
  status: ConnectionStatus = 'disconnected';
  messages: ChatMessage[] = [];
  messageInput = '';
  
  private shouldScrollToBottom = false;
  
  constructor() {
    this.matchmaking.status$.pipe(takeUntil(this.destroy$)).subscribe((status) => {
      this.status = status;
      
      if (status === 'chatting') {
        setTimeout(() => this.messageInputRef?.nativeElement?.focus(), 100);
      }
    });
    
    this.webrtc.messages$.pipe(takeUntil(this.destroy$)).subscribe((message) => {
      this.messages.push(message);
      this.shouldScrollToBottom = true;
    });
  }
  
  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.webrtc.cleanup();
    this.matchmaking.disconnect();
  }
  
  startChat(): void {
    this.messages = [];
    this.matchmaking.connect();
  }
  
  disconnect(): void {
    this.webrtc.cleanup();
    this.matchmaking.disconnect();
  }
  
  findNext(): void {
    this.messages = [];
    this.webrtc.cleanup();
    this.matchmaking.findNext();
  }
  
  sendMessage(): void {
    const text = this.messageInput.trim();
    if (!text) return;
    
    this.webrtc.sendMessage(text);
    this.messageInput = '';
    this.shouldScrollToBottom = true;
  }
  
  getStatusText(): string {
    switch (this.status) {
      case 'disconnected': return 'Offline';
      case 'connecting': return 'Connecting...';
      case 'waiting': return 'Searching...';
      case 'matched': return 'Connecting P2P...';
      case 'chatting': return 'Connected';
      case 'partner-left': return 'Disconnected';
      default: return 'Unknown';
    }
  }
  
  formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const el = this.messagesContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }
}
