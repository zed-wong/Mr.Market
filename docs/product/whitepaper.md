# Mr.Market Whitepaper

## Abstract

Mr.Market is a rule-driven liquidity infrastructure layer. Liquidity access today depends on private negotiation and relationship networks; HuFi turns liquidity supply into a programmable, auditable, and comparable infrastructure capability.

This paper explains the thesis, user model, product design, and evolution path of Mr.Market.

## 1. Problem

The way tokens and project teams obtain effective liquidity depends heavily on relationships and negotiation:

- Market makers provide liquidity through private agreements, and the process is opaque;
- The quality of liquidity supply cannot be measured and compared in a standardized way;
- Project teams cannot independently choose liquidity targets and must accept black-box plans;
- Detecting wash volume and fake depth depends on manual judgment and lacks a systematic method.

Core problem: **liquidity access should move from a relationship-dependent service to a rule-driven infrastructure capability.**

## 2. Thesis

**Mr.Market is a market-making runtime and campaign execution foundation for gradually building a rule-driven liquidity layer.**

Long-term formulation:

**Mr.Market can become a liquidity infrastructure layer where campaigns, execution, rewards, and quality measurement are governed by explicit mechanisms instead of private negotiation.**

This means:

- Campaign creation is driven by explicit liquidity targets;
- Execution is performed by configurable strategies;
- Rewards are distributed by auditable rules;
- Quality is measured by reproducible metrics.

## 3. Users

### 3.1 Liquidity Demand Side

Token or project founders who want effective liquidity for an asset. They care about visible liquidity depth and market credibility.

In the first phase, the liquidity demander and the capital provider are usually the same person: the founder creates a campaign, injects capital, and expects Mr.Market to run strategies that improve liquidity.

### 3.2 Operators and Strategy Builders

Professional participants who configure infrastructure, publish strategies, monitor failures, run Mr.Market instances, and earn rewards from the service.

## 4. Product Model

### 4.1 Why Version One Is Not a Black-Box Profit Bot

The following promise implies portfolio optimization, exchange selection, risk scoring, drawdown control, and loss responsibility:

> Deposit funds, and the bot will do its best to maximize profit.

That is not what version one should do.

A better first-version promise:

> Create or fund a campaign, choose a liquidity target, and let Mr.Market guide the execution setup.

### 4.2 Product Abstraction: Tailscale Relative to WireGuard

The relationship between Hummingbot and Mr.Market can be compared to the relationship between WireGuard and Tailscale.

WireGuard is a powerful low-level technology. It is open source, reliable, and flexible; people who understand networking can use it directly to build private networks. But its problem is also obvious: keys, peers, endpoints, routing, ACLs, and firewalls all create a high barrier for ordinary users. WireGuard solves the low-level connectivity capability, but it does not directly solve the product problem of how an ordinary team can safely, quickly, and continuously manage its own network.

Tailscale's value is not merely giving WireGuard a simpler interface. It re-abstracts the user task: users no longer need to understand most WireGuard configuration details, but instead log in, join a network, and manage devices and permissions. The underlying technology is still WireGuard, but users experience a manageable, collaborative, and observable network product.

Hummingbot is similar. It is a powerful trading bot framework suitable for people who understand strategies, exchanges, parameters, and risk. Professional users can directly configure spread, order size, refresh interval, inventory skew, connector, and strategy script, then keep tuning through logs and the command line. But for most project teams, capital providers, and operators, their real concerns are not these low-level parameters, but more direct goals:

- How to launch a new market;
- How to improve liquidity for an existing trading pair;
- How to control market-making budget and inventory risk;
- How to run a volume campaign;
- How to know whether the market is becoming healthier;
- How to pause, diagnose, and attribute responsibility when anomalies occur.

Mr.Market is not meant to be a simplified interface for Hummingbot, but a productization of market-making capability. Users should express goals, budgets, and risk boundaries, and the system should translate them into strategy configuration, order execution, fund reservation, fill attribution, ledger records, risk control, and monitoring.

Therefore, the Mr.Market user interface should not start with "choose a strategy and fill in parameters." It should start with "choose a goal, set constraints, preview behavior, start managed execution, and continuously monitor results." The underlying system still preserves professional capability and auditability, but the system should absorb complexity instead of passing it on to users.

This is also the difference between Mr.Market and ordinary trading bot tools:

```text
Hummingbot exposes trading-bot primitives.
Mr.Market exposes liquidity workflows.
```

Or:

```text
Hummingbot is a professional trading bot engine.
Mr.Market is a liquidity workflow product for project teams, capital users, and operators.
```

This positioning requires Mr.Market to follow several product principles:

- Users choose goals, not low-level strategies;
- Users set budgets and risk boundaries, not every trading parameter directly;
- The system automatically selects or generates suitable execution strategies;
- Before each launch, the system must explain how funds will be used, how orders will be placed, and under what conditions execution will pause;
- During operation, the system must continuously show market health, fund usage, inventory risk, fills, fees, returns, and anomaly reasons;
- Advanced parameters and manual takeover capabilities still exist, but should live in operator or admin interfaces, not the default entry point for ordinary users.

In short, Mr.Market's goal is not to teach more people how to configure trading bots. It is to let them safely, clearly, and auditably manage liquidity without first becoming trading bot experts.

### 4.3 First-Version Product Model

Based on the product abstraction above, the first version keeps two entry points:

- **Guided mode**: for founders and liquidity demanders. Users choose liquidity targets, budgets, and risk boundaries, and the system translates them into strategies, exchanges, trading pairs, capital splits, and risk-control settings.
- **Advanced mode**: for operators and strategy builders. Users can directly configure exchanges, trading pairs, strategy parameters, and campaign associations for debugging, operations, and special cases.

Autonomous profit mode is a future research direction and is outside the first version.

## 5. Campaign Model

A campaign is the core organizational unit of liquidity supply.

- A campaign binds liquidity targets, execution strategies, and capital together;
- A campaign binds identity and score through the HuFi recording oracle;
- Fills generated by a campaign can be attributed to specific user orders;
- Campaign rewards are distributed among participants according to attribution scores.

In the first version, founders self-fund campaigns. Future versions may allow external capital providers to participate.

## 6. Reward Distribution

HuFi reward distribution has two layers:

1. **Outer layer**: the HuFi recording oracle determines how much reward Mr.Market receives as a whole from a campaign;
2. **Inner layer**: Mr.Market distributes rewards to user orders according to internal attribution scores.

The platform may charge a service fee from campaign rewards. The fee rate is configured per campaign and only affects future unsettled reward days.

Distribution principle: the sum of all user rewards plus platform fees must not exceed the total reward pool for the day.

## 7. Roadmap

| Phase | Name | Goal |
|------|------|------|
| 1 | Self-funded campaign runtime | Founders can fund campaigns and safely run liquidity |
| 2 | Guided campaign creation | Founders can choose liquidity targets without understanding every strategy parameter |
| 3 | Instance accounting | Each campaign-supported instance has a persistent economic record |
| 4 | Measurement research | Test whether HuFi can credibly rank instances |
| 5 | HuFi 100 research release | Publish as a methodology first, then productize as an index |
| 6 | Stablecoin research | Determine whether a HuFi stablecoin solves a real settlement problem |

## 8. HuFi 100 Vision

HuFi 100 is an index of the strongest HuFi instances, similar to an S&P 500 for "campaign-supported on-chain economic entities."

Core measurement challenge: leaderboards can be manipulated, while an index needs a defensible methodology. Candidate measurement dimensions include liquidity quality, volume quality, capital efficiency, reward efficiency, survivability, risk, trust and auditability, and abuse resistance.

Admission thresholds should be conservative: instances must satisfy minimum runtime, capital records, strategy log completeness, liquidity baseline, abuse score threshold, and accounting gap resolution requirements.

HuFi 100 should not drive near-term implementation. The near term should build the foundation that makes HuFi 100 possible in the future.

## 9. HuFi Stablecoin

The HuFi stablecoin is a research agenda, not part of the current implementation scope. A stablecoin is justified only if campaign behavior creates real and repeated settlement demand for it.

**HuFi 100 is the reputation and measurement layer. The stablecoin sits after campaign behavior and measurement, not at the foundation of the system.**

Near-term stablecoin work is limited to research: what are the settlement frictions? Does a stable unit help users understand rewards? Is the reserve model realistic? Does a stablecoin improve liquidity formation, or does it only add complexity?
