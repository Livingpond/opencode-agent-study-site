---
title: "测试与工程化"
description: "理解 monorepo 构建、类型检查、测试任务和开发规范如何支撑大型 agent 项目。"
sidebar:
  label: "13. 测试与工程化"
  order: 13
---

<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">已完成</span></div>
  <div><strong>难度</strong>入门</div>
  <div><strong>预计阅读</strong>25 分钟</div>
  <div><strong>源文件</strong><a href="/markdown/13-testing-engineering.md"><code>markdown/13-testing-engineering.md</code></a></div>
</div>

## Agent 生成档案

- 章节 ID：`13-testing-engineering`
- 章节摘要：理解 monorepo 构建、类型检查、测试任务和开发规范如何支撑大型 agent 项目。
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

<li><code>package.json</code></li>
<li><code>turbo.json</code></li>
<li><code>tsconfig.json</code></li>
<li><code>AGENTS.md</code></li>
<li><code>packages/opencode/package.json</code></li>
<li><code>packages/sdk/js/package.json</code></li>

</ul>


## 0. 本章学习目标

学完这一章，你应该能回答 4 个问题：

1. OpenCode 这个 monorepo 是如何组织包、脚本和依赖版本的。
2. 为什么根目录故意不让你直接跑 `bun test`。
3. 核心 runtime、Web app、UI package、SDK package 各自怎样做 typecheck、test、build。
4. 如果你自己写 mini coding agent，最小但靠谱的工程化脚手架应该长什么样。

本章不是“怎么配置 Bun/Turbo”的普通教程，而是基于 OpenCode 当前源码的工程化阅读笔记。

## 1. 一句话讲明白

OpenCode 的工程化不是一个单体 `npm test`，而是一个 Bun workspace + Turbo task graph：根目录负责统一包、依赖版本和跨包任务，具体 package 负责自己的 typecheck、test、build。

来源：`package.json:7-21`、`package.json:23-30`、`turbo.json:5-43`。

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">package.json</span>
    <span class="source-ref-path"><code>package.json:7-21</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">  &quot;packageManager&quot;: &quot;bun@1.3.14&quot;,</span></span>
<span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">  &quot;scripts&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">    &quot;dev&quot;: &quot;bun run --cwd packages/opencode --conditions=browser src/index.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">    &quot;dev:desktop&quot;: &quot;bun --cwd packages/desktop dev&quot;,</span></span>
<span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">    &quot;dev:web&quot;: &quot;bun --cwd packages/app dev&quot;,</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">    &quot;dev:console&quot;: &quot;ulimit -n 10240 2&gt;/dev/null; bun run --cwd packages/console/app dev&quot;,</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">    &quot;dev:storybook&quot;: &quot;bun --cwd packages/storybook storybook&quot;,</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">    &quot;lint&quot;: &quot;oxlint&quot;,</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    &quot;typecheck&quot;: &quot;bun turbo typecheck&quot;,</span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    &quot;upgrade-opentui&quot;: &quot;bun run script/upgrade-opentui.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">    &quot;postinstall&quot;: &quot;bun run --cwd packages/opencode fix-node-pty&quot;,</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">    &quot;prepare&quot;: &quot;husky&quot;,</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    &quot;random&quot;: &quot;echo 'Random script'&quot;,</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    &quot;hello&quot;: &quot;echo 'Hello World!'&quot;,</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">    &quot;test&quot;: &quot;echo 'do not run tests from root' &amp;&amp; exit 1&quot;</span></span></code></pre>
</details>

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">package.json</span>
    <span class="source-ref-path"><code>package.json:23-30</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  &quot;workspaces&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    &quot;packages&quot;: [</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">      &quot;packages/*&quot;,</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">      &quot;packages/console/*&quot;,</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">      &quot;packages/sdk/js&quot;,</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">      &quot;packages/slack&quot;</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">    ],</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">    &quot;catalog&quot;: {</span></span></code></pre>
</details>

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">turbo.json</span>
    <span class="source-ref-path"><code>turbo.json:5-43</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">5</span><span class="source-line-text">  &quot;tasks&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">6</span><span class="source-line-text">    &quot;typecheck&quot;: {},</span></span>
<span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">    &quot;build&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">      &quot;dependsOn&quot;: [],</span></span>
<span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">      &quot;outputs&quot;: [&quot;dist/**&quot;]</span></span>
<span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">    &quot;opencode#test&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">      &quot;outputs&quot;: [],</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">      &quot;passThroughEnv&quot;: [&quot;*&quot;]</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    &quot;test:ci&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">      &quot;outputs&quot;: [&quot;.artifacts/unit/junit.xml&quot;],</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">      &quot;passThroughEnv&quot;: [&quot;*&quot;]</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    &quot;opencode#test:ci&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">      &quot;outputs&quot;: [&quot;.artifacts/unit/junit.xml&quot;],</span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">      &quot;passThroughEnv&quot;: [&quot;*&quot;]</span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">    &quot;@opencode-ai/app#test&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">      &quot;outputs&quot;: []</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">    &quot;@opencode-ai/app#test:ci&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      &quot;outputs&quot;: [&quot;.artifacts/unit/junit.xml&quot;],</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">      &quot;passThroughEnv&quot;: [&quot;*&quot;]</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">    &quot;@opencode-ai/ui#test&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">      &quot;outputs&quot;: []</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">    &quot;@opencode-ai/ui#test:ci&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">      &quot;outputs&quot;: [&quot;.artifacts/unit/junit.xml&quot;],</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">      &quot;passThroughEnv&quot;: [&quot;*&quot;]</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  }</span></span></code></pre>
</details>


## 2. 它在 OpenCode agent 中的位置

工程化不是 agent loop 的一部分，但它决定了 agent 项目能不能长期演进。

对 OpenCode 来说：

- CLI/runtime 在 `packages/opencode`，它有自己的 bin、dev、test、build。来源：`packages/opencode/package.json:8-23`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/package.json</span>
      <span class="source-ref-path"><code>packages/opencode/package.json:8-23</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">  &quot;scripts&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">    &quot;typecheck&quot;: &quot;tsgo --noEmit&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">    &quot;test&quot;: &quot;bun test --timeout 30000&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">    &quot;test:ci&quot;: &quot;mkdir -p .artifacts/unit &amp;&amp; bun test --timeout 30000 --reporter=junit --reporter-outfile=.artifacts/unit/junit.xml&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">    &quot;test:httpapi&quot;: &quot;bun run script/httpapi-exercise.ts --mode coverage --fail-on-missing --fail-on-skip &amp;&amp; bun run script/httpapi-exercise.ts --mode auth --fail-on-missing --fail-on-skip &amp;&amp; bun run script/httpapi-exercise.ts --mode effect --fail-on-missing --fail-on-skip&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">    &quot;bench:test&quot;: &quot;bun run script/bench-test-suite.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">    &quot;profile:test&quot;: &quot;bun run script/profile-test-files.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    &quot;build&quot;: &quot;bun run script/build.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    &quot;fix-node-pty&quot;: &quot;bun run script/fix-node-pty.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">    &quot;dev&quot;: &quot;bun run --conditions=browser ./src/index.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">    &quot;dev:temporary&quot;: &quot;bun run --conditions=browser ./src/temporary.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    &quot;db&quot;: &quot;bun drizzle-kit&quot;</span></span>
  <span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">  },</span></span>
  <span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">  &quot;bin&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">    &quot;opencode&quot;: &quot;./bin/opencode&quot;</span></span>
  <span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  },</span></span></code></pre>
  </details>

- Web app 在 `packages/app`，它有 unit test、E2E test、Vite build。来源：`packages/app/package.json:11-24`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/app/package.json</span>
      <span class="source-ref-path"><code>packages/app/package.json:11-24</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">  &quot;scripts&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">    &quot;typecheck&quot;: &quot;tsgo -b&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">    &quot;start&quot;: &quot;vite&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">    &quot;dev&quot;: &quot;vite&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    &quot;build&quot;: &quot;vite build&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    &quot;serve&quot;: &quot;vite preview&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">    &quot;test&quot;: &quot;bun run test:unit&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">    &quot;test:ci&quot;: &quot;mkdir -p .artifacts/unit &amp;&amp; bun test --preload ./happydom.ts ./src --reporter=junit --reporter-outfile=.artifacts/unit/junit.xml&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    &quot;test:unit&quot;: &quot;bun test --preload ./happydom.ts ./src&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    &quot;test:unit:watch&quot;: &quot;bun test --watch --preload ./happydom.ts ./src&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">    &quot;test:e2e&quot;: &quot;playwright test&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">    &quot;test:e2e:local&quot;: &quot;playwright test&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">    &quot;test:e2e:ui&quot;: &quot;playwright test --ui&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    &quot;test:e2e:report&quot;: &quot;playwright show-report e2e/playwright-report&quot;</span></span></code></pre>
  </details>

- UI 组件在 `packages/ui`，它暴露组件、theme、hooks、样式和单测脚本。来源：`packages/ui/package.json:6-33`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/ui/package.json</span>
      <span class="source-ref-path"><code>packages/ui/package.json:6-33</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">6</span><span class="source-line-text">  &quot;exports&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">    &quot;./package.json&quot;: &quot;./package.json&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">    &quot;./*&quot;: &quot;./src/components/*.tsx&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">    &quot;./session-diff&quot;: &quot;./src/components/session-diff.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">    &quot;./i18n/*&quot;: &quot;./src/i18n/*.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">    &quot;./pierre&quot;: &quot;./src/pierre/index.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">    &quot;./pierre/*&quot;: &quot;./src/pierre/*.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">    &quot;./hooks&quot;: &quot;./src/hooks/index.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">    &quot;./context&quot;: &quot;./src/context/index.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    &quot;./context/*&quot;: &quot;./src/context/*.tsx&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    &quot;./styles&quot;: &quot;./src/styles/index.css&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">    &quot;./styles/tailwind&quot;: &quot;./src/styles/tailwind/index.css&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">    &quot;./theme&quot;: &quot;./src/theme/index.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    &quot;./theme/*&quot;: &quot;./src/theme/*.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    &quot;./theme/context&quot;: &quot;./src/theme/context.tsx&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">    &quot;./icons/provider&quot;: &quot;./src/components/provider-icons/types.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">    &quot;./icons/file-type&quot;: &quot;./src/components/file-icons/types.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">    &quot;./icons/app&quot;: &quot;./src/components/app-icons/types.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    &quot;./fonts/*&quot;: &quot;./src/assets/fonts/*&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">    &quot;./audio/*&quot;: &quot;./src/assets/audio/*&quot;</span></span>
  <span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">  },</span></span>
  <span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">  &quot;scripts&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">    &quot;typecheck&quot;: &quot;tsgo --noEmit&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">    &quot;test&quot;: &quot;bun test src&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">    &quot;test:ci&quot;: &quot;mkdir -p .artifacts/unit &amp;&amp; bun test src --reporter=junit --reporter-outfile=.artifacts/unit/junit.xml&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">    &quot;dev&quot;: &quot;vite&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">    &quot;generate:tailwind&quot;: &quot;bun run script/tailwind.ts&quot;</span></span>
  <span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">  },</span></span></code></pre>
  </details>

- JS SDK 在 `packages/sdk/js`，它有 generated client 和 build 脚本。来源：`packages/sdk/js/package.json:7-19`、`packages/sdk/js/script/build.ts:14-47`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/sdk/js/package.json</span>
      <span class="source-ref-path"><code>packages/sdk/js/package.json:7-19</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">  &quot;scripts&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">    &quot;typecheck&quot;: &quot;tsgo --noEmit&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">    &quot;build&quot;: &quot;bun ./script/build.ts&quot;</span></span>
  <span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">  },</span></span>
  <span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">  &quot;exports&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">    &quot;.&quot;: &quot;./src/index.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">    &quot;./client&quot;: &quot;./src/client.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">    &quot;./server&quot;: &quot;./src/server.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    &quot;./v2&quot;: &quot;./src/v2/index.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    &quot;./v2/client&quot;: &quot;./src/v2/client.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">    &quot;./v2/gen/client&quot;: &quot;./src/v2/gen/client/index.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">    &quot;./v2/server&quot;: &quot;./src/v2/server.ts&quot;</span></span>
  <span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">  },</span></span></code></pre>
  </details>

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/sdk/js/script/build.ts</span>
      <span class="source-ref-path"><code>packages/sdk/js/script/build.ts:14-47</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">await $`bun dev generate &gt; ${dir}/openapi.json`.cwd(opencode)</span></span>
  <span class="source-line"><span class="source-line-number">15</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">await createClient({</span></span>
  <span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  input: &quot;./openapi.json&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">  output: {</span></span>
  <span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    path: &quot;./src/v2/gen&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    tsConfigPath: path.join(dir, &quot;tsconfig.json&quot;),</span></span>
  <span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">    clean: true,</span></span>
  <span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">  },</span></span>
  <span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  plugins: [</span></span>
  <span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    {</span></span>
  <span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">      name: &quot;@hey-api/typescript&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">      exportFromIndex: false,</span></span>
  <span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">    {</span></span>
  <span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">      name: &quot;@hey-api/sdk&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">      instance: &quot;OpencodeClient&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      exportFromIndex: false,</span></span>
  <span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">      auth: false,</span></span>
  <span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">      paramsStructure: &quot;flat&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">    {</span></span>
  <span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">      name: &quot;@hey-api/client-fetch&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">      exportFromIndex: false,</span></span>
  <span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">      baseUrl: &quot;http://localhost:4096&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  ],</span></span>
  <span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">})</span></span>
  <span class="source-line"><span class="source-line-number">42</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">await $`bun prettier --write src/gen`</span></span>
  <span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">await $`bun prettier --write src/v2`</span></span>
  <span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">await $`rm -rf dist`</span></span>
  <span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">await $`bun tsc`</span></span>
  <span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">await $`rm openapi.json`</span></span></code></pre>
  </details>

- 根目录通过 workspace catalog 固定共享依赖版本。来源：`package.json:23-87`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">package.json</span>
      <span class="source-ref-path"><code>package.json:23-87</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  &quot;workspaces&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    &quot;packages&quot;: [</span></span>
  <span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">      &quot;packages/*&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">      &quot;packages/console/*&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">      &quot;packages/sdk/js&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">      &quot;packages/slack&quot;</span></span>
  <span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">    ],</span></span>
  <span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">    &quot;catalog&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      &quot;@effect/opentelemetry&quot;: &quot;4.0.0-beta.65&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">      &quot;@effect/platform-node&quot;: &quot;4.0.0-beta.65&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">      &quot;@npmcli/arborist&quot;: &quot;9.4.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">      &quot;@types/bun&quot;: &quot;1.3.13&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">      &quot;@types/cross-spawn&quot;: &quot;6.0.6&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">      &quot;@octokit/rest&quot;: &quot;22.0.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">      &quot;@hono/zod-validator&quot;: &quot;0.4.2&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">      &quot;@opentui/core&quot;: &quot;0.2.14&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">      &quot;@opentui/keymap&quot;: &quot;0.2.14&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">      &quot;@opentui/solid&quot;: &quot;0.2.14&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">      &quot;ulid&quot;: &quot;3.0.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">      &quot;@kobalte/core&quot;: &quot;0.13.11&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">      &quot;@types/luxon&quot;: &quot;3.7.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">      &quot;@types/node&quot;: &quot;24.12.2&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">      &quot;@types/semver&quot;: &quot;7.7.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">      &quot;@tsconfig/node22&quot;: &quot;22.0.2&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">      &quot;@tsconfig/bun&quot;: &quot;1.0.9&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">      &quot;@cloudflare/workers-types&quot;: &quot;4.20251008.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">      &quot;@openauthjs/openauth&quot;: &quot;0.0.0-20250322224806&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">      &quot;@pierre/diffs&quot;: &quot;1.1.0-beta.18&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">      &quot;opentui-spinner&quot;: &quot;0.0.6&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">      &quot;@solid-primitives/storage&quot;: &quot;4.3.3&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">      &quot;@tailwindcss/vite&quot;: &quot;4.1.11&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">      &quot;diff&quot;: &quot;8.0.2&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">      &quot;dompurify&quot;: &quot;3.3.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">      &quot;drizzle-kit&quot;: &quot;1.0.0-beta.19-d95b7a4&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">      &quot;drizzle-orm&quot;: &quot;1.0.0-beta.19-d95b7a4&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">      &quot;effect&quot;: &quot;4.0.0-beta.65&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">      &quot;ai&quot;: &quot;6.0.168&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">      &quot;cross-spawn&quot;: &quot;7.0.6&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">      &quot;hono&quot;: &quot;4.10.7&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">      &quot;hono-openapi&quot;: &quot;1.1.2&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">      &quot;fuzzysort&quot;: &quot;3.1.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">      &quot;luxon&quot;: &quot;3.6.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      &quot;marked&quot;: &quot;17.0.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">      &quot;marked-shiki&quot;: &quot;1.2.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">      &quot;remend&quot;: &quot;1.3.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">      &quot;@playwright/test&quot;: &quot;1.59.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">      &quot;semver&quot;: &quot;7.7.4&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">      &quot;typescript&quot;: &quot;5.8.2&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">      &quot;@typescript/native-preview&quot;: &quot;7.0.0-dev.20251207.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">      &quot;zod&quot;: &quot;4.1.8&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">      &quot;remeda&quot;: &quot;2.26.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">      &quot;shiki&quot;: &quot;3.20.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">      &quot;solid-list&quot;: &quot;0.3.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">      &quot;tailwindcss&quot;: &quot;4.1.11&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">      &quot;virtua&quot;: &quot;0.49.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">      &quot;vite&quot;: &quot;7.1.4&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">      &quot;@solidjs/meta&quot;: &quot;0.29.4&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">      &quot;@solidjs/router&quot;: &quot;0.15.4&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">      &quot;@solidjs/start&quot;: &quot;https://pkg.pr.new/@solidjs/start@dfb2020&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">      &quot;@sentry/solid&quot;: &quot;10.36.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">      &quot;@sentry/vite-plugin&quot;: &quot;4.6.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">      &quot;solid-js&quot;: &quot;1.9.10&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">      &quot;vite-plugin-solid&quot;: &quot;2.11.10&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">      &quot;@lydell/node-pty&quot;: &quot;1.2.0-beta.10&quot;</span></span>
  <span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">    }</span></span></code></pre>
  </details>


Java 开发者可以把它理解成 Gradle multi-project：根项目管理版本和 task graph，子项目分别声明自己的 task。

## 3. 生活类比

一个 coding agent 项目像一座大型实验室：

- 根目录是实验室行政办公室：规定有哪些实验组、采购哪些统一版本的设备。
- `packages/opencode` 是核心机器人实验组：做 agent runtime。
- `packages/app` 是操作台实验组：做可视化界面。
- `packages/sdk/js` 是外部接口组：给别人发工具箱。
- `turbo.json` 是实验排班表：哪个任务需要先等别的组完成，哪个任务产出可以缓存。
- `AGENTS.md` 是实验室守则：告诉未来的 agent/开发者怎样写代码、怎样测试。

## 4. Java 开发者类比

| OpenCode 概念 | Java 类比 | 源码依据 |
|---|---|---|
| Bun workspace | Gradle multi-project / Maven reactor | `package.json:23-30` |

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">package.json</span>
    <span class="source-ref-path"><code>package.json:23-30</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  &quot;workspaces&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    &quot;packages&quot;: [</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">      &quot;packages/*&quot;,</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">      &quot;packages/console/*&quot;,</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">      &quot;packages/sdk/js&quot;,</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">      &quot;packages/slack&quot;</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">    ],</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">    &quot;catalog&quot;: {</span></span></code></pre>
</details>

| catalog dependency | Gradle version catalog / Maven dependencyManagement | `package.json:30-87` |

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">package.json</span>
    <span class="source-ref-path"><code>package.json:30-87</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">    &quot;catalog&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      &quot;@effect/opentelemetry&quot;: &quot;4.0.0-beta.65&quot;,</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">      &quot;@effect/platform-node&quot;: &quot;4.0.0-beta.65&quot;,</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">      &quot;@npmcli/arborist&quot;: &quot;9.4.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">      &quot;@types/bun&quot;: &quot;1.3.13&quot;,</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">      &quot;@types/cross-spawn&quot;: &quot;6.0.6&quot;,</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">      &quot;@octokit/rest&quot;: &quot;22.0.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">      &quot;@hono/zod-validator&quot;: &quot;0.4.2&quot;,</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">      &quot;@opentui/core&quot;: &quot;0.2.14&quot;,</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">      &quot;@opentui/keymap&quot;: &quot;0.2.14&quot;,</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">      &quot;@opentui/solid&quot;: &quot;0.2.14&quot;,</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">      &quot;ulid&quot;: &quot;3.0.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">      &quot;@kobalte/core&quot;: &quot;0.13.11&quot;,</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">      &quot;@types/luxon&quot;: &quot;3.7.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">      &quot;@types/node&quot;: &quot;24.12.2&quot;,</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">      &quot;@types/semver&quot;: &quot;7.7.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">      &quot;@tsconfig/node22&quot;: &quot;22.0.2&quot;,</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">      &quot;@tsconfig/bun&quot;: &quot;1.0.9&quot;,</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">      &quot;@cloudflare/workers-types&quot;: &quot;4.20251008.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">      &quot;@openauthjs/openauth&quot;: &quot;0.0.0-20250322224806&quot;,</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">      &quot;@pierre/diffs&quot;: &quot;1.1.0-beta.18&quot;,</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">      &quot;opentui-spinner&quot;: &quot;0.0.6&quot;,</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">      &quot;@solid-primitives/storage&quot;: &quot;4.3.3&quot;,</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">      &quot;@tailwindcss/vite&quot;: &quot;4.1.11&quot;,</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">      &quot;diff&quot;: &quot;8.0.2&quot;,</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">      &quot;dompurify&quot;: &quot;3.3.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">      &quot;drizzle-kit&quot;: &quot;1.0.0-beta.19-d95b7a4&quot;,</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">      &quot;drizzle-orm&quot;: &quot;1.0.0-beta.19-d95b7a4&quot;,</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">      &quot;effect&quot;: &quot;4.0.0-beta.65&quot;,</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">      &quot;ai&quot;: &quot;6.0.168&quot;,</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">      &quot;cross-spawn&quot;: &quot;7.0.6&quot;,</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">      &quot;hono&quot;: &quot;4.10.7&quot;,</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">      &quot;hono-openapi&quot;: &quot;1.1.2&quot;,</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">      &quot;fuzzysort&quot;: &quot;3.1.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">      &quot;luxon&quot;: &quot;3.6.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      &quot;marked&quot;: &quot;17.0.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">      &quot;marked-shiki&quot;: &quot;1.2.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">      &quot;remend&quot;: &quot;1.3.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">      &quot;@playwright/test&quot;: &quot;1.59.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">      &quot;semver&quot;: &quot;7.7.4&quot;,</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">      &quot;typescript&quot;: &quot;5.8.2&quot;,</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">      &quot;@typescript/native-preview&quot;: &quot;7.0.0-dev.20251207.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">      &quot;zod&quot;: &quot;4.1.8&quot;,</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">      &quot;remeda&quot;: &quot;2.26.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">      &quot;shiki&quot;: &quot;3.20.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">      &quot;solid-list&quot;: &quot;0.3.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">      &quot;tailwindcss&quot;: &quot;4.1.11&quot;,</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">      &quot;virtua&quot;: &quot;0.49.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">      &quot;vite&quot;: &quot;7.1.4&quot;,</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">      &quot;@solidjs/meta&quot;: &quot;0.29.4&quot;,</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">      &quot;@solidjs/router&quot;: &quot;0.15.4&quot;,</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">      &quot;@solidjs/start&quot;: &quot;https://pkg.pr.new/@solidjs/start@dfb2020&quot;,</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">      &quot;@sentry/solid&quot;: &quot;10.36.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">      &quot;@sentry/vite-plugin&quot;: &quot;4.6.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">      &quot;solid-js&quot;: &quot;1.9.10&quot;,</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">      &quot;vite-plugin-solid&quot;: &quot;2.11.10&quot;,</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">      &quot;@lydell/node-pty&quot;: &quot;1.2.0-beta.10&quot;</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">    }</span></span></code></pre>
</details>

| `turbo.json` tasks | Gradle task graph | `turbo.json:5-43` |

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">turbo.json</span>
    <span class="source-ref-path"><code>turbo.json:5-43</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">5</span><span class="source-line-text">  &quot;tasks&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">6</span><span class="source-line-text">    &quot;typecheck&quot;: {},</span></span>
<span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">    &quot;build&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">      &quot;dependsOn&quot;: [],</span></span>
<span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">      &quot;outputs&quot;: [&quot;dist/**&quot;]</span></span>
<span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">    &quot;opencode#test&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">      &quot;outputs&quot;: [],</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">      &quot;passThroughEnv&quot;: [&quot;*&quot;]</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    &quot;test:ci&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">      &quot;outputs&quot;: [&quot;.artifacts/unit/junit.xml&quot;],</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">      &quot;passThroughEnv&quot;: [&quot;*&quot;]</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    &quot;opencode#test:ci&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">      &quot;outputs&quot;: [&quot;.artifacts/unit/junit.xml&quot;],</span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">      &quot;passThroughEnv&quot;: [&quot;*&quot;]</span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">    &quot;@opencode-ai/app#test&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">      &quot;outputs&quot;: []</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">    &quot;@opencode-ai/app#test:ci&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      &quot;outputs&quot;: [&quot;.artifacts/unit/junit.xml&quot;],</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">      &quot;passThroughEnv&quot;: [&quot;*&quot;]</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">    &quot;@opencode-ai/ui#test&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">      &quot;outputs&quot;: []</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">    &quot;@opencode-ai/ui#test:ci&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">      &quot;outputs&quot;: [&quot;.artifacts/unit/junit.xml&quot;],</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">      &quot;passThroughEnv&quot;: [&quot;*&quot;]</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  }</span></span></code></pre>
</details>

| package-level `typecheck/test/build` | 子模块自己的 `test`、`check`、`assemble` | `packages/opencode/package.json:8-19` |

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/package.json</span>
    <span class="source-ref-path"><code>packages/opencode/package.json:8-19</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">  &quot;scripts&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">    &quot;typecheck&quot;: &quot;tsgo --noEmit&quot;,</span></span>
<span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">    &quot;test&quot;: &quot;bun test --timeout 30000&quot;,</span></span>
<span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">    &quot;test:ci&quot;: &quot;mkdir -p .artifacts/unit &amp;&amp; bun test --timeout 30000 --reporter=junit --reporter-outfile=.artifacts/unit/junit.xml&quot;,</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">    &quot;test:httpapi&quot;: &quot;bun run script/httpapi-exercise.ts --mode coverage --fail-on-missing --fail-on-skip &amp;&amp; bun run script/httpapi-exercise.ts --mode auth --fail-on-missing --fail-on-skip &amp;&amp; bun run script/httpapi-exercise.ts --mode effect --fail-on-missing --fail-on-skip&quot;,</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">    &quot;bench:test&quot;: &quot;bun run script/bench-test-suite.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">    &quot;profile:test&quot;: &quot;bun run script/profile-test-files.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    &quot;build&quot;: &quot;bun run script/build.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    &quot;fix-node-pty&quot;: &quot;bun run script/fix-node-pty.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">    &quot;dev&quot;: &quot;bun run --conditions=browser ./src/index.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">    &quot;dev:temporary&quot;: &quot;bun run --conditions=browser ./src/temporary.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    &quot;db&quot;: &quot;bun drizzle-kit&quot;</span></span></code></pre>
</details>

| generated SDK build | OpenAPI Generator / Feign client 生成 | `packages/sdk/js/script/build.ts:14-47` |

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/sdk/js/script/build.ts</span>
    <span class="source-ref-path"><code>packages/sdk/js/script/build.ts:14-47</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">await $`bun dev generate &gt; ${dir}/openapi.json`.cwd(opencode)</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">await createClient({</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  input: &quot;./openapi.json&quot;,</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">  output: {</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    path: &quot;./src/v2/gen&quot;,</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    tsConfigPath: path.join(dir, &quot;tsconfig.json&quot;),</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">    clean: true,</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">  },</span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  plugins: [</span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    {</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">      name: &quot;@hey-api/typescript&quot;,</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">      exportFromIndex: false,</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">    {</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">      name: &quot;@hey-api/sdk&quot;,</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">      instance: &quot;OpencodeClient&quot;,</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      exportFromIndex: false,</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">      auth: false,</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">      paramsStructure: &quot;flat&quot;,</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">    {</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">      name: &quot;@hey-api/client-fetch&quot;,</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">      exportFromIndex: false,</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">      baseUrl: &quot;http://localhost:4096&quot;,</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  ],</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">})</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">await $`bun prettier --write src/gen`</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">await $`bun prettier --write src/v2`</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">await $`rm -rf dist`</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">await $`bun tsc`</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">await $`rm openapi.json`</span></span></code></pre>
</details>

| `AGENTS.md` | 项目级开发规范 + code review checklist | `AGENTS.md:7-127` |

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">AGENTS.md</span>
    <span class="source-ref-path"><code>AGENTS.md:7-127</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">## Style Guide</span></span>
<span class="source-line"><span class="source-line-number">8</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">### General Principles</span></span>
<span class="source-line"><span class="source-line-number">10</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">- Keep things in one function unless composable or reusable</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">- Do not extract single-use helpers preemptively. Inline the logic at the call site unless the helper is reused, hides a genuinely complex boundary, or has a clear independent name that improves the caller.</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">- Avoid `try`/`catch` where possible</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">- Avoid using the `any` type</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">- Use Bun APIs when possible, like `Bun.file()`</span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">- Rely on type inference when possible; avoid explicit type annotations or interfaces unless necessary for exports or clarity</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">- Prefer functional array methods (flatMap, filter, map) over for loops; use type guards on filter to maintain type inference downstream</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">- In `src/config`, follow the existing self-export pattern at the top of the file (for example `export * as ConfigAgent from &quot;./agent&quot;`) when adding a new config module.</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">Reduce total variable count by inlining when a value is only used once.</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">```ts</span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">// Good</span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">const journal = await Bun.file(path.join(dir, &quot;journal.json&quot;)).json()</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">// Bad</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">const journalPath = path.join(dir, &quot;journal.json&quot;)</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">const journal = await Bun.file(journalPath).json()</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">```</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">### Destructuring</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">Avoid unnecessary destructuring. Use dot notation to preserve context.</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">```ts</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">// Good</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">obj.a</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">obj.b</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">// Bad</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">const { a, b } = obj</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">```</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">### Variables</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">```ts</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">// Good</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">const foo = condition ? 1 : 2</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">// Bad</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">let foo</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">if (condition) foo = 1</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">else foo = 2</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">```</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">### Control Flow</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">Avoid `else` statements. Prefer early returns.</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">```ts</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">// Good</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">function foo() {</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">  if (condition) return 1</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">  return 2</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">// Bad</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">function foo() {</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">  if (condition) return 1</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">  else return 2</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">```</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">### Complex Logic</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">When a function has several validation branches or supporting details, make the main function read as the happy path and move supporting details into small helpers below it.</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">```ts</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">// Good</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">export function loadThing(input: unknown) {</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">  const config = requireConfig(input)</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">  const metadata = readMetadata(input)</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">  return createThing({ config, metadata })</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">function requireConfig(input: unknown) {</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">  ...</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">```</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">- Keep helpers close to the code they support, below the main export when that improves readability.</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">- Do not over-abstract simple expressions into many single-use helpers; extract only when it names a real concept like `requireConfig` or `readMetadata`.</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">- Do not return `Effect` from helpers unless they actually perform effectful work. Synchronous parsing, validation, and option building should stay synchronous.</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">- Prefer Effect schema helpers such as `Schema.UnknownFromJsonString` and `Schema.decodeUnknownOption` over manual `JSON.parse` wrapped in `Effect.try` when parsing untrusted JSON strings.</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">- Add comments for non-obvious constraints and surprising behavior, not for obvious assignments or control flow.</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">### Schema Definitions (Drizzle)</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">Use snake_case for field names so column names don't need to be redefined as strings.</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">```ts</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">// Good</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">const table = sqliteTable(&quot;session&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">  id: text().primaryKey(),</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">  project_id: text().notNull(),</span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">  created_at: integer().notNull(),</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">})</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">// Bad</span></span>
<span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">const table = sqliteTable(&quot;session&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">  id: text(&quot;id&quot;).primaryKey(),</span></span>
<span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">  projectID: text(&quot;project_id&quot;).notNull(),</span></span>
<span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">  createdAt: integer(&quot;created_at&quot;).notNull(),</span></span>
<span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">})</span></span>
<span class="source-line"><span class="source-line-number">117</span><span class="source-line-text">```</span></span>
<span class="source-line"><span class="source-line-number">118</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">## Testing</span></span>
<span class="source-line"><span class="source-line-number">120</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">- Avoid mocks as much as possible</span></span>
<span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">- Test actual implementation, do not duplicate logic into tests</span></span>
<span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">- Tests cannot run from repo root (guard: `do-not-run-tests-from-root`); run from package dirs like `packages/opencode`.</span></span>
<span class="source-line"><span class="source-line-number">124</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">125</span><span class="source-line-text">## Type Checking</span></span>
<span class="source-line"><span class="source-line-number">126</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">- Always run `bun typecheck` from package directories (e.g., `packages/opencode`), never `tsc` directly.</span></span></code></pre>
</details>


重点差异：Java 生态常把编译、测试、打包都塞进 Maven/Gradle 生命周期；OpenCode 这里更像“包内脚本 + Turbo 编排 + Bun runtime”。

## 5. 最小源码路径

建议按这个顺序读：

1. `package.json:7-21`：根目录脚本，尤其 `typecheck` 和禁止 root test。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">package.json</span>
      <span class="source-ref-path"><code>package.json:7-21</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">  &quot;packageManager&quot;: &quot;bun@1.3.14&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">  &quot;scripts&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">    &quot;dev&quot;: &quot;bun run --cwd packages/opencode --conditions=browser src/index.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">    &quot;dev:desktop&quot;: &quot;bun --cwd packages/desktop dev&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">    &quot;dev:web&quot;: &quot;bun --cwd packages/app dev&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">    &quot;dev:console&quot;: &quot;ulimit -n 10240 2&gt;/dev/null; bun run --cwd packages/console/app dev&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">    &quot;dev:storybook&quot;: &quot;bun --cwd packages/storybook storybook&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">    &quot;lint&quot;: &quot;oxlint&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    &quot;typecheck&quot;: &quot;bun turbo typecheck&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    &quot;upgrade-opentui&quot;: &quot;bun run script/upgrade-opentui.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">    &quot;postinstall&quot;: &quot;bun run --cwd packages/opencode fix-node-pty&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">    &quot;prepare&quot;: &quot;husky&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    &quot;random&quot;: &quot;echo 'Random script'&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    &quot;hello&quot;: &quot;echo 'Hello World!'&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">    &quot;test&quot;: &quot;echo 'do not run tests from root' &amp;&amp; exit 1&quot;</span></span></code></pre>
  </details>

2. `package.json:23-87`：workspace 与 catalog。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">package.json</span>
      <span class="source-ref-path"><code>package.json:23-87</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  &quot;workspaces&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    &quot;packages&quot;: [</span></span>
  <span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">      &quot;packages/*&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">      &quot;packages/console/*&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">      &quot;packages/sdk/js&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">      &quot;packages/slack&quot;</span></span>
  <span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">    ],</span></span>
  <span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">    &quot;catalog&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      &quot;@effect/opentelemetry&quot;: &quot;4.0.0-beta.65&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">      &quot;@effect/platform-node&quot;: &quot;4.0.0-beta.65&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">      &quot;@npmcli/arborist&quot;: &quot;9.4.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">      &quot;@types/bun&quot;: &quot;1.3.13&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">      &quot;@types/cross-spawn&quot;: &quot;6.0.6&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">      &quot;@octokit/rest&quot;: &quot;22.0.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">      &quot;@hono/zod-validator&quot;: &quot;0.4.2&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">      &quot;@opentui/core&quot;: &quot;0.2.14&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">      &quot;@opentui/keymap&quot;: &quot;0.2.14&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">      &quot;@opentui/solid&quot;: &quot;0.2.14&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">      &quot;ulid&quot;: &quot;3.0.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">      &quot;@kobalte/core&quot;: &quot;0.13.11&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">      &quot;@types/luxon&quot;: &quot;3.7.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">      &quot;@types/node&quot;: &quot;24.12.2&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">      &quot;@types/semver&quot;: &quot;7.7.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">      &quot;@tsconfig/node22&quot;: &quot;22.0.2&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">      &quot;@tsconfig/bun&quot;: &quot;1.0.9&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">      &quot;@cloudflare/workers-types&quot;: &quot;4.20251008.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">      &quot;@openauthjs/openauth&quot;: &quot;0.0.0-20250322224806&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">      &quot;@pierre/diffs&quot;: &quot;1.1.0-beta.18&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">      &quot;opentui-spinner&quot;: &quot;0.0.6&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">      &quot;@solid-primitives/storage&quot;: &quot;4.3.3&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">      &quot;@tailwindcss/vite&quot;: &quot;4.1.11&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">      &quot;diff&quot;: &quot;8.0.2&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">      &quot;dompurify&quot;: &quot;3.3.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">      &quot;drizzle-kit&quot;: &quot;1.0.0-beta.19-d95b7a4&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">      &quot;drizzle-orm&quot;: &quot;1.0.0-beta.19-d95b7a4&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">      &quot;effect&quot;: &quot;4.0.0-beta.65&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">      &quot;ai&quot;: &quot;6.0.168&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">      &quot;cross-spawn&quot;: &quot;7.0.6&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">      &quot;hono&quot;: &quot;4.10.7&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">      &quot;hono-openapi&quot;: &quot;1.1.2&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">      &quot;fuzzysort&quot;: &quot;3.1.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">      &quot;luxon&quot;: &quot;3.6.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      &quot;marked&quot;: &quot;17.0.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">      &quot;marked-shiki&quot;: &quot;1.2.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">      &quot;remend&quot;: &quot;1.3.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">      &quot;@playwright/test&quot;: &quot;1.59.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">      &quot;semver&quot;: &quot;7.7.4&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">      &quot;typescript&quot;: &quot;5.8.2&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">      &quot;@typescript/native-preview&quot;: &quot;7.0.0-dev.20251207.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">      &quot;zod&quot;: &quot;4.1.8&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">      &quot;remeda&quot;: &quot;2.26.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">      &quot;shiki&quot;: &quot;3.20.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">      &quot;solid-list&quot;: &quot;0.3.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">      &quot;tailwindcss&quot;: &quot;4.1.11&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">      &quot;virtua&quot;: &quot;0.49.1&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">      &quot;vite&quot;: &quot;7.1.4&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">      &quot;@solidjs/meta&quot;: &quot;0.29.4&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">      &quot;@solidjs/router&quot;: &quot;0.15.4&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">      &quot;@solidjs/start&quot;: &quot;https://pkg.pr.new/@solidjs/start@dfb2020&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">      &quot;@sentry/solid&quot;: &quot;10.36.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">      &quot;@sentry/vite-plugin&quot;: &quot;4.6.0&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">      &quot;solid-js&quot;: &quot;1.9.10&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">      &quot;vite-plugin-solid&quot;: &quot;2.11.10&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">      &quot;@lydell/node-pty&quot;: &quot;1.2.0-beta.10&quot;</span></span>
  <span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">    }</span></span></code></pre>
  </details>

3. `turbo.json:5-43`：跨 package task graph。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">turbo.json</span>
      <span class="source-ref-path"><code>turbo.json:5-43</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">5</span><span class="source-line-text">  &quot;tasks&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">6</span><span class="source-line-text">    &quot;typecheck&quot;: {},</span></span>
  <span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">    &quot;build&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">      &quot;dependsOn&quot;: [],</span></span>
  <span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">      &quot;outputs&quot;: [&quot;dist/**&quot;]</span></span>
  <span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">    &quot;opencode#test&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
  <span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">      &quot;outputs&quot;: [],</span></span>
  <span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">      &quot;passThroughEnv&quot;: [&quot;*&quot;]</span></span>
  <span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    &quot;test:ci&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">      &quot;outputs&quot;: [&quot;.artifacts/unit/junit.xml&quot;],</span></span>
  <span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">      &quot;passThroughEnv&quot;: [&quot;*&quot;]</span></span>
  <span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    &quot;opencode#test:ci&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
  <span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">      &quot;outputs&quot;: [&quot;.artifacts/unit/junit.xml&quot;],</span></span>
  <span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">      &quot;passThroughEnv&quot;: [&quot;*&quot;]</span></span>
  <span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">    &quot;@opencode-ai/app#test&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
  <span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">      &quot;outputs&quot;: []</span></span>
  <span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">    &quot;@opencode-ai/app#test:ci&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
  <span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      &quot;outputs&quot;: [&quot;.artifacts/unit/junit.xml&quot;],</span></span>
  <span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">      &quot;passThroughEnv&quot;: [&quot;*&quot;]</span></span>
  <span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">    &quot;@opencode-ai/ui#test&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
  <span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">      &quot;outputs&quot;: []</span></span>
  <span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">    &quot;@opencode-ai/ui#test:ci&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
  <span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">      &quot;outputs&quot;: [&quot;.artifacts/unit/junit.xml&quot;],</span></span>
  <span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">      &quot;passThroughEnv&quot;: [&quot;*&quot;]</span></span>
  <span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">    }</span></span>
  <span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  }</span></span></code></pre>
  </details>

4. `AGENTS.md:119-127`：项目明确的测试和 typecheck 规则。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">AGENTS.md</span>
      <span class="source-ref-path"><code>AGENTS.md:119-127</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">## Testing</span></span>
  <span class="source-line"><span class="source-line-number">120</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">- Avoid mocks as much as possible</span></span>
  <span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">- Test actual implementation, do not duplicate logic into tests</span></span>
  <span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">- Tests cannot run from repo root (guard: `do-not-run-tests-from-root`); run from package dirs like `packages/opencode`.</span></span>
  <span class="source-line"><span class="source-line-number">124</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">125</span><span class="source-line-text">## Type Checking</span></span>
  <span class="source-line"><span class="source-line-number">126</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">- Always run `bun typecheck` from package directories (e.g., `packages/opencode`), never `tsc` directly.</span></span></code></pre>
  </details>

5. `packages/opencode/package.json:8-23`：核心 runtime package 的脚本和 CLI bin。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/package.json</span>
      <span class="source-ref-path"><code>packages/opencode/package.json:8-23</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">  &quot;scripts&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">    &quot;typecheck&quot;: &quot;tsgo --noEmit&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">    &quot;test&quot;: &quot;bun test --timeout 30000&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">    &quot;test:ci&quot;: &quot;mkdir -p .artifacts/unit &amp;&amp; bun test --timeout 30000 --reporter=junit --reporter-outfile=.artifacts/unit/junit.xml&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">    &quot;test:httpapi&quot;: &quot;bun run script/httpapi-exercise.ts --mode coverage --fail-on-missing --fail-on-skip &amp;&amp; bun run script/httpapi-exercise.ts --mode auth --fail-on-missing --fail-on-skip &amp;&amp; bun run script/httpapi-exercise.ts --mode effect --fail-on-missing --fail-on-skip&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">    &quot;bench:test&quot;: &quot;bun run script/bench-test-suite.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">    &quot;profile:test&quot;: &quot;bun run script/profile-test-files.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    &quot;build&quot;: &quot;bun run script/build.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    &quot;fix-node-pty&quot;: &quot;bun run script/fix-node-pty.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">    &quot;dev&quot;: &quot;bun run --conditions=browser ./src/index.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">    &quot;dev:temporary&quot;: &quot;bun run --conditions=browser ./src/temporary.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    &quot;db&quot;: &quot;bun drizzle-kit&quot;</span></span>
  <span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">  },</span></span>
  <span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">  &quot;bin&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">    &quot;opencode&quot;: &quot;./bin/opencode&quot;</span></span>
  <span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  },</span></span></code></pre>
  </details>

6. `packages/app/package.json:11-24`：Web app 的 unit/E2E test。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/app/package.json</span>
      <span class="source-ref-path"><code>packages/app/package.json:11-24</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">  &quot;scripts&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">    &quot;typecheck&quot;: &quot;tsgo -b&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">    &quot;start&quot;: &quot;vite&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">    &quot;dev&quot;: &quot;vite&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    &quot;build&quot;: &quot;vite build&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    &quot;serve&quot;: &quot;vite preview&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">    &quot;test&quot;: &quot;bun run test:unit&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">    &quot;test:ci&quot;: &quot;mkdir -p .artifacts/unit &amp;&amp; bun test --preload ./happydom.ts ./src --reporter=junit --reporter-outfile=.artifacts/unit/junit.xml&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    &quot;test:unit&quot;: &quot;bun test --preload ./happydom.ts ./src&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    &quot;test:unit:watch&quot;: &quot;bun test --watch --preload ./happydom.ts ./src&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">    &quot;test:e2e&quot;: &quot;playwright test&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">    &quot;test:e2e:local&quot;: &quot;playwright test&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">    &quot;test:e2e:ui&quot;: &quot;playwright test --ui&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    &quot;test:e2e:report&quot;: &quot;playwright show-report e2e/playwright-report&quot;</span></span></code></pre>
  </details>

7. `packages/sdk/js/script/build.ts:14-47`：SDK 生成流程。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/sdk/js/script/build.ts</span>
      <span class="source-ref-path"><code>packages/sdk/js/script/build.ts:14-47</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">await $`bun dev generate &gt; ${dir}/openapi.json`.cwd(opencode)</span></span>
  <span class="source-line"><span class="source-line-number">15</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">await createClient({</span></span>
  <span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  input: &quot;./openapi.json&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">  output: {</span></span>
  <span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    path: &quot;./src/v2/gen&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    tsConfigPath: path.join(dir, &quot;tsconfig.json&quot;),</span></span>
  <span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">    clean: true,</span></span>
  <span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">  },</span></span>
  <span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  plugins: [</span></span>
  <span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    {</span></span>
  <span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">      name: &quot;@hey-api/typescript&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">      exportFromIndex: false,</span></span>
  <span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">    {</span></span>
  <span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">      name: &quot;@hey-api/sdk&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">      instance: &quot;OpencodeClient&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      exportFromIndex: false,</span></span>
  <span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">      auth: false,</span></span>
  <span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">      paramsStructure: &quot;flat&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">    {</span></span>
  <span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">      name: &quot;@hey-api/client-fetch&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">      exportFromIndex: false,</span></span>
  <span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">      baseUrl: &quot;http://localhost:4096&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  ],</span></span>
  <span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">})</span></span>
  <span class="source-line"><span class="source-line-number">42</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">await $`bun prettier --write src/gen`</span></span>
  <span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">await $`bun prettier --write src/v2`</span></span>
  <span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">await $`rm -rf dist`</span></span>
  <span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">await $`bun tsc`</span></span>
  <span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">await $`rm openapi.json`</span></span></code></pre>
  </details>

8. `packages/app/src/context/global-sync/event-reducer.test.ts:1-6` 和 `packages/llm/test/tool-stream.test.ts:1-23`：真实测试风格。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/app/src/context/global-sync/event-reducer.test.ts</span>
      <span class="source-ref-path"><code>packages/app/src/context/global-sync/event-reducer.test.ts:1-6</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1</span><span class="source-line-text">import { describe, expect, test } from &quot;bun:test&quot;</span></span>
  <span class="source-line"><span class="source-line-number">2</span><span class="source-line-text">import type { Message, Part, PermissionRequest, Project, QuestionRequest, Session } from &quot;@opencode-ai/sdk/v2/client&quot;</span></span>
  <span class="source-line"><span class="source-line-number">3</span><span class="source-line-text">import { createStore } from &quot;solid-js/store&quot;</span></span>
  <span class="source-line"><span class="source-line-number">4</span><span class="source-line-text">import type { State } from &quot;./types&quot;</span></span>
  <span class="source-line"><span class="source-line-number">5</span><span class="source-line-text">import { applyDirectoryEvent, applyGlobalEvent, cleanupDroppedSessionCaches } from &quot;./event-reducer&quot;</span></span>
  <span class="source-line"><span class="source-line-number">6</span><span class="source-line-text"></span></span></code></pre>
  </details>

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/llm/test/tool-stream.test.ts</span>
      <span class="source-ref-path"><code>packages/llm/test/tool-stream.test.ts:1-23</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1</span><span class="source-line-text">import { describe, expect } from &quot;bun:test&quot;</span></span>
  <span class="source-line"><span class="source-line-number">2</span><span class="source-line-text">import { Effect } from &quot;effect&quot;</span></span>
  <span class="source-line"><span class="source-line-number">3</span><span class="source-line-text">import { LLMError } from &quot;../src/schema&quot;</span></span>
  <span class="source-line"><span class="source-line-number">4</span><span class="source-line-text">import { ToolStream } from &quot;../src/protocols/utils/tool-stream&quot;</span></span>
  <span class="source-line"><span class="source-line-number">5</span><span class="source-line-text">import { it } from &quot;./lib/effect&quot;</span></span>
  <span class="source-line"><span class="source-line-number">6</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">const ADAPTER = &quot;test-route&quot;</span></span>
  <span class="source-line"><span class="source-line-number">8</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">describe(&quot;ToolStream&quot;, () =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">  it.effect(&quot;starts from OpenAI-style deltas and finalizes parsed input&quot;, () =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">    Effect.gen(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">      const first = ToolStream.appendOrStart(</span></span>
  <span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">        ADAPTER,</span></span>
  <span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">        ToolStream.empty&lt;number&gt;(),</span></span>
  <span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">        0,</span></span>
  <span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">        { id: &quot;call_1&quot;, name: &quot;lookup&quot;, text: '{&quot;query&quot;' },</span></span>
  <span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">        &quot;missing tool&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">      )</span></span>
  <span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">      if (ToolStream.isError(first)) return yield* first</span></span>
  <span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">      const second = ToolStream.appendOrStart(ADAPTER, first.tools, 0, { text: ':&quot;weather&quot;}' }, &quot;missing tool&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">      if (ToolStream.isError(second)) return yield* second</span></span>
  <span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">      const finished = yield* ToolStream.finish(ADAPTER, second.tools, 0)</span></span>
  <span class="source-line"><span class="source-line-number">23</span><span class="source-line-text"></span></span></code></pre>
  </details>


## 6. 工程化整体链路

OpenCode 的工程链路大致是：

```text
根 package.json
  -> workspaces 定义 package 集合
  -> catalog 固定共享依赖版本
  -> turbo.json 编排 typecheck/build/test
  -> package 自己定义脚本
  -> package 内测试读取真实实现
  -> SDK/build 脚本生成或打包产物
```

重要的是：根目录不是执行全部测试的入口。源码里有一个非常明确的保护。

路径：`package.json:8-21`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">package.json</span>
    <span class="source-ref-path"><code>package.json:8-21</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">  &quot;scripts&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">    &quot;dev&quot;: &quot;bun run --cwd packages/opencode --conditions=browser src/index.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">    &quot;dev:desktop&quot;: &quot;bun --cwd packages/desktop dev&quot;,</span></span>
<span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">    &quot;dev:web&quot;: &quot;bun --cwd packages/app dev&quot;,</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">    &quot;dev:console&quot;: &quot;ulimit -n 10240 2&gt;/dev/null; bun run --cwd packages/console/app dev&quot;,</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">    &quot;dev:storybook&quot;: &quot;bun --cwd packages/storybook storybook&quot;,</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">    &quot;lint&quot;: &quot;oxlint&quot;,</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    &quot;typecheck&quot;: &quot;bun turbo typecheck&quot;,</span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    &quot;upgrade-opentui&quot;: &quot;bun run script/upgrade-opentui.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">    &quot;postinstall&quot;: &quot;bun run --cwd packages/opencode fix-node-pty&quot;,</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">    &quot;prepare&quot;: &quot;husky&quot;,</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    &quot;random&quot;: &quot;echo 'Random script'&quot;,</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    &quot;hello&quot;: &quot;echo 'Hello World!'&quot;,</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">    &quot;test&quot;: &quot;echo 'do not run tests from root' &amp;&amp; exit 1&quot;</span></span></code></pre>
</details>


```json
"scripts": {
  "dev": "bun run --cwd packages/opencode --conditions=browser src/index.ts",
  "dev:desktop": "bun --cwd packages/desktop dev",
  "dev:web": "bun --cwd packages/app dev",
  "lint": "oxlint",
  "typecheck": "bun turbo typecheck",
  "test": "echo 'do not run tests from root' && exit 1"
}
```

这里的设计选择很清楚：根目录可以跑 `typecheck`，但 `test` 必须进入具体 package。这个判断还被 `AGENTS.md` 再次强调。

路径：`AGENTS.md:119-127`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">AGENTS.md</span>
    <span class="source-ref-path"><code>AGENTS.md:119-127</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">## Testing</span></span>
<span class="source-line"><span class="source-line-number">120</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">- Avoid mocks as much as possible</span></span>
<span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">- Test actual implementation, do not duplicate logic into tests</span></span>
<span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">- Tests cannot run from repo root (guard: `do-not-run-tests-from-root`); run from package dirs like `packages/opencode`.</span></span>
<span class="source-line"><span class="source-line-number">124</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">125</span><span class="source-line-text">## Type Checking</span></span>
<span class="source-line"><span class="source-line-number">126</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">- Always run `bun typecheck` from package directories (e.g., `packages/opencode`), never `tsc` directly.</span></span></code></pre>
</details>


```md
## Testing

- Avoid mocks as much as possible
- Test actual implementation, do not duplicate logic into tests
- Tests cannot run from repo root (guard: `do-not-run-tests-from-root`); run from package dirs like `packages/opencode`.

## Type Checking

- Always run `bun typecheck` from package directories (e.g., `packages/opencode`), never `tsc` directly.
```

## 7. 核心源码逐段讲解

### 7.1 根目录负责 workspace 和统一版本

路径：`package.json:23-30`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">package.json</span>
    <span class="source-ref-path"><code>package.json:23-30</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  &quot;workspaces&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    &quot;packages&quot;: [</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">      &quot;packages/*&quot;,</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">      &quot;packages/console/*&quot;,</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">      &quot;packages/sdk/js&quot;,</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">      &quot;packages/slack&quot;</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">    ],</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">    &quot;catalog&quot;: {</span></span></code></pre>
</details>


```json
"workspaces": {
  "packages": [
    "packages/*",
    "packages/console/*",
    "packages/sdk/js",
    "packages/slack"
  ],
  "catalog": {
```

这段说明 OpenCode 是一个 workspace monorepo。`packages/*` 是主要 package 集合，`packages/sdk/js` 被显式放入 workspace，说明 SDK 虽然在更深目录，但仍是 monorepo 的一等模块。

路径：`package.json:31-87`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">package.json</span>
    <span class="source-ref-path"><code>package.json:31-87</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      &quot;@effect/opentelemetry&quot;: &quot;4.0.0-beta.65&quot;,</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">      &quot;@effect/platform-node&quot;: &quot;4.0.0-beta.65&quot;,</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">      &quot;@npmcli/arborist&quot;: &quot;9.4.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">      &quot;@types/bun&quot;: &quot;1.3.13&quot;,</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">      &quot;@types/cross-spawn&quot;: &quot;6.0.6&quot;,</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">      &quot;@octokit/rest&quot;: &quot;22.0.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">      &quot;@hono/zod-validator&quot;: &quot;0.4.2&quot;,</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">      &quot;@opentui/core&quot;: &quot;0.2.14&quot;,</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">      &quot;@opentui/keymap&quot;: &quot;0.2.14&quot;,</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">      &quot;@opentui/solid&quot;: &quot;0.2.14&quot;,</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">      &quot;ulid&quot;: &quot;3.0.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">      &quot;@kobalte/core&quot;: &quot;0.13.11&quot;,</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">      &quot;@types/luxon&quot;: &quot;3.7.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">      &quot;@types/node&quot;: &quot;24.12.2&quot;,</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">      &quot;@types/semver&quot;: &quot;7.7.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">      &quot;@tsconfig/node22&quot;: &quot;22.0.2&quot;,</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">      &quot;@tsconfig/bun&quot;: &quot;1.0.9&quot;,</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">      &quot;@cloudflare/workers-types&quot;: &quot;4.20251008.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">      &quot;@openauthjs/openauth&quot;: &quot;0.0.0-20250322224806&quot;,</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">      &quot;@pierre/diffs&quot;: &quot;1.1.0-beta.18&quot;,</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">      &quot;opentui-spinner&quot;: &quot;0.0.6&quot;,</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">      &quot;@solid-primitives/storage&quot;: &quot;4.3.3&quot;,</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">      &quot;@tailwindcss/vite&quot;: &quot;4.1.11&quot;,</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">      &quot;diff&quot;: &quot;8.0.2&quot;,</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">      &quot;dompurify&quot;: &quot;3.3.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">      &quot;drizzle-kit&quot;: &quot;1.0.0-beta.19-d95b7a4&quot;,</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">      &quot;drizzle-orm&quot;: &quot;1.0.0-beta.19-d95b7a4&quot;,</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">      &quot;effect&quot;: &quot;4.0.0-beta.65&quot;,</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">      &quot;ai&quot;: &quot;6.0.168&quot;,</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">      &quot;cross-spawn&quot;: &quot;7.0.6&quot;,</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">      &quot;hono&quot;: &quot;4.10.7&quot;,</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">      &quot;hono-openapi&quot;: &quot;1.1.2&quot;,</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">      &quot;fuzzysort&quot;: &quot;3.1.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">      &quot;luxon&quot;: &quot;3.6.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      &quot;marked&quot;: &quot;17.0.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">      &quot;marked-shiki&quot;: &quot;1.2.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">      &quot;remend&quot;: &quot;1.3.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">      &quot;@playwright/test&quot;: &quot;1.59.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">      &quot;semver&quot;: &quot;7.7.4&quot;,</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">      &quot;typescript&quot;: &quot;5.8.2&quot;,</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">      &quot;@typescript/native-preview&quot;: &quot;7.0.0-dev.20251207.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">      &quot;zod&quot;: &quot;4.1.8&quot;,</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">      &quot;remeda&quot;: &quot;2.26.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">      &quot;shiki&quot;: &quot;3.20.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">      &quot;solid-list&quot;: &quot;0.3.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">      &quot;tailwindcss&quot;: &quot;4.1.11&quot;,</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">      &quot;virtua&quot;: &quot;0.49.1&quot;,</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">      &quot;vite&quot;: &quot;7.1.4&quot;,</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">      &quot;@solidjs/meta&quot;: &quot;0.29.4&quot;,</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">      &quot;@solidjs/router&quot;: &quot;0.15.4&quot;,</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">      &quot;@solidjs/start&quot;: &quot;https://pkg.pr.new/@solidjs/start@dfb2020&quot;,</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">      &quot;@sentry/solid&quot;: &quot;10.36.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">      &quot;@sentry/vite-plugin&quot;: &quot;4.6.0&quot;,</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">      &quot;solid-js&quot;: &quot;1.9.10&quot;,</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">      &quot;vite-plugin-solid&quot;: &quot;2.11.10&quot;,</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">      &quot;@lydell/node-pty&quot;: &quot;1.2.0-beta.10&quot;</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">    }</span></span></code></pre>
</details>


```json
"catalog": {
  "@types/bun": "1.3.13",
  "@types/node": "24.12.2",
  "effect": "4.0.0-beta.65",
  "ai": "6.0.168",
  "hono": "4.10.7",
  "typescript": "5.8.2",
  "zod": "4.1.8",
  "vite": "7.1.4",
  "solid-js": "1.9.10"
}
```

这和 Java 的 `dependencyManagement` 很像：子 package 可以写 `"effect": "catalog:"`，最终版本由根目录决定。

### 7.2 Turbo 只编排关键任务

路径：`turbo.json:5-23`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">turbo.json</span>
    <span class="source-ref-path"><code>turbo.json:5-23</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">5</span><span class="source-line-text">  &quot;tasks&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">6</span><span class="source-line-text">    &quot;typecheck&quot;: {},</span></span>
<span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">    &quot;build&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">      &quot;dependsOn&quot;: [],</span></span>
<span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">      &quot;outputs&quot;: [&quot;dist/**&quot;]</span></span>
<span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">    &quot;opencode#test&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">      &quot;outputs&quot;: [],</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">      &quot;passThroughEnv&quot;: [&quot;*&quot;]</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    &quot;test:ci&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">      &quot;outputs&quot;: [&quot;.artifacts/unit/junit.xml&quot;],</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">      &quot;passThroughEnv&quot;: [&quot;*&quot;]</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    &quot;opencode#test:ci&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">      &quot;dependsOn&quot;: [&quot;^build&quot;],</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">      &quot;outputs&quot;: [&quot;.artifacts/unit/junit.xml&quot;],</span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">      &quot;passThroughEnv&quot;: [&quot;*&quot;]</span></span></code></pre>
</details>


```json
"tasks": {
  "typecheck": {},
  "build": {
    "dependsOn": [],
    "outputs": ["dist/**"]
  },
  "opencode#test": {
    "dependsOn": ["^build"],
    "outputs": [],
    "passThroughEnv": ["*"]
  },
  "test:ci": {
    "outputs": [".artifacts/unit/junit.xml"],
    "passThroughEnv": ["*"]
  }
}
```

这里能看到两个工程化思想：

- `build` 的产物是 `dist/**`，适合缓存。
- `opencode#test` 依赖上游 build，说明核心 runtime 测试可能需要其他 workspace 包先构建。

### 7.3 核心 runtime package 的脚本

路径：`packages/opencode/package.json:8-19`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/package.json</span>
    <span class="source-ref-path"><code>packages/opencode/package.json:8-19</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">  &quot;scripts&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">    &quot;typecheck&quot;: &quot;tsgo --noEmit&quot;,</span></span>
<span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">    &quot;test&quot;: &quot;bun test --timeout 30000&quot;,</span></span>
<span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">    &quot;test:ci&quot;: &quot;mkdir -p .artifacts/unit &amp;&amp; bun test --timeout 30000 --reporter=junit --reporter-outfile=.artifacts/unit/junit.xml&quot;,</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">    &quot;test:httpapi&quot;: &quot;bun run script/httpapi-exercise.ts --mode coverage --fail-on-missing --fail-on-skip &amp;&amp; bun run script/httpapi-exercise.ts --mode auth --fail-on-missing --fail-on-skip &amp;&amp; bun run script/httpapi-exercise.ts --mode effect --fail-on-missing --fail-on-skip&quot;,</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">    &quot;bench:test&quot;: &quot;bun run script/bench-test-suite.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">    &quot;profile:test&quot;: &quot;bun run script/profile-test-files.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    &quot;build&quot;: &quot;bun run script/build.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    &quot;fix-node-pty&quot;: &quot;bun run script/fix-node-pty.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">    &quot;dev&quot;: &quot;bun run --conditions=browser ./src/index.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">    &quot;dev:temporary&quot;: &quot;bun run --conditions=browser ./src/temporary.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    &quot;db&quot;: &quot;bun drizzle-kit&quot;</span></span></code></pre>
</details>


```json
"scripts": {
  "typecheck": "tsgo --noEmit",
  "test": "bun test --timeout 30000",
  "test:ci": "mkdir -p .artifacts/unit && bun test --timeout 30000 --reporter=junit --reporter-outfile=.artifacts/unit/junit.xml",
  "test:httpapi": "bun run script/httpapi-exercise.ts --mode coverage --fail-on-missing --fail-on-skip && bun run script/httpapi-exercise.ts --mode auth --fail-on-missing --fail-on-skip && bun run script/httpapi-exercise.ts --mode effect --fail-on-missing --fail-on-skip",
  "build": "bun run script/build.ts",
  "dev": "bun run --conditions=browser ./src/index.ts"
}
```

几个点很值得学：

- typecheck 用 `tsgo --noEmit`，不是直接 `tsc`。
- runtime 测试用 `bun test`，并设置 30 秒 timeout。
- HTTP API 有专门 exercise 脚本，不只是单元测试。
- build 交给脚本 `script/build.ts`，说明打包逻辑复杂，不适合塞在 package.json 一行命令里。

### 7.4 CLI bin 和条件导入

路径：`packages/opencode/package.json:21-38`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/package.json</span>
    <span class="source-ref-path"><code>packages/opencode/package.json:21-38</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">  &quot;bin&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">    &quot;opencode&quot;: &quot;./bin/opencode&quot;</span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  },</span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">  &quot;exports&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">    &quot;./*&quot;: &quot;./src/*.ts&quot;</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">  },</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">  &quot;imports&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">    &quot;#db&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">      &quot;bun&quot;: &quot;./src/storage/db.bun.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">      &quot;node&quot;: &quot;./src/storage/db.node.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      &quot;default&quot;: &quot;./src/storage/db.bun.ts&quot;</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">    &quot;#pty&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">      &quot;bun&quot;: &quot;./src/pty/pty.bun.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">      &quot;node&quot;: &quot;./src/pty/pty.node.ts&quot;,</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">      &quot;default&quot;: &quot;./src/pty/pty.bun.ts&quot;</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">  },</span></span></code></pre>
</details>


```json
"bin": {
  "opencode": "./bin/opencode"
},
"exports": {
  "./*": "./src/*.ts"
},
"imports": {
  "#db": {
    "bun": "./src/storage/db.bun.ts",
    "node": "./src/storage/db.node.ts",
    "default": "./src/storage/db.bun.ts"
  },
  "#pty": {
    "bun": "./src/pty/pty.bun.ts",
    "node": "./src/pty/pty.node.ts",
    "default": "./src/pty/pty.bun.ts"
  }
}
```

这段对 agent 项目很关键：同一个源码包可能要跑在 Bun、Node、打包后二进制等环境里，所以 `imports` 为数据库和 PTY 做环境分支。

Java 类比：这有点像 Spring profile 或 conditional bean，只是 TS/Node 的条件发生在 package resolution 阶段。

### 7.5 根目录 bunfig 再次防止误跑测试

路径：`bunfig.toml:1-8`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">bunfig.toml</span>
    <span class="source-ref-path"><code>bunfig.toml:1-8</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1</span><span class="source-line-text">[install]</span></span>
<span class="source-line"><span class="source-line-number">2</span><span class="source-line-text">exact = true</span></span>
<span class="source-line"><span class="source-line-number">3</span><span class="source-line-text"># Only install newly resolved package versions published at least 3 days ago.</span></span>
<span class="source-line"><span class="source-line-number">4</span><span class="source-line-text">minimumReleaseAge = 259200</span></span>
<span class="source-line"><span class="source-line-number">5</span><span class="source-line-text">minimumReleaseAgeExcludes = [&quot;@opentui/core&quot;, &quot;@opentui/core-darwin-arm64&quot;, &quot;@opentui/core-darwin-x64&quot;, &quot;@opentui/core-linux-arm64&quot;, &quot;@opentui/core-linux-x64&quot;, &quot;@opentui/core-win32-arm64&quot;, &quot;@opentui/core-win32-x64&quot;, &quot;@opentui/keymap&quot;, &quot;@opentui/solid&quot;]</span></span>
<span class="source-line"><span class="source-line-number">6</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">[test]</span></span>
<span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">root = &quot;./do-not-run-tests-from-root&quot;</span></span></code></pre>
</details>


```toml
[install]
exact = true
minimumReleaseAge = 259200

[test]
root = "./do-not-run-tests-from-root"
```

这里的 `test.root` 和根 `package.json` 的 `"test": "echo 'do not run tests from root' && exit 1"` 是双保险。OpenCode 明确希望测试从 package 目录运行。

### 7.6 UI/Web package 的测试分层

路径：`packages/app/package.json:11-24`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/app/package.json</span>
    <span class="source-ref-path"><code>packages/app/package.json:11-24</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">  &quot;scripts&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">    &quot;typecheck&quot;: &quot;tsgo -b&quot;,</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">    &quot;start&quot;: &quot;vite&quot;,</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">    &quot;dev&quot;: &quot;vite&quot;,</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    &quot;build&quot;: &quot;vite build&quot;,</span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    &quot;serve&quot;: &quot;vite preview&quot;,</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">    &quot;test&quot;: &quot;bun run test:unit&quot;,</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">    &quot;test:ci&quot;: &quot;mkdir -p .artifacts/unit &amp;&amp; bun test --preload ./happydom.ts ./src --reporter=junit --reporter-outfile=.artifacts/unit/junit.xml&quot;,</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    &quot;test:unit&quot;: &quot;bun test --preload ./happydom.ts ./src&quot;,</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    &quot;test:unit:watch&quot;: &quot;bun test --watch --preload ./happydom.ts ./src&quot;,</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">    &quot;test:e2e&quot;: &quot;playwright test&quot;,</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">    &quot;test:e2e:local&quot;: &quot;playwright test&quot;,</span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">    &quot;test:e2e:ui&quot;: &quot;playwright test --ui&quot;,</span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    &quot;test:e2e:report&quot;: &quot;playwright show-report e2e/playwright-report&quot;</span></span></code></pre>
</details>


```json
"scripts": {
  "typecheck": "tsgo -b",
  "start": "vite",
  "dev": "vite",
  "build": "vite build",
  "test": "bun run test:unit",
  "test:ci": "mkdir -p .artifacts/unit && bun test --preload ./happydom.ts ./src --reporter=junit --reporter-outfile=.artifacts/unit/junit.xml",
  "test:unit": "bun test --preload ./happydom.ts ./src",
  "test:e2e": "playwright test"
}
```

Web app 的单测用 `happydom`，E2E 用 Playwright。这和 Java Web 项目里 “JUnit 单元测试 + Testcontainers/Playwright/Selenium 集成测试” 的分层很像。

### 7.7 真实测试风格：少 mock，测 reducer / 工具流

路径：`packages/app/src/context/global-sync/event-reducer.test.ts:1-6`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/app/src/context/global-sync/event-reducer.test.ts</span>
    <span class="source-ref-path"><code>packages/app/src/context/global-sync/event-reducer.test.ts:1-6</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1</span><span class="source-line-text">import { describe, expect, test } from &quot;bun:test&quot;</span></span>
<span class="source-line"><span class="source-line-number">2</span><span class="source-line-text">import type { Message, Part, PermissionRequest, Project, QuestionRequest, Session } from &quot;@opencode-ai/sdk/v2/client&quot;</span></span>
<span class="source-line"><span class="source-line-number">3</span><span class="source-line-text">import { createStore } from &quot;solid-js/store&quot;</span></span>
<span class="source-line"><span class="source-line-number">4</span><span class="source-line-text">import type { State } from &quot;./types&quot;</span></span>
<span class="source-line"><span class="source-line-number">5</span><span class="source-line-text">import { applyDirectoryEvent, applyGlobalEvent, cleanupDroppedSessionCaches } from &quot;./event-reducer&quot;</span></span>
<span class="source-line"><span class="source-line-number">6</span><span class="source-line-text"></span></span></code></pre>
</details>


```ts
import { describe, expect, test } from "bun:test"
import type { Message, Part, PermissionRequest, Project, QuestionRequest, Session } from "@opencode-ai/sdk/v2/client"
import { createStore } from "solid-js/store"
import type { State } from "./types"
import { applyDirectoryEvent, applyGlobalEvent, cleanupDroppedSessionCaches } from "./event-reducer"
```

这不是测试 UI 截图，而是测试事件 reducer。它符合 `AGENTS.md:121-122` 的要求：尽量测真实实现，不把逻辑复制到测试里。

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">AGENTS.md</span>
    <span class="source-ref-path"><code>AGENTS.md:121-122</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">- Avoid mocks as much as possible</span></span>
<span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">- Test actual implementation, do not duplicate logic into tests</span></span></code></pre>
</details>


路径：`packages/app/src/context/global-sync/event-reducer.test.ts:88-133`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/app/src/context/global-sync/event-reducer.test.ts</span>
    <span class="source-ref-path"><code>packages/app/src/context/global-sync/event-reducer.test.ts:88-133</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">describe(&quot;applyGlobalEvent&quot;, () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">  test(&quot;upserts project.updated in sorted position&quot;, () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">    const project = [{ id: &quot;a&quot; }, { id: &quot;c&quot; }] as Project[]</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">    let refreshCount = 0</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">    applyGlobalEvent({</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">      event: { type: &quot;project.updated&quot;, properties: { id: &quot;b&quot; } },</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">      project,</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">      refresh: () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">        refreshCount += 1</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">      setGlobalProject(next) {</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">        if (typeof next === &quot;function&quot;) next(project)</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">    expect(project.map((x) =&gt; x.id)).toEqual([&quot;a&quot;, &quot;b&quot;, &quot;c&quot;])</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">    expect(refreshCount).toBe(0)</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">  test(&quot;handles global.disposed by triggering refresh&quot;, () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">    let refreshCount = 0</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">    applyGlobalEvent({</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">      event: { type: &quot;global.disposed&quot; },</span></span>
<span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">      project: [],</span></span>
<span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">      refresh: () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">        refreshCount += 1</span></span>
<span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">      setGlobalProject() {},</span></span>
<span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">117</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">118</span><span class="source-line-text">    expect(refreshCount).toBe(1)</span></span>
<span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">120</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">  test(&quot;handles server.connected by triggering refresh&quot;, () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">    let refreshCount = 0</span></span>
<span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">    applyGlobalEvent({</span></span>
<span class="source-line"><span class="source-line-number">124</span><span class="source-line-text">      event: { type: &quot;server.connected&quot; },</span></span>
<span class="source-line"><span class="source-line-number">125</span><span class="source-line-text">      project: [],</span></span>
<span class="source-line"><span class="source-line-number">126</span><span class="source-line-text">      refresh: () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">        refreshCount += 1</span></span>
<span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">      setGlobalProject() {},</span></span>
<span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">131</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">    expect(refreshCount).toBe(1)</span></span>
<span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">  })</span></span></code></pre>
</details>


```ts
describe("applyGlobalEvent", () => {
  test("upserts project.updated in sorted position", () => {
    const project = [{ id: "a" }, { id: "c" }] as Project[]
    let refreshCount = 0
    applyGlobalEvent({
      event: { type: "project.updated", properties: { id: "b" } },
      project,
      refresh: () => {
        refreshCount += 1
      },
      setGlobalProject(next) {
        if (typeof next === "function") next(project)
      },
    })

    expect(project.map((x) => x.id)).toEqual(["a", "b", "c"])
    expect(refreshCount).toBe(0)
  })
})
```

这个测试用一个很小的输入验证状态更新行为。Java 类比是 service-level unit test：构造输入 DTO，调用真实 service 方法，断言状态。

路径：`packages/llm/test/tool-stream.test.ts:1-23`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/llm/test/tool-stream.test.ts</span>
    <span class="source-ref-path"><code>packages/llm/test/tool-stream.test.ts:1-23</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1</span><span class="source-line-text">import { describe, expect } from &quot;bun:test&quot;</span></span>
<span class="source-line"><span class="source-line-number">2</span><span class="source-line-text">import { Effect } from &quot;effect&quot;</span></span>
<span class="source-line"><span class="source-line-number">3</span><span class="source-line-text">import { LLMError } from &quot;../src/schema&quot;</span></span>
<span class="source-line"><span class="source-line-number">4</span><span class="source-line-text">import { ToolStream } from &quot;../src/protocols/utils/tool-stream&quot;</span></span>
<span class="source-line"><span class="source-line-number">5</span><span class="source-line-text">import { it } from &quot;./lib/effect&quot;</span></span>
<span class="source-line"><span class="source-line-number">6</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">const ADAPTER = &quot;test-route&quot;</span></span>
<span class="source-line"><span class="source-line-number">8</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">describe(&quot;ToolStream&quot;, () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">  it.effect(&quot;starts from OpenAI-style deltas and finalizes parsed input&quot;, () =&gt;</span></span>
<span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">    Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">      const first = ToolStream.appendOrStart(</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">        ADAPTER,</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">        ToolStream.empty&lt;number&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">        0,</span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">        { id: &quot;call_1&quot;, name: &quot;lookup&quot;, text: '{&quot;query&quot;' },</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">        &quot;missing tool&quot;,</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">      if (ToolStream.isError(first)) return yield* first</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">      const second = ToolStream.appendOrStart(ADAPTER, first.tools, 0, { text: ':&quot;weather&quot;}' }, &quot;missing tool&quot;)</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">      if (ToolStream.isError(second)) return yield* second</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">      const finished = yield* ToolStream.finish(ADAPTER, second.tools, 0)</span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text"></span></span></code></pre>
</details>


```ts
import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { LLMError } from "../src/schema"
import { ToolStream } from "../src/protocols/utils/tool-stream"
import { it } from "./lib/effect"

describe("ToolStream", () => {
  it.effect("starts from OpenAI-style deltas and finalizes parsed input", () =>
    Effect.gen(function* () {
      const first = ToolStream.appendOrStart(
        ADAPTER,
        ToolStream.empty<number>(),
        0,
        { id: "call_1", name: "lookup", text: '{"query"' },
        "missing tool",
      )
```

这个测试更贴近 agent 核心风险：模型 provider 可能分片输出 tool call JSON，测试要确认分片能够被累积、解析、结束。

### 7.8 SDK 生成是工程化的一等流程

路径：`packages/sdk/js/script/build.ts:14-47`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/sdk/js/script/build.ts</span>
    <span class="source-ref-path"><code>packages/sdk/js/script/build.ts:14-47</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">await $`bun dev generate &gt; ${dir}/openapi.json`.cwd(opencode)</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">await createClient({</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  input: &quot;./openapi.json&quot;,</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">  output: {</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    path: &quot;./src/v2/gen&quot;,</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    tsConfigPath: path.join(dir, &quot;tsconfig.json&quot;),</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">    clean: true,</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">  },</span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  plugins: [</span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    {</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">      name: &quot;@hey-api/typescript&quot;,</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">      exportFromIndex: false,</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">    {</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">      name: &quot;@hey-api/sdk&quot;,</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">      instance: &quot;OpencodeClient&quot;,</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      exportFromIndex: false,</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">      auth: false,</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">      paramsStructure: &quot;flat&quot;,</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">    {</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">      name: &quot;@hey-api/client-fetch&quot;,</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">      exportFromIndex: false,</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">      baseUrl: &quot;http://localhost:4096&quot;,</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  ],</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">})</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">await $`bun prettier --write src/gen`</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">await $`bun prettier --write src/v2`</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">await $`rm -rf dist`</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">await $`bun tsc`</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">await $`rm openapi.json`</span></span></code></pre>
</details>


```ts
await $`bun dev generate > ${dir}/openapi.json`.cwd(opencode)

await createClient({
  input: "./openapi.json",
  output: {
    path: "./src/v2/gen",
    tsConfigPath: path.join(dir, "tsconfig.json"),
    clean: true,
  },
  plugins: [
    { name: "@hey-api/typescript", exportFromIndex: false },
    { name: "@hey-api/sdk", instance: "OpencodeClient", exportFromIndex: false, auth: false, paramsStructure: "flat" },
    { name: "@hey-api/client-fetch", exportFromIndex: false, baseUrl: "http://localhost:4096" },
  ],
})

await $`bun prettier --write src/gen`
await $`bun prettier --write src/v2`
await $`rm -rf dist`
await $`bun tsc`
await $`rm openapi.json`
```

这里说明 SDK 不是手写维护，而是通过 OpenAPI 生成。这和 Java 里用 OpenAPI Generator 生成 Feign/Retrofit client 是同一类工程实践。

注意：脚本里有 `rm -rf dist` 和 `rm openapi.json`，这是 build 脚本内部行为。本学习站点没有执行这些脚本，只是阅读源码。

### 7.9 发布构建比想象中复杂

路径：`packages/opencode/script/build.ts:57-81`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/script/build.ts</span>
    <span class="source-ref-path"><code>packages/opencode/script/build.ts:57-81</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">const createEmbeddedWebUIBundle = async () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">  console.log(`Building Web UI to embed in the binary`)</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">  const appDir = path.join(import.meta.dirname, &quot;../../app&quot;)</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">  const dist = path.join(appDir, &quot;dist&quot;)</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">  await $`bun run --cwd ${appDir} build`</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">  const files = (await Array.fromAsync(new Bun.Glob(&quot;**/*&quot;).scan({ cwd: dist })))</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">    .map((file) =&gt; file.replaceAll(&quot;\\&quot;, &quot;/&quot;))</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    .filter((file) =&gt; !file.endsWith(&quot;.map&quot;))</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">    .sort()</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">  const imports = files.map((file, i) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">    const spec = path.relative(dir, path.join(dist, file)).replaceAll(&quot;\\&quot;, &quot;/&quot;)</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">    return `import file_${i} from ${JSON.stringify(spec.startsWith(&quot;.&quot;) ? spec : `./${spec}`)} with { type: &quot;file&quot; };`</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">  const entries = files.map((file, i) =&gt; `  ${JSON.stringify(file)}: file_${i},`)</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">  return [</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">    `// Import all files as file_$i with type: &quot;file&quot;`,</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">    ...imports,</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">    `// Export with original mappings`,</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">    `export default {`,</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">    ...entries,</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">    `}`,</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">  ].join(&quot;\n&quot;)</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">const embeddedFileMap = skipEmbedWebUi ? null : await createEmbeddedWebUIBundle()</span></span></code></pre>
</details>


```ts
const createEmbeddedWebUIBundle = async () => {
  console.log(`Building Web UI to embed in the binary`)
  const appDir = path.join(import.meta.dirname, "../../app")
  const dist = path.join(appDir, "dist")
  await $`bun run --cwd ${appDir} build`
  const files = (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: dist })))
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => !file.endsWith(".map"))
    .sort()
```

OpenCode 的 CLI binary 会嵌入 Web UI bundle。也就是说，工程化支撑的是“一个 agent runtime + 内嵌 UI + 多平台二进制”的交付形态。

路径：`packages/opencode/script/build.ts:83-168`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/script/build.ts</span>
    <span class="source-ref-path"><code>packages/opencode/script/build.ts:83-168</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">const allTargets: {</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">  os: string</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">  arch: &quot;arm64&quot; | &quot;x64&quot;</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">  abi?: &quot;musl&quot;</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">  avx2?: false</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">}[] = [</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">  {</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">    os: &quot;linux&quot;,</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">    arch: &quot;arm64&quot;,</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">  },</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">  {</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">    os: &quot;linux&quot;,</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">    arch: &quot;x64&quot;,</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">  },</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">  {</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">    os: &quot;linux&quot;,</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">    arch: &quot;x64&quot;,</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">    avx2: false,</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">  },</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">  {</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">    os: &quot;linux&quot;,</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">    arch: &quot;arm64&quot;,</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">    abi: &quot;musl&quot;,</span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">  },</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">  {</span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">    os: &quot;linux&quot;,</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">    arch: &quot;x64&quot;,</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">    abi: &quot;musl&quot;,</span></span>
<span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">  },</span></span>
<span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">  {</span></span>
<span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">    os: &quot;linux&quot;,</span></span>
<span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">    arch: &quot;x64&quot;,</span></span>
<span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">    abi: &quot;musl&quot;,</span></span>
<span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">    avx2: false,</span></span>
<span class="source-line"><span class="source-line-number">117</span><span class="source-line-text">  },</span></span>
<span class="source-line"><span class="source-line-number">118</span><span class="source-line-text">  {</span></span>
<span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">    os: &quot;darwin&quot;,</span></span>
<span class="source-line"><span class="source-line-number">120</span><span class="source-line-text">    arch: &quot;arm64&quot;,</span></span>
<span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">  },</span></span>
<span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">  {</span></span>
<span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">    os: &quot;darwin&quot;,</span></span>
<span class="source-line"><span class="source-line-number">124</span><span class="source-line-text">    arch: &quot;x64&quot;,</span></span>
<span class="source-line"><span class="source-line-number">125</span><span class="source-line-text">  },</span></span>
<span class="source-line"><span class="source-line-number">126</span><span class="source-line-text">  {</span></span>
<span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">    os: &quot;darwin&quot;,</span></span>
<span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">    arch: &quot;x64&quot;,</span></span>
<span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">    avx2: false,</span></span>
<span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">  },</span></span>
<span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">  {</span></span>
<span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">    os: &quot;win32&quot;,</span></span>
<span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">    arch: &quot;arm64&quot;,</span></span>
<span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">  },</span></span>
<span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">  {</span></span>
<span class="source-line"><span class="source-line-number">136</span><span class="source-line-text">    os: &quot;win32&quot;,</span></span>
<span class="source-line"><span class="source-line-number">137</span><span class="source-line-text">    arch: &quot;x64&quot;,</span></span>
<span class="source-line"><span class="source-line-number">138</span><span class="source-line-text">  },</span></span>
<span class="source-line"><span class="source-line-number">139</span><span class="source-line-text">  {</span></span>
<span class="source-line"><span class="source-line-number">140</span><span class="source-line-text">    os: &quot;win32&quot;,</span></span>
<span class="source-line"><span class="source-line-number">141</span><span class="source-line-text">    arch: &quot;x64&quot;,</span></span>
<span class="source-line"><span class="source-line-number">142</span><span class="source-line-text">    avx2: false,</span></span>
<span class="source-line"><span class="source-line-number">143</span><span class="source-line-text">  },</span></span>
<span class="source-line"><span class="source-line-number">144</span><span class="source-line-text">]</span></span>
<span class="source-line"><span class="source-line-number">145</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">146</span><span class="source-line-text">const targets = singleFlag</span></span>
<span class="source-line"><span class="source-line-number">147</span><span class="source-line-text">  ? allTargets.filter((item) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">148</span><span class="source-line-text">      if (item.os !== process.platform || item.arch !== process.arch) {</span></span>
<span class="source-line"><span class="source-line-number">149</span><span class="source-line-text">        return false</span></span>
<span class="source-line"><span class="source-line-number">150</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">151</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">      // When building for the current platform, prefer a single native binary by default.</span></span>
<span class="source-line"><span class="source-line-number">153</span><span class="source-line-text">      // Baseline binaries require additional Bun artifacts and can be flaky to download.</span></span>
<span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">      if (item.avx2 === false) {</span></span>
<span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">        return baselineFlag</span></span>
<span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">157</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">      // also skip abi-specific builds for the same reason</span></span>
<span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">      if (item.abi !== undefined) {</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">        return false</span></span>
<span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">      return true</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">  : allTargets</span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">await $`rm -rf dist`</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text"></span></span></code></pre>
</details>


```ts
const allTargets: {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
}[] = [
  { os: "linux", arch: "arm64" },
  { os: "linux", arch: "x64" },
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "win32", arch: "arm64" },
  { os: "win32", arch: "x64" },
]
```

这段告诉你：成熟 coding agent 不是只跑在开发者电脑的一次性脚本，它要考虑跨平台构建和分发。

## 8. 关键 TypeScript 语法复习

### 8.1 `import type`

路径：`packages/app/src/context/global-sync/event-reducer.test.ts:2-4`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/app/src/context/global-sync/event-reducer.test.ts</span>
    <span class="source-ref-path"><code>packages/app/src/context/global-sync/event-reducer.test.ts:2-4</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">2</span><span class="source-line-text">import type { Message, Part, PermissionRequest, Project, QuestionRequest, Session } from &quot;@opencode-ai/sdk/v2/client&quot;</span></span>
<span class="source-line"><span class="source-line-number">3</span><span class="source-line-text">import { createStore } from &quot;solid-js/store&quot;</span></span>
<span class="source-line"><span class="source-line-number">4</span><span class="source-line-text">import type { State } from &quot;./types&quot;</span></span></code></pre>
</details>


```ts
import type { Message, Part, PermissionRequest, Project, QuestionRequest, Session } from "@opencode-ai/sdk/v2/client"
import type { State } from "./types"
```

`import type` 只引入类型，运行时不会产生 import。Java 没有这个概念，因为 Java 的 import 本来就是编译期符号解析；TS 需要区分“类型导入”和“运行时代码导入”。

### 8.2 对象展开 `...input`

路径：`packages/app/src/context/global-sync/event-reducer.test.ts:60-86`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/app/src/context/global-sync/event-reducer.test.ts</span>
    <span class="source-ref-path"><code>packages/app/src/context/global-sync/event-reducer.test.ts:60-86</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">const baseState = (input: Partial&lt;State&gt; = {}) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">  ({</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">    status: &quot;complete&quot;,</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">    agent: [],</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    command: [],</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">    project: &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">    projectMeta: undefined,</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">    icon: undefined,</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">    provider: {} as State[&quot;provider&quot;],</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">    config: {} as State[&quot;config&quot;],</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">    path: { directory: &quot;/tmp&quot; } as State[&quot;path&quot;],</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">    session: [],</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">    sessionTotal: 0,</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">    session_status: {},</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">    session_diff: {},</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">    todo: {},</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">    permission: {},</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">    question: {},</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">    mcp: {},</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">    lsp: [],</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">    vcs: undefined,</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">    limit: 10,</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">    message: {},</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">    part: {},</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">    part_text_accum_delta: {},</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">    ...input,</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">  }) as State</span></span></code></pre>
</details>


```ts
const baseState = (input: Partial<State> = {}) =>
  ({
    status: "complete",
    agent: [],
    command: [],
    ...input,
  }) as State
```

`...input` 用来覆盖默认值。Java 里常见写法是 Builder 默认值 + `withXxx` 覆盖。

### 8.3 `Partial<State>`

同一段代码里的 `Partial<State>` 表示“State 的所有字段都变成可选”。这对测试很常用：只覆盖本 case 关心的字段。

Java 类比：测试里构造一个 `StateBuilder`，只设置少数字段，其余走默认值。

### 8.4 泛型对象类型

路径：`packages/opencode/script/build.ts:83-88`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/script/build.ts</span>
    <span class="source-ref-path"><code>packages/opencode/script/build.ts:83-88</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">const allTargets: {</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">  os: string</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">  arch: &quot;arm64&quot; | &quot;x64&quot;</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">  abi?: &quot;musl&quot;</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">  avx2?: false</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">}[] = [</span></span></code></pre>
</details>


```ts
const allTargets: {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
}[] = [
```

这里是数组元素的 inline type。`arch` 是 literal union，只能是 `"arm64"` 或 `"x64"`；`abi?` 是 optional property。

### 8.5 Bun 的 shell template

路径：`packages/sdk/js/script/build.ts:14`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/sdk/js/script/build.ts</span>
    <span class="source-ref-path"><code>packages/sdk/js/script/build.ts:14</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">await $`bun dev generate &gt; ${dir}/openapi.json`.cwd(opencode)</span></span></code></pre>
</details>


```ts
await $`bun dev generate > ${dir}/openapi.json`.cwd(opencode)
```

`$` 来自 Bun，语法像 shell command builder。Java 类比是 `ProcessBuilder`，但 Bun 把命令写成 tagged template，并能链式设置 cwd。

### 8.6 `as Project[]` / `as Message`

路径：`packages/app/src/context/global-sync/event-reducer.test.ts:88-90`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/app/src/context/global-sync/event-reducer.test.ts</span>
    <span class="source-ref-path"><code>packages/app/src/context/global-sync/event-reducer.test.ts:88-90</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">describe(&quot;applyGlobalEvent&quot;, () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">  test(&quot;upserts project.updated in sorted position&quot;, () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">    const project = [{ id: &quot;a&quot; }, { id: &quot;c&quot; }] as Project[]</span></span></code></pre>
</details>


```ts
const project = [{ id: "a" }, { id: "c" }] as Project[]
```

这是类型断言，告诉 TypeScript “把这个对象当成 Project[]”。Java 类比不完全对应，比较像测试里用简化对象填充 DTO；但 TS 的断言只影响编译期，不会在运行时补字段。

## 9. 涉及的设计模式和架构思想

### 9.1 Monorepo + Package Boundary

每个 package 有自己的脚本和 exports。根目录只负责编排。这个边界对 agent 项目很重要，因为 CLI、UI、SDK、LLM、plugin 往往演进速度不同。

### 9.2 Generated Client

SDK 由 OpenAPI 生成，降低 API drift。Java 后端常见做法是 OpenAPI contract + generated client/server stub。

### 9.3 Test Real Implementation

`AGENTS.md:121-122` 明确要求少 mock、测真实实现。这对 agent 项目尤其关键，因为大量 bug 来自流式事件、状态同步、provider 兼容性，不适合只 mock happy path。

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">AGENTS.md</span>
    <span class="source-ref-path"><code>AGENTS.md:121-122</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">- Avoid mocks as much as possible</span></span>
<span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">- Test actual implementation, do not duplicate logic into tests</span></span></code></pre>
</details>


### 9.4 Build Script as Application Code

`packages/opencode/script/build.ts` 很像一个小程序：读取 migration、生成 embedded Web UI、计算 targets、调用 `Bun.build`。复杂 build 不写成一行 shell，有利于类型检查和维护。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

工程化层本身不参与运行时协作，但它保护这些模块：

- Tool/provider 相关测试在 `packages/llm/test/tool-stream.test.ts` 这类文件中验证 provider tool stream 边界。
- Session/UI 同步测试在 `packages/app/src/context/global-sync/event-reducer.test.ts` 验证事件到状态的转换。
- 文件系统和 shell 这类平台相关能力通过 `packages/opencode/package.json:27-38` 的 conditional imports 区分 Bun/Node 实现。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/package.json</span>
      <span class="source-ref-path"><code>packages/opencode/package.json:27-38</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">  &quot;imports&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">    &quot;#db&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">      &quot;bun&quot;: &quot;./src/storage/db.bun.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">      &quot;node&quot;: &quot;./src/storage/db.node.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      &quot;default&quot;: &quot;./src/storage/db.bun.ts&quot;</span></span>
  <span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">    &quot;#pty&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">      &quot;bun&quot;: &quot;./src/pty/pty.bun.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">      &quot;node&quot;: &quot;./src/pty/pty.node.ts&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">      &quot;default&quot;: &quot;./src/pty/pty.bun.ts&quot;</span></span>
  <span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">    }</span></span>
  <span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">  },</span></span></code></pre>
  </details>

- SDK build 通过 `packages/sdk/js/script/build.ts` 把 server API contract 转成 client，保护外部调用者。

## 11. 如果自己实现 mini agent，这一章对应什么代码

最小工程化建议：

```text
mini-agent/
  package.json
  tsconfig.json
  src/
    cli.ts
    session.ts
    llm.ts
    tool.ts
  test/
    session.test.ts
    tool-stream.test.ts
```

第一版脚本可以是：

```json
{
  "type": "module",
  "scripts": {
    "dev": "bun run src/cli.ts",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  }
}
```

如果你以后拆包，再学习 OpenCode 的 workspace + catalog + package-level tests。

## 12. 费曼复述区

### 12.1 请你用自己的话解释

请不用“monorepo”“Turbo”这些词，向一个 Java 同事解释：

> 为什么 OpenCode 根目录不能直接跑测试？为什么要让每个 package 自己跑？

### 12.2 如果解释不出来，说明卡在这里

常见卡点：

- 把根目录当成普通单体 Node 项目。
- 不理解 workspace catalog 和子包依赖的关系。
- 把 `turbo.json` 当成测试框架，而不是 task graph。
- 以为 generated SDK 是手写文件。

### 12.3 换一种说法再解释

OpenCode 的根目录像公司总部：总部定版本、定流程、定规则，但不会替每个团队跑自己的业务验收。核心 runtime、Web app、SDK 都有自己的测试方式，因为它们面对的运行环境不同。

## 13. 练习题

### 入门题

1. 找出根目录 `package.json` 里所有 `dev:*` 脚本，说出它们分别启动哪个 package。
2. 找出 `packages/opencode/package.json` 的 `bin` 字段，说出 CLI 名称是什么。
3. 解释 `bunfig.toml` 为什么把 test root 指向 `do-not-run-tests-from-root`。

### 进阶题

1. 根据 `turbo.json`，解释为什么 `opencode#test` 要依赖 `^build`。
2. 阅读 `packages/sdk/js/script/build.ts`，画出 SDK 生成流程。
3. 阅读一个 app 测试文件，判断它是测纯函数、状态 reducer，还是 DOM 行为。

### 源码追踪题

1. 从 `package.json:15` 的 `bun turbo typecheck` 追到 `packages/opencode/package.json:9` 和 `packages/app/package.json:12`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">package.json</span>
      <span class="source-ref-path"><code>package.json:15</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    &quot;typecheck&quot;: &quot;bun turbo typecheck&quot;,</span></span></code></pre>
  </details>

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/package.json</span>
      <span class="source-ref-path"><code>packages/opencode/package.json:9</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">    &quot;typecheck&quot;: &quot;tsgo --noEmit&quot;,</span></span></code></pre>
  </details>

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/app/package.json</span>
      <span class="source-ref-path"><code>packages/app/package.json:12</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">    &quot;typecheck&quot;: &quot;tsgo -b&quot;,</span></span></code></pre>
  </details>

2. 从 `AGENTS.md:119-127` 追到根目录 `package.json:21` 和 `bunfig.toml:7-8`，说明规则如何被代码/配置落实。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">AGENTS.md</span>
      <span class="source-ref-path"><code>AGENTS.md:119-127</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">## Testing</span></span>
  <span class="source-line"><span class="source-line-number">120</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">- Avoid mocks as much as possible</span></span>
  <span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">- Test actual implementation, do not duplicate logic into tests</span></span>
  <span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">- Tests cannot run from repo root (guard: `do-not-run-tests-from-root`); run from package dirs like `packages/opencode`.</span></span>
  <span class="source-line"><span class="source-line-number">124</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">125</span><span class="source-line-text">## Type Checking</span></span>
  <span class="source-line"><span class="source-line-number">126</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">- Always run `bun typecheck` from package directories (e.g., `packages/opencode`), never `tsc` directly.</span></span></code></pre>
  </details>

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">package.json</span>
      <span class="source-ref-path"><code>package.json:21</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">    &quot;test&quot;: &quot;echo 'do not run tests from root' &amp;&amp; exit 1&quot;</span></span></code></pre>
  </details>

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">bunfig.toml</span>
      <span class="source-ref-path"><code>bunfig.toml:7-8</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">[test]</span></span>
  <span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">root = &quot;./do-not-run-tests-from-root&quot;</span></span></code></pre>
  </details>

3. 从 `packages/sdk/js/package.json:9` 追到 `packages/sdk/js/script/build.ts:14-47`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/sdk/js/package.json</span>
      <span class="source-ref-path"><code>packages/sdk/js/package.json:9</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">    &quot;build&quot;: &quot;bun ./script/build.ts&quot;</span></span></code></pre>
  </details>

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/sdk/js/script/build.ts</span>
      <span class="source-ref-path"><code>packages/sdk/js/script/build.ts:14-47</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">await $`bun dev generate &gt; ${dir}/openapi.json`.cwd(opencode)</span></span>
  <span class="source-line"><span class="source-line-number">15</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">await createClient({</span></span>
  <span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  input: &quot;./openapi.json&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">  output: {</span></span>
  <span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    path: &quot;./src/v2/gen&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    tsConfigPath: path.join(dir, &quot;tsconfig.json&quot;),</span></span>
  <span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">    clean: true,</span></span>
  <span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">  },</span></span>
  <span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  plugins: [</span></span>
  <span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    {</span></span>
  <span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">      name: &quot;@hey-api/typescript&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">      exportFromIndex: false,</span></span>
  <span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">    {</span></span>
  <span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">      name: &quot;@hey-api/sdk&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">      instance: &quot;OpencodeClient&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      exportFromIndex: false,</span></span>
  <span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">      auth: false,</span></span>
  <span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">      paramsStructure: &quot;flat&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">    {</span></span>
  <span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">      name: &quot;@hey-api/client-fetch&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">      exportFromIndex: false,</span></span>
  <span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">      baseUrl: &quot;http://localhost:4096&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  ],</span></span>
  <span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">})</span></span>
  <span class="source-line"><span class="source-line-number">42</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">await $`bun prettier --write src/gen`</span></span>
  <span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">await $`bun prettier --write src/v2`</span></span>
  <span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">await $`rm -rf dist`</span></span>
  <span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">await $`bun tsc`</span></span>
  <span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">await $`rm openapi.json`</span></span></code></pre>
  </details>


### 小实现题

给 mini agent 加一个最小测试：

- `tool-stream.test.ts`：模拟模型分两次输出 `{"filePath"` 和 `:"README.md"}`。
- 断言最后能得到 `{ filePath: "README.md" }`。
- 不要 mock parser，直接测试你的真实 `appendToolDelta` 实现。

## 14. 源码追踪任务

建议你真的打开这些文件：

1. `package.json`
2. `turbo.json`
3. `bunfig.toml`
4. `AGENTS.md`
5. `packages/opencode/package.json`
6. `packages/app/package.json`
7. `packages/sdk/js/script/build.ts`
8. `packages/app/src/context/global-sync/event-reducer.test.ts`
9. `packages/llm/test/tool-stream.test.ts`

每读一个文件，写下它回答的是“版本、任务、测试、构建、发布、规范”里的哪一类问题。

## 15. 面试式自测

1. 如果你要给 OpenCode 增加一个新 package，你会检查哪些根目录配置？
2. 为什么根目录 `test` 明确失败，反而是好事？
3. `catalog:` 解决了什么依赖管理问题？
4. 为什么 SDK 生成应该进入 CI？
5. 对 agent 项目来说，为什么 tool stream 解析值得单独测试？
6. 如果一个测试复制了生产逻辑，风险是什么？

## 16. 下一步阅读建议

下一章建议读“从 OpenCode 反推 mini coding agent”。工程化这章告诉你项目如何站稳，mini agent 章会告诉你从哪些 runtime 骨架开始写。

如果要继续深入工程化，可以单独拆 3 个子页：

- `ProviderTransform` 的兼容性测试。
- HTTP API exercise 的覆盖模式。
- 多平台二进制 build 与 embedded Web UI。

