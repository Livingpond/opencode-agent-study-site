---
title: "Shell / 命令执行"
description: "理解 shell tool 如何解析命令、识别路径和命令模式、审批并执行进程。"
sidebar:
  label: "07. Shell / 命令执行"
  order: 7
---

<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">已完成</span></div>
  <div><strong>难度</strong>较难</div>
  <div><strong>预计阅读</strong>45 分钟</div>
  <div><strong>源文件</strong><a href="/markdown/07-shell-execution.md"><code>markdown/07-shell-execution.md</code></a></div>
</div>

## Agent 生成档案

- 章节 ID：`07-shell-execution`
- 章节摘要：理解 shell tool 如何解析命令、识别路径和命令模式、审批并执行进程。
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

<li><code>packages/opencode/src/tool/shell.ts</code></li>
<li><code>packages/opencode/src/session/prompt.ts</code></li>
<li><code>packages/opencode/src/session/run-state.ts</code></li>
<li><code>packages/opencode/src/permission/index.ts</code></li>

</ul>


> 对应模块：`study-output/02-opencode-function-outline.md` 的 “2.7 Shell / 命令执行”。  
> 主要源码：`packages/opencode/src/tool/shell.ts`、`packages/opencode/src/session/prompt.ts`、`packages/opencode/src/session/run-state.ts`、`packages/opencode/src/permission/index.ts`。

## 0. 本章学习目标

这一章要解决的问题不是“怎么在 Node 里 spawn 一个进程”，而是 OpenCode 作为 coding agent，如何把“执行命令”变成一个可审计、可取消、可截断、可审批、可回填到消息历史的动作。

学完你应该能复述：

- shell tool 为什么先 parse/collect，再 ask，最后 run。
- shell 命令如何识别外部目录访问和命令权限模式。
- 直接由用户触发的 shell 和模型 tool call 触发的 shell 有什么差异。
- shell 输出如何持续更新 tool metadata，并在过长时写入截断文件。
- 在 mini agent 里，命令执行最少需要哪些安全边界。

## 1. 一句话讲明白

OpenCode 的 Shell 模块把一条命令当成“需要静态扫描 + 权限审批 + 受控进程执行 + 输出流式回写”的 tool action；它不是简单 `child_process.exec`，而是先用 tree-sitter 分析命令会访问哪些路径和命令模式，再通过 `ctx.ask` 审批，最后用 `ChildProcess` 执行并把 stdout/stderr 持续写回 `ToolPart.metadata`。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:266-287</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">const ask = Effect.fn(&quot;ShellTool.ask&quot;)(function* (ctx: Tool.Context, scan: Scan) {</span></span>
<span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">  if (scan.dirs.size &gt; 0) {</span></span>
<span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">    const globs = Array.from(scan.dirs).map((dir) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">      if (process.platform === &quot;win32&quot;) return AppFileSystem.normalizePathPattern(path.join(dir, &quot;*&quot;))</span></span>
<span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">      return path.join(dir, &quot;*&quot;)</span></span>
<span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">272</span><span class="source-line-text">    yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">      permission: &quot;external_directory&quot;,</span></span>
<span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">      patterns: globs,</span></span>
<span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">      always: globs,</span></span>
<span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">      metadata: {},</span></span>
<span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">278</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">279</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text">  if (scan.patterns.size === 0) return</span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">  yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">    permission: ShellID.ToolID,</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">    patterns: Array.from(scan.patterns),</span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text">    always: Array.from(scan.always),</span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">    metadata: {},</span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">})</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:374-410</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">374</span><span class="source-line-text">    const collect = Effect.fn(&quot;ShellTool.collect&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">375</span><span class="source-line-text">      root: Node,</span></span>
<span class="source-line"><span class="source-line-number">376</span><span class="source-line-text">      cwd: string,</span></span>
<span class="source-line"><span class="source-line-number">377</span><span class="source-line-text">      ps: boolean,</span></span>
<span class="source-line"><span class="source-line-number">378</span><span class="source-line-text">      shell: string,</span></span>
<span class="source-line"><span class="source-line-number">379</span><span class="source-line-text">      instance: InstanceContext,</span></span>
<span class="source-line"><span class="source-line-number">380</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">381</span><span class="source-line-text">      const scan: Scan = {</span></span>
<span class="source-line"><span class="source-line-number">382</span><span class="source-line-text">        dirs: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">383</span><span class="source-line-text">        patterns: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">384</span><span class="source-line-text">        always: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">385</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">386</span><span class="source-line-text">      const shellKind = ShellID.toKind(Shell.name(shell))</span></span>
<span class="source-line"><span class="source-line-number">387</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">388</span><span class="source-line-text">      for (const node of commands(root)) {</span></span>
<span class="source-line"><span class="source-line-number">389</span><span class="source-line-text">        const command = parts(node)</span></span>
<span class="source-line"><span class="source-line-number">390</span><span class="source-line-text">        const tokens = command.map((item) =&gt; item.text)</span></span>
<span class="source-line"><span class="source-line-number">391</span><span class="source-line-text">        const cmd = ps || shellKind === &quot;cmd&quot; ? tokens[0]?.toLowerCase() : tokens[0]</span></span>
<span class="source-line"><span class="source-line-number">392</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">393</span><span class="source-line-text">        if (cmd &amp;&amp; (FILES.has(cmd) || (shellKind === &quot;cmd&quot; &amp;&amp; CMD_FILES.has(cmd)))) {</span></span>
<span class="source-line"><span class="source-line-number">394</span><span class="source-line-text">          for (const arg of pathArgs(command, ps, shellKind === &quot;cmd&quot;)) {</span></span>
<span class="source-line"><span class="source-line-number">395</span><span class="source-line-text">            const resolved = yield* argPath(arg, cwd, ps, shell)</span></span>
<span class="source-line"><span class="source-line-number">396</span><span class="source-line-text">            log.info(&quot;resolved path&quot;, { arg, resolved })</span></span>
<span class="source-line"><span class="source-line-number">397</span><span class="source-line-text">            if (!resolved || containsPath(resolved, instance)) continue</span></span>
<span class="source-line"><span class="source-line-number">398</span><span class="source-line-text">            const dir = (yield* fs.isDir(resolved)) ? resolved : path.dirname(resolved)</span></span>
<span class="source-line"><span class="source-line-number">399</span><span class="source-line-text">            scan.dirs.add(dir)</span></span>
<span class="source-line"><span class="source-line-number">400</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">401</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">402</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">403</span><span class="source-line-text">        if (tokens.length &amp;&amp; (!cmd || !CWD.has(cmd))) {</span></span>
<span class="source-line"><span class="source-line-number">404</span><span class="source-line-text">          scan.patterns.add(source(node))</span></span>
<span class="source-line"><span class="source-line-number">405</span><span class="source-line-text">          scan.always.add(BashArity.prefix(tokens).join(&quot; &quot;) + &quot; *&quot;)</span></span>
<span class="source-line"><span class="source-line-number">406</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">407</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">408</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">409</span><span class="source-line-text">      return scan</span></span>
<span class="source-line"><span class="source-line-number">410</span><span class="source-line-text">    })</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:424-596</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">424</span><span class="source-line-text">    const run = Effect.fn(&quot;ShellTool.run&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">425</span><span class="source-line-text">      input: {</span></span>
<span class="source-line"><span class="source-line-number">426</span><span class="source-line-text">        shell: string</span></span>
<span class="source-line"><span class="source-line-number">427</span><span class="source-line-text">        command: string</span></span>
<span class="source-line"><span class="source-line-number">428</span><span class="source-line-text">        cwd: string</span></span>
<span class="source-line"><span class="source-line-number">429</span><span class="source-line-text">        env: NodeJS.ProcessEnv</span></span>
<span class="source-line"><span class="source-line-number">430</span><span class="source-line-text">        timeout: number</span></span>
<span class="source-line"><span class="source-line-number">431</span><span class="source-line-text">        description: string</span></span>
<span class="source-line"><span class="source-line-number">432</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">433</span><span class="source-line-text">      ctx: Tool.Context,</span></span>
<span class="source-line"><span class="source-line-number">434</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">435</span><span class="source-line-text">      const limits = yield* trunc.limits()</span></span>
<span class="source-line"><span class="source-line-number">436</span><span class="source-line-text">      const keep = limits.maxBytes * 2</span></span>
<span class="source-line"><span class="source-line-number">437</span><span class="source-line-text">      let full = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">438</span><span class="source-line-text">      let last = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">439</span><span class="source-line-text">      const list: Chunk[] = []</span></span>
<span class="source-line"><span class="source-line-number">440</span><span class="source-line-text">      let used = 0</span></span>
<span class="source-line"><span class="source-line-number">441</span><span class="source-line-text">      let file = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">442</span><span class="source-line-text">      let sink: ReturnType&lt;typeof createWriteStream&gt; | undefined</span></span>
<span class="source-line"><span class="source-line-number">443</span><span class="source-line-text">      let cut = false</span></span>
<span class="source-line"><span class="source-line-number">444</span><span class="source-line-text">      let expired = false</span></span>
<span class="source-line"><span class="source-line-number">445</span><span class="source-line-text">      let aborted = false</span></span>
<span class="source-line"><span class="source-line-number">446</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">447</span><span class="source-line-text">      const closeSink = Effect.fnUntraced(function* () {</span></span>
<span class="source-line"><span class="source-line-number">448</span><span class="source-line-text">        const stream = sink</span></span>
<span class="source-line"><span class="source-line-number">449</span><span class="source-line-text">        if (!stream) return</span></span>
<span class="source-line"><span class="source-line-number">450</span><span class="source-line-text">        sink = undefined</span></span>
<span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">        if (stream.destroyed || stream.closed) return</span></span>
<span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">        yield* Effect.promise(</span></span>
<span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">          () =&gt;</span></span>
<span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">            new Promise&lt;void&gt;((resolve) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">              let settled = false</span></span>
<span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">              const done = () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">457</span><span class="source-line-text">                if (settled) return</span></span>
<span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">                settled = true</span></span>
<span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">                stream.off(&quot;close&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">                stream.off(&quot;error&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">                stream.off(&quot;finish&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">                resolve()</span></span>
<span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">              stream.once(&quot;close&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">              stream.once(&quot;error&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">              stream.once(&quot;finish&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">467</span><span class="source-line-text">              stream.end(done)</span></span>
<span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">            }),</span></span>
<span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">        ).pipe(Effect.catch(() =&gt; Effect.void))</span></span>
<span class="source-line"><span class="source-line-number">470</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">471</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">      yield* ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">474</span><span class="source-line-text">          output: &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">478</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">479</span><span class="source-line-text">      const code: number | null = yield* Effect.scoped(</span></span>
<span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">        Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">481</span><span class="source-line-text">          yield* Effect.addFinalizer(closeSink)</span></span>
<span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">          const handle = yield* spawner.spawn(cmd(input.shell, input.command, input.cwd, input.env))</span></span>
<span class="source-line"><span class="source-line-number">483</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">          yield* Effect.forkScoped(</span></span>
<span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">            Stream.runForEach(Stream.decodeText(handle.all), (chunk) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">              const size = Buffer.byteLength(chunk, &quot;utf-8&quot;)</span></span>
<span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">              list.push({ text: chunk, size })</span></span>
<span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">              used += size</span></span>
<span class="source-line"><span class="source-line-number">489</span><span class="source-line-text">              while (used &gt; keep &amp;&amp; list.length &gt; 1) {</span></span>
<span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">                const item = list.shift()</span></span>
<span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">                if (!item) break</span></span>
<span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">                used -= item.size</span></span>
<span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">                cut = true</span></span>
<span class="source-line"><span class="source-line-number">494</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">495</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">496</span><span class="source-line-text">              last = preview(last + chunk)</span></span>
<span class="source-line"><span class="source-line-number">497</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">498</span><span class="source-line-text">              if (file) {</span></span>
<span class="source-line"><span class="source-line-number">499</span><span class="source-line-text">                sink?.write(chunk)</span></span>
<span class="source-line"><span class="source-line-number">500</span><span class="source-line-text">              } else {</span></span>
<span class="source-line"><span class="source-line-number">501</span><span class="source-line-text">                full += chunk</span></span>
<span class="source-line"><span class="source-line-number">502</span><span class="source-line-text">                if (Buffer.byteLength(full, &quot;utf-8&quot;) &gt; limits.maxBytes) {</span></span>
<span class="source-line"><span class="source-line-number">503</span><span class="source-line-text">                  return trunc.write(full).pipe(</span></span>
<span class="source-line"><span class="source-line-number">504</span><span class="source-line-text">                    Effect.andThen((next) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">505</span><span class="source-line-text">                      Effect.sync(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">506</span><span class="source-line-text">                        file = next</span></span>
<span class="source-line"><span class="source-line-number">507</span><span class="source-line-text">                        cut = true</span></span>
<span class="source-line"><span class="source-line-number">508</span><span class="source-line-text">                        sink = createWriteStream(next, { flags: &quot;a&quot; })</span></span>
<span class="source-line"><span class="source-line-number">509</span><span class="source-line-text">                        full = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">510</span><span class="source-line-text">                      }),</span></span>
<span class="source-line"><span class="source-line-number">511</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">512</span><span class="source-line-text">                    Effect.andThen(</span></span>
<span class="source-line"><span class="source-line-number">513</span><span class="source-line-text">                      ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">514</span><span class="source-line-text">                        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">515</span><span class="source-line-text">                          output: last,</span></span>
<span class="source-line"><span class="source-line-number">516</span><span class="source-line-text">                          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">517</span><span class="source-line-text">                        },</span></span>
<span class="source-line"><span class="source-line-number">518</span><span class="source-line-text">                      }),</span></span>
<span class="source-line"><span class="source-line-number">519</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">520</span><span class="source-line-text">                  )</span></span>
<span class="source-line"><span class="source-line-number">521</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">522</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">523</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">524</span><span class="source-line-text">              return ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">525</span><span class="source-line-text">                metadata: {</span></span>
<span class="source-line"><span class="source-line-number">526</span><span class="source-line-text">                  output: last,</span></span>
<span class="source-line"><span class="source-line-number">527</span><span class="source-line-text">                  description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">528</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">529</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">530</span><span class="source-line-text">            }),</span></span>
<span class="source-line"><span class="source-line-number">531</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">532</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">533</span><span class="source-line-text">          const abort = Effect.callback&lt;void&gt;((resume) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">534</span><span class="source-line-text">            if (ctx.abort.aborted) return resume(Effect.void)</span></span>
<span class="source-line"><span class="source-line-number">535</span><span class="source-line-text">            const handler = () =&gt; resume(Effect.void)</span></span>
<span class="source-line"><span class="source-line-number">536</span><span class="source-line-text">            ctx.abort.addEventListener(&quot;abort&quot;, handler, { once: true })</span></span>
<span class="source-line"><span class="source-line-number">537</span><span class="source-line-text">            return Effect.sync(() =&gt; ctx.abort.removeEventListener(&quot;abort&quot;, handler))</span></span>
<span class="source-line"><span class="source-line-number">538</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">539</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">540</span><span class="source-line-text">          const timeout = Effect.sleep(`${input.timeout + 100} millis`)</span></span>
<span class="source-line"><span class="source-line-number">541</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">542</span><span class="source-line-text">          const exit = yield* Effect.raceAll([</span></span>
<span class="source-line"><span class="source-line-number">543</span><span class="source-line-text">            handle.exitCode.pipe(Effect.map((code) =&gt; ({ kind: &quot;exit&quot; as const, code }))),</span></span>
<span class="source-line"><span class="source-line-number">544</span><span class="source-line-text">            abort.pipe(Effect.map(() =&gt; ({ kind: &quot;abort&quot; as const, code: null }))),</span></span>
<span class="source-line"><span class="source-line-number">545</span><span class="source-line-text">            timeout.pipe(Effect.map(() =&gt; ({ kind: &quot;timeout&quot; as const, code: null }))),</span></span>
<span class="source-line"><span class="source-line-number">546</span><span class="source-line-text">          ])</span></span>
<span class="source-line"><span class="source-line-number">547</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">548</span><span class="source-line-text">          if (exit.kind === &quot;abort&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">549</span><span class="source-line-text">            aborted = true</span></span>
<span class="source-line"><span class="source-line-number">550</span><span class="source-line-text">            yield* handle.kill({ forceKillAfter: &quot;3 seconds&quot; }).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">551</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">552</span><span class="source-line-text">          if (exit.kind === &quot;timeout&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">553</span><span class="source-line-text">            expired = true</span></span>
<span class="source-line"><span class="source-line-number">554</span><span class="source-line-text">            yield* handle.kill({ forceKillAfter: &quot;3 seconds&quot; }).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">555</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">556</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">557</span><span class="source-line-text">          return exit.kind === &quot;exit&quot; ? exit.code : null</span></span>
<span class="source-line"><span class="source-line-number">558</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">559</span><span class="source-line-text">      ).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">560</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">561</span><span class="source-line-text">      const meta: string[] = []</span></span>
<span class="source-line"><span class="source-line-number">562</span><span class="source-line-text">      if (expired) {</span></span>
<span class="source-line"><span class="source-line-number">563</span><span class="source-line-text">        meta.push(</span></span>
<span class="source-line"><span class="source-line-number">564</span><span class="source-line-text">          `shell tool terminated command after exceeding timeout ${input.timeout} ms. If this command is expected to take longer and is not waiting for interactive input, retry with a larger timeout value in milliseconds.`,</span></span>
<span class="source-line"><span class="source-line-number">565</span><span class="source-line-text">        )</span></span>
<span class="source-line"><span class="source-line-number">566</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">567</span><span class="source-line-text">      if (aborted) meta.push(&quot;User aborted the command&quot;)</span></span>
<span class="source-line"><span class="source-line-number">568</span><span class="source-line-text">      const raw = list.map((item) =&gt; item.text).join(&quot;&quot;)</span></span>
<span class="source-line"><span class="source-line-number">569</span><span class="source-line-text">      const end = tail(raw, limits.maxLines, limits.maxBytes)</span></span>
<span class="source-line"><span class="source-line-number">570</span><span class="source-line-text">      if (end.cut) cut = true</span></span>
<span class="source-line"><span class="source-line-number">571</span><span class="source-line-text">      if (!file &amp;&amp; end.cut) {</span></span>
<span class="source-line"><span class="source-line-number">572</span><span class="source-line-text">        file = yield* trunc.write(raw)</span></span>
<span class="source-line"><span class="source-line-number">573</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">574</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">575</span><span class="source-line-text">      let output = end.text</span></span>
<span class="source-line"><span class="source-line-number">576</span><span class="source-line-text">      if (!output) output = &quot;(no output)&quot;</span></span>
<span class="source-line"><span class="source-line-number">577</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">578</span><span class="source-line-text">      if (cut &amp;&amp; file) {</span></span>
<span class="source-line"><span class="source-line-number">579</span><span class="source-line-text">        output = `...output truncated...\n\nFull output saved to: ${file}\n\n` + output</span></span>
<span class="source-line"><span class="source-line-number">580</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">581</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">582</span><span class="source-line-text">      if (meta.length &gt; 0) {</span></span>
<span class="source-line"><span class="source-line-number">583</span><span class="source-line-text">        output += &quot;\n\n&lt;shell_metadata&gt;\n&quot; + meta.join(&quot;\n&quot;) + &quot;\n&lt;/shell_metadata&gt;&quot;</span></span>
<span class="source-line"><span class="source-line-number">584</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">585</span><span class="source-line-text">      return {</span></span>
<span class="source-line"><span class="source-line-number">586</span><span class="source-line-text">        title: input.description,</span></span>
<span class="source-line"><span class="source-line-number">587</span><span class="source-line-text">        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">588</span><span class="source-line-text">          output: last || preview(output),</span></span>
<span class="source-line"><span class="source-line-number">589</span><span class="source-line-text">          exit: code,</span></span>
<span class="source-line"><span class="source-line-number">590</span><span class="source-line-text">          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">591</span><span class="source-line-text">          truncated: cut,</span></span>
<span class="source-line"><span class="source-line-number">592</span><span class="source-line-text">          ...(cut &amp;&amp; file ? { outputPath: file } : {}),</span></span>
<span class="source-line"><span class="source-line-number">593</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">594</span><span class="source-line-text">        output,</span></span>
<span class="source-line"><span class="source-line-number">595</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">596</span><span class="source-line-text">    })</span></span></code></pre>
</details>。

## 2. 它在 OpenCode agent 中的位置

当模型在 agent loop 里调用 shell tool 时，链路大致是：

```text
runLoop
  -> SessionTools.resolve
  -> ToolRegistry.tools
  -> ShellTool.execute
  -> parse command
  -> collect command patterns / external dirs
  -> ctx.ask(...)
  -> ChildProcessSpawner.spawn(...)
  -> stream output into tool metadata
  -> return tool result
  -> processor writes tool result
  -> next LLM round
```

关键路径：

- <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:334-645</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">export const ShellTool = Tool.define(</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">  ShellID.ToolID,</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">  Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text">    const config = yield* Config.Service</span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">    const spawner = yield* ChildProcessSpawner</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text">    const fs = yield* AppFileSystem.Service</span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">    const trunc = yield* Truncate.Service</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">    const plugin = yield* Plugin.Service</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text">    const flags = yield* RuntimeFlags.Service</span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">    const defaultTimeout = flags.bashDefaultTimeoutMs ?? 2 * 60 * 1000</span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">    const cygpath = Effect.fn(&quot;ShellTool.cygpath&quot;)(function* (shell: string, text: string) {</span></span>
<span class="source-line"><span class="source-line-number">346</span><span class="source-line-text">      const lines = yield* spawner</span></span>
<span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">        .lines(ChildProcess.make(shell, [&quot;-lc&quot;, 'cygpath -w -- &quot;$1&quot;', &quot;_&quot;, text]))</span></span>
<span class="source-line"><span class="source-line-number">348</span><span class="source-line-text">        .pipe(Effect.catch(() =&gt; Effect.succeed([] as string[])))</span></span>
<span class="source-line"><span class="source-line-number">349</span><span class="source-line-text">      const file = lines[0]?.trim()</span></span>
<span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">      if (!file) return</span></span>
<span class="source-line"><span class="source-line-number">351</span><span class="source-line-text">      return AppFileSystem.normalizePath(file)</span></span>
<span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">353</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">    const resolvePath = Effect.fn(&quot;ShellTool.resolvePath&quot;)(function* (text: string, root: string, shell: string) {</span></span>
<span class="source-line"><span class="source-line-number">355</span><span class="source-line-text">      if (process.platform === &quot;win32&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">356</span><span class="source-line-text">        if (Shell.posix(shell) &amp;&amp; text.startsWith(&quot;/&quot;) &amp;&amp; AppFileSystem.windowsPath(text) === text) {</span></span>
<span class="source-line"><span class="source-line-number">357</span><span class="source-line-text">          const file = yield* cygpath(shell, text)</span></span>
<span class="source-line"><span class="source-line-number">358</span><span class="source-line-text">          if (file) return file</span></span>
<span class="source-line"><span class="source-line-number">359</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">360</span><span class="source-line-text">        return AppFileSystem.normalizePath(path.resolve(root, AppFileSystem.windowsPath(text)))</span></span>
<span class="source-line"><span class="source-line-number">361</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">362</span><span class="source-line-text">      return path.resolve(root, text)</span></span>
<span class="source-line"><span class="source-line-number">363</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">364</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">365</span><span class="source-line-text">    const argPath = Effect.fn(&quot;ShellTool.argPath&quot;)(function* (arg: string, cwd: string, ps: boolean, shell: string) {</span></span>
<span class="source-line"><span class="source-line-number">366</span><span class="source-line-text">      const text = ps ? expand(arg, cwd, shell) : home(unquote(arg))</span></span>
<span class="source-line"><span class="source-line-number">367</span><span class="source-line-text">      const file = text &amp;&amp; prefix(text)</span></span>
<span class="source-line"><span class="source-line-number">368</span><span class="source-line-text">      if (!file || dynamic(file, ps)) return</span></span>
<span class="source-line"><span class="source-line-number">369</span><span class="source-line-text">      const next = ps ? provider(file) : file</span></span>
<span class="source-line"><span class="source-line-number">370</span><span class="source-line-text">      if (!next) return</span></span>
<span class="source-line"><span class="source-line-number">371</span><span class="source-line-text">      return yield* resolvePath(next, cwd, shell)</span></span>
<span class="source-line"><span class="source-line-number">372</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">373</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">374</span><span class="source-line-text">    const collect = Effect.fn(&quot;ShellTool.collect&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">375</span><span class="source-line-text">      root: Node,</span></span>
<span class="source-line"><span class="source-line-number">376</span><span class="source-line-text">      cwd: string,</span></span>
<span class="source-line"><span class="source-line-number">377</span><span class="source-line-text">      ps: boolean,</span></span>
<span class="source-line"><span class="source-line-number">378</span><span class="source-line-text">      shell: string,</span></span>
<span class="source-line"><span class="source-line-number">379</span><span class="source-line-text">      instance: InstanceContext,</span></span>
<span class="source-line"><span class="source-line-number">380</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">381</span><span class="source-line-text">      const scan: Scan = {</span></span>
<span class="source-line"><span class="source-line-number">382</span><span class="source-line-text">        dirs: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">383</span><span class="source-line-text">        patterns: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">384</span><span class="source-line-text">        always: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">385</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">386</span><span class="source-line-text">      const shellKind = ShellID.toKind(Shell.name(shell))</span></span>
<span class="source-line"><span class="source-line-number">387</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">388</span><span class="source-line-text">      for (const node of commands(root)) {</span></span>
<span class="source-line"><span class="source-line-number">389</span><span class="source-line-text">        const command = parts(node)</span></span>
<span class="source-line"><span class="source-line-number">390</span><span class="source-line-text">        const tokens = command.map((item) =&gt; item.text)</span></span>
<span class="source-line"><span class="source-line-number">391</span><span class="source-line-text">        const cmd = ps || shellKind === &quot;cmd&quot; ? tokens[0]?.toLowerCase() : tokens[0]</span></span>
<span class="source-line"><span class="source-line-number">392</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">393</span><span class="source-line-text">        if (cmd &amp;&amp; (FILES.has(cmd) || (shellKind === &quot;cmd&quot; &amp;&amp; CMD_FILES.has(cmd)))) {</span></span>
<span class="source-line"><span class="source-line-number">394</span><span class="source-line-text">          for (const arg of pathArgs(command, ps, shellKind === &quot;cmd&quot;)) {</span></span>
<span class="source-line"><span class="source-line-number">395</span><span class="source-line-text">            const resolved = yield* argPath(arg, cwd, ps, shell)</span></span>
<span class="source-line"><span class="source-line-number">396</span><span class="source-line-text">            log.info(&quot;resolved path&quot;, { arg, resolved })</span></span>
<span class="source-line"><span class="source-line-number">397</span><span class="source-line-text">            if (!resolved || containsPath(resolved, instance)) continue</span></span>
<span class="source-line"><span class="source-line-number">398</span><span class="source-line-text">            const dir = (yield* fs.isDir(resolved)) ? resolved : path.dirname(resolved)</span></span>
<span class="source-line"><span class="source-line-number">399</span><span class="source-line-text">            scan.dirs.add(dir)</span></span>
<span class="source-line"><span class="source-line-number">400</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">401</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">402</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">403</span><span class="source-line-text">        if (tokens.length &amp;&amp; (!cmd || !CWD.has(cmd))) {</span></span>
<span class="source-line"><span class="source-line-number">404</span><span class="source-line-text">          scan.patterns.add(source(node))</span></span>
<span class="source-line"><span class="source-line-number">405</span><span class="source-line-text">          scan.always.add(BashArity.prefix(tokens).join(&quot; &quot;) + &quot; *&quot;)</span></span>
<span class="source-line"><span class="source-line-number">406</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">407</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">408</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">409</span><span class="source-line-text">      return scan</span></span>
<span class="source-line"><span class="source-line-number">410</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">411</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">412</span><span class="source-line-text">    const shellEnv = Effect.fn(&quot;ShellTool.shellEnv&quot;)(function* (ctx: Tool.Context, cwd: string) {</span></span>
<span class="source-line"><span class="source-line-number">413</span><span class="source-line-text">      const extra = yield* plugin.trigger(</span></span>
<span class="source-line"><span class="source-line-number">414</span><span class="source-line-text">        &quot;shell.env&quot;,</span></span>
<span class="source-line"><span class="source-line-number">415</span><span class="source-line-text">        { cwd, sessionID: ctx.sessionID, callID: ctx.callID },</span></span>
<span class="source-line"><span class="source-line-number">416</span><span class="source-line-text">        { env: {} },</span></span>
<span class="source-line"><span class="source-line-number">417</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">418</span><span class="source-line-text">      return {</span></span>
<span class="source-line"><span class="source-line-number">419</span><span class="source-line-text">        ...process.env,</span></span>
<span class="source-line"><span class="source-line-number">420</span><span class="source-line-text">        ...extra.env,</span></span>
<span class="source-line"><span class="source-line-number">421</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">422</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">423</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">424</span><span class="source-line-text">    const run = Effect.fn(&quot;ShellTool.run&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">425</span><span class="source-line-text">      input: {</span></span>
<span class="source-line"><span class="source-line-number">426</span><span class="source-line-text">        shell: string</span></span>
<span class="source-line"><span class="source-line-number">427</span><span class="source-line-text">        command: string</span></span>
<span class="source-line"><span class="source-line-number">428</span><span class="source-line-text">        cwd: string</span></span>
<span class="source-line"><span class="source-line-number">429</span><span class="source-line-text">        env: NodeJS.ProcessEnv</span></span>
<span class="source-line"><span class="source-line-number">430</span><span class="source-line-text">        timeout: number</span></span>
<span class="source-line"><span class="source-line-number">431</span><span class="source-line-text">        description: string</span></span>
<span class="source-line"><span class="source-line-number">432</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">433</span><span class="source-line-text">      ctx: Tool.Context,</span></span>
<span class="source-line"><span class="source-line-number">434</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">435</span><span class="source-line-text">      const limits = yield* trunc.limits()</span></span>
<span class="source-line"><span class="source-line-number">436</span><span class="source-line-text">      const keep = limits.maxBytes * 2</span></span>
<span class="source-line"><span class="source-line-number">437</span><span class="source-line-text">      let full = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">438</span><span class="source-line-text">      let last = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">439</span><span class="source-line-text">      const list: Chunk[] = []</span></span>
<span class="source-line"><span class="source-line-number">440</span><span class="source-line-text">      let used = 0</span></span>
<span class="source-line"><span class="source-line-number">441</span><span class="source-line-text">      let file = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">442</span><span class="source-line-text">      let sink: ReturnType&lt;typeof createWriteStream&gt; | undefined</span></span>
<span class="source-line"><span class="source-line-number">443</span><span class="source-line-text">      let cut = false</span></span>
<span class="source-line"><span class="source-line-number">444</span><span class="source-line-text">      let expired = false</span></span>
<span class="source-line"><span class="source-line-number">445</span><span class="source-line-text">      let aborted = false</span></span>
<span class="source-line"><span class="source-line-number">446</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">447</span><span class="source-line-text">      const closeSink = Effect.fnUntraced(function* () {</span></span>
<span class="source-line"><span class="source-line-number">448</span><span class="source-line-text">        const stream = sink</span></span>
<span class="source-line"><span class="source-line-number">449</span><span class="source-line-text">        if (!stream) return</span></span>
<span class="source-line"><span class="source-line-number">450</span><span class="source-line-text">        sink = undefined</span></span>
<span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">        if (stream.destroyed || stream.closed) return</span></span>
<span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">        yield* Effect.promise(</span></span>
<span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">          () =&gt;</span></span>
<span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">            new Promise&lt;void&gt;((resolve) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">              let settled = false</span></span>
<span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">              const done = () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">457</span><span class="source-line-text">                if (settled) return</span></span>
<span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">                settled = true</span></span>
<span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">                stream.off(&quot;close&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">                stream.off(&quot;error&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">                stream.off(&quot;finish&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">                resolve()</span></span>
<span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">              stream.once(&quot;close&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">              stream.once(&quot;error&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">              stream.once(&quot;finish&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">467</span><span class="source-line-text">              stream.end(done)</span></span>
<span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">            }),</span></span>
<span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">        ).pipe(Effect.catch(() =&gt; Effect.void))</span></span>
<span class="source-line"><span class="source-line-number">470</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">471</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">      yield* ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">474</span><span class="source-line-text">          output: &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">478</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">479</span><span class="source-line-text">      const code: number | null = yield* Effect.scoped(</span></span>
<span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">        Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">481</span><span class="source-line-text">          yield* Effect.addFinalizer(closeSink)</span></span>
<span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">          const handle = yield* spawner.spawn(cmd(input.shell, input.command, input.cwd, input.env))</span></span>
<span class="source-line"><span class="source-line-number">483</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">          yield* Effect.forkScoped(</span></span>
<span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">            Stream.runForEach(Stream.decodeText(handle.all), (chunk) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">              const size = Buffer.byteLength(chunk, &quot;utf-8&quot;)</span></span>
<span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">              list.push({ text: chunk, size })</span></span>
<span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">              used += size</span></span>
<span class="source-line"><span class="source-line-number">489</span><span class="source-line-text">              while (used &gt; keep &amp;&amp; list.length &gt; 1) {</span></span>
<span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">                const item = list.shift()</span></span>
<span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">                if (!item) break</span></span>
<span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">                used -= item.size</span></span>
<span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">                cut = true</span></span>
<span class="source-line"><span class="source-line-number">494</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">495</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">496</span><span class="source-line-text">              last = preview(last + chunk)</span></span>
<span class="source-line"><span class="source-line-number">497</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">498</span><span class="source-line-text">              if (file) {</span></span>
<span class="source-line"><span class="source-line-number">499</span><span class="source-line-text">                sink?.write(chunk)</span></span>
<span class="source-line"><span class="source-line-number">500</span><span class="source-line-text">              } else {</span></span>
<span class="source-line"><span class="source-line-number">501</span><span class="source-line-text">                full += chunk</span></span>
<span class="source-line"><span class="source-line-number">502</span><span class="source-line-text">                if (Buffer.byteLength(full, &quot;utf-8&quot;) &gt; limits.maxBytes) {</span></span>
<span class="source-line"><span class="source-line-number">503</span><span class="source-line-text">                  return trunc.write(full).pipe(</span></span>
<span class="source-line"><span class="source-line-number">504</span><span class="source-line-text">                    Effect.andThen((next) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">505</span><span class="source-line-text">                      Effect.sync(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">506</span><span class="source-line-text">                        file = next</span></span>
<span class="source-line"><span class="source-line-number">507</span><span class="source-line-text">                        cut = true</span></span>
<span class="source-line"><span class="source-line-number">508</span><span class="source-line-text">                        sink = createWriteStream(next, { flags: &quot;a&quot; })</span></span>
<span class="source-line"><span class="source-line-number">509</span><span class="source-line-text">                        full = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">510</span><span class="source-line-text">                      }),</span></span>
<span class="source-line"><span class="source-line-number">511</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">512</span><span class="source-line-text">                    Effect.andThen(</span></span>
<span class="source-line"><span class="source-line-number">513</span><span class="source-line-text">                      ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">514</span><span class="source-line-text">                        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">515</span><span class="source-line-text">                          output: last,</span></span>
<span class="source-line"><span class="source-line-number">516</span><span class="source-line-text">                          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">517</span><span class="source-line-text">                        },</span></span>
<span class="source-line"><span class="source-line-number">518</span><span class="source-line-text">                      }),</span></span>
<span class="source-line"><span class="source-line-number">519</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">520</span><span class="source-line-text">                  )</span></span>
<span class="source-line"><span class="source-line-number">521</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">522</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">523</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">524</span><span class="source-line-text">              return ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">525</span><span class="source-line-text">                metadata: {</span></span>
<span class="source-line"><span class="source-line-number">526</span><span class="source-line-text">                  output: last,</span></span>
<span class="source-line"><span class="source-line-number">527</span><span class="source-line-text">                  description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">528</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">529</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">530</span><span class="source-line-text">            }),</span></span>
<span class="source-line"><span class="source-line-number">531</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">532</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">533</span><span class="source-line-text">          const abort = Effect.callback&lt;void&gt;((resume) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">534</span><span class="source-line-text">            if (ctx.abort.aborted) return resume(Effect.void)</span></span>
<span class="source-line"><span class="source-line-number">535</span><span class="source-line-text">            const handler = () =&gt; resume(Effect.void)</span></span>
<span class="source-line"><span class="source-line-number">536</span><span class="source-line-text">            ctx.abort.addEventListener(&quot;abort&quot;, handler, { once: true })</span></span>
<span class="source-line"><span class="source-line-number">537</span><span class="source-line-text">            return Effect.sync(() =&gt; ctx.abort.removeEventListener(&quot;abort&quot;, handler))</span></span>
<span class="source-line"><span class="source-line-number">538</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">539</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">540</span><span class="source-line-text">          const timeout = Effect.sleep(`${input.timeout + 100} millis`)</span></span>
<span class="source-line"><span class="source-line-number">541</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">542</span><span class="source-line-text">          const exit = yield* Effect.raceAll([</span></span>
<span class="source-line"><span class="source-line-number">543</span><span class="source-line-text">            handle.exitCode.pipe(Effect.map((code) =&gt; ({ kind: &quot;exit&quot; as const, code }))),</span></span>
<span class="source-line"><span class="source-line-number">544</span><span class="source-line-text">            abort.pipe(Effect.map(() =&gt; ({ kind: &quot;abort&quot; as const, code: null }))),</span></span>
<span class="source-line"><span class="source-line-number">545</span><span class="source-line-text">            timeout.pipe(Effect.map(() =&gt; ({ kind: &quot;timeout&quot; as const, code: null }))),</span></span>
<span class="source-line"><span class="source-line-number">546</span><span class="source-line-text">          ])</span></span>
<span class="source-line"><span class="source-line-number">547</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">548</span><span class="source-line-text">          if (exit.kind === &quot;abort&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">549</span><span class="source-line-text">            aborted = true</span></span>
<span class="source-line"><span class="source-line-number">550</span><span class="source-line-text">            yield* handle.kill({ forceKillAfter: &quot;3 seconds&quot; }).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">551</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">552</span><span class="source-line-text">          if (exit.kind === &quot;timeout&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">553</span><span class="source-line-text">            expired = true</span></span>
<span class="source-line"><span class="source-line-number">554</span><span class="source-line-text">            yield* handle.kill({ forceKillAfter: &quot;3 seconds&quot; }).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">555</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">556</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">557</span><span class="source-line-text">          return exit.kind === &quot;exit&quot; ? exit.code : null</span></span>
<span class="source-line"><span class="source-line-number">558</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">559</span><span class="source-line-text">      ).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">560</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">561</span><span class="source-line-text">      const meta: string[] = []</span></span>
<span class="source-line"><span class="source-line-number">562</span><span class="source-line-text">      if (expired) {</span></span>
<span class="source-line"><span class="source-line-number">563</span><span class="source-line-text">        meta.push(</span></span>
<span class="source-line"><span class="source-line-number">564</span><span class="source-line-text">          `shell tool terminated command after exceeding timeout ${input.timeout} ms. If this command is expected to take longer and is not waiting for interactive input, retry with a larger timeout value in milliseconds.`,</span></span>
<span class="source-line"><span class="source-line-number">565</span><span class="source-line-text">        )</span></span>
<span class="source-line"><span class="source-line-number">566</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">567</span><span class="source-line-text">      if (aborted) meta.push(&quot;User aborted the command&quot;)</span></span>
<span class="source-line"><span class="source-line-number">568</span><span class="source-line-text">      const raw = list.map((item) =&gt; item.text).join(&quot;&quot;)</span></span>
<span class="source-line"><span class="source-line-number">569</span><span class="source-line-text">      const end = tail(raw, limits.maxLines, limits.maxBytes)</span></span>
<span class="source-line"><span class="source-line-number">570</span><span class="source-line-text">      if (end.cut) cut = true</span></span>
<span class="source-line"><span class="source-line-number">571</span><span class="source-line-text">      if (!file &amp;&amp; end.cut) {</span></span>
<span class="source-line"><span class="source-line-number">572</span><span class="source-line-text">        file = yield* trunc.write(raw)</span></span>
<span class="source-line"><span class="source-line-number">573</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">574</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">575</span><span class="source-line-text">      let output = end.text</span></span>
<span class="source-line"><span class="source-line-number">576</span><span class="source-line-text">      if (!output) output = &quot;(no output)&quot;</span></span>
<span class="source-line"><span class="source-line-number">577</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">578</span><span class="source-line-text">      if (cut &amp;&amp; file) {</span></span>
<span class="source-line"><span class="source-line-number">579</span><span class="source-line-text">        output = `...output truncated...\n\nFull output saved to: ${file}\n\n` + output</span></span>
<span class="source-line"><span class="source-line-number">580</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">581</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">582</span><span class="source-line-text">      if (meta.length &gt; 0) {</span></span>
<span class="source-line"><span class="source-line-number">583</span><span class="source-line-text">        output += &quot;\n\n&lt;shell_metadata&gt;\n&quot; + meta.join(&quot;\n&quot;) + &quot;\n&lt;/shell_metadata&gt;&quot;</span></span>
<span class="source-line"><span class="source-line-number">584</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">585</span><span class="source-line-text">      return {</span></span>
<span class="source-line"><span class="source-line-number">586</span><span class="source-line-text">        title: input.description,</span></span>
<span class="source-line"><span class="source-line-number">587</span><span class="source-line-text">        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">588</span><span class="source-line-text">          output: last || preview(output),</span></span>
<span class="source-line"><span class="source-line-number">589</span><span class="source-line-text">          exit: code,</span></span>
<span class="source-line"><span class="source-line-number">590</span><span class="source-line-text">          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">591</span><span class="source-line-text">          truncated: cut,</span></span>
<span class="source-line"><span class="source-line-number">592</span><span class="source-line-text">          ...(cut &amp;&amp; file ? { outputPath: file } : {}),</span></span>
<span class="source-line"><span class="source-line-number">593</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">594</span><span class="source-line-text">        output,</span></span>
<span class="source-line"><span class="source-line-number">595</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">596</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">597</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">598</span><span class="source-line-text">    return () =&gt;</span></span>
<span class="source-line"><span class="source-line-number">599</span><span class="source-line-text">      Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">600</span><span class="source-line-text">        const cfg = yield* config.get()</span></span>
<span class="source-line"><span class="source-line-number">601</span><span class="source-line-text">        const shell = Shell.acceptable(cfg.shell)</span></span>
<span class="source-line"><span class="source-line-number">602</span><span class="source-line-text">        const name = Shell.name(shell)</span></span>
<span class="source-line"><span class="source-line-number">603</span><span class="source-line-text">        const limits = yield* trunc.limits()</span></span>
<span class="source-line"><span class="source-line-number">604</span><span class="source-line-text">        const prompt = ShellPrompt.render(name, process.platform, limits)</span></span>
<span class="source-line"><span class="source-line-number">605</span><span class="source-line-text">        log.info(&quot;shell tool using shell&quot;, { shell })</span></span>
<span class="source-line"><span class="source-line-number">606</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">607</span><span class="source-line-text">        return {</span></span>
<span class="source-line"><span class="source-line-number">608</span><span class="source-line-text">          description: prompt.description,</span></span>
<span class="source-line"><span class="source-line-number">609</span><span class="source-line-text">          parameters: prompt.parameters,</span></span>
<span class="source-line"><span class="source-line-number">610</span><span class="source-line-text">          execute: (params: Parameters, ctx: Tool.Context) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">611</span><span class="source-line-text">            Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">612</span><span class="source-line-text">              const instanceCtx = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">613</span><span class="source-line-text">              const cwd = params.workdir</span></span>
<span class="source-line"><span class="source-line-number">614</span><span class="source-line-text">                ? yield* resolvePath(params.workdir, instanceCtx.directory, shell)</span></span>
<span class="source-line"><span class="source-line-number">615</span><span class="source-line-text">                : instanceCtx.directory</span></span>
<span class="source-line"><span class="source-line-number">616</span><span class="source-line-text">              if (params.timeout !== undefined &amp;&amp; params.timeout &lt; 0) {</span></span>
<span class="source-line"><span class="source-line-number">617</span><span class="source-line-text">                throw new Error(`Invalid timeout value: ${params.timeout}. Timeout must be a positive number.`)</span></span>
<span class="source-line"><span class="source-line-number">618</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">619</span><span class="source-line-text">              const timeout = params.timeout ?? defaultTimeout</span></span>
<span class="source-line"><span class="source-line-number">620</span><span class="source-line-text">              const ps = Shell.ps(shell)</span></span>
<span class="source-line"><span class="source-line-number">621</span><span class="source-line-text">              yield* Effect.scoped(</span></span>
<span class="source-line"><span class="source-line-number">622</span><span class="source-line-text">                Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">623</span><span class="source-line-text">                  const tree = yield* Effect.acquireRelease(parse(params.command, ps), (tree) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">624</span><span class="source-line-text">                    Effect.sync(() =&gt; tree.delete()),</span></span>
<span class="source-line"><span class="source-line-number">625</span><span class="source-line-text">                  )</span></span>
<span class="source-line"><span class="source-line-number">626</span><span class="source-line-text">                  const scan = yield* collect(tree.rootNode, cwd, ps, shell, instanceCtx)</span></span>
<span class="source-line"><span class="source-line-number">627</span><span class="source-line-text">                  if (!containsPath(cwd, instanceCtx)) scan.dirs.add(cwd)</span></span>
<span class="source-line"><span class="source-line-number">628</span><span class="source-line-text">                  yield* ask(ctx, scan)</span></span>
<span class="source-line"><span class="source-line-number">629</span><span class="source-line-text">                }),</span></span>
<span class="source-line"><span class="source-line-number">630</span><span class="source-line-text">              )</span></span>
<span class="source-line"><span class="source-line-number">631</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">632</span><span class="source-line-text">              return yield* run(</span></span>
<span class="source-line"><span class="source-line-number">633</span><span class="source-line-text">                {</span></span>
<span class="source-line"><span class="source-line-number">634</span><span class="source-line-text">                  shell,</span></span>
<span class="source-line"><span class="source-line-number">635</span><span class="source-line-text">                  command: params.command,</span></span>
<span class="source-line"><span class="source-line-number">636</span><span class="source-line-text">                  cwd,</span></span>
<span class="source-line"><span class="source-line-number">637</span><span class="source-line-text">                  env: yield* shellEnv(ctx, cwd),</span></span>
<span class="source-line"><span class="source-line-number">638</span><span class="source-line-text">                  timeout,</span></span>
<span class="source-line"><span class="source-line-number">639</span><span class="source-line-text">                  description: params.description,</span></span>
<span class="source-line"><span class="source-line-number">640</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">641</span><span class="source-line-text">                ctx,</span></span>
<span class="source-line"><span class="source-line-number">642</span><span class="source-line-text">              )</span></span>
<span class="source-line"><span class="source-line-number">643</span><span class="source-line-text">            }),</span></span>
<span class="source-line"><span class="source-line-number">644</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">645</span><span class="source-line-text">      })</span></span></code></pre>
</details>：模型调用 shell tool 时走的实现。
- <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:42-73</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  const context = (args: Record&lt;string, unknown&gt;, options: ToolExecutionOptions): Tool.Context =&gt; ({</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">    sessionID: input.session.id,</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">    abort: options.abortSignal!,</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">    messageID: input.processor.message.id,</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">    callID: options.toolCallId,</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">    extra: { model: input.model, bypassAgentCheck: input.bypassAgentCheck, promptOps: input.promptOps },</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">    agent: input.agent.name,</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">    messages: input.messages,</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">    metadata: (val) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">      input.processor.updateToolCall(options.toolCallId, (match) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">        if (![&quot;running&quot;, &quot;pending&quot;].includes(match.state.status)) return match</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">        return {</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">          ...match,</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">          state: {</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">            title: val.title,</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">            metadata: val.metadata,</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">            status: &quot;running&quot;,</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">            input: args,</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">            time: { start: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">      }),</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    ask: (req) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      permission</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">        .ask({</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">          ...req,</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">          sessionID: input.session.id,</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">          tool: { messageID: input.processor.message.id, callID: options.toolCallId },</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">          ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">        .pipe(Effect.orDie),</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">  })</span></span></code></pre>
</details>：工具上下文提供 `ask` 和 `metadata`，shell tool 用它更新状态和触发审批。
- <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:161-196</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">    const ask = Effect.fn(&quot;Permission.ask&quot;)(function* (input: AskInput) {</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">      const { approved, pending } = yield* InstanceState.get(state)</span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">      const { ruleset, ...request } = input</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">      let needsAsk = false</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">      for (const pattern of request.patterns) {</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">        const rule = evaluate(request.permission, pattern, ruleset, approved)</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">        log.info(&quot;evaluated&quot;, { permission: request.permission, pattern, action: rule })</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">        if (rule.action === &quot;deny&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">          return yield* new DeniedError({</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">            ruleset: ruleset.filter((rule) =&gt; Wildcard.match(request.permission, rule.permission)),</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">        if (rule.action === &quot;allow&quot;) continue</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">        needsAsk = true</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">      if (!needsAsk) return</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">      const id = request.id ?? PermissionID.ascending()</span></span>
<span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">      const info = Schema.decodeUnknownSync(Request)({</span></span>
<span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">        id,</span></span>
<span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">        ...request,</span></span>
<span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">      log.info(&quot;asking&quot;, { id, permission: info.permission, patterns: info.patterns })</span></span>
<span class="source-line"><span class="source-line-number">186</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">      const deferred = yield* Deferred.make&lt;void, RejectedError | CorrectedError&gt;()</span></span>
<span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">      pending.set(id, { info, deferred })</span></span>
<span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">      yield* bus.publish(Event.Asked, info)</span></span>
<span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">      return yield* Effect.ensuring(</span></span>
<span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">        Deferred.await(deferred),</span></span>
<span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">        Effect.sync(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">          pending.delete(id)</span></span>
<span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">    })</span></span></code></pre>
</details>：权限服务把 `ask` 转成 pending request。
- `packages/opencode/src/session/processor.ts`：接收 tool result 并写回 message parts；这是 agent 下一轮推理的输入。

还有一条容易混淆的路径：用户在 UI/CLI 中直接执行 shell 命令，不一定是模型 tool call。这个路径由 `SessionPrompt.shellImpl` 处理，会人工构造一个 synthetic user message 和一个 assistant tool part。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:492-650</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">    const shellImpl = Effect.fn(&quot;SessionPrompt.shellImpl&quot;)(function* (input: ShellInput, ready?: Latch.Latch) {</span></span>
<span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">      return yield* Effect.uninterruptibleMask((restore) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">494</span><span class="source-line-text">        Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">495</span><span class="source-line-text">          const markReady = ready ? ready.open.pipe(Effect.asVoid) : Effect.void</span></span>
<span class="source-line"><span class="source-line-number">496</span><span class="source-line-text">          const { msg, part, cwd } = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">497</span><span class="source-line-text">            const ctx = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">498</span><span class="source-line-text">            const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">499</span><span class="source-line-text">            if (session.revert) {</span></span>
<span class="source-line"><span class="source-line-number">500</span><span class="source-line-text">              yield* revert.cleanup(session)</span></span>
<span class="source-line"><span class="source-line-number">501</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">502</span><span class="source-line-text">            const agent = yield* agents.get(input.agent)</span></span>
<span class="source-line"><span class="source-line-number">503</span><span class="source-line-text">            if (!agent) {</span></span>
<span class="source-line"><span class="source-line-number">504</span><span class="source-line-text">              const available = (yield* agents.list()).filter((a) =&gt; !a.hidden).map((a) =&gt; a.name)</span></span>
<span class="source-line"><span class="source-line-number">505</span><span class="source-line-text">              const hint = available.length ? ` Available agents: ${available.join(&quot;, &quot;)}` : &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">506</span><span class="source-line-text">              const error = new NamedError.Unknown({ message: `Agent not found: &quot;${input.agent}&quot;.${hint}` })</span></span>
<span class="source-line"><span class="source-line-number">507</span><span class="source-line-text">              yield* bus.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })</span></span>
<span class="source-line"><span class="source-line-number">508</span><span class="source-line-text">              throw error</span></span>
<span class="source-line"><span class="source-line-number">509</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">510</span><span class="source-line-text">            const model = input.model ?? agent.model ?? (yield* currentModel(input.sessionID))</span></span>
<span class="source-line"><span class="source-line-number">511</span><span class="source-line-text">            const userMsg: MessageV2.User = {</span></span>
<span class="source-line"><span class="source-line-number">512</span><span class="source-line-text">              id: input.messageID ?? MessageID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">513</span><span class="source-line-text">              sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">514</span><span class="source-line-text">              time: { created: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">515</span><span class="source-line-text">              role: &quot;user&quot;,</span></span>
<span class="source-line"><span class="source-line-number">516</span><span class="source-line-text">              agent: input.agent,</span></span>
<span class="source-line"><span class="source-line-number">517</span><span class="source-line-text">              model: { providerID: model.providerID, modelID: model.modelID },</span></span>
<span class="source-line"><span class="source-line-number">518</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">519</span><span class="source-line-text">            yield* sessions.updateMessage(userMsg)</span></span>
<span class="source-line"><span class="source-line-number">520</span><span class="source-line-text">            const userPart: MessageV2.Part = {</span></span>
<span class="source-line"><span class="source-line-number">521</span><span class="source-line-text">              type: &quot;text&quot;,</span></span>
<span class="source-line"><span class="source-line-number">522</span><span class="source-line-text">              id: PartID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">523</span><span class="source-line-text">              messageID: userMsg.id,</span></span>
<span class="source-line"><span class="source-line-number">524</span><span class="source-line-text">              sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">525</span><span class="source-line-text">              text: &quot;The following tool was executed by the user&quot;,</span></span>
<span class="source-line"><span class="source-line-number">526</span><span class="source-line-text">              synthetic: true,</span></span>
<span class="source-line"><span class="source-line-number">527</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">528</span><span class="source-line-text">            yield* sessions.updatePart(userPart)</span></span>
<span class="source-line"><span class="source-line-number">529</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">530</span><span class="source-line-text">            const msg: MessageV2.Assistant = {</span></span>
<span class="source-line"><span class="source-line-number">531</span><span class="source-line-text">              id: MessageID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">532</span><span class="source-line-text">              sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">533</span><span class="source-line-text">              parentID: userMsg.id,</span></span>
<span class="source-line"><span class="source-line-number">534</span><span class="source-line-text">              mode: input.agent,</span></span>
<span class="source-line"><span class="source-line-number">535</span><span class="source-line-text">              agent: input.agent,</span></span>
<span class="source-line"><span class="source-line-number">536</span><span class="source-line-text">              cost: 0,</span></span>
<span class="source-line"><span class="source-line-number">537</span><span class="source-line-text">              path: { cwd: ctx.directory, root: ctx.worktree },</span></span>
<span class="source-line"><span class="source-line-number">538</span><span class="source-line-text">              time: { created: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">539</span><span class="source-line-text">              role: &quot;assistant&quot;,</span></span>
<span class="source-line"><span class="source-line-number">540</span><span class="source-line-text">              tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },</span></span>
<span class="source-line"><span class="source-line-number">541</span><span class="source-line-text">              modelID: model.modelID,</span></span>
<span class="source-line"><span class="source-line-number">542</span><span class="source-line-text">              providerID: model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">543</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">544</span><span class="source-line-text">            yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">545</span><span class="source-line-text">            const started = Date.now()</span></span>
<span class="source-line"><span class="source-line-number">546</span><span class="source-line-text">            const part: MessageV2.ToolPart = {</span></span>
<span class="source-line"><span class="source-line-number">547</span><span class="source-line-text">              type: &quot;tool&quot;,</span></span>
<span class="source-line"><span class="source-line-number">548</span><span class="source-line-text">              id: PartID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">549</span><span class="source-line-text">              messageID: msg.id,</span></span>
<span class="source-line"><span class="source-line-number">550</span><span class="source-line-text">              sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">551</span><span class="source-line-text">              tool: ShellID.ToolID,</span></span>
<span class="source-line"><span class="source-line-number">552</span><span class="source-line-text">              callID: ulid(),</span></span>
<span class="source-line"><span class="source-line-number">553</span><span class="source-line-text">              state: {</span></span>
<span class="source-line"><span class="source-line-number">554</span><span class="source-line-text">                status: &quot;running&quot;,</span></span>
<span class="source-line"><span class="source-line-number">555</span><span class="source-line-text">                time: { start: started },</span></span>
<span class="source-line"><span class="source-line-number">556</span><span class="source-line-text">                input: { command: input.command },</span></span>
<span class="source-line"><span class="source-line-number">557</span><span class="source-line-text">              },</span></span>
<span class="source-line"><span class="source-line-number">558</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">559</span><span class="source-line-text">            yield* sessions.updatePart(part)</span></span>
<span class="source-line"><span class="source-line-number">560</span><span class="source-line-text">            if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">561</span><span class="source-line-text">              yield* events.publish(SessionEvent.Shell.Started, {</span></span>
<span class="source-line"><span class="source-line-number">562</span><span class="source-line-text">                sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">563</span><span class="source-line-text">                timestamp: DateTime.makeUnsafe(started),</span></span>
<span class="source-line"><span class="source-line-number">564</span><span class="source-line-text">                callID: part.callID,</span></span>
<span class="source-line"><span class="source-line-number">565</span><span class="source-line-text">                command: input.command,</span></span>
<span class="source-line"><span class="source-line-number">566</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">567</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">568</span><span class="source-line-text">            return { msg, part, cwd: ctx.directory }</span></span>
<span class="source-line"><span class="source-line-number">569</span><span class="source-line-text">          }).pipe(Effect.ensuring(markReady))</span></span>
<span class="source-line"><span class="source-line-number">570</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">571</span><span class="source-line-text">          const cfg = yield* config.get()</span></span>
<span class="source-line"><span class="source-line-number">572</span><span class="source-line-text">          const sh = Shell.preferred(cfg.shell)</span></span>
<span class="source-line"><span class="source-line-number">573</span><span class="source-line-text">          const args = Shell.args(sh, input.command, cwd)</span></span>
<span class="source-line"><span class="source-line-number">574</span><span class="source-line-text">          let output = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">575</span><span class="source-line-text">          let aborted = false</span></span>
<span class="source-line"><span class="source-line-number">576</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">577</span><span class="source-line-text">          const finish = Effect.uninterruptible(</span></span>
<span class="source-line"><span class="source-line-number">578</span><span class="source-line-text">            Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">579</span><span class="source-line-text">              if (aborted) {</span></span>
<span class="source-line"><span class="source-line-number">580</span><span class="source-line-text">                output += &quot;\n\n&quot; + [&quot;&lt;metadata&gt;&quot;, &quot;User aborted the command&quot;, &quot;&lt;/metadata&gt;&quot;].join(&quot;\n&quot;)</span></span>
<span class="source-line"><span class="source-line-number">581</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">582</span><span class="source-line-text">              const completed = Date.now()</span></span>
<span class="source-line"><span class="source-line-number">583</span><span class="source-line-text">              if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">584</span><span class="source-line-text">                yield* events.publish(SessionEvent.Shell.Ended, {</span></span>
<span class="source-line"><span class="source-line-number">585</span><span class="source-line-text">                  sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">586</span><span class="source-line-text">                  timestamp: DateTime.makeUnsafe(completed),</span></span>
<span class="source-line"><span class="source-line-number">587</span><span class="source-line-text">                  callID: part.callID,</span></span>
<span class="source-line"><span class="source-line-number">588</span><span class="source-line-text">                  output,</span></span>
<span class="source-line"><span class="source-line-number">589</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">590</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">591</span><span class="source-line-text">              if (!msg.time.completed) {</span></span>
<span class="source-line"><span class="source-line-number">592</span><span class="source-line-text">                msg.time.completed = completed</span></span>
<span class="source-line"><span class="source-line-number">593</span><span class="source-line-text">                yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">594</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">595</span><span class="source-line-text">              if (part.state.status === &quot;running&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">596</span><span class="source-line-text">                part.state = {</span></span>
<span class="source-line"><span class="source-line-number">597</span><span class="source-line-text">                  status: &quot;completed&quot;,</span></span>
<span class="source-line"><span class="source-line-number">598</span><span class="source-line-text">                  time: { ...part.state.time, end: completed },</span></span>
<span class="source-line"><span class="source-line-number">599</span><span class="source-line-text">                  input: part.state.input,</span></span>
<span class="source-line"><span class="source-line-number">600</span><span class="source-line-text">                  title: &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">601</span><span class="source-line-text">                  metadata: { output, description: &quot;&quot; },</span></span>
<span class="source-line"><span class="source-line-number">602</span><span class="source-line-text">                  output,</span></span>
<span class="source-line"><span class="source-line-number">603</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">604</span><span class="source-line-text">                yield* sessions.updatePart(part)</span></span>
<span class="source-line"><span class="source-line-number">605</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">606</span><span class="source-line-text">            }),</span></span>
<span class="source-line"><span class="source-line-number">607</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">608</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">609</span><span class="source-line-text">          const exit = yield* restore(</span></span>
<span class="source-line"><span class="source-line-number">610</span><span class="source-line-text">            Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">611</span><span class="source-line-text">              const shellEnv = yield* plugin.trigger(</span></span>
<span class="source-line"><span class="source-line-number">612</span><span class="source-line-text">                &quot;shell.env&quot;,</span></span>
<span class="source-line"><span class="source-line-number">613</span><span class="source-line-text">                { cwd, sessionID: input.sessionID, callID: part.callID },</span></span>
<span class="source-line"><span class="source-line-number">614</span><span class="source-line-text">                { env: {} },</span></span>
<span class="source-line"><span class="source-line-number">615</span><span class="source-line-text">              )</span></span>
<span class="source-line"><span class="source-line-number">616</span><span class="source-line-text">              const cmd = ChildProcess.make(sh, args, {</span></span>
<span class="source-line"><span class="source-line-number">617</span><span class="source-line-text">                cwd,</span></span>
<span class="source-line"><span class="source-line-number">618</span><span class="source-line-text">                extendEnv: true,</span></span>
<span class="source-line"><span class="source-line-number">619</span><span class="source-line-text">                env: { ...shellEnv.env, TERM: &quot;dumb&quot; },</span></span>
<span class="source-line"><span class="source-line-number">620</span><span class="source-line-text">                stdin: &quot;ignore&quot;,</span></span>
<span class="source-line"><span class="source-line-number">621</span><span class="source-line-text">                forceKillAfter: &quot;3 seconds&quot;,</span></span>
<span class="source-line"><span class="source-line-number">622</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">623</span><span class="source-line-text">              const handle = yield* spawner.spawn(cmd)</span></span>
<span class="source-line"><span class="source-line-number">624</span><span class="source-line-text">              yield* Stream.runForEach(Stream.decodeText(handle.all), (chunk) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">625</span><span class="source-line-text">                Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">626</span><span class="source-line-text">                  output += chunk</span></span>
<span class="source-line"><span class="source-line-number">627</span><span class="source-line-text">                  if (part.state.status === &quot;running&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">628</span><span class="source-line-text">                    part.state.metadata = { output, description: &quot;&quot; }</span></span>
<span class="source-line"><span class="source-line-number">629</span><span class="source-line-text">                    yield* sessions.updatePart(part)</span></span>
<span class="source-line"><span class="source-line-number">630</span><span class="source-line-text">                  }</span></span>
<span class="source-line"><span class="source-line-number">631</span><span class="source-line-text">                }),</span></span>
<span class="source-line"><span class="source-line-number">632</span><span class="source-line-text">              )</span></span>
<span class="source-line"><span class="source-line-number">633</span><span class="source-line-text">              yield* handle.exitCode</span></span>
<span class="source-line"><span class="source-line-number">634</span><span class="source-line-text">            }).pipe(Effect.scoped, Effect.orDie),</span></span>
<span class="source-line"><span class="source-line-number">635</span><span class="source-line-text">          ).pipe(Effect.exit)</span></span>
<span class="source-line"><span class="source-line-number">636</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">637</span><span class="source-line-text">          if (Exit.isFailure(exit) &amp;&amp; Cause.hasInterrupts(exit.cause) &amp;&amp; !Cause.hasDies(exit.cause)) {</span></span>
<span class="source-line"><span class="source-line-number">638</span><span class="source-line-text">            aborted = true</span></span>
<span class="source-line"><span class="source-line-number">639</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">640</span><span class="source-line-text">          yield* finish</span></span>
<span class="source-line"><span class="source-line-number">641</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">642</span><span class="source-line-text">          if (Exit.isFailure(exit) &amp;&amp; !aborted &amp;&amp; !Cause.hasInterruptsOnly(exit.cause)) {</span></span>
<span class="source-line"><span class="source-line-number">643</span><span class="source-line-text">            return yield* Effect.failCause(exit.cause)</span></span>
<span class="source-line"><span class="source-line-number">644</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">645</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">646</span><span class="source-line-text">          return { info: msg, parts: [part] }</span></span>
<span class="source-line"><span class="source-line-number">647</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">648</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">649</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">650</span><span class="source-line-text"></span></span></code></pre>
</details>。

## 3. 生活类比

把 shell tool 想成公司里的“机房操作单”。

你不能直接说“去服务器跑这个命令”就结束了。真正流程是：

1. 先读操作单，看命令类型和涉及目录。
2. 如果要碰公司外部目录，先单独申请。
3. 如果命令本身危险或需要确认，再申请命令审批。
4. 执行时持续记录输出。
5. 输出太长就归档原始日志，只把尾部摘要贴回工单。
6. 任务取消或超时，要杀掉进程并把原因写进记录。

这和 `ShellTool.collect -> ask -> run` 的结构基本对应。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:374-410</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">374</span><span class="source-line-text">    const collect = Effect.fn(&quot;ShellTool.collect&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">375</span><span class="source-line-text">      root: Node,</span></span>
<span class="source-line"><span class="source-line-number">376</span><span class="source-line-text">      cwd: string,</span></span>
<span class="source-line"><span class="source-line-number">377</span><span class="source-line-text">      ps: boolean,</span></span>
<span class="source-line"><span class="source-line-number">378</span><span class="source-line-text">      shell: string,</span></span>
<span class="source-line"><span class="source-line-number">379</span><span class="source-line-text">      instance: InstanceContext,</span></span>
<span class="source-line"><span class="source-line-number">380</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">381</span><span class="source-line-text">      const scan: Scan = {</span></span>
<span class="source-line"><span class="source-line-number">382</span><span class="source-line-text">        dirs: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">383</span><span class="source-line-text">        patterns: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">384</span><span class="source-line-text">        always: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">385</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">386</span><span class="source-line-text">      const shellKind = ShellID.toKind(Shell.name(shell))</span></span>
<span class="source-line"><span class="source-line-number">387</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">388</span><span class="source-line-text">      for (const node of commands(root)) {</span></span>
<span class="source-line"><span class="source-line-number">389</span><span class="source-line-text">        const command = parts(node)</span></span>
<span class="source-line"><span class="source-line-number">390</span><span class="source-line-text">        const tokens = command.map((item) =&gt; item.text)</span></span>
<span class="source-line"><span class="source-line-number">391</span><span class="source-line-text">        const cmd = ps || shellKind === &quot;cmd&quot; ? tokens[0]?.toLowerCase() : tokens[0]</span></span>
<span class="source-line"><span class="source-line-number">392</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">393</span><span class="source-line-text">        if (cmd &amp;&amp; (FILES.has(cmd) || (shellKind === &quot;cmd&quot; &amp;&amp; CMD_FILES.has(cmd)))) {</span></span>
<span class="source-line"><span class="source-line-number">394</span><span class="source-line-text">          for (const arg of pathArgs(command, ps, shellKind === &quot;cmd&quot;)) {</span></span>
<span class="source-line"><span class="source-line-number">395</span><span class="source-line-text">            const resolved = yield* argPath(arg, cwd, ps, shell)</span></span>
<span class="source-line"><span class="source-line-number">396</span><span class="source-line-text">            log.info(&quot;resolved path&quot;, { arg, resolved })</span></span>
<span class="source-line"><span class="source-line-number">397</span><span class="source-line-text">            if (!resolved || containsPath(resolved, instance)) continue</span></span>
<span class="source-line"><span class="source-line-number">398</span><span class="source-line-text">            const dir = (yield* fs.isDir(resolved)) ? resolved : path.dirname(resolved)</span></span>
<span class="source-line"><span class="source-line-number">399</span><span class="source-line-text">            scan.dirs.add(dir)</span></span>
<span class="source-line"><span class="source-line-number">400</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">401</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">402</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">403</span><span class="source-line-text">        if (tokens.length &amp;&amp; (!cmd || !CWD.has(cmd))) {</span></span>
<span class="source-line"><span class="source-line-number">404</span><span class="source-line-text">          scan.patterns.add(source(node))</span></span>
<span class="source-line"><span class="source-line-number">405</span><span class="source-line-text">          scan.always.add(BashArity.prefix(tokens).join(&quot; &quot;) + &quot; *&quot;)</span></span>
<span class="source-line"><span class="source-line-number">406</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">407</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">408</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">409</span><span class="source-line-text">      return scan</span></span>
<span class="source-line"><span class="source-line-number">410</span><span class="source-line-text">    })</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:266-287</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">const ask = Effect.fn(&quot;ShellTool.ask&quot;)(function* (ctx: Tool.Context, scan: Scan) {</span></span>
<span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">  if (scan.dirs.size &gt; 0) {</span></span>
<span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">    const globs = Array.from(scan.dirs).map((dir) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">      if (process.platform === &quot;win32&quot;) return AppFileSystem.normalizePathPattern(path.join(dir, &quot;*&quot;))</span></span>
<span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">      return path.join(dir, &quot;*&quot;)</span></span>
<span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">272</span><span class="source-line-text">    yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">      permission: &quot;external_directory&quot;,</span></span>
<span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">      patterns: globs,</span></span>
<span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">      always: globs,</span></span>
<span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">      metadata: {},</span></span>
<span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">278</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">279</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text">  if (scan.patterns.size === 0) return</span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">  yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">    permission: ShellID.ToolID,</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">    patterns: Array.from(scan.patterns),</span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text">    always: Array.from(scan.always),</span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">    metadata: {},</span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">})</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:424-596</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">424</span><span class="source-line-text">    const run = Effect.fn(&quot;ShellTool.run&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">425</span><span class="source-line-text">      input: {</span></span>
<span class="source-line"><span class="source-line-number">426</span><span class="source-line-text">        shell: string</span></span>
<span class="source-line"><span class="source-line-number">427</span><span class="source-line-text">        command: string</span></span>
<span class="source-line"><span class="source-line-number">428</span><span class="source-line-text">        cwd: string</span></span>
<span class="source-line"><span class="source-line-number">429</span><span class="source-line-text">        env: NodeJS.ProcessEnv</span></span>
<span class="source-line"><span class="source-line-number">430</span><span class="source-line-text">        timeout: number</span></span>
<span class="source-line"><span class="source-line-number">431</span><span class="source-line-text">        description: string</span></span>
<span class="source-line"><span class="source-line-number">432</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">433</span><span class="source-line-text">      ctx: Tool.Context,</span></span>
<span class="source-line"><span class="source-line-number">434</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">435</span><span class="source-line-text">      const limits = yield* trunc.limits()</span></span>
<span class="source-line"><span class="source-line-number">436</span><span class="source-line-text">      const keep = limits.maxBytes * 2</span></span>
<span class="source-line"><span class="source-line-number">437</span><span class="source-line-text">      let full = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">438</span><span class="source-line-text">      let last = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">439</span><span class="source-line-text">      const list: Chunk[] = []</span></span>
<span class="source-line"><span class="source-line-number">440</span><span class="source-line-text">      let used = 0</span></span>
<span class="source-line"><span class="source-line-number">441</span><span class="source-line-text">      let file = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">442</span><span class="source-line-text">      let sink: ReturnType&lt;typeof createWriteStream&gt; | undefined</span></span>
<span class="source-line"><span class="source-line-number">443</span><span class="source-line-text">      let cut = false</span></span>
<span class="source-line"><span class="source-line-number">444</span><span class="source-line-text">      let expired = false</span></span>
<span class="source-line"><span class="source-line-number">445</span><span class="source-line-text">      let aborted = false</span></span>
<span class="source-line"><span class="source-line-number">446</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">447</span><span class="source-line-text">      const closeSink = Effect.fnUntraced(function* () {</span></span>
<span class="source-line"><span class="source-line-number">448</span><span class="source-line-text">        const stream = sink</span></span>
<span class="source-line"><span class="source-line-number">449</span><span class="source-line-text">        if (!stream) return</span></span>
<span class="source-line"><span class="source-line-number">450</span><span class="source-line-text">        sink = undefined</span></span>
<span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">        if (stream.destroyed || stream.closed) return</span></span>
<span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">        yield* Effect.promise(</span></span>
<span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">          () =&gt;</span></span>
<span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">            new Promise&lt;void&gt;((resolve) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">              let settled = false</span></span>
<span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">              const done = () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">457</span><span class="source-line-text">                if (settled) return</span></span>
<span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">                settled = true</span></span>
<span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">                stream.off(&quot;close&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">                stream.off(&quot;error&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">                stream.off(&quot;finish&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">                resolve()</span></span>
<span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">              stream.once(&quot;close&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">              stream.once(&quot;error&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">              stream.once(&quot;finish&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">467</span><span class="source-line-text">              stream.end(done)</span></span>
<span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">            }),</span></span>
<span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">        ).pipe(Effect.catch(() =&gt; Effect.void))</span></span>
<span class="source-line"><span class="source-line-number">470</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">471</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">      yield* ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">474</span><span class="source-line-text">          output: &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">478</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">479</span><span class="source-line-text">      const code: number | null = yield* Effect.scoped(</span></span>
<span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">        Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">481</span><span class="source-line-text">          yield* Effect.addFinalizer(closeSink)</span></span>
<span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">          const handle = yield* spawner.spawn(cmd(input.shell, input.command, input.cwd, input.env))</span></span>
<span class="source-line"><span class="source-line-number">483</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">          yield* Effect.forkScoped(</span></span>
<span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">            Stream.runForEach(Stream.decodeText(handle.all), (chunk) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">              const size = Buffer.byteLength(chunk, &quot;utf-8&quot;)</span></span>
<span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">              list.push({ text: chunk, size })</span></span>
<span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">              used += size</span></span>
<span class="source-line"><span class="source-line-number">489</span><span class="source-line-text">              while (used &gt; keep &amp;&amp; list.length &gt; 1) {</span></span>
<span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">                const item = list.shift()</span></span>
<span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">                if (!item) break</span></span>
<span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">                used -= item.size</span></span>
<span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">                cut = true</span></span>
<span class="source-line"><span class="source-line-number">494</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">495</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">496</span><span class="source-line-text">              last = preview(last + chunk)</span></span>
<span class="source-line"><span class="source-line-number">497</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">498</span><span class="source-line-text">              if (file) {</span></span>
<span class="source-line"><span class="source-line-number">499</span><span class="source-line-text">                sink?.write(chunk)</span></span>
<span class="source-line"><span class="source-line-number">500</span><span class="source-line-text">              } else {</span></span>
<span class="source-line"><span class="source-line-number">501</span><span class="source-line-text">                full += chunk</span></span>
<span class="source-line"><span class="source-line-number">502</span><span class="source-line-text">                if (Buffer.byteLength(full, &quot;utf-8&quot;) &gt; limits.maxBytes) {</span></span>
<span class="source-line"><span class="source-line-number">503</span><span class="source-line-text">                  return trunc.write(full).pipe(</span></span>
<span class="source-line"><span class="source-line-number">504</span><span class="source-line-text">                    Effect.andThen((next) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">505</span><span class="source-line-text">                      Effect.sync(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">506</span><span class="source-line-text">                        file = next</span></span>
<span class="source-line"><span class="source-line-number">507</span><span class="source-line-text">                        cut = true</span></span>
<span class="source-line"><span class="source-line-number">508</span><span class="source-line-text">                        sink = createWriteStream(next, { flags: &quot;a&quot; })</span></span>
<span class="source-line"><span class="source-line-number">509</span><span class="source-line-text">                        full = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">510</span><span class="source-line-text">                      }),</span></span>
<span class="source-line"><span class="source-line-number">511</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">512</span><span class="source-line-text">                    Effect.andThen(</span></span>
<span class="source-line"><span class="source-line-number">513</span><span class="source-line-text">                      ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">514</span><span class="source-line-text">                        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">515</span><span class="source-line-text">                          output: last,</span></span>
<span class="source-line"><span class="source-line-number">516</span><span class="source-line-text">                          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">517</span><span class="source-line-text">                        },</span></span>
<span class="source-line"><span class="source-line-number">518</span><span class="source-line-text">                      }),</span></span>
<span class="source-line"><span class="source-line-number">519</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">520</span><span class="source-line-text">                  )</span></span>
<span class="source-line"><span class="source-line-number">521</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">522</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">523</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">524</span><span class="source-line-text">              return ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">525</span><span class="source-line-text">                metadata: {</span></span>
<span class="source-line"><span class="source-line-number">526</span><span class="source-line-text">                  output: last,</span></span>
<span class="source-line"><span class="source-line-number">527</span><span class="source-line-text">                  description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">528</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">529</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">530</span><span class="source-line-text">            }),</span></span>
<span class="source-line"><span class="source-line-number">531</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">532</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">533</span><span class="source-line-text">          const abort = Effect.callback&lt;void&gt;((resume) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">534</span><span class="source-line-text">            if (ctx.abort.aborted) return resume(Effect.void)</span></span>
<span class="source-line"><span class="source-line-number">535</span><span class="source-line-text">            const handler = () =&gt; resume(Effect.void)</span></span>
<span class="source-line"><span class="source-line-number">536</span><span class="source-line-text">            ctx.abort.addEventListener(&quot;abort&quot;, handler, { once: true })</span></span>
<span class="source-line"><span class="source-line-number">537</span><span class="source-line-text">            return Effect.sync(() =&gt; ctx.abort.removeEventListener(&quot;abort&quot;, handler))</span></span>
<span class="source-line"><span class="source-line-number">538</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">539</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">540</span><span class="source-line-text">          const timeout = Effect.sleep(`${input.timeout + 100} millis`)</span></span>
<span class="source-line"><span class="source-line-number">541</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">542</span><span class="source-line-text">          const exit = yield* Effect.raceAll([</span></span>
<span class="source-line"><span class="source-line-number">543</span><span class="source-line-text">            handle.exitCode.pipe(Effect.map((code) =&gt; ({ kind: &quot;exit&quot; as const, code }))),</span></span>
<span class="source-line"><span class="source-line-number">544</span><span class="source-line-text">            abort.pipe(Effect.map(() =&gt; ({ kind: &quot;abort&quot; as const, code: null }))),</span></span>
<span class="source-line"><span class="source-line-number">545</span><span class="source-line-text">            timeout.pipe(Effect.map(() =&gt; ({ kind: &quot;timeout&quot; as const, code: null }))),</span></span>
<span class="source-line"><span class="source-line-number">546</span><span class="source-line-text">          ])</span></span>
<span class="source-line"><span class="source-line-number">547</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">548</span><span class="source-line-text">          if (exit.kind === &quot;abort&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">549</span><span class="source-line-text">            aborted = true</span></span>
<span class="source-line"><span class="source-line-number">550</span><span class="source-line-text">            yield* handle.kill({ forceKillAfter: &quot;3 seconds&quot; }).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">551</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">552</span><span class="source-line-text">          if (exit.kind === &quot;timeout&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">553</span><span class="source-line-text">            expired = true</span></span>
<span class="source-line"><span class="source-line-number">554</span><span class="source-line-text">            yield* handle.kill({ forceKillAfter: &quot;3 seconds&quot; }).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">555</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">556</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">557</span><span class="source-line-text">          return exit.kind === &quot;exit&quot; ? exit.code : null</span></span>
<span class="source-line"><span class="source-line-number">558</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">559</span><span class="source-line-text">      ).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">560</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">561</span><span class="source-line-text">      const meta: string[] = []</span></span>
<span class="source-line"><span class="source-line-number">562</span><span class="source-line-text">      if (expired) {</span></span>
<span class="source-line"><span class="source-line-number">563</span><span class="source-line-text">        meta.push(</span></span>
<span class="source-line"><span class="source-line-number">564</span><span class="source-line-text">          `shell tool terminated command after exceeding timeout ${input.timeout} ms. If this command is expected to take longer and is not waiting for interactive input, retry with a larger timeout value in milliseconds.`,</span></span>
<span class="source-line"><span class="source-line-number">565</span><span class="source-line-text">        )</span></span>
<span class="source-line"><span class="source-line-number">566</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">567</span><span class="source-line-text">      if (aborted) meta.push(&quot;User aborted the command&quot;)</span></span>
<span class="source-line"><span class="source-line-number">568</span><span class="source-line-text">      const raw = list.map((item) =&gt; item.text).join(&quot;&quot;)</span></span>
<span class="source-line"><span class="source-line-number">569</span><span class="source-line-text">      const end = tail(raw, limits.maxLines, limits.maxBytes)</span></span>
<span class="source-line"><span class="source-line-number">570</span><span class="source-line-text">      if (end.cut) cut = true</span></span>
<span class="source-line"><span class="source-line-number">571</span><span class="source-line-text">      if (!file &amp;&amp; end.cut) {</span></span>
<span class="source-line"><span class="source-line-number">572</span><span class="source-line-text">        file = yield* trunc.write(raw)</span></span>
<span class="source-line"><span class="source-line-number">573</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">574</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">575</span><span class="source-line-text">      let output = end.text</span></span>
<span class="source-line"><span class="source-line-number">576</span><span class="source-line-text">      if (!output) output = &quot;(no output)&quot;</span></span>
<span class="source-line"><span class="source-line-number">577</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">578</span><span class="source-line-text">      if (cut &amp;&amp; file) {</span></span>
<span class="source-line"><span class="source-line-number">579</span><span class="source-line-text">        output = `...output truncated...\n\nFull output saved to: ${file}\n\n` + output</span></span>
<span class="source-line"><span class="source-line-number">580</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">581</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">582</span><span class="source-line-text">      if (meta.length &gt; 0) {</span></span>
<span class="source-line"><span class="source-line-number">583</span><span class="source-line-text">        output += &quot;\n\n&lt;shell_metadata&gt;\n&quot; + meta.join(&quot;\n&quot;) + &quot;\n&lt;/shell_metadata&gt;&quot;</span></span>
<span class="source-line"><span class="source-line-number">584</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">585</span><span class="source-line-text">      return {</span></span>
<span class="source-line"><span class="source-line-number">586</span><span class="source-line-text">        title: input.description,</span></span>
<span class="source-line"><span class="source-line-number">587</span><span class="source-line-text">        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">588</span><span class="source-line-text">          output: last || preview(output),</span></span>
<span class="source-line"><span class="source-line-number">589</span><span class="source-line-text">          exit: code,</span></span>
<span class="source-line"><span class="source-line-number">590</span><span class="source-line-text">          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">591</span><span class="source-line-text">          truncated: cut,</span></span>
<span class="source-line"><span class="source-line-number">592</span><span class="source-line-text">          ...(cut &amp;&amp; file ? { outputPath: file } : {}),</span></span>
<span class="source-line"><span class="source-line-number">593</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">594</span><span class="source-line-text">        output,</span></span>
<span class="source-line"><span class="source-line-number">595</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">596</span><span class="source-line-text">    })</span></span></code></pre>
</details>。

## 4. Java 开发者类比

如果用 Java 后端风格理解：

- `ShellTool` 像一个 `ShellCommandService`，但它以 Tool Strategy 形式注册。
- `collect` 像命令执行前的 `PreAuthorize` 分析器。
- `ctx.ask` 像 Spring Security 的 `AccessDecisionManager`，只不过可以异步等用户批准。
- `ChildProcessSpawner` 像封装过的 `ProcessBuilder`。
- `SessionRunState` 像 session 级别的锁和任务运行状态管理器。
- `ctx.metadata` 像不断更新任务表里的 `progress_snapshot` 字段。

Java 伪代码：

```java
ShellPlan plan = shellAnalyzer.scan(command, cwd);
permissionService.ask(sessionId, plan.permissions());
ProcessHandle handle = processRunner.start(command, cwd, env);
while (handle.hasOutput()) {
    toolPartRepository.updateMetadata(callId, handle.latestOutput());
}
ToolResult result = outputLimiter.finish(handle);
messageRepository.appendToolResult(sessionId, result);
```

OpenCode 的差异是：它用 Effect 管理依赖、取消、资源释放和错误；用对象字面量表示 tool result；用 async stream/Effect Stream 消费进程输出。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:424-596</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">424</span><span class="source-line-text">    const run = Effect.fn(&quot;ShellTool.run&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">425</span><span class="source-line-text">      input: {</span></span>
<span class="source-line"><span class="source-line-number">426</span><span class="source-line-text">        shell: string</span></span>
<span class="source-line"><span class="source-line-number">427</span><span class="source-line-text">        command: string</span></span>
<span class="source-line"><span class="source-line-number">428</span><span class="source-line-text">        cwd: string</span></span>
<span class="source-line"><span class="source-line-number">429</span><span class="source-line-text">        env: NodeJS.ProcessEnv</span></span>
<span class="source-line"><span class="source-line-number">430</span><span class="source-line-text">        timeout: number</span></span>
<span class="source-line"><span class="source-line-number">431</span><span class="source-line-text">        description: string</span></span>
<span class="source-line"><span class="source-line-number">432</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">433</span><span class="source-line-text">      ctx: Tool.Context,</span></span>
<span class="source-line"><span class="source-line-number">434</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">435</span><span class="source-line-text">      const limits = yield* trunc.limits()</span></span>
<span class="source-line"><span class="source-line-number">436</span><span class="source-line-text">      const keep = limits.maxBytes * 2</span></span>
<span class="source-line"><span class="source-line-number">437</span><span class="source-line-text">      let full = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">438</span><span class="source-line-text">      let last = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">439</span><span class="source-line-text">      const list: Chunk[] = []</span></span>
<span class="source-line"><span class="source-line-number">440</span><span class="source-line-text">      let used = 0</span></span>
<span class="source-line"><span class="source-line-number">441</span><span class="source-line-text">      let file = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">442</span><span class="source-line-text">      let sink: ReturnType&lt;typeof createWriteStream&gt; | undefined</span></span>
<span class="source-line"><span class="source-line-number">443</span><span class="source-line-text">      let cut = false</span></span>
<span class="source-line"><span class="source-line-number">444</span><span class="source-line-text">      let expired = false</span></span>
<span class="source-line"><span class="source-line-number">445</span><span class="source-line-text">      let aborted = false</span></span>
<span class="source-line"><span class="source-line-number">446</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">447</span><span class="source-line-text">      const closeSink = Effect.fnUntraced(function* () {</span></span>
<span class="source-line"><span class="source-line-number">448</span><span class="source-line-text">        const stream = sink</span></span>
<span class="source-line"><span class="source-line-number">449</span><span class="source-line-text">        if (!stream) return</span></span>
<span class="source-line"><span class="source-line-number">450</span><span class="source-line-text">        sink = undefined</span></span>
<span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">        if (stream.destroyed || stream.closed) return</span></span>
<span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">        yield* Effect.promise(</span></span>
<span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">          () =&gt;</span></span>
<span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">            new Promise&lt;void&gt;((resolve) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">              let settled = false</span></span>
<span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">              const done = () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">457</span><span class="source-line-text">                if (settled) return</span></span>
<span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">                settled = true</span></span>
<span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">                stream.off(&quot;close&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">                stream.off(&quot;error&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">                stream.off(&quot;finish&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">                resolve()</span></span>
<span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">              stream.once(&quot;close&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">              stream.once(&quot;error&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">              stream.once(&quot;finish&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">467</span><span class="source-line-text">              stream.end(done)</span></span>
<span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">            }),</span></span>
<span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">        ).pipe(Effect.catch(() =&gt; Effect.void))</span></span>
<span class="source-line"><span class="source-line-number">470</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">471</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">      yield* ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">474</span><span class="source-line-text">          output: &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">478</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">479</span><span class="source-line-text">      const code: number | null = yield* Effect.scoped(</span></span>
<span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">        Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">481</span><span class="source-line-text">          yield* Effect.addFinalizer(closeSink)</span></span>
<span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">          const handle = yield* spawner.spawn(cmd(input.shell, input.command, input.cwd, input.env))</span></span>
<span class="source-line"><span class="source-line-number">483</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">          yield* Effect.forkScoped(</span></span>
<span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">            Stream.runForEach(Stream.decodeText(handle.all), (chunk) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">              const size = Buffer.byteLength(chunk, &quot;utf-8&quot;)</span></span>
<span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">              list.push({ text: chunk, size })</span></span>
<span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">              used += size</span></span>
<span class="source-line"><span class="source-line-number">489</span><span class="source-line-text">              while (used &gt; keep &amp;&amp; list.length &gt; 1) {</span></span>
<span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">                const item = list.shift()</span></span>
<span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">                if (!item) break</span></span>
<span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">                used -= item.size</span></span>
<span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">                cut = true</span></span>
<span class="source-line"><span class="source-line-number">494</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">495</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">496</span><span class="source-line-text">              last = preview(last + chunk)</span></span>
<span class="source-line"><span class="source-line-number">497</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">498</span><span class="source-line-text">              if (file) {</span></span>
<span class="source-line"><span class="source-line-number">499</span><span class="source-line-text">                sink?.write(chunk)</span></span>
<span class="source-line"><span class="source-line-number">500</span><span class="source-line-text">              } else {</span></span>
<span class="source-line"><span class="source-line-number">501</span><span class="source-line-text">                full += chunk</span></span>
<span class="source-line"><span class="source-line-number">502</span><span class="source-line-text">                if (Buffer.byteLength(full, &quot;utf-8&quot;) &gt; limits.maxBytes) {</span></span>
<span class="source-line"><span class="source-line-number">503</span><span class="source-line-text">                  return trunc.write(full).pipe(</span></span>
<span class="source-line"><span class="source-line-number">504</span><span class="source-line-text">                    Effect.andThen((next) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">505</span><span class="source-line-text">                      Effect.sync(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">506</span><span class="source-line-text">                        file = next</span></span>
<span class="source-line"><span class="source-line-number">507</span><span class="source-line-text">                        cut = true</span></span>
<span class="source-line"><span class="source-line-number">508</span><span class="source-line-text">                        sink = createWriteStream(next, { flags: &quot;a&quot; })</span></span>
<span class="source-line"><span class="source-line-number">509</span><span class="source-line-text">                        full = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">510</span><span class="source-line-text">                      }),</span></span>
<span class="source-line"><span class="source-line-number">511</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">512</span><span class="source-line-text">                    Effect.andThen(</span></span>
<span class="source-line"><span class="source-line-number">513</span><span class="source-line-text">                      ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">514</span><span class="source-line-text">                        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">515</span><span class="source-line-text">                          output: last,</span></span>
<span class="source-line"><span class="source-line-number">516</span><span class="source-line-text">                          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">517</span><span class="source-line-text">                        },</span></span>
<span class="source-line"><span class="source-line-number">518</span><span class="source-line-text">                      }),</span></span>
<span class="source-line"><span class="source-line-number">519</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">520</span><span class="source-line-text">                  )</span></span>
<span class="source-line"><span class="source-line-number">521</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">522</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">523</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">524</span><span class="source-line-text">              return ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">525</span><span class="source-line-text">                metadata: {</span></span>
<span class="source-line"><span class="source-line-number">526</span><span class="source-line-text">                  output: last,</span></span>
<span class="source-line"><span class="source-line-number">527</span><span class="source-line-text">                  description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">528</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">529</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">530</span><span class="source-line-text">            }),</span></span>
<span class="source-line"><span class="source-line-number">531</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">532</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">533</span><span class="source-line-text">          const abort = Effect.callback&lt;void&gt;((resume) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">534</span><span class="source-line-text">            if (ctx.abort.aborted) return resume(Effect.void)</span></span>
<span class="source-line"><span class="source-line-number">535</span><span class="source-line-text">            const handler = () =&gt; resume(Effect.void)</span></span>
<span class="source-line"><span class="source-line-number">536</span><span class="source-line-text">            ctx.abort.addEventListener(&quot;abort&quot;, handler, { once: true })</span></span>
<span class="source-line"><span class="source-line-number">537</span><span class="source-line-text">            return Effect.sync(() =&gt; ctx.abort.removeEventListener(&quot;abort&quot;, handler))</span></span>
<span class="source-line"><span class="source-line-number">538</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">539</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">540</span><span class="source-line-text">          const timeout = Effect.sleep(`${input.timeout + 100} millis`)</span></span>
<span class="source-line"><span class="source-line-number">541</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">542</span><span class="source-line-text">          const exit = yield* Effect.raceAll([</span></span>
<span class="source-line"><span class="source-line-number">543</span><span class="source-line-text">            handle.exitCode.pipe(Effect.map((code) =&gt; ({ kind: &quot;exit&quot; as const, code }))),</span></span>
<span class="source-line"><span class="source-line-number">544</span><span class="source-line-text">            abort.pipe(Effect.map(() =&gt; ({ kind: &quot;abort&quot; as const, code: null }))),</span></span>
<span class="source-line"><span class="source-line-number">545</span><span class="source-line-text">            timeout.pipe(Effect.map(() =&gt; ({ kind: &quot;timeout&quot; as const, code: null }))),</span></span>
<span class="source-line"><span class="source-line-number">546</span><span class="source-line-text">          ])</span></span>
<span class="source-line"><span class="source-line-number">547</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">548</span><span class="source-line-text">          if (exit.kind === &quot;abort&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">549</span><span class="source-line-text">            aborted = true</span></span>
<span class="source-line"><span class="source-line-number">550</span><span class="source-line-text">            yield* handle.kill({ forceKillAfter: &quot;3 seconds&quot; }).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">551</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">552</span><span class="source-line-text">          if (exit.kind === &quot;timeout&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">553</span><span class="source-line-text">            expired = true</span></span>
<span class="source-line"><span class="source-line-number">554</span><span class="source-line-text">            yield* handle.kill({ forceKillAfter: &quot;3 seconds&quot; }).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">555</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">556</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">557</span><span class="source-line-text">          return exit.kind === &quot;exit&quot; ? exit.code : null</span></span>
<span class="source-line"><span class="source-line-number">558</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">559</span><span class="source-line-text">      ).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">560</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">561</span><span class="source-line-text">      const meta: string[] = []</span></span>
<span class="source-line"><span class="source-line-number">562</span><span class="source-line-text">      if (expired) {</span></span>
<span class="source-line"><span class="source-line-number">563</span><span class="source-line-text">        meta.push(</span></span>
<span class="source-line"><span class="source-line-number">564</span><span class="source-line-text">          `shell tool terminated command after exceeding timeout ${input.timeout} ms. If this command is expected to take longer and is not waiting for interactive input, retry with a larger timeout value in milliseconds.`,</span></span>
<span class="source-line"><span class="source-line-number">565</span><span class="source-line-text">        )</span></span>
<span class="source-line"><span class="source-line-number">566</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">567</span><span class="source-line-text">      if (aborted) meta.push(&quot;User aborted the command&quot;)</span></span>
<span class="source-line"><span class="source-line-number">568</span><span class="source-line-text">      const raw = list.map((item) =&gt; item.text).join(&quot;&quot;)</span></span>
<span class="source-line"><span class="source-line-number">569</span><span class="source-line-text">      const end = tail(raw, limits.maxLines, limits.maxBytes)</span></span>
<span class="source-line"><span class="source-line-number">570</span><span class="source-line-text">      if (end.cut) cut = true</span></span>
<span class="source-line"><span class="source-line-number">571</span><span class="source-line-text">      if (!file &amp;&amp; end.cut) {</span></span>
<span class="source-line"><span class="source-line-number">572</span><span class="source-line-text">        file = yield* trunc.write(raw)</span></span>
<span class="source-line"><span class="source-line-number">573</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">574</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">575</span><span class="source-line-text">      let output = end.text</span></span>
<span class="source-line"><span class="source-line-number">576</span><span class="source-line-text">      if (!output) output = &quot;(no output)&quot;</span></span>
<span class="source-line"><span class="source-line-number">577</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">578</span><span class="source-line-text">      if (cut &amp;&amp; file) {</span></span>
<span class="source-line"><span class="source-line-number">579</span><span class="source-line-text">        output = `...output truncated...\n\nFull output saved to: ${file}\n\n` + output</span></span>
<span class="source-line"><span class="source-line-number">580</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">581</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">582</span><span class="source-line-text">      if (meta.length &gt; 0) {</span></span>
<span class="source-line"><span class="source-line-number">583</span><span class="source-line-text">        output += &quot;\n\n&lt;shell_metadata&gt;\n&quot; + meta.join(&quot;\n&quot;) + &quot;\n&lt;/shell_metadata&gt;&quot;</span></span>
<span class="source-line"><span class="source-line-number">584</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">585</span><span class="source-line-text">      return {</span></span>
<span class="source-line"><span class="source-line-number">586</span><span class="source-line-text">        title: input.description,</span></span>
<span class="source-line"><span class="source-line-number">587</span><span class="source-line-text">        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">588</span><span class="source-line-text">          output: last || preview(output),</span></span>
<span class="source-line"><span class="source-line-number">589</span><span class="source-line-text">          exit: code,</span></span>
<span class="source-line"><span class="source-line-number">590</span><span class="source-line-text">          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">591</span><span class="source-line-text">          truncated: cut,</span></span>
<span class="source-line"><span class="source-line-number">592</span><span class="source-line-text">          ...(cut &amp;&amp; file ? { outputPath: file } : {}),</span></span>
<span class="source-line"><span class="source-line-number">593</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">594</span><span class="source-line-text">        output,</span></span>
<span class="source-line"><span class="source-line-number">595</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">596</span><span class="source-line-text">    })</span></span></code></pre>
</details>。

## 5. 最小源码路径

建议按这个顺序读：

1. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:28-78</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">const MAX_METADATA_LENGTH = 30_000</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">const CWD = new Set([&quot;cd&quot;, &quot;chdir&quot;, &quot;popd&quot;, &quot;pushd&quot;, &quot;push-location&quot;, &quot;set-location&quot;])</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">const FILES = new Set([</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">  ...CWD,</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">  &quot;rm&quot;,</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">  &quot;cp&quot;,</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">  &quot;mv&quot;,</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">  &quot;mkdir&quot;,</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  &quot;touch&quot;,</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">  &quot;chmod&quot;,</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">  &quot;chown&quot;,</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  &quot;cat&quot;,</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  // Leave PowerShell aliases out for now. Common ones like cat/cp/mv/rm/mkdir</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">  // already hit the entries above, and alias normalization should happen in one</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  // place later so we do not risk double-prompting.</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  &quot;get-content&quot;,</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  &quot;set-content&quot;,</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">  &quot;add-content&quot;,</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">  &quot;copy-item&quot;,</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">  &quot;move-item&quot;,</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">  &quot;remove-item&quot;,</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">  &quot;new-item&quot;,</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">  &quot;rename-item&quot;,</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">])</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">const CMD_FILES = new Set([</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">  &quot;copy&quot;,</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">  &quot;del&quot;,</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">  &quot;dir&quot;,</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">  &quot;erase&quot;,</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">  &quot;md&quot;,</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">  &quot;mkdir&quot;,</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">  &quot;move&quot;,</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">  &quot;rd&quot;,</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">  &quot;ren&quot;,</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">  &quot;rename&quot;,</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">  &quot;rmdir&quot;,</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">  &quot;type&quot;,</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">])</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">const FLAGS = new Set([&quot;-destination&quot;, &quot;-literalpath&quot;, &quot;-path&quot;])</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">const SWITCHES = new Set([&quot;-confirm&quot;, &quot;-debug&quot;, &quot;-force&quot;, &quot;-nonewline&quot;, &quot;-recurse&quot;, &quot;-verbose&quot;, &quot;-whatif&quot;])</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">type Part = {</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">  type: string</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">  text: string</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">type Scan = {</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  dirs: Set&lt;string&gt;</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">  patterns: Set&lt;string&gt;</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">  always: Set&lt;string&gt;</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">}</span></span></code></pre>
</details>：哪些命令会触发路径扫描，`Scan` 里记录什么。
2. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:266-287</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">const ask = Effect.fn(&quot;ShellTool.ask&quot;)(function* (ctx: Tool.Context, scan: Scan) {</span></span>
<span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">  if (scan.dirs.size &gt; 0) {</span></span>
<span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">    const globs = Array.from(scan.dirs).map((dir) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">      if (process.platform === &quot;win32&quot;) return AppFileSystem.normalizePathPattern(path.join(dir, &quot;*&quot;))</span></span>
<span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">      return path.join(dir, &quot;*&quot;)</span></span>
<span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">272</span><span class="source-line-text">    yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">      permission: &quot;external_directory&quot;,</span></span>
<span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">      patterns: globs,</span></span>
<span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">      always: globs,</span></span>
<span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">      metadata: {},</span></span>
<span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">278</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">279</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text">  if (scan.patterns.size === 0) return</span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">  yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">    permission: ShellID.ToolID,</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">    patterns: Array.from(scan.patterns),</span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text">    always: Array.from(scan.always),</span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">    metadata: {},</span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">})</span></span></code></pre>
</details>：`ask` 如何把扫描结果变成权限请求。
3. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:289-332</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">function cmd(shell: string, command: string, cwd: string, env: NodeJS.ProcessEnv) {</span></span>
<span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">  if (process.platform === &quot;win32&quot; &amp;&amp; Shell.ps(shell)) {</span></span>
<span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">    return ChildProcess.make(shell, [&quot;-NoLogo&quot;, &quot;-NoProfile&quot;, &quot;-NonInteractive&quot;, &quot;-Command&quot;, command], {</span></span>
<span class="source-line"><span class="source-line-number">292</span><span class="source-line-text">      cwd,</span></span>
<span class="source-line"><span class="source-line-number">293</span><span class="source-line-text">      env,</span></span>
<span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">      stdin: &quot;ignore&quot;,</span></span>
<span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">      detached: false,</span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">  return ChildProcess.make(command, [], {</span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">    shell,</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">    cwd,</span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">    env,</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">    stdin: &quot;ignore&quot;,</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">    detached: process.platform !== &quot;win32&quot;,</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">const parser = lazy(async () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">  const { Parser } = await import(&quot;web-tree-sitter&quot;)</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text">  const { default: treeWasm } = await import(&quot;web-tree-sitter/tree-sitter.wasm&quot; as string, {</span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text">    with: { type: &quot;wasm&quot; },</span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">  const treePath = resolveWasm(treeWasm)</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">  await Parser.init({</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text">    locateFile() {</span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">      return treePath</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text">  const { default: bashWasm } = await import(&quot;tree-sitter-bash/tree-sitter-bash.wasm&quot; as string, {</span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">    with: { type: &quot;wasm&quot; },</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">  const { default: psWasm } = await import(&quot;tree-sitter-powershell/tree-sitter-powershell.wasm&quot; as string, {</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">    with: { type: &quot;wasm&quot; },</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">  const bashPath = resolveWasm(bashWasm)</span></span>
<span class="source-line"><span class="source-line-number">325</span><span class="source-line-text">  const psPath = resolveWasm(psWasm)</span></span>
<span class="source-line"><span class="source-line-number">326</span><span class="source-line-text">  const [bashLanguage, psLanguage] = await Promise.all([Language.load(bashPath), Language.load(psPath)])</span></span>
<span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">  const bash = new Parser()</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">  bash.setLanguage(bashLanguage)</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">  const ps = new Parser()</span></span>
<span class="source-line"><span class="source-line-number">330</span><span class="source-line-text">  ps.setLanguage(psLanguage)</span></span>
<span class="source-line"><span class="source-line-number">331</span><span class="source-line-text">  return { bash, ps }</span></span>
<span class="source-line"><span class="source-line-number">332</span><span class="source-line-text">})</span></span></code></pre>
</details>：跨平台创建命令和 lazy 初始化 tree-sitter parser。
4. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:334-373</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">export const ShellTool = Tool.define(</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">  ShellID.ToolID,</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">  Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text">    const config = yield* Config.Service</span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">    const spawner = yield* ChildProcessSpawner</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text">    const fs = yield* AppFileSystem.Service</span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">    const trunc = yield* Truncate.Service</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">    const plugin = yield* Plugin.Service</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text">    const flags = yield* RuntimeFlags.Service</span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">    const defaultTimeout = flags.bashDefaultTimeoutMs ?? 2 * 60 * 1000</span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">    const cygpath = Effect.fn(&quot;ShellTool.cygpath&quot;)(function* (shell: string, text: string) {</span></span>
<span class="source-line"><span class="source-line-number">346</span><span class="source-line-text">      const lines = yield* spawner</span></span>
<span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">        .lines(ChildProcess.make(shell, [&quot;-lc&quot;, 'cygpath -w -- &quot;$1&quot;', &quot;_&quot;, text]))</span></span>
<span class="source-line"><span class="source-line-number">348</span><span class="source-line-text">        .pipe(Effect.catch(() =&gt; Effect.succeed([] as string[])))</span></span>
<span class="source-line"><span class="source-line-number">349</span><span class="source-line-text">      const file = lines[0]?.trim()</span></span>
<span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">      if (!file) return</span></span>
<span class="source-line"><span class="source-line-number">351</span><span class="source-line-text">      return AppFileSystem.normalizePath(file)</span></span>
<span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">353</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">    const resolvePath = Effect.fn(&quot;ShellTool.resolvePath&quot;)(function* (text: string, root: string, shell: string) {</span></span>
<span class="source-line"><span class="source-line-number">355</span><span class="source-line-text">      if (process.platform === &quot;win32&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">356</span><span class="source-line-text">        if (Shell.posix(shell) &amp;&amp; text.startsWith(&quot;/&quot;) &amp;&amp; AppFileSystem.windowsPath(text) === text) {</span></span>
<span class="source-line"><span class="source-line-number">357</span><span class="source-line-text">          const file = yield* cygpath(shell, text)</span></span>
<span class="source-line"><span class="source-line-number">358</span><span class="source-line-text">          if (file) return file</span></span>
<span class="source-line"><span class="source-line-number">359</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">360</span><span class="source-line-text">        return AppFileSystem.normalizePath(path.resolve(root, AppFileSystem.windowsPath(text)))</span></span>
<span class="source-line"><span class="source-line-number">361</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">362</span><span class="source-line-text">      return path.resolve(root, text)</span></span>
<span class="source-line"><span class="source-line-number">363</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">364</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">365</span><span class="source-line-text">    const argPath = Effect.fn(&quot;ShellTool.argPath&quot;)(function* (arg: string, cwd: string, ps: boolean, shell: string) {</span></span>
<span class="source-line"><span class="source-line-number">366</span><span class="source-line-text">      const text = ps ? expand(arg, cwd, shell) : home(unquote(arg))</span></span>
<span class="source-line"><span class="source-line-number">367</span><span class="source-line-text">      const file = text &amp;&amp; prefix(text)</span></span>
<span class="source-line"><span class="source-line-number">368</span><span class="source-line-text">      if (!file || dynamic(file, ps)) return</span></span>
<span class="source-line"><span class="source-line-number">369</span><span class="source-line-text">      const next = ps ? provider(file) : file</span></span>
<span class="source-line"><span class="source-line-number">370</span><span class="source-line-text">      if (!next) return</span></span>
<span class="source-line"><span class="source-line-number">371</span><span class="source-line-text">      return yield* resolvePath(next, cwd, shell)</span></span>
<span class="source-line"><span class="source-line-number">372</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">373</span><span class="source-line-text"></span></span></code></pre>
</details>：`ShellTool` 初始化依赖、解析路径。
5. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:374-410</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">374</span><span class="source-line-text">    const collect = Effect.fn(&quot;ShellTool.collect&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">375</span><span class="source-line-text">      root: Node,</span></span>
<span class="source-line"><span class="source-line-number">376</span><span class="source-line-text">      cwd: string,</span></span>
<span class="source-line"><span class="source-line-number">377</span><span class="source-line-text">      ps: boolean,</span></span>
<span class="source-line"><span class="source-line-number">378</span><span class="source-line-text">      shell: string,</span></span>
<span class="source-line"><span class="source-line-number">379</span><span class="source-line-text">      instance: InstanceContext,</span></span>
<span class="source-line"><span class="source-line-number">380</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">381</span><span class="source-line-text">      const scan: Scan = {</span></span>
<span class="source-line"><span class="source-line-number">382</span><span class="source-line-text">        dirs: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">383</span><span class="source-line-text">        patterns: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">384</span><span class="source-line-text">        always: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">385</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">386</span><span class="source-line-text">      const shellKind = ShellID.toKind(Shell.name(shell))</span></span>
<span class="source-line"><span class="source-line-number">387</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">388</span><span class="source-line-text">      for (const node of commands(root)) {</span></span>
<span class="source-line"><span class="source-line-number">389</span><span class="source-line-text">        const command = parts(node)</span></span>
<span class="source-line"><span class="source-line-number">390</span><span class="source-line-text">        const tokens = command.map((item) =&gt; item.text)</span></span>
<span class="source-line"><span class="source-line-number">391</span><span class="source-line-text">        const cmd = ps || shellKind === &quot;cmd&quot; ? tokens[0]?.toLowerCase() : tokens[0]</span></span>
<span class="source-line"><span class="source-line-number">392</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">393</span><span class="source-line-text">        if (cmd &amp;&amp; (FILES.has(cmd) || (shellKind === &quot;cmd&quot; &amp;&amp; CMD_FILES.has(cmd)))) {</span></span>
<span class="source-line"><span class="source-line-number">394</span><span class="source-line-text">          for (const arg of pathArgs(command, ps, shellKind === &quot;cmd&quot;)) {</span></span>
<span class="source-line"><span class="source-line-number">395</span><span class="source-line-text">            const resolved = yield* argPath(arg, cwd, ps, shell)</span></span>
<span class="source-line"><span class="source-line-number">396</span><span class="source-line-text">            log.info(&quot;resolved path&quot;, { arg, resolved })</span></span>
<span class="source-line"><span class="source-line-number">397</span><span class="source-line-text">            if (!resolved || containsPath(resolved, instance)) continue</span></span>
<span class="source-line"><span class="source-line-number">398</span><span class="source-line-text">            const dir = (yield* fs.isDir(resolved)) ? resolved : path.dirname(resolved)</span></span>
<span class="source-line"><span class="source-line-number">399</span><span class="source-line-text">            scan.dirs.add(dir)</span></span>
<span class="source-line"><span class="source-line-number">400</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">401</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">402</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">403</span><span class="source-line-text">        if (tokens.length &amp;&amp; (!cmd || !CWD.has(cmd))) {</span></span>
<span class="source-line"><span class="source-line-number">404</span><span class="source-line-text">          scan.patterns.add(source(node))</span></span>
<span class="source-line"><span class="source-line-number">405</span><span class="source-line-text">          scan.always.add(BashArity.prefix(tokens).join(&quot; &quot;) + &quot; *&quot;)</span></span>
<span class="source-line"><span class="source-line-number">406</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">407</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">408</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">409</span><span class="source-line-text">      return scan</span></span>
<span class="source-line"><span class="source-line-number">410</span><span class="source-line-text">    })</span></span></code></pre>
</details>：`collect` 从 AST 中提取命令模式和外部目录。
6. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:424-596</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">424</span><span class="source-line-text">    const run = Effect.fn(&quot;ShellTool.run&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">425</span><span class="source-line-text">      input: {</span></span>
<span class="source-line"><span class="source-line-number">426</span><span class="source-line-text">        shell: string</span></span>
<span class="source-line"><span class="source-line-number">427</span><span class="source-line-text">        command: string</span></span>
<span class="source-line"><span class="source-line-number">428</span><span class="source-line-text">        cwd: string</span></span>
<span class="source-line"><span class="source-line-number">429</span><span class="source-line-text">        env: NodeJS.ProcessEnv</span></span>
<span class="source-line"><span class="source-line-number">430</span><span class="source-line-text">        timeout: number</span></span>
<span class="source-line"><span class="source-line-number">431</span><span class="source-line-text">        description: string</span></span>
<span class="source-line"><span class="source-line-number">432</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">433</span><span class="source-line-text">      ctx: Tool.Context,</span></span>
<span class="source-line"><span class="source-line-number">434</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">435</span><span class="source-line-text">      const limits = yield* trunc.limits()</span></span>
<span class="source-line"><span class="source-line-number">436</span><span class="source-line-text">      const keep = limits.maxBytes * 2</span></span>
<span class="source-line"><span class="source-line-number">437</span><span class="source-line-text">      let full = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">438</span><span class="source-line-text">      let last = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">439</span><span class="source-line-text">      const list: Chunk[] = []</span></span>
<span class="source-line"><span class="source-line-number">440</span><span class="source-line-text">      let used = 0</span></span>
<span class="source-line"><span class="source-line-number">441</span><span class="source-line-text">      let file = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">442</span><span class="source-line-text">      let sink: ReturnType&lt;typeof createWriteStream&gt; | undefined</span></span>
<span class="source-line"><span class="source-line-number">443</span><span class="source-line-text">      let cut = false</span></span>
<span class="source-line"><span class="source-line-number">444</span><span class="source-line-text">      let expired = false</span></span>
<span class="source-line"><span class="source-line-number">445</span><span class="source-line-text">      let aborted = false</span></span>
<span class="source-line"><span class="source-line-number">446</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">447</span><span class="source-line-text">      const closeSink = Effect.fnUntraced(function* () {</span></span>
<span class="source-line"><span class="source-line-number">448</span><span class="source-line-text">        const stream = sink</span></span>
<span class="source-line"><span class="source-line-number">449</span><span class="source-line-text">        if (!stream) return</span></span>
<span class="source-line"><span class="source-line-number">450</span><span class="source-line-text">        sink = undefined</span></span>
<span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">        if (stream.destroyed || stream.closed) return</span></span>
<span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">        yield* Effect.promise(</span></span>
<span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">          () =&gt;</span></span>
<span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">            new Promise&lt;void&gt;((resolve) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">              let settled = false</span></span>
<span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">              const done = () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">457</span><span class="source-line-text">                if (settled) return</span></span>
<span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">                settled = true</span></span>
<span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">                stream.off(&quot;close&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">                stream.off(&quot;error&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">                stream.off(&quot;finish&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">                resolve()</span></span>
<span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">              stream.once(&quot;close&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">              stream.once(&quot;error&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">              stream.once(&quot;finish&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">467</span><span class="source-line-text">              stream.end(done)</span></span>
<span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">            }),</span></span>
<span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">        ).pipe(Effect.catch(() =&gt; Effect.void))</span></span>
<span class="source-line"><span class="source-line-number">470</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">471</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">      yield* ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">474</span><span class="source-line-text">          output: &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">478</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">479</span><span class="source-line-text">      const code: number | null = yield* Effect.scoped(</span></span>
<span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">        Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">481</span><span class="source-line-text">          yield* Effect.addFinalizer(closeSink)</span></span>
<span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">          const handle = yield* spawner.spawn(cmd(input.shell, input.command, input.cwd, input.env))</span></span>
<span class="source-line"><span class="source-line-number">483</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">          yield* Effect.forkScoped(</span></span>
<span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">            Stream.runForEach(Stream.decodeText(handle.all), (chunk) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">              const size = Buffer.byteLength(chunk, &quot;utf-8&quot;)</span></span>
<span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">              list.push({ text: chunk, size })</span></span>
<span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">              used += size</span></span>
<span class="source-line"><span class="source-line-number">489</span><span class="source-line-text">              while (used &gt; keep &amp;&amp; list.length &gt; 1) {</span></span>
<span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">                const item = list.shift()</span></span>
<span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">                if (!item) break</span></span>
<span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">                used -= item.size</span></span>
<span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">                cut = true</span></span>
<span class="source-line"><span class="source-line-number">494</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">495</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">496</span><span class="source-line-text">              last = preview(last + chunk)</span></span>
<span class="source-line"><span class="source-line-number">497</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">498</span><span class="source-line-text">              if (file) {</span></span>
<span class="source-line"><span class="source-line-number">499</span><span class="source-line-text">                sink?.write(chunk)</span></span>
<span class="source-line"><span class="source-line-number">500</span><span class="source-line-text">              } else {</span></span>
<span class="source-line"><span class="source-line-number">501</span><span class="source-line-text">                full += chunk</span></span>
<span class="source-line"><span class="source-line-number">502</span><span class="source-line-text">                if (Buffer.byteLength(full, &quot;utf-8&quot;) &gt; limits.maxBytes) {</span></span>
<span class="source-line"><span class="source-line-number">503</span><span class="source-line-text">                  return trunc.write(full).pipe(</span></span>
<span class="source-line"><span class="source-line-number">504</span><span class="source-line-text">                    Effect.andThen((next) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">505</span><span class="source-line-text">                      Effect.sync(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">506</span><span class="source-line-text">                        file = next</span></span>
<span class="source-line"><span class="source-line-number">507</span><span class="source-line-text">                        cut = true</span></span>
<span class="source-line"><span class="source-line-number">508</span><span class="source-line-text">                        sink = createWriteStream(next, { flags: &quot;a&quot; })</span></span>
<span class="source-line"><span class="source-line-number">509</span><span class="source-line-text">                        full = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">510</span><span class="source-line-text">                      }),</span></span>
<span class="source-line"><span class="source-line-number">511</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">512</span><span class="source-line-text">                    Effect.andThen(</span></span>
<span class="source-line"><span class="source-line-number">513</span><span class="source-line-text">                      ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">514</span><span class="source-line-text">                        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">515</span><span class="source-line-text">                          output: last,</span></span>
<span class="source-line"><span class="source-line-number">516</span><span class="source-line-text">                          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">517</span><span class="source-line-text">                        },</span></span>
<span class="source-line"><span class="source-line-number">518</span><span class="source-line-text">                      }),</span></span>
<span class="source-line"><span class="source-line-number">519</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">520</span><span class="source-line-text">                  )</span></span>
<span class="source-line"><span class="source-line-number">521</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">522</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">523</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">524</span><span class="source-line-text">              return ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">525</span><span class="source-line-text">                metadata: {</span></span>
<span class="source-line"><span class="source-line-number">526</span><span class="source-line-text">                  output: last,</span></span>
<span class="source-line"><span class="source-line-number">527</span><span class="source-line-text">                  description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">528</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">529</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">530</span><span class="source-line-text">            }),</span></span>
<span class="source-line"><span class="source-line-number">531</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">532</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">533</span><span class="source-line-text">          const abort = Effect.callback&lt;void&gt;((resume) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">534</span><span class="source-line-text">            if (ctx.abort.aborted) return resume(Effect.void)</span></span>
<span class="source-line"><span class="source-line-number">535</span><span class="source-line-text">            const handler = () =&gt; resume(Effect.void)</span></span>
<span class="source-line"><span class="source-line-number">536</span><span class="source-line-text">            ctx.abort.addEventListener(&quot;abort&quot;, handler, { once: true })</span></span>
<span class="source-line"><span class="source-line-number">537</span><span class="source-line-text">            return Effect.sync(() =&gt; ctx.abort.removeEventListener(&quot;abort&quot;, handler))</span></span>
<span class="source-line"><span class="source-line-number">538</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">539</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">540</span><span class="source-line-text">          const timeout = Effect.sleep(`${input.timeout + 100} millis`)</span></span>
<span class="source-line"><span class="source-line-number">541</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">542</span><span class="source-line-text">          const exit = yield* Effect.raceAll([</span></span>
<span class="source-line"><span class="source-line-number">543</span><span class="source-line-text">            handle.exitCode.pipe(Effect.map((code) =&gt; ({ kind: &quot;exit&quot; as const, code }))),</span></span>
<span class="source-line"><span class="source-line-number">544</span><span class="source-line-text">            abort.pipe(Effect.map(() =&gt; ({ kind: &quot;abort&quot; as const, code: null }))),</span></span>
<span class="source-line"><span class="source-line-number">545</span><span class="source-line-text">            timeout.pipe(Effect.map(() =&gt; ({ kind: &quot;timeout&quot; as const, code: null }))),</span></span>
<span class="source-line"><span class="source-line-number">546</span><span class="source-line-text">          ])</span></span>
<span class="source-line"><span class="source-line-number">547</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">548</span><span class="source-line-text">          if (exit.kind === &quot;abort&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">549</span><span class="source-line-text">            aborted = true</span></span>
<span class="source-line"><span class="source-line-number">550</span><span class="source-line-text">            yield* handle.kill({ forceKillAfter: &quot;3 seconds&quot; }).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">551</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">552</span><span class="source-line-text">          if (exit.kind === &quot;timeout&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">553</span><span class="source-line-text">            expired = true</span></span>
<span class="source-line"><span class="source-line-number">554</span><span class="source-line-text">            yield* handle.kill({ forceKillAfter: &quot;3 seconds&quot; }).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">555</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">556</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">557</span><span class="source-line-text">          return exit.kind === &quot;exit&quot; ? exit.code : null</span></span>
<span class="source-line"><span class="source-line-number">558</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">559</span><span class="source-line-text">      ).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">560</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">561</span><span class="source-line-text">      const meta: string[] = []</span></span>
<span class="source-line"><span class="source-line-number">562</span><span class="source-line-text">      if (expired) {</span></span>
<span class="source-line"><span class="source-line-number">563</span><span class="source-line-text">        meta.push(</span></span>
<span class="source-line"><span class="source-line-number">564</span><span class="source-line-text">          `shell tool terminated command after exceeding timeout ${input.timeout} ms. If this command is expected to take longer and is not waiting for interactive input, retry with a larger timeout value in milliseconds.`,</span></span>
<span class="source-line"><span class="source-line-number">565</span><span class="source-line-text">        )</span></span>
<span class="source-line"><span class="source-line-number">566</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">567</span><span class="source-line-text">      if (aborted) meta.push(&quot;User aborted the command&quot;)</span></span>
<span class="source-line"><span class="source-line-number">568</span><span class="source-line-text">      const raw = list.map((item) =&gt; item.text).join(&quot;&quot;)</span></span>
<span class="source-line"><span class="source-line-number">569</span><span class="source-line-text">      const end = tail(raw, limits.maxLines, limits.maxBytes)</span></span>
<span class="source-line"><span class="source-line-number">570</span><span class="source-line-text">      if (end.cut) cut = true</span></span>
<span class="source-line"><span class="source-line-number">571</span><span class="source-line-text">      if (!file &amp;&amp; end.cut) {</span></span>
<span class="source-line"><span class="source-line-number">572</span><span class="source-line-text">        file = yield* trunc.write(raw)</span></span>
<span class="source-line"><span class="source-line-number">573</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">574</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">575</span><span class="source-line-text">      let output = end.text</span></span>
<span class="source-line"><span class="source-line-number">576</span><span class="source-line-text">      if (!output) output = &quot;(no output)&quot;</span></span>
<span class="source-line"><span class="source-line-number">577</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">578</span><span class="source-line-text">      if (cut &amp;&amp; file) {</span></span>
<span class="source-line"><span class="source-line-number">579</span><span class="source-line-text">        output = `...output truncated...\n\nFull output saved to: ${file}\n\n` + output</span></span>
<span class="source-line"><span class="source-line-number">580</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">581</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">582</span><span class="source-line-text">      if (meta.length &gt; 0) {</span></span>
<span class="source-line"><span class="source-line-number">583</span><span class="source-line-text">        output += &quot;\n\n&lt;shell_metadata&gt;\n&quot; + meta.join(&quot;\n&quot;) + &quot;\n&lt;/shell_metadata&gt;&quot;</span></span>
<span class="source-line"><span class="source-line-number">584</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">585</span><span class="source-line-text">      return {</span></span>
<span class="source-line"><span class="source-line-number">586</span><span class="source-line-text">        title: input.description,</span></span>
<span class="source-line"><span class="source-line-number">587</span><span class="source-line-text">        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">588</span><span class="source-line-text">          output: last || preview(output),</span></span>
<span class="source-line"><span class="source-line-number">589</span><span class="source-line-text">          exit: code,</span></span>
<span class="source-line"><span class="source-line-number">590</span><span class="source-line-text">          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">591</span><span class="source-line-text">          truncated: cut,</span></span>
<span class="source-line"><span class="source-line-number">592</span><span class="source-line-text">          ...(cut &amp;&amp; file ? { outputPath: file } : {}),</span></span>
<span class="source-line"><span class="source-line-number">593</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">594</span><span class="source-line-text">        output,</span></span>
<span class="source-line"><span class="source-line-number">595</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">596</span><span class="source-line-text">    })</span></span></code></pre>
</details>：`run` 执行命令、流式更新 metadata、处理截断/超时/取消。
7. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:598-645</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">598</span><span class="source-line-text">    return () =&gt;</span></span>
<span class="source-line"><span class="source-line-number">599</span><span class="source-line-text">      Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">600</span><span class="source-line-text">        const cfg = yield* config.get()</span></span>
<span class="source-line"><span class="source-line-number">601</span><span class="source-line-text">        const shell = Shell.acceptable(cfg.shell)</span></span>
<span class="source-line"><span class="source-line-number">602</span><span class="source-line-text">        const name = Shell.name(shell)</span></span>
<span class="source-line"><span class="source-line-number">603</span><span class="source-line-text">        const limits = yield* trunc.limits()</span></span>
<span class="source-line"><span class="source-line-number">604</span><span class="source-line-text">        const prompt = ShellPrompt.render(name, process.platform, limits)</span></span>
<span class="source-line"><span class="source-line-number">605</span><span class="source-line-text">        log.info(&quot;shell tool using shell&quot;, { shell })</span></span>
<span class="source-line"><span class="source-line-number">606</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">607</span><span class="source-line-text">        return {</span></span>
<span class="source-line"><span class="source-line-number">608</span><span class="source-line-text">          description: prompt.description,</span></span>
<span class="source-line"><span class="source-line-number">609</span><span class="source-line-text">          parameters: prompt.parameters,</span></span>
<span class="source-line"><span class="source-line-number">610</span><span class="source-line-text">          execute: (params: Parameters, ctx: Tool.Context) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">611</span><span class="source-line-text">            Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">612</span><span class="source-line-text">              const instanceCtx = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">613</span><span class="source-line-text">              const cwd = params.workdir</span></span>
<span class="source-line"><span class="source-line-number">614</span><span class="source-line-text">                ? yield* resolvePath(params.workdir, instanceCtx.directory, shell)</span></span>
<span class="source-line"><span class="source-line-number">615</span><span class="source-line-text">                : instanceCtx.directory</span></span>
<span class="source-line"><span class="source-line-number">616</span><span class="source-line-text">              if (params.timeout !== undefined &amp;&amp; params.timeout &lt; 0) {</span></span>
<span class="source-line"><span class="source-line-number">617</span><span class="source-line-text">                throw new Error(`Invalid timeout value: ${params.timeout}. Timeout must be a positive number.`)</span></span>
<span class="source-line"><span class="source-line-number">618</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">619</span><span class="source-line-text">              const timeout = params.timeout ?? defaultTimeout</span></span>
<span class="source-line"><span class="source-line-number">620</span><span class="source-line-text">              const ps = Shell.ps(shell)</span></span>
<span class="source-line"><span class="source-line-number">621</span><span class="source-line-text">              yield* Effect.scoped(</span></span>
<span class="source-line"><span class="source-line-number">622</span><span class="source-line-text">                Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">623</span><span class="source-line-text">                  const tree = yield* Effect.acquireRelease(parse(params.command, ps), (tree) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">624</span><span class="source-line-text">                    Effect.sync(() =&gt; tree.delete()),</span></span>
<span class="source-line"><span class="source-line-number">625</span><span class="source-line-text">                  )</span></span>
<span class="source-line"><span class="source-line-number">626</span><span class="source-line-text">                  const scan = yield* collect(tree.rootNode, cwd, ps, shell, instanceCtx)</span></span>
<span class="source-line"><span class="source-line-number">627</span><span class="source-line-text">                  if (!containsPath(cwd, instanceCtx)) scan.dirs.add(cwd)</span></span>
<span class="source-line"><span class="source-line-number">628</span><span class="source-line-text">                  yield* ask(ctx, scan)</span></span>
<span class="source-line"><span class="source-line-number">629</span><span class="source-line-text">                }),</span></span>
<span class="source-line"><span class="source-line-number">630</span><span class="source-line-text">              )</span></span>
<span class="source-line"><span class="source-line-number">631</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">632</span><span class="source-line-text">              return yield* run(</span></span>
<span class="source-line"><span class="source-line-number">633</span><span class="source-line-text">                {</span></span>
<span class="source-line"><span class="source-line-number">634</span><span class="source-line-text">                  shell,</span></span>
<span class="source-line"><span class="source-line-number">635</span><span class="source-line-text">                  command: params.command,</span></span>
<span class="source-line"><span class="source-line-number">636</span><span class="source-line-text">                  cwd,</span></span>
<span class="source-line"><span class="source-line-number">637</span><span class="source-line-text">                  env: yield* shellEnv(ctx, cwd),</span></span>
<span class="source-line"><span class="source-line-number">638</span><span class="source-line-text">                  timeout,</span></span>
<span class="source-line"><span class="source-line-number">639</span><span class="source-line-text">                  description: params.description,</span></span>
<span class="source-line"><span class="source-line-number">640</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">641</span><span class="source-line-text">                ctx,</span></span>
<span class="source-line"><span class="source-line-number">642</span><span class="source-line-text">              )</span></span>
<span class="source-line"><span class="source-line-number">643</span><span class="source-line-text">            }),</span></span>
<span class="source-line"><span class="source-line-number">644</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">645</span><span class="source-line-text">      })</span></span></code></pre>
</details>：`execute` 把 parse/collect/ask/run 串起来。
8. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:492-650</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">    const shellImpl = Effect.fn(&quot;SessionPrompt.shellImpl&quot;)(function* (input: ShellInput, ready?: Latch.Latch) {</span></span>
<span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">      return yield* Effect.uninterruptibleMask((restore) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">494</span><span class="source-line-text">        Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">495</span><span class="source-line-text">          const markReady = ready ? ready.open.pipe(Effect.asVoid) : Effect.void</span></span>
<span class="source-line"><span class="source-line-number">496</span><span class="source-line-text">          const { msg, part, cwd } = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">497</span><span class="source-line-text">            const ctx = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">498</span><span class="source-line-text">            const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">499</span><span class="source-line-text">            if (session.revert) {</span></span>
<span class="source-line"><span class="source-line-number">500</span><span class="source-line-text">              yield* revert.cleanup(session)</span></span>
<span class="source-line"><span class="source-line-number">501</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">502</span><span class="source-line-text">            const agent = yield* agents.get(input.agent)</span></span>
<span class="source-line"><span class="source-line-number">503</span><span class="source-line-text">            if (!agent) {</span></span>
<span class="source-line"><span class="source-line-number">504</span><span class="source-line-text">              const available = (yield* agents.list()).filter((a) =&gt; !a.hidden).map((a) =&gt; a.name)</span></span>
<span class="source-line"><span class="source-line-number">505</span><span class="source-line-text">              const hint = available.length ? ` Available agents: ${available.join(&quot;, &quot;)}` : &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">506</span><span class="source-line-text">              const error = new NamedError.Unknown({ message: `Agent not found: &quot;${input.agent}&quot;.${hint}` })</span></span>
<span class="source-line"><span class="source-line-number">507</span><span class="source-line-text">              yield* bus.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })</span></span>
<span class="source-line"><span class="source-line-number">508</span><span class="source-line-text">              throw error</span></span>
<span class="source-line"><span class="source-line-number">509</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">510</span><span class="source-line-text">            const model = input.model ?? agent.model ?? (yield* currentModel(input.sessionID))</span></span>
<span class="source-line"><span class="source-line-number">511</span><span class="source-line-text">            const userMsg: MessageV2.User = {</span></span>
<span class="source-line"><span class="source-line-number">512</span><span class="source-line-text">              id: input.messageID ?? MessageID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">513</span><span class="source-line-text">              sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">514</span><span class="source-line-text">              time: { created: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">515</span><span class="source-line-text">              role: &quot;user&quot;,</span></span>
<span class="source-line"><span class="source-line-number">516</span><span class="source-line-text">              agent: input.agent,</span></span>
<span class="source-line"><span class="source-line-number">517</span><span class="source-line-text">              model: { providerID: model.providerID, modelID: model.modelID },</span></span>
<span class="source-line"><span class="source-line-number">518</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">519</span><span class="source-line-text">            yield* sessions.updateMessage(userMsg)</span></span>
<span class="source-line"><span class="source-line-number">520</span><span class="source-line-text">            const userPart: MessageV2.Part = {</span></span>
<span class="source-line"><span class="source-line-number">521</span><span class="source-line-text">              type: &quot;text&quot;,</span></span>
<span class="source-line"><span class="source-line-number">522</span><span class="source-line-text">              id: PartID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">523</span><span class="source-line-text">              messageID: userMsg.id,</span></span>
<span class="source-line"><span class="source-line-number">524</span><span class="source-line-text">              sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">525</span><span class="source-line-text">              text: &quot;The following tool was executed by the user&quot;,</span></span>
<span class="source-line"><span class="source-line-number">526</span><span class="source-line-text">              synthetic: true,</span></span>
<span class="source-line"><span class="source-line-number">527</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">528</span><span class="source-line-text">            yield* sessions.updatePart(userPart)</span></span>
<span class="source-line"><span class="source-line-number">529</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">530</span><span class="source-line-text">            const msg: MessageV2.Assistant = {</span></span>
<span class="source-line"><span class="source-line-number">531</span><span class="source-line-text">              id: MessageID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">532</span><span class="source-line-text">              sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">533</span><span class="source-line-text">              parentID: userMsg.id,</span></span>
<span class="source-line"><span class="source-line-number">534</span><span class="source-line-text">              mode: input.agent,</span></span>
<span class="source-line"><span class="source-line-number">535</span><span class="source-line-text">              agent: input.agent,</span></span>
<span class="source-line"><span class="source-line-number">536</span><span class="source-line-text">              cost: 0,</span></span>
<span class="source-line"><span class="source-line-number">537</span><span class="source-line-text">              path: { cwd: ctx.directory, root: ctx.worktree },</span></span>
<span class="source-line"><span class="source-line-number">538</span><span class="source-line-text">              time: { created: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">539</span><span class="source-line-text">              role: &quot;assistant&quot;,</span></span>
<span class="source-line"><span class="source-line-number">540</span><span class="source-line-text">              tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },</span></span>
<span class="source-line"><span class="source-line-number">541</span><span class="source-line-text">              modelID: model.modelID,</span></span>
<span class="source-line"><span class="source-line-number">542</span><span class="source-line-text">              providerID: model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">543</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">544</span><span class="source-line-text">            yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">545</span><span class="source-line-text">            const started = Date.now()</span></span>
<span class="source-line"><span class="source-line-number">546</span><span class="source-line-text">            const part: MessageV2.ToolPart = {</span></span>
<span class="source-line"><span class="source-line-number">547</span><span class="source-line-text">              type: &quot;tool&quot;,</span></span>
<span class="source-line"><span class="source-line-number">548</span><span class="source-line-text">              id: PartID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">549</span><span class="source-line-text">              messageID: msg.id,</span></span>
<span class="source-line"><span class="source-line-number">550</span><span class="source-line-text">              sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">551</span><span class="source-line-text">              tool: ShellID.ToolID,</span></span>
<span class="source-line"><span class="source-line-number">552</span><span class="source-line-text">              callID: ulid(),</span></span>
<span class="source-line"><span class="source-line-number">553</span><span class="source-line-text">              state: {</span></span>
<span class="source-line"><span class="source-line-number">554</span><span class="source-line-text">                status: &quot;running&quot;,</span></span>
<span class="source-line"><span class="source-line-number">555</span><span class="source-line-text">                time: { start: started },</span></span>
<span class="source-line"><span class="source-line-number">556</span><span class="source-line-text">                input: { command: input.command },</span></span>
<span class="source-line"><span class="source-line-number">557</span><span class="source-line-text">              },</span></span>
<span class="source-line"><span class="source-line-number">558</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">559</span><span class="source-line-text">            yield* sessions.updatePart(part)</span></span>
<span class="source-line"><span class="source-line-number">560</span><span class="source-line-text">            if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">561</span><span class="source-line-text">              yield* events.publish(SessionEvent.Shell.Started, {</span></span>
<span class="source-line"><span class="source-line-number">562</span><span class="source-line-text">                sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">563</span><span class="source-line-text">                timestamp: DateTime.makeUnsafe(started),</span></span>
<span class="source-line"><span class="source-line-number">564</span><span class="source-line-text">                callID: part.callID,</span></span>
<span class="source-line"><span class="source-line-number">565</span><span class="source-line-text">                command: input.command,</span></span>
<span class="source-line"><span class="source-line-number">566</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">567</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">568</span><span class="source-line-text">            return { msg, part, cwd: ctx.directory }</span></span>
<span class="source-line"><span class="source-line-number">569</span><span class="source-line-text">          }).pipe(Effect.ensuring(markReady))</span></span>
<span class="source-line"><span class="source-line-number">570</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">571</span><span class="source-line-text">          const cfg = yield* config.get()</span></span>
<span class="source-line"><span class="source-line-number">572</span><span class="source-line-text">          const sh = Shell.preferred(cfg.shell)</span></span>
<span class="source-line"><span class="source-line-number">573</span><span class="source-line-text">          const args = Shell.args(sh, input.command, cwd)</span></span>
<span class="source-line"><span class="source-line-number">574</span><span class="source-line-text">          let output = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">575</span><span class="source-line-text">          let aborted = false</span></span>
<span class="source-line"><span class="source-line-number">576</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">577</span><span class="source-line-text">          const finish = Effect.uninterruptible(</span></span>
<span class="source-line"><span class="source-line-number">578</span><span class="source-line-text">            Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">579</span><span class="source-line-text">              if (aborted) {</span></span>
<span class="source-line"><span class="source-line-number">580</span><span class="source-line-text">                output += &quot;\n\n&quot; + [&quot;&lt;metadata&gt;&quot;, &quot;User aborted the command&quot;, &quot;&lt;/metadata&gt;&quot;].join(&quot;\n&quot;)</span></span>
<span class="source-line"><span class="source-line-number">581</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">582</span><span class="source-line-text">              const completed = Date.now()</span></span>
<span class="source-line"><span class="source-line-number">583</span><span class="source-line-text">              if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">584</span><span class="source-line-text">                yield* events.publish(SessionEvent.Shell.Ended, {</span></span>
<span class="source-line"><span class="source-line-number">585</span><span class="source-line-text">                  sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">586</span><span class="source-line-text">                  timestamp: DateTime.makeUnsafe(completed),</span></span>
<span class="source-line"><span class="source-line-number">587</span><span class="source-line-text">                  callID: part.callID,</span></span>
<span class="source-line"><span class="source-line-number">588</span><span class="source-line-text">                  output,</span></span>
<span class="source-line"><span class="source-line-number">589</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">590</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">591</span><span class="source-line-text">              if (!msg.time.completed) {</span></span>
<span class="source-line"><span class="source-line-number">592</span><span class="source-line-text">                msg.time.completed = completed</span></span>
<span class="source-line"><span class="source-line-number">593</span><span class="source-line-text">                yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">594</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">595</span><span class="source-line-text">              if (part.state.status === &quot;running&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">596</span><span class="source-line-text">                part.state = {</span></span>
<span class="source-line"><span class="source-line-number">597</span><span class="source-line-text">                  status: &quot;completed&quot;,</span></span>
<span class="source-line"><span class="source-line-number">598</span><span class="source-line-text">                  time: { ...part.state.time, end: completed },</span></span>
<span class="source-line"><span class="source-line-number">599</span><span class="source-line-text">                  input: part.state.input,</span></span>
<span class="source-line"><span class="source-line-number">600</span><span class="source-line-text">                  title: &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">601</span><span class="source-line-text">                  metadata: { output, description: &quot;&quot; },</span></span>
<span class="source-line"><span class="source-line-number">602</span><span class="source-line-text">                  output,</span></span>
<span class="source-line"><span class="source-line-number">603</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">604</span><span class="source-line-text">                yield* sessions.updatePart(part)</span></span>
<span class="source-line"><span class="source-line-number">605</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">606</span><span class="source-line-text">            }),</span></span>
<span class="source-line"><span class="source-line-number">607</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">608</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">609</span><span class="source-line-text">          const exit = yield* restore(</span></span>
<span class="source-line"><span class="source-line-number">610</span><span class="source-line-text">            Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">611</span><span class="source-line-text">              const shellEnv = yield* plugin.trigger(</span></span>
<span class="source-line"><span class="source-line-number">612</span><span class="source-line-text">                &quot;shell.env&quot;,</span></span>
<span class="source-line"><span class="source-line-number">613</span><span class="source-line-text">                { cwd, sessionID: input.sessionID, callID: part.callID },</span></span>
<span class="source-line"><span class="source-line-number">614</span><span class="source-line-text">                { env: {} },</span></span>
<span class="source-line"><span class="source-line-number">615</span><span class="source-line-text">              )</span></span>
<span class="source-line"><span class="source-line-number">616</span><span class="source-line-text">              const cmd = ChildProcess.make(sh, args, {</span></span>
<span class="source-line"><span class="source-line-number">617</span><span class="source-line-text">                cwd,</span></span>
<span class="source-line"><span class="source-line-number">618</span><span class="source-line-text">                extendEnv: true,</span></span>
<span class="source-line"><span class="source-line-number">619</span><span class="source-line-text">                env: { ...shellEnv.env, TERM: &quot;dumb&quot; },</span></span>
<span class="source-line"><span class="source-line-number">620</span><span class="source-line-text">                stdin: &quot;ignore&quot;,</span></span>
<span class="source-line"><span class="source-line-number">621</span><span class="source-line-text">                forceKillAfter: &quot;3 seconds&quot;,</span></span>
<span class="source-line"><span class="source-line-number">622</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">623</span><span class="source-line-text">              const handle = yield* spawner.spawn(cmd)</span></span>
<span class="source-line"><span class="source-line-number">624</span><span class="source-line-text">              yield* Stream.runForEach(Stream.decodeText(handle.all), (chunk) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">625</span><span class="source-line-text">                Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">626</span><span class="source-line-text">                  output += chunk</span></span>
<span class="source-line"><span class="source-line-number">627</span><span class="source-line-text">                  if (part.state.status === &quot;running&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">628</span><span class="source-line-text">                    part.state.metadata = { output, description: &quot;&quot; }</span></span>
<span class="source-line"><span class="source-line-number">629</span><span class="source-line-text">                    yield* sessions.updatePart(part)</span></span>
<span class="source-line"><span class="source-line-number">630</span><span class="source-line-text">                  }</span></span>
<span class="source-line"><span class="source-line-number">631</span><span class="source-line-text">                }),</span></span>
<span class="source-line"><span class="source-line-number">632</span><span class="source-line-text">              )</span></span>
<span class="source-line"><span class="source-line-number">633</span><span class="source-line-text">              yield* handle.exitCode</span></span>
<span class="source-line"><span class="source-line-number">634</span><span class="source-line-text">            }).pipe(Effect.scoped, Effect.orDie),</span></span>
<span class="source-line"><span class="source-line-number">635</span><span class="source-line-text">          ).pipe(Effect.exit)</span></span>
<span class="source-line"><span class="source-line-number">636</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">637</span><span class="source-line-text">          if (Exit.isFailure(exit) &amp;&amp; Cause.hasInterrupts(exit.cause) &amp;&amp; !Cause.hasDies(exit.cause)) {</span></span>
<span class="source-line"><span class="source-line-number">638</span><span class="source-line-text">            aborted = true</span></span>
<span class="source-line"><span class="source-line-number">639</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">640</span><span class="source-line-text">          yield* finish</span></span>
<span class="source-line"><span class="source-line-number">641</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">642</span><span class="source-line-text">          if (Exit.isFailure(exit) &amp;&amp; !aborted &amp;&amp; !Cause.hasInterruptsOnly(exit.cause)) {</span></span>
<span class="source-line"><span class="source-line-number">643</span><span class="source-line-text">            return yield* Effect.failCause(exit.cause)</span></span>
<span class="source-line"><span class="source-line-number">644</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">645</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">646</span><span class="source-line-text">          return { info: msg, parts: [part] }</span></span>
<span class="source-line"><span class="source-line-number">647</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">648</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">649</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">650</span><span class="source-line-text"></span></span></code></pre>
</details>：用户直接 shell 命令如何进入 session。
9. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/run-state.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/run-state.ts:10-24</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">export interface Interface {</span></span>
<span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">  readonly assertNotBusy: (sessionID: SessionID) =&gt; Effect.Effect&lt;void, Session.BusyError&gt;</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">  readonly cancel: (sessionID: SessionID) =&gt; Effect.Effect&lt;void&gt;</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">  readonly ensureRunning: (</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">    sessionID: SessionID,</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    onInterrupt: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    work: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  ) =&gt; Effect.Effect&lt;MessageV2.WithParts&gt;</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">  readonly startShell: (</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    sessionID: SessionID,</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    onInterrupt: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">    work: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">    ready?: Latch.Latch,</span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  ) =&gt; Effect.Effect&lt;MessageV2.WithParts, Session.BusyError&gt;</span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">}</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/run-state.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/run-state.ts:70-104</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">    const assertNotBusy = Effect.fn(&quot;SessionRunState.assertNotBusy&quot;)(function* (sessionID: SessionID) {</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">      const data = yield* InstanceState.get(state)</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">      const existing = data.runners.get(sessionID)</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">      if (existing?.busy) yield* busyError(sessionID)</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">    const cancel = Effect.fn(&quot;SessionRunState.cancel&quot;)(function* (sessionID: SessionID) {</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">      yield* cancelBackgroundJobs(background, sessionID)</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">      const data = yield* InstanceState.get(state)</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">      const existing = data.runners.get(sessionID)</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">      if (!existing || !existing.busy) {</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">        yield* status.set(sessionID, { type: &quot;idle&quot; })</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">        return</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">      yield* existing.cancel</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">    const ensureRunning = Effect.fn(&quot;SessionRunState.ensureRunning&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">      sessionID: SessionID,</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">      onInterrupt: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">      work: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">      return yield* (yield* runner(sessionID, onInterrupt)).ensureRunning(work)</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">    const startShell = Effect.fn(&quot;SessionRunState.startShell&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">      sessionID: SessionID,</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">      onInterrupt: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">      work: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">      ready?: Latch.Latch,</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">      return yield* (yield* runner(sessionID, onInterrupt))</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">        .startShell(work, ready)</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">        .pipe(Effect.catchTag(&quot;RunnerBusy&quot;, () =&gt; Effect.fail(busyError(sessionID))))</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">    })</span></span></code></pre>
</details>：session 运行状态如何阻止并发冲突。

## 6. 用户输入到 agent 行动的整体链路

### 6.1 模型发起 shell tool call

OpenCode 的 agent loop 会先通过 `SessionTools.resolve` 把 `ShellTool` 包成 AI SDK tool。模型选择调用 shell 后，AI SDK 调用 `ShellTool.execute`。这部分在 Tool 调用系统章已经讲过，这里只看 shell 内部。

`ShellTool` 在初始化时把配置、进程、文件系统、截断、插件、运行参数等服务取出来：

```ts
export const ShellTool = Tool.define(
  ShellID.ToolID,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const spawner = yield* ChildProcessSpawner
    const fs = yield* AppFileSystem.Service
    const trunc = yield* Truncate.Service
    const plugin = yield* Plugin.Service
    const flags = yield* RuntimeFlags.Service
    const defaultTimeout = flags.bashDefaultTimeoutMs ?? 2 * 60 * 1000
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:334-343</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">export const ShellTool = Tool.define(</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">  ShellID.ToolID,</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">  Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text">    const config = yield* Config.Service</span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">    const spawner = yield* ChildProcessSpawner</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text">    const fs = yield* AppFileSystem.Service</span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">    const trunc = yield* Truncate.Service</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">    const plugin = yield* Plugin.Service</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text">    const flags = yield* RuntimeFlags.Service</span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">    const defaultTimeout = flags.bashDefaultTimeoutMs ?? 2 * 60 * 1000</span></span></code></pre>
</details>

这说明 shell tool 不是纯函数，它依赖配置、进程抽象、文件系统、输出截断、插件 hook 和 runtime flags。

### 6.2 解析命令与扫描风险

在真正执行前，`execute` 会 parse 命令，然后 collect：

```ts
const tree = yield* Effect.acquireRelease(parse(params.command, ps), (tree) =>
  Effect.sync(() => tree.delete()),
)
const scan = yield* collect(tree.rootNode, cwd, ps, shell, instanceCtx)
if (!containsPath(cwd, instanceCtx)) scan.dirs.add(cwd)
yield* ask(ctx, scan)
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:621-629</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">621</span><span class="source-line-text">              yield* Effect.scoped(</span></span>
<span class="source-line"><span class="source-line-number">622</span><span class="source-line-text">                Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">623</span><span class="source-line-text">                  const tree = yield* Effect.acquireRelease(parse(params.command, ps), (tree) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">624</span><span class="source-line-text">                    Effect.sync(() =&gt; tree.delete()),</span></span>
<span class="source-line"><span class="source-line-number">625</span><span class="source-line-text">                  )</span></span>
<span class="source-line"><span class="source-line-number">626</span><span class="source-line-text">                  const scan = yield* collect(tree.rootNode, cwd, ps, shell, instanceCtx)</span></span>
<span class="source-line"><span class="source-line-number">627</span><span class="source-line-text">                  if (!containsPath(cwd, instanceCtx)) scan.dirs.add(cwd)</span></span>
<span class="source-line"><span class="source-line-number">628</span><span class="source-line-text">                  yield* ask(ctx, scan)</span></span>
<span class="source-line"><span class="source-line-number">629</span><span class="source-line-text">                }),</span></span></code></pre>
</details>

这里关键点是：命令执行前先构造 AST，并且用 `acquireRelease` 确保 tree-sitter tree 被释放。对 Java 开发者来说，这像 `try-with-resources`。

### 6.3 权限审批

`ask` 会根据扫描结果发两个维度的审批：

```ts
if (scan.dirs.size > 0) {
  const globs = Array.from(scan.dirs).map((dir) => {
    if (process.platform === "win32") return AppFileSystem.normalizePathPattern(path.join(dir, "*"))
    return path.join(dir, "*")
  })
  yield* ctx.ask({
    permission: "external_directory",
    patterns: globs,
    always: globs,
    metadata: {},
  })
}

if (scan.patterns.size === 0) return
yield* ctx.ask({
  permission: ShellID.ToolID,
  patterns: Array.from(scan.patterns),
  always: Array.from(scan.always),
  metadata: {},
})
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:266-287</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">const ask = Effect.fn(&quot;ShellTool.ask&quot;)(function* (ctx: Tool.Context, scan: Scan) {</span></span>
<span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">  if (scan.dirs.size &gt; 0) {</span></span>
<span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">    const globs = Array.from(scan.dirs).map((dir) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">      if (process.platform === &quot;win32&quot;) return AppFileSystem.normalizePathPattern(path.join(dir, &quot;*&quot;))</span></span>
<span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">      return path.join(dir, &quot;*&quot;)</span></span>
<span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">272</span><span class="source-line-text">    yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">      permission: &quot;external_directory&quot;,</span></span>
<span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">      patterns: globs,</span></span>
<span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">      always: globs,</span></span>
<span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">      metadata: {},</span></span>
<span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">278</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">279</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text">  if (scan.patterns.size === 0) return</span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">  yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">    permission: ShellID.ToolID,</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">    patterns: Array.from(scan.patterns),</span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text">    always: Array.from(scan.always),</span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">    metadata: {},</span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">})</span></span></code></pre>
</details>

第一段保护工作区外目录；第二段保护 shell 命令模式。`always` 是“以后总是允许”的候选 pattern。真正是否允许由 `Permission.ask` 根据规则集和已批准记录判断。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:161-196</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">    const ask = Effect.fn(&quot;Permission.ask&quot;)(function* (input: AskInput) {</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">      const { approved, pending } = yield* InstanceState.get(state)</span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">      const { ruleset, ...request } = input</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">      let needsAsk = false</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">      for (const pattern of request.patterns) {</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">        const rule = evaluate(request.permission, pattern, ruleset, approved)</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">        log.info(&quot;evaluated&quot;, { permission: request.permission, pattern, action: rule })</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">        if (rule.action === &quot;deny&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">          return yield* new DeniedError({</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">            ruleset: ruleset.filter((rule) =&gt; Wildcard.match(request.permission, rule.permission)),</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">        if (rule.action === &quot;allow&quot;) continue</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">        needsAsk = true</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">      if (!needsAsk) return</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">      const id = request.id ?? PermissionID.ascending()</span></span>
<span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">      const info = Schema.decodeUnknownSync(Request)({</span></span>
<span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">        id,</span></span>
<span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">        ...request,</span></span>
<span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">      log.info(&quot;asking&quot;, { id, permission: info.permission, patterns: info.patterns })</span></span>
<span class="source-line"><span class="source-line-number">186</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">      const deferred = yield* Deferred.make&lt;void, RejectedError | CorrectedError&gt;()</span></span>
<span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">      pending.set(id, { info, deferred })</span></span>
<span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">      yield* bus.publish(Event.Asked, info)</span></span>
<span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">      return yield* Effect.ensuring(</span></span>
<span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">        Deferred.await(deferred),</span></span>
<span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">        Effect.sync(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">          pending.delete(id)</span></span>
<span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">    })</span></span></code></pre>
</details>。

### 6.4 执行进程

命令创建分 Windows PowerShell 和普通 shell 两类：

```ts
function cmd(shell: string, command: string, cwd: string, env: NodeJS.ProcessEnv) {
  if (process.platform === "win32" && Shell.ps(shell)) {
    return ChildProcess.make(shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
      cwd,
      env,
      stdin: "ignore",
      detached: false,
    })
  }

  return ChildProcess.make(command, [], {
    shell,
    cwd,
    env,
    stdin: "ignore",
    detached: process.platform !== "win32",
  })
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:289-305</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">function cmd(shell: string, command: string, cwd: string, env: NodeJS.ProcessEnv) {</span></span>
<span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">  if (process.platform === &quot;win32&quot; &amp;&amp; Shell.ps(shell)) {</span></span>
<span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">    return ChildProcess.make(shell, [&quot;-NoLogo&quot;, &quot;-NoProfile&quot;, &quot;-NonInteractive&quot;, &quot;-Command&quot;, command], {</span></span>
<span class="source-line"><span class="source-line-number">292</span><span class="source-line-text">      cwd,</span></span>
<span class="source-line"><span class="source-line-number">293</span><span class="source-line-text">      env,</span></span>
<span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">      stdin: &quot;ignore&quot;,</span></span>
<span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">      detached: false,</span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">  return ChildProcess.make(command, [], {</span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">    shell,</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">    cwd,</span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">    env,</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">    stdin: &quot;ignore&quot;,</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">    detached: process.platform !== &quot;win32&quot;,</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">  })</span></span></code></pre>
</details>

注意 `stdin: "ignore"`，这表示 shell tool 不适合运行需要交互输入的命令。超时提示也会提醒用户：如果命令不是在等输入，可以用更大的 timeout 重试。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:561-565</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">561</span><span class="source-line-text">      const meta: string[] = []</span></span>
<span class="source-line"><span class="source-line-number">562</span><span class="source-line-text">      if (expired) {</span></span>
<span class="source-line"><span class="source-line-number">563</span><span class="source-line-text">        meta.push(</span></span>
<span class="source-line"><span class="source-line-number">564</span><span class="source-line-text">          `shell tool terminated command after exceeding timeout ${input.timeout} ms. If this command is expected to take longer and is not waiting for interactive input, retry with a larger timeout value in milliseconds.`,</span></span>
<span class="source-line"><span class="source-line-number">565</span><span class="source-line-text">        )</span></span></code></pre>
</details>。

### 6.5 输出回写、截断、超时和取消

`run` 会把输出流解码成文本，不断更新 tool metadata：

```ts
yield* Effect.forkScoped(
  Stream.runForEach(Stream.decodeText(handle.all), (chunk) => {
    const size = Buffer.byteLength(chunk, "utf-8")
    list.push({ text: chunk, size })
    used += size

    last = preview(last + chunk)

    return ctx.metadata({
      metadata: {
        output: last,
        description: input.description,
      },
    })
  }),
)
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:484-530</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">          yield* Effect.forkScoped(</span></span>
<span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">            Stream.runForEach(Stream.decodeText(handle.all), (chunk) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">              const size = Buffer.byteLength(chunk, &quot;utf-8&quot;)</span></span>
<span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">              list.push({ text: chunk, size })</span></span>
<span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">              used += size</span></span>
<span class="source-line"><span class="source-line-number">489</span><span class="source-line-text">              while (used &gt; keep &amp;&amp; list.length &gt; 1) {</span></span>
<span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">                const item = list.shift()</span></span>
<span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">                if (!item) break</span></span>
<span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">                used -= item.size</span></span>
<span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">                cut = true</span></span>
<span class="source-line"><span class="source-line-number">494</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">495</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">496</span><span class="source-line-text">              last = preview(last + chunk)</span></span>
<span class="source-line"><span class="source-line-number">497</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">498</span><span class="source-line-text">              if (file) {</span></span>
<span class="source-line"><span class="source-line-number">499</span><span class="source-line-text">                sink?.write(chunk)</span></span>
<span class="source-line"><span class="source-line-number">500</span><span class="source-line-text">              } else {</span></span>
<span class="source-line"><span class="source-line-number">501</span><span class="source-line-text">                full += chunk</span></span>
<span class="source-line"><span class="source-line-number">502</span><span class="source-line-text">                if (Buffer.byteLength(full, &quot;utf-8&quot;) &gt; limits.maxBytes) {</span></span>
<span class="source-line"><span class="source-line-number">503</span><span class="source-line-text">                  return trunc.write(full).pipe(</span></span>
<span class="source-line"><span class="source-line-number">504</span><span class="source-line-text">                    Effect.andThen((next) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">505</span><span class="source-line-text">                      Effect.sync(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">506</span><span class="source-line-text">                        file = next</span></span>
<span class="source-line"><span class="source-line-number">507</span><span class="source-line-text">                        cut = true</span></span>
<span class="source-line"><span class="source-line-number">508</span><span class="source-line-text">                        sink = createWriteStream(next, { flags: &quot;a&quot; })</span></span>
<span class="source-line"><span class="source-line-number">509</span><span class="source-line-text">                        full = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">510</span><span class="source-line-text">                      }),</span></span>
<span class="source-line"><span class="source-line-number">511</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">512</span><span class="source-line-text">                    Effect.andThen(</span></span>
<span class="source-line"><span class="source-line-number">513</span><span class="source-line-text">                      ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">514</span><span class="source-line-text">                        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">515</span><span class="source-line-text">                          output: last,</span></span>
<span class="source-line"><span class="source-line-number">516</span><span class="source-line-text">                          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">517</span><span class="source-line-text">                        },</span></span>
<span class="source-line"><span class="source-line-number">518</span><span class="source-line-text">                      }),</span></span>
<span class="source-line"><span class="source-line-number">519</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">520</span><span class="source-line-text">                  )</span></span>
<span class="source-line"><span class="source-line-number">521</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">522</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">523</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">524</span><span class="source-line-text">              return ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">525</span><span class="source-line-text">                metadata: {</span></span>
<span class="source-line"><span class="source-line-number">526</span><span class="source-line-text">                  output: last,</span></span>
<span class="source-line"><span class="source-line-number">527</span><span class="source-line-text">                  description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">528</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">529</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">530</span><span class="source-line-text">            }),</span></span></code></pre>
</details>

然后同时等待三件事：正常退出、用户 abort、超时。

```ts
const exit = yield* Effect.raceAll([
  handle.exitCode.pipe(Effect.map((code) => ({ kind: "exit" as const, code }))),
  abort.pipe(Effect.map(() => ({ kind: "abort" as const, code: null }))),
  timeout.pipe(Effect.map(() => ({ kind: "timeout" as const, code: null }))),
])

if (exit.kind === "abort") {
  aborted = true
  yield* handle.kill({ forceKillAfter: "3 seconds" }).pipe(Effect.orDie)
}
if (exit.kind === "timeout") {
  expired = true
  yield* handle.kill({ forceKillAfter: "3 seconds" }).pipe(Effect.orDie)
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:542-555</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">542</span><span class="source-line-text">          const exit = yield* Effect.raceAll([</span></span>
<span class="source-line"><span class="source-line-number">543</span><span class="source-line-text">            handle.exitCode.pipe(Effect.map((code) =&gt; ({ kind: &quot;exit&quot; as const, code }))),</span></span>
<span class="source-line"><span class="source-line-number">544</span><span class="source-line-text">            abort.pipe(Effect.map(() =&gt; ({ kind: &quot;abort&quot; as const, code: null }))),</span></span>
<span class="source-line"><span class="source-line-number">545</span><span class="source-line-text">            timeout.pipe(Effect.map(() =&gt; ({ kind: &quot;timeout&quot; as const, code: null }))),</span></span>
<span class="source-line"><span class="source-line-number">546</span><span class="source-line-text">          ])</span></span>
<span class="source-line"><span class="source-line-number">547</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">548</span><span class="source-line-text">          if (exit.kind === &quot;abort&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">549</span><span class="source-line-text">            aborted = true</span></span>
<span class="source-line"><span class="source-line-number">550</span><span class="source-line-text">            yield* handle.kill({ forceKillAfter: &quot;3 seconds&quot; }).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">551</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">552</span><span class="source-line-text">          if (exit.kind === &quot;timeout&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">553</span><span class="source-line-text">            expired = true</span></span>
<span class="source-line"><span class="source-line-number">554</span><span class="source-line-text">            yield* handle.kill({ forceKillAfter: &quot;3 seconds&quot; }).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">555</span><span class="source-line-text">          }</span></span></code></pre>
</details>

最后把输出尾部和 metadata 组成标准 tool result：

```ts
return {
  title: input.description,
  metadata: {
    output: last || preview(output),
    exit: code,
    description: input.description,
    truncated: cut,
    ...(cut && file ? { outputPath: file } : {}),
  },
  output,
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:585-595</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">585</span><span class="source-line-text">      return {</span></span>
<span class="source-line"><span class="source-line-number">586</span><span class="source-line-text">        title: input.description,</span></span>
<span class="source-line"><span class="source-line-number">587</span><span class="source-line-text">        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">588</span><span class="source-line-text">          output: last || preview(output),</span></span>
<span class="source-line"><span class="source-line-number">589</span><span class="source-line-text">          exit: code,</span></span>
<span class="source-line"><span class="source-line-number">590</span><span class="source-line-text">          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">591</span><span class="source-line-text">          truncated: cut,</span></span>
<span class="source-line"><span class="source-line-number">592</span><span class="source-line-text">          ...(cut &amp;&amp; file ? { outputPath: file } : {}),</span></span>
<span class="source-line"><span class="source-line-number">593</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">594</span><span class="source-line-text">        output,</span></span>
<span class="source-line"><span class="source-line-number">595</span><span class="source-line-text">      }</span></span></code></pre>
</details>

这就是 shell result 回到 agent loop 的内容。下一轮 LLM 会看到 tool output，而 UI 可以根据 metadata 展示进行中输出。

## 7. 核心源码逐段讲解

### 7.1 命令风险词表和 Scan 类型

```ts
const CWD = new Set(["cd", "chdir", "popd", "pushd", "push-location", "set-location"])
const FILES = new Set([
  ...CWD,
  "rm",
  "cp",
  "mv",
  "mkdir",
  "touch",
  "chmod",
  "chown",
  "cat",
  "get-content",
  "set-content",
  "add-content",
  "copy-item",
  "move-item",
  "remove-item",
  "new-item",
  "rename-item",
])

type Scan = {
  dirs: Set<string>
  patterns: Set<string>
  always: Set<string>
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:28-78</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">const MAX_METADATA_LENGTH = 30_000</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">const CWD = new Set([&quot;cd&quot;, &quot;chdir&quot;, &quot;popd&quot;, &quot;pushd&quot;, &quot;push-location&quot;, &quot;set-location&quot;])</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">const FILES = new Set([</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">  ...CWD,</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">  &quot;rm&quot;,</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">  &quot;cp&quot;,</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">  &quot;mv&quot;,</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">  &quot;mkdir&quot;,</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  &quot;touch&quot;,</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">  &quot;chmod&quot;,</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">  &quot;chown&quot;,</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  &quot;cat&quot;,</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  // Leave PowerShell aliases out for now. Common ones like cat/cp/mv/rm/mkdir</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">  // already hit the entries above, and alias normalization should happen in one</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  // place later so we do not risk double-prompting.</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  &quot;get-content&quot;,</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  &quot;set-content&quot;,</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">  &quot;add-content&quot;,</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">  &quot;copy-item&quot;,</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">  &quot;move-item&quot;,</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">  &quot;remove-item&quot;,</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">  &quot;new-item&quot;,</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">  &quot;rename-item&quot;,</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">])</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">const CMD_FILES = new Set([</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">  &quot;copy&quot;,</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">  &quot;del&quot;,</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">  &quot;dir&quot;,</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">  &quot;erase&quot;,</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">  &quot;md&quot;,</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">  &quot;mkdir&quot;,</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">  &quot;move&quot;,</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">  &quot;rd&quot;,</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">  &quot;ren&quot;,</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">  &quot;rename&quot;,</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">  &quot;rmdir&quot;,</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">  &quot;type&quot;,</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">])</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">const FLAGS = new Set([&quot;-destination&quot;, &quot;-literalpath&quot;, &quot;-path&quot;])</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">const SWITCHES = new Set([&quot;-confirm&quot;, &quot;-debug&quot;, &quot;-force&quot;, &quot;-nonewline&quot;, &quot;-recurse&quot;, &quot;-verbose&quot;, &quot;-whatif&quot;])</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">type Part = {</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">  type: string</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">  text: string</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">type Scan = {</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  dirs: Set&lt;string&gt;</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">  patterns: Set&lt;string&gt;</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">  always: Set&lt;string&gt;</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">}</span></span></code></pre>
</details>

`FILES` 表示这些命令参数可能是文件路径，需要被解析并检查是否在工作区外。`CWD` 表示只改变目录的命令，后面会避免把它当成普通 shell permission pattern。`Scan` 是预扫描结果：涉及外部目录、命令审批 pattern、以及可记住的 allow pattern。

Java 类比：这是一个 `CommandRiskScanner.Result` DTO，字段类型用 `Set<String>` 去重。

### 7.2 lazy parser：为什么 shell tool 不只正则解析

```ts
const parser = lazy(async () => {
  const { Parser } = await import("web-tree-sitter")
  const { default: treeWasm } = await import("web-tree-sitter/tree-sitter.wasm" as string, {
    with: { type: "wasm" },
  })
  await Parser.init({ locateFile() { return treePath } })
  const [bashLanguage, psLanguage] = await Promise.all([Language.load(bashPath), Language.load(psPath)])
  const bash = new Parser()
  bash.setLanguage(bashLanguage)
  const ps = new Parser()
  ps.setLanguage(psLanguage)
  return { bash, ps }
})
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:307-332</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">const parser = lazy(async () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">  const { Parser } = await import(&quot;web-tree-sitter&quot;)</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text">  const { default: treeWasm } = await import(&quot;web-tree-sitter/tree-sitter.wasm&quot; as string, {</span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text">    with: { type: &quot;wasm&quot; },</span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">  const treePath = resolveWasm(treeWasm)</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">  await Parser.init({</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text">    locateFile() {</span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">      return treePath</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text">  const { default: bashWasm } = await import(&quot;tree-sitter-bash/tree-sitter-bash.wasm&quot; as string, {</span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">    with: { type: &quot;wasm&quot; },</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">  const { default: psWasm } = await import(&quot;tree-sitter-powershell/tree-sitter-powershell.wasm&quot; as string, {</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">    with: { type: &quot;wasm&quot; },</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">  const bashPath = resolveWasm(bashWasm)</span></span>
<span class="source-line"><span class="source-line-number">325</span><span class="source-line-text">  const psPath = resolveWasm(psWasm)</span></span>
<span class="source-line"><span class="source-line-number">326</span><span class="source-line-text">  const [bashLanguage, psLanguage] = await Promise.all([Language.load(bashPath), Language.load(psPath)])</span></span>
<span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">  const bash = new Parser()</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">  bash.setLanguage(bashLanguage)</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">  const ps = new Parser()</span></span>
<span class="source-line"><span class="source-line-number">330</span><span class="source-line-text">  ps.setLanguage(psLanguage)</span></span>
<span class="source-line"><span class="source-line-number">331</span><span class="source-line-text">  return { bash, ps }</span></span>
<span class="source-line"><span class="source-line-number">332</span><span class="source-line-text">})</span></span></code></pre>
</details>

这里用 tree-sitter 的 bash/PowerShell grammar，是因为 shell 命令里有引号、变量、管道、子命令、转义字符，靠字符串 split 很容易错。`lazy` 的意义是第一次用到 shell tool 时才加载 wasm parser。

不确定点：本章没有继续展开 `commands`、`parts`、`pathArgs` 等 helper 的完整 AST 遍历细节；如果后续要写“命令安全扫描”专题，需要继续追踪 `packages/opencode/src/tool/shell.ts` 中这些 helper 的实现。

### 7.3 collect：把 AST 变成审批对象

```ts
const collect = Effect.fn("ShellTool.collect")(function* (
  root: Node,
  cwd: string,
  ps: boolean,
  shell: string,
  instance: InstanceContext,
) {
  const scan: Scan = {
    dirs: new Set<string>(),
    patterns: new Set<string>(),
    always: new Set<string>(),
  }
  const shellKind = ShellID.toKind(Shell.name(shell))

  for (const node of commands(root)) {
    const command = parts(node)
    const tokens = command.map((item) => item.text)
    const cmd = ps || shellKind === "cmd" ? tokens[0]?.toLowerCase() : tokens[0]

    if (cmd && (FILES.has(cmd) || (shellKind === "cmd" && CMD_FILES.has(cmd)))) {
      for (const arg of pathArgs(command, ps, shellKind === "cmd")) {
        const resolved = yield* argPath(arg, cwd, ps, shell)
        if (!resolved || containsPath(resolved, instance)) continue
        const dir = (yield* fs.isDir(resolved)) ? resolved : path.dirname(resolved)
        scan.dirs.add(dir)
      }
    }

    if (tokens.length && (!cmd || !CWD.has(cmd))) {
      scan.patterns.add(source(node))
      scan.always.add(BashArity.prefix(tokens).join(" ") + " *")
    }
  }

  return scan
})
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:374-410</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">374</span><span class="source-line-text">    const collect = Effect.fn(&quot;ShellTool.collect&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">375</span><span class="source-line-text">      root: Node,</span></span>
<span class="source-line"><span class="source-line-number">376</span><span class="source-line-text">      cwd: string,</span></span>
<span class="source-line"><span class="source-line-number">377</span><span class="source-line-text">      ps: boolean,</span></span>
<span class="source-line"><span class="source-line-number">378</span><span class="source-line-text">      shell: string,</span></span>
<span class="source-line"><span class="source-line-number">379</span><span class="source-line-text">      instance: InstanceContext,</span></span>
<span class="source-line"><span class="source-line-number">380</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">381</span><span class="source-line-text">      const scan: Scan = {</span></span>
<span class="source-line"><span class="source-line-number">382</span><span class="source-line-text">        dirs: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">383</span><span class="source-line-text">        patterns: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">384</span><span class="source-line-text">        always: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">385</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">386</span><span class="source-line-text">      const shellKind = ShellID.toKind(Shell.name(shell))</span></span>
<span class="source-line"><span class="source-line-number">387</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">388</span><span class="source-line-text">      for (const node of commands(root)) {</span></span>
<span class="source-line"><span class="source-line-number">389</span><span class="source-line-text">        const command = parts(node)</span></span>
<span class="source-line"><span class="source-line-number">390</span><span class="source-line-text">        const tokens = command.map((item) =&gt; item.text)</span></span>
<span class="source-line"><span class="source-line-number">391</span><span class="source-line-text">        const cmd = ps || shellKind === &quot;cmd&quot; ? tokens[0]?.toLowerCase() : tokens[0]</span></span>
<span class="source-line"><span class="source-line-number">392</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">393</span><span class="source-line-text">        if (cmd &amp;&amp; (FILES.has(cmd) || (shellKind === &quot;cmd&quot; &amp;&amp; CMD_FILES.has(cmd)))) {</span></span>
<span class="source-line"><span class="source-line-number">394</span><span class="source-line-text">          for (const arg of pathArgs(command, ps, shellKind === &quot;cmd&quot;)) {</span></span>
<span class="source-line"><span class="source-line-number">395</span><span class="source-line-text">            const resolved = yield* argPath(arg, cwd, ps, shell)</span></span>
<span class="source-line"><span class="source-line-number">396</span><span class="source-line-text">            log.info(&quot;resolved path&quot;, { arg, resolved })</span></span>
<span class="source-line"><span class="source-line-number">397</span><span class="source-line-text">            if (!resolved || containsPath(resolved, instance)) continue</span></span>
<span class="source-line"><span class="source-line-number">398</span><span class="source-line-text">            const dir = (yield* fs.isDir(resolved)) ? resolved : path.dirname(resolved)</span></span>
<span class="source-line"><span class="source-line-number">399</span><span class="source-line-text">            scan.dirs.add(dir)</span></span>
<span class="source-line"><span class="source-line-number">400</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">401</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">402</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">403</span><span class="source-line-text">        if (tokens.length &amp;&amp; (!cmd || !CWD.has(cmd))) {</span></span>
<span class="source-line"><span class="source-line-number">404</span><span class="source-line-text">          scan.patterns.add(source(node))</span></span>
<span class="source-line"><span class="source-line-number">405</span><span class="source-line-text">          scan.always.add(BashArity.prefix(tokens).join(&quot; &quot;) + &quot; *&quot;)</span></span>
<span class="source-line"><span class="source-line-number">406</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">407</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">408</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">409</span><span class="source-line-text">      return scan</span></span>
<span class="source-line"><span class="source-line-number">410</span><span class="source-line-text">    })</span></span></code></pre>
</details>

这段是 shell 安全的中心：

- 对文件相关命令，解析参数路径。
- 如果路径不在当前 instance/worktree 内，加入 `scan.dirs`。
- 对非 `cd` 类命令，加入 `scan.patterns`，用于 shell permission。
- `BashArity.prefix(tokens).join(" ") + " *"` 用来生成可复用的 allow pattern。

Java 类比：一个 `CommandAuthorizationPreprocessor`，输入 AST，输出 permission request。

### 7.4 shell.env 插件 hook

```ts
const shellEnv = Effect.fn("ShellTool.shellEnv")(function* (ctx: Tool.Context, cwd: string) {
  const extra = yield* plugin.trigger(
    "shell.env",
    { cwd, sessionID: ctx.sessionID, callID: ctx.callID },
    { env: {} },
  )
  return {
    ...process.env,
    ...extra.env,
  }
})
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:412-422</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">412</span><span class="source-line-text">    const shellEnv = Effect.fn(&quot;ShellTool.shellEnv&quot;)(function* (ctx: Tool.Context, cwd: string) {</span></span>
<span class="source-line"><span class="source-line-number">413</span><span class="source-line-text">      const extra = yield* plugin.trigger(</span></span>
<span class="source-line"><span class="source-line-number">414</span><span class="source-line-text">        &quot;shell.env&quot;,</span></span>
<span class="source-line"><span class="source-line-number">415</span><span class="source-line-text">        { cwd, sessionID: ctx.sessionID, callID: ctx.callID },</span></span>
<span class="source-line"><span class="source-line-number">416</span><span class="source-line-text">        { env: {} },</span></span>
<span class="source-line"><span class="source-line-number">417</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">418</span><span class="source-line-text">      return {</span></span>
<span class="source-line"><span class="source-line-number">419</span><span class="source-line-text">        ...process.env,</span></span>
<span class="source-line"><span class="source-line-number">420</span><span class="source-line-text">        ...extra.env,</span></span>
<span class="source-line"><span class="source-line-number">421</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">422</span><span class="source-line-text">    })</span></span></code></pre>
</details>

Shell 执行环境不是固定的。插件可以通过 `shell.env` hook 注入环境变量。对于 Java 开发者，可以类比 Spring Boot 里某个 `EnvironmentPostProcessor`，但这里是按每次 shell call 触发。

### 7.5 direct shell：用户手动执行命令的路径

`SessionPrompt.shellImpl` 不是模型 tool call，而是用户直接发起 shell 命令时的 session 记录路径。

```ts
const userMsg: MessageV2.User = {
  id: input.messageID ?? MessageID.ascending(),
  sessionID: input.sessionID,
  time: { created: Date.now() },
  role: "user",
  agent: input.agent,
  model: { providerID: model.providerID, modelID: model.modelID },
}
yield* sessions.updateMessage(userMsg)
const userPart: MessageV2.Part = {
  type: "text",
  id: PartID.ascending(),
  messageID: userMsg.id,
  sessionID: input.sessionID,
  text: "The following tool was executed by the user",
  synthetic: true,
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:511-528</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">511</span><span class="source-line-text">            const userMsg: MessageV2.User = {</span></span>
<span class="source-line"><span class="source-line-number">512</span><span class="source-line-text">              id: input.messageID ?? MessageID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">513</span><span class="source-line-text">              sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">514</span><span class="source-line-text">              time: { created: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">515</span><span class="source-line-text">              role: &quot;user&quot;,</span></span>
<span class="source-line"><span class="source-line-number">516</span><span class="source-line-text">              agent: input.agent,</span></span>
<span class="source-line"><span class="source-line-number">517</span><span class="source-line-text">              model: { providerID: model.providerID, modelID: model.modelID },</span></span>
<span class="source-line"><span class="source-line-number">518</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">519</span><span class="source-line-text">            yield* sessions.updateMessage(userMsg)</span></span>
<span class="source-line"><span class="source-line-number">520</span><span class="source-line-text">            const userPart: MessageV2.Part = {</span></span>
<span class="source-line"><span class="source-line-number">521</span><span class="source-line-text">              type: &quot;text&quot;,</span></span>
<span class="source-line"><span class="source-line-number">522</span><span class="source-line-text">              id: PartID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">523</span><span class="source-line-text">              messageID: userMsg.id,</span></span>
<span class="source-line"><span class="source-line-number">524</span><span class="source-line-text">              sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">525</span><span class="source-line-text">              text: &quot;The following tool was executed by the user&quot;,</span></span>
<span class="source-line"><span class="source-line-number">526</span><span class="source-line-text">              synthetic: true,</span></span>
<span class="source-line"><span class="source-line-number">527</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">528</span><span class="source-line-text">            yield* sessions.updatePart(userPart)</span></span></code></pre>
</details>

然后它创建 assistant message 和一个 running shell tool part：

```ts
const part: MessageV2.ToolPart = {
  type: "tool",
  id: PartID.ascending(),
  messageID: msg.id,
  sessionID: input.sessionID,
  tool: ShellID.ToolID,
  callID: ulid(),
  state: {
    status: "running",
    time: { start: started },
    input: { command: input.command },
  },
}
yield* sessions.updatePart(part)
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:546-559</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">546</span><span class="source-line-text">            const part: MessageV2.ToolPart = {</span></span>
<span class="source-line"><span class="source-line-number">547</span><span class="source-line-text">              type: &quot;tool&quot;,</span></span>
<span class="source-line"><span class="source-line-number">548</span><span class="source-line-text">              id: PartID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">549</span><span class="source-line-text">              messageID: msg.id,</span></span>
<span class="source-line"><span class="source-line-number">550</span><span class="source-line-text">              sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">551</span><span class="source-line-text">              tool: ShellID.ToolID,</span></span>
<span class="source-line"><span class="source-line-number">552</span><span class="source-line-text">              callID: ulid(),</span></span>
<span class="source-line"><span class="source-line-number">553</span><span class="source-line-text">              state: {</span></span>
<span class="source-line"><span class="source-line-number">554</span><span class="source-line-text">                status: &quot;running&quot;,</span></span>
<span class="source-line"><span class="source-line-number">555</span><span class="source-line-text">                time: { start: started },</span></span>
<span class="source-line"><span class="source-line-number">556</span><span class="source-line-text">                input: { command: input.command },</span></span>
<span class="source-line"><span class="source-line-number">557</span><span class="source-line-text">              },</span></span>
<span class="source-line"><span class="source-line-number">558</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">559</span><span class="source-line-text">            yield* sessions.updatePart(part)</span></span></code></pre>
</details>

这条路径的特点：它把“用户执行过命令”也写进 session history，这样后续 agent 可以看到上下文。它不经过模型的 tool call 决策，但仍使用 message/part 模型。

### 7.6 SessionRunState：避免同一 session 并发乱跑

```ts
export interface Interface {
  readonly assertNotBusy: (sessionID: SessionID) => Effect.Effect<void, Session.BusyError>
  readonly cancel: (sessionID: SessionID) => Effect.Effect<void>
  readonly ensureRunning: (
    sessionID: SessionID,
    onInterrupt: Effect.Effect<MessageV2.WithParts>,
    work: Effect.Effect<MessageV2.WithParts>,
  ) => Effect.Effect<MessageV2.WithParts>
  readonly startShell: (
    sessionID: SessionID,
    onInterrupt: Effect.Effect<MessageV2.WithParts>,
    work: Effect.Effect<MessageV2.WithParts>,
    ready?: Latch.Latch,
  ) => Effect.Effect<MessageV2.WithParts, Session.BusyError>
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/run-state.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/run-state.ts:10-24</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">export interface Interface {</span></span>
<span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">  readonly assertNotBusy: (sessionID: SessionID) =&gt; Effect.Effect&lt;void, Session.BusyError&gt;</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">  readonly cancel: (sessionID: SessionID) =&gt; Effect.Effect&lt;void&gt;</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">  readonly ensureRunning: (</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">    sessionID: SessionID,</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    onInterrupt: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    work: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  ) =&gt; Effect.Effect&lt;MessageV2.WithParts&gt;</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">  readonly startShell: (</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    sessionID: SessionID,</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    onInterrupt: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">    work: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">    ready?: Latch.Latch,</span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  ) =&gt; Effect.Effect&lt;MessageV2.WithParts, Session.BusyError&gt;</span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">}</span></span></code></pre>
</details>

实现里用 `runners: Map<SessionID, Runner.Runner<MessageV2.WithParts>>` 管理每个 session 的运行状态；`startShell` 如果 RunnerBusy 会转成 session busy error。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/run-state.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/run-state.ts:34-67</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">    const state = yield* InstanceState.make(</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">      Effect.fn(&quot;SessionRunState.state&quot;)(function* () {</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">        const scope = yield* Scope.Scope</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">        const runners = new Map&lt;SessionID, Runner.Runner&lt;MessageV2.WithParts&gt;&gt;()</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">        yield* Effect.addFinalizer(</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">          Effect.fnUntraced(function* () {</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">            yield* Effect.forEach(runners.values(), (runner) =&gt; runner.cancel, {</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">              concurrency: &quot;unbounded&quot;,</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">              discard: true,</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">            runners.clear()</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">          }),</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">        )</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">        return { runners, scope }</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">      }),</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">    const runner = Effect.fn(&quot;SessionRunState.runner&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">      sessionID: SessionID,</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">      onInterrupt: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">      const data = yield* InstanceState.get(state)</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">      const existing = data.runners.get(sessionID)</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">      if (existing) return existing</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">      const next = Runner.make&lt;MessageV2.WithParts&gt;(data.scope, {</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">        onIdle: Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">          data.runners.delete(sessionID)</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">          yield* status.set(sessionID, { type: &quot;idle&quot; })</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">        onBusy: status.set(sessionID, { type: &quot;busy&quot; }),</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">        onInterrupt,</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">      data.runners.set(sessionID, next)</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">      return next</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/run-state.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/run-state.ts:95-104</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">    const startShell = Effect.fn(&quot;SessionRunState.startShell&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">      sessionID: SessionID,</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">      onInterrupt: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">      work: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">      ready?: Latch.Latch,</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">      return yield* (yield* runner(sessionID, onInterrupt))</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">        .startShell(work, ready)</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">        .pipe(Effect.catchTag(&quot;RunnerBusy&quot;, () =&gt; Effect.fail(busyError(sessionID))))</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">    })</span></span></code></pre>
</details>。

Java 类比：`ConcurrentHashMap<SessionId, SessionRunner>` + per-session lock，避免同一个会话同时跑 agent loop 和 shell 修改同一份状态。

## 8. 关键 TypeScript 语法复习

### Set 和 object literal

```ts
const scan: Scan = {
  dirs: new Set<string>(),
  patterns: new Set<string>(),
  always: new Set<string>(),
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:381-385</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">381</span><span class="source-line-text">      const scan: Scan = {</span></span>
<span class="source-line"><span class="source-line-number">382</span><span class="source-line-text">        dirs: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">383</span><span class="source-line-text">        patterns: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">384</span><span class="source-line-text">        always: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">385</span><span class="source-line-text">      }</span></span></code></pre>
</details>

Java 类比：`new Scan(new HashSet<>(), new HashSet<>(), new HashSet<>())`。TS 更常用对象字面量，不一定创建 class。

### literal type 和 discriminated union

```ts
handle.exitCode.pipe(Effect.map((code) => ({ kind: "exit" as const, code })))
abort.pipe(Effect.map(() => ({ kind: "abort" as const, code: null })))
timeout.pipe(Effect.map(() => ({ kind: "timeout" as const, code: null })))
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:542-546</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">542</span><span class="source-line-text">          const exit = yield* Effect.raceAll([</span></span>
<span class="source-line"><span class="source-line-number">543</span><span class="source-line-text">            handle.exitCode.pipe(Effect.map((code) =&gt; ({ kind: &quot;exit&quot; as const, code }))),</span></span>
<span class="source-line"><span class="source-line-number">544</span><span class="source-line-text">            abort.pipe(Effect.map(() =&gt; ({ kind: &quot;abort&quot; as const, code: null }))),</span></span>
<span class="source-line"><span class="source-line-number">545</span><span class="source-line-text">            timeout.pipe(Effect.map(() =&gt; ({ kind: &quot;timeout&quot; as const, code: null }))),</span></span>
<span class="source-line"><span class="source-line-number">546</span><span class="source-line-text">          ])</span></span></code></pre>
</details>

`as const` 把 `"exit"` 收窄为字面量类型，这样后面 `if (exit.kind === "abort")` 时 TS 能准确知道分支类型。Java 类比 sealed interface：

```java
sealed interface Exit permits NormalExit, AbortExit, TimeoutExit {}
```

### optional property 和默认值

```ts
const timeout = params.timeout ?? defaultTimeout
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:619</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">619</span><span class="source-line-text">              const timeout = params.timeout ?? defaultTimeout</span></span></code></pre>
</details>

`??` 只在 `null` 或 `undefined` 时使用默认值。Java 类比 `timeout != null ? timeout : defaultTimeout`。

### async dynamic import

```ts
const { Parser } = await import("web-tree-sitter")
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:307-308</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">const parser = lazy(async () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">  const { Parser } = await import(&quot;web-tree-sitter&quot;)</span></span></code></pre>
</details>

这是运行时动态加载模块，不是 Java 的静态 import；更像 `ClassLoader` 或延迟初始化某个重依赖。

### Effect.acquireRelease

```ts
const tree = yield* Effect.acquireRelease(parse(params.command, ps), (tree) =>
  Effect.sync(() => tree.delete()),
)
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:623-625</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">623</span><span class="source-line-text">                  const tree = yield* Effect.acquireRelease(parse(params.command, ps), (tree) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">624</span><span class="source-line-text">                    Effect.sync(() =&gt; tree.delete()),</span></span>
<span class="source-line"><span class="source-line-number">625</span><span class="source-line-text">                  )</span></span></code></pre>
</details>

Java 类比 `try (Tree tree = parser.parse(command)) { ... }`。它把资源申请和释放绑定在 Effect scope 里。

### Rest/spread object

```ts
return {
  ...process.env,
  ...extra.env,
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:418-421</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">418</span><span class="source-line-text">      return {</span></span>
<span class="source-line"><span class="source-line-number">419</span><span class="source-line-text">        ...process.env,</span></span>
<span class="source-line"><span class="source-line-number">420</span><span class="source-line-text">        ...extra.env,</span></span>
<span class="source-line"><span class="source-line-number">421</span><span class="source-line-text">      }</span></span></code></pre>
</details>

后面的 `extra.env` 会覆盖前面的同名环境变量。Java 类比先 `putAll(System.getenv())`，再 `putAll(extraEnv)`。

## 9. 涉及的设计模式和架构思想

- **Strategy**：`ShellTool` 是 `Tool.Def` 的一个具体策略。
- **Preflight scanner**：`collect` 先扫描命令，避免执行时才发现风险。
- **Policy enforcement point**：`ctx.ask` 是工具层的统一权限入口。
- **Adapter**：`cmd` 把不同平台 shell 差异适配成 `ChildProcess.make`。
- **Streaming progress update**：进程输出不是最后一次性写入，而是持续更新 metadata。
- **Resource scope**：parser tree、child process、output sink 都在 Effect scope 中管理。
- **Backpressure by truncation**：输出过长时保留文件，只回传摘要，防止污染上下文窗口。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

- 和 Tool：`ShellTool` 通过 `Tool.define` 注册，执行函数签名是 `execute(params, ctx)`。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:334-645</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">export const ShellTool = Tool.define(</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">  ShellID.ToolID,</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">  Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text">    const config = yield* Config.Service</span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">    const spawner = yield* ChildProcessSpawner</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text">    const fs = yield* AppFileSystem.Service</span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">    const trunc = yield* Truncate.Service</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">    const plugin = yield* Plugin.Service</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text">    const flags = yield* RuntimeFlags.Service</span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">    const defaultTimeout = flags.bashDefaultTimeoutMs ?? 2 * 60 * 1000</span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">    const cygpath = Effect.fn(&quot;ShellTool.cygpath&quot;)(function* (shell: string, text: string) {</span></span>
<span class="source-line"><span class="source-line-number">346</span><span class="source-line-text">      const lines = yield* spawner</span></span>
<span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">        .lines(ChildProcess.make(shell, [&quot;-lc&quot;, 'cygpath -w -- &quot;$1&quot;', &quot;_&quot;, text]))</span></span>
<span class="source-line"><span class="source-line-number">348</span><span class="source-line-text">        .pipe(Effect.catch(() =&gt; Effect.succeed([] as string[])))</span></span>
<span class="source-line"><span class="source-line-number">349</span><span class="source-line-text">      const file = lines[0]?.trim()</span></span>
<span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">      if (!file) return</span></span>
<span class="source-line"><span class="source-line-number">351</span><span class="source-line-text">      return AppFileSystem.normalizePath(file)</span></span>
<span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">353</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">    const resolvePath = Effect.fn(&quot;ShellTool.resolvePath&quot;)(function* (text: string, root: string, shell: string) {</span></span>
<span class="source-line"><span class="source-line-number">355</span><span class="source-line-text">      if (process.platform === &quot;win32&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">356</span><span class="source-line-text">        if (Shell.posix(shell) &amp;&amp; text.startsWith(&quot;/&quot;) &amp;&amp; AppFileSystem.windowsPath(text) === text) {</span></span>
<span class="source-line"><span class="source-line-number">357</span><span class="source-line-text">          const file = yield* cygpath(shell, text)</span></span>
<span class="source-line"><span class="source-line-number">358</span><span class="source-line-text">          if (file) return file</span></span>
<span class="source-line"><span class="source-line-number">359</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">360</span><span class="source-line-text">        return AppFileSystem.normalizePath(path.resolve(root, AppFileSystem.windowsPath(text)))</span></span>
<span class="source-line"><span class="source-line-number">361</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">362</span><span class="source-line-text">      return path.resolve(root, text)</span></span>
<span class="source-line"><span class="source-line-number">363</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">364</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">365</span><span class="source-line-text">    const argPath = Effect.fn(&quot;ShellTool.argPath&quot;)(function* (arg: string, cwd: string, ps: boolean, shell: string) {</span></span>
<span class="source-line"><span class="source-line-number">366</span><span class="source-line-text">      const text = ps ? expand(arg, cwd, shell) : home(unquote(arg))</span></span>
<span class="source-line"><span class="source-line-number">367</span><span class="source-line-text">      const file = text &amp;&amp; prefix(text)</span></span>
<span class="source-line"><span class="source-line-number">368</span><span class="source-line-text">      if (!file || dynamic(file, ps)) return</span></span>
<span class="source-line"><span class="source-line-number">369</span><span class="source-line-text">      const next = ps ? provider(file) : file</span></span>
<span class="source-line"><span class="source-line-number">370</span><span class="source-line-text">      if (!next) return</span></span>
<span class="source-line"><span class="source-line-number">371</span><span class="source-line-text">      return yield* resolvePath(next, cwd, shell)</span></span>
<span class="source-line"><span class="source-line-number">372</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">373</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">374</span><span class="source-line-text">    const collect = Effect.fn(&quot;ShellTool.collect&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">375</span><span class="source-line-text">      root: Node,</span></span>
<span class="source-line"><span class="source-line-number">376</span><span class="source-line-text">      cwd: string,</span></span>
<span class="source-line"><span class="source-line-number">377</span><span class="source-line-text">      ps: boolean,</span></span>
<span class="source-line"><span class="source-line-number">378</span><span class="source-line-text">      shell: string,</span></span>
<span class="source-line"><span class="source-line-number">379</span><span class="source-line-text">      instance: InstanceContext,</span></span>
<span class="source-line"><span class="source-line-number">380</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">381</span><span class="source-line-text">      const scan: Scan = {</span></span>
<span class="source-line"><span class="source-line-number">382</span><span class="source-line-text">        dirs: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">383</span><span class="source-line-text">        patterns: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">384</span><span class="source-line-text">        always: new Set&lt;string&gt;(),</span></span>
<span class="source-line"><span class="source-line-number">385</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">386</span><span class="source-line-text">      const shellKind = ShellID.toKind(Shell.name(shell))</span></span>
<span class="source-line"><span class="source-line-number">387</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">388</span><span class="source-line-text">      for (const node of commands(root)) {</span></span>
<span class="source-line"><span class="source-line-number">389</span><span class="source-line-text">        const command = parts(node)</span></span>
<span class="source-line"><span class="source-line-number">390</span><span class="source-line-text">        const tokens = command.map((item) =&gt; item.text)</span></span>
<span class="source-line"><span class="source-line-number">391</span><span class="source-line-text">        const cmd = ps || shellKind === &quot;cmd&quot; ? tokens[0]?.toLowerCase() : tokens[0]</span></span>
<span class="source-line"><span class="source-line-number">392</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">393</span><span class="source-line-text">        if (cmd &amp;&amp; (FILES.has(cmd) || (shellKind === &quot;cmd&quot; &amp;&amp; CMD_FILES.has(cmd)))) {</span></span>
<span class="source-line"><span class="source-line-number">394</span><span class="source-line-text">          for (const arg of pathArgs(command, ps, shellKind === &quot;cmd&quot;)) {</span></span>
<span class="source-line"><span class="source-line-number">395</span><span class="source-line-text">            const resolved = yield* argPath(arg, cwd, ps, shell)</span></span>
<span class="source-line"><span class="source-line-number">396</span><span class="source-line-text">            log.info(&quot;resolved path&quot;, { arg, resolved })</span></span>
<span class="source-line"><span class="source-line-number">397</span><span class="source-line-text">            if (!resolved || containsPath(resolved, instance)) continue</span></span>
<span class="source-line"><span class="source-line-number">398</span><span class="source-line-text">            const dir = (yield* fs.isDir(resolved)) ? resolved : path.dirname(resolved)</span></span>
<span class="source-line"><span class="source-line-number">399</span><span class="source-line-text">            scan.dirs.add(dir)</span></span>
<span class="source-line"><span class="source-line-number">400</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">401</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">402</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">403</span><span class="source-line-text">        if (tokens.length &amp;&amp; (!cmd || !CWD.has(cmd))) {</span></span>
<span class="source-line"><span class="source-line-number">404</span><span class="source-line-text">          scan.patterns.add(source(node))</span></span>
<span class="source-line"><span class="source-line-number">405</span><span class="source-line-text">          scan.always.add(BashArity.prefix(tokens).join(&quot; &quot;) + &quot; *&quot;)</span></span>
<span class="source-line"><span class="source-line-number">406</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">407</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">408</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">409</span><span class="source-line-text">      return scan</span></span>
<span class="source-line"><span class="source-line-number">410</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">411</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">412</span><span class="source-line-text">    const shellEnv = Effect.fn(&quot;ShellTool.shellEnv&quot;)(function* (ctx: Tool.Context, cwd: string) {</span></span>
<span class="source-line"><span class="source-line-number">413</span><span class="source-line-text">      const extra = yield* plugin.trigger(</span></span>
<span class="source-line"><span class="source-line-number">414</span><span class="source-line-text">        &quot;shell.env&quot;,</span></span>
<span class="source-line"><span class="source-line-number">415</span><span class="source-line-text">        { cwd, sessionID: ctx.sessionID, callID: ctx.callID },</span></span>
<span class="source-line"><span class="source-line-number">416</span><span class="source-line-text">        { env: {} },</span></span>
<span class="source-line"><span class="source-line-number">417</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">418</span><span class="source-line-text">      return {</span></span>
<span class="source-line"><span class="source-line-number">419</span><span class="source-line-text">        ...process.env,</span></span>
<span class="source-line"><span class="source-line-number">420</span><span class="source-line-text">        ...extra.env,</span></span>
<span class="source-line"><span class="source-line-number">421</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">422</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">423</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">424</span><span class="source-line-text">    const run = Effect.fn(&quot;ShellTool.run&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">425</span><span class="source-line-text">      input: {</span></span>
<span class="source-line"><span class="source-line-number">426</span><span class="source-line-text">        shell: string</span></span>
<span class="source-line"><span class="source-line-number">427</span><span class="source-line-text">        command: string</span></span>
<span class="source-line"><span class="source-line-number">428</span><span class="source-line-text">        cwd: string</span></span>
<span class="source-line"><span class="source-line-number">429</span><span class="source-line-text">        env: NodeJS.ProcessEnv</span></span>
<span class="source-line"><span class="source-line-number">430</span><span class="source-line-text">        timeout: number</span></span>
<span class="source-line"><span class="source-line-number">431</span><span class="source-line-text">        description: string</span></span>
<span class="source-line"><span class="source-line-number">432</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">433</span><span class="source-line-text">      ctx: Tool.Context,</span></span>
<span class="source-line"><span class="source-line-number">434</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">435</span><span class="source-line-text">      const limits = yield* trunc.limits()</span></span>
<span class="source-line"><span class="source-line-number">436</span><span class="source-line-text">      const keep = limits.maxBytes * 2</span></span>
<span class="source-line"><span class="source-line-number">437</span><span class="source-line-text">      let full = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">438</span><span class="source-line-text">      let last = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">439</span><span class="source-line-text">      const list: Chunk[] = []</span></span>
<span class="source-line"><span class="source-line-number">440</span><span class="source-line-text">      let used = 0</span></span>
<span class="source-line"><span class="source-line-number">441</span><span class="source-line-text">      let file = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">442</span><span class="source-line-text">      let sink: ReturnType&lt;typeof createWriteStream&gt; | undefined</span></span>
<span class="source-line"><span class="source-line-number">443</span><span class="source-line-text">      let cut = false</span></span>
<span class="source-line"><span class="source-line-number">444</span><span class="source-line-text">      let expired = false</span></span>
<span class="source-line"><span class="source-line-number">445</span><span class="source-line-text">      let aborted = false</span></span>
<span class="source-line"><span class="source-line-number">446</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">447</span><span class="source-line-text">      const closeSink = Effect.fnUntraced(function* () {</span></span>
<span class="source-line"><span class="source-line-number">448</span><span class="source-line-text">        const stream = sink</span></span>
<span class="source-line"><span class="source-line-number">449</span><span class="source-line-text">        if (!stream) return</span></span>
<span class="source-line"><span class="source-line-number">450</span><span class="source-line-text">        sink = undefined</span></span>
<span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">        if (stream.destroyed || stream.closed) return</span></span>
<span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">        yield* Effect.promise(</span></span>
<span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">          () =&gt;</span></span>
<span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">            new Promise&lt;void&gt;((resolve) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">              let settled = false</span></span>
<span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">              const done = () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">457</span><span class="source-line-text">                if (settled) return</span></span>
<span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">                settled = true</span></span>
<span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">                stream.off(&quot;close&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">                stream.off(&quot;error&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">                stream.off(&quot;finish&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">                resolve()</span></span>
<span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">              stream.once(&quot;close&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">              stream.once(&quot;error&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">              stream.once(&quot;finish&quot;, done)</span></span>
<span class="source-line"><span class="source-line-number">467</span><span class="source-line-text">              stream.end(done)</span></span>
<span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">            }),</span></span>
<span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">        ).pipe(Effect.catch(() =&gt; Effect.void))</span></span>
<span class="source-line"><span class="source-line-number">470</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">471</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">      yield* ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">474</span><span class="source-line-text">          output: &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">478</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">479</span><span class="source-line-text">      const code: number | null = yield* Effect.scoped(</span></span>
<span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">        Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">481</span><span class="source-line-text">          yield* Effect.addFinalizer(closeSink)</span></span>
<span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">          const handle = yield* spawner.spawn(cmd(input.shell, input.command, input.cwd, input.env))</span></span>
<span class="source-line"><span class="source-line-number">483</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">          yield* Effect.forkScoped(</span></span>
<span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">            Stream.runForEach(Stream.decodeText(handle.all), (chunk) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">              const size = Buffer.byteLength(chunk, &quot;utf-8&quot;)</span></span>
<span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">              list.push({ text: chunk, size })</span></span>
<span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">              used += size</span></span>
<span class="source-line"><span class="source-line-number">489</span><span class="source-line-text">              while (used &gt; keep &amp;&amp; list.length &gt; 1) {</span></span>
<span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">                const item = list.shift()</span></span>
<span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">                if (!item) break</span></span>
<span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">                used -= item.size</span></span>
<span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">                cut = true</span></span>
<span class="source-line"><span class="source-line-number">494</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">495</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">496</span><span class="source-line-text">              last = preview(last + chunk)</span></span>
<span class="source-line"><span class="source-line-number">497</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">498</span><span class="source-line-text">              if (file) {</span></span>
<span class="source-line"><span class="source-line-number">499</span><span class="source-line-text">                sink?.write(chunk)</span></span>
<span class="source-line"><span class="source-line-number">500</span><span class="source-line-text">              } else {</span></span>
<span class="source-line"><span class="source-line-number">501</span><span class="source-line-text">                full += chunk</span></span>
<span class="source-line"><span class="source-line-number">502</span><span class="source-line-text">                if (Buffer.byteLength(full, &quot;utf-8&quot;) &gt; limits.maxBytes) {</span></span>
<span class="source-line"><span class="source-line-number">503</span><span class="source-line-text">                  return trunc.write(full).pipe(</span></span>
<span class="source-line"><span class="source-line-number">504</span><span class="source-line-text">                    Effect.andThen((next) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">505</span><span class="source-line-text">                      Effect.sync(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">506</span><span class="source-line-text">                        file = next</span></span>
<span class="source-line"><span class="source-line-number">507</span><span class="source-line-text">                        cut = true</span></span>
<span class="source-line"><span class="source-line-number">508</span><span class="source-line-text">                        sink = createWriteStream(next, { flags: &quot;a&quot; })</span></span>
<span class="source-line"><span class="source-line-number">509</span><span class="source-line-text">                        full = &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">510</span><span class="source-line-text">                      }),</span></span>
<span class="source-line"><span class="source-line-number">511</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">512</span><span class="source-line-text">                    Effect.andThen(</span></span>
<span class="source-line"><span class="source-line-number">513</span><span class="source-line-text">                      ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">514</span><span class="source-line-text">                        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">515</span><span class="source-line-text">                          output: last,</span></span>
<span class="source-line"><span class="source-line-number">516</span><span class="source-line-text">                          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">517</span><span class="source-line-text">                        },</span></span>
<span class="source-line"><span class="source-line-number">518</span><span class="source-line-text">                      }),</span></span>
<span class="source-line"><span class="source-line-number">519</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">520</span><span class="source-line-text">                  )</span></span>
<span class="source-line"><span class="source-line-number">521</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">522</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">523</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">524</span><span class="source-line-text">              return ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">525</span><span class="source-line-text">                metadata: {</span></span>
<span class="source-line"><span class="source-line-number">526</span><span class="source-line-text">                  output: last,</span></span>
<span class="source-line"><span class="source-line-number">527</span><span class="source-line-text">                  description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">528</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">529</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">530</span><span class="source-line-text">            }),</span></span>
<span class="source-line"><span class="source-line-number">531</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">532</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">533</span><span class="source-line-text">          const abort = Effect.callback&lt;void&gt;((resume) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">534</span><span class="source-line-text">            if (ctx.abort.aborted) return resume(Effect.void)</span></span>
<span class="source-line"><span class="source-line-number">535</span><span class="source-line-text">            const handler = () =&gt; resume(Effect.void)</span></span>
<span class="source-line"><span class="source-line-number">536</span><span class="source-line-text">            ctx.abort.addEventListener(&quot;abort&quot;, handler, { once: true })</span></span>
<span class="source-line"><span class="source-line-number">537</span><span class="source-line-text">            return Effect.sync(() =&gt; ctx.abort.removeEventListener(&quot;abort&quot;, handler))</span></span>
<span class="source-line"><span class="source-line-number">538</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">539</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">540</span><span class="source-line-text">          const timeout = Effect.sleep(`${input.timeout + 100} millis`)</span></span>
<span class="source-line"><span class="source-line-number">541</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">542</span><span class="source-line-text">          const exit = yield* Effect.raceAll([</span></span>
<span class="source-line"><span class="source-line-number">543</span><span class="source-line-text">            handle.exitCode.pipe(Effect.map((code) =&gt; ({ kind: &quot;exit&quot; as const, code }))),</span></span>
<span class="source-line"><span class="source-line-number">544</span><span class="source-line-text">            abort.pipe(Effect.map(() =&gt; ({ kind: &quot;abort&quot; as const, code: null }))),</span></span>
<span class="source-line"><span class="source-line-number">545</span><span class="source-line-text">            timeout.pipe(Effect.map(() =&gt; ({ kind: &quot;timeout&quot; as const, code: null }))),</span></span>
<span class="source-line"><span class="source-line-number">546</span><span class="source-line-text">          ])</span></span>
<span class="source-line"><span class="source-line-number">547</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">548</span><span class="source-line-text">          if (exit.kind === &quot;abort&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">549</span><span class="source-line-text">            aborted = true</span></span>
<span class="source-line"><span class="source-line-number">550</span><span class="source-line-text">            yield* handle.kill({ forceKillAfter: &quot;3 seconds&quot; }).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">551</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">552</span><span class="source-line-text">          if (exit.kind === &quot;timeout&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">553</span><span class="source-line-text">            expired = true</span></span>
<span class="source-line"><span class="source-line-number">554</span><span class="source-line-text">            yield* handle.kill({ forceKillAfter: &quot;3 seconds&quot; }).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">555</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">556</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">557</span><span class="source-line-text">          return exit.kind === &quot;exit&quot; ? exit.code : null</span></span>
<span class="source-line"><span class="source-line-number">558</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">559</span><span class="source-line-text">      ).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">560</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">561</span><span class="source-line-text">      const meta: string[] = []</span></span>
<span class="source-line"><span class="source-line-number">562</span><span class="source-line-text">      if (expired) {</span></span>
<span class="source-line"><span class="source-line-number">563</span><span class="source-line-text">        meta.push(</span></span>
<span class="source-line"><span class="source-line-number">564</span><span class="source-line-text">          `shell tool terminated command after exceeding timeout ${input.timeout} ms. If this command is expected to take longer and is not waiting for interactive input, retry with a larger timeout value in milliseconds.`,</span></span>
<span class="source-line"><span class="source-line-number">565</span><span class="source-line-text">        )</span></span>
<span class="source-line"><span class="source-line-number">566</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">567</span><span class="source-line-text">      if (aborted) meta.push(&quot;User aborted the command&quot;)</span></span>
<span class="source-line"><span class="source-line-number">568</span><span class="source-line-text">      const raw = list.map((item) =&gt; item.text).join(&quot;&quot;)</span></span>
<span class="source-line"><span class="source-line-number">569</span><span class="source-line-text">      const end = tail(raw, limits.maxLines, limits.maxBytes)</span></span>
<span class="source-line"><span class="source-line-number">570</span><span class="source-line-text">      if (end.cut) cut = true</span></span>
<span class="source-line"><span class="source-line-number">571</span><span class="source-line-text">      if (!file &amp;&amp; end.cut) {</span></span>
<span class="source-line"><span class="source-line-number">572</span><span class="source-line-text">        file = yield* trunc.write(raw)</span></span>
<span class="source-line"><span class="source-line-number">573</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">574</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">575</span><span class="source-line-text">      let output = end.text</span></span>
<span class="source-line"><span class="source-line-number">576</span><span class="source-line-text">      if (!output) output = &quot;(no output)&quot;</span></span>
<span class="source-line"><span class="source-line-number">577</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">578</span><span class="source-line-text">      if (cut &amp;&amp; file) {</span></span>
<span class="source-line"><span class="source-line-number">579</span><span class="source-line-text">        output = `...output truncated...\n\nFull output saved to: ${file}\n\n` + output</span></span>
<span class="source-line"><span class="source-line-number">580</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">581</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">582</span><span class="source-line-text">      if (meta.length &gt; 0) {</span></span>
<span class="source-line"><span class="source-line-number">583</span><span class="source-line-text">        output += &quot;\n\n&lt;shell_metadata&gt;\n&quot; + meta.join(&quot;\n&quot;) + &quot;\n&lt;/shell_metadata&gt;&quot;</span></span>
<span class="source-line"><span class="source-line-number">584</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">585</span><span class="source-line-text">      return {</span></span>
<span class="source-line"><span class="source-line-number">586</span><span class="source-line-text">        title: input.description,</span></span>
<span class="source-line"><span class="source-line-number">587</span><span class="source-line-text">        metadata: {</span></span>
<span class="source-line"><span class="source-line-number">588</span><span class="source-line-text">          output: last || preview(output),</span></span>
<span class="source-line"><span class="source-line-number">589</span><span class="source-line-text">          exit: code,</span></span>
<span class="source-line"><span class="source-line-number">590</span><span class="source-line-text">          description: input.description,</span></span>
<span class="source-line"><span class="source-line-number">591</span><span class="source-line-text">          truncated: cut,</span></span>
<span class="source-line"><span class="source-line-number">592</span><span class="source-line-text">          ...(cut &amp;&amp; file ? { outputPath: file } : {}),</span></span>
<span class="source-line"><span class="source-line-number">593</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">594</span><span class="source-line-text">        output,</span></span>
<span class="source-line"><span class="source-line-number">595</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">596</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">597</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">598</span><span class="source-line-text">    return () =&gt;</span></span>
<span class="source-line"><span class="source-line-number">599</span><span class="source-line-text">      Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">600</span><span class="source-line-text">        const cfg = yield* config.get()</span></span>
<span class="source-line"><span class="source-line-number">601</span><span class="source-line-text">        const shell = Shell.acceptable(cfg.shell)</span></span>
<span class="source-line"><span class="source-line-number">602</span><span class="source-line-text">        const name = Shell.name(shell)</span></span>
<span class="source-line"><span class="source-line-number">603</span><span class="source-line-text">        const limits = yield* trunc.limits()</span></span>
<span class="source-line"><span class="source-line-number">604</span><span class="source-line-text">        const prompt = ShellPrompt.render(name, process.platform, limits)</span></span>
<span class="source-line"><span class="source-line-number">605</span><span class="source-line-text">        log.info(&quot;shell tool using shell&quot;, { shell })</span></span>
<span class="source-line"><span class="source-line-number">606</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">607</span><span class="source-line-text">        return {</span></span>
<span class="source-line"><span class="source-line-number">608</span><span class="source-line-text">          description: prompt.description,</span></span>
<span class="source-line"><span class="source-line-number">609</span><span class="source-line-text">          parameters: prompt.parameters,</span></span>
<span class="source-line"><span class="source-line-number">610</span><span class="source-line-text">          execute: (params: Parameters, ctx: Tool.Context) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">611</span><span class="source-line-text">            Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">612</span><span class="source-line-text">              const instanceCtx = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">613</span><span class="source-line-text">              const cwd = params.workdir</span></span>
<span class="source-line"><span class="source-line-number">614</span><span class="source-line-text">                ? yield* resolvePath(params.workdir, instanceCtx.directory, shell)</span></span>
<span class="source-line"><span class="source-line-number">615</span><span class="source-line-text">                : instanceCtx.directory</span></span>
<span class="source-line"><span class="source-line-number">616</span><span class="source-line-text">              if (params.timeout !== undefined &amp;&amp; params.timeout &lt; 0) {</span></span>
<span class="source-line"><span class="source-line-number">617</span><span class="source-line-text">                throw new Error(`Invalid timeout value: ${params.timeout}. Timeout must be a positive number.`)</span></span>
<span class="source-line"><span class="source-line-number">618</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">619</span><span class="source-line-text">              const timeout = params.timeout ?? defaultTimeout</span></span>
<span class="source-line"><span class="source-line-number">620</span><span class="source-line-text">              const ps = Shell.ps(shell)</span></span>
<span class="source-line"><span class="source-line-number">621</span><span class="source-line-text">              yield* Effect.scoped(</span></span>
<span class="source-line"><span class="source-line-number">622</span><span class="source-line-text">                Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">623</span><span class="source-line-text">                  const tree = yield* Effect.acquireRelease(parse(params.command, ps), (tree) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">624</span><span class="source-line-text">                    Effect.sync(() =&gt; tree.delete()),</span></span>
<span class="source-line"><span class="source-line-number">625</span><span class="source-line-text">                  )</span></span>
<span class="source-line"><span class="source-line-number">626</span><span class="source-line-text">                  const scan = yield* collect(tree.rootNode, cwd, ps, shell, instanceCtx)</span></span>
<span class="source-line"><span class="source-line-number">627</span><span class="source-line-text">                  if (!containsPath(cwd, instanceCtx)) scan.dirs.add(cwd)</span></span>
<span class="source-line"><span class="source-line-number">628</span><span class="source-line-text">                  yield* ask(ctx, scan)</span></span>
<span class="source-line"><span class="source-line-number">629</span><span class="source-line-text">                }),</span></span>
<span class="source-line"><span class="source-line-number">630</span><span class="source-line-text">              )</span></span>
<span class="source-line"><span class="source-line-number">631</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">632</span><span class="source-line-text">              return yield* run(</span></span>
<span class="source-line"><span class="source-line-number">633</span><span class="source-line-text">                {</span></span>
<span class="source-line"><span class="source-line-number">634</span><span class="source-line-text">                  shell,</span></span>
<span class="source-line"><span class="source-line-number">635</span><span class="source-line-text">                  command: params.command,</span></span>
<span class="source-line"><span class="source-line-number">636</span><span class="source-line-text">                  cwd,</span></span>
<span class="source-line"><span class="source-line-number">637</span><span class="source-line-text">                  env: yield* shellEnv(ctx, cwd),</span></span>
<span class="source-line"><span class="source-line-number">638</span><span class="source-line-text">                  timeout,</span></span>
<span class="source-line"><span class="source-line-number">639</span><span class="source-line-text">                  description: params.description,</span></span>
<span class="source-line"><span class="source-line-number">640</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">641</span><span class="source-line-text">                ctx,</span></span>
<span class="source-line"><span class="source-line-number">642</span><span class="source-line-text">              )</span></span>
<span class="source-line"><span class="source-line-number">643</span><span class="source-line-text">            }),</span></span>
<span class="source-line"><span class="source-line-number">644</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">645</span><span class="source-line-text">      })</span></span></code></pre>
</details>。
- 和 Provider：Provider 不直接执行 shell。Provider/LLM 只看到工具 schema，模型发出 tool call 后 runtime 执行。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:75-116</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  for (const item of yield* registry.tools({</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">    modelID: ModelID.make(input.model.api.id),</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">    providerID: input.model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">    agent: input.agent,</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">  })) {</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">    const schema = ProviderTransform.schema(input.model, ToolJsonSchema.fromTool(item))</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">    tools[item.id] = tool({</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">      description: item.description,</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">      inputSchema: jsonSchema(schema),</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">      execute(args, options) {</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">        return run.promise(</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">          Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">            const ctx = context(args, options)</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">            yield* plugin.trigger(</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">              &quot;tool.execute.before&quot;,</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">              { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID },</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">              { args },</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">            const result = yield* item.execute(args, ctx)</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">            const output = {</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">              ...result,</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">              attachments: result.attachments?.map((attachment) =&gt; ({</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">                ...attachment,</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">                id: PartID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">                sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">                messageID: input.processor.message.id,</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">              })),</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">            yield* plugin.trigger(</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">              &quot;tool.execute.after&quot;,</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">              { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID, args },</span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">              output,</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">            if (options.abortSignal?.aborted) {</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">              yield* input.processor.completeToolCall(options.toolCallId, output)</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">            return output</span></span>
<span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">          }),</span></span>
<span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">        )</span></span>
<span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">  }</span></span></code></pre>
</details>。
- 和 Session：执行中通过 `ctx.metadata` 更新 `ToolPart`；用户直接 shell 路径会手工创建 user/assistant message。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:511-559</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">511</span><span class="source-line-text">            const userMsg: MessageV2.User = {</span></span>
<span class="source-line"><span class="source-line-number">512</span><span class="source-line-text">              id: input.messageID ?? MessageID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">513</span><span class="source-line-text">              sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">514</span><span class="source-line-text">              time: { created: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">515</span><span class="source-line-text">              role: &quot;user&quot;,</span></span>
<span class="source-line"><span class="source-line-number">516</span><span class="source-line-text">              agent: input.agent,</span></span>
<span class="source-line"><span class="source-line-number">517</span><span class="source-line-text">              model: { providerID: model.providerID, modelID: model.modelID },</span></span>
<span class="source-line"><span class="source-line-number">518</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">519</span><span class="source-line-text">            yield* sessions.updateMessage(userMsg)</span></span>
<span class="source-line"><span class="source-line-number">520</span><span class="source-line-text">            const userPart: MessageV2.Part = {</span></span>
<span class="source-line"><span class="source-line-number">521</span><span class="source-line-text">              type: &quot;text&quot;,</span></span>
<span class="source-line"><span class="source-line-number">522</span><span class="source-line-text">              id: PartID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">523</span><span class="source-line-text">              messageID: userMsg.id,</span></span>
<span class="source-line"><span class="source-line-number">524</span><span class="source-line-text">              sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">525</span><span class="source-line-text">              text: &quot;The following tool was executed by the user&quot;,</span></span>
<span class="source-line"><span class="source-line-number">526</span><span class="source-line-text">              synthetic: true,</span></span>
<span class="source-line"><span class="source-line-number">527</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">528</span><span class="source-line-text">            yield* sessions.updatePart(userPart)</span></span>
<span class="source-line"><span class="source-line-number">529</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">530</span><span class="source-line-text">            const msg: MessageV2.Assistant = {</span></span>
<span class="source-line"><span class="source-line-number">531</span><span class="source-line-text">              id: MessageID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">532</span><span class="source-line-text">              sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">533</span><span class="source-line-text">              parentID: userMsg.id,</span></span>
<span class="source-line"><span class="source-line-number">534</span><span class="source-line-text">              mode: input.agent,</span></span>
<span class="source-line"><span class="source-line-number">535</span><span class="source-line-text">              agent: input.agent,</span></span>
<span class="source-line"><span class="source-line-number">536</span><span class="source-line-text">              cost: 0,</span></span>
<span class="source-line"><span class="source-line-number">537</span><span class="source-line-text">              path: { cwd: ctx.directory, root: ctx.worktree },</span></span>
<span class="source-line"><span class="source-line-number">538</span><span class="source-line-text">              time: { created: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">539</span><span class="source-line-text">              role: &quot;assistant&quot;,</span></span>
<span class="source-line"><span class="source-line-number">540</span><span class="source-line-text">              tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },</span></span>
<span class="source-line"><span class="source-line-number">541</span><span class="source-line-text">              modelID: model.modelID,</span></span>
<span class="source-line"><span class="source-line-number">542</span><span class="source-line-text">              providerID: model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">543</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">544</span><span class="source-line-text">            yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">545</span><span class="source-line-text">            const started = Date.now()</span></span>
<span class="source-line"><span class="source-line-number">546</span><span class="source-line-text">            const part: MessageV2.ToolPart = {</span></span>
<span class="source-line"><span class="source-line-number">547</span><span class="source-line-text">              type: &quot;tool&quot;,</span></span>
<span class="source-line"><span class="source-line-number">548</span><span class="source-line-text">              id: PartID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">549</span><span class="source-line-text">              messageID: msg.id,</span></span>
<span class="source-line"><span class="source-line-number">550</span><span class="source-line-text">              sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">551</span><span class="source-line-text">              tool: ShellID.ToolID,</span></span>
<span class="source-line"><span class="source-line-number">552</span><span class="source-line-text">              callID: ulid(),</span></span>
<span class="source-line"><span class="source-line-number">553</span><span class="source-line-text">              state: {</span></span>
<span class="source-line"><span class="source-line-number">554</span><span class="source-line-text">                status: &quot;running&quot;,</span></span>
<span class="source-line"><span class="source-line-number">555</span><span class="source-line-text">                time: { start: started },</span></span>
<span class="source-line"><span class="source-line-number">556</span><span class="source-line-text">                input: { command: input.command },</span></span>
<span class="source-line"><span class="source-line-number">557</span><span class="source-line-text">              },</span></span>
<span class="source-line"><span class="source-line-number">558</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">559</span><span class="source-line-text">            yield* sessions.updatePart(part)</span></span></code></pre>
</details>。
- 和权限：`ctx.ask` 会进入 `Permission.ask`，可能等待用户回复。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:161-196</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">    const ask = Effect.fn(&quot;Permission.ask&quot;)(function* (input: AskInput) {</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">      const { approved, pending } = yield* InstanceState.get(state)</span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">      const { ruleset, ...request } = input</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">      let needsAsk = false</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">      for (const pattern of request.patterns) {</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">        const rule = evaluate(request.permission, pattern, ruleset, approved)</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">        log.info(&quot;evaluated&quot;, { permission: request.permission, pattern, action: rule })</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">        if (rule.action === &quot;deny&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">          return yield* new DeniedError({</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">            ruleset: ruleset.filter((rule) =&gt; Wildcard.match(request.permission, rule.permission)),</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">        if (rule.action === &quot;allow&quot;) continue</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">        needsAsk = true</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">      if (!needsAsk) return</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">      const id = request.id ?? PermissionID.ascending()</span></span>
<span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">      const info = Schema.decodeUnknownSync(Request)({</span></span>
<span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">        id,</span></span>
<span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">        ...request,</span></span>
<span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">      log.info(&quot;asking&quot;, { id, permission: info.permission, patterns: info.patterns })</span></span>
<span class="source-line"><span class="source-line-number">186</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">      const deferred = yield* Deferred.make&lt;void, RejectedError | CorrectedError&gt;()</span></span>
<span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">      pending.set(id, { info, deferred })</span></span>
<span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">      yield* bus.publish(Event.Asked, info)</span></span>
<span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">      return yield* Effect.ensuring(</span></span>
<span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">        Deferred.await(deferred),</span></span>
<span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">        Effect.sync(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">          pending.delete(id)</span></span>
<span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">    })</span></span></code></pre>
</details>。
- 和文件系统：`collect` 会用 `fs.isDir` 判断路径是目录还是文件，并用 `containsPath` 判断是否超出 instance。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:393-400</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">393</span><span class="source-line-text">        if (cmd &amp;&amp; (FILES.has(cmd) || (shellKind === &quot;cmd&quot; &amp;&amp; CMD_FILES.has(cmd)))) {</span></span>
<span class="source-line"><span class="source-line-number">394</span><span class="source-line-text">          for (const arg of pathArgs(command, ps, shellKind === &quot;cmd&quot;)) {</span></span>
<span class="source-line"><span class="source-line-number">395</span><span class="source-line-text">            const resolved = yield* argPath(arg, cwd, ps, shell)</span></span>
<span class="source-line"><span class="source-line-number">396</span><span class="source-line-text">            log.info(&quot;resolved path&quot;, { arg, resolved })</span></span>
<span class="source-line"><span class="source-line-number">397</span><span class="source-line-text">            if (!resolved || containsPath(resolved, instance)) continue</span></span>
<span class="source-line"><span class="source-line-number">398</span><span class="source-line-text">            const dir = (yield* fs.isDir(resolved)) ? resolved : path.dirname(resolved)</span></span>
<span class="source-line"><span class="source-line-number">399</span><span class="source-line-text">            scan.dirs.add(dir)</span></span>
<span class="source-line"><span class="source-line-number">400</span><span class="source-line-text">          }</span></span></code></pre>
</details>。
- 和插件：`shell.env` hook 可以给每次命令注入环境变量。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:412-422</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">412</span><span class="source-line-text">    const shellEnv = Effect.fn(&quot;ShellTool.shellEnv&quot;)(function* (ctx: Tool.Context, cwd: string) {</span></span>
<span class="source-line"><span class="source-line-number">413</span><span class="source-line-text">      const extra = yield* plugin.trigger(</span></span>
<span class="source-line"><span class="source-line-number">414</span><span class="source-line-text">        &quot;shell.env&quot;,</span></span>
<span class="source-line"><span class="source-line-number">415</span><span class="source-line-text">        { cwd, sessionID: ctx.sessionID, callID: ctx.callID },</span></span>
<span class="source-line"><span class="source-line-number">416</span><span class="source-line-text">        { env: {} },</span></span>
<span class="source-line"><span class="source-line-number">417</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">418</span><span class="source-line-text">      return {</span></span>
<span class="source-line"><span class="source-line-number">419</span><span class="source-line-text">        ...process.env,</span></span>
<span class="source-line"><span class="source-line-number">420</span><span class="source-line-text">        ...extra.env,</span></span>
<span class="source-line"><span class="source-line-number">421</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">422</span><span class="source-line-text">    })</span></span></code></pre>
</details>。

## 11. 如果自己实现 mini agent，这一章对应什么代码

最小实现不要先追 tree-sitter，可以先写保守版：

```ts
type ShellResult = {
  exitCode: number | null
  output: string
  truncated: boolean
}

async function runShellTool(input: {
  command: string
  cwd: string
  timeoutMs?: number
}, ctx: {
  ask(permission: string, patterns: string[]): Promise<void>
  updateMetadata(meta: Record<string, unknown>): Promise<void>
  signal: AbortSignal
}): Promise<ShellResult> {
  const pattern = input.command.split(/\s+/).slice(0, 2).join(" ") + " *"
  await ctx.ask("shell", [pattern])

  // 真实项目里用 execa / child_process.spawn，并处理 stdout/stderr 流。
  // 第一版 mini agent 可以只支持非交互命令，设置 timeout，并限制输出长度。
  throw new Error("implement spawn + streaming + timeout")
}
```

实现顺序：

1. 支持 `cwd`、`timeout`、`AbortSignal`。
2. stdout/stderr 合并为一个 stream。
3. 每来一段输出就更新 tool metadata。
4. 输出超过阈值时截断。
5. 加入简单 permission pattern，例如 `npm test *`、`git status *`。
6. 再考虑 AST 解析和外部目录检测。

## 12. 费曼复述区

请你不看源码复述：

1. 为什么 shell tool 不能直接 `exec(command)`？
2. `collect` 输出的 `dirs`、`patterns`、`always` 分别有什么用？
3. `ctx.ask` 和 `Permission.ask` 的职责差异是什么？
4. 为什么 OpenCode 要把 shell 输出持续写入 metadata，而不是等命令结束？
5. 用户直接执行 shell 和模型调用 shell tool 的 session 记录有什么共同点和差异？

如果说不出来，通常是卡在这三处：

- 把“模型决定调用工具”和“runtime 执行工具”混成一件事。
- 只看到 `ChildProcess.make`，忽略了执行前的 `parse/collect/ask`。
- 没有把 shell result 和下一轮 LLM message history 联系起来。

换一种说法：Shell 模块本质是 agent 的“手”，但这只手每次伸出去前都要看权限单，伸出去时要录像，回来后要把结果贴回会话记录。

## 13. 练习题

### 入门题

1. 在 `packages/opencode/src/tool/shell.ts` 中找到 `CWD`、`FILES`、`CMD_FILES`，解释它们为什么要分开。
2. 找到 `defaultTimeout`，说明默认值来自哪里。
3. 找到 `stdin: "ignore"`，解释为什么这对 agent 很重要。

### 进阶题

1. 阅读 `collect`，说明 `cd /tmp` 和 `cat /tmp/a.txt` 在扫描结果上有什么差异。
2. 阅读 `run`，说明输出过长时 `file`、`cut`、`outputPath` 如何协作。
3. 阅读 `Permission.ask`，说明 deny、allow、ask 三种结果分别怎样影响 shell 执行。

### 源码追踪题

1. 从 `ToolRegistry` 找到 shell tool 如何被注册。
2. 从 `SessionTools.resolve` 找到 shell tool 的 `execute` 如何被 AI SDK 调用。
3. 从 `ctx.metadata` 追到 `SessionProcessor` 如何更新 tool part。
4. 从 `SessionPrompt.shellImpl` 追踪用户直接 shell 命令如何变成 synthetic user part。

### 小实现题

实现一个 mini shell runner：

- 输入：`command`、`cwd`、`timeoutMs`。
- 执行前要求 `permission.ask("shell", [pattern])`。
- 实时收集输出，只保存最后 200 行。
- 超时后 kill 进程。
- 返回 `{ exitCode, output, truncated }`。

## 14. 源码追踪任务

建议打开这些文件，边读边画链路：

1. `packages/opencode/src/tool/registry.ts`：找到 `shell: Tool.init(shell)`。
2. `packages/opencode/src/session/tools.ts`：看 `context.metadata` 和 `context.ask`。
3. `packages/opencode/src/tool/shell.ts`：按 `execute -> parse -> collect -> ask -> run` 做笔记。
4. `packages/opencode/src/permission/index.ts`：追踪 pending permission 如何等待 reply。
5. `packages/opencode/src/session/prompt.ts`：比较 `shellImpl` 和 agent loop tool call 的差异。

## 15. 面试式自测

1. 如果模型想执行 `rm -rf /tmp/foo`，OpenCode 代码里有哪些机会阻止它？
2. 为什么 shell 输出需要截断？截断信息保存在哪里？
3. 如果命令卡住不退出，哪段代码负责超时？
4. 如果用户点击取消，哪段代码会 kill 子进程？
5. 为什么 shell module 要关心 PowerShell、cmd、bash 的差异？
6. 如果要加“禁止 sudo”策略，应该放在 `collect`、`ask`、还是 `Permission.evaluate`？请说明取舍。

## 16. 下一步阅读建议

下一章建议读 “模型 Provider / LLM 调用”。Shell tool 是 agent 的行动能力，而 Provider 章会告诉你：模型如何拿到 tool schema、如何流式返回 tool call，以及不同 provider 的消息格式为什么要被转换。


