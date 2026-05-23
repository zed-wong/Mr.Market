declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  namespace svelteHTML {
    interface IntrinsicElements {
      'appkit-button': {
        disabled?: boolean;
        balance?: 'show' | 'hide';
        size?: 'md' | 'sm';
        label?: string;
        loadinglabel?: string;
        namespace?: 'eip155' | 'solana' | 'bip122';
        'data-testid'?: string;
      };
      'appkit-network-button': {
        disabled?: boolean;
        namespace?: 'eip155' | 'solana' | 'bip122';
        'data-testid'?: string;
      };
      'appkit-account-button': {
        disabled?: boolean;
        balance?: 'show' | 'hide';
        namespace?: 'eip155' | 'solana' | 'bip122';
        'data-testid'?: string;
      };
      'appkit-connect-button': {
        size?: 'md' | 'sm';
        label?: string;
        loadinglabel?: string;
        namespace?: 'eip155' | 'solana' | 'bip122';
        'data-testid'?: string;
      };
    }
  }
}

export {};
