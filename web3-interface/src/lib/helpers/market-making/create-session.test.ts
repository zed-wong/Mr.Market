import { describe, expect, it } from 'vitest';
import {
  getCreateOrderSessionBlockReason,
  getCreateOrderSubmissionBlockReason,
} from './create-session';

const authedSession = {
  walletConnected: true,
  walletUnsupported: false,
  isAuthed: true,
  hasUsableAuthSession: true,
};

describe('create order session gates', () => {
  it('blocks disconnected, unsupported, unauthenticated, and expired sessions before submission', () => {
    expect(
      getCreateOrderSessionBlockReason({ ...authedSession, walletConnected: false })
    ).toContain('Connect a supported wallet');
    expect(
      getCreateOrderSessionBlockReason({ ...authedSession, walletUnsupported: true })
    ).toContain('Switch to a supported network');
    expect(
      getCreateOrderSessionBlockReason({ ...authedSession, isAuthed: false })
    ).toContain('Authenticate the connected wallet');
    expect(
      getCreateOrderSessionBlockReason({ ...authedSession, hasUsableAuthSession: false })
    ).toContain('Authenticate the connected wallet');
  });

  it('allows only authenticated wallets with a usable session and prevents duplicate submits', () => {
    expect(getCreateOrderSubmissionBlockReason({ ...authedSession, isSubmitting: false })).toBeNull();
    expect(getCreateOrderSubmissionBlockReason({ ...authedSession, isSubmitting: true })).toContain(
      'already in progress'
    );
  });
});
