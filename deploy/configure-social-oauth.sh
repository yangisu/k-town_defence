#!/usr/bin/env bash
set -Eeuo pipefail

readonly APP_DIR="${KTOWN_APP_DIR:-/opt/ktown-defense}"
readonly ENV_FILE="$APP_DIR/.env.production"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo so the protected production environment file can be updated." >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "$ENV_FILE does not exist. Run deploy/bootstrap-ec2.sh first." >&2
  exit 1
fi

read_required() {
  local variable_name="$1"
  local prompt="$2"
  local hidden="${3:-false}"
  local value

  if [[ "$hidden" == "true" ]]; then
    read -r -s -p "$prompt: " value
    echo
  else
    read -r -p "$prompt: " value
  fi
  if [[ -z "$value" ]] || [[ "$value" == *$'\n'* ]] || [[ "$value" == *$'\r'* ]]; then
    echo "$variable_name must be a non-empty single-line value." >&2
    exit 1
  fi
  printf -v "$variable_name" '%s' "$value"
}

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

echo "Paste each value directly from its provider console. Secret input is hidden."
read_required kakao_client_id "Kakao REST API key"
read_required kakao_client_secret "Kakao Login client secret" true
read_required google_client_id "Google OAuth Client ID"
read_required google_client_secret "Google OAuth Client Secret" true

replace_env_value KAKAO_CLIENT_ID "$kakao_client_id"
replace_env_value KAKAO_CLIENT_SECRET "$kakao_client_secret"
replace_env_value GOOGLE_CLIENT_ID "$google_client_id"
replace_env_value GOOGLE_CLIENT_SECRET "$google_client_secret"
chmod 600 "$ENV_FILE"

unset kakao_client_id kakao_client_secret
unset google_client_id google_client_secret

cd "$APP_DIR"
docker compose --env-file .env.production -f compose.production.yaml up -d --build web gateway

for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 10 https://ktowndefense.site/healthz >/dev/null; then
    echo "Social OAuth configuration applied and deployment is healthy."
    exit 0
  fi
  sleep 5
done

docker compose --env-file .env.production -f compose.production.yaml logs --tail=120 web gateway
echo "Deployment did not become healthy within 150 seconds." >&2
exit 1
