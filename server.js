import { WebSocketServer } from 'ws';
const wss = new WebSocketServer({ port: process.env.PORT || 8080 });
const rooms = new Map();
wss.on('connection', (ws, req) => {
  const room = new URL(req.url, 'http://x').searchParams.get('room') || 'default';
  if (!rooms.has(room)) rooms.set(room, new Set());
  const peers = rooms.get(room);
  peers.add(ws);
  ws.on('message', msg => {
    for (const peer of peers) if (peer !== ws && peer.readyState === 1) peer.send(msg);
  });
  ws.on('close', () => peers.delete(ws));
});
