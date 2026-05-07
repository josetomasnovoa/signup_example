export const SCOPES = [
  'inboxes:read',
  'inboxes:write',
  'messages:read',
  'messages:write',
  'rules:read',
  'rules:write',
  'destinations:read',
  'destinations:write',
  'ai:read',
  'ai:write',
  'billing:read',
  'audit:read',
  'admin',
] as const;

export type Scope = (typeof SCOPES)[number];

export function hasScope(granted: readonly Scope[], required: Scope): boolean {
  return granted.includes('admin') || granted.includes(required);
}
