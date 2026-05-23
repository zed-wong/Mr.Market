import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const componentSource = () =>
  readFileSync(
    fileURLToPath(new URL('./DemoWalletControls.svelte', import.meta.url)),
    'utf8'
  );

const loginSource = () =>
  readFileSync(
    fileURLToPath(new URL('../../../routes/login/+page.svelte', import.meta.url)),
    'utf8'
  );

describe('browser-visible deterministic wallet demo controls', () => {
  it('exposes supported, wrong-network, and session-expired controls in the top bar', () => {
    const source = componentSource();

    expect(source).toContain('demo-wallet-evm');
    expect(source).toContain('demo-wallet-solana');
    expect(source).toContain('demo-wallet-wrong-network');
    expect(source).toContain('demo-session-expired');
    expect(source).toContain('showSessionExpired.set(true)');
    expect(source).toContain('Demo controls');
  });

  it('makes the intended continue path use deterministic demo wallet state', () => {
    const source = loginSource();

    expect(source).toContain('connectDemoWallet');
    expect(source).toContain('login-continue-without-wallet');
    expect(source).toContain('Continue with demo wallet');
    expect(source).toContain('login-demo-wrong-network');
  });
});
