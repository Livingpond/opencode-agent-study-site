---
title: "配置系统"
description: "理解全局、项目、环境变量、远程和内联配置如何合并并影响 agent/provider/tool。"
sidebar:
  label: "10. 配置系统"
  order: 10
---

<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">待补</span></div>
  <div><strong>难度</strong>较难</div>
  <div><strong>预计阅读</strong>45 分钟</div>
  <div><strong>源文件</strong><code>markdown/10-config-system.md</code> 尚未生成</div>
</div>

## Agent 生成档案

- 章节 ID：`10-config-system`
- 章节摘要：理解全局、项目、环境变量、远程和内联配置如何合并并影响 agent/provider/tool。
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

<li><code>packages/opencode/src/config/config.ts</code></li>
<li><code>packages/opencode/src/config/agent.ts</code></li>
<li><code>packages/opencode/src/config/permission.ts</code></li>
<li><code>packages/opencode/src/config/plugin.ts</code></li>
<li><code>packages/opencode/src/project/bootstrap.ts</code></li>

</ul>


## 待生成任务

这一章目前只有章节规划，还没有正文。下一个 agent 应先阅读“主要源码路径”，再按 [Agent 写作规范](/agent/writing-rules/) 生成 `markdown/10-config-system.md`，最后运行 `pnpm run build` 验证。

## 建议写作切入点

1. 配置文件加载顺序：全局、项目、环境变量、远程配置与内联覆盖。
2. 配置如何影响 provider、agent、permission、plugin 与 tool。
3. 用 Java 开发者熟悉的配置中心、Spring Boot property binding、profile 覆盖关系做类比。

