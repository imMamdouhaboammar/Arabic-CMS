# ECC for Codex CLI

This supplements the root `AGENTS.md` with repo-local Codex guidance.

## Repo Skill

- Codex skill: `.agents/skills/Arabic-CMS/SKILL.md`
- Claude companion: `.claude/skills/Arabic-CMS/SKILL.md`
- Root `AGENTS.md` is authoritative if instructions conflict

## External Integrations

The repository does not auto-configure third-party MCP servers.

Keep credentials, private services, and reviewed MCP integrations in user-level configuration such as `~/.codex/config.toml`. Do not add unpinned `npx -y` MCP packages to repo-local configuration.

## Multi-Agent Support

- Explorer: read-only evidence gathering
- Reviewer: correctness, security, RTL behavior, and regression review
- Docs researcher: Astro, EmDash, and dependency API verification

Use these roles only when they materially improve the active task.


## Verification

Before merging repository changes, run the checks defined by the repository:

- `npm test`
- `npm run typecheck`
- `npm run build`

Treat a failing check as a blocker unless the failure is proven unrelated and explicitly documented.
