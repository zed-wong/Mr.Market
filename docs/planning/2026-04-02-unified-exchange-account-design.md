# Unified Exchange Account Design

## Problem

The current exchange management is split into two confusing entities:

1. **`admin_exchanges`** table → exchange metadata (ccxt id, name, icon, enable flag) — **completely non-functional**. The `enable` flag has no runtime effect. Market data comes from `api_keys_config` CCXT instances, not this table.

2. **`api_keys_config`** table → actual credentials (exchange, name, api_key, api_secret) — the only thing that actually works.

**Root cause:** CCXT needs credentials for any meaningful API call. There is no use case where we need market data from an exchange without any API key at all. So the separate "exchange instance for market data" concept is dead code.

The UI reflects this confusion:
- `/admin/settings/exchanges` → manages `admin_exchanges` (display only, no runtime effect)
- `/admin/settings/api-keys` → manages `api_keys_config` (real credentials)
- No clear relationship between the two
- Admin doesn't know where to configure what

## Decision

**Merge into a single `ExchangeAccount` entity.** Delete `admin_exchanges` entirely. One entity handles everything: credentials + metadata + capabilities.

## Data Model

```typescript
@Entity('exchange_accounts')
export class ExchangeAccount {
  @PrimaryGeneratedColumn()
  id: string;  // UUID

  @Column()
  exchange: string;   // CCXT id: "binance", "okx", etc.

  @Column()
  label: string;      // e.g. "default", "account2" — account label on the exchange

  @Column()
  name: string;        // Display name shown in UI

  @Column()
  mode: 'live' | 'sandbox';  // Testnet vs production

  @Column({ nullable: true })
  api_key: string | null;

  @Column({ nullable: true })
  api_secret_encrypted: string | null;

  @Column()
  capabilities: 'read' | 'trade' | 'full';  // What this key can do
  // 'read'  — market data only (read-only API key)
  // 'trade' — balance + order placement
  // 'full'  — everything including withdrawal

  @Column({ default: true })
  enabled: boolean;   // Enable/disable this account

  @Column({ default: false })
  is_default: boolean; // Default account for this exchange

  @Column()
  created_at: string;

  @Column({ nullable: true })
  icon_url: string | null;  // Exchange logo
}
```

### Why `capabilities` instead of separate boolean flags?

A single enum is sufficient and simpler. The exchange API key either has read access, trade access, or full access. We don't need fine-grained `can_withdraw: false` combos — just use the right key for the right job. If withdrawal is needed, use a key with `capabilities: 'full'`.

## API Endpoints

Replace both `/admin/exchanges` and `/admin/exchanges/keys` with:

```
GET    /admin/exchange-accounts           → list all
POST   /admin/exchange-accounts           → add new
GET    /admin/exchange-accounts/:id       → get one (masked secret)
PATCH  /admin/exchange-accounts/:id       → update (enable, rename, capabilities)
DELETE /admin/exchange-accounts/:id       → remove
GET    /admin/exchange-accounts/:id/test  → test connectivity + validate key
GET    /admin/exchange-accounts/:id/balance → fetch current balance
```

## Migration Plan

1. Create `exchange_accounts` table with all fields from both existing tables
2. Copy all `api_keys_config` rows into `exchange_accounts` (migration has api_key, secret, etc.)
3. Copy `admin_exchanges` icon_url and name into matching `exchange_account` rows by exchange name
4. Set `capabilities: 'trade'` for migrated keys (existing keys can trade)
5. Point all code references from `api_keys_config` → `exchange_accounts`
6. Point all code references from `admin_exchanges` → `exchange_accounts`
7. Delete `admin_exchanges` and `api_keys_config` tables (after migration verified)
8. Delete `ExchangeInitService` two-level map — use `ExchangeAccount` directly

## UI Changes

Single `/admin/settings/exchanges` page replaces both:
- Left: Exchange account list with columns (icon, name, exchange, label, capabilities badge, status, actions)
- Right (or modal): Add/edit exchange account form
  - Exchange (ccxt id with autocomplete)
  - Label (account label, default "default")
  - Display name
  - API key
  - API secret
  - Capabilities dropdown (read / trade / full)
  - Mode toggle (live / sandbox)
  - Icon URL (auto-filled from CCXT)
- Test connectivity button before saving
- Delete confirmation

## Scope for Future Implementation

This plan is marked as **TODO** — to be implemented in a future sprint.

### Estimated Effort

| Phase | Work |
|-------|------|
| Database | New entity + migration, data copy script |
| Backend | Consolidate ExchangeApiKeyService + ExchangeInitService, delete ExchangeConfigService |
| API | New endpoints replacing old ones |
| Frontend | Merge two admin pages into one, delete dead components |
| Cleanup | Delete `admin_exchanges` entity, `addExchange`, `ExchangeList` components |
