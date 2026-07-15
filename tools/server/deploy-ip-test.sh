#!/usr/bin/env bash
set -euo pipefail

release_dir=${1:?release directory required}
public_ip=${2:?public IP required}
public_port=${3:-443}
if [[ "$public_port" == "443" ]]; then
  public_origin="https://${public_ip}"
else
  public_origin="https://${public_ip}:${public_port}"
fi
cd "$release_dir"
umask 077

secret() { openssl rand -hex 32; }
if [[ ! -f .env.server ]]; then
  admin_password=$(openssl rand -base64 24 | tr -d '\n/=+' | head -c 24)
  livekit_key="sw_$(openssl rand -hex 8)"
  livekit_secret=$(secret)
  cat > .env.server <<EOF
RELEASE_TAG=$(basename "$release_dir")
PUBLIC_ORIGIN=${public_origin}
SESSION_SECRET=$(secret)
CONTENT_SIGNING_SECRET=$(secret)
INTERNAL_HOOK_TOKEN=$(secret)
MEDIA_JWT_SECRET=$(secret)
MEDIA_ORIGIN=${public_origin}
LIVEKIT_API_KEY=${livekit_key}
LIVEKIT_API_SECRET=${livekit_secret}
LIVEKIT_URL=${public_origin/https:/wss:}
TUS_ENDPOINT=${public_origin}/files/
ALLOW_NONINTERACTIVE_BOOTSTRAP=true
BOOTSTRAP_ADMIN_USERNAME=simplewatch-admin
BOOTSTRAP_ADMIN_PASSWORD=${admin_password}
EOF
  cat > /root/simplewatch-initial-credentials <<EOF
URL=${public_origin}/admin
USERNAME=simplewatch-admin
PASSWORD=${admin_password}
EOF
  chmod 600 /root/simplewatch-initial-credentials
fi

set -a
source .env.server
set +a

cert_dir=/srv/simplewatch/ip-cert
mkdir -p "$cert_dir"
if [[ ! -s "$cert_dir/ip.crt" || ! -s "$cert_dir/ip.key" ]]; then
  openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 30 \
    -keyout "$cert_dir/ip.key" \
    -out "$cert_dir/ip.crt" \
    -subj "/CN=${public_ip}" \
    -addext "subjectAltName=IP:${public_ip}" \
    -addext "keyUsage=digitalSignature,keyEncipherment" \
    -addext "extendedKeyUsage=serverAuth"
fi
chmod 600 "$cert_dir/ip.key"
chmod 644 "$cert_dir/ip.crt"

vendor_dir="$release_dir/.server/vendor"
mkdir -p "$vendor_dir"
livekit_archive="livekit_1.13.1_linux_amd64.tar.gz"
mediamtx_archive="mediamtx_v1.18.2_linux_amd64.tar.gz"
if [[ ! -x "$vendor_dir/livekit-server" ]]; then
  [[ -f "$vendor_dir/$livekit_archive" ]] || curl -fsSL --retry 3 -o "$vendor_dir/$livekit_archive" "https://github.com/livekit/livekit/releases/download/v1.13.1/$livekit_archive"
  [[ -f "$vendor_dir/livekit-checksums.txt" ]] || curl -fsSL --retry 3 -o "$vendor_dir/livekit-checksums.txt" "https://github.com/livekit/livekit/releases/download/v1.13.1/checksums.txt"
  (cd "$vendor_dir" && grep "$livekit_archive\$" livekit-checksums.txt | sha256sum -c -)
  tar -xzf "$vendor_dir/$livekit_archive" -C "$vendor_dir" livekit-server
fi
if [[ ! -x "$vendor_dir/mediamtx" ]]; then
  [[ -f "$vendor_dir/$mediamtx_archive" ]] || curl -fsSL --retry 3 -o "$vendor_dir/$mediamtx_archive" "https://github.com/bluenviron/mediamtx/releases/download/v1.18.2/$mediamtx_archive"
  [[ -f "$vendor_dir/mediamtx-checksums.txt" ]] || curl -fsSL --retry 3 -o "$vendor_dir/mediamtx-checksums.txt" "https://github.com/bluenviron/mediamtx/releases/download/v1.18.2/checksums.sha256"
  (cd "$vendor_dir" && grep "$mediamtx_archive\$" mediamtx-checksums.txt | sha256sum -c -)
  tar -xzf "$vendor_dir/$mediamtx_archive" -C "$vendor_dir" mediamtx
fi
chmod 755 "$vendor_dir/livekit-server" "$vendor_dir/mediamtx"
export LIVEKIT_ARCHIVE_SHA256 MEDIAMTX_ARCHIVE_SHA256
LIVEKIT_ARCHIVE_SHA256=$(sha256sum "$vendor_dir/$livekit_archive" | cut -d' ' -f1)
MEDIAMTX_ARCHIVE_SHA256=$(sha256sum "$vendor_dir/$mediamtx_archive" | cut -d' ' -f1)
sed \
  -e "s/__LIVEKIT_API_KEY__/${LIVEKIT_API_KEY}/g" \
  -e "s/__LIVEKIT_API_SECRET__/${LIVEKIT_API_SECRET}/g" \
  infra/livekit/livekit.server-ip.template.yaml > infra/livekit/livekit.server-ip.yaml
chmod 600 .env.server infra/livekit/livekit.server-ip.yaml

compose=(docker compose -f infra/compose/compose.server-ip.yaml)
"${compose[@]}" config --quiet
"${compose[@]}" pull caddy
docker tag ghcr.io/tus/tusd:v2.9.2 docker.m.daocloud.io/tusproject/tusd:v2.9.2 2>/dev/null || true
"${compose[@]}" pull --policy missing tusd
docker image inspect "simplewatch-app:${RELEASE_TAG}" >/dev/null 2>&1 || "${compose[@]}" build app
docker image inspect "simplewatch-mediamtx:${RELEASE_TAG}" >/dev/null 2>&1 || "${compose[@]}" build mediamtx
docker image inspect "simplewatch-livekit:${RELEASE_TAG}" >/dev/null 2>&1 || "${compose[@]}" build livekit
if [[ ! -s /srv/simplewatch/state/simplewatch.sqlite3 ]]; then
  "${compose[@]}" run --rm \
    -e NODE_ENV=test \
    -e DATABASE_PATH=/opt/simplewatch/.local/server/simplewatch.sqlite3 \
    -v /srv/simplewatch/state:/opt/simplewatch/.local/server \
    app node apps/api/node_modules/tsx/dist/cli.mjs apps/api/src/cli/admin-bootstrap-noninteractive.ts
fi
"${compose[@]}" up -d --wait --wait-timeout 180
ln -sfn "$release_dir" /opt/simplewatch/current
"${compose[@]}" ps
