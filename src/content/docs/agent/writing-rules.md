---
title: "Agent 写作规范"
description: "Codex agent 生成和维护源码学习章节时必须遵守的规则。"
sidebar:
  label: "Agent 写作规范"
  order: 2
---

## 核心原则

这个站点的作者默认是 Codex agent。规范的目标是让不同 agent 在不同时间写出的章节仍然像同一个系统：结构一致、证据可靠、可构建、可发布。

## 单一事实来源

| 文件 | 用途 | agent 是否直接编辑 |
| --- | --- | --- |
| `markdown/*.md` | 章节正文 | 是 |
| `data/chapters.json` | 章节 ID、标题、难度、状态、源码路径 | 是 |
| `data/progress.json` | 生成批次与完成状态 | 是 |
| `data/source-map.json` | 章节到源码的细粒度映射 | 是 |
| `src/content/docs/chapters/*.md` | Starlight 编译输入 | 不直接编辑 |
| `public/data/*`、`public/markdown/*` | 构建时公开副本 | 不直接编辑 |

## 写作流程

1. 从 `data/chapters.json` 找到目标章节。
2. 阅读该章节的 `sourceFiles`，必要时补充 `data/source-map.json`。
3. 在 `markdown/<chapter-id>.md` 写正文。
4. 若章节从 `pending` 变为 `complete`，同步更新 `data/chapters.json` 和 `data/progress.json`。
5. 运行 `pnpm run build`。
6. 需要校验本机 OpenCode 源码路径时，运行 `pnpm run validate:sources`。

## 章节结构

每个完成章节必须以 H1 开头，并且前两节必须存在：

```md
# <章节标题>

## 0. 本章学习目标

## 1. 一句话讲明白
```

推荐继续使用这些章节：

- `2. 它在 OpenCode agent 中的位置`
- `3. 生活类比`
- `4. Java 开发者类比`
- `5. 最小源码路径`
- 后续源码深挖章节
- 最后一节复盘

## 证据要求

- 代码行为必须来自真实源码阅读。
- 关键判断要带文件路径，最好带行号。
- 不确定时写“不确定”或“需要继续验证”，不要补剧情。
- 类比只能辅助理解，不能替代源码事实。
- 旧章节里的路径、函数名、类型名要保持原样，除非源码已验证发生变化。

## 风格要求

- 面向中文读者写作。
- 假设读者是 Java 开发者，正在学习 TypeScript agent 项目。
- 先给架构位置，再讲具体实现。
- 避免为了漂亮而牺牲准确性。
- Markdown 保持框架无关，不在 `markdown/*.md` 使用 Starlight-only 组件。

## 质量门禁

提交前至少运行：

```bash
pnpm run build
```

本地源码存在时可以额外运行：

```bash
pnpm run validate:sources
```

构建成功代表：

- 章节 JSON 基本 schema 合法；
- 完成章节有对应 Markdown；
- 完成章节包含最低限度标题结构；
- Starlight 内容能编译成静态 HTML；
- 搜索索引能随站点一起生成。
