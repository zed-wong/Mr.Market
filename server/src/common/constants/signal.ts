export const SignalType = {
  NONE: 'none',
  CROSS_UP: 'cross_up',
  CROSS_DOWN: 'cross_down',
} as const;

export type SignalType = (typeof SignalType)[keyof typeof SignalType];
