/**
 * Production entry point.
 *
 * This used to start a throwaway HTTP server, wait three seconds, close it, and
 * then load the real one — a workaround for healthcheck timeouts that introduced
 * a window where the port was unbound and, worse, swallowed startup failures so
 * a crashed server looked like a healthy one. Railway's healthcheckTimeout (120s
 * in railway.json) is the right tool for a slow boot.
 *
 * Fail loudly instead: an unhandled error during startup should stop the process
 * so the platform restarts it and the logs say why.
 */
console.log('=== VeriSpine backend starting ===');
console.log('Time:', new Date().toISOString());
console.log('Node:', process.version);
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('PORT:', process.env.PORT || 5000);

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
  process.exit(1);
});

try {
  require('./server.js');
} catch (error) {
  console.error('FAILED TO START:', error.message);
  console.error(error.stack);
  process.exit(1);
}
