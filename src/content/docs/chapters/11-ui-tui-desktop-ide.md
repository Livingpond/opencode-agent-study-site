---
title: "UI / TUI / Desktop / IDE 相关"
description: "理解 CLI/TUI、Web app、Desktop 和 VS Code extension 如何复用同一套 runtime。"
sidebar:
  label: "11. UI / TUI / Desktop / IDE 相关"
  order: 11
---

<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">已完成</span></div>
  <div><strong>难度</strong>中等到较难</div>
  <div><strong>预计阅读</strong>35 分钟</div>
  <div><strong>源文件</strong><a href="/markdown/11-ui-tui-desktop-ide.md"><code>markdown/11-ui-tui-desktop-ide.md</code></a></div>
</div>

## Agent 生成档案

- 章节 ID：`11-ui-tui-desktop-ide`
- 章节摘要：理解 CLI/TUI、Web app、Desktop 和 VS Code extension 如何复用同一套 runtime。
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

<li><code>packages/opencode/src/cli/cmd/run.ts</code></li>
<li><code>packages/opencode/src/cli/cmd/tui/</code></li>
<li><code>packages/app/package.json</code></li>
<li><code>packages/ui/package.json</code></li>
<li><code>packages/desktop/package.json</code></li>
<li><code>sdks/vscode/package.json</code></li>
<li><code>sdks/vscode/src/extension.ts</code></li>

</ul>


> 对应模块：`study-output/02-opencode-function-outline.md` 的 “2.11 UI / TUI / Desktop / IDE 相关”。  
> 主要源码：`packages/opencode/src/cli/cmd/run.ts`、`packages/opencode/src/cli/cmd/run/runtime.ts`、`packages/opencode/src/cli/cmd/tui/app.tsx`、`packages/opencode/src/cli/cmd/tui/context/sdk.tsx`、`packages/opencode/src/cli/cmd/tui/context/sync-v2.tsx`、`packages/app/src/app.tsx`、`packages/app/src/context/sdk.tsx`、`packages/app/src/context/global-sdk.tsx`、`packages/desktop/src/main/index.ts`、`packages/desktop/src/main/server.ts`、`packages/desktop/src/renderer/index.tsx`、`sdks/vscode/src/extension.ts`。

## 0. 本章学习目标

这一章的重点不是 UI 细节，而是 OpenCode 如何让多种界面复用同一个 agent runtime。

学完你应该能说清：

- CLI interactive 和 non-interactive 如何共用 SDK/session API。
- TUI 如何通过 SDK 和 event stream 同步 message/tool/reasoning 状态。
- Web app 如何用 `AppInterface`、`ServerProvider`、`GlobalSDKProvider` 连接 server。
- Desktop 如何启动本地 sidecar server，再让 renderer 加载同一套 app。
- VS Code extension 如何通过 terminal 启动 opencode，并把当前文件以 `@file#Lx` 形式追加给 TUI。
- 为什么 UI 层不应该重写 agent loop。

## 1. 一句话讲明白

OpenCode 的 UI/TUI/Desktop/IDE 层是“多种壳，共用一个 runtime”：CLI/TUI/Web/Desktop/VS Code 都通过 SDK、HTTP API、SSE event stream 或本地 sidecar 连接到同一个 session/tool/provider/permission 后端；UI 负责输入、展示、同步和审批，不负责重新实现 agent 决策。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:768-879</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">768</span><span class="source-line-text">        if (!args.interactive) {</span></span>
<span class="source-line"><span class="source-line-number">769</span><span class="source-line-text">          const events = await client.event.subscribe()</span></span>
<span class="source-line"><span class="source-line-number">770</span><span class="source-line-text">          loop(client, events).catch((e) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">771</span><span class="source-line-text">            console.error(e)</span></span>
<span class="source-line"><span class="source-line-number">772</span><span class="source-line-text">            process.exit(1)</span></span>
<span class="source-line"><span class="source-line-number">773</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">774</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">775</span><span class="source-line-text">          if (args.command) {</span></span>
<span class="source-line"><span class="source-line-number">776</span><span class="source-line-text">            const result = await client.session.command({</span></span>
<span class="source-line"><span class="source-line-number">777</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">778</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">779</span><span class="source-line-text">              model: args.model,</span></span>
<span class="source-line"><span class="source-line-number">780</span><span class="source-line-text">              command: args.command,</span></span>
<span class="source-line"><span class="source-line-number">781</span><span class="source-line-text">              arguments: message,</span></span>
<span class="source-line"><span class="source-line-number">782</span><span class="source-line-text">              variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">783</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">784</span><span class="source-line-text">            if (result.error) {</span></span>
<span class="source-line"><span class="source-line-number">785</span><span class="source-line-text">              if (!emit(&quot;error&quot;, { error: result.error })) UI.error(formatRunError(result.error))</span></span>
<span class="source-line"><span class="source-line-number">786</span><span class="source-line-text">              process.exitCode = 1</span></span>
<span class="source-line"><span class="source-line-number">787</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">788</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">789</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">790</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">791</span><span class="source-line-text">          const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">792</span><span class="source-line-text">          const result = await client.session.prompt({</span></span>
<span class="source-line"><span class="source-line-number">793</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">794</span><span class="source-line-text">            agent,</span></span>
<span class="source-line"><span class="source-line-number">795</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">796</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">797</span><span class="source-line-text">            parts: [...files, { type: &quot;text&quot;, text: message }],</span></span>
<span class="source-line"><span class="source-line-number">798</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">799</span><span class="source-line-text">          if (result.error) {</span></span>
<span class="source-line"><span class="source-line-number">800</span><span class="source-line-text">            if (!emit(&quot;error&quot;, { error: result.error })) UI.error(formatRunError(result.error))</span></span>
<span class="source-line"><span class="source-line-number">801</span><span class="source-line-text">            process.exitCode = 1</span></span>
<span class="source-line"><span class="source-line-number">802</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">803</span><span class="source-line-text">          return</span></span>
<span class="source-line"><span class="source-line-number">804</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">805</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">806</span><span class="source-line-text">        const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">807</span><span class="source-line-text">        const { runInteractiveMode } = await runtimeTask</span></span>
<span class="source-line"><span class="source-line-number">808</span><span class="source-line-text">        try {</span></span>
<span class="source-line"><span class="source-line-number">809</span><span class="source-line-text">          await runInteractiveMode({</span></span>
<span class="source-line"><span class="source-line-number">810</span><span class="source-line-text">            sdk: client,</span></span>
<span class="source-line"><span class="source-line-number">811</span><span class="source-line-text">            directory: cwd,</span></span>
<span class="source-line"><span class="source-line-number">812</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">813</span><span class="source-line-text">            sessionTitle: sess.title,</span></span>
<span class="source-line"><span class="source-line-number">814</span><span class="source-line-text">            resume: Boolean(args.session || args.continue) &amp;&amp; !args.fork,</span></span>
<span class="source-line"><span class="source-line-number">815</span><span class="source-line-text">            replay,</span></span>
<span class="source-line"><span class="source-line-number">816</span><span class="source-line-text">            replayLimit: args[&quot;replay-limit&quot;],</span></span>
<span class="source-line"><span class="source-line-number">817</span><span class="source-line-text">            agent,</span></span>
<span class="source-line"><span class="source-line-number">818</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">819</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">820</span><span class="source-line-text">            files,</span></span>
<span class="source-line"><span class="source-line-number">821</span><span class="source-line-text">            initialInput,</span></span>
<span class="source-line"><span class="source-line-number">822</span><span class="source-line-text">            createSession: createFreshSession,</span></span>
<span class="source-line"><span class="source-line-number">823</span><span class="source-line-text">            thinking,</span></span>
<span class="source-line"><span class="source-line-number">824</span><span class="source-line-text">            demo: args.demo,</span></span>
<span class="source-line"><span class="source-line-number">825</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">826</span><span class="source-line-text">        } catch (error) {</span></span>
<span class="source-line"><span class="source-line-number">827</span><span class="source-line-text">          dieInteractive(error)</span></span>
<span class="source-line"><span class="source-line-number">828</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">829</span><span class="source-line-text">        return</span></span>
<span class="source-line"><span class="source-line-number">830</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">831</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">832</span><span class="source-line-text">      if (args.interactive &amp;&amp; !args.attach &amp;&amp; !args.session &amp;&amp; !args.continue) {</span></span>
<span class="source-line"><span class="source-line-number">833</span><span class="source-line-text">        const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">834</span><span class="source-line-text">        const { runInteractiveLocalMode } = await runtimeTask</span></span>
<span class="source-line"><span class="source-line-number">835</span><span class="source-line-text">        const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">836</span><span class="source-line-text">          const { Server } = await import(&quot;@/server/server&quot;)</span></span>
<span class="source-line"><span class="source-line-number">837</span><span class="source-line-text">          const request = new Request(input, init)</span></span>
<span class="source-line"><span class="source-line-number">838</span><span class="source-line-text">          return Server.Default().app.fetch(request)</span></span>
<span class="source-line"><span class="source-line-number">839</span><span class="source-line-text">        }) as typeof globalThis.fetch</span></span>
<span class="source-line"><span class="source-line-number">840</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">841</span><span class="source-line-text">        try {</span></span>
<span class="source-line"><span class="source-line-number">842</span><span class="source-line-text">          return await runInteractiveLocalMode({</span></span>
<span class="source-line"><span class="source-line-number">843</span><span class="source-line-text">            directory: directory ?? root,</span></span>
<span class="source-line"><span class="source-line-number">844</span><span class="source-line-text">            fetch: fetchFn,</span></span>
<span class="source-line"><span class="source-line-number">845</span><span class="source-line-text">            resolveAgent: localAgent,</span></span>
<span class="source-line"><span class="source-line-number">846</span><span class="source-line-text">            session,</span></span>
<span class="source-line"><span class="source-line-number">847</span><span class="source-line-text">            share,</span></span>
<span class="source-line"><span class="source-line-number">848</span><span class="source-line-text">            createSession: createFreshSession,</span></span>
<span class="source-line"><span class="source-line-number">849</span><span class="source-line-text">            agent: args.agent,</span></span>
<span class="source-line"><span class="source-line-number">850</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">851</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">852</span><span class="source-line-text">            replay,</span></span>
<span class="source-line"><span class="source-line-number">853</span><span class="source-line-text">            replayLimit: args[&quot;replay-limit&quot;],</span></span>
<span class="source-line"><span class="source-line-number">854</span><span class="source-line-text">            files,</span></span>
<span class="source-line"><span class="source-line-number">855</span><span class="source-line-text">            initialInput,</span></span>
<span class="source-line"><span class="source-line-number">856</span><span class="source-line-text">            thinking,</span></span>
<span class="source-line"><span class="source-line-number">857</span><span class="source-line-text">            demo: args.demo,</span></span>
<span class="source-line"><span class="source-line-number">858</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">859</span><span class="source-line-text">        } catch (error) {</span></span>
<span class="source-line"><span class="source-line-number">860</span><span class="source-line-text">          dieInteractive(error)</span></span>
<span class="source-line"><span class="source-line-number">861</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">862</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">863</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">864</span><span class="source-line-text">      if (args.attach) {</span></span>
<span class="source-line"><span class="source-line-number">865</span><span class="source-line-text">        const sdk = attachSDK(directory)</span></span>
<span class="source-line"><span class="source-line-number">866</span><span class="source-line-text">        return await execute(sdk)</span></span>
<span class="source-line"><span class="source-line-number">867</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">868</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">869</span><span class="source-line-text">      const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">870</span><span class="source-line-text">        const { Server } = await import(&quot;@/server/server&quot;)</span></span>
<span class="source-line"><span class="source-line-number">871</span><span class="source-line-text">        const request = new Request(input, init)</span></span>
<span class="source-line"><span class="source-line-number">872</span><span class="source-line-text">        return Server.Default().app.fetch(request)</span></span>
<span class="source-line"><span class="source-line-number">873</span><span class="source-line-text">      }) as typeof globalThis.fetch</span></span>
<span class="source-line"><span class="source-line-number">874</span><span class="source-line-text">      const sdk = createOpencodeClient({</span></span>
<span class="source-line"><span class="source-line-number">875</span><span class="source-line-text">        baseUrl: &quot;http://opencode.internal&quot;,</span></span>
<span class="source-line"><span class="source-line-number">876</span><span class="source-line-text">        fetch: fetchFn,</span></span>
<span class="source-line"><span class="source-line-number">877</span><span class="source-line-text">        directory,</span></span>
<span class="source-line"><span class="source-line-number">878</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">879</span><span class="source-line-text">      await execute(sdk)</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run/runtime.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run/runtime.ts:159-165</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">// Core runtime loop. Boot resolves the SDK context, then we set up the</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">// lifecycle (renderer + footer), wire the stream transport for SDK events,</span></span>
<span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">// and feed prompts through the queue until the user exits.</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">//</span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">// Files only attach on the first prompt turn -- after that, includeFiles</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">// flips to false so subsequent turns don't re-send attachments.</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">async function runInteractiveRuntime(input: RunRuntimeInput): Promise&lt;void&gt; {</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/tui/context/sdk.tsx</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/tui/context/sdk.tsx:24-40</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    function createSDK() {</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">      return createOpencodeClient({</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">        baseUrl: props.url,</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">        signal: abort.signal,</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">        directory: props.directory,</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">        fetch: props.fetch,</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">        headers: props.headers,</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">    let sdk = createSDK()</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">    const emitter = createGlobalEmitter&lt;{</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">      event: GlobalEvent</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">    }&gt;()</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">    let queue: GlobalEvent[] = []</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/app/src/app.tsx</span>
    <span class="source-ref-path"><code>packages/app/src/app.tsx:295-329</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">export function AppInterface(props: {</span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text">  children?: JSX.Element</span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">  defaultServer: ServerConnection.Key</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">  servers?: Array&lt;ServerConnection.Any&gt;</span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">  router?: Component&lt;BaseRouterProps&gt;</span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">  disableHealthCheck?: boolean</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">}) {</span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">  return (</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">    &lt;ServerProvider</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">      defaultServer={props.defaultServer}</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">      disableHealthCheck={props.disableHealthCheck}</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">      servers={props.servers}</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">    &gt;</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">      &lt;ConnectionGate disableHealthCheck={props.disableHealthCheck}&gt;</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text">        &lt;ServerKey&gt;</span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text">          &lt;QueryProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">            &lt;GlobalSDKProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">              &lt;GlobalSyncProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">                &lt;Dynamic</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text">                  component={props.router ?? Router}</span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">                  root={(routerProps) =&gt; &lt;RouterRoot appChildren={props.children}&gt;{routerProps.children}&lt;/RouterRoot&gt;}</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">                &gt;</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">                  &lt;Route path=&quot;/&quot; component={HomeRoute} /&gt;</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text">                  &lt;Route path=&quot;/:dir&quot; component={DirectoryLayout}&gt;</span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">                    &lt;Route path=&quot;/&quot; component={SessionIndexRoute} /&gt;</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">                    &lt;Route path=&quot;/session/:id?&quot; component={SessionRoute} /&gt;</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">                  &lt;/Route&gt;</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">                &lt;/Dynamic&gt;</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text">              &lt;/GlobalSyncProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">            &lt;/GlobalSDKProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">325</span><span class="source-line-text">          &lt;/QueryProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">326</span><span class="source-line-text">        &lt;/ServerKey&gt;</span></span>
<span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">      &lt;/ConnectionGate&gt;</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">    &lt;/ServerProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">  )</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/desktop/src/main/index.ts</span>
    <span class="source-ref-path"><code>packages/desktop/src/main/index.ts:258-345</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">  const port = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">259</span><span class="source-line-text">    const fromEnv = process.env.OPENCODE_PORT</span></span>
<span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">    if (fromEnv) {</span></span>
<span class="source-line"><span class="source-line-number">261</span><span class="source-line-text">      const parsed = Number.parseInt(fromEnv, 10)</span></span>
<span class="source-line"><span class="source-line-number">262</span><span class="source-line-text">      if (!Number.isNaN(parsed)) return parsed</span></span>
<span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">264</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">265</span><span class="source-line-text">    const res = yield* Deferred.make&lt;number, unknown&gt;()</span></span>
<span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">    const server = createServer()</span></span>
<span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">    server.on(&quot;error&quot;, (e) =&gt; Deferred.failSync(res, () =&gt; e))</span></span>
<span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">    server.listen(0, &quot;127.0.0.1&quot;, () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">      const address = server.address()</span></span>
<span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">      if (typeof address !== &quot;object&quot; || !address) {</span></span>
<span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">        server.close()</span></span>
<span class="source-line"><span class="source-line-number">272</span><span class="source-line-text">        Deferred.failSync(res, () =&gt; new Error(&quot;Failed to get port&quot;))</span></span>
<span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">        return</span></span>
<span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">      const port = address.port</span></span>
<span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">      server.close(() =&gt; Effect.runSync(Deferred.succeed(res, port)))</span></span>
<span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">278</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">    return yield* Deferred.await(res)</span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">  const hostname = &quot;127.0.0.1&quot;</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">  const url = `http://${hostname}:${port}`</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">  const password = randomUUID()</span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">  const loadingTask = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">    logger.log(&quot;sidecar connection started&quot;, { url })</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">    initEmitter.on(&quot;sqlite&quot;, (progress: SqliteMigrationProgress) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">      setInitStep({ phase: &quot;sqlite_waiting&quot; })</span></span>
<span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">      if (overlay) sendSqliteMigrationProgress(overlay, progress)</span></span>
<span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">      if (mainWindow) sendSqliteMigrationProgress(mainWindow, progress)</span></span>
<span class="source-line"><span class="source-line-number">292</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">293</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">    ensureLoopbackNoProxy()</span></span>
<span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">    useEnvProxy()</span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">    logger.log(&quot;spawning sidecar&quot;, { url })</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">    const { listener, health } = yield* Effect.promise(() =&gt;</span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">      spawnLocalServer(hostname, port, password, {</span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">        needsMigration,</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">        userDataPath: app.getPath(&quot;userData&quot;),</span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">        onSqliteProgress: (progress) =&gt; initEmitter.emit(&quot;sqlite&quot;, progress),</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">        onStdout: (message) =&gt; logger.log(&quot;sidecar stdout&quot;, { message }),</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">        onStderr: (message) =&gt; logger.warn(&quot;sidecar stderr&quot;, { message }),</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">        onExit: (code) =&gt; logger.warn(&quot;sidecar exited&quot;, { code }),</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">      }),</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">    server = listener</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text">    yield* Deferred.succeed(serverReady, {</span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text">      url,</span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">      username: &quot;opencode&quot;,</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">      password,</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">    yield* Effect.promise(() =&gt; health.wait).pipe(</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">      Effect.timeout(&quot;30 seconds&quot;),</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">      Effect.catch((e) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text">        Effect.sync(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">          logger.error(&quot;sidecar health check failed&quot;, e.toString())</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">      ),</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">    logger.log(&quot;loading task finished&quot;)</span></span>
<span class="source-line"><span class="source-line-number">325</span><span class="source-line-text">  }).pipe(Effect.forkChild)</span></span>
<span class="source-line"><span class="source-line-number">326</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">  if (needsMigration) {</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">    const show = yield* loadingTask.pipe(</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">      Fiber.await,</span></span>
<span class="source-line"><span class="source-line-number">330</span><span class="source-line-text">      Effect.timeout(&quot;1 second&quot;),</span></span>
<span class="source-line"><span class="source-line-number">331</span><span class="source-line-text">      Effect.as(false),</span></span>
<span class="source-line"><span class="source-line-number">332</span><span class="source-line-text">      Effect.catch(() =&gt; Effect.succeed(true)),</span></span>
<span class="source-line"><span class="source-line-number">333</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">    if (show) {</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">      overlay = createLoadingWindow()</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">      yield* Effect.sleep(&quot;1 second&quot;)</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">  yield* Fiber.await(loadingTask)</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">  setInitStep({ phase: &quot;done&quot; })</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">  if (overlay) yield* Deferred.await(loadingComplete)</span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">  mainWindow = createMainWindow()</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">sdks/vscode/src/extension.ts</span>
    <span class="source-ref-path"><code>sdks/vscode/src/extension.ts:45-100</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">  async function openTerminal() {</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">    // Create a new terminal in split screen</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">    const port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">    const terminal = vscode.window.createTerminal({</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">      name: TERMINAL_NAME,</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">      iconPath: {</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">        light: vscode.Uri.file(context.asAbsolutePath(&quot;images/button-dark.svg&quot;)),</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">        dark: vscode.Uri.file(context.asAbsolutePath(&quot;images/button-light.svg&quot;)),</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">      location: {</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">        viewColumn: vscode.ViewColumn.Beside,</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">        preserveFocus: false,</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">      env: {</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">        _EXTENSION_OPENCODE_PORT: port.toString(),</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">        OPENCODE_CALLER: &quot;vscode&quot;,</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    terminal.show()</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">    terminal.sendText(`opencode --port ${port}`)</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">    const fileRef = getActiveFile()</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">    if (!fileRef) {</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">      return</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">    // Wait for the terminal to be ready</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">    let tries = 10</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">    let connected = false</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">    do {</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">      await new Promise((resolve) =&gt; setTimeout(resolve, 200))</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">      try {</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">        await fetch(`http://localhost:${port}/app`)</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">        connected = true</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">        break</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">      } catch {}</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">      tries--</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">    } while (tries &gt; 0)</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">    // If connected, append the prompt to the terminal</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">    if (connected) {</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">      await appendPrompt(port, `In ${fileRef}`)</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">      terminal.show()</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">  async function appendPrompt(port: number, text: string) {</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">    await fetch(`http://localhost:${port}/tui/append-prompt`, {</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">      method: &quot;POST&quot;,</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">      headers: {</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">        &quot;Content-Type&quot;: &quot;application/json&quot;,</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">      body: JSON.stringify({ text }),</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">    })</span></span></code></pre>
</details>。

## 2. 它在 OpenCode agent 中的位置

可以把 OpenCode 前端层分成四类：

```text
CLI non-interactive
  -> createOpencodeClient
  -> session.prompt / session.command
  -> event.subscribe

CLI/TUI interactive
  -> runInteractiveMode / runInteractiveLocalMode
  -> SDK event stream
  -> runtime queue + footer lifecycle

Web/Desktop app
  -> AppInterface
  -> ServerProvider + GlobalSDKProvider + GlobalSyncProvider
  -> HTTP API + SSE

VS Code extension
  -> create/focus terminal
  -> opencode --port <random>
  -> /tui/append-prompt with @file reference
```

关键判断：

- `run.ts` 在非交互模式直接调用 `client.session.prompt`，交互模式进入 `runInteractiveMode`。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:768-825</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">768</span><span class="source-line-text">        if (!args.interactive) {</span></span>
<span class="source-line"><span class="source-line-number">769</span><span class="source-line-text">          const events = await client.event.subscribe()</span></span>
<span class="source-line"><span class="source-line-number">770</span><span class="source-line-text">          loop(client, events).catch((e) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">771</span><span class="source-line-text">            console.error(e)</span></span>
<span class="source-line"><span class="source-line-number">772</span><span class="source-line-text">            process.exit(1)</span></span>
<span class="source-line"><span class="source-line-number">773</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">774</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">775</span><span class="source-line-text">          if (args.command) {</span></span>
<span class="source-line"><span class="source-line-number">776</span><span class="source-line-text">            const result = await client.session.command({</span></span>
<span class="source-line"><span class="source-line-number">777</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">778</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">779</span><span class="source-line-text">              model: args.model,</span></span>
<span class="source-line"><span class="source-line-number">780</span><span class="source-line-text">              command: args.command,</span></span>
<span class="source-line"><span class="source-line-number">781</span><span class="source-line-text">              arguments: message,</span></span>
<span class="source-line"><span class="source-line-number">782</span><span class="source-line-text">              variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">783</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">784</span><span class="source-line-text">            if (result.error) {</span></span>
<span class="source-line"><span class="source-line-number">785</span><span class="source-line-text">              if (!emit(&quot;error&quot;, { error: result.error })) UI.error(formatRunError(result.error))</span></span>
<span class="source-line"><span class="source-line-number">786</span><span class="source-line-text">              process.exitCode = 1</span></span>
<span class="source-line"><span class="source-line-number">787</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">788</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">789</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">790</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">791</span><span class="source-line-text">          const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">792</span><span class="source-line-text">          const result = await client.session.prompt({</span></span>
<span class="source-line"><span class="source-line-number">793</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">794</span><span class="source-line-text">            agent,</span></span>
<span class="source-line"><span class="source-line-number">795</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">796</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">797</span><span class="source-line-text">            parts: [...files, { type: &quot;text&quot;, text: message }],</span></span>
<span class="source-line"><span class="source-line-number">798</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">799</span><span class="source-line-text">          if (result.error) {</span></span>
<span class="source-line"><span class="source-line-number">800</span><span class="source-line-text">            if (!emit(&quot;error&quot;, { error: result.error })) UI.error(formatRunError(result.error))</span></span>
<span class="source-line"><span class="source-line-number">801</span><span class="source-line-text">            process.exitCode = 1</span></span>
<span class="source-line"><span class="source-line-number">802</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">803</span><span class="source-line-text">          return</span></span>
<span class="source-line"><span class="source-line-number">804</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">805</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">806</span><span class="source-line-text">        const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">807</span><span class="source-line-text">        const { runInteractiveMode } = await runtimeTask</span></span>
<span class="source-line"><span class="source-line-number">808</span><span class="source-line-text">        try {</span></span>
<span class="source-line"><span class="source-line-number">809</span><span class="source-line-text">          await runInteractiveMode({</span></span>
<span class="source-line"><span class="source-line-number">810</span><span class="source-line-text">            sdk: client,</span></span>
<span class="source-line"><span class="source-line-number">811</span><span class="source-line-text">            directory: cwd,</span></span>
<span class="source-line"><span class="source-line-number">812</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">813</span><span class="source-line-text">            sessionTitle: sess.title,</span></span>
<span class="source-line"><span class="source-line-number">814</span><span class="source-line-text">            resume: Boolean(args.session || args.continue) &amp;&amp; !args.fork,</span></span>
<span class="source-line"><span class="source-line-number">815</span><span class="source-line-text">            replay,</span></span>
<span class="source-line"><span class="source-line-number">816</span><span class="source-line-text">            replayLimit: args[&quot;replay-limit&quot;],</span></span>
<span class="source-line"><span class="source-line-number">817</span><span class="source-line-text">            agent,</span></span>
<span class="source-line"><span class="source-line-number">818</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">819</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">820</span><span class="source-line-text">            files,</span></span>
<span class="source-line"><span class="source-line-number">821</span><span class="source-line-text">            initialInput,</span></span>
<span class="source-line"><span class="source-line-number">822</span><span class="source-line-text">            createSession: createFreshSession,</span></span>
<span class="source-line"><span class="source-line-number">823</span><span class="source-line-text">            thinking,</span></span>
<span class="source-line"><span class="source-line-number">824</span><span class="source-line-text">            demo: args.demo,</span></span>
<span class="source-line"><span class="source-line-number">825</span><span class="source-line-text">          })</span></span></code></pre>
</details>。
- 本地交互模式用 `Server.Default().app.fetch` 做 in-process fetch，不一定需要外部 HTTP 监听。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:832-879</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">832</span><span class="source-line-text">      if (args.interactive &amp;&amp; !args.attach &amp;&amp; !args.session &amp;&amp; !args.continue) {</span></span>
<span class="source-line"><span class="source-line-number">833</span><span class="source-line-text">        const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">834</span><span class="source-line-text">        const { runInteractiveLocalMode } = await runtimeTask</span></span>
<span class="source-line"><span class="source-line-number">835</span><span class="source-line-text">        const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">836</span><span class="source-line-text">          const { Server } = await import(&quot;@/server/server&quot;)</span></span>
<span class="source-line"><span class="source-line-number">837</span><span class="source-line-text">          const request = new Request(input, init)</span></span>
<span class="source-line"><span class="source-line-number">838</span><span class="source-line-text">          return Server.Default().app.fetch(request)</span></span>
<span class="source-line"><span class="source-line-number">839</span><span class="source-line-text">        }) as typeof globalThis.fetch</span></span>
<span class="source-line"><span class="source-line-number">840</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">841</span><span class="source-line-text">        try {</span></span>
<span class="source-line"><span class="source-line-number">842</span><span class="source-line-text">          return await runInteractiveLocalMode({</span></span>
<span class="source-line"><span class="source-line-number">843</span><span class="source-line-text">            directory: directory ?? root,</span></span>
<span class="source-line"><span class="source-line-number">844</span><span class="source-line-text">            fetch: fetchFn,</span></span>
<span class="source-line"><span class="source-line-number">845</span><span class="source-line-text">            resolveAgent: localAgent,</span></span>
<span class="source-line"><span class="source-line-number">846</span><span class="source-line-text">            session,</span></span>
<span class="source-line"><span class="source-line-number">847</span><span class="source-line-text">            share,</span></span>
<span class="source-line"><span class="source-line-number">848</span><span class="source-line-text">            createSession: createFreshSession,</span></span>
<span class="source-line"><span class="source-line-number">849</span><span class="source-line-text">            agent: args.agent,</span></span>
<span class="source-line"><span class="source-line-number">850</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">851</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">852</span><span class="source-line-text">            replay,</span></span>
<span class="source-line"><span class="source-line-number">853</span><span class="source-line-text">            replayLimit: args[&quot;replay-limit&quot;],</span></span>
<span class="source-line"><span class="source-line-number">854</span><span class="source-line-text">            files,</span></span>
<span class="source-line"><span class="source-line-number">855</span><span class="source-line-text">            initialInput,</span></span>
<span class="source-line"><span class="source-line-number">856</span><span class="source-line-text">            thinking,</span></span>
<span class="source-line"><span class="source-line-number">857</span><span class="source-line-text">            demo: args.demo,</span></span>
<span class="source-line"><span class="source-line-number">858</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">859</span><span class="source-line-text">        } catch (error) {</span></span>
<span class="source-line"><span class="source-line-number">860</span><span class="source-line-text">          dieInteractive(error)</span></span>
<span class="source-line"><span class="source-line-number">861</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">862</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">863</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">864</span><span class="source-line-text">      if (args.attach) {</span></span>
<span class="source-line"><span class="source-line-number">865</span><span class="source-line-text">        const sdk = attachSDK(directory)</span></span>
<span class="source-line"><span class="source-line-number">866</span><span class="source-line-text">        return await execute(sdk)</span></span>
<span class="source-line"><span class="source-line-number">867</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">868</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">869</span><span class="source-line-text">      const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">870</span><span class="source-line-text">        const { Server } = await import(&quot;@/server/server&quot;)</span></span>
<span class="source-line"><span class="source-line-number">871</span><span class="source-line-text">        const request = new Request(input, init)</span></span>
<span class="source-line"><span class="source-line-number">872</span><span class="source-line-text">        return Server.Default().app.fetch(request)</span></span>
<span class="source-line"><span class="source-line-number">873</span><span class="source-line-text">      }) as typeof globalThis.fetch</span></span>
<span class="source-line"><span class="source-line-number">874</span><span class="source-line-text">      const sdk = createOpencodeClient({</span></span>
<span class="source-line"><span class="source-line-number">875</span><span class="source-line-text">        baseUrl: &quot;http://opencode.internal&quot;,</span></span>
<span class="source-line"><span class="source-line-number">876</span><span class="source-line-text">        fetch: fetchFn,</span></span>
<span class="source-line"><span class="source-line-number">877</span><span class="source-line-text">        directory,</span></span>
<span class="source-line"><span class="source-line-number">878</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">879</span><span class="source-line-text">      await execute(sdk)</span></span></code></pre>
</details>。
- TUI SDK context 创建 client 并订阅 global event stream。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/tui/context/sdk.tsx</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/tui/context/sdk.tsx:24-40</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    function createSDK() {</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">      return createOpencodeClient({</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">        baseUrl: props.url,</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">        signal: abort.signal,</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">        directory: props.directory,</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">        fetch: props.fetch,</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">        headers: props.headers,</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">    let sdk = createSDK()</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">    const emitter = createGlobalEmitter&lt;{</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">      event: GlobalEvent</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">    }&gt;()</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">    let queue: GlobalEvent[] = []</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/tui/context/sdk.tsx</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/tui/context/sdk.tsx:74-124</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">    function startSSE() {</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">      sse?.abort()</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">      const ctrl = new AbortController()</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">      sse = ctrl</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">      ;(async () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">        let attempt = 0</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">        while (true) {</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">          if (abort.signal.aborted || ctrl.signal.aborted) break</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">          const events = await sdk.global.event({</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">            signal: ctrl.signal,</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">            sseMaxRetryAttempts: 0,</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">          if (Flag.OPENCODE_EXPERIMENTAL_WORKSPACES) {</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">            // Start syncing workspaces, it's important to do this after</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">            // we've started listening to events</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">            await sdk.sync.start().catch(() =&gt; {})</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">          for await (const event of events.stream) {</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">            if (ctrl.signal.aborted) break</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">            handleEvent(event)</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">          if (timer) clearTimeout(timer)</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">          if (queue.length &gt; 0) flush()</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">          attempt += 1</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">          if (abort.signal.aborted || ctrl.signal.aborted) break</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">          // Exponential backoff</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">          const backoff = Math.min(retryDelay * 2 ** (attempt - 1), maxRetryDelay)</span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">          await new Promise((resolve) =&gt; setTimeout(resolve, backoff))</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">      })().catch(() =&gt; {})</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">    onMount(async () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">      if (props.events) {</span></span>
<span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">        const unsub = await props.events.subscribe(handleEvent)</span></span>
<span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">        onCleanup(unsub)</span></span>
<span class="source-line"><span class="source-line-number">115</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">        if (Flag.OPENCODE_EXPERIMENTAL_WORKSPACES) {</span></span>
<span class="source-line"><span class="source-line-number">117</span><span class="source-line-text">          // Start syncing workspaces, it's important to do this after</span></span>
<span class="source-line"><span class="source-line-number">118</span><span class="source-line-text">          // we've started listening to events</span></span>
<span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">          await sdk.sync.start().catch(() =&gt; {})</span></span>
<span class="source-line"><span class="source-line-number">120</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">      } else {</span></span>
<span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">        startSSE()</span></span>
<span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">124</span><span class="source-line-text">    })</span></span></code></pre>
</details>。
- Desktop main process 会启动 sidecar server，renderer 用 `@opencode-ai/app`。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/desktop/src/main/index.ts</span>
    <span class="source-ref-path"><code>packages/desktop/src/main/index.ts:258-345</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">  const port = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">259</span><span class="source-line-text">    const fromEnv = process.env.OPENCODE_PORT</span></span>
<span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">    if (fromEnv) {</span></span>
<span class="source-line"><span class="source-line-number">261</span><span class="source-line-text">      const parsed = Number.parseInt(fromEnv, 10)</span></span>
<span class="source-line"><span class="source-line-number">262</span><span class="source-line-text">      if (!Number.isNaN(parsed)) return parsed</span></span>
<span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">264</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">265</span><span class="source-line-text">    const res = yield* Deferred.make&lt;number, unknown&gt;()</span></span>
<span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">    const server = createServer()</span></span>
<span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">    server.on(&quot;error&quot;, (e) =&gt; Deferred.failSync(res, () =&gt; e))</span></span>
<span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">    server.listen(0, &quot;127.0.0.1&quot;, () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">      const address = server.address()</span></span>
<span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">      if (typeof address !== &quot;object&quot; || !address) {</span></span>
<span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">        server.close()</span></span>
<span class="source-line"><span class="source-line-number">272</span><span class="source-line-text">        Deferred.failSync(res, () =&gt; new Error(&quot;Failed to get port&quot;))</span></span>
<span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">        return</span></span>
<span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">      const port = address.port</span></span>
<span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">      server.close(() =&gt; Effect.runSync(Deferred.succeed(res, port)))</span></span>
<span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">278</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">    return yield* Deferred.await(res)</span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">  const hostname = &quot;127.0.0.1&quot;</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">  const url = `http://${hostname}:${port}`</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">  const password = randomUUID()</span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">  const loadingTask = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">    logger.log(&quot;sidecar connection started&quot;, { url })</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">    initEmitter.on(&quot;sqlite&quot;, (progress: SqliteMigrationProgress) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">      setInitStep({ phase: &quot;sqlite_waiting&quot; })</span></span>
<span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">      if (overlay) sendSqliteMigrationProgress(overlay, progress)</span></span>
<span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">      if (mainWindow) sendSqliteMigrationProgress(mainWindow, progress)</span></span>
<span class="source-line"><span class="source-line-number">292</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">293</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">    ensureLoopbackNoProxy()</span></span>
<span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">    useEnvProxy()</span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">    logger.log(&quot;spawning sidecar&quot;, { url })</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">    const { listener, health } = yield* Effect.promise(() =&gt;</span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">      spawnLocalServer(hostname, port, password, {</span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">        needsMigration,</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">        userDataPath: app.getPath(&quot;userData&quot;),</span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">        onSqliteProgress: (progress) =&gt; initEmitter.emit(&quot;sqlite&quot;, progress),</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">        onStdout: (message) =&gt; logger.log(&quot;sidecar stdout&quot;, { message }),</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">        onStderr: (message) =&gt; logger.warn(&quot;sidecar stderr&quot;, { message }),</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">        onExit: (code) =&gt; logger.warn(&quot;sidecar exited&quot;, { code }),</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">      }),</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">    server = listener</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text">    yield* Deferred.succeed(serverReady, {</span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text">      url,</span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">      username: &quot;opencode&quot;,</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">      password,</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">    yield* Effect.promise(() =&gt; health.wait).pipe(</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">      Effect.timeout(&quot;30 seconds&quot;),</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">      Effect.catch((e) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text">        Effect.sync(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">          logger.error(&quot;sidecar health check failed&quot;, e.toString())</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">      ),</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">    logger.log(&quot;loading task finished&quot;)</span></span>
<span class="source-line"><span class="source-line-number">325</span><span class="source-line-text">  }).pipe(Effect.forkChild)</span></span>
<span class="source-line"><span class="source-line-number">326</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">  if (needsMigration) {</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">    const show = yield* loadingTask.pipe(</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">      Fiber.await,</span></span>
<span class="source-line"><span class="source-line-number">330</span><span class="source-line-text">      Effect.timeout(&quot;1 second&quot;),</span></span>
<span class="source-line"><span class="source-line-number">331</span><span class="source-line-text">      Effect.as(false),</span></span>
<span class="source-line"><span class="source-line-number">332</span><span class="source-line-text">      Effect.catch(() =&gt; Effect.succeed(true)),</span></span>
<span class="source-line"><span class="source-line-number">333</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">    if (show) {</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">      overlay = createLoadingWindow()</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">      yield* Effect.sleep(&quot;1 second&quot;)</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">  yield* Fiber.await(loadingTask)</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">  setInitStep({ phase: &quot;done&quot; })</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">  if (overlay) yield* Deferred.await(loadingComplete)</span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">  mainWindow = createMainWindow()</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/desktop/src/renderer/index.tsx</span>
    <span class="source-ref-path"><code>packages/desktop/src/renderer/index.tsx:3-16</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">3</span><span class="source-line-text">import {</span></span>
<span class="source-line"><span class="source-line-number">4</span><span class="source-line-text">  ACCEPTED_FILE_EXTENSIONS,</span></span>
<span class="source-line"><span class="source-line-number">5</span><span class="source-line-text">  ACCEPTED_FILE_TYPES,</span></span>
<span class="source-line"><span class="source-line-number">6</span><span class="source-line-text">  AppBaseProviders,</span></span>
<span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">  AppInterface,</span></span>
<span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">  handleNotificationClick,</span></span>
<span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">  loadLocaleDict,</span></span>
<span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">  normalizeLocale,</span></span>
<span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">  type Locale,</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">  type Platform,</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">  PlatformProvider,</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">  ServerConnection,</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">  useCommand,</span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">} from &quot;@opencode-ai/app&quot;</span></span></code></pre>
</details>。

## 3. 生活类比

把 OpenCode runtime 想成一家厨房，UI 是不同点餐窗口：

- CLI 是柜台：一句话点餐，等结果。
- TUI 是堂食菜单：实时看到厨师做菜、审批、工具进度。
- Web app 是网页点餐。
- Desktop 是把厨房和网页打包进一个本地应用。
- VS Code extension 是在 IDE 里开一个窗口，把当前文件路径递给厨房。

这些窗口不各自做菜。真正做菜的是 session/agent/tool/provider runtime。

## 4. Java 开发者类比

- CLI/TUI/Web/Desktop 像不同 client：命令行客户端、Swing/JavaFX 客户端、Web 前端、桌面壳。
- SDK 像 Java 里的 OpenFeign/WebClient client。
- SSE event stream 像 WebFlux `Flux<Event>`。
- TUI sync context 像前端 Redux/Zustand store，根据后端事件更新状态。
- Desktop sidecar 像 Electron 主进程启动本地 Spring Boot sidecar，然后 WebView 访问它。
- VS Code extension 像 IDE 插件只负责打开终端、传文件上下文，不实现业务服务。

## 5. 最小源码路径

1. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:768-879</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">768</span><span class="source-line-text">        if (!args.interactive) {</span></span>
<span class="source-line"><span class="source-line-number">769</span><span class="source-line-text">          const events = await client.event.subscribe()</span></span>
<span class="source-line"><span class="source-line-number">770</span><span class="source-line-text">          loop(client, events).catch((e) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">771</span><span class="source-line-text">            console.error(e)</span></span>
<span class="source-line"><span class="source-line-number">772</span><span class="source-line-text">            process.exit(1)</span></span>
<span class="source-line"><span class="source-line-number">773</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">774</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">775</span><span class="source-line-text">          if (args.command) {</span></span>
<span class="source-line"><span class="source-line-number">776</span><span class="source-line-text">            const result = await client.session.command({</span></span>
<span class="source-line"><span class="source-line-number">777</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">778</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">779</span><span class="source-line-text">              model: args.model,</span></span>
<span class="source-line"><span class="source-line-number">780</span><span class="source-line-text">              command: args.command,</span></span>
<span class="source-line"><span class="source-line-number">781</span><span class="source-line-text">              arguments: message,</span></span>
<span class="source-line"><span class="source-line-number">782</span><span class="source-line-text">              variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">783</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">784</span><span class="source-line-text">            if (result.error) {</span></span>
<span class="source-line"><span class="source-line-number">785</span><span class="source-line-text">              if (!emit(&quot;error&quot;, { error: result.error })) UI.error(formatRunError(result.error))</span></span>
<span class="source-line"><span class="source-line-number">786</span><span class="source-line-text">              process.exitCode = 1</span></span>
<span class="source-line"><span class="source-line-number">787</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">788</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">789</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">790</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">791</span><span class="source-line-text">          const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">792</span><span class="source-line-text">          const result = await client.session.prompt({</span></span>
<span class="source-line"><span class="source-line-number">793</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">794</span><span class="source-line-text">            agent,</span></span>
<span class="source-line"><span class="source-line-number">795</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">796</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">797</span><span class="source-line-text">            parts: [...files, { type: &quot;text&quot;, text: message }],</span></span>
<span class="source-line"><span class="source-line-number">798</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">799</span><span class="source-line-text">          if (result.error) {</span></span>
<span class="source-line"><span class="source-line-number">800</span><span class="source-line-text">            if (!emit(&quot;error&quot;, { error: result.error })) UI.error(formatRunError(result.error))</span></span>
<span class="source-line"><span class="source-line-number">801</span><span class="source-line-text">            process.exitCode = 1</span></span>
<span class="source-line"><span class="source-line-number">802</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">803</span><span class="source-line-text">          return</span></span>
<span class="source-line"><span class="source-line-number">804</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">805</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">806</span><span class="source-line-text">        const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">807</span><span class="source-line-text">        const { runInteractiveMode } = await runtimeTask</span></span>
<span class="source-line"><span class="source-line-number">808</span><span class="source-line-text">        try {</span></span>
<span class="source-line"><span class="source-line-number">809</span><span class="source-line-text">          await runInteractiveMode({</span></span>
<span class="source-line"><span class="source-line-number">810</span><span class="source-line-text">            sdk: client,</span></span>
<span class="source-line"><span class="source-line-number">811</span><span class="source-line-text">            directory: cwd,</span></span>
<span class="source-line"><span class="source-line-number">812</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">813</span><span class="source-line-text">            sessionTitle: sess.title,</span></span>
<span class="source-line"><span class="source-line-number">814</span><span class="source-line-text">            resume: Boolean(args.session || args.continue) &amp;&amp; !args.fork,</span></span>
<span class="source-line"><span class="source-line-number">815</span><span class="source-line-text">            replay,</span></span>
<span class="source-line"><span class="source-line-number">816</span><span class="source-line-text">            replayLimit: args[&quot;replay-limit&quot;],</span></span>
<span class="source-line"><span class="source-line-number">817</span><span class="source-line-text">            agent,</span></span>
<span class="source-line"><span class="source-line-number">818</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">819</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">820</span><span class="source-line-text">            files,</span></span>
<span class="source-line"><span class="source-line-number">821</span><span class="source-line-text">            initialInput,</span></span>
<span class="source-line"><span class="source-line-number">822</span><span class="source-line-text">            createSession: createFreshSession,</span></span>
<span class="source-line"><span class="source-line-number">823</span><span class="source-line-text">            thinking,</span></span>
<span class="source-line"><span class="source-line-number">824</span><span class="source-line-text">            demo: args.demo,</span></span>
<span class="source-line"><span class="source-line-number">825</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">826</span><span class="source-line-text">        } catch (error) {</span></span>
<span class="source-line"><span class="source-line-number">827</span><span class="source-line-text">          dieInteractive(error)</span></span>
<span class="source-line"><span class="source-line-number">828</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">829</span><span class="source-line-text">        return</span></span>
<span class="source-line"><span class="source-line-number">830</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">831</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">832</span><span class="source-line-text">      if (args.interactive &amp;&amp; !args.attach &amp;&amp; !args.session &amp;&amp; !args.continue) {</span></span>
<span class="source-line"><span class="source-line-number">833</span><span class="source-line-text">        const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">834</span><span class="source-line-text">        const { runInteractiveLocalMode } = await runtimeTask</span></span>
<span class="source-line"><span class="source-line-number">835</span><span class="source-line-text">        const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">836</span><span class="source-line-text">          const { Server } = await import(&quot;@/server/server&quot;)</span></span>
<span class="source-line"><span class="source-line-number">837</span><span class="source-line-text">          const request = new Request(input, init)</span></span>
<span class="source-line"><span class="source-line-number">838</span><span class="source-line-text">          return Server.Default().app.fetch(request)</span></span>
<span class="source-line"><span class="source-line-number">839</span><span class="source-line-text">        }) as typeof globalThis.fetch</span></span>
<span class="source-line"><span class="source-line-number">840</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">841</span><span class="source-line-text">        try {</span></span>
<span class="source-line"><span class="source-line-number">842</span><span class="source-line-text">          return await runInteractiveLocalMode({</span></span>
<span class="source-line"><span class="source-line-number">843</span><span class="source-line-text">            directory: directory ?? root,</span></span>
<span class="source-line"><span class="source-line-number">844</span><span class="source-line-text">            fetch: fetchFn,</span></span>
<span class="source-line"><span class="source-line-number">845</span><span class="source-line-text">            resolveAgent: localAgent,</span></span>
<span class="source-line"><span class="source-line-number">846</span><span class="source-line-text">            session,</span></span>
<span class="source-line"><span class="source-line-number">847</span><span class="source-line-text">            share,</span></span>
<span class="source-line"><span class="source-line-number">848</span><span class="source-line-text">            createSession: createFreshSession,</span></span>
<span class="source-line"><span class="source-line-number">849</span><span class="source-line-text">            agent: args.agent,</span></span>
<span class="source-line"><span class="source-line-number">850</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">851</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">852</span><span class="source-line-text">            replay,</span></span>
<span class="source-line"><span class="source-line-number">853</span><span class="source-line-text">            replayLimit: args[&quot;replay-limit&quot;],</span></span>
<span class="source-line"><span class="source-line-number">854</span><span class="source-line-text">            files,</span></span>
<span class="source-line"><span class="source-line-number">855</span><span class="source-line-text">            initialInput,</span></span>
<span class="source-line"><span class="source-line-number">856</span><span class="source-line-text">            thinking,</span></span>
<span class="source-line"><span class="source-line-number">857</span><span class="source-line-text">            demo: args.demo,</span></span>
<span class="source-line"><span class="source-line-number">858</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">859</span><span class="source-line-text">        } catch (error) {</span></span>
<span class="source-line"><span class="source-line-number">860</span><span class="source-line-text">          dieInteractive(error)</span></span>
<span class="source-line"><span class="source-line-number">861</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">862</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">863</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">864</span><span class="source-line-text">      if (args.attach) {</span></span>
<span class="source-line"><span class="source-line-number">865</span><span class="source-line-text">        const sdk = attachSDK(directory)</span></span>
<span class="source-line"><span class="source-line-number">866</span><span class="source-line-text">        return await execute(sdk)</span></span>
<span class="source-line"><span class="source-line-number">867</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">868</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">869</span><span class="source-line-text">      const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">870</span><span class="source-line-text">        const { Server } = await import(&quot;@/server/server&quot;)</span></span>
<span class="source-line"><span class="source-line-number">871</span><span class="source-line-text">        const request = new Request(input, init)</span></span>
<span class="source-line"><span class="source-line-number">872</span><span class="source-line-text">        return Server.Default().app.fetch(request)</span></span>
<span class="source-line"><span class="source-line-number">873</span><span class="source-line-text">      }) as typeof globalThis.fetch</span></span>
<span class="source-line"><span class="source-line-number">874</span><span class="source-line-text">      const sdk = createOpencodeClient({</span></span>
<span class="source-line"><span class="source-line-number">875</span><span class="source-line-text">        baseUrl: &quot;http://opencode.internal&quot;,</span></span>
<span class="source-line"><span class="source-line-number">876</span><span class="source-line-text">        fetch: fetchFn,</span></span>
<span class="source-line"><span class="source-line-number">877</span><span class="source-line-text">        directory,</span></span>
<span class="source-line"><span class="source-line-number">878</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">879</span><span class="source-line-text">      await execute(sdk)</span></span></code></pre>
</details>：run 命令如何分 non-interactive、interactive、local in-process、attach。
2. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run/runtime.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run/runtime.ts:1-15</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1</span><span class="source-line-text">// Top-level orchestrator for `run --interactive`.</span></span>
<span class="source-line"><span class="source-line-number">2</span><span class="source-line-text">//</span></span>
<span class="source-line"><span class="source-line-number">3</span><span class="source-line-text">// Wires the boot sequence, lifecycle (renderer + footer), stream transport,</span></span>
<span class="source-line"><span class="source-line-number">4</span><span class="source-line-text">// and prompt queue together into a single session loop. Two entry points:</span></span>
<span class="source-line"><span class="source-line-number">5</span><span class="source-line-text">//</span></span>
<span class="source-line"><span class="source-line-number">6</span><span class="source-line-text">//   runInteractiveMode     -- used when an SDK client already exists (attach mode)</span></span>
<span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">//   runInteractiveLocalMode -- used for local in-process mode (no server)</span></span>
<span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">//</span></span>
<span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">// Both delegate to runInteractiveRuntime, which:</span></span>
<span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">//   1. resolves keybinds, diff style, model info, and session history,</span></span>
<span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">//   2. creates the split-footer lifecycle (renderer + RunFooter),</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">//   3. starts the stream transport (SDK event subscription), lazily for fresh</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">//      local sessions,</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">//   4. runs the prompt queue until the footer closes.</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">import { createOpencodeClient } from &quot;@opencode-ai/sdk/v2&quot;</span></span></code></pre>
</details>：interactive runtime 顶层说明。
3. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run/runtime.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run/runtime.ts:159-238</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">// Core runtime loop. Boot resolves the SDK context, then we set up the</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">// lifecycle (renderer + footer), wire the stream transport for SDK events,</span></span>
<span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">// and feed prompts through the queue until the user exits.</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">//</span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">// Files only attach on the first prompt turn -- after that, includeFiles</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">// flips to false so subsequent turns don't re-send attachments.</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">async function runInteractiveRuntime(input: RunRuntimeInput): Promise&lt;void&gt; {</span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">  return withRunSpan(</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">    &quot;RunInteractive.session&quot;,</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">    {</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">      &quot;opencode.mode&quot;: input.resolveSession ? &quot;local&quot; : &quot;attach&quot;,</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">      &quot;opencode.initial_input&quot;: !!input.initialInput,</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">      &quot;opencode.demo&quot;: input.demo,</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">    async (span) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">      const start = performance.now()</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">      const log = trace()</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">      const keybindTask = resolveFooterKeybinds()</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">      const diffTask = resolveDiffStyle()</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">      const ctx = await input.boot()</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">      const modelTask = resolveModelInfo(ctx.sdk, ctx.directory, ctx.model)</span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">      const sessionTask =</span></span>
<span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">        ctx.resume === true</span></span>
<span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">          ? resolveSessionInfo(ctx.sdk, ctx.sessionID, ctx.model)</span></span>
<span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">          : Promise.resolve({</span></span>
<span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">              first: true,</span></span>
<span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">              history: [],</span></span>
<span class="source-line"><span class="source-line-number">186</span><span class="source-line-text">              variant: undefined,</span></span>
<span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">      const savedTask = resolveSavedVariant(ctx.model)</span></span>
<span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">      const [keybinds, diffStyle, session, savedVariant] = await Promise.all([</span></span>
<span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">        keybindTask,</span></span>
<span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">        diffTask,</span></span>
<span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">        sessionTask,</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">        savedTask,</span></span>
<span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">      ])</span></span>
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      const state: RuntimeState = {</span></span>
<span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">        shown: !session.first,</span></span>
<span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">        aborting: false,</span></span>
<span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">        model: ctx.model,</span></span>
<span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">        providers: [],</span></span>
<span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">        variants: [],</span></span>
<span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">        limits: {},</span></span>
<span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">        activeVariant: resolveVariant(ctx.variant, session.variant, savedVariant, []),</span></span>
<span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">        sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">        history: [...session.history],</span></span>
<span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">        sessionTitle: ctx.sessionTitle,</span></span>
<span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">        agent: ctx.agent,</span></span>
<span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">      setRunSpanAttributes(span, {</span></span>
<span class="source-line"><span class="source-line-number">209</span><span class="source-line-text">        &quot;opencode.directory&quot;: ctx.directory,</span></span>
<span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">        &quot;opencode.resume&quot;: ctx.resume === true,</span></span>
<span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">        &quot;opencode.agent.name&quot;: state.agent,</span></span>
<span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">        &quot;opencode.model.provider&quot;: state.model?.providerID,</span></span>
<span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">        &quot;opencode.model.id&quot;: state.model?.modelID,</span></span>
<span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">        &quot;opencode.model.variant&quot;: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">        &quot;session.id&quot;: state.sessionID || undefined,</span></span>
<span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">      const ensureSession = () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">        if (!input.resolveSession || state.sessionID) {</span></span>
<span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">          return Promise.resolve()</span></span>
<span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">221</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">        if (state.session) {</span></span>
<span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">          return state.session</span></span>
<span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">225</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">226</span><span class="source-line-text">        state.session = input.resolveSession(ctx).then((next) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">          state.sessionID = next.sessionID</span></span>
<span class="source-line"><span class="source-line-number">228</span><span class="source-line-text">          state.sessionTitle = next.sessionTitle ?? state.sessionTitle</span></span>
<span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">          state.agent = next.agent</span></span>
<span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">          setRunSpanAttributes(span, {</span></span>
<span class="source-line"><span class="source-line-number">231</span><span class="source-line-text">            &quot;opencode.agent.name&quot;: state.agent,</span></span>
<span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">            &quot;session.id&quot;: state.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">233</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">234</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">235</span><span class="source-line-text">        return state.session</span></span>
<span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">237</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">      const shell = await createRuntimeLifecycle({</span></span></code></pre>
</details>：启动 lifecycle、session、stream transport。
4. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run/runtime.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run/runtime.ts:238-382</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">      const shell = await createRuntimeLifecycle({</span></span>
<span class="source-line"><span class="source-line-number">239</span><span class="source-line-text">        directory: ctx.directory,</span></span>
<span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">        findFiles: (query) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">          ctx.sdk.find</span></span>
<span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">            .files({ query, directory: ctx.directory })</span></span>
<span class="source-line"><span class="source-line-number">243</span><span class="source-line-text">            .then((x) =&gt; x.data ?? [])</span></span>
<span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">            .catch(() =&gt; []),</span></span>
<span class="source-line"><span class="source-line-number">245</span><span class="source-line-text">        agents: [],</span></span>
<span class="source-line"><span class="source-line-number">246</span><span class="source-line-text">        resources: [],</span></span>
<span class="source-line"><span class="source-line-number">247</span><span class="source-line-text">        sessionID: state.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">        sessionTitle: state.sessionTitle,</span></span>
<span class="source-line"><span class="source-line-number">249</span><span class="source-line-text">        getSessionID: () =&gt; state.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">        first: session.first,</span></span>
<span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">        history: session.history,</span></span>
<span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">        agent: state.agent,</span></span>
<span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">        model: state.model,</span></span>
<span class="source-line"><span class="source-line-number">254</span><span class="source-line-text">        variant: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">255</span><span class="source-line-text">        keybinds,</span></span>
<span class="source-line"><span class="source-line-number">256</span><span class="source-line-text">        diffStyle,</span></span>
<span class="source-line"><span class="source-line-number">257</span><span class="source-line-text">        onPermissionReply: async (next) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">          if (state.demo?.permission(next)) {</span></span>
<span class="source-line"><span class="source-line-number">259</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">261</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">262</span><span class="source-line-text">          log?.write(&quot;send.permission.reply&quot;, next)</span></span>
<span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">          await ctx.sdk.permission.reply(next)</span></span>
<span class="source-line"><span class="source-line-number">264</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">265</span><span class="source-line-text">        onQuestionReply: async (next) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">          if (state.demo?.questionReply(next)) {</span></span>
<span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">269</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">          await ctx.sdk.question.reply(next)</span></span>
<span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">272</span><span class="source-line-text">        onQuestionReject: async (next) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">          if (state.demo?.questionReject(next)) {</span></span>
<span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">276</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">          await ctx.sdk.question.reject(next)</span></span>
<span class="source-line"><span class="source-line-number">278</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">        onCycleVariant: () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text">          if (!state.model || state.variants.length === 0) {</span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">            return {</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">              status: &quot;no variants available&quot;,</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">          state.activeVariant = cycleVariant(state.activeVariant, state.variants)</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">          saveVariant(state.model, state.activeVariant)</span></span>
<span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">          setRunSpanAttributes(span, {</span></span>
<span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">            &quot;opencode.model.variant&quot;: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">292</span><span class="source-line-text">            status: state.activeVariant ? `variant ${state.activeVariant}` : &quot;variant default&quot;,</span></span>
<span class="source-line"><span class="source-line-number">293</span><span class="source-line-text">            modelLabel: formatModelLabel(state.model, state.activeVariant, state.providers),</span></span>
<span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">            variant: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">        onModelSelect: async (model) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">          if (state.model?.providerID === model.providerID &amp;&amp; state.model.modelID === model.modelID) {</span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">          state.model = model</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">          state.activeVariant = undefined</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">          state.variants = variantsFor(state.providers, model)</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">          const switching = resolveSavedVariant(model).then((saved) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">            const current = state.model</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">            if (!current || current.providerID !== model.providerID || current.modelID !== model.modelID) {</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">              return</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">            state.activeVariant = resolveVariant(ctx.variant, undefined, saved, state.variants)</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">          state.switching = switching</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text">          await switching</span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">          if (state.switching === switching) {</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">            state.switching = undefined</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">          const current = state.model</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">          if (!current || current.providerID !== model.providerID || current.modelID !== model.modelID) {</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">          setRunSpanAttributes(span, {</span></span>
<span class="source-line"><span class="source-line-number">325</span><span class="source-line-text">            &quot;opencode.model.provider&quot;: model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">326</span><span class="source-line-text">            &quot;opencode.model.id&quot;: model.modelID,</span></span>
<span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">            &quot;opencode.model.variant&quot;: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">330</span><span class="source-line-text">            modelLabel: formatModelLabel(model, state.activeVariant, state.providers),</span></span>
<span class="source-line"><span class="source-line-number">331</span><span class="source-line-text">            status: `model ${model.modelID}`,</span></span>
<span class="source-line"><span class="source-line-number">332</span><span class="source-line-text">            variant: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">333</span><span class="source-line-text">            variants: state.variants,</span></span>
<span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">        onVariantSelect: async (variant) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text">          if (!state.model || state.variants.length === 0) {</span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">            return {</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text">              status: &quot;no variants available&quot;,</span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">          if (variant &amp;&amp; !state.variants.includes(variant)) {</span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text">            return {</span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">              status: `variant ${variant} unavailable`,</span></span>
<span class="source-line"><span class="source-line-number">346</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">348</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">349</span><span class="source-line-text">          state.activeVariant = variant</span></span>
<span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">          saveVariant(state.model, state.activeVariant)</span></span>
<span class="source-line"><span class="source-line-number">351</span><span class="source-line-text">          setRunSpanAttributes(span, {</span></span>
<span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">            &quot;opencode.model.variant&quot;: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">353</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">355</span><span class="source-line-text">            status: state.activeVariant ? `variant ${state.activeVariant}` : &quot;variant default&quot;,</span></span>
<span class="source-line"><span class="source-line-number">356</span><span class="source-line-text">            modelLabel: formatModelLabel(state.model, state.activeVariant, state.providers),</span></span>
<span class="source-line"><span class="source-line-number">357</span><span class="source-line-text">            variant: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">358</span><span class="source-line-text">            variants: state.variants,</span></span>
<span class="source-line"><span class="source-line-number">359</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">360</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">361</span><span class="source-line-text">        onInterrupt: () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">362</span><span class="source-line-text">          if (!hasSession(input, state) || state.aborting) {</span></span>
<span class="source-line"><span class="source-line-number">363</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">364</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">365</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">366</span><span class="source-line-text">          state.aborting = true</span></span>
<span class="source-line"><span class="source-line-number">367</span><span class="source-line-text">          void ctx.sdk.session</span></span>
<span class="source-line"><span class="source-line-number">368</span><span class="source-line-text">            .abort({</span></span>
<span class="source-line"><span class="source-line-number">369</span><span class="source-line-text">              sessionID: state.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">370</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">371</span><span class="source-line-text">            .catch(() =&gt; {})</span></span>
<span class="source-line"><span class="source-line-number">372</span><span class="source-line-text">            .finally(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">373</span><span class="source-line-text">              state.aborting = false</span></span>
<span class="source-line"><span class="source-line-number">374</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">375</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">376</span><span class="source-line-text">        onSubagentSelect: (sessionID) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">377</span><span class="source-line-text">          state.selectSubagent?.(sessionID)</span></span>
<span class="source-line"><span class="source-line-number">378</span><span class="source-line-text">          log?.write(&quot;subagent.select&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">379</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">380</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">381</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">382</span><span class="source-line-text">      })</span></span></code></pre>
</details>：权限回复、问题回复、模型切换、中断。
5. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/tui/app.tsx</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/tui/app.tsx:166-220</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">  headers?: RequestInit[&quot;headers&quot;]</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">  events?: EventSource</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">}) {</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">  // promise to prevent immediate exit</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">  // oxlint-disable-next-line no-async-promise-executor -- intentional: async executor used for sequential setup before resolve</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">  return new Promise&lt;void&gt;(async (resolve) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">    const unguard = win32InstallCtrlCGuard()</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">    win32DisableProcessedInput()</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">    const onExit = async () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">      unguard?.()</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">      resolve()</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">    const onBeforeExit = async () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">      offKeymap()</span></span>
<span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">      await TuiPluginRuntime.dispose()</span></span>
<span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">      TuiAudio.dispose()</span></span>
<span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">184</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">    const renderer = await createCliRenderer(rendererConfig(input.config))</span></span>
<span class="source-line"><span class="source-line-number">186</span><span class="source-line-text">    // Prewarm palette before ThemeProvider mounts so `system` theme avoids a first-paint fallback flash.</span></span>
<span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">    void renderer.getPalette({ size: 16 }).catch(() =&gt; undefined)</span></span>
<span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">    const mode = (await renderer.waitForThemeMode(1000)) ?? &quot;dark&quot;</span></span>
<span class="source-line"><span class="source-line-number">189</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">    const keymap = createDefaultOpenTuiKeymap(renderer)</span></span>
<span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">    const offKeymap = registerOpencodeKeymap(keymap, renderer, input.config)</span></span>
<span class="source-line"><span class="source-line-number">192</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">    await render(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">      return (</span></span>
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">        &lt;ErrorBoundary</span></span>
<span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">          fallback={(error, reset) =&gt; (</span></span>
<span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">            &lt;ErrorComponent error={error} reset={reset} onBeforeExit={onBeforeExit} onExit={onExit} mode={mode} /&gt;</span></span>
<span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">          )}</span></span>
<span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">        &gt;</span></span>
<span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">          &lt;OpencodeKeymapProvider keymap={keymap}&gt;</span></span>
<span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">            &lt;ArgsProvider {...input.args}&gt;</span></span>
<span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">              &lt;ExitProvider onBeforeExit={onBeforeExit} onExit={onExit}&gt;</span></span>
<span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">                &lt;KVProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">                  &lt;ToastProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">                    &lt;RouteProvider</span></span>
<span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">                      initialRoute={</span></span>
<span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">                        input.args.continue</span></span>
<span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">                          ? {</span></span>
<span class="source-line"><span class="source-line-number">209</span><span class="source-line-text">                              type: &quot;session&quot;,</span></span>
<span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">                              sessionID: &quot;dummy&quot;,</span></span>
<span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">                            }</span></span>
<span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">                          : undefined</span></span>
<span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">                      }</span></span>
<span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">                    &gt;</span></span>
<span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">                      &lt;TuiConfigProvider config={input.config}&gt;</span></span>
<span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">                        &lt;SDKProvider</span></span>
<span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">                          url={input.url}</span></span>
<span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">                          directory={input.directory}</span></span>
<span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">                          fetch={input.fetch}</span></span>
<span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">                          headers={input.headers}</span></span></code></pre>
</details>：TUI 入口和 provider 树。
6. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/tui/context/sdk.tsx</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/tui/context/sdk.tsx:24-40</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    function createSDK() {</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">      return createOpencodeClient({</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">        baseUrl: props.url,</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">        signal: abort.signal,</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">        directory: props.directory,</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">        fetch: props.fetch,</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">        headers: props.headers,</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">    let sdk = createSDK()</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">    const emitter = createGlobalEmitter&lt;{</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">      event: GlobalEvent</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">    }&gt;()</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">    let queue: GlobalEvent[] = []</span></span></code></pre>
</details>、`74-124`：TUI 创建 SDK 和订阅事件。
7. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/tui/context/sync-v2.tsx</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/tui/context/sync-v2.tsx:73-236</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">    event.subscribe((event) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">      switch (event.type) {</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">        case &quot;session.next.prompted&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">            draft.unshift({</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">              id: event.id,</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">              type: &quot;user&quot;,</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">              text: event.properties.prompt.text,</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">              files: event.properties.prompt.files,</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">              agents: event.properties.prompt.agents,</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">              time: { created: event.properties.timestamp },</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">        case &quot;session.next.synthetic&quot;:</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">            draft.unshift({</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">              id: event.id,</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">              type: &quot;synthetic&quot;,</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">              sessionID: event.properties.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">              text: event.properties.text,</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">              time: { created: event.properties.timestamp },</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">        case &quot;session.next.shell.started&quot;:</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">            draft.unshift({</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">              id: event.id,</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">              type: &quot;shell&quot;,</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">              callID: event.properties.callID,</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">              command: event.properties.command,</span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">              output: &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">              time: { created: event.properties.timestamp },</span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">        case &quot;session.next.shell.ended&quot;:</span></span>
<span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">            const match = activeShell(draft, event.properties.callID)</span></span>
<span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">            if (!match) return</span></span>
<span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">            match.output = event.properties.output</span></span>
<span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">            match.time.completed = event.properties.timestamp</span></span>
<span class="source-line"><span class="source-line-number">117</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">118</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">        case &quot;session.next.step.started&quot;:</span></span>
<span class="source-line"><span class="source-line-number">120</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">            const currentAssistant = activeAssistant(draft)</span></span>
<span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">            if (currentAssistant) currentAssistant.time.completed = event.properties.timestamp</span></span>
<span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">            draft.unshift({</span></span>
<span class="source-line"><span class="source-line-number">124</span><span class="source-line-text">              id: event.id,</span></span>
<span class="source-line"><span class="source-line-number">125</span><span class="source-line-text">              type: &quot;assistant&quot;,</span></span>
<span class="source-line"><span class="source-line-number">126</span><span class="source-line-text">              agent: event.properties.agent,</span></span>
<span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">              model: event.properties.model,</span></span>
<span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">              content: [],</span></span>
<span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">              snapshot: event.properties.snapshot ? { start: event.properties.snapshot } : undefined,</span></span>
<span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">              time: { created: event.properties.timestamp },</span></span>
<span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">        case &quot;session.next.step.ended&quot;:</span></span>
<span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">136</span><span class="source-line-text">            const currentAssistant = activeAssistant(draft)</span></span>
<span class="source-line"><span class="source-line-number">137</span><span class="source-line-text">            if (!currentAssistant) return</span></span>
<span class="source-line"><span class="source-line-number">138</span><span class="source-line-text">            currentAssistant.time.completed = event.properties.timestamp</span></span>
<span class="source-line"><span class="source-line-number">139</span><span class="source-line-text">            currentAssistant.finish = event.properties.finish</span></span>
<span class="source-line"><span class="source-line-number">140</span><span class="source-line-text">            currentAssistant.cost = event.properties.cost</span></span>
<span class="source-line"><span class="source-line-number">141</span><span class="source-line-text">            currentAssistant.tokens = event.properties.tokens</span></span>
<span class="source-line"><span class="source-line-number">142</span><span class="source-line-text">            if (event.properties.snapshot)</span></span>
<span class="source-line"><span class="source-line-number">143</span><span class="source-line-text">              currentAssistant.snapshot = { ...currentAssistant.snapshot, end: event.properties.snapshot }</span></span>
<span class="source-line"><span class="source-line-number">144</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">145</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">146</span><span class="source-line-text">        case &quot;session.next.step.failed&quot;:</span></span>
<span class="source-line"><span class="source-line-number">147</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">148</span><span class="source-line-text">            const currentAssistant = activeAssistant(draft)</span></span>
<span class="source-line"><span class="source-line-number">149</span><span class="source-line-text">            if (!currentAssistant) return</span></span>
<span class="source-line"><span class="source-line-number">150</span><span class="source-line-text">            currentAssistant.time.completed = event.properties.timestamp</span></span>
<span class="source-line"><span class="source-line-number">151</span><span class="source-line-text">            currentAssistant.finish = &quot;error&quot;</span></span>
<span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">            currentAssistant.error = event.properties.error</span></span>
<span class="source-line"><span class="source-line-number">153</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">        case &quot;session.next.text.started&quot;:</span></span>
<span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">157</span><span class="source-line-text">            activeAssistant(draft)?.content.push({ type: &quot;text&quot;, text: &quot;&quot; })</span></span>
<span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">        case &quot;session.next.text.delta&quot;:</span></span>
<span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">            const match = latestText(activeAssistant(draft))</span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">            if (match) match.text += event.properties.delta</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">        case &quot;session.next.text.ended&quot;:</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">            const match = latestText(activeAssistant(draft))</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">            if (match) match.text = event.properties.text</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">        case &quot;session.next.tool.input.started&quot;:</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">            activeAssistant(draft)?.content.push({</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">              type: &quot;tool&quot;,</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">              id: event.properties.callID,</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">              name: event.properties.name,</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">              time: { created: event.properties.timestamp },</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">              state: { status: &quot;pending&quot;, input: &quot;&quot; },</span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">        case &quot;session.next.tool.input.delta&quot;:</span></span>
<span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">            const match = latestTool(activeAssistant(draft), event.properties.callID)</span></span>
<span class="source-line"><span class="source-line-number">186</span><span class="source-line-text">            if (match?.state.status === &quot;pending&quot;) match.state.input += event.properties.delta</span></span>
<span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">        case &quot;session.next.tool.input.ended&quot;:</span></span>
<span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">        case &quot;session.next.tool.called&quot;:</span></span>
<span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">            const match = latestTool(activeAssistant(draft), event.properties.callID)</span></span>
<span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">            if (!match) return</span></span>
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">            match.time.ran = event.properties.timestamp</span></span>
<span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">            match.provider = event.properties.provider</span></span>
<span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">            match.state = { status: &quot;running&quot;, input: event.properties.input, structured: {}, content: [] }</span></span>
<span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">        case &quot;session.next.tool.progress&quot;:</span></span>
<span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">            const match = latestTool(activeAssistant(draft), event.properties.callID)</span></span>
<span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">            if (match?.state.status !== &quot;running&quot;) return</span></span>
<span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">            match.state.structured = event.properties.structured</span></span>
<span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">            match.state.content = [...event.properties.content]</span></span>
<span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">        case &quot;session.next.tool.success&quot;:</span></span>
<span class="source-line"><span class="source-line-number">209</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">            const match = latestTool(activeAssistant(draft), event.properties.callID)</span></span>
<span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">            if (match?.state.status !== &quot;running&quot;) return</span></span>
<span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">            match.state = {</span></span>
<span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">              status: &quot;completed&quot;,</span></span>
<span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">              input: match.state.input,</span></span>
<span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">              structured: event.properties.structured,</span></span>
<span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">              content: [...event.properties.content],</span></span>
<span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">            match.provider = event.properties.provider</span></span>
<span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">            match.time.completed = event.properties.timestamp</span></span>
<span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">221</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">        case &quot;session.next.tool.failed&quot;:</span></span>
<span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">            const match = latestTool(activeAssistant(draft), event.properties.callID)</span></span>
<span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">            if (match?.state.status !== &quot;running&quot;) return</span></span>
<span class="source-line"><span class="source-line-number">226</span><span class="source-line-text">            match.state = {</span></span>
<span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">              status: &quot;error&quot;,</span></span>
<span class="source-line"><span class="source-line-number">228</span><span class="source-line-text">              error: event.properties.error,</span></span>
<span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">              input: match.state.input,</span></span>
<span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">              structured: match.state.structured,</span></span>
<span class="source-line"><span class="source-line-number">231</span><span class="source-line-text">              content: match.state.content,</span></span>
<span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">233</span><span class="source-line-text">            match.provider = event.properties.provider</span></span>
<span class="source-line"><span class="source-line-number">234</span><span class="source-line-text">            match.time.completed = event.properties.timestamp</span></span>
<span class="source-line"><span class="source-line-number">235</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">          break</span></span></code></pre>
</details>：把 session.next 事件同步成 UI store。
8. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/app/src/app.tsx</span>
    <span class="source-ref-path"><code>packages/app/src/app.tsx:295-329</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">export function AppInterface(props: {</span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text">  children?: JSX.Element</span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">  defaultServer: ServerConnection.Key</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">  servers?: Array&lt;ServerConnection.Any&gt;</span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">  router?: Component&lt;BaseRouterProps&gt;</span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">  disableHealthCheck?: boolean</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">}) {</span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">  return (</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">    &lt;ServerProvider</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">      defaultServer={props.defaultServer}</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">      disableHealthCheck={props.disableHealthCheck}</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">      servers={props.servers}</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">    &gt;</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">      &lt;ConnectionGate disableHealthCheck={props.disableHealthCheck}&gt;</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text">        &lt;ServerKey&gt;</span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text">          &lt;QueryProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">            &lt;GlobalSDKProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">              &lt;GlobalSyncProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">                &lt;Dynamic</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text">                  component={props.router ?? Router}</span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">                  root={(routerProps) =&gt; &lt;RouterRoot appChildren={props.children}&gt;{routerProps.children}&lt;/RouterRoot&gt;}</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">                &gt;</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">                  &lt;Route path=&quot;/&quot; component={HomeRoute} /&gt;</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text">                  &lt;Route path=&quot;/:dir&quot; component={DirectoryLayout}&gt;</span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">                    &lt;Route path=&quot;/&quot; component={SessionIndexRoute} /&gt;</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">                    &lt;Route path=&quot;/session/:id?&quot; component={SessionRoute} /&gt;</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">                  &lt;/Route&gt;</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">                &lt;/Dynamic&gt;</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text">              &lt;/GlobalSyncProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">            &lt;/GlobalSDKProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">325</span><span class="source-line-text">          &lt;/QueryProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">326</span><span class="source-line-text">        &lt;/ServerKey&gt;</span></span>
<span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">      &lt;/ConnectionGate&gt;</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">    &lt;/ServerProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">  )</span></span></code></pre>
</details>：Web app 的 provider/router 外壳。
9. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/app/src/context/global-sdk.tsx</span>
    <span class="source-ref-path"><code>packages/app/src/context/global-sdk.tsx:36-91</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">    const eventSdk = createSdkForServer({</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">      signal: abort.signal,</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">      fetch: eventFetch,</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">      server: currentServer.http,</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">    const emitter = createGlobalEmitter&lt;{</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">      [key: string]: Event</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">    }&gt;()</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">    type Queued = { directory: string; payload: Event }</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">    const FLUSH_FRAME_MS = 16</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">    const STREAM_YIELD_MS = 8</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">    const RECONNECT_DELAY_MS = 250</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">    let queue: Queued[] = []</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">    let buffer: Queued[] = []</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">    const coalesced = new Map&lt;string, number&gt;()</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">    const staleDeltas = new Set&lt;string&gt;()</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">    let timer: ReturnType&lt;typeof setTimeout&gt; | undefined</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">    let last = 0</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">    const deltaKey = (directory: string, messageID: string, partID: string) =&gt; `${directory}:${messageID}:${partID}`</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">    const key = (directory: string, payload: Event) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">      if (payload.type === &quot;session.status&quot;) return `session.status:${directory}:${payload.properties.sessionID}`</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">      if (payload.type === &quot;lsp.updated&quot;) return `lsp.updated:${directory}`</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">      if (payload.type === &quot;message.part.updated&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">        const part = payload.properties.part</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">        return `message.part.updated:${directory}:${part.messageID}:${part.id}`</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">    const flush = () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">      if (timer) clearTimeout(timer)</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">      timer = undefined</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">      if (queue.length === 0) return</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">      const events = queue</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">      const skip = staleDeltas.size &gt; 0 ? new Set(staleDeltas) : undefined</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">      queue = buffer</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">      buffer = events</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">      queue.length = 0</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">      coalesced.clear()</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">      staleDeltas.clear()</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">      last = Date.now()</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">      batch(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">        for (const event of events) {</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">          if (skip &amp;&amp; event.payload.type === &quot;message.part.delta&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">            const props = event.payload.properties</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">            if (skip.has(deltaKey(event.directory, props.messageID, props.partID))) continue</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">          emitter.emit(event.directory, event.payload)</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">      })</span></span></code></pre>
</details>、`125-205`：全局 SDK 和事件流。
10. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/desktop/src/main/index.ts</span>
    <span class="source-ref-path"><code>packages/desktop/src/main/index.ts:258-345</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">  const port = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">259</span><span class="source-line-text">    const fromEnv = process.env.OPENCODE_PORT</span></span>
<span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">    if (fromEnv) {</span></span>
<span class="source-line"><span class="source-line-number">261</span><span class="source-line-text">      const parsed = Number.parseInt(fromEnv, 10)</span></span>
<span class="source-line"><span class="source-line-number">262</span><span class="source-line-text">      if (!Number.isNaN(parsed)) return parsed</span></span>
<span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">264</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">265</span><span class="source-line-text">    const res = yield* Deferred.make&lt;number, unknown&gt;()</span></span>
<span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">    const server = createServer()</span></span>
<span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">    server.on(&quot;error&quot;, (e) =&gt; Deferred.failSync(res, () =&gt; e))</span></span>
<span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">    server.listen(0, &quot;127.0.0.1&quot;, () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">      const address = server.address()</span></span>
<span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">      if (typeof address !== &quot;object&quot; || !address) {</span></span>
<span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">        server.close()</span></span>
<span class="source-line"><span class="source-line-number">272</span><span class="source-line-text">        Deferred.failSync(res, () =&gt; new Error(&quot;Failed to get port&quot;))</span></span>
<span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">        return</span></span>
<span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">      const port = address.port</span></span>
<span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">      server.close(() =&gt; Effect.runSync(Deferred.succeed(res, port)))</span></span>
<span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">278</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">    return yield* Deferred.await(res)</span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">  const hostname = &quot;127.0.0.1&quot;</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">  const url = `http://${hostname}:${port}`</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">  const password = randomUUID()</span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">  const loadingTask = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">    logger.log(&quot;sidecar connection started&quot;, { url })</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">    initEmitter.on(&quot;sqlite&quot;, (progress: SqliteMigrationProgress) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">      setInitStep({ phase: &quot;sqlite_waiting&quot; })</span></span>
<span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">      if (overlay) sendSqliteMigrationProgress(overlay, progress)</span></span>
<span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">      if (mainWindow) sendSqliteMigrationProgress(mainWindow, progress)</span></span>
<span class="source-line"><span class="source-line-number">292</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">293</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">    ensureLoopbackNoProxy()</span></span>
<span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">    useEnvProxy()</span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">    logger.log(&quot;spawning sidecar&quot;, { url })</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">    const { listener, health } = yield* Effect.promise(() =&gt;</span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">      spawnLocalServer(hostname, port, password, {</span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">        needsMigration,</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">        userDataPath: app.getPath(&quot;userData&quot;),</span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">        onSqliteProgress: (progress) =&gt; initEmitter.emit(&quot;sqlite&quot;, progress),</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">        onStdout: (message) =&gt; logger.log(&quot;sidecar stdout&quot;, { message }),</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">        onStderr: (message) =&gt; logger.warn(&quot;sidecar stderr&quot;, { message }),</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">        onExit: (code) =&gt; logger.warn(&quot;sidecar exited&quot;, { code }),</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">      }),</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">    server = listener</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text">    yield* Deferred.succeed(serverReady, {</span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text">      url,</span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">      username: &quot;opencode&quot;,</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">      password,</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">    yield* Effect.promise(() =&gt; health.wait).pipe(</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">      Effect.timeout(&quot;30 seconds&quot;),</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">      Effect.catch((e) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text">        Effect.sync(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">          logger.error(&quot;sidecar health check failed&quot;, e.toString())</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">      ),</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">    logger.log(&quot;loading task finished&quot;)</span></span>
<span class="source-line"><span class="source-line-number">325</span><span class="source-line-text">  }).pipe(Effect.forkChild)</span></span>
<span class="source-line"><span class="source-line-number">326</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">  if (needsMigration) {</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">    const show = yield* loadingTask.pipe(</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">      Fiber.await,</span></span>
<span class="source-line"><span class="source-line-number">330</span><span class="source-line-text">      Effect.timeout(&quot;1 second&quot;),</span></span>
<span class="source-line"><span class="source-line-number">331</span><span class="source-line-text">      Effect.as(false),</span></span>
<span class="source-line"><span class="source-line-number">332</span><span class="source-line-text">      Effect.catch(() =&gt; Effect.succeed(true)),</span></span>
<span class="source-line"><span class="source-line-number">333</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">    if (show) {</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">      overlay = createLoadingWindow()</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">      yield* Effect.sleep(&quot;1 second&quot;)</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">  yield* Fiber.await(loadingTask)</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">  setInitStep({ phase: &quot;done&quot; })</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">  if (overlay) yield* Deferred.await(loadingComplete)</span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">  mainWindow = createMainWindow()</span></span></code></pre>
</details>：Desktop 启动本地 sidecar 并创建窗口。
11. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/desktop/src/main/server.ts</span>
    <span class="source-ref-path"><code>packages/desktop/src/main/server.ts:69-201</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">export async function spawnLocalServer(</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">  hostname: string,</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">  port: number,</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">  password: string,</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">  options: SpawnLocalServerOptions,</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">) {</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  const sidecar = join(dirname(fileURLToPath(import.meta.url)), &quot;sidecar.js&quot;)</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">  const child = utilityProcess.fork(sidecar, [], {</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">    cwd: process.cwd(),</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">    env: createSidecarEnv(),</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">    serviceName: SIDECAR_SERVICE_NAME,</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">    stdio: &quot;pipe&quot;,</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">  let exited = false</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">  const exit = defer&lt;number&gt;()</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">  const onProcessGone = (_event: unknown, details: Details) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">    if (details.type !== &quot;Utility&quot; || details.name !== SIDECAR_SERVICE_NAME) return</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">    options.onStderr?.(`utility process gone reason=${details.reason} exitCode=${details.exitCode}`)</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">  app.on(&quot;child-process-gone&quot;, onProcessGone)</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">  child.once(&quot;exit&quot;, (code) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">    exited = true</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">    app.off(&quot;child-process-gone&quot;, onProcessGone)</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">    options.onExit?.(code)</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">    exit.resolve(code)</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">  child.on(&quot;error&quot;, (error) =&gt; options.onStderr?.(`utility process error: ${serializeError(error).message}`))</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">  child.stdout?.on(&quot;data&quot;, (chunk: Buffer) =&gt; options.onStdout?.(chunk.toString(&quot;utf8&quot;).trimEnd()))</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">  child.stderr?.on(&quot;data&quot;, (chunk: Buffer) =&gt; options.onStderr?.(chunk.toString(&quot;utf8&quot;).trimEnd()))</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">  await new Promise&lt;void&gt;((resolve, reject) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">    let done = false</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">    let timeout: NodeJS.Timeout</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">    const fail = (error: Error) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">      if (done) return</span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">      done = true</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">      cleanup()</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">      reject(error)</span></span>
<span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">112</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">    const refreshTimeout = () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">      clearTimeout(timeout)</span></span>
<span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">      timeout = setTimeout(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">        fail(new Error(`Sidecar did not become ready within ${SIDECAR_START_STALL_TIMEOUT}ms: ${sidecar}`))</span></span>
<span class="source-line"><span class="source-line-number">117</span><span class="source-line-text">      }, SIDECAR_START_STALL_TIMEOUT)</span></span>
<span class="source-line"><span class="source-line-number">118</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">119</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">120</span><span class="source-line-text">    const onMessage = (message: SidecarMessage) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">      if (message.type === &quot;sqlite&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">        refreshTimeout()</span></span>
<span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">        options.onSqliteProgress?.(message.progress)</span></span>
<span class="source-line"><span class="source-line-number">124</span><span class="source-line-text">        return</span></span>
<span class="source-line"><span class="source-line-number">125</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">126</span><span class="source-line-text">      if (message.type === &quot;ready&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">        if (done) return</span></span>
<span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">        done = true</span></span>
<span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">        cleanup()</span></span>
<span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">        resolve()</span></span>
<span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">        return</span></span>
<span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">      if (message.type === &quot;error&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">        fail(Object.assign(new Error(message.error.message), { stack: message.error.stack }))</span></span>
<span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">136</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">137</span><span class="source-line-text">    const onExit = (code: number) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">138</span><span class="source-line-text">      fail(new Error(`Sidecar exited before ready with code ${code}`))</span></span>
<span class="source-line"><span class="source-line-number">139</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">140</span><span class="source-line-text">    const cleanup = () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">141</span><span class="source-line-text">      clearTimeout(timeout)</span></span>
<span class="source-line"><span class="source-line-number">142</span><span class="source-line-text">      child.off(&quot;message&quot;, onMessage)</span></span>
<span class="source-line"><span class="source-line-number">143</span><span class="source-line-text">      child.off(&quot;exit&quot;, onExit)</span></span>
<span class="source-line"><span class="source-line-number">144</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">145</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">146</span><span class="source-line-text">    child.on(&quot;message&quot;, onMessage)</span></span>
<span class="source-line"><span class="source-line-number">147</span><span class="source-line-text">    child.on(&quot;exit&quot;, onExit)</span></span>
<span class="source-line"><span class="source-line-number">148</span><span class="source-line-text">    refreshTimeout()</span></span>
<span class="source-line"><span class="source-line-number">149</span><span class="source-line-text">    child.postMessage({</span></span>
<span class="source-line"><span class="source-line-number">150</span><span class="source-line-text">      type: &quot;start&quot;,</span></span>
<span class="source-line"><span class="source-line-number">151</span><span class="source-line-text">      hostname,</span></span>
<span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">      port,</span></span>
<span class="source-line"><span class="source-line-number">153</span><span class="source-line-text">      password,</span></span>
<span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">      userDataPath: options.userDataPath,</span></span>
<span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">      needsMigration: options.needsMigration,</span></span>
<span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">157</span><span class="source-line-text">  }).catch((error) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">    if (!exited) child.kill()</span></span>
<span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">    throw error</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">161</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">  const wait = (async () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">    const url = `http://${hostname}:${port}`</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">    let healthy = false</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">    const gone = exit.promise.then((code) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">      if (healthy) return</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">      throw new Error(`Sidecar exited before health check passed with code ${code}`)</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">    const ready = async () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">      while (true) {</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">        await new Promise((resolve) =&gt; setTimeout(resolve, 100))</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">        if (await checkHealth(url, password)) {</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">          healthy = true</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">          return</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">    await Promise.race([ready(), gone])</span></span>
<span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">  })()</span></span>
<span class="source-line"><span class="source-line-number">182</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">  let stopping: Promise&lt;void&gt; | undefined</span></span>
<span class="source-line"><span class="source-line-number">184</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">  return {</span></span>
<span class="source-line"><span class="source-line-number">186</span><span class="source-line-text">    listener: {</span></span>
<span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">      stop: () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">        if (stopping) return stopping</span></span>
<span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">        if (exited) return Promise.resolve()</span></span>
<span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">        child.postMessage({ type: &quot;stop&quot; })</span></span>
<span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">        stopping = Promise.race([</span></span>
<span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">          exit.promise.then(() =&gt; undefined),</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">          delay(SIDECAR_STOP_TIMEOUT).then(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">            if (!exited) child.kill()</span></span>
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">          }),</span></span>
<span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">        ])</span></span>
<span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">        return stopping</span></span>
<span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">    health: { wait },</span></span>
<span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">  }</span></span></code></pre>
</details>：sidecar server 进程和健康检查。
12. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">sdks/vscode/src/extension.ts</span>
    <span class="source-ref-path"><code>sdks/vscode/src/extension.ts:45-100</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">  async function openTerminal() {</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">    // Create a new terminal in split screen</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">    const port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">    const terminal = vscode.window.createTerminal({</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">      name: TERMINAL_NAME,</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">      iconPath: {</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">        light: vscode.Uri.file(context.asAbsolutePath(&quot;images/button-dark.svg&quot;)),</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">        dark: vscode.Uri.file(context.asAbsolutePath(&quot;images/button-light.svg&quot;)),</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">      location: {</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">        viewColumn: vscode.ViewColumn.Beside,</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">        preserveFocus: false,</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">      env: {</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">        _EXTENSION_OPENCODE_PORT: port.toString(),</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">        OPENCODE_CALLER: &quot;vscode&quot;,</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    terminal.show()</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">    terminal.sendText(`opencode --port ${port}`)</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">    const fileRef = getActiveFile()</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">    if (!fileRef) {</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">      return</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">    // Wait for the terminal to be ready</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">    let tries = 10</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">    let connected = false</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">    do {</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">      await new Promise((resolve) =&gt; setTimeout(resolve, 200))</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">      try {</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">        await fetch(`http://localhost:${port}/app`)</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">        connected = true</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">        break</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">      } catch {}</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">      tries--</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">    } while (tries &gt; 0)</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">    // If connected, append the prompt to the terminal</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">    if (connected) {</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">      await appendPrompt(port, `In ${fileRef}`)</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">      terminal.show()</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">  async function appendPrompt(port: number, text: string) {</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">    await fetch(`http://localhost:${port}/tui/append-prompt`, {</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">      method: &quot;POST&quot;,</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">      headers: {</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">        &quot;Content-Type&quot;: &quot;application/json&quot;,</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">      body: JSON.stringify({ text }),</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">    })</span></span></code></pre>
</details>：VS Code terminal 启动和 append prompt。

## 6. 用户输入到 agent 行动的整体链路

### 6.1 CLI non-interactive

非交互模式直接走 SDK session API：

```ts
if (!args.interactive) {
  const events = await client.event.subscribe()
  loop(client, events).catch((e) => {
    console.error(e)
    process.exit(1)
  })

  const result = await client.session.prompt({
    sessionID,
    agent,
    model,
    variant: args.variant,
    parts: [...files, { type: "text", text: message }],
  })
  ...
  return
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:768-803</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">768</span><span class="source-line-text">        if (!args.interactive) {</span></span>
<span class="source-line"><span class="source-line-number">769</span><span class="source-line-text">          const events = await client.event.subscribe()</span></span>
<span class="source-line"><span class="source-line-number">770</span><span class="source-line-text">          loop(client, events).catch((e) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">771</span><span class="source-line-text">            console.error(e)</span></span>
<span class="source-line"><span class="source-line-number">772</span><span class="source-line-text">            process.exit(1)</span></span>
<span class="source-line"><span class="source-line-number">773</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">774</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">775</span><span class="source-line-text">          if (args.command) {</span></span>
<span class="source-line"><span class="source-line-number">776</span><span class="source-line-text">            const result = await client.session.command({</span></span>
<span class="source-line"><span class="source-line-number">777</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">778</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">779</span><span class="source-line-text">              model: args.model,</span></span>
<span class="source-line"><span class="source-line-number">780</span><span class="source-line-text">              command: args.command,</span></span>
<span class="source-line"><span class="source-line-number">781</span><span class="source-line-text">              arguments: message,</span></span>
<span class="source-line"><span class="source-line-number">782</span><span class="source-line-text">              variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">783</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">784</span><span class="source-line-text">            if (result.error) {</span></span>
<span class="source-line"><span class="source-line-number">785</span><span class="source-line-text">              if (!emit(&quot;error&quot;, { error: result.error })) UI.error(formatRunError(result.error))</span></span>
<span class="source-line"><span class="source-line-number">786</span><span class="source-line-text">              process.exitCode = 1</span></span>
<span class="source-line"><span class="source-line-number">787</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">788</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">789</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">790</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">791</span><span class="source-line-text">          const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">792</span><span class="source-line-text">          const result = await client.session.prompt({</span></span>
<span class="source-line"><span class="source-line-number">793</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">794</span><span class="source-line-text">            agent,</span></span>
<span class="source-line"><span class="source-line-number">795</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">796</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">797</span><span class="source-line-text">            parts: [...files, { type: &quot;text&quot;, text: message }],</span></span>
<span class="source-line"><span class="source-line-number">798</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">799</span><span class="source-line-text">          if (result.error) {</span></span>
<span class="source-line"><span class="source-line-number">800</span><span class="source-line-text">            if (!emit(&quot;error&quot;, { error: result.error })) UI.error(formatRunError(result.error))</span></span>
<span class="source-line"><span class="source-line-number">801</span><span class="source-line-text">            process.exitCode = 1</span></span>
<span class="source-line"><span class="source-line-number">802</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">803</span><span class="source-line-text">          return</span></span></code></pre>
</details>

CLI 自己不跑 agent loop。它把用户输入发到 session API，然后通过 event stream 等状态变化。

### 6.2 CLI/TUI interactive

交互模式进入 runtime：

```ts
const { runInteractiveMode } = await runtimeTask
await runInteractiveMode({
  sdk: client,
  directory: cwd,
  sessionID,
  sessionTitle: sess.title,
  resume: Boolean(args.session || args.continue) && !args.fork,
  replay,
  replayLimit: args["replay-limit"],
  agent,
  model,
  variant: args.variant,
  files,
  initialInput,
  createSession: createFreshSession,
  thinking,
  demo: args.demo,
})
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:806-825</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">806</span><span class="source-line-text">        const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">807</span><span class="source-line-text">        const { runInteractiveMode } = await runtimeTask</span></span>
<span class="source-line"><span class="source-line-number">808</span><span class="source-line-text">        try {</span></span>
<span class="source-line"><span class="source-line-number">809</span><span class="source-line-text">          await runInteractiveMode({</span></span>
<span class="source-line"><span class="source-line-number">810</span><span class="source-line-text">            sdk: client,</span></span>
<span class="source-line"><span class="source-line-number">811</span><span class="source-line-text">            directory: cwd,</span></span>
<span class="source-line"><span class="source-line-number">812</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">813</span><span class="source-line-text">            sessionTitle: sess.title,</span></span>
<span class="source-line"><span class="source-line-number">814</span><span class="source-line-text">            resume: Boolean(args.session || args.continue) &amp;&amp; !args.fork,</span></span>
<span class="source-line"><span class="source-line-number">815</span><span class="source-line-text">            replay,</span></span>
<span class="source-line"><span class="source-line-number">816</span><span class="source-line-text">            replayLimit: args[&quot;replay-limit&quot;],</span></span>
<span class="source-line"><span class="source-line-number">817</span><span class="source-line-text">            agent,</span></span>
<span class="source-line"><span class="source-line-number">818</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">819</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">820</span><span class="source-line-text">            files,</span></span>
<span class="source-line"><span class="source-line-number">821</span><span class="source-line-text">            initialInput,</span></span>
<span class="source-line"><span class="source-line-number">822</span><span class="source-line-text">            createSession: createFreshSession,</span></span>
<span class="source-line"><span class="source-line-number">823</span><span class="source-line-text">            thinking,</span></span>
<span class="source-line"><span class="source-line-number">824</span><span class="source-line-text">            demo: args.demo,</span></span>
<span class="source-line"><span class="source-line-number">825</span><span class="source-line-text">          })</span></span></code></pre>
</details>

本地 in-process 模式会构造一个 fetch，把请求直接交给 server web handler：

```ts
const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const { Server } = await import("@/server/server")
  const request = new Request(input, init)
  return Server.Default().app.fetch(request)
}) as typeof globalThis.fetch
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:834-839</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">834</span><span class="source-line-text">        const { runInteractiveLocalMode } = await runtimeTask</span></span>
<span class="source-line"><span class="source-line-number">835</span><span class="source-line-text">        const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">836</span><span class="source-line-text">          const { Server } = await import(&quot;@/server/server&quot;)</span></span>
<span class="source-line"><span class="source-line-number">837</span><span class="source-line-text">          const request = new Request(input, init)</span></span>
<span class="source-line"><span class="source-line-number">838</span><span class="source-line-text">          return Server.Default().app.fetch(request)</span></span>
<span class="source-line"><span class="source-line-number">839</span><span class="source-line-text">        }) as typeof globalThis.fetch</span></span></code></pre>
</details>

这说明本地 TUI 可以不启动外部端口，直接走同一套 HTTP handler。

### 6.3 interactive runtime 做什么

`runtime.ts` 顶部注释直接说明职责：

```ts
// Top-level orchestrator for `run --interactive`.
//
// Wires the boot sequence, lifecycle (renderer + footer), stream transport,
// and prompt queue together into a single session loop. Two entry points:
//
//   runInteractiveMode     -- used when an SDK client already exists (attach mode)
//   runInteractiveLocalMode -- used for local in-process mode (no server)
//
// Both delegate to runInteractiveRuntime, which:
//   1. resolves keybinds, diff style, model info, and session history,
//   2. creates the split-footer lifecycle (renderer + RunFooter),
//   3. starts the stream transport (SDK event subscription), lazily for fresh
//      local sessions,
//   4. runs the prompt queue until the footer closes.
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run/runtime.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run/runtime.ts:1-15</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1</span><span class="source-line-text">// Top-level orchestrator for `run --interactive`.</span></span>
<span class="source-line"><span class="source-line-number">2</span><span class="source-line-text">//</span></span>
<span class="source-line"><span class="source-line-number">3</span><span class="source-line-text">// Wires the boot sequence, lifecycle (renderer + footer), stream transport,</span></span>
<span class="source-line"><span class="source-line-number">4</span><span class="source-line-text">// and prompt queue together into a single session loop. Two entry points:</span></span>
<span class="source-line"><span class="source-line-number">5</span><span class="source-line-text">//</span></span>
<span class="source-line"><span class="source-line-number">6</span><span class="source-line-text">//   runInteractiveMode     -- used when an SDK client already exists (attach mode)</span></span>
<span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">//   runInteractiveLocalMode -- used for local in-process mode (no server)</span></span>
<span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">//</span></span>
<span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">// Both delegate to runInteractiveRuntime, which:</span></span>
<span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">//   1. resolves keybinds, diff style, model info, and session history,</span></span>
<span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">//   2. creates the split-footer lifecycle (renderer + RunFooter),</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">//   3. starts the stream transport (SDK event subscription), lazily for fresh</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">//      local sessions,</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">//   4. runs the prompt queue until the footer closes.</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">import { createOpencodeClient } from &quot;@opencode-ai/sdk/v2&quot;</span></span></code></pre>
</details>

运行中，它把 footer 的审批按钮接到 SDK：

```ts
onPermissionReply: async (next) => {
  log?.write("send.permission.reply", next)
  await ctx.sdk.permission.reply(next)
},
onQuestionReply: async (next) => {
  await ctx.sdk.question.reply(next)
},
onInterrupt: () => {
  if (!hasSession(input, state) || state.aborting) return
  state.aborting = true
  void ctx.sdk.session
    .abort({
      sessionID: state.sessionID,
    })
    .catch(() => {})
    .finally(() => {
      state.aborting = false
    })
},
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run/runtime.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run/runtime.ts:257-374</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">257</span><span class="source-line-text">        onPermissionReply: async (next) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">          if (state.demo?.permission(next)) {</span></span>
<span class="source-line"><span class="source-line-number">259</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">261</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">262</span><span class="source-line-text">          log?.write(&quot;send.permission.reply&quot;, next)</span></span>
<span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">          await ctx.sdk.permission.reply(next)</span></span>
<span class="source-line"><span class="source-line-number">264</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">265</span><span class="source-line-text">        onQuestionReply: async (next) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">          if (state.demo?.questionReply(next)) {</span></span>
<span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">269</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">          await ctx.sdk.question.reply(next)</span></span>
<span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">272</span><span class="source-line-text">        onQuestionReject: async (next) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">          if (state.demo?.questionReject(next)) {</span></span>
<span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">276</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">          await ctx.sdk.question.reject(next)</span></span>
<span class="source-line"><span class="source-line-number">278</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">        onCycleVariant: () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text">          if (!state.model || state.variants.length === 0) {</span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">            return {</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">              status: &quot;no variants available&quot;,</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">          state.activeVariant = cycleVariant(state.activeVariant, state.variants)</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">          saveVariant(state.model, state.activeVariant)</span></span>
<span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">          setRunSpanAttributes(span, {</span></span>
<span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">            &quot;opencode.model.variant&quot;: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">292</span><span class="source-line-text">            status: state.activeVariant ? `variant ${state.activeVariant}` : &quot;variant default&quot;,</span></span>
<span class="source-line"><span class="source-line-number">293</span><span class="source-line-text">            modelLabel: formatModelLabel(state.model, state.activeVariant, state.providers),</span></span>
<span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">            variant: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">        onModelSelect: async (model) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">          if (state.model?.providerID === model.providerID &amp;&amp; state.model.modelID === model.modelID) {</span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">          state.model = model</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">          state.activeVariant = undefined</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">          state.variants = variantsFor(state.providers, model)</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">          const switching = resolveSavedVariant(model).then((saved) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">            const current = state.model</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">            if (!current || current.providerID !== model.providerID || current.modelID !== model.modelID) {</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">              return</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">            state.activeVariant = resolveVariant(ctx.variant, undefined, saved, state.variants)</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">          state.switching = switching</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text">          await switching</span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">          if (state.switching === switching) {</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">            state.switching = undefined</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">          const current = state.model</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">          if (!current || current.providerID !== model.providerID || current.modelID !== model.modelID) {</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">          setRunSpanAttributes(span, {</span></span>
<span class="source-line"><span class="source-line-number">325</span><span class="source-line-text">            &quot;opencode.model.provider&quot;: model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">326</span><span class="source-line-text">            &quot;opencode.model.id&quot;: model.modelID,</span></span>
<span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">            &quot;opencode.model.variant&quot;: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">330</span><span class="source-line-text">            modelLabel: formatModelLabel(model, state.activeVariant, state.providers),</span></span>
<span class="source-line"><span class="source-line-number">331</span><span class="source-line-text">            status: `model ${model.modelID}`,</span></span>
<span class="source-line"><span class="source-line-number">332</span><span class="source-line-text">            variant: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">333</span><span class="source-line-text">            variants: state.variants,</span></span>
<span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">        onVariantSelect: async (variant) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text">          if (!state.model || state.variants.length === 0) {</span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">            return {</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text">              status: &quot;no variants available&quot;,</span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">          if (variant &amp;&amp; !state.variants.includes(variant)) {</span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text">            return {</span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">              status: `variant ${variant} unavailable`,</span></span>
<span class="source-line"><span class="source-line-number">346</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">348</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">349</span><span class="source-line-text">          state.activeVariant = variant</span></span>
<span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">          saveVariant(state.model, state.activeVariant)</span></span>
<span class="source-line"><span class="source-line-number">351</span><span class="source-line-text">          setRunSpanAttributes(span, {</span></span>
<span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">            &quot;opencode.model.variant&quot;: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">353</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">355</span><span class="source-line-text">            status: state.activeVariant ? `variant ${state.activeVariant}` : &quot;variant default&quot;,</span></span>
<span class="source-line"><span class="source-line-number">356</span><span class="source-line-text">            modelLabel: formatModelLabel(state.model, state.activeVariant, state.providers),</span></span>
<span class="source-line"><span class="source-line-number">357</span><span class="source-line-text">            variant: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">358</span><span class="source-line-text">            variants: state.variants,</span></span>
<span class="source-line"><span class="source-line-number">359</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">360</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">361</span><span class="source-line-text">        onInterrupt: () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">362</span><span class="source-line-text">          if (!hasSession(input, state) || state.aborting) {</span></span>
<span class="source-line"><span class="source-line-number">363</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">364</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">365</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">366</span><span class="source-line-text">          state.aborting = true</span></span>
<span class="source-line"><span class="source-line-number">367</span><span class="source-line-text">          void ctx.sdk.session</span></span>
<span class="source-line"><span class="source-line-number">368</span><span class="source-line-text">            .abort({</span></span>
<span class="source-line"><span class="source-line-number">369</span><span class="source-line-text">              sessionID: state.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">370</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">371</span><span class="source-line-text">            .catch(() =&gt; {})</span></span>
<span class="source-line"><span class="source-line-number">372</span><span class="source-line-text">            .finally(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">373</span><span class="source-line-text">              state.aborting = false</span></span>
<span class="source-line"><span class="source-line-number">374</span><span class="source-line-text">            })</span></span></code></pre>
</details>

UI 层只把用户操作转成 API call：permission reply、question reply、session abort。

### 6.4 TUI SDK 和事件流

TUI 创建 SDK：

```ts
function createSDK() {
  return createOpencodeClient({
    baseUrl: props.url,
    signal: abort.signal,
    directory: props.directory,
    fetch: props.fetch,
    headers: props.headers,
  })
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/tui/context/sdk.tsx</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/tui/context/sdk.tsx:24-31</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    function createSDK() {</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">      return createOpencodeClient({</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">        baseUrl: props.url,</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">        signal: abort.signal,</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">        directory: props.directory,</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">        fetch: props.fetch,</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">        headers: props.headers,</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      })</span></span></code></pre>
</details>

没有外部 event source 时，用 SDK 的 global event stream：

```ts
const events = await sdk.global.event({
  signal: ctrl.signal,
  sseMaxRetryAttempts: 0,
})

for await (const event of events.stream) {
  if (ctrl.signal.aborted) break
  handleEvent(event)
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/tui/context/sdk.tsx</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/tui/context/sdk.tsx:83-97</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">          const events = await sdk.global.event({</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">            signal: ctrl.signal,</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">            sseMaxRetryAttempts: 0,</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">          if (Flag.OPENCODE_EXPERIMENTAL_WORKSPACES) {</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">            // Start syncing workspaces, it's important to do this after</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">            // we've started listening to events</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">            await sdk.sync.start().catch(() =&gt; {})</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">          for await (const event of events.stream) {</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">            if (ctrl.signal.aborted) break</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">            handleEvent(event)</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">          }</span></span></code></pre>
</details>

为了减少重渲染，它把事件放进 queue，再用 Solid 的 `batch` 一次发出：

```ts
batch(() => {
  for (const event of events) {
    emitter.emit("event", event)
  }
})
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/tui/context/sdk.tsx</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/tui/context/sdk.tsx:52-57</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">      // Batch all event emissions so all store updates result in a single render</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">      batch(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">        for (const event of events) {</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">          emitter.emit(&quot;event&quot;, event)</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">      })</span></span></code></pre>
</details>

### 6.5 TUI 如何同步消息

`sync-v2` 根据 `session.next.*` 事件维护 message store：

```ts
case "session.next.prompted": {
  update(event.properties.sessionID, (draft) => {
    draft.unshift({
      id: event.id,
      type: "user",
      text: event.properties.prompt.text,
      files: event.properties.prompt.files,
      agents: event.properties.prompt.agents,
      time: { created: event.properties.timestamp },
    })
  })
  break
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/tui/context/sync-v2.tsx</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/tui/context/sync-v2.tsx:73-87</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">    event.subscribe((event) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">      switch (event.type) {</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">        case &quot;session.next.prompted&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">            draft.unshift({</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">              id: event.id,</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">              type: &quot;user&quot;,</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">              text: event.properties.prompt.text,</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">              files: event.properties.prompt.files,</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">              agents: event.properties.prompt.agents,</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">              time: { created: event.properties.timestamp },</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">        }</span></span></code></pre>
</details>

tool 状态也由事件更新：

```ts
case "session.next.tool.called":
  update(event.properties.sessionID, (draft) => {
    const match = latestTool(activeAssistant(draft), event.properties.callID)
    if (!match) return
    match.time.ran = event.properties.timestamp
    match.provider = event.properties.provider
    match.state = { status: "running", input: event.properties.input, structured: {}, content: [] }
  })
  break
case "session.next.tool.success":
  update(event.properties.sessionID, (draft) => {
    const match = latestTool(activeAssistant(draft), event.properties.callID)
    if (match?.state.status !== "running") return
    match.state = {
      status: "completed",
      input: match.state.input,
      structured: event.properties.structured,
      content: [...event.properties.content],
    }
    match.provider = event.properties.provider
    match.time.completed = event.properties.timestamp
  })
  break
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/tui/context/sync-v2.tsx</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/tui/context/sync-v2.tsx:191-220</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">        case &quot;session.next.tool.called&quot;:</span></span>
<span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">            const match = latestTool(activeAssistant(draft), event.properties.callID)</span></span>
<span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">            if (!match) return</span></span>
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">            match.time.ran = event.properties.timestamp</span></span>
<span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">            match.provider = event.properties.provider</span></span>
<span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">            match.state = { status: &quot;running&quot;, input: event.properties.input, structured: {}, content: [] }</span></span>
<span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">        case &quot;session.next.tool.progress&quot;:</span></span>
<span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">            const match = latestTool(activeAssistant(draft), event.properties.callID)</span></span>
<span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">            if (match?.state.status !== &quot;running&quot;) return</span></span>
<span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">            match.state.structured = event.properties.structured</span></span>
<span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">            match.state.content = [...event.properties.content]</span></span>
<span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">        case &quot;session.next.tool.success&quot;:</span></span>
<span class="source-line"><span class="source-line-number">209</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">            const match = latestTool(activeAssistant(draft), event.properties.callID)</span></span>
<span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">            if (match?.state.status !== &quot;running&quot;) return</span></span>
<span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">            match.state = {</span></span>
<span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">              status: &quot;completed&quot;,</span></span>
<span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">              input: match.state.input,</span></span>
<span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">              structured: event.properties.structured,</span></span>
<span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">              content: [...event.properties.content],</span></span>
<span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">            match.provider = event.properties.provider</span></span>
<span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">            match.time.completed = event.properties.timestamp</span></span>
<span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">          })</span></span></code></pre>
</details>

这说明 UI 是 event-sourced store：后端发布事件，前端把事件 reducer 到 UI 状态。

### 6.6 Web App

Web app 的核心外壳是 `AppInterface`：

```tsx
export function AppInterface(props: {
  children?: JSX.Element
  defaultServer: ServerConnection.Key
  servers?: Array<ServerConnection.Any>
  router?: Component<BaseRouterProps>
  disableHealthCheck?: boolean
}) {
  return (
    <ServerProvider defaultServer={props.defaultServer} disableHealthCheck={props.disableHealthCheck} servers={props.servers}>
      <ConnectionGate disableHealthCheck={props.disableHealthCheck}>
        <ServerKey>
          <QueryProvider>
            <GlobalSDKProvider>
              <GlobalSyncProvider>
                <Dynamic component={props.router ?? Router} root={(routerProps) => <RouterRoot appChildren={props.children}>{routerProps.children}</RouterRoot>}>
                  <Route path="/" component={HomeRoute} />
                  <Route path="/:dir" component={DirectoryLayout}>
                    <Route path="/" component={SessionIndexRoute} />
                    <Route path="/session/:id?" component={SessionRoute} />
                  </Route>
                </Dynamic>
              </GlobalSyncProvider>
            </GlobalSDKProvider>
          </QueryProvider>
        </ServerKey>
      </ConnectionGate>
    </ServerProvider>
  )
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/app/src/app.tsx</span>
    <span class="source-ref-path"><code>packages/app/src/app.tsx:295-329</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">export function AppInterface(props: {</span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text">  children?: JSX.Element</span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">  defaultServer: ServerConnection.Key</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">  servers?: Array&lt;ServerConnection.Any&gt;</span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">  router?: Component&lt;BaseRouterProps&gt;</span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">  disableHealthCheck?: boolean</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">}) {</span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">  return (</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">    &lt;ServerProvider</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">      defaultServer={props.defaultServer}</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">      disableHealthCheck={props.disableHealthCheck}</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">      servers={props.servers}</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">    &gt;</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">      &lt;ConnectionGate disableHealthCheck={props.disableHealthCheck}&gt;</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text">        &lt;ServerKey&gt;</span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text">          &lt;QueryProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">            &lt;GlobalSDKProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">              &lt;GlobalSyncProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">                &lt;Dynamic</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text">                  component={props.router ?? Router}</span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">                  root={(routerProps) =&gt; &lt;RouterRoot appChildren={props.children}&gt;{routerProps.children}&lt;/RouterRoot&gt;}</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">                &gt;</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">                  &lt;Route path=&quot;/&quot; component={HomeRoute} /&gt;</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text">                  &lt;Route path=&quot;/:dir&quot; component={DirectoryLayout}&gt;</span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">                    &lt;Route path=&quot;/&quot; component={SessionIndexRoute} /&gt;</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">                    &lt;Route path=&quot;/session/:id?&quot; component={SessionRoute} /&gt;</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">                  &lt;/Route&gt;</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">                &lt;/Dynamic&gt;</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text">              &lt;/GlobalSyncProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">            &lt;/GlobalSDKProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">325</span><span class="source-line-text">          &lt;/QueryProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">326</span><span class="source-line-text">        &lt;/ServerKey&gt;</span></span>
<span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">      &lt;/ConnectionGate&gt;</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">    &lt;/ServerProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">  )</span></span></code></pre>
</details>

Web app 关心 server 连接、健康检查、SDK、全局同步和路由，不直接调用 session internals。

### 6.7 Desktop

Desktop main process 会找端口、生成密码、启动 sidecar：

```ts
const port = yield* Effect.gen(function* () {
  const fromEnv = process.env.OPENCODE_PORT
  if (fromEnv) {
    const parsed = Number.parseInt(fromEnv, 10)
    if (!Number.isNaN(parsed)) return parsed
  }
  ...
})
const hostname = "127.0.0.1"
const url = `http://${hostname}:${port}`
const password = randomUUID()

const { listener, health } = yield* Effect.promise(() =>
  spawnLocalServer(hostname, port, password, {
    needsMigration,
    userDataPath: app.getPath("userData"),
    onSqliteProgress: (progress) => initEmitter.emit("sqlite", progress),
    onStdout: (message) => logger.log("sidecar stdout", { message }),
    onStderr: (message) => logger.warn("sidecar stderr", { message }),
    onExit: (code) => logger.warn("sidecar exited", { code }),
  }),
)
server = listener
yield* Deferred.succeed(serverReady, {
  url,
  username: "opencode",
  password,
})
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/desktop/src/main/index.ts</span>
    <span class="source-ref-path"><code>packages/desktop/src/main/index.ts:258-313</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">  const port = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">259</span><span class="source-line-text">    const fromEnv = process.env.OPENCODE_PORT</span></span>
<span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">    if (fromEnv) {</span></span>
<span class="source-line"><span class="source-line-number">261</span><span class="source-line-text">      const parsed = Number.parseInt(fromEnv, 10)</span></span>
<span class="source-line"><span class="source-line-number">262</span><span class="source-line-text">      if (!Number.isNaN(parsed)) return parsed</span></span>
<span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">264</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">265</span><span class="source-line-text">    const res = yield* Deferred.make&lt;number, unknown&gt;()</span></span>
<span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">    const server = createServer()</span></span>
<span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">    server.on(&quot;error&quot;, (e) =&gt; Deferred.failSync(res, () =&gt; e))</span></span>
<span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">    server.listen(0, &quot;127.0.0.1&quot;, () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">      const address = server.address()</span></span>
<span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">      if (typeof address !== &quot;object&quot; || !address) {</span></span>
<span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">        server.close()</span></span>
<span class="source-line"><span class="source-line-number">272</span><span class="source-line-text">        Deferred.failSync(res, () =&gt; new Error(&quot;Failed to get port&quot;))</span></span>
<span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">        return</span></span>
<span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">      const port = address.port</span></span>
<span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">      server.close(() =&gt; Effect.runSync(Deferred.succeed(res, port)))</span></span>
<span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">278</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">    return yield* Deferred.await(res)</span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">  const hostname = &quot;127.0.0.1&quot;</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">  const url = `http://${hostname}:${port}`</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">  const password = randomUUID()</span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">  const loadingTask = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">    logger.log(&quot;sidecar connection started&quot;, { url })</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">    initEmitter.on(&quot;sqlite&quot;, (progress: SqliteMigrationProgress) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">      setInitStep({ phase: &quot;sqlite_waiting&quot; })</span></span>
<span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">      if (overlay) sendSqliteMigrationProgress(overlay, progress)</span></span>
<span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">      if (mainWindow) sendSqliteMigrationProgress(mainWindow, progress)</span></span>
<span class="source-line"><span class="source-line-number">292</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">293</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">    ensureLoopbackNoProxy()</span></span>
<span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">    useEnvProxy()</span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">    logger.log(&quot;spawning sidecar&quot;, { url })</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">    const { listener, health } = yield* Effect.promise(() =&gt;</span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">      spawnLocalServer(hostname, port, password, {</span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">        needsMigration,</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">        userDataPath: app.getPath(&quot;userData&quot;),</span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">        onSqliteProgress: (progress) =&gt; initEmitter.emit(&quot;sqlite&quot;, progress),</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">        onStdout: (message) =&gt; logger.log(&quot;sidecar stdout&quot;, { message }),</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">        onStderr: (message) =&gt; logger.warn(&quot;sidecar stderr&quot;, { message }),</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">        onExit: (code) =&gt; logger.warn(&quot;sidecar exited&quot;, { code }),</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">      }),</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">    server = listener</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text">    yield* Deferred.succeed(serverReady, {</span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text">      url,</span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">      username: &quot;opencode&quot;,</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">      password,</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">    })</span></span></code></pre>
</details>

`spawnLocalServer` 用 Electron utility process 启动 sidecar，并等 `ready` 和 `/global/health`：

```ts
const child = utilityProcess.fork(sidecar, [], {
  cwd: process.cwd(),
  env: createSidecarEnv(),
  serviceName: SIDECAR_SERVICE_NAME,
  stdio: "pipe",
})
...
child.postMessage({
  type: "start",
  hostname,
  port,
  password,
  userDataPath: options.userDataPath,
  needsMigration: options.needsMigration,
})
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/desktop/src/main/server.ts</span>
    <span class="source-ref-path"><code>packages/desktop/src/main/server.ts:69-160</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">export async function spawnLocalServer(</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">  hostname: string,</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">  port: number,</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">  password: string,</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">  options: SpawnLocalServerOptions,</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">) {</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  const sidecar = join(dirname(fileURLToPath(import.meta.url)), &quot;sidecar.js&quot;)</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">  const child = utilityProcess.fork(sidecar, [], {</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">    cwd: process.cwd(),</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">    env: createSidecarEnv(),</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">    serviceName: SIDECAR_SERVICE_NAME,</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">    stdio: &quot;pipe&quot;,</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">  let exited = false</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">  const exit = defer&lt;number&gt;()</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">  const onProcessGone = (_event: unknown, details: Details) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">    if (details.type !== &quot;Utility&quot; || details.name !== SIDECAR_SERVICE_NAME) return</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">    options.onStderr?.(`utility process gone reason=${details.reason} exitCode=${details.exitCode}`)</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">  app.on(&quot;child-process-gone&quot;, onProcessGone)</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">  child.once(&quot;exit&quot;, (code) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">    exited = true</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">    app.off(&quot;child-process-gone&quot;, onProcessGone)</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">    options.onExit?.(code)</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">    exit.resolve(code)</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">  child.on(&quot;error&quot;, (error) =&gt; options.onStderr?.(`utility process error: ${serializeError(error).message}`))</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">  child.stdout?.on(&quot;data&quot;, (chunk: Buffer) =&gt; options.onStdout?.(chunk.toString(&quot;utf8&quot;).trimEnd()))</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">  child.stderr?.on(&quot;data&quot;, (chunk: Buffer) =&gt; options.onStderr?.(chunk.toString(&quot;utf8&quot;).trimEnd()))</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">  await new Promise&lt;void&gt;((resolve, reject) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">    let done = false</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">    let timeout: NodeJS.Timeout</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">    const fail = (error: Error) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">      if (done) return</span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">      done = true</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">      cleanup()</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">      reject(error)</span></span>
<span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">112</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">    const refreshTimeout = () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">      clearTimeout(timeout)</span></span>
<span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">      timeout = setTimeout(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">        fail(new Error(`Sidecar did not become ready within ${SIDECAR_START_STALL_TIMEOUT}ms: ${sidecar}`))</span></span>
<span class="source-line"><span class="source-line-number">117</span><span class="source-line-text">      }, SIDECAR_START_STALL_TIMEOUT)</span></span>
<span class="source-line"><span class="source-line-number">118</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">119</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">120</span><span class="source-line-text">    const onMessage = (message: SidecarMessage) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">      if (message.type === &quot;sqlite&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">        refreshTimeout()</span></span>
<span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">        options.onSqliteProgress?.(message.progress)</span></span>
<span class="source-line"><span class="source-line-number">124</span><span class="source-line-text">        return</span></span>
<span class="source-line"><span class="source-line-number">125</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">126</span><span class="source-line-text">      if (message.type === &quot;ready&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">        if (done) return</span></span>
<span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">        done = true</span></span>
<span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">        cleanup()</span></span>
<span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">        resolve()</span></span>
<span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">        return</span></span>
<span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">      if (message.type === &quot;error&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">        fail(Object.assign(new Error(message.error.message), { stack: message.error.stack }))</span></span>
<span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">136</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">137</span><span class="source-line-text">    const onExit = (code: number) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">138</span><span class="source-line-text">      fail(new Error(`Sidecar exited before ready with code ${code}`))</span></span>
<span class="source-line"><span class="source-line-number">139</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">140</span><span class="source-line-text">    const cleanup = () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">141</span><span class="source-line-text">      clearTimeout(timeout)</span></span>
<span class="source-line"><span class="source-line-number">142</span><span class="source-line-text">      child.off(&quot;message&quot;, onMessage)</span></span>
<span class="source-line"><span class="source-line-number">143</span><span class="source-line-text">      child.off(&quot;exit&quot;, onExit)</span></span>
<span class="source-line"><span class="source-line-number">144</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">145</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">146</span><span class="source-line-text">    child.on(&quot;message&quot;, onMessage)</span></span>
<span class="source-line"><span class="source-line-number">147</span><span class="source-line-text">    child.on(&quot;exit&quot;, onExit)</span></span>
<span class="source-line"><span class="source-line-number">148</span><span class="source-line-text">    refreshTimeout()</span></span>
<span class="source-line"><span class="source-line-number">149</span><span class="source-line-text">    child.postMessage({</span></span>
<span class="source-line"><span class="source-line-number">150</span><span class="source-line-text">      type: &quot;start&quot;,</span></span>
<span class="source-line"><span class="source-line-number">151</span><span class="source-line-text">      hostname,</span></span>
<span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">      port,</span></span>
<span class="source-line"><span class="source-line-number">153</span><span class="source-line-text">      password,</span></span>
<span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">      userDataPath: options.userDataPath,</span></span>
<span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">      needsMigration: options.needsMigration,</span></span>
<span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">157</span><span class="source-line-text">  }).catch((error) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">    if (!exited) child.kill()</span></span>
<span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">    throw error</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">  })</span></span></code></pre>
</details>

Renderer 复用 `@opencode-ai/app`：

```ts
import {
  AppBaseProviders,
  AppInterface,
  PlatformProvider,
  ServerConnection,
  useCommand,
} from "@opencode-ai/app"
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/desktop/src/renderer/index.tsx</span>
    <span class="source-ref-path"><code>packages/desktop/src/renderer/index.tsx:3-16</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">3</span><span class="source-line-text">import {</span></span>
<span class="source-line"><span class="source-line-number">4</span><span class="source-line-text">  ACCEPTED_FILE_EXTENSIONS,</span></span>
<span class="source-line"><span class="source-line-number">5</span><span class="source-line-text">  ACCEPTED_FILE_TYPES,</span></span>
<span class="source-line"><span class="source-line-number">6</span><span class="source-line-text">  AppBaseProviders,</span></span>
<span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">  AppInterface,</span></span>
<span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">  handleNotificationClick,</span></span>
<span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">  loadLocaleDict,</span></span>
<span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">  normalizeLocale,</span></span>
<span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">  type Locale,</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">  type Platform,</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">  PlatformProvider,</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">  ServerConnection,</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">  useCommand,</span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">} from &quot;@opencode-ai/app&quot;</span></span></code></pre>
</details>

### 6.8 VS Code extension

VS Code extension 不嵌入 agent runtime，只打开终端运行 opencode：

```ts
const port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384
const terminal = vscode.window.createTerminal({
  name: TERMINAL_NAME,
  ...
  env: {
    _EXTENSION_OPENCODE_PORT: port.toString(),
    OPENCODE_CALLER: "vscode",
  },
})

terminal.show()
terminal.sendText(`opencode --port ${port}`)
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">sdks/vscode/src/extension.ts</span>
    <span class="source-ref-path"><code>sdks/vscode/src/extension.ts:45-65</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">  async function openTerminal() {</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">    // Create a new terminal in split screen</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">    const port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">    const terminal = vscode.window.createTerminal({</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">      name: TERMINAL_NAME,</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">      iconPath: {</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">        light: vscode.Uri.file(context.asAbsolutePath(&quot;images/button-dark.svg&quot;)),</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">        dark: vscode.Uri.file(context.asAbsolutePath(&quot;images/button-light.svg&quot;)),</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">      location: {</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">        viewColumn: vscode.ViewColumn.Beside,</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">        preserveFocus: false,</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">      env: {</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">        _EXTENSION_OPENCODE_PORT: port.toString(),</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">        OPENCODE_CALLER: &quot;vscode&quot;,</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    terminal.show()</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">    terminal.sendText(`opencode --port ${port}`)</span></span></code></pre>
</details>

然后把当前文件追加到 TUI prompt：

```ts
async function appendPrompt(port: number, text: string) {
  await fetch(`http://localhost:${port}/tui/append-prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  })
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">sdks/vscode/src/extension.ts</span>
    <span class="source-ref-path"><code>sdks/vscode/src/extension.ts:93-100</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">  async function appendPrompt(port: number, text: string) {</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">    await fetch(`http://localhost:${port}/tui/append-prompt`, {</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">      method: &quot;POST&quot;,</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">      headers: {</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">        &quot;Content-Type&quot;: &quot;application/json&quot;,</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">      body: JSON.stringify({ text }),</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">    })</span></span></code></pre>
</details>

文件引用格式：

```ts
const relativePath = vscode.workspace.asRelativePath(document.uri)
let filepathWithAt = `@${relativePath}`

if (!selection.isEmpty) {
  const startLine = selection.start.line + 1
  const endLine = selection.end.line + 1
  if (startLine === endLine) {
    filepathWithAt += `#L${startLine}`
  } else {
    filepathWithAt += `#L${startLine}-${endLine}`
  }
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">sdks/vscode/src/extension.ts</span>
    <span class="source-ref-path"><code>sdks/vscode/src/extension.ts:115-135</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">    // Get the relative path from workspace root</span></span>
<span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">    const relativePath = vscode.workspace.asRelativePath(document.uri)</span></span>
<span class="source-line"><span class="source-line-number">117</span><span class="source-line-text">    let filepathWithAt = `@${relativePath}`</span></span>
<span class="source-line"><span class="source-line-number">118</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">    // Check if there's a selection and add line numbers</span></span>
<span class="source-line"><span class="source-line-number">120</span><span class="source-line-text">    const selection = activeEditor.selection</span></span>
<span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">    if (!selection.isEmpty) {</span></span>
<span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">      // Convert to 1-based line numbers</span></span>
<span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">      const startLine = selection.start.line + 1</span></span>
<span class="source-line"><span class="source-line-number">124</span><span class="source-line-text">      const endLine = selection.end.line + 1</span></span>
<span class="source-line"><span class="source-line-number">125</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">126</span><span class="source-line-text">      if (startLine === endLine) {</span></span>
<span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">        // Single line selection</span></span>
<span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">        filepathWithAt += `#L${startLine}`</span></span>
<span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">      } else {</span></span>
<span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">        // Multi-line selection</span></span>
<span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">        filepathWithAt += `#L${startLine}-${endLine}`</span></span>
<span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">134</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">    return filepathWithAt</span></span></code></pre>
</details>

这和用户在 prompt 里手动输入 `@file#Lx` 是同一条上下文入口。

## 7. 核心源码逐段讲解

### 7.1 TUI App provider 树

`tui/app.tsx` 使用 Solid/OpenTUI，把 SDK、同步、路由、主题、对话框、prompt history 等 context 组合起来。入口签名：

```ts
export function tui(input: {
  url: string
  args: Args
  config: TuiConfig.Resolved
  onSnapshot?: () => Promise<string[]>
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
  events?: EventSource
}) {
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/tui/app.tsx</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/tui/app.tsx:166-175</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">  headers?: RequestInit[&quot;headers&quot;]</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">  events?: EventSource</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">}) {</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">  // promise to prevent immediate exit</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">  // oxlint-disable-next-line no-async-promise-executor -- intentional: async executor used for sequential setup before resolve</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">  return new Promise&lt;void&gt;(async (resolve) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">    const unguard = win32InstallCtrlCGuard()</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">    win32DisableProcessedInput()</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">    const onExit = async () =&gt; {</span></span></code></pre>
</details>

这里的 `url/fetch/headers/events` 就是 TUI 和后端 runtime 的连接参数。

### 7.2 Web app 的 ServerConnection

```ts
export namespace ServerConnection {
  export type Http = {
    type: "http"
    http: HttpBase
    authToken?: boolean
  } & Base

  export type Sidecar = {
    type: "sidecar"
    http: HttpBase
  } & (
    | { variant: "base" }
    | {
        variant: "wsl"
        distro: string
      }
  ) &
    Base

  export type Ssh = {
    type: "ssh"
    host: string
    http: HttpBase
  } & Base
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/app/src/context/server.tsx</span>
    <span class="source-ref-path"><code>packages/app/src/context/server.tsx:63-105</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">export namespace ServerConnection {</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">  type Base = { displayName?: string }</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">  export type HttpBase = {</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">    url: string</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">    username?: string</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">    password?: string</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">  // Regular web connections</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">  export type Http = {</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">    type: &quot;http&quot;</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">    http: HttpBase</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">    authToken?: boolean</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">  } &amp; Base</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">  export type Sidecar = {</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">    type: &quot;sidecar&quot;</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">    http: HttpBase</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">  } &amp; (</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">    | // Regular desktop server</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">    { variant: &quot;base&quot; }</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">    // WSL server (windows only)</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">    | {</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">        variant: &quot;wsl&quot;</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">        distro: string</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">  ) &amp;</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">    Base</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">  // Remote server desktop can SSH into</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">  export type Ssh = {</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">    type: &quot;ssh&quot;</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">    host: string</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">    // SSH client exposes an HTTP server for the app to use as a proxy</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">    http: HttpBase</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">  } &amp; Base</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">  export type Any =</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">    | Http</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">    // All these are desktop-only</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">    | (Sidecar | Ssh)</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text"></span></span></code></pre>
</details>

Web app 抽象了三种连接：普通 HTTP、Desktop sidecar、SSH 代理。UI 不关心 server 具体在哪里。

### 7.3 全局事件流 coalescing

```ts
const key = (directory: string, payload: Event) => {
  if (payload.type === "session.status") return `session.status:${directory}:${payload.properties.sessionID}`
  if (payload.type === "lsp.updated") return `lsp.updated:${directory}`
  if (payload.type === "message.part.updated") {
    const part = payload.properties.part
    return `message.part.updated:${directory}:${part.messageID}:${part.id}`
  }
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/app/src/context/global-sdk.tsx</span>
    <span class="source-ref-path"><code>packages/app/src/context/global-sdk.tsx:59-66</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">    const key = (directory: string, payload: Event) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">      if (payload.type === &quot;session.status&quot;) return `session.status:${directory}:${payload.properties.sessionID}`</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">      if (payload.type === &quot;lsp.updated&quot;) return `lsp.updated:${directory}`</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">      if (payload.type === &quot;message.part.updated&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">        const part = payload.properties.part</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">        return `message.part.updated:${directory}:${part.messageID}:${part.id}`</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">    }</span></span></code></pre>
</details>

Web app 会合并部分高频事件，避免 UI 因为 token/tool metadata 频繁更新而过度渲染。

## 8. 关键 TypeScript 语法复习

### TSX / JSX

```tsx
<ServerProvider defaultServer={props.defaultServer}>
  <ConnectionGate>
    <GlobalSDKProvider>
      <GlobalSyncProvider>{...}</GlobalSyncProvider>
    </GlobalSDKProvider>
  </ConnectionGate>
</ServerProvider>
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/app/src/app.tsx</span>
    <span class="source-ref-path"><code>packages/app/src/app.tsx:303-329</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">    &lt;ServerProvider</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">      defaultServer={props.defaultServer}</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">      disableHealthCheck={props.disableHealthCheck}</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">      servers={props.servers}</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">    &gt;</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">      &lt;ConnectionGate disableHealthCheck={props.disableHealthCheck}&gt;</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text">        &lt;ServerKey&gt;</span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text">          &lt;QueryProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">            &lt;GlobalSDKProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">              &lt;GlobalSyncProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">                &lt;Dynamic</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text">                  component={props.router ?? Router}</span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">                  root={(routerProps) =&gt; &lt;RouterRoot appChildren={props.children}&gt;{routerProps.children}&lt;/RouterRoot&gt;}</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">                &gt;</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">                  &lt;Route path=&quot;/&quot; component={HomeRoute} /&gt;</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text">                  &lt;Route path=&quot;/:dir&quot; component={DirectoryLayout}&gt;</span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">                    &lt;Route path=&quot;/&quot; component={SessionIndexRoute} /&gt;</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">                    &lt;Route path=&quot;/session/:id?&quot; component={SessionRoute} /&gt;</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">                  &lt;/Route&gt;</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">                &lt;/Dynamic&gt;</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text">              &lt;/GlobalSyncProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">            &lt;/GlobalSDKProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">325</span><span class="source-line-text">          &lt;/QueryProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">326</span><span class="source-line-text">        &lt;/ServerKey&gt;</span></span>
<span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">      &lt;/ConnectionGate&gt;</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">    &lt;/ServerProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">  )</span></span></code></pre>
</details>

Java 类比模板/组件树，但 TSX 本质是函数调用和对象 props。

### `as const`

```ts
const appBindingCommands = [
  "command.palette.show",
  "session.list",
  ...
] as const
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/tui/app.tsx</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/tui/app.tsx:82-124</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">  &quot;session.quick_switch.4&quot;,</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">  &quot;session.quick_switch.5&quot;,</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">  &quot;session.quick_switch.6&quot;,</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">  &quot;session.quick_switch.7&quot;,</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">  &quot;session.quick_switch.8&quot;,</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">  &quot;session.quick_switch.9&quot;,</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">  &quot;model.list&quot;,</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">  &quot;model.cycle_recent&quot;,</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">  &quot;model.cycle_recent_reverse&quot;,</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">  &quot;model.cycle_favorite&quot;,</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">  &quot;model.cycle_favorite_reverse&quot;,</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">  &quot;agent.list&quot;,</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">  &quot;mcp.list&quot;,</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">  &quot;agent.cycle&quot;,</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">  &quot;agent.cycle.reverse&quot;,</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">  &quot;variant.cycle&quot;,</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">  &quot;variant.list&quot;,</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">  &quot;provider.connect&quot;,</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">  &quot;console.org.switch&quot;,</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">  &quot;opencode.status&quot;,</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">  &quot;theme.switch&quot;,</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">  &quot;theme.switch_mode&quot;,</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">  &quot;theme.mode.lock&quot;,</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">  &quot;help.show&quot;,</span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">  &quot;docs.open&quot;,</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">  &quot;app.debug&quot;,</span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">  &quot;app.console&quot;,</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">  &quot;app.heap_snapshot&quot;,</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">  &quot;terminal.suspend&quot;,</span></span>
<span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">  &quot;terminal.title.toggle&quot;,</span></span>
<span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">  &quot;app.toggle.animations&quot;,</span></span>
<span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">  &quot;app.toggle.file_context&quot;,</span></span>
<span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">  &quot;app.toggle.diffwrap&quot;,</span></span>
<span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">  &quot;app.toggle.paste_summary&quot;,</span></span>
<span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">  &quot;app.toggle.session_directory_filter&quot;,</span></span>
<span class="source-line"><span class="source-line-number">117</span><span class="source-line-text">] as const</span></span>
<span class="source-line"><span class="source-line-number">118</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">function rendererConfig(_config: TuiConfig.Resolved): CliRendererConfig {</span></span>
<span class="source-line"><span class="source-line-number">120</span><span class="source-line-text">  const mouseEnabled = !Flag.OPENCODE_DISABLE_MOUSE &amp;&amp; (_config.mouse ?? true)</span></span>
<span class="source-line"><span class="source-line-number">121</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">  return {</span></span>
<span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">    externalOutputMode: &quot;passthrough&quot;,</span></span>
<span class="source-line"><span class="source-line-number">124</span><span class="source-line-text">    targetFps: 60,</span></span></code></pre>
</details>

让命令数组变成 literal union。

### Accessor

```ts
init: (props: { directory: Accessor<string> }) => {
  const directory = createMemo(props.directory)
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/app/src/context/sdk.tsx</span>
    <span class="source-ref-path"><code>packages/app/src/context/sdk.tsx:11-17</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">export const { use: useSDK, provider: SDKProvider } = createSimpleContext({</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">  name: &quot;SDK&quot;,</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">  init: (props: { directory: Accessor&lt;string&gt; }) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">    const globalSDK = useGlobalSDK()</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    const directory = createMemo(props.directory)</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">    const client = createMemo(() =&gt;</span></span></code></pre>
</details>

Solid 的 `Accessor<T>` 类似 `() => T` 的 getter signal。Java 没有直接对应，可类比 `Supplier<T>`。

### discriminated union

```ts
export type Any =
  | Http
  | (Sidecar | Ssh)
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/app/src/context/server.tsx</span>
    <span class="source-ref-path"><code>packages/app/src/context/server.tsx:101-105</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">  export type Any =</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">    | Http</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">    // All these are desktop-only</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">    | (Sidecar | Ssh)</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text"></span></span></code></pre>
</details>

`type` 字段区分不同 server connection。

### async iterator

```ts
for await (const event of events.stream) {
  handleEvent(event)
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/tui/context/sdk.tsx</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/tui/context/sdk.tsx:94-97</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">          for await (const event of events.stream) {</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">            if (ctrl.signal.aborted) break</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">            handleEvent(event)</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">          }</span></span></code></pre>
</details>

Java 类比 Reactive Stream/Flux，一边接收一边处理。

### createMemo/createEffect/onCleanup

```ts
const client = createMemo(() =>
  globalSDK.createClient({
    directory: directory(),
    throwOnError: true,
  }),
)

createEffect(() => {
  const unsub = globalSDK.event.on(directory(), (event) => {
    emitter.emit(event.type, event)
  })
  onCleanup(unsub)
})
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/app/src/context/sdk.tsx</span>
    <span class="source-ref-path"><code>packages/app/src/context/sdk.tsx:16-31</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    const directory = createMemo(props.directory)</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">    const client = createMemo(() =&gt;</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">      globalSDK.createClient({</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">        directory: directory(),</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">        throwOnError: true,</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">      }),</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    const emitter = createGlobalEmitter&lt;SDKEventMap&gt;()</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">    createEffect(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">      const unsub = globalSDK.event.on(directory(), (event) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">        emitter.emit(event.type, event)</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">      onCleanup(unsub)</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">    })</span></span></code></pre>
</details>

Solid 的响应式 primitive。Java 后端可以类比依赖变化时重建 bean 监听，但前端是细粒度响应式。

## 9. 涉及的设计模式和架构思想

- **Thin client**：UI 只负责输入、展示、同步、审批。
- **Shared runtime**：所有 UI 复用 session/tool/provider/permission runtime。
- **Event-sourced UI state**：TUI/Web 根据 event stream reducer 出消息状态。
- **Adapter**：Desktop sidecar、VS Code terminal、Web HTTP 都是对 runtime 的适配。
- **Provider tree**：Solid context/provider 组合跨层共享 SDK、server、settings、sync。
- **Backpressure/coalescing**：高频事件批处理，降低渲染压力。
- **Local in-process server**：CLI TUI 可用 `Server.Default().app.fetch` 走同一 handler。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

- 和 Tool：UI 展示 tool pending/running/completed/error，并发送 permission reply。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/tui/context/sync-v2.tsx</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/tui/context/sync-v2.tsx:172-236</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">        case &quot;session.next.tool.input.started&quot;:</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">            activeAssistant(draft)?.content.push({</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">              type: &quot;tool&quot;,</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">              id: event.properties.callID,</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">              name: event.properties.name,</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">              time: { created: event.properties.timestamp },</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">              state: { status: &quot;pending&quot;, input: &quot;&quot; },</span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">        case &quot;session.next.tool.input.delta&quot;:</span></span>
<span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">            const match = latestTool(activeAssistant(draft), event.properties.callID)</span></span>
<span class="source-line"><span class="source-line-number">186</span><span class="source-line-text">            if (match?.state.status === &quot;pending&quot;) match.state.input += event.properties.delta</span></span>
<span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">        case &quot;session.next.tool.input.ended&quot;:</span></span>
<span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">        case &quot;session.next.tool.called&quot;:</span></span>
<span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">            const match = latestTool(activeAssistant(draft), event.properties.callID)</span></span>
<span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">            if (!match) return</span></span>
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">            match.time.ran = event.properties.timestamp</span></span>
<span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">            match.provider = event.properties.provider</span></span>
<span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">            match.state = { status: &quot;running&quot;, input: event.properties.input, structured: {}, content: [] }</span></span>
<span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">        case &quot;session.next.tool.progress&quot;:</span></span>
<span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">            const match = latestTool(activeAssistant(draft), event.properties.callID)</span></span>
<span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">            if (match?.state.status !== &quot;running&quot;) return</span></span>
<span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">            match.state.structured = event.properties.structured</span></span>
<span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">            match.state.content = [...event.properties.content]</span></span>
<span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">        case &quot;session.next.tool.success&quot;:</span></span>
<span class="source-line"><span class="source-line-number">209</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">            const match = latestTool(activeAssistant(draft), event.properties.callID)</span></span>
<span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">            if (match?.state.status !== &quot;running&quot;) return</span></span>
<span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">            match.state = {</span></span>
<span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">              status: &quot;completed&quot;,</span></span>
<span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">              input: match.state.input,</span></span>
<span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">              structured: event.properties.structured,</span></span>
<span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">              content: [...event.properties.content],</span></span>
<span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">            match.provider = event.properties.provider</span></span>
<span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">            match.time.completed = event.properties.timestamp</span></span>
<span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">221</span><span class="source-line-text">          break</span></span>
<span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">        case &quot;session.next.tool.failed&quot;:</span></span>
<span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">          update(event.properties.sessionID, (draft) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">            const match = latestTool(activeAssistant(draft), event.properties.callID)</span></span>
<span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">            if (match?.state.status !== &quot;running&quot;) return</span></span>
<span class="source-line"><span class="source-line-number">226</span><span class="source-line-text">            match.state = {</span></span>
<span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">              status: &quot;error&quot;,</span></span>
<span class="source-line"><span class="source-line-number">228</span><span class="source-line-text">              error: event.properties.error,</span></span>
<span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">              input: match.state.input,</span></span>
<span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">              structured: match.state.structured,</span></span>
<span class="source-line"><span class="source-line-number">231</span><span class="source-line-text">              content: match.state.content,</span></span>
<span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">233</span><span class="source-line-text">            match.provider = event.properties.provider</span></span>
<span class="source-line"><span class="source-line-number">234</span><span class="source-line-text">            match.time.completed = event.properties.timestamp</span></span>
<span class="source-line"><span class="source-line-number">235</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">          break</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run/runtime.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run/runtime.ts:257-264</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">257</span><span class="source-line-text">        onPermissionReply: async (next) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">          if (state.demo?.permission(next)) {</span></span>
<span class="source-line"><span class="source-line-number">259</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">261</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">262</span><span class="source-line-text">          log?.write(&quot;send.permission.reply&quot;, next)</span></span>
<span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">          await ctx.sdk.permission.reply(next)</span></span>
<span class="source-line"><span class="source-line-number">264</span><span class="source-line-text">        },</span></span></code></pre>
</details>。
- 和 Provider：UI 只选择模型/variant；实际 provider 调用在 LLM 层。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run/runtime.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run/runtime.ts:297-335</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">        onModelSelect: async (model) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">          if (state.model?.providerID === model.providerID &amp;&amp; state.model.modelID === model.modelID) {</span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">          state.model = model</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">          state.activeVariant = undefined</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">          state.variants = variantsFor(state.providers, model)</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">          const switching = resolveSavedVariant(model).then((saved) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">            const current = state.model</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">            if (!current || current.providerID !== model.providerID || current.modelID !== model.modelID) {</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">              return</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">            state.activeVariant = resolveVariant(ctx.variant, undefined, saved, state.variants)</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">          state.switching = switching</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text">          await switching</span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">          if (state.switching === switching) {</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">            state.switching = undefined</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">          const current = state.model</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">          if (!current || current.providerID !== model.providerID || current.modelID !== model.modelID) {</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">          setRunSpanAttributes(span, {</span></span>
<span class="source-line"><span class="source-line-number">325</span><span class="source-line-text">            &quot;opencode.model.provider&quot;: model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">326</span><span class="source-line-text">            &quot;opencode.model.id&quot;: model.modelID,</span></span>
<span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">            &quot;opencode.model.variant&quot;: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">330</span><span class="source-line-text">            modelLabel: formatModelLabel(model, state.activeVariant, state.providers),</span></span>
<span class="source-line"><span class="source-line-number">331</span><span class="source-line-text">            status: `model ${model.modelID}`,</span></span>
<span class="source-line"><span class="source-line-number">332</span><span class="source-line-text">            variant: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">333</span><span class="source-line-text">            variants: state.variants,</span></span>
<span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">        },</span></span></code></pre>
</details>。
- 和 Session：UI 通过 `session.prompt`、`session.command`、`session.abort` 和 event stream 操作 session。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:775-803</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">775</span><span class="source-line-text">          if (args.command) {</span></span>
<span class="source-line"><span class="source-line-number">776</span><span class="source-line-text">            const result = await client.session.command({</span></span>
<span class="source-line"><span class="source-line-number">777</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">778</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">779</span><span class="source-line-text">              model: args.model,</span></span>
<span class="source-line"><span class="source-line-number">780</span><span class="source-line-text">              command: args.command,</span></span>
<span class="source-line"><span class="source-line-number">781</span><span class="source-line-text">              arguments: message,</span></span>
<span class="source-line"><span class="source-line-number">782</span><span class="source-line-text">              variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">783</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">784</span><span class="source-line-text">            if (result.error) {</span></span>
<span class="source-line"><span class="source-line-number">785</span><span class="source-line-text">              if (!emit(&quot;error&quot;, { error: result.error })) UI.error(formatRunError(result.error))</span></span>
<span class="source-line"><span class="source-line-number">786</span><span class="source-line-text">              process.exitCode = 1</span></span>
<span class="source-line"><span class="source-line-number">787</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">788</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">789</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">790</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">791</span><span class="source-line-text">          const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">792</span><span class="source-line-text">          const result = await client.session.prompt({</span></span>
<span class="source-line"><span class="source-line-number">793</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">794</span><span class="source-line-text">            agent,</span></span>
<span class="source-line"><span class="source-line-number">795</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">796</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">797</span><span class="source-line-text">            parts: [...files, { type: &quot;text&quot;, text: message }],</span></span>
<span class="source-line"><span class="source-line-number">798</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">799</span><span class="source-line-text">          if (result.error) {</span></span>
<span class="source-line"><span class="source-line-number">800</span><span class="source-line-text">            if (!emit(&quot;error&quot;, { error: result.error })) UI.error(formatRunError(result.error))</span></span>
<span class="source-line"><span class="source-line-number">801</span><span class="source-line-text">            process.exitCode = 1</span></span>
<span class="source-line"><span class="source-line-number">802</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">803</span><span class="source-line-text">          return</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run/runtime.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run/runtime.ts:361-374</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">361</span><span class="source-line-text">        onInterrupt: () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">362</span><span class="source-line-text">          if (!hasSession(input, state) || state.aborting) {</span></span>
<span class="source-line"><span class="source-line-number">363</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">364</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">365</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">366</span><span class="source-line-text">          state.aborting = true</span></span>
<span class="source-line"><span class="source-line-number">367</span><span class="source-line-text">          void ctx.sdk.session</span></span>
<span class="source-line"><span class="source-line-number">368</span><span class="source-line-text">            .abort({</span></span>
<span class="source-line"><span class="source-line-number">369</span><span class="source-line-text">              sessionID: state.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">370</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">371</span><span class="source-line-text">            .catch(() =&gt; {})</span></span>
<span class="source-line"><span class="source-line-number">372</span><span class="source-line-text">            .finally(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">373</span><span class="source-line-text">              state.aborting = false</span></span>
<span class="source-line"><span class="source-line-number">374</span><span class="source-line-text">            })</span></span></code></pre>
</details>。
- 和文件系统：VS Code extension 把当前文件转成 `@relativePath#Lx`；真正文件读取由 session prompt/file tools 处理。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">sdks/vscode/src/extension.ts</span>
    <span class="source-ref-path"><code>sdks/vscode/src/extension.ts:115-135</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">    // Get the relative path from workspace root</span></span>
<span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">    const relativePath = vscode.workspace.asRelativePath(document.uri)</span></span>
<span class="source-line"><span class="source-line-number">117</span><span class="source-line-text">    let filepathWithAt = `@${relativePath}`</span></span>
<span class="source-line"><span class="source-line-number">118</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">    // Check if there's a selection and add line numbers</span></span>
<span class="source-line"><span class="source-line-number">120</span><span class="source-line-text">    const selection = activeEditor.selection</span></span>
<span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">    if (!selection.isEmpty) {</span></span>
<span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">      // Convert to 1-based line numbers</span></span>
<span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">      const startLine = selection.start.line + 1</span></span>
<span class="source-line"><span class="source-line-number">124</span><span class="source-line-text">      const endLine = selection.end.line + 1</span></span>
<span class="source-line"><span class="source-line-number">125</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">126</span><span class="source-line-text">      if (startLine === endLine) {</span></span>
<span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">        // Single line selection</span></span>
<span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">        filepathWithAt += `#L${startLine}`</span></span>
<span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">      } else {</span></span>
<span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">        // Multi-line selection</span></span>
<span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">        filepathWithAt += `#L${startLine}-${endLine}`</span></span>
<span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">134</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">    return filepathWithAt</span></span></code></pre>
</details>。
- 和 Desktop：Desktop 负责启动 sidecar 和窗口，renderer 复用 app。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/desktop/src/main/index.ts</span>
    <span class="source-ref-path"><code>packages/desktop/src/main/index.ts:258-345</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">  const port = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">259</span><span class="source-line-text">    const fromEnv = process.env.OPENCODE_PORT</span></span>
<span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">    if (fromEnv) {</span></span>
<span class="source-line"><span class="source-line-number">261</span><span class="source-line-text">      const parsed = Number.parseInt(fromEnv, 10)</span></span>
<span class="source-line"><span class="source-line-number">262</span><span class="source-line-text">      if (!Number.isNaN(parsed)) return parsed</span></span>
<span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">264</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">265</span><span class="source-line-text">    const res = yield* Deferred.make&lt;number, unknown&gt;()</span></span>
<span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">    const server = createServer()</span></span>
<span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">    server.on(&quot;error&quot;, (e) =&gt; Deferred.failSync(res, () =&gt; e))</span></span>
<span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">    server.listen(0, &quot;127.0.0.1&quot;, () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">      const address = server.address()</span></span>
<span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">      if (typeof address !== &quot;object&quot; || !address) {</span></span>
<span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">        server.close()</span></span>
<span class="source-line"><span class="source-line-number">272</span><span class="source-line-text">        Deferred.failSync(res, () =&gt; new Error(&quot;Failed to get port&quot;))</span></span>
<span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">        return</span></span>
<span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">      const port = address.port</span></span>
<span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">      server.close(() =&gt; Effect.runSync(Deferred.succeed(res, port)))</span></span>
<span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">278</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">    return yield* Deferred.await(res)</span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">  const hostname = &quot;127.0.0.1&quot;</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">  const url = `http://${hostname}:${port}`</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">  const password = randomUUID()</span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">  const loadingTask = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">    logger.log(&quot;sidecar connection started&quot;, { url })</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">    initEmitter.on(&quot;sqlite&quot;, (progress: SqliteMigrationProgress) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">      setInitStep({ phase: &quot;sqlite_waiting&quot; })</span></span>
<span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">      if (overlay) sendSqliteMigrationProgress(overlay, progress)</span></span>
<span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">      if (mainWindow) sendSqliteMigrationProgress(mainWindow, progress)</span></span>
<span class="source-line"><span class="source-line-number">292</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">293</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">    ensureLoopbackNoProxy()</span></span>
<span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">    useEnvProxy()</span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">    logger.log(&quot;spawning sidecar&quot;, { url })</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">    const { listener, health } = yield* Effect.promise(() =&gt;</span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">      spawnLocalServer(hostname, port, password, {</span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">        needsMigration,</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">        userDataPath: app.getPath(&quot;userData&quot;),</span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">        onSqliteProgress: (progress) =&gt; initEmitter.emit(&quot;sqlite&quot;, progress),</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">        onStdout: (message) =&gt; logger.log(&quot;sidecar stdout&quot;, { message }),</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">        onStderr: (message) =&gt; logger.warn(&quot;sidecar stderr&quot;, { message }),</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">        onExit: (code) =&gt; logger.warn(&quot;sidecar exited&quot;, { code }),</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">      }),</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">    server = listener</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text">    yield* Deferred.succeed(serverReady, {</span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text">      url,</span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">      username: &quot;opencode&quot;,</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">      password,</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">    yield* Effect.promise(() =&gt; health.wait).pipe(</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">      Effect.timeout(&quot;30 seconds&quot;),</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">      Effect.catch((e) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text">        Effect.sync(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">          logger.error(&quot;sidecar health check failed&quot;, e.toString())</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">      ),</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">    logger.log(&quot;loading task finished&quot;)</span></span>
<span class="source-line"><span class="source-line-number">325</span><span class="source-line-text">  }).pipe(Effect.forkChild)</span></span>
<span class="source-line"><span class="source-line-number">326</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">  if (needsMigration) {</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">    const show = yield* loadingTask.pipe(</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">      Fiber.await,</span></span>
<span class="source-line"><span class="source-line-number">330</span><span class="source-line-text">      Effect.timeout(&quot;1 second&quot;),</span></span>
<span class="source-line"><span class="source-line-number">331</span><span class="source-line-text">      Effect.as(false),</span></span>
<span class="source-line"><span class="source-line-number">332</span><span class="source-line-text">      Effect.catch(() =&gt; Effect.succeed(true)),</span></span>
<span class="source-line"><span class="source-line-number">333</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">    if (show) {</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">      overlay = createLoadingWindow()</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">      yield* Effect.sleep(&quot;1 second&quot;)</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">  yield* Fiber.await(loadingTask)</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">  setInitStep({ phase: &quot;done&quot; })</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">  if (overlay) yield* Deferred.await(loadingComplete)</span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">  mainWindow = createMainWindow()</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/desktop/src/renderer/index.tsx</span>
    <span class="source-ref-path"><code>packages/desktop/src/renderer/index.tsx:3-16</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">3</span><span class="source-line-text">import {</span></span>
<span class="source-line"><span class="source-line-number">4</span><span class="source-line-text">  ACCEPTED_FILE_EXTENSIONS,</span></span>
<span class="source-line"><span class="source-line-number">5</span><span class="source-line-text">  ACCEPTED_FILE_TYPES,</span></span>
<span class="source-line"><span class="source-line-number">6</span><span class="source-line-text">  AppBaseProviders,</span></span>
<span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">  AppInterface,</span></span>
<span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">  handleNotificationClick,</span></span>
<span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">  loadLocaleDict,</span></span>
<span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">  normalizeLocale,</span></span>
<span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">  type Locale,</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">  type Platform,</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">  PlatformProvider,</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">  ServerConnection,</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">  useCommand,</span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">} from &quot;@opencode-ai/app&quot;</span></span></code></pre>
</details>。

## 11. 如果自己实现 mini agent，这一章对应什么代码

mini agent 的 UI 先不要做复杂 TUI。最小结构：

```ts
async function runCli(client: AgentClient) {
  const events = client.events()
  void (async () => {
    for await (const event of events) {
      renderEvent(event)
      if (event.type === "permission.asked") {
        const reply = await promptUser(event)
        await client.permission.reply(reply)
      }
    }
  })()

  while (true) {
    const text = await readLine("> ")
    await client.session.prompt({ text })
  }
}
```

实现顺序：

1. CLI 输入框。
2. 事件流渲染 text delta。
3. 渲染 tool call 状态。
4. permission asked 时让用户选择 once/reject。
5. session abort。
6. 再考虑 Web/Desktop/IDE 插件。

## 12. 费曼复述区

请你不看源码复述：

1. 为什么 UI 层不应该重写 agent loop？
2. TUI 如何从 event stream 同步 tool 状态？
3. `runInteractiveLocalMode` 为什么可以不用外部 HTTP server？
4. Desktop sidecar 解决了什么问题？
5. VS Code extension 为什么只开 terminal，而不是自己实现 chat UI？

如果说不出来，常见卡点是：

- 把 UI 当成 agent runtime，而不是 runtime client。
- 不理解 event stream 是 UI 状态的来源。
- 不知道 Desktop 的主进程和 renderer 分工。

换一种说法：UI 是 agent 的“仪表盘和遥控器”，不是发动机。

## 13. 练习题

### 入门题

1. 找到 `run.ts` 中 non-interactive 和 interactive 分支。
2. 找到 TUI `SDKProvider`，说明它如何创建 SDK。
3. 找到 VS Code extension 的 `getActiveFile`，说明它如何生成 `@file#Lx`。

### 进阶题

1. 阅读 `sync-v2`，列出 user/text/tool/reasoning 四类事件如何更新 store。
2. 阅读 `global-sdk.tsx`，解释 coalescing 为什么需要跳过 stale delta。
3. 阅读 Desktop `spawnLocalServer`，解释 ready 和 health check 的差异。

### 源码追踪题

1. 从 `opencode run --interactive` 追到 `runInteractiveRuntime`。
2. 从 `permission.asked` 事件追到 footer 的 `onPermissionReply`。
3. 从 Desktop main 的 `spawnLocalServer` 追到 renderer `AppInterface`。
4. 从 VS Code command 追到 `/tui/append-prompt`。

### 小实现题

写一个 mini TUI store：

- 输入 event stream。
- 支持 `text.delta` 追加文本。
- 支持 `tool.called/tool.success/tool.failed` 更新 tool 状态。
- 支持 `permission.asked` 暂停渲染并等待用户选择。

## 14. 源码追踪任务

建议阅读顺序：

1. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:768-879</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">768</span><span class="source-line-text">        if (!args.interactive) {</span></span>
<span class="source-line"><span class="source-line-number">769</span><span class="source-line-text">          const events = await client.event.subscribe()</span></span>
<span class="source-line"><span class="source-line-number">770</span><span class="source-line-text">          loop(client, events).catch((e) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">771</span><span class="source-line-text">            console.error(e)</span></span>
<span class="source-line"><span class="source-line-number">772</span><span class="source-line-text">            process.exit(1)</span></span>
<span class="source-line"><span class="source-line-number">773</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">774</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">775</span><span class="source-line-text">          if (args.command) {</span></span>
<span class="source-line"><span class="source-line-number">776</span><span class="source-line-text">            const result = await client.session.command({</span></span>
<span class="source-line"><span class="source-line-number">777</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">778</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">779</span><span class="source-line-text">              model: args.model,</span></span>
<span class="source-line"><span class="source-line-number">780</span><span class="source-line-text">              command: args.command,</span></span>
<span class="source-line"><span class="source-line-number">781</span><span class="source-line-text">              arguments: message,</span></span>
<span class="source-line"><span class="source-line-number">782</span><span class="source-line-text">              variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">783</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">784</span><span class="source-line-text">            if (result.error) {</span></span>
<span class="source-line"><span class="source-line-number">785</span><span class="source-line-text">              if (!emit(&quot;error&quot;, { error: result.error })) UI.error(formatRunError(result.error))</span></span>
<span class="source-line"><span class="source-line-number">786</span><span class="source-line-text">              process.exitCode = 1</span></span>
<span class="source-line"><span class="source-line-number">787</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">788</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">789</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">790</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">791</span><span class="source-line-text">          const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">792</span><span class="source-line-text">          const result = await client.session.prompt({</span></span>
<span class="source-line"><span class="source-line-number">793</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">794</span><span class="source-line-text">            agent,</span></span>
<span class="source-line"><span class="source-line-number">795</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">796</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">797</span><span class="source-line-text">            parts: [...files, { type: &quot;text&quot;, text: message }],</span></span>
<span class="source-line"><span class="source-line-number">798</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">799</span><span class="source-line-text">          if (result.error) {</span></span>
<span class="source-line"><span class="source-line-number">800</span><span class="source-line-text">            if (!emit(&quot;error&quot;, { error: result.error })) UI.error(formatRunError(result.error))</span></span>
<span class="source-line"><span class="source-line-number">801</span><span class="source-line-text">            process.exitCode = 1</span></span>
<span class="source-line"><span class="source-line-number">802</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">803</span><span class="source-line-text">          return</span></span>
<span class="source-line"><span class="source-line-number">804</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">805</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">806</span><span class="source-line-text">        const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">807</span><span class="source-line-text">        const { runInteractiveMode } = await runtimeTask</span></span>
<span class="source-line"><span class="source-line-number">808</span><span class="source-line-text">        try {</span></span>
<span class="source-line"><span class="source-line-number">809</span><span class="source-line-text">          await runInteractiveMode({</span></span>
<span class="source-line"><span class="source-line-number">810</span><span class="source-line-text">            sdk: client,</span></span>
<span class="source-line"><span class="source-line-number">811</span><span class="source-line-text">            directory: cwd,</span></span>
<span class="source-line"><span class="source-line-number">812</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">813</span><span class="source-line-text">            sessionTitle: sess.title,</span></span>
<span class="source-line"><span class="source-line-number">814</span><span class="source-line-text">            resume: Boolean(args.session || args.continue) &amp;&amp; !args.fork,</span></span>
<span class="source-line"><span class="source-line-number">815</span><span class="source-line-text">            replay,</span></span>
<span class="source-line"><span class="source-line-number">816</span><span class="source-line-text">            replayLimit: args[&quot;replay-limit&quot;],</span></span>
<span class="source-line"><span class="source-line-number">817</span><span class="source-line-text">            agent,</span></span>
<span class="source-line"><span class="source-line-number">818</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">819</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">820</span><span class="source-line-text">            files,</span></span>
<span class="source-line"><span class="source-line-number">821</span><span class="source-line-text">            initialInput,</span></span>
<span class="source-line"><span class="source-line-number">822</span><span class="source-line-text">            createSession: createFreshSession,</span></span>
<span class="source-line"><span class="source-line-number">823</span><span class="source-line-text">            thinking,</span></span>
<span class="source-line"><span class="source-line-number">824</span><span class="source-line-text">            demo: args.demo,</span></span>
<span class="source-line"><span class="source-line-number">825</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">826</span><span class="source-line-text">        } catch (error) {</span></span>
<span class="source-line"><span class="source-line-number">827</span><span class="source-line-text">          dieInteractive(error)</span></span>
<span class="source-line"><span class="source-line-number">828</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">829</span><span class="source-line-text">        return</span></span>
<span class="source-line"><span class="source-line-number">830</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">831</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">832</span><span class="source-line-text">      if (args.interactive &amp;&amp; !args.attach &amp;&amp; !args.session &amp;&amp; !args.continue) {</span></span>
<span class="source-line"><span class="source-line-number">833</span><span class="source-line-text">        const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">834</span><span class="source-line-text">        const { runInteractiveLocalMode } = await runtimeTask</span></span>
<span class="source-line"><span class="source-line-number">835</span><span class="source-line-text">        const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">836</span><span class="source-line-text">          const { Server } = await import(&quot;@/server/server&quot;)</span></span>
<span class="source-line"><span class="source-line-number">837</span><span class="source-line-text">          const request = new Request(input, init)</span></span>
<span class="source-line"><span class="source-line-number">838</span><span class="source-line-text">          return Server.Default().app.fetch(request)</span></span>
<span class="source-line"><span class="source-line-number">839</span><span class="source-line-text">        }) as typeof globalThis.fetch</span></span>
<span class="source-line"><span class="source-line-number">840</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">841</span><span class="source-line-text">        try {</span></span>
<span class="source-line"><span class="source-line-number">842</span><span class="source-line-text">          return await runInteractiveLocalMode({</span></span>
<span class="source-line"><span class="source-line-number">843</span><span class="source-line-text">            directory: directory ?? root,</span></span>
<span class="source-line"><span class="source-line-number">844</span><span class="source-line-text">            fetch: fetchFn,</span></span>
<span class="source-line"><span class="source-line-number">845</span><span class="source-line-text">            resolveAgent: localAgent,</span></span>
<span class="source-line"><span class="source-line-number">846</span><span class="source-line-text">            session,</span></span>
<span class="source-line"><span class="source-line-number">847</span><span class="source-line-text">            share,</span></span>
<span class="source-line"><span class="source-line-number">848</span><span class="source-line-text">            createSession: createFreshSession,</span></span>
<span class="source-line"><span class="source-line-number">849</span><span class="source-line-text">            agent: args.agent,</span></span>
<span class="source-line"><span class="source-line-number">850</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">851</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">852</span><span class="source-line-text">            replay,</span></span>
<span class="source-line"><span class="source-line-number">853</span><span class="source-line-text">            replayLimit: args[&quot;replay-limit&quot;],</span></span>
<span class="source-line"><span class="source-line-number">854</span><span class="source-line-text">            files,</span></span>
<span class="source-line"><span class="source-line-number">855</span><span class="source-line-text">            initialInput,</span></span>
<span class="source-line"><span class="source-line-number">856</span><span class="source-line-text">            thinking,</span></span>
<span class="source-line"><span class="source-line-number">857</span><span class="source-line-text">            demo: args.demo,</span></span>
<span class="source-line"><span class="source-line-number">858</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">859</span><span class="source-line-text">        } catch (error) {</span></span>
<span class="source-line"><span class="source-line-number">860</span><span class="source-line-text">          dieInteractive(error)</span></span>
<span class="source-line"><span class="source-line-number">861</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">862</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">863</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">864</span><span class="source-line-text">      if (args.attach) {</span></span>
<span class="source-line"><span class="source-line-number">865</span><span class="source-line-text">        const sdk = attachSDK(directory)</span></span>
<span class="source-line"><span class="source-line-number">866</span><span class="source-line-text">        return await execute(sdk)</span></span>
<span class="source-line"><span class="source-line-number">867</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">868</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">869</span><span class="source-line-text">      const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">870</span><span class="source-line-text">        const { Server } = await import(&quot;@/server/server&quot;)</span></span>
<span class="source-line"><span class="source-line-number">871</span><span class="source-line-text">        const request = new Request(input, init)</span></span>
<span class="source-line"><span class="source-line-number">872</span><span class="source-line-text">        return Server.Default().app.fetch(request)</span></span>
<span class="source-line"><span class="source-line-number">873</span><span class="source-line-text">      }) as typeof globalThis.fetch</span></span>
<span class="source-line"><span class="source-line-number">874</span><span class="source-line-text">      const sdk = createOpencodeClient({</span></span>
<span class="source-line"><span class="source-line-number">875</span><span class="source-line-text">        baseUrl: &quot;http://opencode.internal&quot;,</span></span>
<span class="source-line"><span class="source-line-number">876</span><span class="source-line-text">        fetch: fetchFn,</span></span>
<span class="source-line"><span class="source-line-number">877</span><span class="source-line-text">        directory,</span></span>
<span class="source-line"><span class="source-line-number">878</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">879</span><span class="source-line-text">      await execute(sdk)</span></span></code></pre>
</details>
2. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run/runtime.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run/runtime.ts:1-15</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1</span><span class="source-line-text">// Top-level orchestrator for `run --interactive`.</span></span>
<span class="source-line"><span class="source-line-number">2</span><span class="source-line-text">//</span></span>
<span class="source-line"><span class="source-line-number">3</span><span class="source-line-text">// Wires the boot sequence, lifecycle (renderer + footer), stream transport,</span></span>
<span class="source-line"><span class="source-line-number">4</span><span class="source-line-text">// and prompt queue together into a single session loop. Two entry points:</span></span>
<span class="source-line"><span class="source-line-number">5</span><span class="source-line-text">//</span></span>
<span class="source-line"><span class="source-line-number">6</span><span class="source-line-text">//   runInteractiveMode     -- used when an SDK client already exists (attach mode)</span></span>
<span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">//   runInteractiveLocalMode -- used for local in-process mode (no server)</span></span>
<span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">//</span></span>
<span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">// Both delegate to runInteractiveRuntime, which:</span></span>
<span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">//   1. resolves keybinds, diff style, model info, and session history,</span></span>
<span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">//   2. creates the split-footer lifecycle (renderer + RunFooter),</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">//   3. starts the stream transport (SDK event subscription), lazily for fresh</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">//      local sessions,</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">//   4. runs the prompt queue until the footer closes.</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">import { createOpencodeClient } from &quot;@opencode-ai/sdk/v2&quot;</span></span></code></pre>
</details>
3. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run/runtime.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run/runtime.ts:238-382</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">      const shell = await createRuntimeLifecycle({</span></span>
<span class="source-line"><span class="source-line-number">239</span><span class="source-line-text">        directory: ctx.directory,</span></span>
<span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">        findFiles: (query) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">          ctx.sdk.find</span></span>
<span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">            .files({ query, directory: ctx.directory })</span></span>
<span class="source-line"><span class="source-line-number">243</span><span class="source-line-text">            .then((x) =&gt; x.data ?? [])</span></span>
<span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">            .catch(() =&gt; []),</span></span>
<span class="source-line"><span class="source-line-number">245</span><span class="source-line-text">        agents: [],</span></span>
<span class="source-line"><span class="source-line-number">246</span><span class="source-line-text">        resources: [],</span></span>
<span class="source-line"><span class="source-line-number">247</span><span class="source-line-text">        sessionID: state.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">        sessionTitle: state.sessionTitle,</span></span>
<span class="source-line"><span class="source-line-number">249</span><span class="source-line-text">        getSessionID: () =&gt; state.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">        first: session.first,</span></span>
<span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">        history: session.history,</span></span>
<span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">        agent: state.agent,</span></span>
<span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">        model: state.model,</span></span>
<span class="source-line"><span class="source-line-number">254</span><span class="source-line-text">        variant: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">255</span><span class="source-line-text">        keybinds,</span></span>
<span class="source-line"><span class="source-line-number">256</span><span class="source-line-text">        diffStyle,</span></span>
<span class="source-line"><span class="source-line-number">257</span><span class="source-line-text">        onPermissionReply: async (next) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">          if (state.demo?.permission(next)) {</span></span>
<span class="source-line"><span class="source-line-number">259</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">261</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">262</span><span class="source-line-text">          log?.write(&quot;send.permission.reply&quot;, next)</span></span>
<span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">          await ctx.sdk.permission.reply(next)</span></span>
<span class="source-line"><span class="source-line-number">264</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">265</span><span class="source-line-text">        onQuestionReply: async (next) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">          if (state.demo?.questionReply(next)) {</span></span>
<span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">269</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">          await ctx.sdk.question.reply(next)</span></span>
<span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">272</span><span class="source-line-text">        onQuestionReject: async (next) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">          if (state.demo?.questionReject(next)) {</span></span>
<span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">276</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">          await ctx.sdk.question.reject(next)</span></span>
<span class="source-line"><span class="source-line-number">278</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">        onCycleVariant: () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text">          if (!state.model || state.variants.length === 0) {</span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">            return {</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">              status: &quot;no variants available&quot;,</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">          state.activeVariant = cycleVariant(state.activeVariant, state.variants)</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">          saveVariant(state.model, state.activeVariant)</span></span>
<span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">          setRunSpanAttributes(span, {</span></span>
<span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">            &quot;opencode.model.variant&quot;: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">292</span><span class="source-line-text">            status: state.activeVariant ? `variant ${state.activeVariant}` : &quot;variant default&quot;,</span></span>
<span class="source-line"><span class="source-line-number">293</span><span class="source-line-text">            modelLabel: formatModelLabel(state.model, state.activeVariant, state.providers),</span></span>
<span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">            variant: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">        onModelSelect: async (model) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">          if (state.model?.providerID === model.providerID &amp;&amp; state.model.modelID === model.modelID) {</span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">          state.model = model</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">          state.activeVariant = undefined</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">          state.variants = variantsFor(state.providers, model)</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">          const switching = resolveSavedVariant(model).then((saved) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">            const current = state.model</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">            if (!current || current.providerID !== model.providerID || current.modelID !== model.modelID) {</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">              return</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">            state.activeVariant = resolveVariant(ctx.variant, undefined, saved, state.variants)</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">          state.switching = switching</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text">          await switching</span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">          if (state.switching === switching) {</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">            state.switching = undefined</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">          const current = state.model</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">          if (!current || current.providerID !== model.providerID || current.modelID !== model.modelID) {</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">          setRunSpanAttributes(span, {</span></span>
<span class="source-line"><span class="source-line-number">325</span><span class="source-line-text">            &quot;opencode.model.provider&quot;: model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">326</span><span class="source-line-text">            &quot;opencode.model.id&quot;: model.modelID,</span></span>
<span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">            &quot;opencode.model.variant&quot;: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">330</span><span class="source-line-text">            modelLabel: formatModelLabel(model, state.activeVariant, state.providers),</span></span>
<span class="source-line"><span class="source-line-number">331</span><span class="source-line-text">            status: `model ${model.modelID}`,</span></span>
<span class="source-line"><span class="source-line-number">332</span><span class="source-line-text">            variant: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">333</span><span class="source-line-text">            variants: state.variants,</span></span>
<span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">        onVariantSelect: async (variant) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text">          if (!state.model || state.variants.length === 0) {</span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">            return {</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text">              status: &quot;no variants available&quot;,</span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">          if (variant &amp;&amp; !state.variants.includes(variant)) {</span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text">            return {</span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">              status: `variant ${variant} unavailable`,</span></span>
<span class="source-line"><span class="source-line-number">346</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">348</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">349</span><span class="source-line-text">          state.activeVariant = variant</span></span>
<span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">          saveVariant(state.model, state.activeVariant)</span></span>
<span class="source-line"><span class="source-line-number">351</span><span class="source-line-text">          setRunSpanAttributes(span, {</span></span>
<span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">            &quot;opencode.model.variant&quot;: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">353</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">355</span><span class="source-line-text">            status: state.activeVariant ? `variant ${state.activeVariant}` : &quot;variant default&quot;,</span></span>
<span class="source-line"><span class="source-line-number">356</span><span class="source-line-text">            modelLabel: formatModelLabel(state.model, state.activeVariant, state.providers),</span></span>
<span class="source-line"><span class="source-line-number">357</span><span class="source-line-text">            variant: state.activeVariant,</span></span>
<span class="source-line"><span class="source-line-number">358</span><span class="source-line-text">            variants: state.variants,</span></span>
<span class="source-line"><span class="source-line-number">359</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">360</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">361</span><span class="source-line-text">        onInterrupt: () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">362</span><span class="source-line-text">          if (!hasSession(input, state) || state.aborting) {</span></span>
<span class="source-line"><span class="source-line-number">363</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">364</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">365</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">366</span><span class="source-line-text">          state.aborting = true</span></span>
<span class="source-line"><span class="source-line-number">367</span><span class="source-line-text">          void ctx.sdk.session</span></span>
<span class="source-line"><span class="source-line-number">368</span><span class="source-line-text">            .abort({</span></span>
<span class="source-line"><span class="source-line-number">369</span><span class="source-line-text">              sessionID: state.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">370</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">371</span><span class="source-line-text">            .catch(() =&gt; {})</span></span>
<span class="source-line"><span class="source-line-number">372</span><span class="source-line-text">            .finally(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">373</span><span class="source-line-text">              state.aborting = false</span></span>
<span class="source-line"><span class="source-line-number">374</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">375</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">376</span><span class="source-line-text">        onSubagentSelect: (sessionID) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">377</span><span class="source-line-text">          state.selectSubagent?.(sessionID)</span></span>
<span class="source-line"><span class="source-line-number">378</span><span class="source-line-text">          log?.write(&quot;subagent.select&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">379</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">380</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">381</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">382</span><span class="source-line-text">      })</span></span></code></pre>
</details>
4. `packages/opencode/src/cli/cmd/tui/context/sdk.tsx`
5. `packages/opencode/src/cli/cmd/tui/context/sync-v2.tsx`
6. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/app/src/app.tsx</span>
    <span class="source-ref-path"><code>packages/app/src/app.tsx:295-329</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">export function AppInterface(props: {</span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text">  children?: JSX.Element</span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">  defaultServer: ServerConnection.Key</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">  servers?: Array&lt;ServerConnection.Any&gt;</span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">  router?: Component&lt;BaseRouterProps&gt;</span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">  disableHealthCheck?: boolean</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">}) {</span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">  return (</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">    &lt;ServerProvider</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">      defaultServer={props.defaultServer}</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">      disableHealthCheck={props.disableHealthCheck}</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">      servers={props.servers}</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">    &gt;</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">      &lt;ConnectionGate disableHealthCheck={props.disableHealthCheck}&gt;</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text">        &lt;ServerKey&gt;</span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text">          &lt;QueryProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">            &lt;GlobalSDKProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">              &lt;GlobalSyncProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">                &lt;Dynamic</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text">                  component={props.router ?? Router}</span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">                  root={(routerProps) =&gt; &lt;RouterRoot appChildren={props.children}&gt;{routerProps.children}&lt;/RouterRoot&gt;}</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">                &gt;</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">                  &lt;Route path=&quot;/&quot; component={HomeRoute} /&gt;</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text">                  &lt;Route path=&quot;/:dir&quot; component={DirectoryLayout}&gt;</span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">                    &lt;Route path=&quot;/&quot; component={SessionIndexRoute} /&gt;</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">                    &lt;Route path=&quot;/session/:id?&quot; component={SessionRoute} /&gt;</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">                  &lt;/Route&gt;</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">                &lt;/Dynamic&gt;</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text">              &lt;/GlobalSyncProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">            &lt;/GlobalSDKProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">325</span><span class="source-line-text">          &lt;/QueryProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">326</span><span class="source-line-text">        &lt;/ServerKey&gt;</span></span>
<span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">      &lt;/ConnectionGate&gt;</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">    &lt;/ServerProvider&gt;</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">  )</span></span></code></pre>
</details>
7. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/desktop/src/main/index.ts</span>
    <span class="source-ref-path"><code>packages/desktop/src/main/index.ts:258-345</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">  const port = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">259</span><span class="source-line-text">    const fromEnv = process.env.OPENCODE_PORT</span></span>
<span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">    if (fromEnv) {</span></span>
<span class="source-line"><span class="source-line-number">261</span><span class="source-line-text">      const parsed = Number.parseInt(fromEnv, 10)</span></span>
<span class="source-line"><span class="source-line-number">262</span><span class="source-line-text">      if (!Number.isNaN(parsed)) return parsed</span></span>
<span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">264</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">265</span><span class="source-line-text">    const res = yield* Deferred.make&lt;number, unknown&gt;()</span></span>
<span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">    const server = createServer()</span></span>
<span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">    server.on(&quot;error&quot;, (e) =&gt; Deferred.failSync(res, () =&gt; e))</span></span>
<span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">    server.listen(0, &quot;127.0.0.1&quot;, () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">      const address = server.address()</span></span>
<span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">      if (typeof address !== &quot;object&quot; || !address) {</span></span>
<span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">        server.close()</span></span>
<span class="source-line"><span class="source-line-number">272</span><span class="source-line-text">        Deferred.failSync(res, () =&gt; new Error(&quot;Failed to get port&quot;))</span></span>
<span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">        return</span></span>
<span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">      const port = address.port</span></span>
<span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">      server.close(() =&gt; Effect.runSync(Deferred.succeed(res, port)))</span></span>
<span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">278</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">    return yield* Deferred.await(res)</span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">  const hostname = &quot;127.0.0.1&quot;</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">  const url = `http://${hostname}:${port}`</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">  const password = randomUUID()</span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">  const loadingTask = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">    logger.log(&quot;sidecar connection started&quot;, { url })</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">    initEmitter.on(&quot;sqlite&quot;, (progress: SqliteMigrationProgress) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">      setInitStep({ phase: &quot;sqlite_waiting&quot; })</span></span>
<span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">      if (overlay) sendSqliteMigrationProgress(overlay, progress)</span></span>
<span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">      if (mainWindow) sendSqliteMigrationProgress(mainWindow, progress)</span></span>
<span class="source-line"><span class="source-line-number">292</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">293</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">    ensureLoopbackNoProxy()</span></span>
<span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">    useEnvProxy()</span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">    logger.log(&quot;spawning sidecar&quot;, { url })</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">    const { listener, health } = yield* Effect.promise(() =&gt;</span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">      spawnLocalServer(hostname, port, password, {</span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">        needsMigration,</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">        userDataPath: app.getPath(&quot;userData&quot;),</span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">        onSqliteProgress: (progress) =&gt; initEmitter.emit(&quot;sqlite&quot;, progress),</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">        onStdout: (message) =&gt; logger.log(&quot;sidecar stdout&quot;, { message }),</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">        onStderr: (message) =&gt; logger.warn(&quot;sidecar stderr&quot;, { message }),</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">        onExit: (code) =&gt; logger.warn(&quot;sidecar exited&quot;, { code }),</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">      }),</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">    server = listener</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text">    yield* Deferred.succeed(serverReady, {</span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text">      url,</span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">      username: &quot;opencode&quot;,</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">      password,</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">    yield* Effect.promise(() =&gt; health.wait).pipe(</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">      Effect.timeout(&quot;30 seconds&quot;),</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">      Effect.catch((e) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text">        Effect.sync(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">          logger.error(&quot;sidecar health check failed&quot;, e.toString())</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">      ),</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">    logger.log(&quot;loading task finished&quot;)</span></span>
<span class="source-line"><span class="source-line-number">325</span><span class="source-line-text">  }).pipe(Effect.forkChild)</span></span>
<span class="source-line"><span class="source-line-number">326</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">  if (needsMigration) {</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">    const show = yield* loadingTask.pipe(</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">      Fiber.await,</span></span>
<span class="source-line"><span class="source-line-number">330</span><span class="source-line-text">      Effect.timeout(&quot;1 second&quot;),</span></span>
<span class="source-line"><span class="source-line-number">331</span><span class="source-line-text">      Effect.as(false),</span></span>
<span class="source-line"><span class="source-line-number">332</span><span class="source-line-text">      Effect.catch(() =&gt; Effect.succeed(true)),</span></span>
<span class="source-line"><span class="source-line-number">333</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">    if (show) {</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">      overlay = createLoadingWindow()</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">      yield* Effect.sleep(&quot;1 second&quot;)</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">  yield* Fiber.await(loadingTask)</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">  setInitStep({ phase: &quot;done&quot; })</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">  if (overlay) yield* Deferred.await(loadingComplete)</span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">  mainWindow = createMainWindow()</span></span></code></pre>
</details>
8. `sdks/vscode/src/extension.ts`

## 15. 面试式自测

1. TUI 和 Web app 如何避免重复实现 agent loop？
2. 为什么 UI 需要 event stream，而不是 prompt API 返回最终字符串就够了？
3. Desktop sidecar 为什么要有随机 password 和 health check？
4. VS Code extension 的 `@file#Lx` 最终会被哪个模块解析？
5. 如果 UI 因为 token delta 太频繁卡顿，源码里有哪些批处理/合并思路可以借鉴？
6. 如果你要做 JetBrains 插件，最小可行方案会更像 VS Code extension，还是更像 Web app？为什么？

## 16. 下一步阅读建议

下一章读 “SDK / API / 对外扩展点”。UI 章已经看到所有界面都依赖 SDK/API；下一章会专门看这些 API 是怎样被定义、组合、生成和扩展的。


