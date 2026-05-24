import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routeSource = () =>
  readFileSync(
    fileURLToPath(new URL('../../routes/market-making/create/+page.svelte', import.meta.url)),
    'utf8'
  );

describe('/market-making/create legacy route', () => {
  it('redirects to the order-first creation route without rendering removed UX', () => {
    const source = routeSource();

    expect(source).toContain("goto('/market-making/order/new'");
    expect(source).toContain('legacy-create-replaced');
    expect(source).toContain('Create order');
    expect(source.toLowerCase()).not.toContain('campaign');
  });
});
