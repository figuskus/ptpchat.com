/**
 * PTPChat Worker - Matchmaking & Signaling Server
 * 
 * This Cloudflare Worker handles:
 * 1. WebSocket connections from clients
 * 2. Random matchmaking between users
 * 3. WebRTC signaling (offer/answer/ICE candidates)
 */

export { Matchmaker } from './matchmaker';

export interface Env {
  MATCHMAKER: DurableObjectNamespace;
  // Cloudflare TURN credentials (set via wrangler secret)
  TURN_KEY_ID?: string;      // The TURN key UID from Cloudflare
  TURN_KEY_SECRET?: string;  // The TURN key secret from Cloudflare
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }
    
    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response('OK', { 
        status: 200,
        headers: corsHeaders()
      });
    }
    
    // ICE servers endpoint - provides TURN credentials to clients
    if (url.pathname === '/ice-servers') {
      const iceServers = await getIceServers(env);
      return new Response(JSON.stringify({ iceServers }), {
        status: 200,
        headers: {
          ...corsHeaders(),
          'Content-Type': 'application/json'
        }
      });
    }
    
    // WebSocket connection endpoint
    if (url.pathname === '/connect') {
      // Use a single global matchmaker instance
      const id = env.MATCHMAKER.idFromName('global');
      const matchmaker = env.MATCHMAKER.get(id);
      
      // Forward the request to the Durable Object
      return matchmaker.fetch(request);
    }
    
    return new Response('Not Found', { 
      status: 404,
      headers: corsHeaders()
    });
  }
};

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Protocol',
  };
}

async function getIceServers(env: Env): Promise<RTCIceServer[]> {
  const servers: RTCIceServer[] = [
    // STUN servers (always include these)
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
  ];
  
  // Add Cloudflare TURN server if configured
  if (env.TURN_KEY_ID && env.TURN_KEY_SECRET) {
    try {
      const turnCredentials = await generateTurnCredentials(env.TURN_KEY_ID, env.TURN_KEY_SECRET);
      servers.push({
        urls: [
          'turn:turn.cloudflare.com:3478?transport=udp',
          'turn:turn.cloudflare.com:3478?transport=tcp',
          'turns:turn.cloudflare.com:5349?transport=tcp'
        ],
        username: turnCredentials.username,
        credential: turnCredentials.credential
      });
      console.log('[TURN] Added Cloudflare TURN server');
    } catch (e) {
      console.error('[TURN] Failed to generate credentials:', e);
    }
  }
  
  return servers;
}

async function generateTurnCredentials(keyId: string, keySecret: string): Promise<{ username: string; credential: string }> {
  // Generate time-limited TURN credentials
  // Credentials expire in 24 hours (86400 seconds)
  const ttl = 86400;
  const timestamp = Math.floor(Date.now() / 1000) + ttl;
  const username = `${timestamp}:${keyId}`;
  
  // Generate HMAC-SHA256 credential
  const encoder = new TextEncoder();
  const keyData = encoder.encode(keySecret);
  const messageData = encoder.encode(username);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const credential = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  return { username, credential };
}

interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

function handleCORS(): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}
