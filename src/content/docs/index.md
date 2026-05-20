---
title: "OpenCode Agent 源码学习"
description: "由 Codex agent 生成并维护的 OpenCode 源码学习站。"
sidebar:
  label: "学习首页"
  order: 1
---

<div class="agent-flow">
  <img src="/images/agent-doc-flow.svg" alt="Agent 文档生成流程：Markdown 和数据经过同步脚本生成 Starlight 静态站点" />
</div>

这是一个由 Codex agent 写作和维护的源码学习站点。内容源不是 CMS，也不是手写 HTML，而是稳定的 agent 输入文件：`markdown/` 写章节正文，`data/` 写结构化元数据，构建时同步到 Starlight 并编译成纯静态 HTML。

## 当前进度

- 规划章节：14
- 已完成章节：13
- 待补章节：配置系统
- 最近质量检查：`batch-6`

## 章节矩阵

| # | 章节 | 难度 | 预计阅读 | 状态 |
| --- | --- | --- | --- | --- |
| 01 | [CLI / 启动入口](/chapters/01-cli-startup/) | 入门 | 30 分钟 | 已完成 |
| 02 | [用户输入与会话](/chapters/02-session-message/) | 中等 | 35 分钟 | 已完成 |
| 03 | [Agent 核心循环](/chapters/03-agent-core-loop/) | 较难 | 55 分钟 | 已完成 |
| 04 | [模型 Provider / LLM 调用](/chapters/04-llm-provider/) | 较难 | 50 分钟 | 已完成 |
| 05 | [Tool 调用系统](/chapters/05-tool-calling/) | 中等 | 45 分钟 | 已完成 |
| 06 | [文件读写与代码修改](/chapters/06-file-editing/) | 中等 | 40 分钟 | 已完成 |
| 07 | [Shell / 命令执行](/chapters/07-shell-execution/) | 较难 | 45 分钟 | 已完成 |
| 08 | [LSP / 诊断 / 上下文增强](/chapters/08-lsp-diagnostics/) | 较难 | 45 分钟 | 已完成 |
| 09 | [权限、审批、安全边界](/chapters/09-permission-security/) | 中等 | 40 分钟 | 已完成 |
| 10 | [配置系统](/chapters/10-config-system/) | 较难 | 45 分钟 | 待补 |
| 11 | [UI / TUI / Desktop / IDE 相关](/chapters/11-ui-tui-desktop-ide/) | 中等到较难 | 35 分钟 | 已完成 |
| 12 | [SDK / API / 对外扩展点](/chapters/12-sdk-api-extension/) | 中等 | 40 分钟 | 已完成 |
| 13 | [测试与工程化](/chapters/13-testing-engineering/) | 入门 | 25 分钟 | 已完成 |
| 14 | [从 OpenCode 反推 mini coding agent](/chapters/14-mini-coding-agent/) | 中等 | 60 分钟 | 已完成 |

## 推荐学习路线

### 入门路线

01 CLI / 启动入口 -> 02 用户输入与会话 -> 13 测试与工程化 -> 14 mini agent

### Agent 核心路线

02 用户输入与会话 -> 03 Agent 核心循环 -> 04 模型 Provider / LLM 调用 -> 09 权限、审批、安全边界

### Tool calling 路线

03 Agent 核心循环 -> 05 Tool 调用系统 -> 06 文件读写与代码修改 -> 07 Shell / 命令执行 -> 08 LSP / 诊断

## Agent 入口

以后新增或改写章节时，优先阅读 [Agent 写作规范](/agent/writing-rules/)；需要理解为什么选这个框架时，阅读 [框架选择](/agent/framework-decision/)。
