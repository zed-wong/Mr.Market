import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routeSource = () =>
  readFileSync(
    fileURLToPath(new URL('../../routes/market-making/create/+page.svelte', import.meta.url)),
    'utf8'
  );

describe('/market-making/create wrong-network recovery', () => {
  it('shows a switch-network CTA while campaign creation is blocked', () => {
    const source = routeSource();

    expect(source).toContain('openNetworkModal');
    expect(source).toContain('campaign-create-switch-network');
    expect(source).toContain('Wrong network selected');
    expect(source).toContain('disabled={!$walletIsConnected || $walletIsUnsupported}');
  });
});
