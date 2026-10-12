# Troubleshooting

Start with:

```bash
make health                 # which service / endpoint is failing?
make logs S=<service>       # e.g. S=penpot-backend
make smoke                  # end-to-end check through the public URL
```

## Startup

| Symptom | Cause / fix |
|---|---|
| `Set FREEGMA_PUBLIC_URI in .env` (or another `Set … in .env`) | `.env` is missing or incomplete. Run `make init`. |
| `penpot-frontend` restarting, log: `socket() [::]:8080 failed (97: Address family not supported by protocol)` | IPv6 is disabled on the host. Set `PENPOT_DISABLE_IPV6_LISTEN=true`. |
| `dependency failed to start: … is unhealthy` | Look at that service's logs. The backend needs up to ~60 s on first start (database migrations). |
| Backend: `password authentication failed` | `POSTGRES_PASSWORD` changed after the database volume was created. Restore the old value (from a backup's `env`) or reset the volume (data loss!). |
| `toomanyrequests` while pulling | Docker Hub rate limit. Run `docker login` (free account) or retry later. |
| Port already allocated | Something else uses 80/443/9001. Change `FREEGMA_HTTPS_PORT`, `FREEGMA_HTTP_REDIRECT_PORT` or `FREEGMA_HTTP_PORT`. |

## Browser

| Symptom | Cause / fix |
|---|---|
| Blank page / endless spinner, CORS errors in the console | The URL in the address bar differs from `FREEGMA_PUBLIC_URI`. Use exactly that URL, or change the variable and `make up`. |
| Certificate warning | Trust the internal CA (`make ca-cert`, see README) or use Let's Encrypt. |
| Cannot copy/paste | The Clipboard API needs HTTPS. Use the `https` profile. |
| Penpot logo instead of Freegma's | Hard-reload (Ctrl/Cmd+Shift+R). If it persists: `make branding-check` and see [BRANDING.md](BRANDING.md). |
| Uploads fail for big files | Raise `PENPOT_HTTP_SERVER_MAX_BODY_SIZE` (and your own proxy's limit, if any). |
| "registration disabled" on sign-up | Intended. Create accounts with `make user`. |

## Accounts

| Symptom | Fix |
|---|---|
| Forgot the admin password | `docker compose exec penpot-backend python3 manage.py update-profile -e you@example.com -p 'new-password'` |
| Invited person cannot sign up | Registration is disabled. Create their account with `make user`, then invite them; they accept after logging in. |
| No invitation e-mails | Configure SMTP (`enable-smtp` + `PENPOT_SMTP_*`) or use `enable-log-invitation-tokens` and read the link from `make logs S=penpot-backend`. |

## MCP

See the table in [MCP.md](MCP.md#troubleshooting). The most common one:
**"No Penpot instance connected for user token"**. Open a design file in
Freegma with the same user, keep the tab open, and check that the client
uses the current key.

## Backups / updates

| Symptom | Fix |
|---|---|
| `checksum mismatch` on restore | The backup was modified or is incomplete. Use another one. |
| `another backup is running` | A previous run hangs. Check `ps aux | grep backup.sh`; the lock is `$BACKUP_DIR/.lock`. |
| Update rolled back | The log above the rollback shows the failed step. The pre-update backup was restored automatically. Check Penpot's release notes for breaking changes. |
| Restore on a new machine: everyone logged out, MCP keys invalid | Use `--with-env` / `WITH_ENV=1`, so the original `PENPOT_SECRET_KEY` is used. |

## Getting help

- Freegma issues: <https://github.com/julianhintermann-cmd/Freegma/issues>
- Penpot (application bugs): <https://github.com/penpot/penpot/issues>, <https://community.penpot.app>
