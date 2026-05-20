---
title: "框架选择"
description: "为什么这个 agent-native 文档系统选择 Astro Starlight。"
sidebar:
  label: "框架选择"
  order: 1
---

## 结论

这个项目选择 **Astro + Starlight**。

它不是为了让人类获得更复杂的编辑 UI，而是为了让 agent 获得一个稳定、可校验、可编译的写作目标：

- agent 写 `markdown/*.md` 和 `data/*.json`；
- 同步脚本生成 `src/content/docs/*`；
- Starlight 负责导航、搜索、深色模式、代码高亮、移动端布局和静态 HTML 输出；
- Cloudflare Pages 只需要执行 `pnpm install --frozen-lockfile && pnpm run build` 并发布 `dist`。

## 为什么不是继续手写 HTML

手写 HTML 的问题不在页面能不能打开，而在 agent 长期维护时缺少边界：

- 首页、章节 HTML、Markdown、JSON 很容易漂移；
- 新增章节时需要复制大量结构；
- 导航、搜索、移动端、代码块主题等都要自己维护；
- 质量检查难以变成稳定命令。

Starlight 把这些展示细节交给框架，让 agent 只维护内容源和结构化元数据。

## 为什么适合 Agent

Starlight 的内容模型天然接近 agent 的工作方式：

- 文件系统就是信息架构，`src/content/docs/` 下的路径决定路由；
- Markdown/MDX 是纯文本，agent 易读、易 diff、易生成；
- frontmatter schema 会在构建时校验页面元数据；
- Pagefind 搜索在构建后生成，不需要后端服务；
- Astro 的静态输出模式会在 build 阶段生成 HTML。

## 依据

- Starlight 官方说明它提供文档站所需的导航、搜索、i18n、SEO、排版、代码高亮和深色模式，并支持 Markdown、Markdoc、MDX 以及 frontmatter 校验：[Starlight](https://starlight.astro.build/)
- Astro 官方文档说明默认 `output: 'static'` 会在构建时为页面路由创建 HTML：[Astro rendering modes](https://docs.astro.build/en/basics/rendering-modes/)
- Starlight 配置文档说明 `docsLoader()` 从 `src/content/docs/` 加载 Markdown/MDX，`docsSchema()` 解析 frontmatter，Pagefind 是默认搜索提供者：[Starlight configuration](https://starlight.astro.build/reference/configuration/)

## 当前项目约定

这个仓库不把 `src/content/docs/chapters/*.md` 作为人工编辑入口。它们由 `scripts/sync-starlight-content.mjs` 从 `markdown/` 与 `data/` 生成。

对 agent 来说，真正的输入面是：

```text
markdown/
data/chapters.json
data/progress.json
data/source-map.json
AGENTS.md
```

构建入口是：

```bash
pnpm run build
```
