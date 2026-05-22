export type AuthLayoutState = 'bootstrapping' | 'login' | 'auth-blocked' | 'protected';

interface AuthLayoutStateInput {
  pathname: string;
  i18nReady: boolean;
  bootstrapped: boolean;
  authenticated: boolean;
}

export const isLoginRoute = (pathname: string) =>
  pathname === '/login' || pathname.startsWith('/login/');

export const getAuthLayoutState = ({
  pathname,
  i18nReady,
  bootstrapped,
  authenticated,
}: AuthLayoutStateInput): AuthLayoutState => {
  if (!i18nReady || !bootstrapped) {
    return 'bootstrapping';
  }

  if (isLoginRoute(pathname)) {
    return 'login';
  }

  if (!authenticated) {
    return 'auth-blocked';
  }

  return 'protected';
};
