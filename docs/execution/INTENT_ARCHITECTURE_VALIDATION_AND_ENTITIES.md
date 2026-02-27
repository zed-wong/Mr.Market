# Intent Architecture Validation and Entities

This is the living document for intent runtime validation and related entities.

## Scope

- Strategy order intents (`strategy-order-intent.entity.ts`) used by tick-driven market making.
- System durability entities:
  - `outbox-event.entity.ts`
  - `consumer-receipt.entity.ts`
- Orchestration intents emitted by pause/withdraw flow.

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
3. Append durable pending intent before external withdrawal:
   - topic: `withdrawal.orchestrator.pending`
4. Execute external withdrawal.
5. On success, append completion intent:
   - topic: `withdrawal.orchestrator.completed`
6. On failure:
   - append failed intent (`withdrawal.orchestrator.failed`)
   - apply idempotent compensation through ledger adjustment using:
     - `withdraw_debit:${operationId}:rollback`

## Related Tests

- `server/src/modules/market-making/orchestration/pause-withdraw-orchestrator.service.spec.ts`
  - validates pending and completion intents on success
  - validates failed intent + rollback compensation on external transfer failure

## Update Rule

When intent flow, entity contracts, or runtime safety steps change, update this file in the same change set.
