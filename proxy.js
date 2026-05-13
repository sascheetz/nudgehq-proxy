#!/usr/bin/env node
// Nudge HQ — Cloud Proxy Server
// Forwards Canvas API requests from the browser to lakota.instructure.com
// Deployed on Railway — runs 24/7, accessible from any device anywhere.

const http  = require('http');
const https = require('https');
const url   = require('url');

const PORT        = process.env.PORT || 3001; // Railway sets PORT automatically
const CANVAS_HOST = 'lakota.instructure.com';

// Only allow requests from your GitHub Pages site (and localhost for testing)
// Update ALLOWED_ORIGINS after you know your GitHub Pages URL
const ALLOWED_ORIGINS = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  // Your GitHub Pages URL will be added here — see setup guide
  // 'https://YOUR-USERNAME.github.io',
];

function setCors(req, res) {
  const origin = req.headers['origin'] || '';
  // Allow if origin matches, or if no origin (direct server call)
  const allowed = !origin || ALLOWED_ORIGINS.some(o => origin.startsWith(o)) || origin.includes('github.io') || origin.includes('localhost');
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin',  origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Vary', 'Origin');
}

function ts() {
  return new Date().toISOString().slice(11,19);
}

const server = http.createServer((req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Health check — Railway uses this to confirm the service is up
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'NudgeHQ Canvas Proxy', canvas: CANVAS_HOST }));
    return;
  }

  // Only proxy GET requests to Canvas API paths
  if (req.method !== 'GET' || !req.url.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // Security: require an Authorization header — refuse to proxy unauthenticated requests
  if (!req.headers['authorization'] || !req.headers['authorization'].startsWith('Bearer ')) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Authorization header required' }));
    return;
  }

  const parsed = url.parse(req.url);
  console.log(`[${ts()}] PROXY  ${parsed.pathname}`);

  const options = {
    hostname: CANVAS_HOST,
    path:     parsed.path,
    method:   'GET',
    headers:  {
      'Authorization': req.headers['authorization'],
      'Accept':        'application/json',
      'User-Agent':    'NudgeHQ/1.0',
    },
  };

  const proxy = https.request(options, (canvasRes) => {
    res.writeHead(canvasRes.statusCode, {
      'Content-Type':                canvasRes.headers['content-type'] || 'application/json',
      'Access-Control-Allow-Origin': req.headers['origin'] || '*',
    });
    canvasRes.pipe(res);
  });

  proxy.on('error', (e) => {
    console.error(`[${ts()}] ERROR  ${e.message}`);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error: ' + e.message }));
  });

  proxy.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  NudgeHQ Cloud Proxy — Running           ║');
  console.log(`║  Port: ${PORT}                               ║`);
  console.log('║  Canvas: lakota.instructure.com          ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});
