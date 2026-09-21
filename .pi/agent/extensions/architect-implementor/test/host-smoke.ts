import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

// Test-only: any accidental model request exits before provider dispatch.
export default function smokeProbe(pi: ExtensionAPI) {
  pi.on('before_provider_request', () => process.exit(91));
  pi.registerCommand('pair-smoke-tools', {
    handler: async (_args, ctx) => ctx.ui.notify('SMOKE_TOOLS ' + JSON.stringify(pi.getActiveTools()), 'info'),
  });
  pi.registerCommand('pair-smoke-quit', { handler: async (_args, ctx) => ctx.shutdown() });
}
