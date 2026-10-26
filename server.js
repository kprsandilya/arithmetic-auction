// Numbers Auction — local game server. No dependencies: `node server.js`
const http = require('http');
const fs = require('fs');
const path = require('path');
const Game = require('./public/game.js');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

let state = loadState();
const clients = new Set(); // { res, role }

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return Game.defaultState();
  }
}

function saveState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

function payloadFor(role) {
  return JSON.stringify(role === 'admin' ? state : Game.publicState(state));
}

function broadcast() {
  for (const c of clients) c.res.write(`data: ${payloadFor(c.role)}\n\n`);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

function serveStatic(req, res, urlPath) {
  const routes = { '/': '/admin.html', '/admin': '/admin.html', '/display': '/display.html' };
  const rel = routes[urlPath] || urlPath;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': (MIME[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/events') {
    const role = url.searchParams.get('role') === 'admin' ? 'admin' : 'display';
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(`data: ${payloadFor(role)}\n\n`);
    const client = { res, role };
    clients.add(client);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { clearInterval(ping); clients.delete(client); });
    return;
  }

  if (url.pathname === '/api/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(payloadFor('admin'));
  }

  if (url.pathname === '/api/state' && req.method === 'PUT') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > 5e6) req.destroy(); });
    req.on('end', () => {
      try {
        const next = JSON.parse(body);
        if (!next || !Array.isArray(next.teams) || !Array.isArray(next.rounds)) throw new Error('Invalid state');
        next.version = (state.version || 0) + 1;
        state = next;
        saveState();
        broadcast();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ version: state.version }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'GET') return serveStatic(req, res, url.pathname);
  res.writeHead(405);
  res.end();
});

server.listen(PORT, HOST, () => {
  console.log(`Numbers Auction running`);
  console.log(`  Admin:   http://localhost:${PORT}/admin`);
  console.log(`  Display: http://localhost:${PORT}/display   (screen-share this one)`);
});
