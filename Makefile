# Freegma - make targets. Run `make help` for the list.

SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help
COMPOSE := docker compose
TOOLS := $(COMPOSE) run --rm tools

# Prompt for a Freegma login (used by smoke / mcp-* targets) unless given:
#   make mcp-test EMAIL=you@example.com PASSWORD=...
define ask_login
	email="$(EMAIL)"; pass="$(PASSWORD)"; \
	[ -n "$$email" ] || email="$$(grep -E '^FREEGMA_MCP_USER_EMAIL=' .env | cut -d= -f2-)"; \
	[ -n "$$email" ] || read -r -p "Freegma e-mail: " email; \
	[ -n "$$pass" ] || { read -r -s -p "Password for $$email: " pass; echo; }; \
	export FREEGMA_TEST_EMAIL="$$email" FREEGMA_TEST_PASSWORD="$$pass";
endef

.PHONY: help
help: ## Show this help
	@echo "Freegma - self-hosted, branded Penpot with MCP"
	@echo
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "} {printf "  \033[1m%-15s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "Examples:"
	@echo "  make init DOMAIN=freegma.home.arpa"
	@echo "  make admin EMAIL=me@example.com NAME='Me'"
	@echo "  make update VERSION=2.19.0"

# ---- setup -------------------------------------------------------------------
.PHONY: init
init: ## Create .env with fresh secrets (DOMAIN=..., HTTP_ONLY=1 for no HTTPS)
	@./scripts/init.sh $(if $(DOMAIN),--domain $(DOMAIN)) $(if $(HTTPS_PORT),--https-port $(HTTPS_PORT)) $(if $(HTTP_ONLY),--http-only)

.PHONY: admin user
admin: user ## Create the first account (EMAIL=... NAME=...)
user: ## Create a user account (EMAIL=... NAME=...); registration is disabled
	@[ -n "$(EMAIL)" ] || { echo "usage: make user EMAIL=you@example.com NAME='Full Name'"; exit 2; }
	@./scripts/create-user.sh "$(EMAIL)" "$(NAME)"

# ---- lifecycle ---------------------------------------------------------------
.PHONY: up
up: ## Start everything and wait until all containers are healthy
	@$(COMPOSE) up -d --remove-orphans
	@./scripts/healthcheck.sh --wait 420

.PHONY: down
down: ## Stop and remove containers (data volumes are kept)
	$(COMPOSE) down

.PHONY: restart
restart: ## Restart all services
	$(COMPOSE) restart

.PHONY: ps
ps: ## Container status
	$(COMPOSE) ps

.PHONY: logs
logs: ## Follow logs (S=service to filter, e.g. S=penpot-backend)
	$(COMPOSE) logs -f --tail=200 $(S)

.PHONY: pull
pull: ## Pull the pinned images
	$(COMPOSE) pull --ignore-pull-failures

.PHONY: build
build: ## Build the Freegma and tools images locally
	$(COMPOSE) build freegma
	$(COMPOSE) --profile tools build tools

.PHONY: branding
branding: ## Apply changes in ./branding (restarts only the branding proxy)
	$(COMPOSE) restart freegma
	@$(COMPOSE) logs --tail=5 freegma | grep 'freegma:' || true

# ---- checks ------------------------------------------------------------------
.PHONY: health
health: ## Health report (JSON=1 for machine-readable)
	@./scripts/healthcheck.sh $(if $(JSON),--json)

.PHONY: smoke
smoke: ## Smoke test incl. login + browser check (EMAIL=/PASSWORD= optional)
	@$(ask_login) $(TOOLS) smoke

.PHONY: branding-check
branding-check: ## Verify the branding still applies (run after Penpot upgrades)
	@FREEGMA_TEST_EMAIL= FREEGMA_TEST_PASSWORD= $(TOOLS) smoke

# ---- MCP ---------------------------------------------------------------------
.PHONY: mcp-token
mcp-token: ## Enable MCP for a user + print Claude configs (ROTATE=1 = new key)
	@$(ask_login) FREEGMA_MCP_ROTATE=$(if $(ROTATE),1,0) $(TOOLS) mcp-setup

.PHONY: mcp-test
mcp-test: ## End-to-end MCP test in project "MCP Sandbox" (output: tests/output/)
	@mkdir -p tests/output
	@$(ask_login) $(TOOLS) mcp-test

.PHONY: ca-cert
ca-cert: ## Export Caddy's internal root CA to ./freegma-root-ca.crt
	@$(COMPOSE) cp caddy:/data/caddy/pki/authorities/local/root.crt ./freegma-root-ca.crt
	@echo "Wrote ./freegma-root-ca.crt - import it as a trusted root CA (see README, 'HTTPS')."

# ---- operations --------------------------------------------------------------
.PHONY: backup
backup: ## Back up database, assets and config (rotation 7 daily / 4 weekly)
	@./scripts/backup.sh

.PHONY: restore
restore: ## Restore a backup (BACKUP=backups/daily/freegma-..., WITH_ENV=1 on a new host)
	@[ -n "$(BACKUP)" ] || { echo "usage: make restore BACKUP=backups/daily/freegma-YYYYmmdd-HHMMSS"; ls -1d backups/*/freegma-* 2>/dev/null | tail -n 10; exit 2; }
	@./scripts/restore.sh "$(BACKUP)" $(if $(WITH_ENV),--with-env) $(if $(YES),--yes)

.PHONY: update
update: ## Backup + upgrade Penpot (VERSION=x.y.z) with smoke test & auto-rollback
	@./scripts/update.sh $(VERSION) $(if $(FREEGMA),--freegma $(FREEGMA)) $(if $(YES),--yes)

.PHONY: cron
cron: ## Print the crontab line for daily backups
	@echo "15 3 * * * cd $(CURDIR) && mkdir -p backups && ./scripts/backup.sh >> backups/backup.log 2>&1"
