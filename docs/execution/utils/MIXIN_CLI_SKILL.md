# Mixin CLI Skill Guide

## Purpose

This guide is a practical and safe-first reference for using `mixin-cli` in Mixin app operations.

It is updated for the current Mixin Safe baseline:

- Safe transactions are the default for value movement.
- Top-level legacy `transfer` flow is deprecated for new integrations.
- Use `mixin-cli safe ...` commands for transaction-related workflows.

## Scope and Version

This document targets `fox-one/mixin-cli` (Go CLI, v2).

Quick check:

```bash
mixin-cli --help
mixin-cli version
```

If your binary does not expose the `safe` group, update to latest v2 build.

## Why Safe Is the Baseline

According to Mixin Developers docs, the latest network model is Safe + Sequencer. Transaction flows are built around Safe transaction assembly, validation, signing, and submission.

Operational impact:

- New transaction logic should use Safe commands/endpoints.
- Old `transfer` command examples are kept only for legacy maintenance.

## Installation

### Option 1: Go install (recommended)

```bash
go install github.com/fox-one/mixin-cli/v2@latest
```

### Option 2: Build from source

```bash
git clone https://github.com/fox-one/mixin-cli.git
cd mixin-cli
go install
```

### Option 3: Prebuilt binary

Download from release assets and put executable in `PATH`.

## Keystore Setup

Expected keystore schema:

```json
{
  "client_id": "",
  "session_id": "",
  "private_key": "",
  "pin_token": "",
  "pin": ""
}
```

Supported loading modes:

1. `--file <path>`
2. `--stdin`
3. named profile from `~/.mixin-cli/<name>.json`
4. `--pin <pin>` override

Examples:

```bash
# explicit file path
mixin-cli --file ./keystore.json user me

# named profile ~/.mixin-cli/prod.json
mixin-cli prod user me

# stdin
cat ./keystore.json | mixin-cli --stdin user me

# per-command pin override
mixin-cli --file ./keystore.json --pin 123456 user me
```

## Safe Command Map

Main safe command group:

```bash
mixin-cli safe --help
```

High-value subcommands:

- `mixin-cli safe migrate <spend-key>`
- `mixin-cli safe assets`
- `mixin-cli safe transfer --asset ... --amount ...`
- `mixin-cli safe deposit --chain <CHAIN_UUID> ...`
- `mixin-cli safe pending --entry '<RAW_JSON>' ...`
- `mixin-cli safe mixaddress --receivers ... --threshold ...`

## Safe-First Transaction Workflows

## 1) Migrate account to Safe network

Run once per account context when needed:

```bash
mixin-cli --file ./keystore.json safe migrate <SPEND_KEY> --yes
```

Notes:

- `safe migrate` requires PIN confirmation unless `--yes` is used.
- Keep spend key secure and backed up.

## 2) Preflight before transaction

```bash
mixin-cli --file ./keystore.json user me
mixin-cli --file ./keystore.json safe assets
```

Checks:

- app/user context is correct
- unspent outputs exist for target asset
- available balance covers amount and operational overhead

## 3) Safe transfer to single receiver

```bash
mixin-cli --file ./keystore.json safe transfer \
  --asset <ASSET_UUID_OR_KERNEL_ASSET_ID> \
  --amount <AMOUNT> \
  --opponent <USER_UUID> \
  --memo "<MEMO>" \
  --trace <TRACE_UUID> \
  --yes
```

What this command does under the hood:

- collects unspent outputs
- builds Safe transaction
- creates Safe transaction request
- signs transaction
- submits request and returns transaction hash

## 4) Safe transfer to multisig receivers

```bash
mixin-cli --file ./keystore.json safe transfer \
  --asset <ASSET_UUID_OR_KERNEL_ASSET_ID> \
  --amount <AMOUNT> \
  --receivers <USER_UUID_1> \
  --receivers <USER_UUID_2> \
  --threshold 2 \
  --memo "<MEMO>" \
  --trace <TRACE_UUID> \
  --yes
```

Rules:

- `threshold` must be between `1` and receiver count.
- Use deterministic trace ids for idempotent retries.

## 5) Deposit address generation via Safe

```bash
mixin-cli --file ./keystore.json safe deposit \
  --chain <CHAIN_UUID> \
  --receivers <USER_UUID_1> \
  --receivers <USER_UUID_2> \
  --threshold 1
```

Output includes destination, tag, members, threshold, and raw entry payload.

## 6) Query pending Safe deposits

```bash
mixin-cli --file ./keystore.json safe pending \
  --entry '<RAW_ENTRY_JSON>' \
  --asset <ASSET_UUID> \
  --offset <RFC3339_NANO> \
  --limit 100
```

Use after creating deposit entries to monitor incoming funds.

## 7) Generate mix address for routing/multisig

```bash
mixin-cli safe mixaddress \
  --receivers <USER_UUID_1> \
  --receivers <USER_UUID_2> \
  --threshold 2
```

Add `--mixinnet` when a mainnet mix address is required.

## Non-Transaction Commands (Still Useful)

These remain useful and unchanged for ops:

- `mixin-cli asset list`
- `mixin-cli asset search <ASSET_OR_SYMBOL>`
- `mixin-cli user me`
- `mixin-cli user search <IDENTITY_OR_UUID>`
- `mixin-cli user create <NAME> --pin <PIN>`
- `mixin-cli http ...`
- `mixin-cli sign <PATH> --exp <DURATION>`
- `mixin-cli upload <FILE_PATH>`

## Deprecation Note

Legacy transaction command:

```bash
mixin-cli transfer ...
```

Status:

- Deprecated for new implementations.
- Keep only for backward-compatible legacy tooling.
- Prefer `mixin-cli safe transfer ...` for all new transaction paths.

## Troubleshooting

## Unknown `safe` command

Cause: old binary.

Fix:

```bash
go install github.com/fox-one/mixin-cli/v2@latest
mixin-cli safe --help
```

## Insufficient balance / fragmented outputs

Symptom: safe transfer cannot cover requested amount.

Fix:

- check balance with `safe assets`
- retry with smaller amount
- merge outputs operationally when needed

## Invalid receiver threshold

Symptom: threshold validation error.

Fix:

- ensure `1 <= threshold <= len(receivers)`

## Repeated submission and idempotency issues

Fix:

- always pass explicit `--trace <UUID>`
- reuse same trace for retrying same intended payment

## Security and Operational Rules

- Never commit keystores, spend keys, PIN values, or signed raw transactions.
- Use `--stdin` or runtime secret injection in CI/CD.
- Separate credentials by environment (dev/staging/prod).
- Start with small-value test transactions before large-value operations.
- Redact sensitive command output in logs and tickets.
- Rotate secrets immediately after suspected leakage.

## Safe Quick Cheat Sheet

```bash
# profile check
mixin-cli user me

# safe migration
mixin-cli safe migrate <SPEND_KEY>

# safe balances
mixin-cli safe assets

# safe transfer to user
mixin-cli safe transfer --asset <ASSET> --amount <AMOUNT> --opponent <USER> --trace <TRACE>

# safe transfer to multisig
mixin-cli safe transfer --asset <ASSET> --amount <AMOUNT> --receivers <U1> --receivers <U2> --threshold 2 --trace <TRACE>

# create deposit entry
mixin-cli safe deposit --chain <CHAIN> --receivers <USER> --threshold 1

# list pending deposit
mixin-cli safe pending --entry '<RAW_JSON>'
```

## References

- https://github.com/fox-one/mixin-cli
- https://raw.githubusercontent.com/fox-one/mixin-cli/master/cmd/safe/safe.go
- https://raw.githubusercontent.com/fox-one/mixin-cli/master/cmd/safe/transfer.go
- https://raw.githubusercontent.com/fox-one/mixin-cli/master/cmd/safe/deposit.go
- https://developers.mixin.one/docs/api/safe-apis
- https://developers.mixin.one/docs/api/sequencer/transactions
