import { ExchangeConnectorAdapterService } from '../../../../../src/modules/market-making/execution/exchange-connector-adapter.service';

type InjectableMethod = 'placeLimitOrder' | 'cancelOrder' | 'fetchOrderBook';

export class SoakErrorInjector {
  private readonly activeInjections = new Set<string>();

  injectPersistentError(
    adapter: ExchangeConnectorAdapterService,
    method: InjectableMethod,
    failCount: number,
    errorMessage: string,
  ): void {
    const original = (
      adapter[method] as (...args: unknown[]) => Promise<unknown>
    ).bind(adapter);
    const key = `${method}:${Date.now()}`;

    this.activeInjections.add(key);
    let remaining = failCount;

    (adapter as unknown as Record<string, unknown>)[method] = async (
      ...args: unknown[]
    ) => {
      if (remaining > 0) {
        remaining--;
        if (remaining === 0) {
          (adapter as unknown as Record<string, unknown>)[method] = original;
          this.activeInjections.delete(key);
        }
        throw new Error(errorMessage);
      }

      return original(...args);
    };
  }

  injectUntilRestored(
    adapter: ExchangeConnectorAdapterService,
    method: InjectableMethod,
    errorMessage: string,
  ): () => void {
    const original = (
      adapter[method] as (...args: unknown[]) => Promise<unknown>
    ).bind(adapter);
    const key = `${method}:permanent:${Date.now()}`;

    this.activeInjections.add(key);
    let active = true;

    (adapter as unknown as Record<string, unknown>)[method] = async (
      ...args: unknown[]
    ) => {
      if (active) {
        throw new Error(errorMessage);
      }

      return original(...args);
    };

    return () => {
      active = false;
      (adapter as unknown as Record<string, unknown>)[method] = original;
      this.activeInjections.delete(key);
    };
  }

  hasActiveInjections(): boolean {
    return this.activeInjections.size > 0;
  }
}
