# admin-interface

Independent SPA for the Mr.Market admin console.

- **Stack**: Svelte 5 (runes) + latest SvelteKit + Tailwind v4 + daisyUI v5 + svelte-i18n + bun
- **Adapter**: `@sveltejs/adapter-static` with `fallback: index.html` (SPA, `ssr=false`)
- **Auth**: short-lived JWT via `httpOnly Secure SameSite` cookie + CSRF token (see [plan](../docs/plans/2026-05-11-admin-interface-extraction.md))
- **Backend URL**: read from `import.meta.env.PUBLIC_MRM_BACKEND_URL`; fail fast if missing.

## Scripts

```bash
bun install
bun run dev       # vite dev --host 0.0.0.0
bun run check     # svelte-kit sync && svelte-check
bun run build     # vite build
bun run preview   # vite preview
bun run test:unit # vitest --run
bun run test:e2e  # playwright test
```

## Status

Phase 1 scaffold (root route renders the "Admin" placeholder). See the plan in `docs/plans/2026-05-11-admin-interface-extraction.md` for phase progression and cutover criteria.
