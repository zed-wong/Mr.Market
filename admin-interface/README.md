# admin-interface

Independent SPA for the Mr.Market admin console.

- **Stack**: Svelte 5 (runes) + latest SvelteKit + Tailwind v4 + daisyUI v5 + svelte-i18n + bun
- **Adapter**: `@sveltejs/adapter-static` with `fallback: index.html` (SPA, `ssr=false`)
- **Auth**: short-lived JWT via `httpOnly Secure SameSite` cookie + CSRF token (see [plan](../docs/plans/2026-05-11-admin-interface-extraction.md))
- **Backend URL**: read from `import.meta.env.PUBLIC_MRM_BACKEND_URL`; fail fast if missing.

## Setup

```bash
bun install
PUBLIC_MRM_BACKEND_URL=http://localhost:3000 bun run dev
```

Open `/setup` to verify backend readiness, exchange/API key frontend readiness, and local admin console configuration before operating the console.

## Scripts

```bash
bun install
bun run dev       # vite dev --host 0.0.0.0
bun run check     # svelte-kit sync && svelte-check
bun run lint      # same gate as check
bun run build     # vite build
bun run preview   # vite preview
bun run test:unit # vitest --run
bun run test:e2e  # playwright test
```

For preview validation, build first and run `PUBLIC_MRM_BACKEND_URL=<backend-url> bun run preview`.

## Status

Operations console is active with grouped sidebar navigation, shared loading/empty/error/permission/session states, setup guidance, trading/system views, and direct market-making order detail diagnostics for running, stopped, failed, and risky states with supporting evidence.
