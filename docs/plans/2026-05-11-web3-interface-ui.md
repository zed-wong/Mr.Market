# Plan: `web3-interface` UI Design

**Date:** 2026-05-11
**Status:** Draft
**Prerequisite Plan:** [2026-05-11-web3-interface-design.md](./2026-05-11-web3-interface-design.md)

---

## 1. Goals and Non-Goals

**Goals:**

- A focused, wallet-first SPA that feels native to web3 users (Reown connect modal, address-as-identity, on-chain actions surfaced inline) while reusing the visual rhythm of the existing Mixin app so the same brand is recognizable.
- Mobile-first layout (375px target). Desktop is a centered column with breathing room, not a separate design.
- Five top-level destinations: Home, Market, Market-Making, Wallet, Account. Modal flows for Connect, Sign-In, Deposit, Withdraw, Confirm Tx.
- All states explicitly designed: disconnected, connected-but-not-signed-in, wrong-network, signed-in-empty, signed-in-with-balances, loading, error.

**Non-Goals (v1):**

- Swap, in-app spot trading, in-app messages, fiat on-ramps.
- Light/dark theme switcher polish beyond a single toggle.
- Custom icon set — we use Heroicons (already in admin) plus token logos via the existing asset registry.
- Deep desktop layout (sidebar, multi-column dashboards).

---

## 2. Design Language

### 2.1 Foundations

- **Tailwind v4 + daisyUI v5 semantic colors only** (`bg-base-100`, `bg-base-200`, `bg-base-300`, `text-base-content`, `text-base-content/60` for muted, `primary`, `secondary`, `accent`, `success`, `warning`, `error`). No literal grays/blues.
- **Two daisyUI themes**: `web3-light` and `web3-dark`, defined in `app.css` with the same primary color the Mixin app uses, so users coming from the Mixin app feel continuity. Default to system preference; persisted to `localStorage` key `web3-dark-theme`.
- **Typography**: a single sans stack (system default), three weights (400/500/700). Sizes: `text-xs / sm / base / lg / xl / 2xl`. No `<h1>`/`<p>` — `<span>` + utility classes per AGENTS.md.
- **Casing**: `capitalize` everywhere, never `uppercase`.
- **Spacing rhythm**: 4 / 8 / 12 / 16 / 24 px. Page padding is `px-4 pt-4 pb-24` (bottom padding clears the bottom nav).
- **Corners**: `rounded-2xl` on cards, `rounded-xl` on inputs, `rounded-full` on chips and the connect button.
- **Elevation**: no shadows in light mode beyond `shadow-sm` on the top bar; dark mode uses `bg-base-200` cards on `bg-base-100` background with a 1px `border-base-300` border for separation.

### 2.2 Iconography & Imagery

- Heroicons (outline 24 for nav + actions, solid 20 inline). One icon library, no mixing.
- Token logos via `lib/helpers/asset.ts` resolver from the existing asset registry; fallback is the first letter on a `bg-base-300` circle.
- Address avatars: deterministic blockie-style 6-color svg generated from the address (one tiny helper, no extra dependency).

### 2.3 Reown ↔ daisyUI Theme Mapping

Reown AppKit accepts CSS theme variables. We map daisyUI tokens through `--w3m-*` variables in `app.css`:

```css
:root {
  --w3m-color-mix: var(--color-base-100);
  --w3m-color-mix-strength: 0;
  --w3m-accent: var(--color-primary);
  --w3m-border-radius-master: 12px;
  --w3m-font-family: inherit;
}
```

The connect modal then visually matches the rest of the app without us re-skinning every Reown internal.

---

## 3. Layout Shell

### 3.1 Mobile (default, ≤640px)

```diagram
╭─────────────────────────────────────────╮
│ TopBar  [logo]   [chain] [theme] [conn] │  56px, sticky, bg-base-100/80 backdrop-blur
├─────────────────────────────────────────┤
│                                         │
│           Page content                  │  px-4, max-w-md, mx-auto
│                                         │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│ BottomNav [home][mkt][mm][wallet][acct] │  64px, fixed, bg-base-200, safe-area
╰─────────────────────────────────────────╯
```

- **TopBar**: logo (left, links `/`), chain pill, theme toggle, AppKit connect button (right). When signed in, the connect button collapses to `addr...avatar`; tapping opens the AppKit account modal (disconnect, copy address, switch network).
- **BottomNav**: 5 fixed items, icon+label, the active item uses `text-primary`. Hidden on `/login` only.

### 3.2 Desktop (≥768px)

Same layout, capped at `max-w-md` for content with a `max-w-3xl` two-column variant only on `/market` and `/market-making` lists when there is enough horizontal space. No sidebar in v1 — desktop is a "wider phone".

### 3.3 Top-level Routes

| Route | Nav item | Title | Notes |
|---|---|---|---|
| `/` | Home | "home" | Portfolio summary + quick actions + recent activity |
| `/market` | Market | "market" | Read-only market list (reuse server tickers) |
| `/market-making` | Market making | "market making" | Campaigns + my positions tabs |
| `/wallet` | Wallet | "wallet" | Per-asset balances, deposit/withdraw entry points |
| `/account` | Account | "account" | Connected address, sessions, theme/locale, logout |
| `/login` | — | "sign in" | Connect + SIWE; full-screen, no bottom nav |
| `/wallet/deposit` | — | "deposit" | Asset picker → deposit form → confirm dialog → status |
| `/wallet/withdraw` | — | "withdraw" | Asset picker → withdraw form → confirm dialog → status |

`/deposit` and `/withdraw` are nested under `/wallet` so the wallet tab stays "active" in the bottom nav while inside those flows.

---

## 4. Auth & Connection States

The app has four mutually exclusive top-level UI states. `+layout.svelte` decides which to render before any page-level content.

```diagram
              ╭───────────────╮
              │ App boot      │
              ╰───────┬───────╯
                      ▼
       ╭───────────────────────────╮
       │ Has valid JWT in storage? │
       ╰──────┬─────────────┬──────╯
              │ no          │ yes
              ▼             ▼
   ╭───────────────╮  ╭────────────────────╮
   │ /login screen │  │ Wallet connected?  │
   ╰───────┬───────╯  ╰────┬───────────┬───╯
           │               │ yes       │ no
           │               ▼           ▼
           │      ╭────────────╮  ╭───────────────╮
           │      │ Right net? │  │ Soft re-prompt│
           │      ╰─┬────────┬─╯  │ to reconnect  │
           │        │ yes    │ no ╰──────┬────────╯
           │        ▼        ▼           │
           │   App routes  Switch CTA    │
           │                             │
           ╰─────────────────────────────╯
```

### 4.1 `/login` screen

Single full-screen card, centered, max width 360px:

```diagram
╭─────────────────────────────╮
│            [logo]           │
│                             │
│     welcome to mr.market    │
│   sign in with your wallet  │
│                             │
│   ┌───────────────────────┐ │
│   │  connect wallet       │ │  <appkit-button /> styled as primary btn-lg
│   └───────────────────────┘ │
│                             │
│   ┌───────────────────────┐ │
│   │  sign in with ethereum│ │  visible after connect, primary outline
│   └───────────────────────┘ │
│                             │
│   protected by SIWE • 7-day │  text-xs text-base-content/60
│   session                   │
╰─────────────────────────────╯
```

States:

- **Disconnected**: only "connect wallet" visible. Tapping opens the Reown modal.
- **Connected, wrong chain**: "switch network to Ethereum" replaces the SIWE button (warning style).
- **Connected, right chain, not signed**: "sign in with Ethereum" enabled. Tapping calls `personal_sign` with the SIWE message; loading spinner inside the button.
- **Signing → success**: brief spinner, redirect to `/`.
- **Failure**: inline error toast (`svelte-sonner` already in the stack), button re-enabled.

### 4.2 Session expired

Same modal pattern as the new admin app. A global `<SessionExpiredDialog />` listens to `showSessionExpired` and shows a single "sign in again" CTA that navigates to `/login` and clears the auth store.

### 4.3 Wrong-network banner (in-app)

When signed in but the connected wallet is on a chain we don't support for the action being attempted, a sticky `alert alert-warning` banner appears below the top bar with a "switch network" button. Banner is route-scoped: shown on `/wallet/deposit`, `/wallet/withdraw`, and any market-making action that requires a tx; hidden on `/`, `/market`, `/market-making` list views.

---

## 5. Page Designs

All wireframes use `max-w-md mx-auto`; padding is `px-4 pt-4 pb-24`.

### 5.1 Home `/`

```diagram
╭──────────────────────────────────────╮
│ portfolio                            │  text-sm text-base-content/60
│ $12,345.67                           │  text-3xl font-bold
│ +$120.34 (0.98%) 24h    ▾ ETH       │  text-success / accent toggle for asset
├──────────────────────────────────────┤
│ ╭─────╮  ╭─────╮  ╭─────╮  ╭─────╮  │  4 quick-action chips
│ │depo │  │with │  │ mm  │  │mkt  │  │  bg-base-200, icon top, label bottom
│ ╰─────╯  ╰─────╯  ╰─────╯  ╰─────╯  │
├──────────────────────────────────────┤
│ campaigns you're in                  │  section header
│ ┌──────────────────────────────────┐ │
│ │ ETH/USDT • Binance               │ │
│ │ APR 18.4%   reward 12.30 USDT    │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ recent activity                      │
│ • deposit  0.5 ETH   2h ago     ✓   │
│ • payout   200 USDT  yesterday  ✓   │
│ • join mm  ETH/USDT  3d ago     ✓   │
╰──────────────────────────────────────╯
```

Empty state (no balances, no campaigns): Portfolio shows `$0.00`; quick actions still visible; campaigns/activity sections show one-line empty strings ("no campaigns yet · explore market making →") that link out.

### 5.2 Market `/market`

- Top: search input (`input input-sm input-bordered w-full`) with a magnifier icon.
- Tabs: "favorites · all · gainers · losers" (`tabs tabs-boxed tabs-sm`).
- List: virtualized rows.

```diagram
┌────────────────────────────────────┐
│ ◯ ETH    Ethereum         $3,210   │
│          ETH/USDT         +1.24%   │  green or red
└────────────────────────────────────┘
```

Tap → drawer (bottom sheet on mobile, side drawer on desktop) with the pair details, recent ticks sparkline, and a "trade on…" CTA that links to the relevant CEX (we don't trade in-app v1).

### 5.3 Market-Making `/market-making`

Tabs: "campaigns · my positions".

**Campaigns tab** — same campaign card as the existing Mixin app, but compact:

```diagram
┌────────────────────────────────────┐
│ ETH/USDT  binance                  │
│ APR 18.4% • TVL $124k              │
│ ┌────────────────┐ ┌────────────┐  │
│ │ join campaign  │ │ details    │  │
│ └────────────────┘ └────────────┘  │
└────────────────────────────────────┘
```

Tapping "join campaign" opens a bottom sheet:

1. Choose deposit amount in `quote` and `base`. We pre-fill from ledger balance; if insufficient, show a "deposit first" link that jumps to `/wallet/deposit?asset=…`.
2. Show estimated APR + reward share + risk note.
3. "confirm" calls `POST /campaigns/:id/join`. No on-chain tx is needed (funds are already in the vault).
4. Success → toast + navigate to "my positions" tab with the new row pre-expanded.

**My positions tab**:

```diagram
┌────────────────────────────────────┐
│ ETH/USDT • binance       active    │  badge badge-success
│ position 0.5 ETH + 1,000 USDT      │
│ realized 12.30 USDT                │
│ ┌────────────┐ ┌────────────────┐  │
│ │ claim      │ │ leave campaign │  │
│ └────────────┘ └────────────────┘  │
└────────────────────────────────────┘
```

### 5.4 Wallet `/wallet`

Single column list of every asset the user has touched plus zero-balance assets supported on the current chain. Each row:

```diagram
┌────────────────────────────────────┐
│ ◯ ETH                        0.812 │
│   $2,604.23                        │
│   ┌──────────┐  ┌────────────┐     │
│   │ deposit  │  │ withdraw   │     │
│   └──────────┘  └────────────┘     │
└────────────────────────────────────┘
```

Pull-to-refresh refetches `/balances`. Header shows total $ value and chain pill.

### 5.5 Deposit `/wallet/deposit`

Three steps in a single screen, advancing inline (no route change):

1. **Asset picker** (skipped if `?asset=` query param is set): list of supported assets on the current chain.
2. **Form**:
   ```diagram
   ┌────────────────────────────────────┐
   │ deposit ETH                        │
   │ ┌────────────────────────────────┐ │
   │ │ 0.0                       MAX  │ │  big numeric input
   │ └────────────────────────────────┘ │
   │ available 0.812 ETH ($2,604.23)    │
   │                                    │
   │ vault address                      │
   │ 0xabc…1234                  [copy] │  monospace
   │                                    │
   │ ┌────────────────────────────────┐ │
   │ │ deposit                        │ │  primary btn-lg, full width
   │ └────────────────────────────────┘ │
   │ confirmations needed: 12           │ text-xs muted
   └────────────────────────────────────┘
   ```
3. **Status**: after the wallet signs, render a step list with live updates:
   ```diagram
   ✓ tx broadcast        0xabc…1234   [explorer ↗]
   ⏳ 7/12 confirmations
   ◯ ledger credit
   ```
   Final state: success toast + auto-redirect to `/wallet` with the asset row scrolled into view and a brief "+0.5 ETH" pulse.

ERC-20 path inserts an "approve" sub-step before "deposit" if allowance is insufficient. Native ETH skips approval.

### 5.6 Withdraw `/wallet/withdraw`

Server-mediated, so no user-side tx. Same shell as deposit:

1. **Asset picker** (skippable via `?asset=`).
2. **Form**:
   ```diagram
   ┌────────────────────────────────────┐
   │ withdraw ETH                       │
   │ ┌────────────────────────────────┐ │
   │ │ 0.0                       MAX  │ │
   │ └────────────────────────────────┘ │
   │ available 0.812 ETH                │
   │                                    │
   │ destination                        │
   │ ┌────────────────────────────────┐ │
   │ │ 0x…  paste · use connected     │ │  default = connected address
   │ └────────────────────────────────┘ │
   │                                    │
   │ network fee paid by mr.market      │  text-xs muted
   │ ┌────────────────────────────────┐ │
   │ │ review                         │ │  primary
   │ └────────────────────────────────┘ │
   └────────────────────────────────────┘
   ```
3. **Confirm dialog** (modal):
   ```diagram
   ┌────────────────────────────────────┐
   │ confirm withdraw                   │
   │ amount     0.5 ETH                 │
   │ to         0x…                     │
   │ ─────────────────────────────────  │
   │ you will receive   0.5 ETH         │
   │ ─────────────────────────────────  │
   │ ┌────────┐ ┌─────────────────────┐ │
   │ │ cancel │ │ confirm withdraw    │ │
   │ └────────┘ └─────────────────────┘ │
   └────────────────────────────────────┘
   ```
4. **Status**: same step list as deposit but reversed:
   ```diagram
   ✓ ledger debit
   ⏳ admin paying out
   ◯ tx confirmed
   ```
   Failure path shows a red error step with the reversal note ("your balance has been refunded") and a "try again" button.

### 5.7 Account `/account`

```diagram
╭──────────────────────────────────────╮
│ [avatar] 0xabc…1234            [⎘]   │
│ ethereum mainnet                     │
├──────────────────────────────────────┤
│ session                              │
│ • signed in 2 days ago               │
│ • expires in 5 days                  │
│ ┌──────────────────────────────────┐ │
│ │ sign out                         │ │  btn-outline-error
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ preferences                          │
│ • theme    [light · dark · system]   │
│ • language [en · 中文]               │
├──────────────────────────────────────┤
│ link mixin account            (soon) │  disabled row
├──────────────────────────────────────┤
│ about                                │
│ • terms                              │
│ • docs                               │
│ • version 0.1.0                      │
╰──────────────────────────────────────╯
```

---

## 6. Component Inventory

Shared primitives live under `lib/components/common/`. Feature folders (`wallet/`, `deposit/`, `withdraw/`, `market/`, `market-making/`, `home/`) hold composites built from primitives.

| Primitive | daisyUI / tailwind |
|---|---|
| `Card` | `card bg-base-200 rounded-2xl border border-base-300/40` |
| `SectionHeader` | `text-sm text-base-content/60 capitalize mb-2` |
| `AmountInput` | `input input-bordered input-lg text-2xl font-bold rounded-xl + MAX chip` |
| `AddressInput` | `input input-bordered + paste/use-connected affordances` |
| `AddressBadge` | avatar + truncated `0x…1234` + copy icon |
| `ChainPill` | `badge badge-outline badge-sm`, color-coded per chain |
| `AssetRow` | logo + name + balance + secondary $ value |
| `StepList` | vertical list with `✓ / ⏳ / ◯` states; uses `text-success / text-warning / text-base-content/40` |
| `Sheet` | full-width bottom sheet on mobile, modal on desktop. Built on daisyUI `modal` |
| `Toast` | already in stack (`svelte-sonner`) |
| `EmptyState` | centered icon + one-line copy + optional CTA button |
| `Skeleton` | `skeleton h-X w-Y` from daisyUI for loading |
| `Tabs` | `tabs tabs-boxed tabs-sm` |
| `Button` | `btn btn-primary | btn-outline | btn-ghost`, `btn-lg` for primary CTAs |

Composite components are listed inline in their page sections above.

---

## 7. States We Always Design

For every feature surface, four states are required and reviewed before merge:

1. **Loading** — `Skeleton` of the final layout, never spinners replacing whole screens.
2. **Empty** — `EmptyState` with a clear next action (deposit, explore market making, etc.).
3. **Error** — inline error block with a "retry" CTA; never a silent failure. Network error toasts piggyback on `apiFetch`.
4. **Loaded** — the wireframes above.

Plus auth-specific states surfaced in §4: disconnected, wrong-network, signing, session-expired.

---

## 8. Motion and Feedback

- Page transitions: none beyond a `transition-opacity duration-150` on route swap.
- Inline updates (status step list, balance pulse on credit): use Svelte `transition:fade` / `transition:scale` with 150–200ms easing.
- Long actions (deposit indexing, withdraw payout): the `StepList` updates via a 1.5s polling loop on `/web3/tx/:id`; no spinners on the buttons after submit, the step list is the spinner.
- Tactile feedback on mobile: `tap-highlight-color: transparent`, `:active` scale to `0.98` on primary buttons.

---

## 9. i18n

- Locales: `en` (default) and `zh`. Keys are namespaced per page: `home.*`, `market.*`, `market_making.*`, `wallet.*`, `deposit.*`, `withdraw.*`, `account.*`, `auth.*`, `common.*`.
- All copy in this document is in the en source; no string is allowed in components without a key.
- Persisted locale at `localStorage` key `web3-locale`.

---

## 10. Accessibility

- Color contrast ≥ AA against `bg-base-100` and `bg-base-200` for both `web3-light` and `web3-dark`. Status colors (success/warning/error) are tested with `text-base-content` overlays.
- All interactive elements are real `<button>` / `<a>` (no `<div role="button">`), ≥44×44 hit target, focus ring via daisyUI defaults (`focus-visible:outline-2 outline-primary`).
- Step lists, toasts, and confirm dialogs use proper `aria-live="polite"` / `aria-modal="true"`.
- Reown modal accessibility is delegated to AppKit; we do not wrap or hijack its focus.

---

## 11. Build Order (UI-side)

Aligned with the engineering phases in [the parent design plan](./2026-05-11-web3-interface-design.md):

1. **Phase 0** — App shell (TopBar + BottomNav + theme + i18n + skeleton routes for all five tabs). `/` shows a placeholder "connect wallet" card.
2. **Phase 1** — `/login` with Reown connect + SIWE, session-expired modal, wrong-network banner. `/account` with disconnect + theme + locale. Auth gating in `+layout.svelte`.
3. **Phase 2** — `/wallet` list, `/wallet/deposit` flow (asset picker → form → status). `Home`'s portfolio summary wired to `/balances`.
4. **Phase 3** — `/wallet/withdraw` flow (form → confirm → status), with revert/refund visualization.
5. **Phase 4** — `/market-making` campaigns + my positions tabs, join sheet, claim/leave actions. Home's "campaigns you're in" + "recent activity" sections wired up.
6. **Phase 5** — `/market` polish (search, tabs, drawer details). Empty/error/loading states audit. ZH i18n parity. Accessibility pass.

Each phase ends with the four states (§7) reviewed for the surfaces it touches.

---

## 12. Open UI Decisions

- **Bottom-nav vs. tab bar shape**: 5 items is at the upper bound of comfort for 375px. If labels overflow in ZH, drop labels and rely on icons (with `aria-label`) on `<sm` and re-introduce labels on `≥sm`.
- **Address-as-username vs. ENS**: v1 shows checksummed `0x…` everywhere. ENS reverse lookup is a Phase 5 polish, gated on a single `/web3/ens?addr=` server endpoint.
- **Token list curation**: at launch we ship a tiny hand-curated list (ETH, USDC, USDT). A "show all ERC-20 in your wallet" view is explicitly Phase 5+.
- **Light vs. dark default**: default to system. If telemetry shows >80% dark on the Mixin app, switch web3 default to dark too.
