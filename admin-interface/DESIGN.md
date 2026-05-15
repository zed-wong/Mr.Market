---
version: alpha
name: "Mr.Market Admin Interface"
description: "Titan-first white-canvas financial operations console for Mr.Market admin workflows: calm, ledger-native, data-dense, and audit-ready."
framework:
  ui: "Svelte 5"
  app: "SvelteKit SPA"
  styling: "Tailwind CSS v4 + daisyUI v5"
  i18n: "svelte-i18n"
themes:
  light: "admin-light"
  dark: "admin-dark"
colors:
  primary: "#111111"
  secondary: "#5F6670"
  tertiary: "#B88A3D"
  neutral: "#FFFFFF"
  ledger_line: "#E8EAED"
  soft_ledger: "#F6F7F8"
  info: "#2563EB"
  error: "#B42318"
themeTokens:
  light:
    base_100: "#FFFFFF"
    base_200: "#FFFFFF"
    base_300: "#E8EAED"
    base_content: "#111111"
    primary: "#111111"
    primary_content: "#FFFFFF"
    secondary: "#5F6670"
    secondary_content: "#FFFFFF"
    accent: "#B88A3D"
    accent_content: "#111111"
    neutral: "#F6F7F8"
    neutral_content: "#111111"
    info: "#2563EB"
    info_content: "#FFFFFF"
    success: "#0F8A5F"
    success_content: "#FFFFFF"
    warning: "#B7791F"
    warning_content: "#111111"
    error: "#B42318"
    error_content: "#FFFFFF"
  dark:
    base_100: "#FFFFFF"
    base_200: "#FFFFFF"
    base_300: "#E8EAED"
    base_content: "#111111"
    primary: "#111111"
    primary_content: "#FFFFFF"
    secondary: "#5F6670"
    secondary_content: "#FFFFFF"
    accent: "#B88A3D"
    accent_content: "#111111"
    neutral: "#F6F7F8"
    neutral_content: "#111111"
    info: "#2563EB"
    info_content: "#FFFFFF"
    success: "#0F8A5F"
    success_content: "#FFFFFF"
    warning: "#B7791F"
    warning_content: "#111111"
    error: "#B42318"
    error_content: "#FFFFFF"
typography:
  h1:
    fontFamily: "Geist, Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  h2:
    fontFamily: "Geist, Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body-md:
    fontFamily: "Geist, Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label-sm:
    fontFamily: "Geist, Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.01em"
  data-mono:
    fontFamily: "Geist Mono, Fira Mono, SFMono-Regular, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  2xl: "3rem"
rounded:
  sm: "0.25rem"
  md: "0.5rem"
  lg: "0.75rem"
  xl: "1rem"
  pill: "999px"
components:
  page-shell:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
  sidebar:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    width: "18rem"
  sidebar-item-active:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    padding: "0.625rem"
  topbar:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    height: "3.75rem"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    padding: "0.75rem"
  button-primary-hover:
    backgroundColor: "#2A2A2A"
    textColor: "#FFFFFF"
  button-secondary:
    backgroundColor: "#F6F7F8"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: "0.75rem"
  ledger-card:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: "1.25rem"
  ledger-row-muted:
    backgroundColor: "{colors.soft_ledger}"
    textColor: "{colors.secondary}"
    padding: "0.75rem"
  premium-highlight:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: "0.375rem"
  divider-line:
    backgroundColor: "{colors.ledger_line}"
    height: "1px"
  status-success:
    backgroundColor: "#EAF7F1"
    textColor: "#0A5F42"
    rounded: "{rounded.pill}"
    padding: "0.375rem"
  status-warning:
    backgroundColor: "#FFF6DF"
    textColor: "#70430A"
    rounded: "{rounded.pill}"
    padding: "0.375rem"
  status-error:
    backgroundColor: "#FDECEA"
    textColor: "{colors.error}"
    rounded: "{rounded.pill}"
    padding: "0.375rem"
  status-info:
    backgroundColor: "#EEF4FF"
    textColor: "{colors.info}"
    rounded: "{rounded.pill}"
    padding: "0.375rem"
---

# Mr.Market Admin Interface Design System

## Overview

Mr.Market Admin Interface is a Titan-first, white-canvas financial operations console. It should feel like an investment-grade operating ledger: calm, precise, direct, and trustworthy. Use Acctual-like ledger structure only as a secondary reference for rows, records, reconciliation, and auditability.

This file is a stable design-system and token specification for `admin-interface/`. It is not a feature plan. Feature decisions and implementation tasks belong in `docs/plans/`.

Current product scope for this pass:

- Prioritize non-Funding and non-Scheduling admin surfaces: Overview, Trading / market-making execution, System, Admin, Logs, Users, Roles, API keys, System Config, Audit Log.
- Funding and Scheduling sections may exist as future IA in docs, but should not be surfaced in the active shell for now.
- Use a single coherent palette. Colored UI is allowed only for semantic state, tiny badges, charts, and risk/status cues.
- Dark mode must not be exposed in the UI now. `admin-dark` may remain as a compatibility alias, but it should visually resolve to the same Titan-style white canvas.

## Colors

The default impression must be white, not beige, slate, crypto dark, or generic SaaS blue.

### Core palette

- **Canvas White (`#FFFFFF`)**: dominant page background, sidebar, top bar, cards, dialogs.
- **Midnight Ink (`#111111`)**: primary text, primary actions, active navigation.
- **Ledger Line (`#E8EAED`)**: borders, separators, table rules.
- **Muted Graphite (`#5F6670`)**: secondary text, metadata, inactive nav labels.
- **Soft Ledger (`#F6F7F8`)**: very small secondary surfaces only, such as row hover, input fills, or muted chips.
- **Aged Gold (`#B88A3D`)**: restrained premium accent for exceptional highlights, not the default CTA.

### Semantic state colors

Use state colors sparingly and consistently:

- **Success (`#0F8A5F`)**: completed, reconciled, healthy.
- **Warning (`#B7791F`)**: pending, delayed, needs operator attention.
- **Error (`#B42318`)**: failed, destructive, risk-increasing mismatch.
- **Info (`#2563EB`)**: neutral informational messages and links when black action is too strong.

### daisyUI usage

Use semantic daisyUI tokens in components:

- `bg-base-100`: default app background, cards, panels, sidebar, topbar.
- `bg-base-200`: also white in the active Titan canvas; safe for shell compatibility.
- `border-base-300`: all standard 1px borders and dividers.
- `text-base-content`: primary text.
- `text-base-content/60` or `/70`: metadata and secondary labels.
- `btn-primary`: one primary action per section; black pill.
- `btn-ghost`: quiet secondary action.
- `alert-success`, `alert-warning`, `alert-error`, `alert-info`: operational states.

Do not use raw Tailwind families like `text-gray-*`, `bg-slate-*`, `bg-white`, or custom hex values in Svelte components. Add or adjust semantic theme tokens instead.

## Typography

Use compact financial UI typography: clear labels, tight headings, strong numeric alignment.

- Primary font: `Geist`, fallback to `Inter`, system sans.
- Data font: `Geist Mono`, fallback to `Fira Mono`, `ui-monospace`.
- Page title: `text-2xl md:text-3xl font-semibold tracking-tight`.
- Section title: `text-lg font-semibold tracking-tight`.
- Body: `text-sm` or `text-base` depending on density.
- Metadata: `text-xs text-base-content/60`.
- Amounts, bps, IDs, order numbers, timestamps: mono font.

Use `capitalize`, not `uppercase`. Prefer `<span>` for non-semantic text blocks unless an element needs real document semantics.

## Layout

The shell is intentionally quiet and white.

### Shell

- Sidebar width: `w-72` (`18rem`).
- Sidebar background: `bg-base-100`, right border `border-base-300`.
- Topbar: sticky, white, 1px bottom border, minimal controls.
- Page canvas: `bg-base-100`, not `bg-base-200` tinted backgrounds.
- Content width: `max-w-screen-2xl` with responsive padding.
- Avoid hero-like gradients, broad color washes, and dark chrome.

### Page structure

Use simple ledger stacks:

```svelte
<section class="space-y-4">
  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-3 p-5 md:p-6">
      ...
    </div>
  </div>
</section>
```

Use `shadow-none` or very light shadows. Borders should do most of the structure work.

## Elevation & Depth

Depth should be nearly flat:

- Default panels: 1px border, no shadow.
- Hover or floating menus: subtle `shadow-sm` only.
- Modals: `shadow-md` is acceptable, with clear border.
- Do not use glow, neon, heavy drop shadows, glassmorphism, or gradient depth.

## Shapes

- Buttons and nav active states: pill radius (`rounded-full`) when compact.
- Cards and panels: `rounded-xl` or daisyUI `rounded-box`.
- Inputs: modest radius, not overly playful.
- Tables: rounded outer container, square-ish internal rows.

## Components

### Buttons

Primary actions are black pills. Use only one high-emphasis action per region.

```svelte
<button class="btn btn-primary rounded-full capitalize">
  <span>{$_('admin.save')}</span>
</button>
```

Secondary actions should be quiet:

```svelte
<button class="btn btn-ghost rounded-full capitalize">
  <span>{$_('admin.cancel')}</span>
</button>
```

### Cards

Cards are ledger sections, not SaaS tiles. Prefer border-first structure:

```svelte
<div class="card border border-base-300 bg-base-100 shadow-none">
  <div class="card-body gap-3 p-5 md:p-6">
    <span class="text-lg font-semibold tracking-tight capitalize">
      {$_('admin.section.title')}
    </span>
  </div>
</div>
```

### Tables

Tables should feel like reports and ledgers:

- Dense but readable row height.
- Thin separators with `border-base-300`.
- Mono numbers and timestamps.
- Subtle row hover only; no broad colored table backgrounds.
- Loading, empty, and error states are required.

### Sidebar

The active shell should show only:

- Overview
- Trading
- System

Funding and Scheduling are deferred and should not be displayed until explicitly planned.

Sidebar rules:

- White surface, 1px right border.
- Compact brand row with logo and `Mr.Market`.
- Group label: `text-xs`, muted, `capitalize`.
- Group item: 36–40px height, icon 16px, label 14px.
- Active item: black pill (`bg-primary text-primary-content`) or subtle black left rail if needed.
- Child item: muted text, gentle hover, active black pill.
- Avoid large rounded gray containers around every group; the sidebar should remain lighter and more Titan-like.

### Topbar

The topbar should be utilitarian:

- Sticky white bar with `border-b border-base-300`.
- Left: sidebar toggle only on smaller layouts.
- Right: operational actions such as register passkey and status text.
- Do not show theme toggle for now.

### Forms and dialogs

- Every input has a label.
- Validation is close to the field.
- Disable submit while loading.
- Use `role="alert"` or `aria-live="polite"` for async errors.
- Dialogs use daisyUI `modal`, a border, and modest radius.

## Do's and Don'ts

Do:

- Use daisyUI semantic tokens only in Svelte components.
- Keep the interface Titan-first: white canvas, black actions, thin lines, low decoration.
- Use colored states only for meaning.
- Use mono font for financial and operational data.
- Keep copy short and direct.
- Keep i18n keys synchronized in `en.json` and `zh.json`.
- Preserve Svelte 5 runes syntax in the current admin app.
- Add loading, empty, success, and error states.

Don't:

- Do not add broad dark mode, theme toggle, or auto system dark mode in this phase.
- Do not use dark crypto terminal aesthetics.
- Do not use neon gradients, glassmorphism, or saturated SaaS cards.
- Do not use raw `gray`, `slate`, `white`, or custom hex utilities in components.
- Do not expose Funding or Scheduling navigation until explicitly planned.
- Do not introduce backend, permissions, or business-logic changes as part of visual shell work.
- Do not store passwords, log JWTs, or expose secrets.

## Migration Checklist

Before a migrated admin page is considered complete:

- [ ] Uses Svelte 5 runes syntax used by the current admin app.
- [ ] Uses `$_()` for visible copy.
- [ ] Uses semantic daisyUI tokens only.
- [ ] Has a white Titan canvas and no broad tinted shell.
- [ ] Uses border-first ledger structure.
- [ ] Has loading state.
- [ ] Has empty state where applicable.
- [ ] Has error state.
- [ ] Has consistent form validation UI.
- [ ] Does not store or log secrets.
- [ ] Passes `bun run check`.
- [ ] Builds with `bun run build`.
- [ ] Passes `npx -y @google/design.md lint DESIGN.md`.
