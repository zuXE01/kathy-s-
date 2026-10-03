const { createApp } = require('./server/app');
const app = createApp();
const port = process.env.PORT || 3000;
const server = app.listen(port, '0.0.0.0', () => console.log(`Kathy's Hub listening on port ${port}`));
function shutdown(signal) {
  console.log(`${signal} received, draining connections…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
