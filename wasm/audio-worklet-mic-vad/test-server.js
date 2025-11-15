#!/usr/bin/env node

// HTTP server with required headers for SharedArrayBuffer support
// Required headers for WebAssembly threads and Audio Worklets:
// - Cross-Origin-Opener-Policy: same-origin
// - Cross-Origin-Embedder-Policy: require-corp

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8000;
const BASE_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  let filePath = path.join(
    BASE_DIR,
    parsedUrl.pathname === '/' ? '/test.html' : parsedUrl.pathname,
  );

  // Security: prevent directory traversal
  if (!filePath.startsWith(BASE_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Set required headers for SharedArrayBuffer
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('================================================');
  console.log('Audio Worklet Essentials Test Server');
  console.log('================================================');
  console.log('');
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('');
  console.log('Test page:');
  console.log(`  http://localhost:${PORT}/test.html`);
  console.log('');
  console.log('Required headers for SharedArrayBuffer are set:');
  console.log('  - Cross-Origin-Opener-Policy: same-origin');
  console.log('  - Cross-Origin-Embedder-Policy: require-corp');
  console.log('');
  console.log('Press Ctrl+C to stop the server');
  console.log('');
});
