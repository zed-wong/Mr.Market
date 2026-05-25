export interface CreateOrderSessionContext {
  walletConnected: boolean;
  walletUnsupported: boolean;
  isAuthed: boolean;
  hasUsableAuthSession: boolean;
}

export interface CreateOrderSubmissionContext extends CreateOrderSessionContext {
  isSubmitting: boolean;
}

export const getCreateOrderSessionBlockReason = ({
  walletConnected,
  walletUnsupported,
  isAuthed,
  hasUsableAuthSession,
}: CreateOrderSessionContext): string | null => {
  if (!walletConnected) return 'Connect a supported wallet before creating a market-making order.';
  if (walletUnsupported) return 'Switch to a supported network before creating a market-making order.';
  if (!isAuthed || !hasUsableAuthSession) {
    return 'Authenticate the connected wallet before creating a market-making order.';
  }
  return null;
};

export const getCreateOrderSubmissionBlockReason = ({
  isSubmitting,
  ...session
}: CreateOrderSubmissionContext): string | null => {
  if (isSubmitting) return 'A market-making order submission is already in progress.';
  return getCreateOrderSessionBlockReason(session);
};
