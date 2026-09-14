import { WorkerPair } from '../transport.mjs';
import { validateConfig } from '../config.mjs';
import { fileURLToPath } from 'node:url';
const config = validateConfig({ architect: { provider: 'mock', model: 'frontier', thinking: 'high' }, implementor: { provider: 'mock', model: 'small', thinking: 'low' } });
const pair = new WorkerPair(config, '/tmp', 'doomed-owner', () => {}, () => {}, {
  root: process.argv[2],
  boot: (role) => ({ command: process.execPath, args: [fileURLToPath(new URL('./fake-rpc.mjs', import.meta.url))], cwd: '/tmp', env: { ...process.env, MOCK_ROLE: role, MOCK_PROVIDER: 'mock', MOCK_MODEL: config[role].model, MOCK_THINKING: config[role].thinking, MOCK_PASSIVE: '1', MOCK_DESCENDANT_FILE: `${process.argv[2]}/${role}.pid` } }),
});
await pair.start();
console.log(JSON.stringify({ key: pair.key }));
