# Admin Direct Editable Volume Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin direct efficient dual-account volume orders set a stop volume at start, and edit amount / refresh time / volume target after stopping before resume.

**Architecture:** Keep runtime config source of truth in `MarketMakingOrder.strategySnapshot.resolvedConfig`. Do not hot-update running strategies. Admin updates saved config only while the order is stopped/paused/failed, then existing `directResume()` restarts from the updated snapshot.

**Tech Stack:** NestJS, TypeORM, class-validator, bignumber.js, Jest, Svelte admin UI.

---

## Key Decisions

- Running orders are not editable.
- Editable fields are only:
  - `maxOrderAmount` — per-cycle amount cap.
  - `interval` — refresh/cycle time in seconds.
  - `targetQuoteVolume` — total quote volume where the strategy stops.
- `targetQuoteVolume` is a total lifetime target, not “additional volume after resume”.
- If already traded volume is greater than the new target, resume should stop on the next tick.
- No new database column is required.

## File Map

- Modify `server/src/modules/admin/market-making/admin-direct-mm.dto.ts`
  - Add DTOs for start target and config update.
- Modify `server/src/modules/admin/market-making/admin-direct-mm.controller.ts`
  - Add `PATCH /admin/market-making/direct-orders/:orderId/config`.
- Modify `server/src/modules/admin/market-making/admin-direct-mm.service.ts`
  - Apply explicit start `targetQuoteVolume`.
  - Add stopped-order config update method.
  - Return edited config/progress in list/status if not already present.
- Modify `server/src/modules/admin/market-making/admin-direct-mm.service.spec.ts`
  - Cover start target, stopped-only config update, and resume using updated config.
- Modify admin direct market-making Svelte page/helper files after locating current admin route.
  - Add “edit config” UI only for stopped/paused/failed orders.

---

### Task 1: Add backend DTOs

**Files:**
- Modify: `server/src/modules/admin/market-making/admin-direct-mm.dto.ts`

- [ ] **Step 1: Add imports**

Add validator imports:

```ts
import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
```

- [ ] **Step 2: Add optional start target**

Inside `DirectStartMarketMakingDto` add:

```ts
  @ApiPropertyOptional({
    description:
      'Optional quote-volume target where efficient dual-account volume strategy stops',
    example: 10000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  targetQuoteVolume?: number;
```

- [ ] **Step 3: Add update DTO**

Add after `DirectResumeMarketMakingDto`:

```ts
export class DirectUpdateMarketMakingConfigDto {
  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxOrderAmount?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  interval?: number;

  @ApiPropertyOptional({ example: 10000 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  targetQuoteVolume?: number;
}
```

---

### Task 2: Add service config update behavior

**Files:**
- Modify: `server/src/modules/admin/market-making/admin-direct-mm.service.ts`
- Test: `server/src/modules/admin/market-making/admin-direct-mm.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Add tests covering:

```ts
it('stores explicit targetQuoteVolume for efficient direct-start orders', async () => {
  await service.directStart({
    ...dualAccountStartDto,
    targetQuoteVolume: 10000,
  });

  const created = mockMarketMakingRepository.create.mock.calls[0][0];
  expect(created.strategySnapshot.resolvedConfig.dailyVolumeTarget).toBe(10000);
  expect(created.strategySnapshot.resolvedConfig.targetQuoteVolume).toBe(10000);
});

it('updates direct order config only while stopped', async () => {
  mockMarketMakingRepository.findOne.mockResolvedValue({
    ...existingDirectOrder,
    state: 'stopped',
    strategySnapshot: {
      ...existingDirectOrder.strategySnapshot,
      resolvedConfig: {
        ...existingDirectOrder.strategySnapshot.resolvedConfig,
        maxOrderAmount: 10,
        baseTradeAmount: 10,
        interval: 30,
        baseIntervalTime: 30,
        targetQuoteVolume: 1000,
        dailyVolumeTarget: 1000,
      },
    },
  });

  await service.updateDirectOrderConfig('order-1', {
    maxOrderAmount: 25,
    interval: 15,
    targetQuoteVolume: 5000,
  });

  expect(mockMarketMakingRepository.save).toHaveBeenCalledWith(
    expect.objectContaining({
      strategySnapshot: expect.objectContaining({
        resolvedConfig: expect.objectContaining({
          maxOrderAmount: 25,
          baseTradeAmount: 25,
          interval: 15,
          baseIntervalTime: 15,
          dailyVolumeTarget: 5000,
          targetQuoteVolume: 5000,
        }),
      }),
    }),
  );
});

it('rejects config updates for running direct orders', async () => {
  mockMarketMakingRepository.findOne.mockResolvedValue({
    ...existingDirectOrder,
    state: 'running',
  });

  await expect(
    service.updateDirectOrderConfig('order-1', { maxOrderAmount: 25 }),
  ).rejects.toThrow('Only paused, stopped, or failed orders can be edited');
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd server && bun run test -- admin-direct-mm.service.spec.ts --runInBand
```

Expected: FAIL because `targetQuoteVolume` and `updateDirectOrderConfig` are not implemented.

- [ ] **Step 3: Apply explicit start target**

In `directStart()`, before `normalizeEfficientDirectConfig()` is applied, add:

```ts
    if (dto.targetQuoteVolume !== undefined) {
      if (controllerType !== EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE) {
        throw new BadRequestException(
          'targetQuoteVolume is only supported for efficient dual-account volume',
        );
      }

      resolvedConfig.resolvedConfig.dailyVolumeTarget = dto.targetQuoteVolume;
      resolvedConfig.resolvedConfig.targetQuoteVolume = dto.targetQuoteVolume;
    }
```

- [ ] **Step 4: Add update method**

Add to `AdminDirectMarketMakingService`:

```ts
  async updateDirectOrderConfig(
    orderId: string,
    dto: DirectUpdateMarketMakingConfigDto,
  ): Promise<{ orderId: string; config: Record<string, unknown> }> {
    const order = await this.marketMakingRepository.findOne({
      where: { orderId, source: 'admin_direct' },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (
      order.state !== 'stopped' &&
      order.state !== 'paused' &&
      order.state !== 'failed'
    ) {
      throw new BadRequestException(
        'Only paused, stopped, or failed orders can be edited',
      );
    }

    if (this.readControllerType(order) !== EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE) {
      throw new BadRequestException(
        'Config editing is only supported for efficient dual-account volume',
      );
    }

    const snapshot = order.strategySnapshot || { resolvedConfig: {} };
    const resolvedConfig = snapshot.resolvedConfig || {};

    if (dto.maxOrderAmount !== undefined) {
      resolvedConfig.maxOrderAmount = dto.maxOrderAmount;
      resolvedConfig.baseTradeAmount = dto.maxOrderAmount;
    }

    if (dto.interval !== undefined) {
      resolvedConfig.interval = dto.interval;
      resolvedConfig.baseIntervalTime = dto.interval;
    }

    if (dto.targetQuoteVolume !== undefined) {
      resolvedConfig.dailyVolumeTarget = dto.targetQuoteVolume;
      resolvedConfig.targetQuoteVolume = dto.targetQuoteVolume;
    }

    Object.assign(resolvedConfig, this.normalizeEfficientDirectConfig(resolvedConfig));
    order.strategySnapshot = { ...snapshot, resolvedConfig };

    await this.marketMakingRepository.save(order);

    return { orderId, config: resolvedConfig };
  }
```

Import `DirectUpdateMarketMakingConfigDto` from `admin-direct-mm.dto.ts`.

- [ ] **Step 5: Run tests and verify pass**

Run:

```bash
cd server && bun run test -- admin-direct-mm.service.spec.ts --runInBand
```

Expected: PASS.

---

### Task 3: Add controller endpoint

**Files:**
- Modify: `server/src/modules/admin/market-making/admin-direct-mm.controller.ts`
- Test: `server/src/modules/admin/market-making/admin-direct-mm.controller.spec.ts`

- [ ] **Step 1: Write failing controller test**

Add a test that sends:

```ts
await request(app.getHttpServer())
  .patch('/admin/market-making/direct-orders/order-1/config')
  .send({ maxOrderAmount: 25, interval: 15, targetQuoteVolume: 5000 })
  .expect(200);
```

Assert service is called with:

```ts
expect(service.updateDirectOrderConfig).toHaveBeenCalledWith('order-1', {
  maxOrderAmount: 25,
  interval: 15,
  targetQuoteVolume: 5000,
});
```

- [ ] **Step 2: Run controller test and verify failure**

Run:

```bash
cd server && bun run test -- admin-direct-mm.controller.spec.ts --runInBand
```

Expected: FAIL because endpoint does not exist.

- [ ] **Step 3: Add endpoint**

In controller imports include `Param`, `Patch`, and `DirectUpdateMarketMakingConfigDto`.

Add method:

```ts
  @Patch('direct-orders/:orderId/config')
  async updateDirectOrderConfig(
    @Param('orderId') orderId: string,
    @Body() body: DirectUpdateMarketMakingConfigDto,
  ) {
    return this.adminDirectMarketMakingService.updateDirectOrderConfig(
      orderId,
      body,
    );
  }
```

- [ ] **Step 4: Run controller test and verify pass**

Run:

```bash
cd server && bun run test -- admin-direct-mm.controller.spec.ts --runInBand
```

Expected: PASS.

---

### Task 4: Surface editable config in admin status

**Files:**
- Modify: `server/src/modules/admin/market-making/admin-direct-mm.service.ts`
- Test: `server/src/modules/admin/market-making/admin-direct-mm.service.spec.ts`

- [ ] **Step 1: Write failing status/list test**

Assert `listDirectOrders()` or `getDirectOrderStatus()` returns:

```ts
expect(result).toEqual(
  expect.objectContaining({
    config: expect.objectContaining({
      maxOrderAmount: '25',
      interval: 15,
      targetQuoteVolume: '5000',
    }),
  }),
);
```

- [ ] **Step 2: Implement minimal status shape**

Reuse existing `resolvedConfig` reading and return:

```ts
config: {
  maxOrderAmount: this.readConfigString(
    resolvedConfig.maxOrderAmount ?? resolvedConfig.baseTradeAmount,
  ),
  interval: this.readConfigNumber(
    resolvedConfig.interval ?? resolvedConfig.baseIntervalTime,
  ),
  targetQuoteVolume: this.readConfigString(
    resolvedConfig.dailyVolumeTarget ?? resolvedConfig.targetQuoteVolume,
  ),
}
```

- [ ] **Step 3: Run service tests**

Run:

```bash
cd server && bun run test -- admin-direct-mm.service.spec.ts --runInBand
```

Expected: PASS.

---

### Task 5: Add admin UI edit flow

**Files:**
- Modify current admin direct market-making page/helper after locating it with:
  - `rg -n "direct-start|direct-orders|directResume|directStop" interface/src -S`

- [ ] **Step 1: Add API helper**

Add helper:

```ts
export const updateDirectMarketMakingConfig = async (
  orderId: string,
  params: {
    maxOrderAmount?: number;
    interval?: number;
    targetQuoteVolume?: number;
  },
) => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/market-making/direct-orders/${orderId}/config`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
  );
  return await handleResponse(response);
};
```

- [ ] **Step 2: Add edit button only for safe states**

In the direct orders table/detail actions:

```svelte
{#if order.state === 'stopped' || order.state === 'paused' || order.state === 'failed'}
  <button class="btn btn-sm btn-ghost" on:click={() => openEditConfig(order)}>
    {$_('edit_config')}
  </button>
{/if}
```

- [ ] **Step 3: Add edit modal fields**

Fields:

```svelte
<input class="input input-bordered" type="number" bind:value={editConfig.maxOrderAmount} />
<input class="input input-bordered" type="number" bind:value={editConfig.interval} />
<input class="input input-bordered" type="number" bind:value={editConfig.targetQuoteVolume} />
```

Labels:

- amount per cycle
- refresh time seconds
- stop at quote volume

- [ ] **Step 4: Submit update and refresh list/status**

On save:

```ts
await updateDirectMarketMakingConfig(editingOrder.orderId, {
  maxOrderAmount: Number(editConfig.maxOrderAmount),
  interval: Number(editConfig.interval),
  targetQuoteVolume: Number(editConfig.targetQuoteVolume),
});
await loadDirectOrders();
```

- [ ] **Step 5: Add i18n keys**

Add only keys used by the new UI, for example:

```json
{
  "edit_config": "Edit config",
  "amount_per_cycle": "Amount per cycle",
  "refresh_time_seconds": "Refresh time seconds",
  "stop_at_quote_volume": "Stop at quote volume"
}
```

Use semantic daisyUI classes only.

---

### Task 6: Final verification

**Files:**
- All modified files from Tasks 1-5.

- [ ] **Step 1: Run backend targeted tests**

Run:

```bash
cd server && bun run test -- admin-direct-mm.service.spec.ts admin-direct-mm.controller.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run formatter/lint for touched backend files if required**

Run the project formatter/linter command used locally. If full lint is too broad, run targeted TypeScript/Jest checks and document any unrelated existing failures.

- [ ] **Step 3: Manual behavior check**

Use API or UI:

1. Start efficient direct order with target volume.
2. Stop order.
3. Edit amount/interval/target.
4. Resume order.
5. Confirm runtime uses new config and target volume stop still triggers.

---

## Self-Review

- Spec coverage: plan covers start target, stopped-only editing, resume with updated config, and UI entry point.
- Placeholder scan: no open-ended implementation placeholders remain; UI file location must be located because the current admin route was not part of the focused backend read.
- Type consistency: `maxOrderAmount`, `interval`, and `targetQuoteVolume` are used consistently across DTO, service, controller, and UI.
