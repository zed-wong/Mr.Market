# Intent Architecture Validation and Entities

This is the living document for intent runtime validation and related entities.

## Scope

- Strategy order intents (`strategy-order-intent.entity.ts`) used by tick-driven market making.
- System durability entities:
  - `outbox-event.entity.ts`
  - `consumer-receipt.entity.ts`
- Orchestration intents emitted by pause/withdraw flow.

## Strategy Runtime File Layout (Current)

Strategy runtime files are organized by execution stage under `server/src/modules/market-making/strategy`:

- `config/` for strategy DTOs and shared strategy intent/controller/execution types.
- `controllers/` for strategy-specific decision logic.
- `intent/` for action orchestration and quote-to-intent mapping.
- `execution/` for intent worker/store/executor/dispatcher runtime path.
- `data/` for market data provider used by runtime controllers/services.
- `dex/` for DEX-specific strategy services and module wiring.

Important intent execution files live at:

- `server/src/modules/market-making/strategy/execution/strategy-intent-worker.service.ts`
- `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts`

## Runtime Validation Rules

- Every external side effect must have durable intent evidence.
- Ledger mutations must remain idempotent by operation-scoped idempotency keys.
- Failure paths must record durable failed intent and apply deterministic compensation.
- Completion intents are emitted only after successful external execution.

## Pause/Withdraw Orchestrator Validation

File: `server/src/modules/market-making/orchestration/pause-withdraw-orchestrator.service.ts`

Current enforced behavior:

1. Stop strategy and drain open exchange orders.
2. Unlock and debit ledger with idempotency keys:
   - `unlock:${operationId}`
   - `withdraw_debit:${operationId}`
3. Append durable pending intent before external withdrawal (inside protected flow):
   - topic: `withdrawal.orchestrator.pending`
4. Execute external withdrawal.
5. On success, append completion intent:
   - topic: `withdrawal.orchestrator.completed`
6. On failure (including pending-intent append failure):
   - append failed intent (`withdrawal.orchestrator.failed`)
   - apply idempotent compensation through ledger adjustment using:
      - `withdraw_debit:${operationId}:rollback`

## Additional Idempotency Guards

- Pause/withdraw external execution now passes deterministic withdrawal request key:
  - `withdraw_execute:${operationId}`
- Share ledger entries enforce unique business key:
  - `(userId, type, refId)`
- `CANCEL_ORDER` intents without `mixinOrderId` are marked failed and never transitioned to `DONE`.

## Related Tests

- `server/src/modules/market-making/orchestration/pause-withdraw-orchestrator.service.spec.ts`
  - validates pending and completion intents on success
  - validates failed intent + rollback compensation on external transfer failure

## Update Rule

When intent flow, entity contracts, or runtime safety steps change, update this file in the same change set.
