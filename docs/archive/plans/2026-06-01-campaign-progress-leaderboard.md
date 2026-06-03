# Campaign 进度 + 实时 Leaderboard

## 背景与约束
- RO API: `https://ro.hu.finance`，认证需要 EVM private key（Web3 签名）
- `CampaignService` 已有完整 RO 认证逻辑（nonce → sign → token，5min 缓存）
- `CampaignModule` 已被 `AdminModule` 导入，`CampaignService` 已导出，可直接注入

---

## 后端改动

### 1. `server/src/modules/campaign/campaign.service.ts` — 新增两个方法

```ts
async getCampaignProgress(chainId: number, campaignAddress: string): Promise<Record<string, unknown>>
async getCampaignLeaderboard(chainId: number, campaignAddress: string): Promise<Record<string, unknown>>
```

内部复用已有的 `getAccessToken()` + `hufiRecordingOracleAPI`，分别调用：
- `GET /campaigns/{chainId}-{campaignAddress}/my-progress`
- `GET /campaigns/{chainId}-{campaignAddress}/leaderboard`

### 2. `server/src/modules/admin/market-making/admin-direct-mm.controller.ts` — 新增两个端点

```
GET /admin/market-making/campaigns/:chainId/:address/progress
GET /admin/market-making/campaigns/:chainId/:address/leaderboard
```

注入 `CampaignService`，直接调用上面的方法并返回。

---

## 前端改动

### 3. `admin-interface/src/lib/types/hufi/admin-direct-market-making.ts` — 新增类型

```ts
export interface CampaignProgress {
  score: number;
  result: number;
  estimated_reward: number;
  [key: string]: unknown;
}

export interface LeaderboardEntry {
  address: string;
  score: number;
  result: number;
  estimated_reward: number;
}

export interface CampaignLeaderboard {
  data: LeaderboardEntry[];
  total: number;
  updated_at: string;
}
```

### 4. `admin-interface/src/lib/helpers/mrm/admin/direct-market-making.ts` — 新增 helper

```ts
getCampaignProgress(chainId: number, address: string, token: string): Promise<CampaignProgress>
getCampaignLeaderboard(chainId: number, address: string, token: string): Promise<CampaignLeaderboard>
```

### 5. 新建 `admin-interface/src/lib/components/market-making/direct/CampaignDetailsModal.svelte`

点击 campaign 卡片的「详情」按钮打开，包含：
- **进度区块**：score、result、estimated_reward（带进度条）
- **Leaderboard 表格**：排名 / 钱包地址（截断）/ score / estimated_reward，当前 server 地址高亮
- 自动 30s 轮询，显示 `updated_at` 时间戳
- 复用 daisyUI modal 风格（与 `OrderDetailsDialog.svelte` 一致）

### 6. `admin-interface/src/lib/components/market-making/direct/CampaignsPanel.svelte`

在已加入 campaign 卡片上新增「查看详情」按钮，暴露 `onViewDetails: (campaign: AdminCampaign) => void` prop。

### 7. `admin-interface/src/routes/trading/direct-market-making/+page.svelte`

管理 `selectedCampaignForDetails` 状态，渲染 `<CampaignDetailsModal>`。

---

## 文件变更汇总

| 文件 | 操作 |
|------|------|
| `server/src/modules/campaign/campaign.service.ts` | 新增 2 个方法 |
| `server/src/modules/admin/market-making/admin-direct-mm.controller.ts` | 新增 2 个端点，注入 CampaignService |
| `admin-interface/src/lib/types/hufi/admin-direct-market-making.ts` | 新增 3 个类型 |
| `admin-interface/src/lib/helpers/mrm/admin/direct-market-making.ts` | 新增 2 个 helper |
| `admin-interface/src/lib/components/market-making/direct/CampaignDetailsModal.svelte` | 新建 |
| `admin-interface/src/lib/components/market-making/direct/CampaignsPanel.svelte` | 新增详情按钮 |
| `admin-interface/src/routes/trading/direct-market-making/+page.svelte` | 集成弹窗 |
