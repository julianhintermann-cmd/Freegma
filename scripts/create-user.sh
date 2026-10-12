#!/usr/bin/env bash
# Create a Freegma (Penpot) user. Public registration is disabled, so this is
# how accounts are made - for you and for anyone you want to invite.
#
#   scripts/create-user.sh EMAIL "Full Name"            # prompts for the password
#   PASSWORD=... scripts/create-user.sh EMAIL "Full Name" # non-interactive
#
# Uses Penpot's own CLI (backend/scripts/manage.py, talks to the backend PREPL
# on localhost:6063 inside the container; requires flag enable-prepl-server).
. "$(dirname "$0")/lib.sh"
require_env_file

EMAIL="${1:-}"; NAME="${2:-}"
[ -n "$EMAIL" ] || die "usage: $0 EMAIL \"Full Name\""
[ -n "$NAME" ] || NAME="${EMAIL%@*}"

PASSWORD="${PASSWORD:-}"
if [ -z "$PASSWORD" ]; then
    [ -t 0 ] || die "no TTY: set PASSWORD=... for non-interactive use"
    read -r -s -p "Password for $EMAIL (min. 8 chars): " PASSWORD; echo
    read -r -s -p "Repeat password: " PASSWORD2; echo
    [ "$PASSWORD" = "$PASSWORD2" ] || die "passwords do not match"
fi
[ "${#PASSWORD}" -ge 8 ] || die "password must have at least 8 characters"

info "Creating user $EMAIL"
# The password is read from a hidden prompt (not stored in shell history); it is
# visible only inside the backend container while the CLI call runs.
dc exec -T penpot-backend python3 manage.py create-profile \
    --email "$EMAIL" --fullname "$NAME" --password "$PASSWORD"
ok "user created - log in at $(env_get FREEGMA_PUBLIC_URI)"
