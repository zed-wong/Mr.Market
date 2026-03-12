# Development Principles
Follow KISS, YAGNI, and DRY. Don't add unnecessary code. Reuse existing codebase.

# Tech Stack

## Frontend
- Svelte 4 syntax (not Svelte 5)
- daisyui + tailwindcss for styling
  - White text: `text-base-100`
  - Black text: `text-base-content`
  - White bg: `bg-base-100`
  - Black bg: `bg-base-content`
  - Gray: `bg-base-content/60` or `bg-base-300`
  - Avoid custom colors like `text-gray-900`
  - Use `capitalize` instead of `uppercase`
  - Use `<span>` with tailwind classes instead of `<h1>`, `<p>`
- svelte-i18n with `$_` for text, en.json is default

## Backend
- bignumber.js for numeric calculations
- getRFC3339Timestamp() for string timestamps

# Conventions

## Dependencies
Use bun (not npm/yarn/pnpm)

## Commits
No agent signatures (Claude, sisyphus, etc.) in commit messages

## Docs
- Keep docs updated with code changes
- Update docs/execution/CHANGELOG.md (one line per change)
- Keep docs/code/ as md version of code

# Security
Never read .env files directly
