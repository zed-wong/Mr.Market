# UI Design Pattern (Current Codebase)

This document reflects what is implemented in `interface/` today.

## Source Of Truth Files

- `interface/src/app.css`
- `interface/src/lib/theme/daisyui-themes.css`
- `interface/src/lib/theme/themes.ts`
- `interface/src/lib/stores/theme.ts`
- `interface/src/routes/styles.css`
- `interface/src/routes/+layout.svelte`
- `interface/src/routes/(bottomNav)/(admin)/+layout@.svelte`
- `interface/tailwind.config.cjs`
- `interface/postcss.config.cjs`

## Frontend Stack (From `interface/package.json`)

- Svelte: `^4.2.20`
- SvelteKit: `^2.47.2`
- Tailwind CSS: `4`
- DaisyUI: `^5.3.10`
- svelte-i18n: `^4.0.1`
- clsx: `^2.1.1`
- svelte-sonner: `0.3.28`

## Theme System

### Theme Names

Defined in `interface/src/lib/theme/themes.ts`:

- `main-light`
- `main-dark`
- `admin-light`
- `admin-dark`

### DaisyUI Theme Registration

Defined in `interface/src/lib/theme/daisyui-themes.css`:

- `main-light` is `--default`
- `main-dark` is `--prefersdark`
- `admin-light` and `admin-dark` are additional named themes

### Theme Store

Defined in `interface/src/lib/stores/theme.ts`:

- `theme` store is initialized to `toMainTheme(false)` (`main-light`)
- `darkTheme` is derived from theme name with `isDarkThemeName`
- `toggleTheme()` switches between `main-light` and `main-dark`
- `detectSystemDark()` maps system/mixin dark preference to main themes

### Layout Wiring

- Global app uses `data-theme={$theme}` in `interface/src/routes/+layout.svelte`
- Admin route layout overrides with `data-theme={toAdminTheme($darkTheme)}` in `interface/src/routes/(bottomNav)/(admin)/+layout@.svelte`
- `detectSystemDark()` exists but is currently not called in `+layout.svelte` (line is commented)

## Color Tokens In Use

### Main Theme Intent

- Main themes keep existing app identity (orange/blue accent family)
- Main light base tokens are `base-100: #ffffff`, `base-200: #f8fafc`, `base-300: #e2e8f0`, `base-content: #0f172a`

### Admin Theme Intent

- Admin themes are neutral and professional
- Admin light base tokens are `base-100: #ffffff`, `base-200: #f8fafc`, `base-300: #e2e8f0`, `base-content: #0f172a`
- Admin dark base tokens are `base-100: #0f172a`, `base-200: #1e293b`, `base-300: #334155`, `base-content: #f8fafc`

### Usage Rules Followed In Codebase

- Use semantic tokens: `text-base-content`, `bg-base-100`, `border-base-200/300`
- Use muted opacity variants: `text-base-content/60`, `/70`
- Use `bg-slate-50` and `bg-slate-100` as secondary neutral surfaces in many components

## Typography

### Global Fonts

Defined in `interface/src/routes/styles.css` and mirrored in `interface/src/lib/theme/themes.ts`:

- Body font: `inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif`
- Mono font: `'Fira Mono', monospace`
- Display font helper: `'Bebas Neue', sans-serif` via `.balance-font`

### Common Text Sizes Seen In Components

- `text-xs` (12px)
- `text-sm` (14px)
- `text-base` (16px)
- `text-lg` (18px)
- `text-xl` (20px)
- `text-2xl` (24px)

## Global CSS Utilities

Defined in `interface/src/routes/styles.css`:

- `.no-scrollbar` hides scrollbars across browsers
- number input arrows removed for webkit/firefox
- `.visually-hidden` screen-reader utility
- `.text-column` max-width content helper
- `.balance-font` display font utility

Defined in `interface/src/app.css`:

- disables menu item transitions in DaisyUI menu lists
- hides TradingView watermark/logo elements for lightweight charts

## Layout Patterns In Codebase

- App shell root: `.app.text-base-content.select-none` with `min-height: 100vh`
- Bottom-nav routes use `interface/src/routes/(bottomNav)/+layout.svelte`
- Admin routes use fixed sidebar and responsive top actions in `interface/src/routes/(bottomNav)/(admin)/+layout@.svelte`

## Build Config

- Tailwind content scan: `./src/**/*.{html,js,svelte,ts}` (`interface/tailwind.config.cjs`)
- PostCSS plugins: `@tailwindcss/postcss`, `autoprefixer` (`interface/postcss.config.cjs`)
