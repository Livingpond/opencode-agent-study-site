# Agent Writing Contract

This repository is an agent-native documentation system for the OpenCode source study site. Humans may read the files, but Codex agents are the primary writers.

## Architecture

- Source of truth for chapter body text: `markdown/*.md`.
- Source of truth for chapter metadata: `data/chapters.json`.
- Source of truth for progress: `data/progress.json`.
- Optional evidence map: `data/source-map.json`.
- Generated Starlight pages: `src/content/docs/index.md` and `src/content/docs/chapters/*.md`.
- Static public copies: `public/data/*` and `public/markdown/*`.
- Compiled publish artifact: `dist/`.

Do not hand-edit generated chapter pages under `src/content/docs/chapters/` or files under `dist/`. Edit `markdown/` and `data/`, then run `pnpm run build`.

## Required Workflow

1. Read `data/chapters.json` for the target chapter record.
2. Read the listed `sourceFiles` in the OpenCode checkout before writing claims.
3. Write or update `markdown/<chapter-id>.md` using the section contract below.
4. Update `data/progress.json` if chapter status changes.
5. Run `pnpm run build`.
6. If checking local source references is needed, run `pnpm run validate:sources`.
7. Commit source files, generated Starlight content, `dist/`, and lockfile changes together.

## Chapter Markdown Contract

Each complete chapter must start with exactly one H1 matching the chapter title and include these early sections:

```md
# <chapter title>

## 0. 本章学习目标

## 1. 一句话讲明白
```

Recommended chapter structure:

- `0. 本章学习目标`
- `1. 一句话讲明白`
- `2. 它在 OpenCode agent 中的位置`
- `3. 生活类比`
- `4. Java 开发者类比`
- `5. 最小源码路径`
- Follow-up deep-dive sections grounded in source files
- `最后复盘` or equivalent closing summary

## Evidence Rules

- Prefer exact source paths and line references when the claim depends on code.
- Preserve OpenCode identifiers exactly, including file names, function names, type names, and command names.
- If a source path is inferred from architecture rather than directly inspected, say so in the chapter body.
- Do not invent behavior to make a teaching narrative smoother.
- For Java analogies, clearly separate the analogy from the TypeScript/Effect behavior.
- When a line reference is important for the learner, add a render-time source card with an HTML comment directive:
  `<!-- source-ref path="packages/opencode/src/index.ts" lines="58-110" title="What this code does" note="Optional short reading hint." -->`.
  The sync script expands it into a collapsible code block using the local OpenCode checkout.

## Style Rules

- Write in Chinese for learner-facing content.
- Assume the learner is a Java developer refreshing TypeScript and learning agent architecture.
- Explain structure before implementation detail.
- Use short code snippets only when they clarify control flow, type shape, or API boundaries.
- Keep generated Markdown portable. Avoid framework-specific components in `markdown/*.md`.

## Commands

```bash
pnpm run validate:agent-docs
pnpm run sync
pnpm run build
pnpm run dev
```

Cloudflare Pages should build with:

```bash
pnpm install --frozen-lockfile && pnpm run build
```

The published output directory is:

```text
dist
```

`dist/` is tracked intentionally so Cloudflare Pages projects with legacy "no build command" settings can still deploy the compiled site.
