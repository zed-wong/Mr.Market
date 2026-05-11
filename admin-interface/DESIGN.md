---
project: "Mr.Market Admin Interface"
description: "A clean, consistent, data-dense admin console for managing Mr.Market operations. The tone is professional, calm, operational, and optimized for fast scanning."
framework:
  ui: "Svelte 5"
  app: "SvelteKit SPA"
  styling: "Tailwind CSS v4 + daisyUI v5"
  i18n: "svelte-i18n"
themes:
  light: "admin-light"
  dark: "admin-dark"
colors:
  light:
    base_100: "#ffffff"
    base_200: "#f8fafc"
    base_300: "#e5e5e5"
    base_content: "#0f172a"
    primary: "#4f46e5"
    primary_content: "#eef2ff"
    secondary: "#ec4899"
    accent: "#14b8a6"
    neutral: "#1f2937"
    info: "#38bdf8"
    success: "#34d399"
    warning: "#fbbf24"
    error: "#fb7185"
  dark:
    base_100: "#0f172a"
    base_200: "#1e293b"
    base_300: "#333333"
    base_content: "#f8fafc"
    primary: "#7c3aed"
    primary_content: "#f5f3ff"
    secondary: "#ec4899"
    accent: "#14b8a6"
    neutral: "#1f2937"
    info: "#38bdf8"
    success: "#34d399"
    warning: "#fbbf24"
    error: "#fb7185"
typography:
  family:
    sans: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    mono: "Fira Mono, monospace"
  sizes:
    xs: "0.75rem"
    sm: "0.875rem"
    base: "1rem"
    lg: "1.125rem"
    xl: "1.25rem"
    "2xl": "1.5rem"
    "3xl": "1.875rem"
  weights:
    regular: 400
    medium: 500
    semibold: 600
    bold: 700
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  "2xl": "3rem"
radius:
  field: "0.25rem"
  selector: "0.5rem"
  box: "0.5rem"
shadows:
  card: "shadow-sm"
  elevated: "shadow-md"
---

# Mr.Market Admin Interface Design System

Mr.Market Admin Interface is an operational admin console for managing exchanges, orders, revenue, settings, market-making, and platform health. The UI should feel precise, calm, trustworthy, and data-dense without becoming visually noisy.

This document is the design source of truth for AI coding agents generating or modifying UI in `admin-interface/`.

## Colors

Use daisyUI semantic tokens only. Do not use raw Tailwind color families like `gray`, `slate`, `white`, or custom hex values directly in components.

### Themes

Use only admin themes:

- `admin-light`
- `admin-dark`

The shell sets `data-theme` on `document.documentElement`. Components should not hardcode a theme name.

### Surface Colors

- `bg-base-100`: cards, panels, modals, form sections
- `bg-base-200`: app background and page shell
- `bg-base-300`: dividers, subtle borders, inactive surfaces
- `border-base-300`: standard border color

Example:

```svelte
<div class="card border border-base-300 bg-base-100 shadow-sm">
  <div class="card-body">...</div>
</div>
```

### Text Colors

- `text-base-content`: primary readable text
- `text-base-content/70`: secondary text
- `text-base-content/60`: metadata, descriptions, hints
- `text-primary`: links, selected state, high-emphasis accents

### Action & State Colors

- `btn-primary`: main action
- `btn-ghost`: secondary action
- `alert-success`: successful operation
- `alert-warning`: risky or pending state
- `alert-error`: failed or destructive state
- `alert-info`: neutral informational message

Do not use raw color utility classes such as:

- `text-gray-*`
- `bg-white`
- `bg-slate-*`
- `border-gray-*`

If a missing semantic token is needed, add it to `daisyui-themes.css` instead of adding one-off colors in components.

## Typography

Use clear, compact typography optimized for dashboards and tables.

### Text Styles

- Page title: `text-2xl md:text-3xl font-bold`
- Section title: `text-lg text-xl font-semibold`
- Body text: `text-base`
- Secondary text: `text-sm text-base-content/70`
- Metadata: `text-xs text-base-content/60`

Use `capitalize`, not `uppercase`.

Prefer `<span>` for text blocks unless a semantic element is required by the component.

Example:

```svelte
<span class="text-2xl font-bold text-base-content capitalize">
  {$_('admin.dashboard.title')}
</span>
<span class="text-sm text-base-content/60">
  {$_('admin.dashboard.subtitle')}
</span>
```

## Layout

The admin UI uses a fixed sidebar shell with responsive page content.

### Shell

- Sidebar width: `w-72`.
- Sidebar is fixed on desktop and drawer-style on mobile.
- Top bar is sticky and uses `bg-base-100/95` with `backdrop-blur`.
- Page content uses `max-w-screen-2xl` with responsive padding.

### Page Structure

Each page should generally use:

```svelte
<section class="space-y-4">
  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3 p-5 md:p-6">
      ...
    </div>
  </div>
</section>
```

Use `bg-base-200` for the app background and `bg-base-100` for cards/panels.

## Components

### Buttons

### Primary Button

Use for the main page or form action.

```svelte
<button class="btn btn-primary">
  <span class="capitalize">{$_('admin.save')}</span>
</button>
```

### Secondary Button

Use for cancel, navigation, or low-emphasis actions.

```svelte
<button class="btn btn-ghost">
  <span class="capitalize">{$_('admin.cancel')}</span>
</button>
```

### Destructive Button

Use only for destructive actions and preferably inside a confirmation dialog.

```svelte
<button class="btn btn-error">
  <span class="capitalize">{$_('admin.delete')}</span>
</button>
```

## Inputs & Forms

- Use daisyUI form controls: `input`, `select`, `textarea`, `checkbox`, `label`.

```svelte
<label for="fee" class="label py-1.5">
  <span class="label-text text-sm font-medium capitalize">
    {$_('admin.settings.fees.rate')}
  </span>
</label>

<input
  id="fee"
  class="input input-bordered w-full"
  bind:value={feeRate}
/>
```

### Form Rules

- Every input must have a label.
- Show validation messages close to the field.
- Disable submit buttons while loading.
- Use `role="alert"` or `aria-live="polite"` for async errors.
- Keep validation copy concise and translated.

## Cards

Cards are the default page section container.

```svelte
<div class="card border border-base-300 bg-base-100 shadow-sm">
  <div class="card-body gap-3 p-5 md:p-6">
    <span class="text-lg font-semibold capitalize">
      {$_('admin.section.title')}
    </span>
  </div>
</div>
```

Use cards for:

- settings sections
- dashboard panels
- summaries
- forms
- grouped actions

## Tables

- Prefer dense, readable tables for admin data.
- Use `bg-base-100`, `border-base-300`, and `text-base-content/60` for muted metadata.
- Keep row actions visually consistent and avoid icon-only actions unless they have an accessible label.
- Provide loading, empty, and error states.

Example:

```svelte
<div class="overflow-x-auto rounded-box border border-base-300 bg-base-100">
  <table class="table table-sm">
    ...
  </table>
</div>
```

## Navigation

### Sidebar

- Use fixed `w-72`.
- Use `menu-active` for selected nav items.
- Keep labels translated with `$_()`.
- Close mobile sidebar after navigation.

### Top Bar

- Use `sticky top-0`.
- Use `border-b border-base-300`.
- Use `bg-base-100/95 backdrop-blur`.

## Dialogs

- Use daisyUI `modal`.
- Use clear confirm/cancel labels.
- Keep destructive confirmation copy explicit.
- Avoid nested modals.

```svelte
<dialog class="modal modal-bottom sm:modal-middle">
  <div class="modal-box rounded-2xl p-8">
    ...
  </div>
</dialog>
```

## Interaction States

### Hover

- Buttons should rely on daisyUI hover states.
- Avoid custom hover colors.
- Use subtle hover emphasis only.

### Focus

- Inputs and buttons must have visible focus.
- Use `focus:outline-none focus:ring-2 focus:ring-primary/50` when custom focus is needed.

### Disabled

- Disable buttons while loading or when required fields are empty.
- Disabled controls must still preserve layout.

### Loading

Use daisyUI loading indicators.

```svelte
<span class="loading loading-spinner loading-sm"></span>
```

### Error

Use `alert alert-error`.

```svelte
<div class="alert alert-error" role="alert" aria-live="polite">
  <span>{$_('admin.error.generic')}</span>
</div>
```

## i18n

- All visible text must use `svelte-i18n`.
- Use namespaced keys:
  - `admin.login`
  - `admin.nav.dashboard`
  - `admin.settings.fees.save_button`
- Do not reuse vague global keys when a page-specific key is clearer.
- Keep `en.json` and `zh.json` synchronized in the same change.

## Auth UI

The admin auth surface includes:

- password login
- passkey registration
- passwordless passkey login
- session expiration handling

Rules:

- Never store the password.
- JWT is stored only in `localStorage['admin-access-token']`.
- Do not log JWTs.
- Do not expose whether a passkey exists in error messages.
- Session expiration uses `SessionExpiredDialog`.

## Do’s

- Use Svelte 5 runes syntax.
- Use daisyUI semantic colors only.
- Use `capitalize`, not `uppercase`.
- Use `<span>` for non-semantic text blocks.
- Use shared API helpers.
- Add loading, empty, success, and error states.
- Keep admin pages consistent and data-dense.
- Prefer simple, predictable layouts.

## Don’ts

- Do not use `text-gray-*`, `bg-white`, `bg-slate-*`, or custom colors in components.
- Do not add new business features during migration unless explicitly planned.
- Do not introduce role/permission systems in this phase.
- Do not store passwords.
- Do not log secrets, API keys, passwords, or JWTs.
- Do not create one-off component styles when daisyUI primitives work.
- Do not use icon-only buttons without `aria-label`.

## Migration Checklist

Before a migrated page is considered complete:

- [ ] Uses Svelte 5 runes syntax.
- [ ] Uses `$_()` for visible copy.
- [ ] Uses semantic daisyUI tokens only.
- [ ] Uses shared API client.
- [ ] Has loading state.
- [ ] Has empty state where applicable.
- [ ] Has error state.
- [ ] Has consistent form validation UI.
- [ ] Does not store secrets beyond the planned JWT key.
- [ ] Passes `bun run check`.
- [ ] Builds with `bun run build`.
- [ ] Passes page smoke testing in dev or preview.
