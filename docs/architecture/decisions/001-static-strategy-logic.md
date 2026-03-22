# ADR-001: Static Strategy Logic, Not User-Configurable

## Status

Accepted

## Context

Mr.Market is a managed liquidity execution system where:

- **Campaign creators** provide capital and define market-making campaigns
- **Users** join campaigns and provide their funds for market-making execution
- **Mr.Market nodes** execute market-making on behalf of users

This is fundamentally different from self-hosted strategy tools such as Hummingbot:

| Aspect | Self-hosted strategy tool | Mr.Market |
|--------|------------|-----------|
| Who operates runtime | User | Mr.Market-managed runtime |
| Who bears execution risk directly | User | User delegates to system |
| Who can change executable logic | User | Platform release process only |
| Trust model | Trust yourself | Trust bounded platform behavior |

Because users delegate execution to the system, strategy flexibility must be constrained by safety, auditability, and trust-minimization requirements.

## Decision

Executable strategy logic is static and platform-controlled.

Users may:
- Choose from supported strategy types
- Configure allowed parameters within predefined bounds
- Override selected default values where permitted by schema and validation

Admins may:
- Create and manage strategy definitions
- Modify `configSchema` and `defaultConfig`
- Bind definitions only to pre-approved built-in executor types

Neither users nor admins may:
- Upload or execute arbitrary strategy code
- Define new executable strategy runtimes from the database or UI
- Inject scripts, WASM modules, or dynamically loaded code into the managed runtime

Supported strategy types:
- `pureMarketMaking` - Pure market making
- `arbitrage` - Cross-exchange arbitrage
- `volume` - Volume generation
- `timeIndicator` - Technical indicator trading

Strategy definitions in `server/src/database/seeder/data/strategies/` are configuration templates only. They define config shape and defaults. They do not contain executable logic.

Executable logic is implemented in reviewed server runtime code and selected through fixed executor/controller bindings.

## Rationale

### 1. User Asset Protection

If strategy logic were user-configurable, users would face risks from:

**Their own mistakes:**
- Logic errors: sell price lower than buy price → instant loss
- Infinite loops: repeated trades consuming all funds via fees
- Extreme parameters: single trade using 100% of capital
- Missing circuit breakers: continuing to buy during flash crash

**Admin malicious behavior:**
- Admin could create strategies that intentionally lose user funds
- Strategies could be designed to profit admin at user expense
- Hidden logic could extract value from user positions
- Parameters could be manipulated to favor certain outcomes

With fixed strategies:
- All logic is open-source and auditable
- Parameter boundaries prevent extreme configurations
- Users can inspect the bounded strategy logic and configuration surface
- No hidden logic can be injected after deployment

### 2. Trust Minimization

```
User funds → Fixed, auditable logic → Predictable execution
User funds → Custom logic → Unpredictable outcomes
```

Fixed strategies create a verifiable contract between users and the system:
- Users know exactly what they're signing up for
- Execution is deterministic and auditable
- No surprises from "strategy updates"
- Admin cannot arbitrarily change behavior

### 3. Verifiability and Auditability

Static strategy logic is easier to:
- Fixed strategies can be verified: "This code does X"
- Review before release
- Test under known conditions
- Monitor in production
- Explain during incidents
- Compare against intended behavior during disputes

It also supports future proof and audit workflows better than custom strategies:
- Reward distribution requires auditable behavior
- Disputes can be resolved by comparing execution to known logic

Custom executable logic inside the managed runtime would significantly weaken these properties.

### 4. Product Scope

Mr.Market is not a general-purpose strategy authoring platform.

Its role is to provide managed liquidity execution with bounded behavior, not to let users or admins program arbitrary trading systems inside protocol-operated infrastructure.

### 5. Legal and Regulatory Posture

As a secondary consideration, static strategy logic may reduce regulatory attribution risk by reducing discretionary human intervention in live execution.

This ADR does not make a legal determination. It records an architecture choice that supports a lower-discretion operational model.

## Allowed

The following are allowed within this decision:

- Parameterized strategy definitions
- JSON-schema-based config validation
- Default config templates
- Admin-managed strategy catalogs
- Versioned configuration snapshots
- Additional built-in strategy executors added through code review and deployment

## Not Allowed

The following are explicitly out of scope:

- User-uploaded scripts
- Admin-uploaded scripts
- Runtime code loading from database records
- Strategy marketplaces that inject executable logic into the managed runtime
- Visual builders that compile to arbitrary executable runtime logic
- Third-party plugin execution inside the managed runtime without the same review and release controls as core code

## Alternatives Considered

| Option | Description | Rejection Reason |
|--------|-------------|------------------|
| Embedded script engine | Run user/admin scripts in QuickJS/VM-style sandbox | Too much hidden behavior, weak auditability, unsafe trust model |
| Visual strategy builder | Node-based or rule-builder UI | Still increases discretionary logic surface; difficult to audit safely |
| Strategy marketplace | Shared or paid strategies | Introduces predatory strategy risk and opaque execution behavior |
| Admin-uploadable executors | Admin defines executable runtime modules | Unsafe for delegated-user-funds model |
| Open-source modification | Users fork and customize | Viable for self-hosted, doesn't affect protocol |

## Consequences

### Positive

- Lower risk of hidden or malicious execution behavior
- Stronger auditability and release discipline
- Clearer trust boundary for users
- Safer managed-runtime model
- Better alignment with bounded-strategy product scope

### Negative

- Limited strategy types; protocol upgrades required for new ones
- Reduced flexibility compared with self-hosted tools
- Some niche use cases will not be supported

### Mitigation

- 4 strategies cover mainstream market-making needs
- New strategies require code changes, review, and deployment
- Parameter design provides flexibility within safe boundaries
- Users who want full control can self-host and modify

## Implementation Notes

This decision should be reflected in implementation by ensuring:

- Strategy definitions store configuration metadata, not executable code
- Runtime selects from fixed built-in executor types
- Order snapshots pin resolved config, not dynamic code
- Validation and parameter bounds are enforced before execution
- Any future strategy builder must remain within bounded, non-programmable execution semantics unless this ADR is superseded

## Related Documents

- [Becoming the Liquidity Layer](../../product/liquidity-layer-of-financial-markets.md)
- [Liquidity Layer Technical Implementation](../../product/liquidity-layer-technical-implementation.md)
- [Self-Market-Making Stablecoin](../../product/self-market-making-stablecoin.md)

## History

- 2026-03-13: Reframe the decision around user asset protection, bounded execution, and managed-runtime trust constraints
