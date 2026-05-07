import type { DestinationDriver } from './driver.js';
import { webhookDriver } from './webhook.js';
import { slackDriver } from './slack.js';
import { discordDriver } from './discord.js';
import { mcpClientDriver } from './mcp-client.js';

const DRIVERS = new Map<string, DestinationDriver>();

export function registerDriver(driver: DestinationDriver): void {
  DRIVERS.set(driver.kind, driver);
}

export function getDriver(kind: string): DestinationDriver | undefined {
  return DRIVERS.get(kind);
}

export function listDrivers(): readonly string[] {
  return [...DRIVERS.keys()];
}

registerDriver(webhookDriver);
registerDriver(slackDriver);
registerDriver(discordDriver);
registerDriver(mcpClientDriver);

// Future: notion, drive, github_issue, email_forward