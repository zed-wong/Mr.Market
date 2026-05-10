# Plan: 多链 UI 和前端拆分

**日期：** 2026-05-10
**状态：** 草稿

## 背景

当前 `interface/` 是 Mixin only 的单一前端。未来要支持 EVM、SVM 等链，并且后端可能有多个实例独立部署。需要把前端拆开。

## 目标

- 把现有 `interface/` 拆成多个独立的 app
- 新增 web3 前端（EVM、未来 SVM）
- 后端基于现有代码扩展，不重写

## 最终结构

```
mrmarket/
├── mixin-interface/    # 现 interface/，重命名
├── web3-interface/     # 新增，EVM/SVM
├── admin-interface/    # 从 interface/ 拆出
├── web/                # 新增，landing + leaderboard
└── server/             # 现有，扩展支持新 UI
```

用 `bun workspaces` 组织。每个 app 独立部署、独立发版。

## 域名

```
mrmarket.one                       → web/
mixin.mrmarket.one                 → default 实例 mixin
web3.mrmarket.one                  → default 实例 web3
api.mrmarket.one                   → default 实例 server
admin.mrmarket.one                 → default 实例 admin
app.mrmarket.one                   → 302 alias，按环境跳

xxx.instances.mrmarket.one         → 第三方实例（未来）
mixin-xxx.instances.mrmarket.one
web3-xxx.instances.mrmarket.one
api-xxx.instances.mrmarket.one
admin-xxx.instances.mrmarket.one
```

## 后端思路

- Mixin user 和 EVM user 都是 user，server 加 auth identity 抽象
- EVM 资金走 vault 合约，mr.market 后端作为 operator 调用合约把钱调到交易所做市
- 现有 Mixin 流程保持不变

## 拆分顺序

1. 用 bun workspaces 把现有 `interface/` 和 `server/` 装进 monorepo
2. 拆 admin 出来，重命名 `interface/` 为 `mixin-interface/`
3. 起 `web/`（landing + leaderboard）
4. 起 `web3-interface/` + 设计 vault 合约 + server 加 EVM 支持
5. 上线 default 实例（先选一条 EVM 链）
6. 多实例支持（`instances.mrmarket.one` 子域名等）

## 待定

- 第一条 EVM 链选哪个
- Vault 合约具体设计、审计安排
- 多实例注册流程
- Identity linking（同一个人 Mixin + EVM 关联）
