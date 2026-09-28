// A direct parent for suspension tests: tmux automatically SIGCONTs stopped panes.
// Keep the real bridge/RPC child, but only this fixture owns their SIGSTOP/SIGCONT.
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonLines, send } from '../wire.mjs';
const root = process.argv[2], token = randomBytes(32).toString('hex');
const path = join(root, 'bridge.json'), socketPath = join(root, 'rpc.sock');
let connection, bridge;
const server = createServer((socket) => {
  connection = socket;
  socket.on('error', () => socket.destroy());
  jsonLines(socket, (packet) => {
    if (packet.hello) {
      if (packet.token !== token) throw new Error('Wrong bridge token');
      send(socket, { type: 'boot', command: process.execPath, args: [fileURLToPath(new URL('./fake-rpc.mjs', import.meta.url))], cwd: root,
        env: { ...process.env, MOCK_PROVIDER: 'mock', MOCK_MODEL: 'small', MOCK_THINKING: 'low', MOCK_PASSIVE: '1', MOCK_DESCENDANT_FILE: join(root, 'implementor.pid') },
      });
      console.log(JSON.stringify({ bridgePid: bridge.pid }));
    } else if (packet.type === 'response' || packet.type === 'bridge_error') process.send(packet);
  }, (error) => { throw error; });
});
process.on('message', ({ id, command }) => send(connection, { type: 'rpc', command: { ...command, id } }));
await new Promise((resolve) => server.listen(socketPath, resolve));
await writeFile(path, JSON.stringify({ socket: socketPath, token, leaseMs: 1000 }), { mode: 0o600 });
bridge = spawn(process.execPath, [fileURLToPath(new URL('../bridge.mjs', import.meta.url)), path], { stdio: 'ignore' });
setInterval(() => { if (connection?.writable) send(connection, { type: 'heartbeat' }); }, 100);
