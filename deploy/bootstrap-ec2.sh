#!/usr/bin/env bash
set -Eeuo pipefail

readonly APP_DIR="/opt/ktown-defense"
readonly REPOSITORY="https://github.com/yangisu/k-town_defence.git"
readonly DEPLOY_BRANCH="main"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root (Systems Manager Run Command runs as root)." >&2
  exit 1
fi

# Grow the mounted root partition after an online EBS volume expansion. Ubuntu
# cloud images include growpart and resize2fs; keep the step harmless on reruns.
root_partition="$(readlink -f "$(findmnt -no SOURCE /)")"
root_disk_name="$(lsblk -no PKNAME "$root_partition" | tr -d '[:space:]')"
root_partition_number="$(lsblk -no PARTN "$root_partition" | tr -d '[:space:]')"
if [[ -n "$root_disk_name" ]] && [[ -n "$root_partition_number" ]] && command -v growpart >/dev/null; then
  growpart "/dev/$root_disk_name" "$root_partition_number" || true
  if command -v resize2fs >/dev/null; then
    resize2fs "$root_partition"
  fi
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl docker.io docker-compose-v2 git openssl
systemctl enable --now docker

# A t3.micro needs temporary build headroom, but this instance has a small root
# disk. Keep the swap deliberately small so Docker still has room for layers.
if [[ -f /swapfile ]] && [[ "$(stat -c %s /swapfile)" -gt 536870912 ]]; then
  swapoff /swapfile || true
  rm -f /swapfile
fi
if ! swapon --show=NAME --noheadings | grep -Fxq /swapfile; then
  fallocate -l 512M /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
apt-get clean

if [[ ! -d "$APP_DIR/.git" ]]; then
  if [[ -e "$APP_DIR" ]]; then
    echo "$APP_DIR already exists and is not the deployment repository; refusing to overwrite it." >&2
    exit 1
  fi
  git clone --branch "$DEPLOY_BRANCH" --single-branch "$REPOSITORY" "$APP_DIR"
else
  git -C "$APP_DIR" fetch origin "+refs/heads/$DEPLOY_BRANCH:refs/remotes/origin/$DEPLOY_BRANCH"
  git -C "$APP_DIR" checkout -B "$DEPLOY_BRANCH" "origin/$DEPLOY_BRANCH"
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
NEXT_PUBLIC_AWS_LOCATION_REGION=ap-northeast-1
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

# This host previously served Ubuntu's default nginx page. Caddy owns the public
# HTTP/HTTPS ports in this stack, so prevent nginx from reclaiming port 80 after
# a reboot. Do not uninstall it; its configuration remains recoverable.
if systemctl is-active --quiet nginx; then
  systemctl disable --now nginx
fi

docker compose --env-file .env.production -f compose.production.yaml up -d --build --remove-orphans
# Recreate the public edge explicitly. A container that previously failed while
# binding port 80 can otherwise restart without publishing its configured ports.
docker compose --env-file .env.production -f compose.production.yaml up -d --force-recreate gateway
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
