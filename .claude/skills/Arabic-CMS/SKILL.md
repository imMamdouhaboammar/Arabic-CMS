---
name: arabic-cms-conventions
description: Repository conventions for Arabic-CMS, an Arabic RTL EmDash site built with Astro and optional React integration.
---

# Arabic CMS Conventions

Use this skill for implementation, review, testing, and maintenance work in this repository.

## Architecture

- Primary framework: Astro 7 with server rendering
- CMS: EmDash
- React is installed through `@astrojs/react` for optional interactive/admin components; public pages and layouts are Astro
- Runtime output must remain `server`
- Public routes live under `src/pages/`
- Shared site shell is `src/layouts/Base.astro`
- EmDash schema and fresh-site content live in `seed/seed.json`
- Generated collection types live in `emdash-env.d.ts`

## Core Repository Rules

- Keep CMS content routes server-rendered; do not add `getStaticPaths()` for CMS content
- When an EmDash query returns a cache hint, call `Astro.cache.set(cacheHint)`
- `entry.id` is the URL slug; `entry.data.id` is the database ULID used by APIs
- Image fields are objects; render them with `<Image image={...} />` from `emdash/ui`
- Taxonomy names must exactly match `seed/seed.json`
- Do not modify `src/live.config.ts` unless EmDash documentation explicitly requires it
- Do not enable public comments without a moderation plan
- Preserve Arabic RTL behavior and prefer CSS logical properties such as `margin-inline-start`, `padding-inline-start`, and `border-inline-start`
- Treat LTR technical content such as code, commands, and URLs as isolated LTR content

## Import Style

Use relative imports for local source files unless the repository later adds and verifies an explicit TypeScript/Astro path-alias configuration.

Examples:

```ts
import Base from "../../layouts/Base.astro";
import { getReadingTime } from "../../utils/reading-time";
```

Do not introduce absolute local imports that are unsupported by `tsconfig.json`.

## Key Files

- `AGENTS.md`: canonical repository instructions
- `astro.config.mjs`: Astro, EmDash, database, storage, fonts, locale
- `package.json`: scripts and dependencies
- `tsconfig.json`: TypeScript configuration
- `seed/seed.json`: collections, fields, taxonomies, menus, widgets, fresh-site seed
- `src/layouts/Base.astro`: public shell and EmDash page wiring
- `src/styles/theme.css`: theme overrides
- `src/styles/tokens.css`: design-token defaults

## Development Workflow

Before editing:
1. Read `AGENTS.md`
2. Inspect the active route/component and its data flow
3. Verify EmDash APIs against current documentation when behavior is uncertain
4. Preserve server-rendered content behavior and Arabic RTL semantics

For behavior changes:
1. Add or update a focused regression test when practical
2. Implement the smallest change that satisfies the test and repository rules
3. Run `npm test` when available
4. Run `npm run typecheck`
5. Run `npm run build`

## Commit Style

Use concise conventional commits that describe the actual scope.

Common prefixes in this repository include:
- `feat:`
- `fix:`
- `test:`
- `ci:`
- `perf:`
- `a11y:`
- `i18n:`
- `content:`
- `chore:`

## Review Priorities

Review changes in this order:
1. Correctness and data integrity
2. EmDash SSR/cache/id semantics
3. Security and external execution
4. Arabic RTL behavior
5. Accessibility
6. Mobile behavior
7. Public-route performance
8. Visual polish

## External Tools

Do not assume repository-local MCP servers are safe to execute. External MCPs, credentials, and personal integrations belong in user-level configuration after explicit review.

The root `AGENTS.md` remains the source of truth if this skill conflicts with repository instructions.
