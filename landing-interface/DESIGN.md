---
version: alpha
name: Mr.Market Landing Interface
description: Titan-inspired monochrome financial ledger system for the public landing and maker leaderboard.
colors:
  primary: "#111111"
  secondary: "#615e5b"
  tertiary: "#ff9900"
  neutral: "#ffffff"
  midnight-ink: "#111111"
  canvas-white: "#ffffff"
  off-white-sage: "#f3efeb"
  faded-stone: "#e9eaeb"
  gunmetal-gray: "#615e5b"
  soft-concrete: "#d8d3cc"
  action-black: "#000000"
  highlight-orange: "#ff9900"
  success-sage: "#dce7df"
  warning-paper: "#eee6d1"
typography:
  display:
    fontFamily: Geist
    fontSize: 60px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
    fontFeature: "ss02, ss03"
  display-sm:
    fontFamily: Geist
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
    fontFeature: "ss02, ss03"
  heading-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.03em"
    fontFeature: "ss02, ss03"
  heading:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.01em"
    fontFeature: "ss02, ss03"
  heading-sm:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.01em"
    fontFeature: "ss02, ss03"
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
    fontFeature: "ss02, ss03"
  body:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
    fontFeature: "ss02, ss03"
  body-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.02em"
    fontFeature: "ss02, ss03"
  caption:
    fontFamily: Geist
    fontSize: 10px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.03em"
    fontFeature: "ss02, ss03"
  data-xl:
    fontFamily: Geist Mono
    fontSize: 48px
    fontWeight: 500
    lineHeight: 1.0
    letterSpacing: "-0.01em"
    fontFeature: "ss08"
  data-lg:
    fontFamily: Geist Mono
    fontSize: 28px
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontFeature: "ss08"
  data:
    fontFamily: Geist Mono
    fontSize: 20px
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontFeature: "ss08"
  data-sm:
    fontFamily: Geist Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0.03em"
    fontFeature: "ss08"
spacing:
  4: 4px
  8: 8px
  12: 12px
  16: 16px
  20: 20px
  24: 24px
  28: 28px
  32: 32px
  36: 36px
  40: 40px
  52: 52px
  56: 56px
  60: 60px
  64: 64px
  80: 80px
  88: 88px
  page-max-width: 1200px
  section-gap: 80px
  card-padding: 28px
  element-gap: 24px
rounded:
  small: 10px
  medium: 20px
  cards: 32px
  navigation: 140px
  buttons: 160px
components:
  button-primary:
    backgroundColor: "{colors.action-black}"
    textColor: "{colors.neutral}"
    typography: "{typography.body}"
    rounded: "{rounded.buttons}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.midnight-ink}"
    textColor: "{colors.canvas-white}"
    typography: "{typography.body}"
    rounded: "{rounded.buttons}"
    padding: 12px
  button-ghost:
    backgroundColor: "{colors.canvas-white}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.buttons}"
    padding: 12px
  button-ghost-hover:
    backgroundColor: "{colors.soft-concrete}"
    textColor: "{colors.midnight-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.buttons}"
    padding: 12px
  nav-link:
    backgroundColor: "{colors.canvas-white}"
    textColor: "{colors.midnight-ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.navigation}"
    padding: 11px
  nav-link-muted:
    backgroundColor: "{colors.faded-stone}"
    textColor: "{colors.secondary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.navigation}"
    padding: 11px
  feature-card:
    backgroundColor: "{colors.off-white-sage}"
    textColor: "{colors.midnight-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.medium}"
    padding: 28px
  expanded-feature-card:
    backgroundColor: "{colors.off-white-sage}"
    textColor: "{colors.midnight-ink}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.cards}"
    padding: 56px
  stat-display-card:
    backgroundColor: "{colors.canvas-white}"
    textColor: "{colors.midnight-ink}"
    typography: "{typography.data-lg}"
    rounded: "{rounded.cards}"
    padding: 32px
  ledger-row:
    backgroundColor: "{colors.canvas-white}"
    textColor: "{colors.midnight-ink}"
    typography: "{typography.data-sm}"
    rounded: "{rounded.small}"
    padding: 16px
  ledger-row-muted:
    backgroundColor: "{colors.faded-stone}"
    textColor: "{colors.gunmetal-gray}"
    typography: "{typography.data-sm}"
    rounded: "{rounded.small}"
    padding: 16px
  campaign-status-active:
    backgroundColor: "{colors.success-sage}"
    textColor: "{colors.midnight-ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.navigation}"
    padding: 8px
  campaign-status-forming:
    backgroundColor: "{colors.warning-paper}"
    textColor: "{colors.midnight-ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.navigation}"
    padding: 8px
  highlight-pin:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.midnight-ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.navigation}"
    padding: 8px
  accent-mark:
    backgroundColor: "{colors.highlight-orange}"
    textColor: "{colors.midnight-ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.small}"
    padding: 8px
---

## Overview

Mr.Market Landing Interface uses a Titan-inspired monochrome financial ledger style: high contrast, spacious, disciplined, and warm enough for a public market-making product. The interface should feel like a precise financial record rather than a crypto campaign page. Use sharp information hierarchy, pill-shaped interactions, ledger-like data rows, and restrained surfaces. Decoration is minimal; depth comes from spacing, rounded surfaces, subtle warm grays, and the relationship between public campaign copy and tabular maker data.

This design system applies to the combined public web app in `landing-interface/`, where the landing route (`/`) and leaderboard route (`/leaderboard`) share one visual language but remain distinct product surfaces.

## Colors

- **Midnight Ink (`#111111`)**: Primary text, dark logo marks, and high-emphasis strokes. Use for almost all readable foreground text.
- **Canvas White (`#ffffff`)**: Dominant page background and main card surface. This should remain the default public-facing canvas.
- **Off-White Sage (`#f3efeb`)**: Warm secondary surface for feature cards, explanatory panels, and large content blocks.
- **Faded Stone (`#e9eaeb`)**: Very light dividers, navigation backgrounds, and low-contrast separators.
- **Gunmetal Gray (`#615e5b`)**: Secondary copy, helper text, metadata, timestamps, and muted labels.
- **Soft Concrete (`#d8d3cc`)**: Subtle button/card borders. Use when an outline needs to exist without becoming a heavy table grid.
- **Action Black (`#000000`)**: Primary CTA background and selected filter state.
- **Highlight Orange (`#ff9900`)**: Rare accent only. Use for small SVG strokes, status pins, or one important highlight; never as a broad brand wash.
- **Success Sage (`#dce7df`)** and **Warning Paper (`#eee6d1`)**: Optional semantic backgrounds for campaign states, not decorative colors.

## Typography

Use Geist as the intended primary face. If Geist is unavailable, use Inter. Use Geist Mono sparingly for ledger numbers, ranks, orderbook prices, reward amounts, volume, uptime, and route-like labels such as `/leaderboard`.

- Display headlines use Geist 700 at 60px or 40px with tight negative letter spacing. Headlines should be direct and short.
- Body text uses Geist 400 or 500 at 14–16px. Avoid thin weights.
- Captions and metadata use small sizes with modest positive tracking, but avoid all-caps shouting unless the label is truly structural.
- Button labels use normal letter spacing. Do not add positive tracking to CTAs; pill geometry and weight provide enough emphasis.
- Numerical data should use mono with tabular behavior so leaderboard rows and orderbook depths scan vertically.

## Layout

Use a centered, contained layout with `1200px` max width. Major sections should breathe with `80px` rhythm where possible, while cards use `28px` padding and `24px` internal gaps.

The landing page should use a two-column hero: product thesis and CTA on the left, financial ledger/orderbook preview on the right. The leaderboard route should use the same header and surface system, but shift emphasis to campaign epoch metrics, ranking rows, active reward pools, and scoring trace.

Prefer grids and aligned columns over decorative illustrations. When imagery is needed, use monochrome linework or very subtle financial/ledger diagrams rather than colorful crypto visuals.

## Elevation & Depth

Do not use box shadows as the main elevation mechanism. Titan-like depth comes from:

- Canvas White against Off-White Sage surfaces.
- Soft Concrete or Faded Stone borders.
- Generous spacing between sections.
- Pill-shaped controls floating inside otherwise simple surfaces.
- Slight background changes for selected rows, filters, and active route states.

If a component needs stronger emphasis, make it larger, darker, or more isolated instead of adding a shadow.

## Shapes

Use rounded shapes consistently:

- Cards: `32px` for large stat and expanded cards.
- Feature cards: `20px` for compact informational blocks.
- Small pills or ledger row highlights: `10px`.
- Navigation buttons: `140px`.
- Primary and ghost buttons: `160px`.

Avoid square default buttons and avoid inconsistent arbitrary radii. The pill geometry is a core part of the Titan-inspired warmth.

## Components

### Primary Filled Button

Use Action Black background, Canvas White text, 160px radius, and comfortable horizontal padding. Reserve for the main CTA such as `View leaderboard`, `Enter campaigns`, or `Join campaign`.

### Ghost Button

Use Canvas White or transparent background, Midnight Ink text, Soft Concrete 1px border, and 160px radius. Use for secondary actions such as `Read mechanism` or `See campaign rules`.

### Navigation Link Button

Use no underline, Midnight Ink text, and 140px radius. Active route state may use Faded Stone or a subtle filled pill; avoid blue default links.

### Feature Card

Use Off-White Sage background, 20px radius, and 28px padding. Good for mechanism explanation: funding layer, scheduling layer, trading layer, reward layer.

### Expanded Feature Card

Use Off-White Sage background, 32px radius, and larger 56px vertical padding. Good for route split explanation, product thesis, or campaign mechanics.

### Stat Display Card

Use Canvas White background, 32px radius, no shadow, and mono numeric typography. Content should be separated by whitespace, not heavy borders.

### Ledger Row

Use Canvas White background with subtle Faded Stone or Soft Concrete separators. Rows should align rank, maker, pair, score, spread, uptime, volume, and rewards. Use mono for numeric values and Geist for maker names.

## Do's and Don'ts

### Do

- Use Midnight Ink against Canvas White or Off-White Sage for strong contrast.
- Keep the public product surface calm, authoritative, and ledger-first.
- Use pill radii for CTAs, filters, navigation, and route links.
- Use Geist 700 for concise 40px/60px headlines with tight tracking.
- Use Geist Mono only for numbers, ranks, route labels, and technical ledger references.
- Use Off-White Sage for secondary sections and feature cards.
- Keep leaderboard rows scannable with aligned columns, tabular numbers, and muted helper labels.
- Let copy reference Mr.Market architecture precisely: order-scoped balances, reservation before external orders, fills, attributable volume, and rewards.

### Don't

- Do not introduce broad saturated colors, gradients, glassmorphism, neon crypto visuals, or decorative card clutter.
- Do not use shadows for ordinary cards or tables.
- Do not leave default blue underlined browser links anywhere in the interface.
- Do not use generic square or mildly rounded buttons; use the defined pill radii.
- Do not create dense unbroken prose blocks. Break product explanation into cards, rows, and short ledgers.
- Do not use fake dashboards unrelated to market-making. Every metric should map to depth, spread, uptime, volume, rewards, reservation, fills, or ledger trace.
- Do not style the leaderboard as a generic SaaS table; it should feel like a public financial record.
