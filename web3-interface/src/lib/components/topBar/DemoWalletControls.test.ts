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
    fileURLToPath(new URL('../../../routes/app/login/+page.svelte', import.meta.url)),
    'utf8'
  );

describe('browser-visible deterministic wallet demo controls', () => {
  it('exposes supported, wrong-network, and session-expired controls in the top bar', () => {
    const source = componentSource();

    expect(source).toContain('demo-wallet-evm');
    expect(source).toContain('demo-wallet-solana');
    expect(source).toContain('demo-wallet-wrong-network');
    expect(source).toContain('demo-session-expired');
    expect(source).toContain('expireAuthSession()');
    expect(source).toContain('Demo controls');
  });

  it('keeps the login path on real Reown SIWE instead of deterministic demo auth', () => {
    const source = loginSource();

    expect(source).toContain('getNonce');
    expect(source).toContain('signWalletMessage');
    expect(source).toContain('login(message, signature)');
    expect(source).toContain('login-sign-message');
    expect(source).not.toContain('connectDemoWallet');
    expect(source).not.toContain('login-continue-without-wallet');
    expect(source).not.toContain('login-demo-wrong-network');
  });
});
