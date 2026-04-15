import { Component, inject, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { MatchmakingService, ConnectionStatus, OnlineStats } from './services/matchmaking.service';
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
        <div class="header-right">
          @if (onlineStats.online > 0) {
            <div class="online-count">
              <span class="online-dot"></span>
              <span>{{ onlineStats.online }} online</span>
            </div>
          }
          <div class="status-indicator" [class]="status">
            <span class="status-dot"></span>
            <span class="status-text">{{ getStatusText() }}</span>
          </div>
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

      <!-- Sponsored area: below main UI (slot styled in .footer-ad-card) -->
      <div class="footer-ad-wrap">
        <div class="footer-ad-card">
          <p class="footer-ad-label">Advertisement</p>
          <div id="ptpchat-ad-host" class="footer-ad-host"></div>
        </div>
      </div>

      <!-- Footer -->
      <footer class="footer" @fadeIn>
        <div class="footer-links">
          <a (click)="showPrivacy = true">Privacy Policy</a>
          <span class="separator">•</span>
          <a (click)="showTerms = true">Terms of Service</a>
        </div>
      </footer>
      
      <!-- Privacy Policy Modal -->
      @if (showPrivacy) {
        <div class="modal-overlay" (click)="showPrivacy = false">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>Privacy Policy</h2>
              <button class="modal-close" (click)="showPrivacy = false">×</button>
            </div>
            <div class="modal-body">
              <p><strong>Last updated:</strong> April 2026</p>
              
              <h3>1. Information We Collect</h3>
              <p>PTPChat is designed with privacy in mind. We collect minimal data:</p>
              <ul>
                <li><strong>No personal information:</strong> We don't require accounts, emails, or any identifying information.</li>
                <li><strong>No message storage:</strong> Messages are transmitted peer-to-peer and are never stored on our servers.</li>
                <li><strong>Connection data:</strong> We temporarily process IP addresses to facilitate WebRTC connections. This data is not logged or stored.</li>
              </ul>
              
              <h3>2. How We Use Information</h3>
              <p>The minimal data we process is used solely to:</p>
              <ul>
                <li>Match you with other users</li>
                <li>Facilitate peer-to-peer connections</li>
                <li>Relay messages only when direct P2P connection fails</li>
              </ul>
              
              <h3>3. Data Sharing</h3>
              <p>We do not sell, trade, or share your chat content or personal information with third parties for their own marketing. Advertising on PTPChat is delivered by independent third-party networks; how they process data for ad delivery and measurement is described in their respective privacy policies and in the sections below.</p>
              
              <h3>4. Advertising</h3>
              <p>We may display advertisements to help keep PTPChat free. Ads are served by third-party providers that operate their own systems. Those providers may collect or receive technical information (such as device or browser details, approximate region, or ad interaction data) to show relevant ads, limit how often you see an ad, and measure performance. We do not have access to the contents of your private chats for advertising purposes.</p>
              
              <h3>5. Cookies and similar technologies</h3>
              <p>PTPChat itself does not use first-party cookies for analytics or cross-site tracking. Third-party advertising partners may use cookies, local storage, pixels, or similar technologies as part of delivering ads. You can restrict or delete cookies through your browser settings; note that some site or ad features may not work as intended if you do so.</p>
              
              <h3>6. Contact</h3>
              <p>For privacy concerns, contact us through our website.</p>
            </div>
          </div>
        </div>
      }
      
      <!-- Terms of Service Modal -->
      @if (showTerms) {
        <div class="modal-overlay" (click)="showTerms = false">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>Terms of Service</h2>
              <button class="modal-close" (click)="showTerms = false">×</button>
            </div>
            <div class="modal-body">
              <p><strong>Last updated:</strong> April 2026</p>
              
              <h3>1. Acceptance of Terms</h3>
              <p>By using PTPChat, you agree to these terms. If you disagree, please do not use the service.</p>
              
              <h3>2. Service Description</h3>
              <p>PTPChat is a free, anonymous chat service that connects random users for text-based conversations using peer-to-peer technology. The service may display third-party advertisements.</p>
              
              <h3>3. User Conduct</h3>
              <p>You agree NOT to:</p>
              <ul>
                <li>Share illegal content or engage in illegal activities</li>
                <li>Harass, threaten, or abuse other users</li>
                <li>Share explicit content with minors</li>
                <li>Attempt to identify or track other users</li>
                <li>Use the service to spam or distribute malware</li>
                <li>Violate any applicable laws or regulations</li>
              </ul>
              
              <h3>4. Age Requirement</h3>
              <p>You must be at least 18 years old to use this service. By using PTPChat, you confirm you are 18 or older.</p>
              
              <h3>5. No Warranty</h3>
              <p>The service is provided "as is" without warranties of any kind. We do not guarantee availability, security, or reliability of the service.</p>
              
              <h3>6. Limitation of Liability</h3>
              <p>To the maximum extent permitted by law, we shall not be liable for any damages arising from your use of this service, including but not limited to direct, indirect, incidental, or consequential damages.</p>
              
              <h3>7. User Responsibility</h3>
              <p>You are solely responsible for your interactions with other users. We do not monitor conversations and cannot be held responsible for user behavior or content.</p>
              
              <h3>8. Termination</h3>
              <p>We reserve the right to terminate or suspend access to the service at any time without notice.</p>
              
              <h3>9. Changes to Terms</h3>
              <p>We may update these terms at any time. Continued use of the service constitutes acceptance of any changes.</p>
            </div>
          </div>
        </div>
      }
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
      width: 100%;
      margin: 0 auto;
      padding: 0 20px;
      overflow-x: hidden;
      box-sizing: border-box;
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
      gap: 8px;
      font-size: 1.4rem;
      font-weight: 600;
    }

    .logo-icon {
      color: var(--accent-primary);
      font-size: 1.5rem;
    }

    .logo-text .accent {
      color: var(--accent-primary);
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      font-size: 0.8rem;
      color: var(--text-secondary);
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
      background: #f59e0b;
      animation: pulse 1.5s infinite;
    }

    .status-indicator.chatting .status-dot {
      background: #22c55e;
    }

    .status-indicator.partner-left .status-dot {
      background: #ef4444;
    }

    // Main Content (min-height: 0 so flex layout can shrink; otherwise footer/ads stay clipped below the viewport)
    .main-content {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    // Welcome Screen
    .welcome-screen {
      flex: 1;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow-y: auto;
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
      background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
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
      padding: 16px 32px;
      background: var(--accent-primary);
      color: white;
      font-size: 1rem;
      font-weight: 600;
      border-radius: var(--radius-lg);
      transition: all var(--transition-medium);
      
      &:hover {
        background: #2563eb;
        transform: translateY(-1px);
        box-shadow: var(--shadow-lg);
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
      font-size: 1.1rem;
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
      min-height: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 30px;
      overflow-y: auto;
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
      border: 3px solid var(--border-color);
      border-top-color: var(--accent-primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      
      &:nth-child(2) {
        width: 65%;
        height: 65%;
        top: 17.5%;
        left: 17.5%;
        border-top-color: var(--accent-secondary);
        animation-duration: 1.5s;
        animation-direction: reverse;
      }
      
      &:nth-child(3) {
        width: 35%;
        height: 35%;
        top: 32.5%;
        left: 32.5%;
        border-top-color: var(--accent-tertiary);
        animation-duration: 2s;
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
      padding: 12px 24px;
      background: var(--bg-secondary);
      color: var(--text-secondary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      font-size: 0.9rem;
      
      &:hover {
        background: var(--bg-tertiary);
        border-color: var(--border-hover);
        color: var(--text-primary);
      }
    }

    // Chat Screen
    .chat-screen {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      padding: 20px 0;
      overflow: hidden;
    }

    .messages-container {
      flex: 1;
      min-height: 0;
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
          background: var(--accent-primary);
          color: white;
          border-radius: var(--radius-lg) var(--radius-lg) 4px var(--radius-lg);
        }
        
        .message-time {
          color: rgba(255, 255, 255, 0.7);
        }
      }
      
      &.stranger {
        justify-content: flex-start;
        
        .message-bubble {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px;
        }
      }
    }

    .message-bubble {
      max-width: 70%;
      padding: 12px 16px;
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
      width: 48px;
      height: 48px;
      background: var(--accent-primary);
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      
      svg {
        width: 20px;
        height: 20px;
        color: white;
      }
      
      &:hover:not(:disabled) {
        background: #2563eb;
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
      background: var(--bg-secondary);
      color: var(--text-secondary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      font-size: 0.85rem;
      
      &:hover {
        background: var(--bg-tertiary);
        border-color: var(--border-hover);
        color: var(--text-primary);
      }
      
      .next-icon {
        transition: transform var(--transition-fast);
      }
      
      &:hover .next-icon {
        transform: translateX(4px);
      }
    }

    // Footer — ad slot (card keeps layout stable; inner width matches fluid column)
    .footer-ad-wrap {
      flex-shrink: 0;
      width: 100%;
      padding: 10px 0 6px;
      border-top: 1px solid var(--border-color);
    }

    .footer-ad-card {
      width: 100%;
      max-width: min(728px, 100%);
      margin: 0 auto;
      padding: 22px 10px 12px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
      position: relative;
      box-sizing: border-box;
    }

    .footer-ad-label {
      position: absolute;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      margin: 0;
      font-size: 0.62rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      pointer-events: none;
    }

    .footer-ad-host {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }

    .footer-ad-host--mobile {
      width: 100%;
      max-width: min(300px, 100%);
      margin: 0 auto;
      min-height: 120px;
    }

    .footer-ad-host--desktop {
      width: 100%;
      max-width: 728px;
      margin: 0 auto;
      min-height: 90px;
    }

    .footer {
      padding: 12px 0 20px;
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    
    .footer-links {
      margin-top: 8px;
      
      a {
        color: var(--text-muted);
        cursor: pointer;
        transition: color var(--transition-fast);
        
        &:hover {
          color: var(--accent-primary);
        }
      }
      
      .separator {
        margin: 0 8px;
      }
    }
    
    // Header right section
    .header-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    
    .online-count {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.85rem;
      color: var(--text-secondary);
    }
    
    .online-dot {
      width: 8px;
      height: 8px;
      background: var(--accent-primary);
      border-radius: 50%;
      box-shadow: 0 0 8px var(--accent-primary);
    }
    
    // Modal
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    }
    
    .modal {
      background: var(--bg-secondary);
      border-radius: 16px;
      max-width: 600px;
      max-height: 80vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid var(--border-color);
      
      h2 {
        margin: 0;
        font-size: 1.3rem;
      }
    }
    
    .modal-close {
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0;
      line-height: 1;
      
      &:hover {
        color: var(--text-primary);
      }
    }
    
    .modal-body {
      padding: 24px;
      overflow-y: auto;
      font-size: 0.95rem;
      line-height: 1.7;
      
      h3 {
        margin: 24px 0 12px;
        font-size: 1.1rem;
        color: var(--accent-primary);
        
        &:first-of-type {
          margin-top: 16px;
        }
      }
      
      p {
        margin: 0 0 12px;
        color: var(--text-secondary);
      }
      
      ul {
        margin: 0 0 12px;
        padding-left: 24px;
        color: var(--text-secondary);
        
        li {
          margin-bottom: 6px;
        }
      }
      
      strong {
        color: var(--text-primary);
      }
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

      .footer-ad-card {
        padding: 22px 8px 10px;
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
  onlineStats: OnlineStats = { online: 0, waiting: 0, chatting: 0 };
  showPrivacy = false;
  showTerms = false;
  
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
    
    this.matchmaking.stats$.pipe(takeUntil(this.destroy$)).subscribe((stats) => {
      this.onlineStats = stats;
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
