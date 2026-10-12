# Freegma on the NAS (single compose file)

`docker-compose.yml` in this folder is self-contained: no `.env`, no Caddyfile,
no repository checkout needed. Tested with exactly this folder layout.

| Path | Content | Volume |
|---|---|---|
| `/volume2/docker/freegma/postgres` | database | docker data |
| `/volume2/docker/freegma/caddy/data` | certificates + internal CA | docker data |
| `/volume2/docker/freegma/caddy/config` | Caddy state | docker data |
| `/volume1/data/freegma/assets` | uploaded images, fonts, thumbnails (owner `1001:1001`) | long-term data |
| `/volume1/data/freegma/backups` | backups | long-term data |

## 1. Create the folders (SSH)

```bash
sudo mkdir -p /volume2/docker/freegma/{postgres,caddy/data,caddy/config} /volume1/data/freegma/{assets,backups} \
  && sudo chown -R 1001:1001 /volume1/data/freegma/assets
```

Penpot runs as UID 1001 and must be able to write `assets`. PostgreSQL and
Caddy set up their own folders on first start.

## 2. Put the compose file in place and set secrets

```bash
sudo curl -fsSL -o /volume2/docker/freegma/docker-compose.yml \
  https://raw.githubusercontent.com/julianhintermann-cmd/Freegma/claude/great-lamport-ckv9pp/deploy/nas/docker-compose.yml
cd /volume2/docker/freegma

SK=$(openssl rand -base64 48 | tr -d '/+=\n'); PW=$(openssl rand -base64 24 | tr -d '/+=\n')
sudo sed -i "s#CHANGE-ME-long-random-secret-key#$SK#; s#CHANGE-ME-db-password#$PW#g" docker-compose.yml
grep -n "CHANGE" docker-compose.yml     # only the hostname lines should remain
```

If you use a hostname other than `freegma.home.arpa`, replace it in the two
lines marked `# CHANGE (your hostname)`. Keep a copy of the file in your
password manager or with the backups: the two secrets are needed to restore.

## 3. Start

```bash
sudo docker compose -p freegma up -d
sudo docker compose -p freegma ps          # wait until every container is "healthy" (~1-2 min)
```

UGOS Docker app alternative: *Project → Create*, path `/volume2/docker/freegma`,
paste the file (with the secrets already replaced).

## 4. Create your account

```bash
sudo docker exec -it freegma-backend python3 manage.py create-profile
```

It asks for e-mail, name and password. Registration in the UI is disabled.

## 5. Open it

Make `freegma.home.arpa` resolve to the NAS (router/Pi-hole/AdGuard DNS
record, or the hosts file of your PC), then open <https://freegma.home.arpa>.

Trust the certificate authority once per device:

```bash
sudo cp /volume2/docker/freegma/caddy/data/caddy/pki/authorities/local/root.crt /volume1/data/freegma/freegma-root-ca.crt
```

Then import `freegma-root-ca.crt` as a trusted root (see the main README, "HTTPS and access").

## Ports already in use?

If 80/443 are taken on the NAS, change the `caddy` ports to `"8443:443"` and
`"8080:80"`, and `PENPOT_PUBLIC_URI` to `https://freegma.home.arpa:8443`. With
this single-file setup, the HTTP → HTTPS redirect then points to port 443;
open the `:8443` URL directly.

## MCP for Claude

In Freegma: *Your account → Integrations → MCP Server → enable → generate key*.
Then on your PC:

```bash
claude mcp add --transport http freegma "https://freegma.home.arpa/mcp/stream?userToken=<KEY>"
```

Keep a Freegma file open in the browser (toolbar shows "● MCP").

## Backup (cron, daily 03:15)

```bash
sudo crontab -e
15 3 * * * d=/volume1/data/freegma/backups/$(date +\%Y\%m\%d) && mkdir -p $d && docker exec freegma-postgres pg_dump -U penpot -d penpot -Fc > $d/database.dump && tar -C /volume1/data/freegma -czf $d/assets.tar.gz assets && cp /volume2/docker/freegma/docker-compose.yml $d/ && find /volume1/data/freegma/backups -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
```

This keeps 14 days of database dump + assets + compose file (with secrets, so
protect the backup folder). For rotation, verification and one-command
restore, use the full repository setup (`make backup` / `make restore`).

## Update

Change `2.18.3` in the four `penpotapp/*` image lines to the new version
(read the Penpot release notes), then:

```bash
sudo docker compose -p freegma pull && sudo docker compose -p freegma up -d
```

Make a backup first. For automatic backup + smoke test + rollback, use `make update` from the repository.
