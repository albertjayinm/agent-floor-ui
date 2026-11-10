import http from 'node:http';

export function createRelay({ validate, origins = ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:5174', 'http://localhost:5174'] }) {
  const clients = new Set();
  const agents = new Map();
  const history = [];
  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    const host = request.headers.host?.split(':')[0];
    const reply = (code, message) => { response.writeHead(code, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ message })); };
    if (!['localhost', '127.0.0.1'].includes(host)) return reply(403, 'Local host required');
    if (origin && !origins.includes(origin)) return reply(403, 'Origin not allowed');
    if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin'); }
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === 'OPTIONS') { response.writeHead(204); return response.end(); }
    if (request.url === '/health' && request.method === 'GET') return reply(200, 'Agent Floor relay is ready');
    if (request.url !== '/events') return reply(404, 'Not found');
    if (request.method === 'GET') {
      if (clients.size >= 32) return reply(503, 'Too many viewers');
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      response.write(': agent-floor-ui connected\n\n');
      for (const agent of agents.values()) response.write(`data: ${JSON.stringify({ type: 'agent.upsert', agent })}\n\n`);
      for (const event of history) response.write(`data: ${JSON.stringify(event)}\n\n`);
      clients.add(response);
      request.on('close', () => clients.delete(response));
      return;
    }
    if (request.method !== 'POST') return reply(405, 'Use GET or POST');
    if (!request.headers['content-type']?.startsWith('application/json')) return reply(415, 'Use application/json');
    let body = '';
    let bytes = 0;
    try {
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 65536) { reply(413, 'Event exceeds 64 KiB'); return; }
        body += chunk;
      }
      const event = JSON.parse(body);
      if (!validate(event)) return reply(400, 'Invalid Agent Floor event');
      if (event.type === 'agent.upsert') {
        if (!agents.has(event.agent.id) && agents.size >= 100) return reply(409, 'Relay limit: 100 agents');
        agents.set(event.agent.id, event.agent);
      }
      if (event.type === 'agent.move') {
        const agent = agents.get(event.id);
        if (agent) agents.set(event.id, { ...agent, zone: event.zone });
      }
      if (event.type === 'agent.remove') agents.delete(event.id);
      if (event.type === 'activity') { history.push(event); if (history.length > 60) history.shift(); }
      const payload = `data: ${JSON.stringify(event)}\n\n`;
      clients.forEach(client => { if (!client.write(payload)) { client.end(); clients.delete(client); } });
      reply(202, 'Event accepted');
    } catch { if (!response.headersSent) reply(400, 'Malformed JSON event'); }
  });
  const heartbeat = setInterval(() => clients.forEach(client => client.write(': heartbeat\n\n')), 15000);
  heartbeat.unref();
  server.on('close', () => { clearInterval(heartbeat); clients.forEach(client => client.end()); });
  return server;
}