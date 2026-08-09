// Minimal startup script for Railway debugging
console.log('=== START.JS EXECUTING ===');
console.log('Time:', new Date().toISOString());
console.log('Node version:', process.version);
console.log('CWD:', process.cwd());
console.log('__dirname:', __dirname);
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Start simple HTTP server immediately for healthcheck
const http = require('http');
const PORT = process.env.PORT || 5000;

const healthServer = http.createServer((req, res) => {
  console.log('Request received:', req.method, req.url);

  if (req.url === '/api/health' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', mode: 'startup' }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Server starting...');
  }
});

healthServer.listen(PORT, '0.0.0.0', () => {
  console.log(`=== Health server started on port ${PORT} ===`);

  // Now try to load the main server
  console.log('Loading main server...');

  setTimeout(() => {
    try {
      // Close health server
      healthServer.close(() => {
        console.log('Health server closed, loading main server...');
        require('./server.js');
      });
    } catch (error) {
      console.error('ERROR loading main server:', error.message);
      console.error(error.stack);
    }
  }, 3000);
});

console.log('=== START.JS SETUP COMPLETE ===');
