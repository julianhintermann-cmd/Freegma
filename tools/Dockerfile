# syntax=docker/dockerfile:1
#
# freegma-tools: MCP setup, MCP end-to-end test and smoke test.
# Ships Node + Chromium (official Playwright image) so the NAS needs nothing
# but Docker.  Usage:  docker compose run --rm tools <command>
#   commands: smoke | mcp-setup | mcp-test | shell

FROM mcr.microsoft.com/playwright:v1.63.0-noble

ARG FREEGMA_VERSION=dev
LABEL org.opencontainers.image.title="Freegma tools" \
      org.opencontainers.image.description="Freegma smoke test, MCP setup and MCP end-to-end test" \
      org.opencontainers.image.version="${FREEGMA_VERSION}" \
      org.opencontainers.image.licenses="MPL-2.0"

WORKDIR /app
COPY package.json package-lock.json ./
# Behind a TLS-intercepting proxy? Pass its CA as an optional build secret:
#   docker build --secret id=extra_ca,src=/path/ca.crt ...
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src/ ./src/
COPY entrypoint.sh /usr/local/bin/freegma-tools
RUN chmod +x /usr/local/bin/freegma-tools

ENV NODE_ENV=production \
    FREEGMA_TEST_OUTPUT=/output

ENTRYPOINT ["freegma-tools"]
CMD ["help"]
