/**
 * Matchmaker Durable Object
 * 
 * Handles random pairing of users and WebRTC signaling relay.
 * Uses a simple queue-based matching system.
 */

interface Session {
  id: string;
  partner: WebSocket | null;
}

interface SignalingMessage {
  type: 'find-match' | 'next' | 'offer' | 'answer' | 'ice-candidate' | 'chat-message' | 'get-stats';
  payload?: unknown;
}

export class Matchmaker implements DurableObject {
  private sessions: Map<WebSocket, Session> = new Map();
  private waitingQueue: WebSocket[] = [];
  
  constructor(
    private state: DurableObjectState,
    private env: unknown
  ) {}

  async fetch(request: Request): Promise<Response> {
    // Verify WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Handle the server-side WebSocket
    this.handleWebSocket(server);

    // Return the client-side WebSocket to the caller
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  private handleWebSocket(ws: WebSocket): void {
    // Accept the WebSocket connection
    ws.accept();

    // Create session for this connection
    const sessionId = crypto.randomUUID();
    this.sessions.set(ws, {
      id: sessionId,
      partner: null
    });

    console.log(`[Matchmaker] New session: ${sessionId}. Total online: ${this.sessions.size}`);
    
    // Send current stats to the new user
    this.sendStats(ws);

    // Handle incoming messages
    ws.addEventListener('message', async (event) => {
      try {
        const message: SignalingMessage = JSON.parse(event.data as string);
        await this.handleMessage(ws, message);
      } catch (error) {
        console.error('[Matchmaker] Error handling message:', error);
      }
    });

    // Handle disconnection
    ws.addEventListener('close', () => {
      this.handleDisconnect(ws);
    });

    ws.addEventListener('error', (event) => {
      console.error('[Matchmaker] WebSocket error:', event);
      this.handleDisconnect(ws);
    });
  }

  private async handleMessage(ws: WebSocket, message: SignalingMessage): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session) return;

    console.log(`[Matchmaker] Message from ${session.id}: ${message.type}`);

    switch (message.type) {
      case 'find-match':
        this.findMatch(ws);
        break;

      case 'next':
        // Disconnect from current partner and find new one
        this.disconnectFromPartner(ws);
        this.findMatch(ws);
        break;

      case 'offer':
      case 'answer':
      case 'ice-candidate':
        // Relay signaling message to partner
        if (session.partner) {
          this.sendToSocket(session.partner, {
            type: message.type,
            payload: message.payload
          });
        }
        break;

      case 'chat-message':
        // Fallback: relay chat messages if P2P fails
        if (session.partner) {
          this.sendToSocket(session.partner, {
            type: 'chat-message',
            payload: message.payload
          });
        }
        break;
        
      case 'get-stats':
        this.sendStats(ws);
        break;
    }
  }
  
  private sendStats(ws: WebSocket): void {
    const onlineCount = this.sessions.size;
    const waitingCount = this.waitingQueue.length;
    const chattingCount = Math.floor((onlineCount - waitingCount) / 2) * 2; // Paired users
    
    this.sendToSocket(ws, {
      type: 'stats',
      payload: {
        online: onlineCount,
        waiting: waitingCount,
        chatting: chattingCount
      }
    });
  }

  private findMatch(ws: WebSocket): void {
    const session = this.sessions.get(ws);
    if (!session) return;

    // Remove from queue if already there
    this.removeFromQueue(ws);

    if (this.waitingQueue.length > 0) {
      // Found a match!
      const partnerWs = this.waitingQueue.shift()!;
      const partnerSession = this.sessions.get(partnerWs);

      if (partnerSession && partnerWs.readyState === WebSocket.OPEN) {
        // Pair them together
        session.partner = partnerWs;
        partnerSession.partner = ws;

        console.log(`[Matchmaker] Matched ${session.id} with ${partnerSession.id}`);

        // Notify both clients
        // The first one (who was waiting) will be the initiator
        this.sendToSocket(partnerWs, { type: 'matched', role: 'initiator' });
        this.sendToSocket(ws, { type: 'matched', role: 'receiver' });
      } else {
        // Partner disconnected, try again
        this.findMatch(ws);
      }
    } else {
      // No one waiting, add to queue
      this.waitingQueue.push(ws);
      this.sendToSocket(ws, { type: 'waiting' });
      console.log(`[Matchmaker] ${session.id} added to queue. Queue size: ${this.waitingQueue.length}`);
    }
  }

  private disconnectFromPartner(ws: WebSocket): void {
    const session = this.sessions.get(ws);
    if (!session || !session.partner) return;

    const partnerSession = this.sessions.get(session.partner);
    
    // Notify partner
    if (session.partner.readyState === WebSocket.OPEN) {
      this.sendToSocket(session.partner, { type: 'partner-disconnected' });
    }

    // Clear partner references
    if (partnerSession) {
      partnerSession.partner = null;
    }
    session.partner = null;
  }

  private handleDisconnect(ws: WebSocket): void {
    const session = this.sessions.get(ws);
    if (!session) return;

    console.log(`[Matchmaker] Session disconnected: ${session.id}`);

    // Notify partner if connected
    this.disconnectFromPartner(ws);

    // Remove from queue
    this.removeFromQueue(ws);

    // Remove session
    this.sessions.delete(ws);
  }

  private removeFromQueue(ws: WebSocket): void {
    const index = this.waitingQueue.indexOf(ws);
    if (index > -1) {
      this.waitingQueue.splice(index, 1);
    }
  }

  private sendToSocket(ws: WebSocket, data: Record<string, unknown>): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }
}
