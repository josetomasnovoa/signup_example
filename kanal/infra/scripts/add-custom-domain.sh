#!/usr/bin/env bash
# Switch from kanal-*.fly.dev to your own Cloudflare-managed domain.
#
# Usage:
#   ./infra/scripts/add-custom-domain.sh <domain>
# Example:
#   ./infra/scripts/add-custom-domain.sh kanaltest.com
#
# After this script runs, you'll get prompts from Fly with the exact DNS
# records to paste into Cloudflare. Once propagated:
#   • https://api.kanaltest.com  → kanal-api
#   • https://app.kanaltest.com  → kanal-web (chat lives at /chat/triage)
#   • https://mcp.kanaltest.com  → kanal-mcp (only if deployed)
#
# This script does NOT touch Cloudflare directly — you paste the DNS
# records by hand. If you'd rather automate that too, set CF_API_TOKEN
# (with Zone.Read + DNS:Edit on the target zone) and CF_ZONE_ID and the
# script will create the CNAMEs over the API.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <domain>" >&2
  exit 1
fi
DOMAIN="$1"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

bold "Issuing certs (Fly will print DNS instructions for each)"
flyctl certs create -a kanal-api "api.$DOMAIN"
flyctl certs create -a kanal-web "app.$DOMAIN"
if flyctl status -a kanal-mcp >/dev/null 2>&1; then
  flyctl certs create -a kanal-mcp "mcp.$DOMAIN"
fi

bold "Updating web app to point at the new API URL"
flyctl secrets set -a kanal-web "KANAL_API_URL=https://api.$DOMAIN"

if [[ -n "${CF_API_TOKEN:-}" && -n "${CF_ZONE_ID:-}" ]]; then
  bold "Creating Cloudflare DNS records via API"
  for sub in api app mcp; do
    if [[ "$sub" == "mcp" ]] && ! flyctl status -a kanal-mcp >/dev/null 2>&1; then continue; fi
    target=$(flyctl certs show "$sub.$DOMAIN" -a "kanal-${sub}" 2>/dev/null | awk '/CNAME/{print $NF}' | head -1 || true)
    if [[ -z "$target" ]]; then
      target="kanal-${sub}.fly.dev"
    fi
    curl -fsS -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"type\":\"CNAME\",\"name\":\"$sub\",\"content\":\"$target\",\"proxied\":false,\"ttl\":300}" \
      | python3 -c "import json,sys; d=json.load(sys.stdin); print('  ', '$sub.$DOMAIN', '→', d.get('result',{}).get('content','?'), 'success=', d.get('success'))"
  done
else
  bold "DNS records to add manually in Cloudflare (proxied=false / DNS-only):"
  echo "  api.$DOMAIN  CNAME  kanal-api.fly.dev"
  echo "  app.$DOMAIN  CNAME  kanal-web.fly.dev"
  if flyctl status -a kanal-mcp >/dev/null 2>&1; then
    echo "  mcp.$DOMAIN  CNAME  kanal-mcp.fly.dev"
  fi
  echo
  echo "Then re-run: flyctl certs check -a kanal-api api.$DOMAIN"
fi

green "Done. Once DNS propagates, redeploy nothing — Fly.io issues the cert automatically."
