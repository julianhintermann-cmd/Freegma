# Running Freegma on a NAS (UGREEN, Synology, QNAP, Unraid, TrueNAS)

Freegma runs anywhere Docker Compose v2 runs. These notes cover the usual
NAS specifics, with UGREEN NASync (UGOS Pro) as the main example. Menu names
differ between firmware versions, so treat them as pointers and check them
on your device.

## 1. Check the box

```bash
ssh admin@<nas-ip>
uname -m                      # x86_64 (most UGREEN DXP models, Intel) or aarch64 - both work
nproc; free -h                # >= 2 cores, >= 4 GB RAM (8 GB comfortable)
docker version; docker compose version
df -h /volume1                # >= 10 GB free for images + data
sudo ss -tlnp | grep -E ':(80|443|9001)\b'   # ports already taken?
```

- **SSH:** UGOS Pro → *Control Panel → Terminal* → enable SSH (turn it off again when done if you like).
- **Docker:** install the *Docker* app from the App Center; it brings Docker Engine and Compose v2.
- Most commands need `sudo` on UGOS (or add your user to the `docker` group).

## 2. Install

Use a shared folder on the data volume, e.g. `/volume1/docker/freegma`:

```bash
sudo mkdir -p /volume1/docker && cd /volume1/docker
sudo git clone https://github.com/julianhintermann-cmd/Freegma.git freegma
# no git? -> download the release ZIP on your PC, copy it to the share, unzip
cd freegma
sudo ./scripts/init.sh --domain freegma.home.arpa
```

`make` is often missing on NAS systems. Every `make` target has a plain
equivalent:

| make | without make |
|---|---|
| `make up` | `sudo docker compose up -d && sudo ./scripts/healthcheck.sh --wait 420` |
| `make admin EMAIL=… NAME=…` | `sudo ./scripts/create-user.sh you@example.com "Your Name"` |
| `make mcp-token` | `sudo FREEGMA_TEST_EMAIL=you@example.com FREEGMA_TEST_PASSWORD='…' docker compose run --rm tools mcp-setup` |
| `make mcp-test` | same with `… tools mcp-test` |
| `make backup` / `make restore BACKUP=…` | `sudo ./scripts/backup.sh` / `sudo ./scripts/restore.sh <dir>` |
| `make update VERSION=…` | `sudo ./scripts/update.sh <version>` |
| `make health` | `sudo ./scripts/healthcheck.sh` |

## 3. Ports

The NAS web interface uses its own ports (on UGOS Pro by default 9999/9443),
but other apps or the NAS's own reverse proxy may already hold 80/443. If
`ss` shows them taken:

```ini
# .env
FREEGMA_HTTPS_PORT=8443
FREEGMA_HTTP_REDIRECT_PORT=8080
FREEGMA_PUBLIC_URI=https://freegma.home.arpa:8443
```

Caddy then redirects `http://…:8080` to `https://…:8443` correctly.
Alternatively, use the NAS's built-in reverse proxy (Option C in the README).
Point it at `http://127.0.0.1:9001` with `FREEGMA_HTTP_BIND=0.0.0.0`, remove
`https` from `COMPOSE_PROFILES`, and enable WebSockets in the proxy rule.

## 4. Name resolution

Create a DNS record `freegma.home.arpa → <nas-ip>` in your router, Pi-hole or
AdGuard Home. With Tailscale on the NAS, use its MagicDNS name instead
(e.g. `nas.<tailnet>.ts.net`) and see Option D in the README.

## 5. IPv6

Some NAS kernels have IPv6 disabled. `init.sh` detects this and sets
`PENPOT_DISABLE_IPV6_LISTEN=true`. If `penpot-frontend` keeps restarting
with `Address family not supported by protocol`, set it by hand.

## 6. Memory

On 4 GB boxes cap the JVM: `PENPOT_JVM_OPTS=-Xmx1g`, then `make up`. The
exporter starts a headless browser only while exporting.

## 7. Backups to another share or disk

```ini
# .env
BACKUP_DIR=/volume2/backup/freegma      # or a mounted USB disk / remote share
```

Schedule it. UGOS Pro, Synology and QNAP have a *Task Scheduler* in the
control panel (run as root, command below), or use cron:

```bash
sudo crontab -e
15 3 * * * cd /volume1/docker/freegma && mkdir -p backups && ./scripts/backup.sh >> backups/backup.log 2>&1
```

Then include `BACKUP_DIR` in the NAS's own off-site backup (cloud, another
NAS, USB rotation). A backup on the same disks as the data is not a backup.

## 8. Updates of the NAS / Docker app

Containers have `restart: unless-stopped` and come back after a reboot or
Docker update. Check with `make health` afterwards.

## Other systems

- **Synology DSM 7.2+:** *Container Manager* includes Compose v2. Use SSH as
  above; Synology's reverse proxy (*Login Portal → Advanced*) works for
  Option C (enable WebSocket headers).
- **Unraid / TrueNAS SCALE:** use the Compose plugin / a custom app with
  this compose file, or a VM/LXC with Docker.
- **Raspberry Pi 5 / ARM boards:** all images are `arm64`; 8 GB RAM recommended.
