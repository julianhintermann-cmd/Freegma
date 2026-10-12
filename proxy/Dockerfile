# syntax=docker/dockerfile:1
#
# Freegma branding proxy
# ----------------------
# A small nginx that sits in front of the official, unmodified
# penpotapp/frontend image and injects the Freegma branding (logo, favicon,
# colours, texts, attribution) into the HTML/JS it serves.
#
# Build context is the repository root:
#   docker build -f proxy/Dockerfile -t freegma .

ARG NGINX_VERSION=1.30.5

FROM nginx:${NGINX_VERSION}-alpine

ARG FREEGMA_VERSION=dev
ARG PENPOT_VERSION=2.18.3
ARG VCS_REF=unknown
ARG SOURCE_URL=https://github.com/julianhintermann-cmd/freegma

LABEL org.opencontainers.image.title="Freegma" \
      org.opencontainers.image.description="Self-hosted, branded Penpot with built-in MCP server - branding proxy" \
      org.opencontainers.image.version="${FREEGMA_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.url="${SOURCE_URL}" \
      org.opencontainers.image.licenses="MPL-2.0" \
      io.freegma.penpot-version="${PENPOT_VERSION}"

ENV FREEGMA_VERSION=${FREEGMA_VERSION} \
    FREEGMA_PENPOT_VERSION=${PENPOT_VERSION} \
    FREEGMA_UPSTREAM=http://penpot-frontend:8080 \
    FREEGMA_BRAND_NAME=Freegma \
    FREEGMA_ACCENT_DARK= \
    FREEGMA_ACCENT_LIGHT= \
    FREEGMA_REBRAND_TEXT=true \
    FREEGMA_SHOW_ATTRIBUTION=true \
    FREEGMA_SOURCE_URL=${SOURCE_URL} \
    FREEGMA_MAX_BODY_SIZE=367001600 \
    FREEGMA_BRANDING_DIR=/etc/freegma/branding \
    NGINX_ENVSUBST_FILTER=^FREEGMA_

# Default branding (overridable by mounting a directory at /etc/freegma/branding)
COPY branding/ /usr/share/freegma/branding-default/
# Runtime assets (JS that applies the branding inside the Penpot SPA)
COPY proxy/www/ /usr/share/freegma/www-static/
# nginx config template (rendered by the official image's envsubst step)
COPY proxy/conf/default.conf.template /etc/nginx/templates/default.conf.template
# Generates /var/lib/freegma/* from branding + env before nginx starts
COPY proxy/scripts/40-freegma-branding.sh /docker-entrypoint.d/40-freegma-branding.sh
# License + attribution travel with the image
COPY LICENSE NOTICE.md /usr/share/freegma/

RUN chmod +x /docker-entrypoint.d/40-freegma-branding.sh \
 && rm -f /etc/nginx/conf.d/default.conf \
 && mkdir -p /var/lib/freegma/www /etc/nginx/freegma

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/freegma/healthz || exit 1
