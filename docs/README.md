# Freegma documentation

Start with the main [README](../README.md) (quick start, configuration, HTTPS, MCP, backups, updates).

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Services, ports, health checks, volumes, Penpot flags and why |
| [BRANDING.md](BRANDING.md) | Changing logo/colours/texts; how the branding proxy works; Penpot internals to re-check after upgrades |
| [MCP.md](MCP.md) | Connecting Claude Code / Claude Desktop, tools, the MCP test, security, local fallback |
| [NAS.md](NAS.md) | UGREEN (UGOS Pro), Synology, QNAP, Unraid notes; running without `make` |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common problems and fixes |
| [obsidian/Freegma.md](obsidian/Freegma.md) | Project note template for an Obsidian vault |

Sources used (verified for Penpot 2.18.3):
[official compose file](https://github.com/penpot/penpot/blob/2.18.3/docker/images/docker-compose.yaml) ·
[configuration guide](https://help.penpot.app/technical-guide/configuration/) ·
[MCP help](https://help.penpot.app/mcp/) ·
[MCP server source](https://github.com/penpot/penpot/tree/2.18.3/mcp) ·
[frontend nginx entrypoint](https://github.com/penpot/penpot/blob/2.18.3/docker/images/files/nginx-entrypoint.sh).
