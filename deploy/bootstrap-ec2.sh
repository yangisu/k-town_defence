#!/usr/bin/env bash
set -Eeuo pipefail

readonly APP_DIR="/opt/ktown-defense"
readonly REPOSITORY="https://github.com/yangisu/k-town_defence.git"
readonly DEPLOY_BRANCH="feat/self-hosted-production"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root (Systems Manager Run Command runs as root)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl docker.io docker-compose-v2 git openssl
systemctl enable --now docker

# A t3.micro can run the stack, but the Node production build needs temporary
# headroom. Keep a small persistent swap file rather than increasing public
# services or moving the database outside the private Docker network.
if ! swapon --show=NAME --noheadings | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if [[ ! -d "$APP_DIR/.git" ]]; then
  if [[ -e "$APP_DIR" ]]; then
    echo "$APP_DIR already exists and is not the deployment repository; refusing to overwrite it." >&2
    exit 1
  fi
  git clone --branch "$DEPLOY_BRANCH" --single-branch "$REPOSITORY" "$APP_DIR"
else
  git -C "$APP_DIR" fetch origin "$DEPLOY_BRANCH"
  git -C "$APP_DIR" checkout "$DEPLOY_BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$DEPLOY_BRANCH"
fi

cd "$APP_DIR"
umask 077
if [[ ! -f .env.production ]]; then
  db_password="$(openssl rand -hex 32)"
  session_secret="$(openssl rand -hex 48)"
  cat > .env.production <<EOF
SITE_DOMAIN=ktowndefense.site
POSTGRES_DB=ktown
POSTGRES_USER=ktown
POSTGRES_PASSWORD=$db_password
KTOUR_SERVICE_KEY=
KTOWN_SESSION_SECRET=$session_secret
NEXT_PUBLIC_AWS_LOCATION_API_KEY=
NEXT_PUBLIC_AWS_LOCATION_REGION=ap-northeast-2
NEXT_PUBLIC_AWS_LOCATION_STYLE=Standard
KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EOF
  chmod 600 .env.production
fi

docker compose --env-file .env.production -f compose.production.yaml up -d --build --remove-orphans
docker compose --env-file .env.production -f compose.production.yaml ps

for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 10 https://ktowndefense.site/healthz; then
    echo
    echo "K-Town Defense deployment is healthy."
    exit 0
  fi
  sleep 5
done

docker compose --env-file .env.production -f compose.production.yaml logs --tail=200
echo "Deployment did not become healthy within 150 seconds." >&2
exit 1
