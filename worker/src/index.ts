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

function handleCORS(): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}
