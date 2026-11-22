// Only preloaded by the operator's Studio command, never by the application.
// Prisma 7.0.0 Studio has no hostname flag and otherwise listens on all interfaces.
import { Server } from 'node:net';
const listen = Server.prototype.listen;
Server.prototype.listen = function (...args) {
  const port = typeof args[0] === 'object' ? args[0].port : args[0];
  if (!Number.isInteger(Number(port))) throw new Error('Studio permits local TCP listeners only.');
  const callback = args.findLast((value) => typeof value === 'function');
  return listen.call(this, { port: Number(port), host: '127.0.0.1' }, callback);
};
