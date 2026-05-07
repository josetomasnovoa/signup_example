import type { DestinationDriver } from './driver.js';
import { webhookDriver } from './webhook.js';

const DRIVERS = new Map<string, DestinationDriver>();

export function registerDriver(driver: DestinationDriver): void {
  DRIVERS.set(driver.kind, driver);
}

export function getDriver(kind: string): DestinationDriver | undefined {
  return DRIVERS.get(kind);
}

registerDriver(webhookDriver);

// Future: notion, slack, discord, github_issue, email_forward, mcp_client