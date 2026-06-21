/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConnectorRegistry } from './connector-registry';

describe('ConnectorRegistry', () => {
  it('routes CLOB exchange connector ids to the CLOB connector', () => {
    const clobConnector = { connectorId: 'clob' };
    const registry = new ConnectorRegistry(clobConnector as any);

    expect(registry.resolve('binance')).toBe(clobConnector);
    expect(registry.resolve('mexc')).toBe(clobConnector);
    expect(registry.resolve('hyperliquid')).toBe(clobConnector);
    expect(registry.resolve('clob')).toBe(clobConnector);
  });

  it('rejects unsupported connector ids explicitly', () => {
    const registry = new ConnectorRegistry({ connectorId: 'clob' } as any);

    expect(() => registry.resolve('clob_dex')).toThrow(
      'Unsupported connectorId clob_dex',
    );
  });
});
