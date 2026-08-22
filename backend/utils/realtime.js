let io = null;

function attach(server) {
  const { Server } = require('socket.io');
  io = new Server(server, { cors: { origin: process.env.FRONTEND_URL || '*', credentials: false } });
  io.on('connection', (socket) => {
    socket.emit('system:connected', { timestamp: new Date().toISOString() });
  });
  return io;
}

function notify(event, payload) {
  if (io) io.emit(event, { ...payload, timestamp: new Date().toISOString() });
}

module.exports = { attach, notify };