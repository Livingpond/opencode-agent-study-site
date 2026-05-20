# OpenCode Agent Study Site

Agent-native documentation site for studying the OpenCode source code.

## Framework

- Astro + Starlight
- Static HTML output in `dist`
- Pagefind search generated at build time
- Cloudflare Pages publish directory: `dist`
- `dist` is committed as a generated artifact for compatibility with the current Cloudflare Pages project.

## Agent Source Files

- `markdown/*.md` contains chapter bodies.
- `data/chapters.json` contains chapter metadata and source paths.
- `data/progress.json` tracks generation progress.
- `data/source-map.json` maps chapters to OpenCode source evidence.
- `AGENTS.md` is the writing contract for future Codex agents.

Generated files under `src/content/docs/chapters/` and `dist/` are synced from `markdown/` and `data/`.

## Commands

```bash
pnpm install
pnpm run build
pnpm run dev
pnpm run validate:sources
```

Cloudflare Pages should use:

```bash
pnpm install --frozen-lockfile && pnpm run build
```

and publish:

```text
dist
```
