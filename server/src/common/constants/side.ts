export const Side = ['buy', 'sell'] as const;
export type Side = (typeof Side)[number];
