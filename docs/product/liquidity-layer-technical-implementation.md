# Liquidity Layer System Design Constraints

This document defines the system constraints required for Mr.Market to evolve from a market-making runtime into a liquidity infrastructure layer.

It is not the product thesis document. That role belongs to `docs/product/liquidity-layer-of-financial-markets.md`.

It is also not the detailed backend flow document. That role belongs to `docs/architecture/market-making-flow.md` and the server architecture tree under `docs/architecture/server/`.

The purpose of this file is narrower:

- define what must be true for the "liquidity layer" claim to be structurally credible,
- map those requirements onto the current system shape,
- state what is still missing.

## 1. Problem framing

The product thesis argues that liquidity should become a protocol-level capability rather than a privileged resource.

That thesis is only meaningful if the system does more than automate a centralized operator workflow.

A system does not become a liquidity layer just because it:

- runs strategies automatically,
- places orders through APIs,
- distributes rewards,
- removes some manual operations.

It becomes a liquidity layer only if liquidity access is governed by open mechanism constraints rather than by discretionary operator control.

## 2. Scope boundary

This document evaluates the system against one question:

What would have to be true for Mr.Market to qualify as infrastructure for permissionless liquidity formation?

It does not claim that the current implementation already meets that standard.

## 3. Layer model

The intended system can be described in three layers.

### Layer A. Rule Layer

This layer defines:

- how campaigns are created,
- how funds are escrowed,
- how rewards are computed,
- what parameters are mutable,
- which actions are allowed.

Target property:

- rules are explicit, bounded, and difficult to override ad hoc.

Current Mr.Market status:

- partially represented in backend services and persisted order snapshots,
- not yet reduced to a trust-minimized, protocol-like rule layer.

### Layer B. Execution Layer

This layer performs:

- quote generation,
- order placement and cancellation,
- fill handling,
- risk checks,
- reward-eligible activity production.

Target property:

- execution should not depend on a single privileged operator path.

Current Mr.Market status:

- this is the strongest existing part of the system,
- the runtime already has a concrete execution architecture with tick coordination, pooled executors, intent execution, and ledger boundaries,
- see `docs/architecture/market-making-flow.md` for the current source of truth.

### Layer C. Access Layer

This layer determines:

- who can launch liquidity programs,
- who can run execution nodes,
- who can participate in incentives,
- whether access requires approval.

Target property:

- access should be rule-gated, not relationship-gated.

Current Mr.Market status:

- not yet permissionless in a strong infrastructure sense,
- still primarily an application runtime with platform-controlled boundaries.

## 4. Non-negotiable design constraints

If these constraints are not satisfied, the system may still be useful software, but it should not be described as a liquidity layer.

### Constraint 1. No discretionary liquidity gatekeeper

A token or campaign should not require off-chain approval from a central operator in order to access the mechanism.

Acceptable:

- eligibility rules,
- objective parameter checks,
- bounded deny conditions.

Not acceptable:

- manual relationship-based admission,
- hidden exceptions,
- private approval pipelines.

### Constraint 2. Rules must dominate operator behavior

The core lifecycle must be driven by explicit rules rather than by informal intervention.

This means the system must make clear:

- which parameters are fixed,
- which parameters can change,
- who can change them,
- what audit trail exists for each change.

If operators can quietly alter liquidity behavior at will, then the mechanism is not structurally independent.

### Constraint 3. Reward logic must be resistant to extraction

Any incentive system will be attacked by:

- wash trading,
- fake depth,
- toxic flow farming,
- quote spam,
- self-reward loops.

A valid liquidity layer cannot treat rewards as a simple subsidy schedule.

Reward logic must be designed around verifiable contribution quality, not just notional activity volume.

### Constraint 4. Capital ownership and trading risk must be separated clearly

The system must make unambiguous distinctions between:

- campaign treasury funds,
- operator or node capital,
- user-owned funds,
- realized trading PnL,
- reward distribution balances.

If ownership and loss attribution are blurry, then the system will fail under both operational stress and external scrutiny.

### Constraint 5. Execution failure must not collapse the whole system

If one node, service, or operator disappears, the mechanism should degrade gracefully instead of halting globally.

This does not require perfect decentralization on day one.

It does require that the architecture move away from irreplaceable control points.

### Constraint 6. Claims must match actual system shape

The documentation and product language must not claim:

- trust minimization where trusted operators still dominate,
- decentralization where execution is still platform-bound,
- protocol-level behavior where the mechanism is still application-level.

This is partly a legal discipline issue, but it is mainly an engineering discipline issue.

Overstating system properties destroys architectural clarity.

## 5. Qualifying and non-qualifying architectures

### Qualifies as progress toward a liquidity layer

- a runtime where admission and reward rules are explicit and consistently enforced,
- execution that can be operated by multiple independent actors,
- bounded governance with visible parameter control,
- fund flows separated by ledgered ownership and durable state transitions,
- mechanism outputs that remain inspectable after the fact.

### Does not qualify

- a managed market-making desk with better automation,
- a campaign system whose real rules live in operator discretion,
- a rewards engine dominated by volume mining or fake-depth games,
- a node network that is nominally open but operationally dependent on one scheduler or one privileged deployer,
- a product narrative that markets decentralization without removing concrete control points.

## 6. Mapping to the current Mr.Market architecture

The current backend already contains useful primitives for this direction:

- strategy snapshots reduce runtime ambiguity,
- pooled executors reduce duplicated exchange-pair control paths,
- intent execution creates bounded side-effect stages,
- ledger boundaries create a single balance mutation entrypoint,
- durable workers and reconciliation flows improve auditability.

These are important because they move the system away from ad hoc bot operation and toward explicit runtime structure.

But they do not yet make Mr.Market a permissionless liquidity layer.

The main gaps are still structural:

- campaign and reward rules are not yet framed as an open mechanism layer,
- execution is not yet a credibly multi-operator network,
- reward-abuse resistance is not yet specified tightly enough,
- governance boundaries are not yet described as enforceable system constraints,
- access is not yet rule-open in the strong sense implied by the product thesis.

## 7. What this means for product language

The most defensible present-tense description is:

Mr.Market is a market-making runtime and mechanism foundation that may evolve toward a liquidity infrastructure layer.

The least defensible present-tense description is:

Mr.Market is already a decentralized liquidity layer.

The first description matches the current architecture trajectory.
The second collapses the distinction between aspiration and implementation.

## 8. Next documentation split

To keep the docs tree clean, each document should keep a single job:

- `docs/product/liquidity-layer-of-financial-markets.md`
  product thesis and why the problem matters
- `docs/product/liquidity-layer-technical-implementation.md`
  system design constraints for making the thesis structurally credible
- `docs/architecture/market-making-flow.md`
  current backend market-making runtime flow
- `docs/architecture/server/*.md`
  current backend ownership, module, and runtime details

## 9. Bottom line

The real distinction is simple:

- market-making software helps operate liquidity,
- a liquidity layer changes who can access liquidity formation and under what rules.

Mr.Market currently has meaningful runtime architecture.
What it still needs is stronger mechanism-level constraint design before the "liquidity layer" claim becomes unique and defensible.
