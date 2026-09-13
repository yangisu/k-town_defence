#!/usr/bin/env bash
set -Eeuo pipefail

readonly APP_DIR="${KTOWN_APP_DIR:-/opt/ktown-defense}"
readonly ENV_FILE="$APP_DIR/.env.production"
readonly LOCATION_REGION="ap-northeast-1"
readonly LOCATION_STYLE="Standard"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo so the protected production environment file can be updated." >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "$ENV_FILE does not exist. Run deploy/bootstrap-ec2.sh first." >&2
  exit 1
fi

read -r -s -p "Amazon Location API key: " location_api_key
echo
if [[ "$location_api_key" != v1.public.* ]] || [[ "$location_api_key" =~ [[:space:]] ]]; then
  echo "Expected a single-line Amazon Location public API key beginning with v1.public." >&2
  exit 1
fi

site_domain="$(sed -n 's/^SITE_DOMAIN=//p' "$ENV_FILE" | tail -n 1)"
if [[ -z "$site_domain" ]]; then
  echo "SITE_DOMAIN is missing from $ENV_FILE." >&2
  exit 1
fi

style_url="https://maps.geo.${LOCATION_REGION}.amazonaws.com/v2/styles/${LOCATION_STYLE}/descriptor?key=${location_api_key}"
if ! curl --fail --silent --show-error --max-time 15 \
  -H "Referer: https://${site_domain}/" "$style_url" >/dev/null; then
  echo "Amazon Location rejected the key, map permission, region, or site referrer." >&2
  exit 1
fi

replace_env_value() {
  local key="$1"
  local value="$2"
  local temp_file
  local replaced=false
  temp_file="$(mktemp "${ENV_FILE}.tmp.XXXXXX")"
  chown --reference="$ENV_FILE" "$temp_file"
  chmod --reference="$ENV_FILE" "$temp_file"

  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "$key="* ]]; then
      printf '%s=%s\n' "$key" "$value" >> "$temp_file"
      replaced=true
    else
      printf '%s\n' "$line" >> "$temp_file"
    fi
  done < "$ENV_FILE"
  if [[ "$replaced" == "false" ]]; then
    printf '%s=%s\n' "$key" "$value" >> "$temp_file"
  fi
  mv -f "$temp_file" "$ENV_FILE"
}

replace_env_value NEXT_PUBLIC_AWS_LOCATION_API_KEY "$location_api_key"
replace_env_value NEXT_PUBLIC_AWS_LOCATION_REGION "$LOCATION_REGION"
replace_env_value NEXT_PUBLIC_AWS_LOCATION_STYLE "$LOCATION_STYLE"
chmod 600 "$ENV_FILE"
unset location_api_key style_url

cd "$APP_DIR"
docker compose --env-file .env.production -f compose.production.yaml up -d --build web gateway

for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 10 "https://${site_domain}/healthz" >/dev/null; then
    echo "Amazon Location map configuration applied and deployment is healthy."
    exit 0
  fi
  sleep 5
done

docker compose --env-file .env.production -f compose.production.yaml logs --tail=120 web gateway
echo "Deployment did not become healthy within 150 seconds." >&2
exit 1
