# Funding Layer and Execution Layer Plan

Status: Future TODO

## 1. Problem

The current codebase couples "how funds enter the system" with "how market making runs."

The main flow today is effectively:

```text
Mixin deposit -> withdraw to exchange -> start market making
```

This creates two problems:

- The system is naturally shaped around `Mixin` as the primary funding path, and does not cleanly support cases where funds are already on an exchange or come from an `EVM wallet`.
- Every new funding source risks bringing its own version of the market-making startup flow, which makes the architecture harder to extend and maintain.

At a structural level, the system is missing a dedicated funding layer that can normalize different funding sources before market making begins.

## 2. Proposal

Split the existing codebase into two layers:

- **Funding Layer**: only responsible for whether funds are ready, where they come from, whether they pass risk checks, and whether they can enter an order
- **Execution Layer**: only responsible for order start, market-making runtime, stop, cancel, reconciliation, and observability

`mixin`, `manual funding`, and `evm wallet` should all be treated as `funding sources` connected to the `Funding Layer`.

Their responsibility is not to carry their own market-making flow, but to push an order into one shared `ready_to_start` state.

The key constraint is:

**What gets unified is the funding readiness output, not the funding input process itself.**

That means the model should be:

```text
different funding sources
  -> funding layer
  -> funding ready
  -> execution layer
```

With this structure, each funding source only needs to handle its own preparation logic, while the market-making execution flow remains shared and consistent.

This plan is a future architecture direction, not part of the current implementation scope.
