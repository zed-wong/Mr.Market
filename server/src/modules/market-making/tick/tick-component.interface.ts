export interface TickComponent {
  start(): Promise<void>;
  stop(): Promise<void>;
  onTick(ts: string): Promise<void>;
  health(): Promise<boolean>;
}
