/**
 * Common interface every destination driver implements. The worker hands a
 * normalized payload to `deliver()` and persists the returned snapshot in
 * `delivery_attempt`. Drivers should be stateless.
 */
export interface DeliveryPayload {
  messageId: string;
  inboxId: string;
  tenantId: string;
  channel: string;
  receivedAt: string;
  subject: string | null;
  contentText: string | null;
  contentJson: Record<string, unknown> | null;
  sender: Record<string, unknown> | null;
  /** Values produced by the rules engine (ai outputs, set ops, etc.). */
  derived: Record<string, unknown>;
  tags: string[];
  /** Per-target overrides from the rule's `with: { ... }` clause. */
  with?: Record<string, unknown>;
}

export interface DeliveryResult {
  status: 'success' | 'failed';
  errorCode?: string;
  errorMessage?: string;
  request: { url?: string; headers?: Record<string, string>; body?: unknown };
  response: { status?: number; headers?: Record<string, string>; body?: unknown };
}

export interface DestinationDriver {
  readonly kind: string;
  deliver(payload: DeliveryPayload, config: Record<string, unknown>): Promise<DeliveryResult>;
}