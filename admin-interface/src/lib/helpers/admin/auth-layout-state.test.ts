import { describe, expect, it } from 'vitest';
import { getAuthLayoutState, isLoginRoute, isSetupRoute } from './auth-layout-state';

const protectedRoutes = [
  '/',
  '/trading/exchange-orders',
  '/trading/user-orders',
  '/trading/ledger',
  '/system/health',
  '/system/audit',
  '/system/config',
  '/system/password',
  '/trading/direct-market-making',
  '/trading/exchanges',
  '/system/connectivity/exchanges',
  '/system/connectivity/api-keys',
];

describe('auth layout state', () => {
  it('blocks direct unauthenticated protected-route visits before child rendering', () => {
    for (const pathname of protectedRoutes) {
      expect(
        getAuthLayoutState({
          pathname,
          i18nReady: true,
          bootstrapped: true,
          authenticated: false,
        }),
      ).toBe('auth-blocked');
    }
  });

  it('keeps login routes renderable for unauthenticated users', () => {
    expect(isLoginRoute('/login')).toBe(true);
    expect(isLoginRoute('/login/passkey')).toBe(true);
    expect(
      getAuthLayoutState({
        pathname: '/login',
        i18nReady: true,
        bootstrapped: true,
        authenticated: false,
      }),
    ).toBe('login');
  });

  it('keeps setup routes renderable before authentication', () => {
    expect(isSetupRoute('/setup')).toBe(true);
    expect(isSetupRoute('/setup/review')).toBe(true);
    expect(
      getAuthLayoutState({
        pathname: '/setup',
        i18nReady: true,
        bootstrapped: true,
        authenticated: false,
      }),
    ).toBe('setup');
  });

  it('renders authenticated protected routes after bootstrap', () => {
    expect(
      getAuthLayoutState({
        pathname: '/trading/exchange-orders',
        i18nReady: true,
        bootstrapped: true,
        authenticated: true,
      }),
    ).toBe('protected');
  });

  it('shows bootstrap loading until i18n and session checks finish', () => {
    expect(
      getAuthLayoutState({
        pathname: '/trading/exchange-orders',
        i18nReady: false,
        bootstrapped: true,
        authenticated: false,
      }),
    ).toBe('bootstrapping');
    expect(
      getAuthLayoutState({
        pathname: '/trading/exchange-orders',
        i18nReady: true,
        bootstrapped: false,
        authenticated: false,
      }),
    ).toBe('bootstrapping');
  });
});
