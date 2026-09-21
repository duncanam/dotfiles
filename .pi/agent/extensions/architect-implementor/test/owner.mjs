import { Implementor } from '../transport.mjs';
import { validateConfig } from '../config.mjs';
import { fileURLToPath } from 'node:url';
const config = validateConfig({ version: 2, architect: { provider: 'mock', model: 'frontier', thinking: 'high' }, implementor: { provider: 'mock', model: 'small', thinking: 'low' } });
const worker = new Implementor(config, '/tmp', 'doomed-owner', () => {}, () => {}, {
  root: process.argv[2],
  boot: () => ({ command: process.execPath, args: [fileURLToPath(new URL('./fake-rpc.mjs', import.meta.url))], cwd: '/tmp', env: { ...process.env, MOCK_PROVIDER: 'mock', MOCK_MODEL: config.implementor.model, MOCK_THINKING: config.implementor.thinking, MOCK_PASSIVE: '1', MOCK_DESCENDANT_FILE: `${process.argv[2]}/implementor.pid` } }),
});
await worker.start();
console.log(JSON.stringify({ key: worker.key }));
