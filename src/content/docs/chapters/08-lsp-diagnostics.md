---
title: "LSP / 诊断 / 上下文增强"
description: "理解 OpenCode 如何启动 LSP client，并把 diagnostics、hover、definition 等反馈给 agent。"
sidebar:
  label: "08. LSP / 诊断 / 上下文增强"
  order: 8
---

<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">已完成</span></div>
  <div><strong>难度</strong>较难</div>
  <div><strong>预计阅读</strong>45 分钟</div>
  <div><strong>源文件</strong><a href="/markdown/08-lsp-diagnostics.md"><code>markdown/08-lsp-diagnostics.md</code></a></div>
</div>

## Agent 生成档案

- 章节 ID：`08-lsp-diagnostics`
- 章节摘要：理解 OpenCode 如何启动 LSP client，并把 diagnostics、hover、definition 等反馈给 agent。
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

<li><code>packages/opencode/src/lsp/lsp.ts</code></li>
<li><code>packages/opencode/src/lsp/client.ts</code></li>
<li><code>packages/opencode/src/lsp/diagnostic.ts</code></li>
<li><code>packages/opencode/src/tool/edit.ts</code></li>
<li><code>packages/opencode/src/tool/write.ts</code></li>

</ul>


> 对应模块：`study-output/02-opencode-function-outline.md` 的 “2.8 LSP / 诊断 / 上下文增强”。  
> 主要源码：`packages/opencode/src/lsp/lsp.ts`、`packages/opencode/src/lsp/client.ts`、`packages/opencode/src/lsp/server.ts`、`packages/opencode/src/lsp/diagnostic.ts`、`packages/opencode/src/tool/lsp.ts`、`packages/opencode/src/tool/edit.ts`、`packages/opencode/src/tool/write.ts`。

## 0. 本章学习目标

这一章要理解 OpenCode 如何把“代码编辑后有没有错”和“代码语义查询”接回 agent。

学完你应该能说明：

- LSP service 如何按文件类型和 project root 懒启动 language server。
- `touchFile` 为什么会 open/change 文件并等待 diagnostics。
- edit/write 工具如何把 LSP 错误追加到 tool output。
- lsp tool 如何提供 hover、definition、references、documentSymbol 等语义能力。
- LSP client 如何处理 push diagnostics 和 pull diagnostics。
- 为什么 LSP 是 agent 的上下文增强，而不是核心 loop 的替代品。

## 1. 一句话讲明白

LSP 模块是 OpenCode 的“代码语义反馈层”：它按文件找到可用 language server，懒启动 JSON-RPC client，编辑后通过 `touchFile` 通知 LSP 并等待 diagnostics，再把错误报告塞回 tool output；同时 `lsp` tool 允许模型主动查询定义、引用、hover、符号和调用层级。来源：`packages/opencode/src/lsp/lsp.ts:211-299`、`packages/opencode/src/lsp/lsp.ts:346-379`、`packages/opencode/src/tool/edit.ts:192-207`、`packages/opencode/src/tool/lsp.ts:37-110`。

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/lsp.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/lsp.ts:211-299</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">    const getClients = Effect.fnUntraced(function* (file: string) {</span></span>
<span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">      const ctx = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">      if (!containsPath(file, ctx)) return [] as LSPClient.Info[]</span></span>
<span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">      const s = yield* InstanceState.get(state)</span></span>
<span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">      return yield* Effect.promise(async () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">        const extension = path.parse(file).ext || file</span></span>
<span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">        const result: LSPClient.Info[] = []</span></span>
<span class="source-line"><span class="source-line-number">218</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">        async function schedule(server: LSPServer.Info, root: string, key: string) {</span></span>
<span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">          const handle = await server</span></span>
<span class="source-line"><span class="source-line-number">221</span><span class="source-line-text">            .spawn(root, ctx, flags)</span></span>
<span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">            .then((value) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">              if (!value) s.broken.add(key)</span></span>
<span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">              return value</span></span>
<span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">226</span><span class="source-line-text">            .catch((err) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">              s.broken.add(key)</span></span>
<span class="source-line"><span class="source-line-number">228</span><span class="source-line-text">              log.error(`Failed to spawn LSP server ${server.id}`, { error: err })</span></span>
<span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">              return undefined</span></span>
<span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">231</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">          if (!handle) return undefined</span></span>
<span class="source-line"><span class="source-line-number">233</span><span class="source-line-text">          log.info(&quot;spawned lsp server&quot;, { serverID: server.id, root })</span></span>
<span class="source-line"><span class="source-line-number">234</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">235</span><span class="source-line-text">          const client = await LSPClient.create({</span></span>
<span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">            serverID: server.id,</span></span>
<span class="source-line"><span class="source-line-number">237</span><span class="source-line-text">            server: handle,</span></span>
<span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">            root,</span></span>
<span class="source-line"><span class="source-line-number">239</span><span class="source-line-text">            directory: ctx.directory,</span></span>
<span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">            instance: ctx,</span></span>
<span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">          }).catch(async (err) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">            s.broken.add(key)</span></span>
<span class="source-line"><span class="source-line-number">243</span><span class="source-line-text">            await Process.stop(handle.process)</span></span>
<span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">            log.error(`Failed to initialize LSP client ${server.id}`, { error: err })</span></span>
<span class="source-line"><span class="source-line-number">245</span><span class="source-line-text">            return undefined</span></span>
<span class="source-line"><span class="source-line-number">246</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">247</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">          if (!client) return undefined</span></span>
<span class="source-line"><span class="source-line-number">249</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">          const existing = s.clients.find((x) =&gt; x.root === root &amp;&amp; x.serverID === server.id)</span></span>
<span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">          if (existing) {</span></span>
<span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">            await Process.stop(handle.process)</span></span>
<span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">            return existing</span></span>
<span class="source-line"><span class="source-line-number">254</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">255</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">256</span><span class="source-line-text">          s.clients.push(client)</span></span>
<span class="source-line"><span class="source-line-number">257</span><span class="source-line-text">          return client</span></span>
<span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">259</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">        for (const server of Object.values(s.servers)) {</span></span>
<span class="source-line"><span class="source-line-number">261</span><span class="source-line-text">          if (server.extensions.length &amp;&amp; !server.extensions.includes(extension)) continue</span></span>
<span class="source-line"><span class="source-line-number">262</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">          const root = await server.root(file, ctx)</span></span>
<span class="source-line"><span class="source-line-number">264</span><span class="source-line-text">          if (!root) continue</span></span>
<span class="source-line"><span class="source-line-number">265</span><span class="source-line-text">          if (s.broken.has(root + server.id)) continue</span></span>
<span class="source-line"><span class="source-line-number">266</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">          const match = s.clients.find((x) =&gt; x.root === root &amp;&amp; x.serverID === server.id)</span></span>
<span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">          if (match) {</span></span>
<span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">            result.push(match)</span></span>
<span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">272</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">          const inflight = s.spawning.get(root + server.id)</span></span>
<span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">          if (inflight) {</span></span>
<span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">            const client = await inflight</span></span>
<span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">            if (!client) continue</span></span>
<span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">            result.push(client)</span></span>
<span class="source-line"><span class="source-line-number">278</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">          const task = schedule(server, root, root + server.id)</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">          s.spawning.set(root + server.id, task)</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text">          task.finally(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">            if (s.spawning.get(root + server.id) === task) {</span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">              s.spawning.delete(root + server.id)</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">289</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">          const client = await task</span></span>
<span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">          if (!client) continue</span></span>
<span class="source-line"><span class="source-line-number">292</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">293</span><span class="source-line-text">          result.push(client)</span></span>
<span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">          await Bus.publish(ctx, Event.Updated, {})</span></span>
<span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">        return result</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">    })</span></span></code></pre>
</details>

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/lsp.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/lsp.ts:346-379</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">346</span><span class="source-line-text">    const touchFile = Effect.fn(&quot;LSP.touchFile&quot;)(function* (input: string, diagnostics?: &quot;document&quot; | &quot;full&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">      log.info(&quot;touching file&quot;, { file: input })</span></span>
<span class="source-line"><span class="source-line-number">348</span><span class="source-line-text">      const clients = yield* getClients(input)</span></span>
<span class="source-line"><span class="source-line-number">349</span><span class="source-line-text">      yield* Effect.promise(() =&gt;</span></span>
<span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">        Promise.all(</span></span>
<span class="source-line"><span class="source-line-number">351</span><span class="source-line-text">          clients.map(async (client) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">            const after = Date.now()</span></span>
<span class="source-line"><span class="source-line-number">353</span><span class="source-line-text">            const version = await client.notify.open({ path: input })</span></span>
<span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">            if (!diagnostics) return</span></span>
<span class="source-line"><span class="source-line-number">355</span><span class="source-line-text">            return client.waitForDiagnostics({</span></span>
<span class="source-line"><span class="source-line-number">356</span><span class="source-line-text">              path: input,</span></span>
<span class="source-line"><span class="source-line-number">357</span><span class="source-line-text">              version,</span></span>
<span class="source-line"><span class="source-line-number">358</span><span class="source-line-text">              mode: diagnostics,</span></span>
<span class="source-line"><span class="source-line-number">359</span><span class="source-line-text">              after,</span></span>
<span class="source-line"><span class="source-line-number">360</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">361</span><span class="source-line-text">          }),</span></span>
<span class="source-line"><span class="source-line-number">362</span><span class="source-line-text">        ).catch((err) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">363</span><span class="source-line-text">          log.error(&quot;failed to touch file&quot;, { err, file: input })</span></span>
<span class="source-line"><span class="source-line-number">364</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">365</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">366</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">367</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">368</span><span class="source-line-text">    const diagnostics = Effect.fn(&quot;LSP.diagnostics&quot;)(function* () {</span></span>
<span class="source-line"><span class="source-line-number">369</span><span class="source-line-text">      const results: Record&lt;string, LSPClient.Diagnostic[]&gt; = {}</span></span>
<span class="source-line"><span class="source-line-number">370</span><span class="source-line-text">      const all = yield* runAll(async (client) =&gt; client.diagnostics)</span></span>
<span class="source-line"><span class="source-line-number">371</span><span class="source-line-text">      for (const result of all) {</span></span>
<span class="source-line"><span class="source-line-number">372</span><span class="source-line-text">        for (const [p, diags] of result.entries()) {</span></span>
<span class="source-line"><span class="source-line-number">373</span><span class="source-line-text">          const arr = results[p] || []</span></span>
<span class="source-line"><span class="source-line-number">374</span><span class="source-line-text">          arr.push(...diags)</span></span>
<span class="source-line"><span class="source-line-number">375</span><span class="source-line-text">          results[p] = arr</span></span>
<span class="source-line"><span class="source-line-number">376</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">377</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">378</span><span class="source-line-text">      return results</span></span>
<span class="source-line"><span class="source-line-number">379</span><span class="source-line-text">    })</span></span></code></pre>
</details>

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/edit.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/edit.ts:192-207</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">          let output = &quot;Edit applied successfully.&quot;</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">          yield* lsp.touchFile(filePath, &quot;document&quot;)</span></span>
<span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">          const diagnostics = yield* lsp.diagnostics()</span></span>
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">          const normalizedFilePath = AppFileSystem.normalizePath(filePath)</span></span>
<span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">          const block = LSP.Diagnostic.report(filePath, diagnostics[normalizedFilePath] ?? [])</span></span>
<span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">          if (block) output += `\n\nLSP errors detected in this file, please fix:\n${block}`</span></span>
<span class="source-line"><span class="source-line-number">198</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">            metadata: {</span></span>
<span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">              diagnostics,</span></span>
<span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">              diff,</span></span>
<span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">              filediff,</span></span>
<span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">            },</span></span>
<span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">            title: `${path.relative(instance.worktree, filePath)}`,</span></span>
<span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">            output,</span></span>
<span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">          }</span></span></code></pre>
</details>

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/lsp.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/lsp.ts:37-110</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">export const LspTool = Tool.define(</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">  &quot;lsp&quot;,</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">    const lsp = yield* LSP.Service</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">    const fs = yield* AppFileSystem.Service</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">    return {</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">      description: DESCRIPTION,</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">      parameters: Parameters,</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">      execute: (args: Schema.Schema.Type&lt;typeof Parameters&gt;, ctx: Tool.Context) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">        Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">          const instance = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">          const file = path.isAbsolute(args.filePath) ? args.filePath : path.join(instance.directory, args.filePath)</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">          yield* assertExternalDirectoryEffect(ctx, file)</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">          const meta =</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">            args.operation === &quot;workspaceSymbol&quot;</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">              ? { operation: args.operation }</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">              : args.operation === &quot;documentSymbol&quot;</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">                ? { operation: args.operation, filePath: file }</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">                : { operation: args.operation, filePath: file, line: args.line, character: args.character }</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">          yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">            permission: &quot;lsp&quot;,</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">            patterns: [&quot;*&quot;],</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">            always: [&quot;*&quot;],</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">            metadata: meta,</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">          const uri = pathToFileURL(file).href</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">          const position = { file, line: args.line - 1, character: args.character - 1 }</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">          const relPath = path.relative(instance.worktree, file)</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">          const detail =</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">            args.operation === &quot;workspaceSymbol&quot;</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">              ? &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">              : args.operation === &quot;documentSymbol&quot;</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">                ? relPath</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">                : `${relPath}:${args.line}:${args.character}`</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">          const title = detail ? `${args.operation} ${detail}` : args.operation</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">          const exists = yield* fs.existsSafe(file)</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">          if (!exists) throw new Error(`File not found: ${file}`)</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">          const available = yield* lsp.hasClients(file)</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">          if (!available) throw new Error(&quot;No LSP server available for this file type.&quot;)</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">          yield* lsp.touchFile(file, &quot;document&quot;)</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">          const result: unknown[] = yield* (() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">            switch (args.operation) {</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">              case &quot;goToDefinition&quot;:</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">                return lsp.definition(position)</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">              case &quot;findReferences&quot;:</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">                return lsp.references(position)</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">              case &quot;hover&quot;:</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">                return lsp.hover(position)</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">              case &quot;documentSymbol&quot;:</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">                return lsp.documentSymbol(uri)</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">              case &quot;workspaceSymbol&quot;:</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">                return lsp.workspaceSymbol(args.query ?? &quot;&quot;)</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">              case &quot;goToImplementation&quot;:</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">                return lsp.implementation(position)</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">              case &quot;prepareCallHierarchy&quot;:</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">                return lsp.prepareCallHierarchy(position)</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">              case &quot;incomingCalls&quot;:</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">                return lsp.incomingCalls(position)</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">              case &quot;outgoingCalls&quot;:</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">                return lsp.outgoingCalls(position)</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">          })()</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">            title,</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">            metadata: { result },</span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">            output: result.length === 0 ? `No results found for ${args.operation}` : JSON.stringify(result, null, 2),</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">        }).pipe(Effect.orDie),</span></span></code></pre>
</details>


## 2. 它在 OpenCode agent 中的位置

LSP 有两条主要路径：

```text
edit/write tool
  -> modify file
  -> lsp.touchFile(file, "document" or "full")
  -> lsp.diagnostics()
  -> Diagnostic.report(...)
  -> tool output includes errors
  -> next LLM round sees diagnostics
```

和：

```text
model calls lsp tool
  -> permission ask("lsp")
  -> lsp.touchFile(file, "document")
  -> lsp.definition / references / hover / symbols
  -> JSON result returned as tool output
```

关键判断：

- `LSP.Interface` 既有 `touchFile/diagnostics`，也有 hover/definition/references 等语义接口。来源：`packages/opencode/src/lsp/lsp.ts:123-138`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/lsp/lsp.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/lsp/lsp.ts:123-138</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">export interface Interface {</span></span>
  <span class="source-line"><span class="source-line-number">124</span><span class="source-line-text">  readonly init: () =&gt; Effect.Effect&lt;void&gt;</span></span>
  <span class="source-line"><span class="source-line-number">125</span><span class="source-line-text">  readonly status: () =&gt; Effect.Effect&lt;Status[]&gt;</span></span>
  <span class="source-line"><span class="source-line-number">126</span><span class="source-line-text">  readonly hasClients: (file: string) =&gt; Effect.Effect&lt;boolean&gt;</span></span>
  <span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">  readonly touchFile: (input: string, diagnostics?: &quot;document&quot; | &quot;full&quot;) =&gt; Effect.Effect&lt;void&gt;</span></span>
  <span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">  readonly diagnostics: () =&gt; Effect.Effect&lt;Record&lt;string, LSPClient.Diagnostic[]&gt;&gt;</span></span>
  <span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">  readonly hover: (input: LocInput) =&gt; Effect.Effect&lt;any&gt;</span></span>
  <span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">  readonly definition: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
  <span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">  readonly references: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
  <span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">  readonly implementation: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
  <span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">  readonly documentSymbol: (uri: string) =&gt; Effect.Effect&lt;(DocumentSymbol | Symbol)[]&gt;</span></span>
  <span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">  readonly workspaceSymbol: (query: string) =&gt; Effect.Effect&lt;Symbol[]&gt;</span></span>
  <span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">  readonly prepareCallHierarchy: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
  <span class="source-line"><span class="source-line-number">136</span><span class="source-line-text">  readonly incomingCalls: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
  <span class="source-line"><span class="source-line-number">137</span><span class="source-line-text">  readonly outgoingCalls: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
  <span class="source-line"><span class="source-line-number">138</span><span class="source-line-text">}</span></span></code></pre>
  </details>

- `EditTool` 修改后调用 `lsp.touchFile(filePath, "document")` 并读取 diagnostics。来源：`packages/opencode/src/tool/edit.ts:192-197`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/tool/edit.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/tool/edit.ts:192-197</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">          let output = &quot;Edit applied successfully.&quot;</span></span>
  <span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">          yield* lsp.touchFile(filePath, &quot;document&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">          const diagnostics = yield* lsp.diagnostics()</span></span>
  <span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">          const normalizedFilePath = AppFileSystem.normalizePath(filePath)</span></span>
  <span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">          const block = LSP.Diagnostic.report(filePath, diagnostics[normalizedFilePath] ?? [])</span></span>
  <span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">          if (block) output += `\n\nLSP errors detected in this file, please fix:\n${block}`</span></span></code></pre>
  </details>

- `WriteTool` 修改后会报告当前文件和其它文件的 diagnostics。来源：`packages/opencode/src/tool/write.ts:80-99`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/tool/write.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/tool/write.ts:80-99</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">            const current = file === normalizedFilepath</span></span>
  <span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">            if (!current &amp;&amp; projectDiagnosticsCount &gt;= MAX_PROJECT_DIAGNOSTICS_FILES) continue</span></span>
  <span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">            const block = LSP.Diagnostic.report(current ? filepath : file, issues)</span></span>
  <span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">            if (!block) continue</span></span>
  <span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">            if (current) {</span></span>
  <span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">              output += `\n\nLSP errors detected in this file, please fix:\n${block}`</span></span>
  <span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">              continue</span></span>
  <span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">            projectDiagnosticsCount++</span></span>
  <span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">            output += `\n\nLSP errors detected in other files:\n${block}`</span></span>
  <span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">91</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">          return {</span></span>
  <span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">            title: path.relative(instance.worktree, filepath),</span></span>
  <span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">            metadata: {</span></span>
  <span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">              diagnostics,</span></span>
  <span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">              filepath,</span></span>
  <span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">              exists: exists,</span></span>
  <span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">            },</span></span>
  <span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">            output,</span></span></code></pre>
  </details>

- `LspTool` 在执行语义查询前也调用 `lsp.touchFile(file, "document")`。来源：`packages/opencode/src/tool/lsp.ts:77-83`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/tool/lsp.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/tool/lsp.ts:77-83</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">          const available = yield* lsp.hasClients(file)</span></span>
  <span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">          if (!available) throw new Error(&quot;No LSP server available for this file type.&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">79</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">          yield* lsp.touchFile(file, &quot;document&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">81</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">          const result: unknown[] = yield* (() =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">            switch (args.operation) {</span></span></code></pre>
  </details>


## 3. 生活类比

把 LSP 想成你身边的 IDE 审稿员。

你改完代码以后，IDE 会告诉你：“第 12 行类型不对”“这个方法不存在”。OpenCode 也是这样：agent 用 edit/write 改文件以后，LSP 模块会让 language server 重新看这份文件，把诊断结果交回给工具输出。下一轮模型看到这些错误，就可以继续修。

主动查询部分像在 IDE 里按 F12、找引用、看 hover 文档。模型也可以通过 `lsp` tool 做这些动作，而不只是 grep 字符串。

## 4. Java 开发者类比

- `LSP.Service` 像一个 `LanguageIntelligenceService`。
- `LSPServer.Info` 像 language server 的 `FactoryBean`，包含 extensions、root finder 和 spawn 方法。
- `LSPClient.create` 像初始化一个 JSON-RPC client。
- `touchFile` 像 IDE 的 `documentOpened/documentChanged` 事件。
- `Diagnostic.report` 像把编译错误格式化成 agent 可读文本。
- `LspTool` 像把 IDE 功能暴露成 remote service。

Java 后端类比：

```java
List<LspClient> clients = lspRegistry.getClients(file);
for (LspClient client : clients) {
    int version = client.openOrChange(file);
    client.waitForDiagnostics(file, version);
}
Map<Path, List<Diagnostic>> diagnostics = lspRegistry.diagnostics();
toolResult.append(DiagnosticReport.forFile(file, diagnostics.get(file)));
```

## 5. 最小源码路径

1. `packages/opencode/src/lsp/lsp.ts:123-138`：LSP service interface。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/lsp/lsp.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/lsp/lsp.ts:123-138</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">export interface Interface {</span></span>
  <span class="source-line"><span class="source-line-number">124</span><span class="source-line-text">  readonly init: () =&gt; Effect.Effect&lt;void&gt;</span></span>
  <span class="source-line"><span class="source-line-number">125</span><span class="source-line-text">  readonly status: () =&gt; Effect.Effect&lt;Status[]&gt;</span></span>
  <span class="source-line"><span class="source-line-number">126</span><span class="source-line-text">  readonly hasClients: (file: string) =&gt; Effect.Effect&lt;boolean&gt;</span></span>
  <span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">  readonly touchFile: (input: string, diagnostics?: &quot;document&quot; | &quot;full&quot;) =&gt; Effect.Effect&lt;void&gt;</span></span>
  <span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">  readonly diagnostics: () =&gt; Effect.Effect&lt;Record&lt;string, LSPClient.Diagnostic[]&gt;&gt;</span></span>
  <span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">  readonly hover: (input: LocInput) =&gt; Effect.Effect&lt;any&gt;</span></span>
  <span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">  readonly definition: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
  <span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">  readonly references: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
  <span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">  readonly implementation: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
  <span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">  readonly documentSymbol: (uri: string) =&gt; Effect.Effect&lt;(DocumentSymbol | Symbol)[]&gt;</span></span>
  <span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">  readonly workspaceSymbol: (query: string) =&gt; Effect.Effect&lt;Symbol[]&gt;</span></span>
  <span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">  readonly prepareCallHierarchy: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
  <span class="source-line"><span class="source-line-number">136</span><span class="source-line-text">  readonly incomingCalls: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
  <span class="source-line"><span class="source-line-number">137</span><span class="source-line-text">  readonly outgoingCalls: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
  <span class="source-line"><span class="source-line-number">138</span><span class="source-line-text">}</span></span></code></pre>
  </details>

2. `packages/opencode/src/lsp/lsp.ts:148-208`：加载 server 配置和初始化 state。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/lsp/lsp.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/lsp/lsp.ts:148-208</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">148</span><span class="source-line-text">    const state = yield* InstanceState.make&lt;State&gt;(</span></span>
  <span class="source-line"><span class="source-line-number">149</span><span class="source-line-text">      Effect.fn(&quot;LSP.state&quot;)(function* (ctx) {</span></span>
  <span class="source-line"><span class="source-line-number">150</span><span class="source-line-text">        const cfg = yield* config.get()</span></span>
  <span class="source-line"><span class="source-line-number">151</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">        const servers: Record&lt;string, LSPServer.Info&gt; = {}</span></span>
  <span class="source-line"><span class="source-line-number">153</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">        if (!cfg.lsp) {</span></span>
  <span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">          log.info(&quot;all LSPs are disabled&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">        } else {</span></span>
  <span class="source-line"><span class="source-line-number">157</span><span class="source-line-text">          for (const server of Object.values(LSPServer)) {</span></span>
  <span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">            servers[server.id] = server</span></span>
  <span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">160</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">          filterExperimentalServers(servers, flags)</span></span>
  <span class="source-line"><span class="source-line-number">162</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">          if (cfg.lsp !== true) {</span></span>
  <span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">            for (const [name, item] of Object.entries(cfg.lsp)) {</span></span>
  <span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">              const existing = servers[name]</span></span>
  <span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">              if (item.disabled) {</span></span>
  <span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">                log.info(`LSP server ${name} is disabled`)</span></span>
  <span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">                delete servers[name]</span></span>
  <span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">                continue</span></span>
  <span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">              }</span></span>
  <span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">              servers[name] = {</span></span>
  <span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">                ...existing,</span></span>
  <span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">                id: name,</span></span>
  <span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">                root: existing?.root ?? (async (_file, ctx) =&gt; ctx.directory),</span></span>
  <span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">                extensions: item.extensions ?? existing?.extensions ?? [],</span></span>
  <span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">                spawn: async (root) =&gt; ({</span></span>
  <span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">                  process: lspspawn(item.command[0], item.command.slice(1), {</span></span>
  <span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">                    cwd: root,</span></span>
  <span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">                    env: { ...process.env, ...item.env },</span></span>
  <span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">                  }),</span></span>
  <span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">                  initialization: item.initialization,</span></span>
  <span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">                }),</span></span>
  <span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">              }</span></span>
  <span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">186</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">          log.info(&quot;enabled LSP servers&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">            serverIds: Object.values(servers)</span></span>
  <span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">              .map((server) =&gt; server.id)</span></span>
  <span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">              .join(&quot;, &quot;),</span></span>
  <span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">        }</span></span>
  <span class="source-line"><span class="source-line-number">193</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">        const s: State = {</span></span>
  <span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">          clients: [],</span></span>
  <span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">          servers,</span></span>
  <span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">          broken: new Set(),</span></span>
  <span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">          spawning: new Map(),</span></span>
  <span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">        }</span></span>
  <span class="source-line"><span class="source-line-number">200</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">        yield* Effect.addFinalizer(() =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">          Effect.promise(async () =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">            await Promise.all(s.clients.map((client) =&gt; client.shutdown()))</span></span>
  <span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">          }),</span></span>
  <span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">        )</span></span>
  <span class="source-line"><span class="source-line-number">206</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">        return s</span></span>
  <span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">      }),</span></span></code></pre>
  </details>

3. `packages/opencode/src/lsp/lsp.ts:211-299`：`getClients` 按文件懒启动 LSP client。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/lsp/lsp.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/lsp/lsp.ts:211-299</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">    const getClients = Effect.fnUntraced(function* (file: string) {</span></span>
  <span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">      const ctx = yield* InstanceState.context</span></span>
  <span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">      if (!containsPath(file, ctx)) return [] as LSPClient.Info[]</span></span>
  <span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">      const s = yield* InstanceState.get(state)</span></span>
  <span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">      return yield* Effect.promise(async () =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">        const extension = path.parse(file).ext || file</span></span>
  <span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">        const result: LSPClient.Info[] = []</span></span>
  <span class="source-line"><span class="source-line-number">218</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">        async function schedule(server: LSPServer.Info, root: string, key: string) {</span></span>
  <span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">          const handle = await server</span></span>
  <span class="source-line"><span class="source-line-number">221</span><span class="source-line-text">            .spawn(root, ctx, flags)</span></span>
  <span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">            .then((value) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">              if (!value) s.broken.add(key)</span></span>
  <span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">              return value</span></span>
  <span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">            })</span></span>
  <span class="source-line"><span class="source-line-number">226</span><span class="source-line-text">            .catch((err) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">              s.broken.add(key)</span></span>
  <span class="source-line"><span class="source-line-number">228</span><span class="source-line-text">              log.error(`Failed to spawn LSP server ${server.id}`, { error: err })</span></span>
  <span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">              return undefined</span></span>
  <span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">            })</span></span>
  <span class="source-line"><span class="source-line-number">231</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">          if (!handle) return undefined</span></span>
  <span class="source-line"><span class="source-line-number">233</span><span class="source-line-text">          log.info(&quot;spawned lsp server&quot;, { serverID: server.id, root })</span></span>
  <span class="source-line"><span class="source-line-number">234</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">235</span><span class="source-line-text">          const client = await LSPClient.create({</span></span>
  <span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">            serverID: server.id,</span></span>
  <span class="source-line"><span class="source-line-number">237</span><span class="source-line-text">            server: handle,</span></span>
  <span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">            root,</span></span>
  <span class="source-line"><span class="source-line-number">239</span><span class="source-line-text">            directory: ctx.directory,</span></span>
  <span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">            instance: ctx,</span></span>
  <span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">          }).catch(async (err) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">            s.broken.add(key)</span></span>
  <span class="source-line"><span class="source-line-number">243</span><span class="source-line-text">            await Process.stop(handle.process)</span></span>
  <span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">            log.error(`Failed to initialize LSP client ${server.id}`, { error: err })</span></span>
  <span class="source-line"><span class="source-line-number">245</span><span class="source-line-text">            return undefined</span></span>
  <span class="source-line"><span class="source-line-number">246</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">247</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">          if (!client) return undefined</span></span>
  <span class="source-line"><span class="source-line-number">249</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">          const existing = s.clients.find((x) =&gt; x.root === root &amp;&amp; x.serverID === server.id)</span></span>
  <span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">          if (existing) {</span></span>
  <span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">            await Process.stop(handle.process)</span></span>
  <span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">            return existing</span></span>
  <span class="source-line"><span class="source-line-number">254</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">255</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">256</span><span class="source-line-text">          s.clients.push(client)</span></span>
  <span class="source-line"><span class="source-line-number">257</span><span class="source-line-text">          return client</span></span>
  <span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">        }</span></span>
  <span class="source-line"><span class="source-line-number">259</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">        for (const server of Object.values(s.servers)) {</span></span>
  <span class="source-line"><span class="source-line-number">261</span><span class="source-line-text">          if (server.extensions.length &amp;&amp; !server.extensions.includes(extension)) continue</span></span>
  <span class="source-line"><span class="source-line-number">262</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">          const root = await server.root(file, ctx)</span></span>
  <span class="source-line"><span class="source-line-number">264</span><span class="source-line-text">          if (!root) continue</span></span>
  <span class="source-line"><span class="source-line-number">265</span><span class="source-line-text">          if (s.broken.has(root + server.id)) continue</span></span>
  <span class="source-line"><span class="source-line-number">266</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">          const match = s.clients.find((x) =&gt; x.root === root &amp;&amp; x.serverID === server.id)</span></span>
  <span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">          if (match) {</span></span>
  <span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">            result.push(match)</span></span>
  <span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">            continue</span></span>
  <span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">272</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">          const inflight = s.spawning.get(root + server.id)</span></span>
  <span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">          if (inflight) {</span></span>
  <span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">            const client = await inflight</span></span>
  <span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">            if (!client) continue</span></span>
  <span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">            result.push(client)</span></span>
  <span class="source-line"><span class="source-line-number">278</span><span class="source-line-text">            continue</span></span>
  <span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">280</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">          const task = schedule(server, root, root + server.id)</span></span>
  <span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">          s.spawning.set(root + server.id, task)</span></span>
  <span class="source-line"><span class="source-line-number">283</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">284</span><span class="source-line-text">          task.finally(() =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">            if (s.spawning.get(root + server.id) === task) {</span></span>
  <span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">              s.spawning.delete(root + server.id)</span></span>
  <span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">289</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">          const client = await task</span></span>
  <span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">          if (!client) continue</span></span>
  <span class="source-line"><span class="source-line-number">292</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">293</span><span class="source-line-text">          result.push(client)</span></span>
  <span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">          await Bus.publish(ctx, Event.Updated, {})</span></span>
  <span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">        }</span></span>
  <span class="source-line"><span class="source-line-number">296</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">        return result</span></span>
  <span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">      })</span></span>
  <span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">    })</span></span></code></pre>
  </details>

4. `packages/opencode/src/lsp/lsp.ts:346-379`：`touchFile` 和 `diagnostics`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/lsp/lsp.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/lsp/lsp.ts:346-379</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">346</span><span class="source-line-text">    const touchFile = Effect.fn(&quot;LSP.touchFile&quot;)(function* (input: string, diagnostics?: &quot;document&quot; | &quot;full&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">      log.info(&quot;touching file&quot;, { file: input })</span></span>
  <span class="source-line"><span class="source-line-number">348</span><span class="source-line-text">      const clients = yield* getClients(input)</span></span>
  <span class="source-line"><span class="source-line-number">349</span><span class="source-line-text">      yield* Effect.promise(() =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">        Promise.all(</span></span>
  <span class="source-line"><span class="source-line-number">351</span><span class="source-line-text">          clients.map(async (client) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">            const after = Date.now()</span></span>
  <span class="source-line"><span class="source-line-number">353</span><span class="source-line-text">            const version = await client.notify.open({ path: input })</span></span>
  <span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">            if (!diagnostics) return</span></span>
  <span class="source-line"><span class="source-line-number">355</span><span class="source-line-text">            return client.waitForDiagnostics({</span></span>
  <span class="source-line"><span class="source-line-number">356</span><span class="source-line-text">              path: input,</span></span>
  <span class="source-line"><span class="source-line-number">357</span><span class="source-line-text">              version,</span></span>
  <span class="source-line"><span class="source-line-number">358</span><span class="source-line-text">              mode: diagnostics,</span></span>
  <span class="source-line"><span class="source-line-number">359</span><span class="source-line-text">              after,</span></span>
  <span class="source-line"><span class="source-line-number">360</span><span class="source-line-text">            })</span></span>
  <span class="source-line"><span class="source-line-number">361</span><span class="source-line-text">          }),</span></span>
  <span class="source-line"><span class="source-line-number">362</span><span class="source-line-text">        ).catch((err) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">363</span><span class="source-line-text">          log.error(&quot;failed to touch file&quot;, { err, file: input })</span></span>
  <span class="source-line"><span class="source-line-number">364</span><span class="source-line-text">        }),</span></span>
  <span class="source-line"><span class="source-line-number">365</span><span class="source-line-text">      )</span></span>
  <span class="source-line"><span class="source-line-number">366</span><span class="source-line-text">    })</span></span>
  <span class="source-line"><span class="source-line-number">367</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">368</span><span class="source-line-text">    const diagnostics = Effect.fn(&quot;LSP.diagnostics&quot;)(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">369</span><span class="source-line-text">      const results: Record&lt;string, LSPClient.Diagnostic[]&gt; = {}</span></span>
  <span class="source-line"><span class="source-line-number">370</span><span class="source-line-text">      const all = yield* runAll(async (client) =&gt; client.diagnostics)</span></span>
  <span class="source-line"><span class="source-line-number">371</span><span class="source-line-text">      for (const result of all) {</span></span>
  <span class="source-line"><span class="source-line-number">372</span><span class="source-line-text">        for (const [p, diags] of result.entries()) {</span></span>
  <span class="source-line"><span class="source-line-number">373</span><span class="source-line-text">          const arr = results[p] || []</span></span>
  <span class="source-line"><span class="source-line-number">374</span><span class="source-line-text">          arr.push(...diags)</span></span>
  <span class="source-line"><span class="source-line-number">375</span><span class="source-line-text">          results[p] = arr</span></span>
  <span class="source-line"><span class="source-line-number">376</span><span class="source-line-text">        }</span></span>
  <span class="source-line"><span class="source-line-number">377</span><span class="source-line-text">      }</span></span>
  <span class="source-line"><span class="source-line-number">378</span><span class="source-line-text">      return results</span></span>
  <span class="source-line"><span class="source-line-number">379</span><span class="source-line-text">    })</span></span></code></pre>
  </details>

5. `packages/opencode/src/lsp/client.ts:141-244`：创建 JSON-RPC connection 和处理 server request/notification。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/lsp/client.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/lsp/client.ts:141-244</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">141</span><span class="source-line-text">export async function create(input: {</span></span>
  <span class="source-line"><span class="source-line-number">142</span><span class="source-line-text">  serverID: string</span></span>
  <span class="source-line"><span class="source-line-number">143</span><span class="source-line-text">  server: LSPServer.Handle</span></span>
  <span class="source-line"><span class="source-line-number">144</span><span class="source-line-text">  root: string</span></span>
  <span class="source-line"><span class="source-line-number">145</span><span class="source-line-text">  directory: string</span></span>
  <span class="source-line"><span class="source-line-number">146</span><span class="source-line-text">  instance: InstanceContext</span></span>
  <span class="source-line"><span class="source-line-number">147</span><span class="source-line-text">}) {</span></span>
  <span class="source-line"><span class="source-line-number">148</span><span class="source-line-text">  const logger = log.clone().tag(&quot;serverID&quot;, input.serverID)</span></span>
  <span class="source-line"><span class="source-line-number">149</span><span class="source-line-text">  logger.info(&quot;starting client&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">150</span><span class="source-line-text">  const instance = input.instance</span></span>
  <span class="source-line"><span class="source-line-number">151</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">  const connection = createMessageConnection(</span></span>
  <span class="source-line"><span class="source-line-number">153</span><span class="source-line-text">    new StreamMessageReader(input.server.process.stdout as any),</span></span>
  <span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">    new StreamMessageWriter(input.server.process.stdin as any),</span></span>
  <span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">  )</span></span>
  <span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">  // Server stderr can contain both real errors and routine informational logs,</span></span>
  <span class="source-line"><span class="source-line-number">157</span><span class="source-line-text">  // which is normal stderr practice for some tools. Keep the raw stream at</span></span>
  <span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">  // debug so users can opt in with --print-logs --log-level DEBUG without</span></span>
  <span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">  // polluting normal logs.</span></span>
  <span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">  input.server.process.stderr?.on(&quot;data&quot;, (data: Buffer) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">    const text = data.toString().trim()</span></span>
  <span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">    if (text) logger.debug(&quot;server stderr&quot;, { text: text.slice(0, 1000) })</span></span>
  <span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">  })</span></span>
  <span class="source-line"><span class="source-line-number">164</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">  // --- Connection state ---</span></span>
  <span class="source-line"><span class="source-line-number">166</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">  const pushDiagnostics = new Map&lt;string, Diagnostic[]&gt;()</span></span>
  <span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">  const pullDiagnostics = new Map&lt;string, Diagnostic[]&gt;()</span></span>
  <span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">  const published = new Map&lt;string, { at: number; version?: number }&gt;()</span></span>
  <span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">  const diagnosticRegistrations = new Map&lt;string, CapabilityRegistration&gt;()</span></span>
  <span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">  const registrationListeners = new Set&lt;() =&gt; void&gt;()</span></span>
  <span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">  const mergedDiagnostics = (filePath: string) =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">    dedupeDiagnostics([...(pushDiagnostics.get(filePath) ?? []), ...(pullDiagnostics.get(filePath) ?? [])])</span></span>
  <span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">  const updatePushDiagnostics = (filePath: string, next: Diagnostic[]) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">    pushDiagnostics.set(filePath, next)</span></span>
  <span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">    void busRuntime.runPromise((svc) =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">      svc</span></span>
  <span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">        .publish(Event.Diagnostics, { path: filePath, serverID: input.serverID })</span></span>
  <span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">        .pipe(Effect.provideService(InstanceRef, instance)),</span></span>
  <span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">    )</span></span>
  <span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">  }</span></span>
  <span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">  const updatePullDiagnostics = (filePath: string, next: Diagnostic[]) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">    pullDiagnostics.set(filePath, next)</span></span>
  <span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">  }</span></span>
  <span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">  const emitRegistrationChange = () =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">186</span><span class="source-line-text">    for (const listener of [...registrationListeners]) listener()</span></span>
  <span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">  }</span></span>
  <span class="source-line"><span class="source-line-number">188</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">  // --- LSP connection handlers ---</span></span>
  <span class="source-line"><span class="source-line-number">190</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">  connection.onNotification(&quot;textDocument/publishDiagnostics&quot;, (params) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">    const filePath = getFilePath(params.uri)</span></span>
  <span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">    if (!filePath) return</span></span>
  <span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">    logger.info(&quot;textDocument/publishDiagnostics&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      path: filePath,</span></span>
  <span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">      count: params.diagnostics.length,</span></span>
  <span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">      version: params.version,</span></span>
  <span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">    })</span></span>
  <span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">    published.set(filePath, {</span></span>
  <span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">      at: Date.now(),</span></span>
  <span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">      version: typeof params.version === &quot;number&quot; ? params.version : undefined,</span></span>
  <span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">    })</span></span>
  <span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">    if (shouldSeedDiagnosticsOnFirstPush(input.serverID) &amp;&amp; !pushDiagnostics.has(filePath)) {</span></span>
  <span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">      pushDiagnostics.set(filePath, params.diagnostics)</span></span>
  <span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">      return</span></span>
  <span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">    }</span></span>
  <span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">    updatePushDiagnostics(filePath, params.diagnostics)</span></span>
  <span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">  })</span></span>
  <span class="source-line"><span class="source-line-number">209</span><span class="source-line-text">  connection.onRequest(&quot;window/workDoneProgress/create&quot;, (params) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">    logger.info(&quot;window/workDoneProgress/create&quot;, params)</span></span>
  <span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">    return null</span></span>
  <span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">  })</span></span>
  <span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">  connection.onRequest(&quot;workspace/configuration&quot;, async (params) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">    const items = (params as { items?: { section?: string }[] }).items ?? []</span></span>
  <span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">    return items.map((item) =&gt; configurationValue(input.server.initialization, item.section))</span></span>
  <span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">  })</span></span>
  <span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">  connection.onRequest(&quot;client/registerCapability&quot;, async (params) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">    const registrations = (params as { registrations?: CapabilityRegistration[] }).registrations ?? []</span></span>
  <span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">    let changed = false</span></span>
  <span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">    for (const registration of registrations) {</span></span>
  <span class="source-line"><span class="source-line-number">221</span><span class="source-line-text">      if (registration.method !== &quot;textDocument/diagnostic&quot;) continue</span></span>
  <span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">      diagnosticRegistrations.set(registration.id, registration)</span></span>
  <span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">      changed = true</span></span>
  <span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">    }</span></span>
  <span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">    if (changed) emitRegistrationChange()</span></span>
  <span class="source-line"><span class="source-line-number">226</span><span class="source-line-text">  })</span></span>
  <span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">  connection.onRequest(&quot;client/unregisterCapability&quot;, async (params) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">228</span><span class="source-line-text">    const registrations = (params as { unregisterations?: { id: string; method: string }[] }).unregisterations ?? []</span></span>
  <span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">    let changed = false</span></span>
  <span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">    for (const registration of registrations) {</span></span>
  <span class="source-line"><span class="source-line-number">231</span><span class="source-line-text">      if (registration.method !== &quot;textDocument/diagnostic&quot;) continue</span></span>
  <span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">      diagnosticRegistrations.delete(registration.id)</span></span>
  <span class="source-line"><span class="source-line-number">233</span><span class="source-line-text">      changed = true</span></span>
  <span class="source-line"><span class="source-line-number">234</span><span class="source-line-text">    }</span></span>
  <span class="source-line"><span class="source-line-number">235</span><span class="source-line-text">    if (changed) emitRegistrationChange()</span></span>
  <span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">  })</span></span>
  <span class="source-line"><span class="source-line-number">237</span><span class="source-line-text">  connection.onRequest(&quot;workspace/workspaceFolders&quot;, async () =&gt; [</span></span>
  <span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">    {</span></span>
  <span class="source-line"><span class="source-line-number">239</span><span class="source-line-text">      name: &quot;workspace&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">      uri: pathToFileURL(input.root).href,</span></span>
  <span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">  ])</span></span>
  <span class="source-line"><span class="source-line-number">243</span><span class="source-line-text">  connection.onRequest(&quot;workspace/diagnostic/refresh&quot;, async () =&gt; null)</span></span>
  <span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">  connection.listen()</span></span></code></pre>
  </details>

6. `packages/opencode/src/lsp/client.ts:248-305`：initialize handshake 和 capabilities。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/lsp/client.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/lsp/client.ts:248-305</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">  logger.info(&quot;sending initialize&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">249</span><span class="source-line-text">  const initialized = await withTimeout(</span></span>
  <span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">    connection.sendRequest&lt;{ capabilities?: ServerCapabilities }&gt;(&quot;initialize&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">      rootUri: pathToFileURL(input.root).href,</span></span>
  <span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">      processId: input.server.process.pid,</span></span>
  <span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">      workspaceFolders: [</span></span>
  <span class="source-line"><span class="source-line-number">254</span><span class="source-line-text">        {</span></span>
  <span class="source-line"><span class="source-line-number">255</span><span class="source-line-text">          name: &quot;workspace&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">256</span><span class="source-line-text">          uri: pathToFileURL(input.root).href,</span></span>
  <span class="source-line"><span class="source-line-number">257</span><span class="source-line-text">        },</span></span>
  <span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">      ],</span></span>
  <span class="source-line"><span class="source-line-number">259</span><span class="source-line-text">      initializationOptions: {</span></span>
  <span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">        ...input.server.initialization,</span></span>
  <span class="source-line"><span class="source-line-number">261</span><span class="source-line-text">      },</span></span>
  <span class="source-line"><span class="source-line-number">262</span><span class="source-line-text">      capabilities: {</span></span>
  <span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">        window: {</span></span>
  <span class="source-line"><span class="source-line-number">264</span><span class="source-line-text">          workDoneProgress: true,</span></span>
  <span class="source-line"><span class="source-line-number">265</span><span class="source-line-text">        },</span></span>
  <span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">        workspace: {</span></span>
  <span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">          configuration: true,</span></span>
  <span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">          didChangeWatchedFiles: {</span></span>
  <span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">            dynamicRegistration: true,</span></span>
  <span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">          },</span></span>
  <span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">          diagnostics: {</span></span>
  <span class="source-line"><span class="source-line-number">272</span><span class="source-line-text">            refreshSupport: false,</span></span>
  <span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">          },</span></span>
  <span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">        },</span></span>
  <span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">        textDocument: {</span></span>
  <span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">          synchronization: {</span></span>
  <span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">            didOpen: true,</span></span>
  <span class="source-line"><span class="source-line-number">278</span><span class="source-line-text">            didChange: true,</span></span>
  <span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">          },</span></span>
  <span class="source-line"><span class="source-line-number">280</span><span class="source-line-text">          diagnostic: {</span></span>
  <span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">            dynamicRegistration: true,</span></span>
  <span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">            relatedDocumentSupport: true,</span></span>
  <span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">          },</span></span>
  <span class="source-line"><span class="source-line-number">284</span><span class="source-line-text">          publishDiagnostics: {</span></span>
  <span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">            versionSupport: false,</span></span>
  <span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">          },</span></span>
  <span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">        },</span></span>
  <span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">      },</span></span>
  <span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">    }),</span></span>
  <span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">    INITIALIZE_TIMEOUT_MS,</span></span>
  <span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">  ).catch((err) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">292</span><span class="source-line-text">    logger.error(&quot;initialize error&quot;, { error: err })</span></span>
  <span class="source-line"><span class="source-line-number">293</span><span class="source-line-text">    throw new InitializeError({ serverID: input.serverID, cause: err })</span></span>
  <span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">  })</span></span>
  <span class="source-line"><span class="source-line-number">295</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">296</span><span class="source-line-text">  const syncKind = getSyncKind(initialized.capabilities)</span></span>
  <span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">  const hasStaticPullDiagnostics = Boolean(initialized.capabilities?.diagnosticProvider)</span></span>
  <span class="source-line"><span class="source-line-number">298</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">  await connection.sendNotification(&quot;initialized&quot;, {})</span></span>
  <span class="source-line"><span class="source-line-number">300</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">  if (input.server.initialization) {</span></span>
  <span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">    await connection.sendNotification(&quot;workspace/didChangeConfiguration&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">      settings: input.server.initialization,</span></span>
  <span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">    })</span></span>
  <span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">  }</span></span></code></pre>
  </details>

7. `packages/opencode/src/lsp/client.ts:421-483`：pull diagnostics 请求。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/lsp/client.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/lsp/client.ts:421-483</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">421</span><span class="source-line-text">  async function requestDiagnostics(</span></span>
  <span class="source-line"><span class="source-line-number">422</span><span class="source-line-text">    filePath: string,</span></span>
  <span class="source-line"><span class="source-line-number">423</span><span class="source-line-text">    requests: Promise&lt;DiagnosticRequestResult&gt;[],</span></span>
  <span class="source-line"><span class="source-line-number">424</span><span class="source-line-text">    done: (results: DiagnosticRequestResult[]) =&gt; boolean,</span></span>
  <span class="source-line"><span class="source-line-number">425</span><span class="source-line-text">  ) {</span></span>
  <span class="source-line"><span class="source-line-number">426</span><span class="source-line-text">    if (!requests.length) return { handled: false, matched: false }</span></span>
  <span class="source-line"><span class="source-line-number">427</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">428</span><span class="source-line-text">    const results: DiagnosticRequestResult[] = []</span></span>
  <span class="source-line"><span class="source-line-number">429</span><span class="source-line-text">    return new Promise&lt;{ handled: boolean; matched: boolean }&gt;((resolve) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">430</span><span class="source-line-text">      let pending = requests.length</span></span>
  <span class="source-line"><span class="source-line-number">431</span><span class="source-line-text">      let resolved = false</span></span>
  <span class="source-line"><span class="source-line-number">432</span><span class="source-line-text">      const finish = (merged: { handled: boolean; matched: boolean }, force = false) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">433</span><span class="source-line-text">        if (resolved) return</span></span>
  <span class="source-line"><span class="source-line-number">434</span><span class="source-line-text">        if (!force &amp;&amp; !done(results)) return</span></span>
  <span class="source-line"><span class="source-line-number">435</span><span class="source-line-text">        resolved = true</span></span>
  <span class="source-line"><span class="source-line-number">436</span><span class="source-line-text">        resolve(merged)</span></span>
  <span class="source-line"><span class="source-line-number">437</span><span class="source-line-text">      }</span></span>
  <span class="source-line"><span class="source-line-number">438</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">439</span><span class="source-line-text">      for (const request of requests) {</span></span>
  <span class="source-line"><span class="source-line-number">440</span><span class="source-line-text">        request.then((result) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">441</span><span class="source-line-text">          results.push(result)</span></span>
  <span class="source-line"><span class="source-line-number">442</span><span class="source-line-text">          pending -= 1</span></span>
  <span class="source-line"><span class="source-line-number">443</span><span class="source-line-text">          const merged = mergeResults(filePath, results)</span></span>
  <span class="source-line"><span class="source-line-number">444</span><span class="source-line-text">          finish(merged)</span></span>
  <span class="source-line"><span class="source-line-number">445</span><span class="source-line-text">          if (pending === 0) finish(merged, true)</span></span>
  <span class="source-line"><span class="source-line-number">446</span><span class="source-line-text">        })</span></span>
  <span class="source-line"><span class="source-line-number">447</span><span class="source-line-text">      }</span></span>
  <span class="source-line"><span class="source-line-number">448</span><span class="source-line-text">    })</span></span>
  <span class="source-line"><span class="source-line-number">449</span><span class="source-line-text">  }</span></span>
  <span class="source-line"><span class="source-line-number">450</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">  // LATENCY-CRITICAL: dispatch identifier pulls in parallel and unblock once one</span></span>
  <span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">  // batch already produced diagnostics for the current file. Let slower pulls keep</span></span>
  <span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">  // merging in the background; do not sequence identifier-by-identifier, and do</span></span>
  <span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">  // not add a post-match settle/debounce delay. See PR #23771.</span></span>
  <span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">  async function requestDocumentDiagnostics(filePath: string) {</span></span>
  <span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">    const state = documentPullState()</span></span>
  <span class="source-line"><span class="source-line-number">457</span><span class="source-line-text">    if (!state.supported) return { handled: false, matched: false }</span></span>
  <span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">    return requestDiagnostics(</span></span>
  <span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">      filePath,</span></span>
  <span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">      [</span></span>
  <span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">        requestDiagnosticReport(filePath),</span></span>
  <span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">        ...state.documentIdentifiers.map((identifier) =&gt; requestDiagnosticReport(filePath, identifier)),</span></span>
  <span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">      ],</span></span>
  <span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">      (results) =&gt; hasCurrentFileDiagnostics(filePath, results),</span></span>
  <span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">    )</span></span>
  <span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">  }</span></span>
  <span class="source-line"><span class="source-line-number">467</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">  async function requestFullDiagnostics(filePath: string) {</span></span>
  <span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">    const documentState = documentPullState()</span></span>
  <span class="source-line"><span class="source-line-number">470</span><span class="source-line-text">    const workspaceState = workspacePullState()</span></span>
  <span class="source-line"><span class="source-line-number">471</span><span class="source-line-text">    if (!documentState.supported &amp;&amp; !workspaceState.supported) return { handled: false, matched: false }</span></span>
  <span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">    return mergeResults(</span></span>
  <span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">      filePath,</span></span>
  <span class="source-line"><span class="source-line-number">474</span><span class="source-line-text">      await Promise.all([</span></span>
  <span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">        ...(documentState.supported ? [requestDiagnosticReport(filePath)] : []),</span></span>
  <span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">        ...documentState.documentIdentifiers.map((identifier) =&gt; requestDiagnosticReport(filePath, identifier)),</span></span>
  <span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">        ...(workspaceState.supported ? [requestWorkspaceDiagnosticReport(filePath)] : []),</span></span>
  <span class="source-line"><span class="source-line-number">478</span><span class="source-line-text">        ...workspaceState.workspaceIdentifiers.map((identifier) =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">479</span><span class="source-line-text">          requestWorkspaceDiagnosticReport(filePath, identifier),</span></span>
  <span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">        ),</span></span>
  <span class="source-line"><span class="source-line-number">481</span><span class="source-line-text">      ]),</span></span>
  <span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">    )</span></span>
  <span class="source-line"><span class="source-line-number">483</span><span class="source-line-text">  }</span></span></code></pre>
  </details>

8. `packages/opencode/src/lsp/client.ts:594-692`：open/change 文件并等待 diagnostics。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/lsp/client.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/lsp/client.ts:594-692</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">594</span><span class="source-line-text">    notify: {</span></span>
  <span class="source-line"><span class="source-line-number">595</span><span class="source-line-text">      async open(request: { path: string }) {</span></span>
  <span class="source-line"><span class="source-line-number">596</span><span class="source-line-text">        request.path = Filesystem.normalizePath(</span></span>
  <span class="source-line"><span class="source-line-number">597</span><span class="source-line-text">          path.isAbsolute(request.path) ? request.path : path.resolve(input.directory, request.path),</span></span>
  <span class="source-line"><span class="source-line-number">598</span><span class="source-line-text">        )</span></span>
  <span class="source-line"><span class="source-line-number">599</span><span class="source-line-text">        const text = await Filesystem.readText(request.path)</span></span>
  <span class="source-line"><span class="source-line-number">600</span><span class="source-line-text">        const extension = path.extname(request.path)</span></span>
  <span class="source-line"><span class="source-line-number">601</span><span class="source-line-text">        const languageId = LANGUAGE_EXTENSIONS[extension] ?? &quot;plaintext&quot;</span></span>
  <span class="source-line"><span class="source-line-number">602</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">603</span><span class="source-line-text">        const document = files[request.path]</span></span>
  <span class="source-line"><span class="source-line-number">604</span><span class="source-line-text">        if (document !== undefined) {</span></span>
  <span class="source-line"><span class="source-line-number">605</span><span class="source-line-text">          // Do not wipe diagnostics on didChange. Some servers (e.g. clangd) only</span></span>
  <span class="source-line"><span class="source-line-number">606</span><span class="source-line-text">          // re-emit diagnostics when the content actually changes, so clearing</span></span>
  <span class="source-line"><span class="source-line-number">607</span><span class="source-line-text">          // here would lose errors for no-op touchFile calls. Let the server's</span></span>
  <span class="source-line"><span class="source-line-number">608</span><span class="source-line-text">          // next push/pull overwrite naturally.</span></span>
  <span class="source-line"><span class="source-line-number">609</span><span class="source-line-text">          logger.info(&quot;workspace/didChangeWatchedFiles&quot;, request)</span></span>
  <span class="source-line"><span class="source-line-number">610</span><span class="source-line-text">          await connection.sendNotification(&quot;workspace/didChangeWatchedFiles&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">611</span><span class="source-line-text">            changes: [</span></span>
  <span class="source-line"><span class="source-line-number">612</span><span class="source-line-text">              {</span></span>
  <span class="source-line"><span class="source-line-number">613</span><span class="source-line-text">                uri: pathToFileURL(request.path).href,</span></span>
  <span class="source-line"><span class="source-line-number">614</span><span class="source-line-text">                type: FILE_CHANGE_CHANGED,</span></span>
  <span class="source-line"><span class="source-line-number">615</span><span class="source-line-text">              },</span></span>
  <span class="source-line"><span class="source-line-number">616</span><span class="source-line-text">            ],</span></span>
  <span class="source-line"><span class="source-line-number">617</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">618</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">619</span><span class="source-line-text">          const next = document.version + 1</span></span>
  <span class="source-line"><span class="source-line-number">620</span><span class="source-line-text">          files[request.path] = { version: next, text }</span></span>
  <span class="source-line"><span class="source-line-number">621</span><span class="source-line-text">          logger.info(&quot;textDocument/didChange&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">622</span><span class="source-line-text">            path: request.path,</span></span>
  <span class="source-line"><span class="source-line-number">623</span><span class="source-line-text">            version: next,</span></span>
  <span class="source-line"><span class="source-line-number">624</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">625</span><span class="source-line-text">          await connection.sendNotification(&quot;textDocument/didChange&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">626</span><span class="source-line-text">            textDocument: {</span></span>
  <span class="source-line"><span class="source-line-number">627</span><span class="source-line-text">              uri: pathToFileURL(request.path).href,</span></span>
  <span class="source-line"><span class="source-line-number">628</span><span class="source-line-text">              version: next,</span></span>
  <span class="source-line"><span class="source-line-number">629</span><span class="source-line-text">            },</span></span>
  <span class="source-line"><span class="source-line-number">630</span><span class="source-line-text">            contentChanges:</span></span>
  <span class="source-line"><span class="source-line-number">631</span><span class="source-line-text">              syncKind === TEXT_DOCUMENT_SYNC_INCREMENTAL</span></span>
  <span class="source-line"><span class="source-line-number">632</span><span class="source-line-text">                ? [</span></span>
  <span class="source-line"><span class="source-line-number">633</span><span class="source-line-text">                    {</span></span>
  <span class="source-line"><span class="source-line-number">634</span><span class="source-line-text">                      range: {</span></span>
  <span class="source-line"><span class="source-line-number">635</span><span class="source-line-text">                        start: { line: 0, character: 0 },</span></span>
  <span class="source-line"><span class="source-line-number">636</span><span class="source-line-text">                        end: endPosition(document.text),</span></span>
  <span class="source-line"><span class="source-line-number">637</span><span class="source-line-text">                      },</span></span>
  <span class="source-line"><span class="source-line-number">638</span><span class="source-line-text">                      text,</span></span>
  <span class="source-line"><span class="source-line-number">639</span><span class="source-line-text">                    },</span></span>
  <span class="source-line"><span class="source-line-number">640</span><span class="source-line-text">                  ]</span></span>
  <span class="source-line"><span class="source-line-number">641</span><span class="source-line-text">                : [{ text }],</span></span>
  <span class="source-line"><span class="source-line-number">642</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">643</span><span class="source-line-text">          return next</span></span>
  <span class="source-line"><span class="source-line-number">644</span><span class="source-line-text">        }</span></span>
  <span class="source-line"><span class="source-line-number">645</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">646</span><span class="source-line-text">        logger.info(&quot;workspace/didChangeWatchedFiles&quot;, request)</span></span>
  <span class="source-line"><span class="source-line-number">647</span><span class="source-line-text">        await connection.sendNotification(&quot;workspace/didChangeWatchedFiles&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">648</span><span class="source-line-text">          changes: [</span></span>
  <span class="source-line"><span class="source-line-number">649</span><span class="source-line-text">            {</span></span>
  <span class="source-line"><span class="source-line-number">650</span><span class="source-line-text">              uri: pathToFileURL(request.path).href,</span></span>
  <span class="source-line"><span class="source-line-number">651</span><span class="source-line-text">              type: FILE_CHANGE_CREATED,</span></span>
  <span class="source-line"><span class="source-line-number">652</span><span class="source-line-text">            },</span></span>
  <span class="source-line"><span class="source-line-number">653</span><span class="source-line-text">          ],</span></span>
  <span class="source-line"><span class="source-line-number">654</span><span class="source-line-text">        })</span></span>
  <span class="source-line"><span class="source-line-number">655</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">656</span><span class="source-line-text">        logger.info(&quot;textDocument/didOpen&quot;, request)</span></span>
  <span class="source-line"><span class="source-line-number">657</span><span class="source-line-text">        pushDiagnostics.delete(request.path)</span></span>
  <span class="source-line"><span class="source-line-number">658</span><span class="source-line-text">        pullDiagnostics.delete(request.path)</span></span>
  <span class="source-line"><span class="source-line-number">659</span><span class="source-line-text">        await connection.sendNotification(&quot;textDocument/didOpen&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">660</span><span class="source-line-text">          textDocument: {</span></span>
  <span class="source-line"><span class="source-line-number">661</span><span class="source-line-text">            uri: pathToFileURL(request.path).href,</span></span>
  <span class="source-line"><span class="source-line-number">662</span><span class="source-line-text">            languageId,</span></span>
  <span class="source-line"><span class="source-line-number">663</span><span class="source-line-text">            version: 0,</span></span>
  <span class="source-line"><span class="source-line-number">664</span><span class="source-line-text">            text,</span></span>
  <span class="source-line"><span class="source-line-number">665</span><span class="source-line-text">          },</span></span>
  <span class="source-line"><span class="source-line-number">666</span><span class="source-line-text">        })</span></span>
  <span class="source-line"><span class="source-line-number">667</span><span class="source-line-text">        files[request.path] = { version: 0, text }</span></span>
  <span class="source-line"><span class="source-line-number">668</span><span class="source-line-text">        return 0</span></span>
  <span class="source-line"><span class="source-line-number">669</span><span class="source-line-text">      },</span></span>
  <span class="source-line"><span class="source-line-number">670</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">671</span><span class="source-line-text">    get diagnostics() {</span></span>
  <span class="source-line"><span class="source-line-number">672</span><span class="source-line-text">      const result = new Map&lt;string, Diagnostic[]&gt;()</span></span>
  <span class="source-line"><span class="source-line-number">673</span><span class="source-line-text">      for (const key of new Set([...pushDiagnostics.keys(), ...pullDiagnostics.keys()])) {</span></span>
  <span class="source-line"><span class="source-line-number">674</span><span class="source-line-text">        result.set(key, mergedDiagnostics(key))</span></span>
  <span class="source-line"><span class="source-line-number">675</span><span class="source-line-text">      }</span></span>
  <span class="source-line"><span class="source-line-number">676</span><span class="source-line-text">      return result</span></span>
  <span class="source-line"><span class="source-line-number">677</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">678</span><span class="source-line-text">    async waitForDiagnostics(request: { path: string; version: number; mode?: &quot;document&quot; | &quot;full&quot;; after?: number }) {</span></span>
  <span class="source-line"><span class="source-line-number">679</span><span class="source-line-text">      const normalizedPath = Filesystem.normalizePath(</span></span>
  <span class="source-line"><span class="source-line-number">680</span><span class="source-line-text">        path.isAbsolute(request.path) ? request.path : path.resolve(input.directory, request.path),</span></span>
  <span class="source-line"><span class="source-line-number">681</span><span class="source-line-text">      )</span></span>
  <span class="source-line"><span class="source-line-number">682</span><span class="source-line-text">      logger.info(&quot;waiting for diagnostics&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">683</span><span class="source-line-text">        path: normalizedPath,</span></span>
  <span class="source-line"><span class="source-line-number">684</span><span class="source-line-text">        mode: request.mode ?? &quot;full&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">685</span><span class="source-line-text">        version: request.version,</span></span>
  <span class="source-line"><span class="source-line-number">686</span><span class="source-line-text">      })</span></span>
  <span class="source-line"><span class="source-line-number">687</span><span class="source-line-text">      if (request.mode === &quot;document&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">688</span><span class="source-line-text">        await waitForDocumentDiagnostics({ path: normalizedPath, version: request.version, after: request.after })</span></span>
  <span class="source-line"><span class="source-line-number">689</span><span class="source-line-text">        return</span></span>
  <span class="source-line"><span class="source-line-number">690</span><span class="source-line-text">      }</span></span>
  <span class="source-line"><span class="source-line-number">691</span><span class="source-line-text">      await waitForFullDiagnostics({ path: normalizedPath, version: request.version, after: request.after })</span></span>
  <span class="source-line"><span class="source-line-number">692</span><span class="source-line-text">    },</span></span></code></pre>
  </details>

9. `packages/opencode/src/lsp/diagnostic.ts:5-27`：诊断格式化。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/lsp/diagnostic.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/lsp/diagnostic.ts:5-27</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">5</span><span class="source-line-text">export function pretty(diagnostic: LSPClient.Diagnostic) {</span></span>
  <span class="source-line"><span class="source-line-number">6</span><span class="source-line-text">  const severityMap = {</span></span>
  <span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">    1: &quot;ERROR&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">    2: &quot;WARN&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">    3: &quot;INFO&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">    4: &quot;HINT&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">  }</span></span>
  <span class="source-line"><span class="source-line-number">12</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">  const severity = severityMap[diagnostic.severity || 1]</span></span>
  <span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">  const line = diagnostic.range.start.line + 1</span></span>
  <span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">  const col = diagnostic.range.start.character + 1</span></span>
  <span class="source-line"><span class="source-line-number">16</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  return `${severity} [${line}:${col}] ${diagnostic.message}`</span></span>
  <span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">}</span></span>
  <span class="source-line"><span class="source-line-number">19</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">export function report(file: string, issues: LSPClient.Diagnostic[]) {</span></span>
  <span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">  const errors = issues.filter((item) =&gt; item.severity === 1)</span></span>
  <span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">  if (errors.length === 0) return &quot;&quot;</span></span>
  <span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  const limited = errors.slice(0, MAX_PER_FILE)</span></span>
  <span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">  const more = errors.length - MAX_PER_FILE</span></span>
  <span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">  const suffix = more &gt; 0 ? `\n... and ${more} more` : &quot;&quot;</span></span>
  <span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">  return `&lt;diagnostics file=&quot;${file}&quot;&gt;\n${limited.map(pretty).join(&quot;\n&quot;)}${suffix}\n&lt;/diagnostics&gt;`</span></span>
  <span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">}</span></span></code></pre>
  </details>

10. `packages/opencode/src/tool/lsp.ts:37-110`：把 LSP 操作暴露成 tool。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/tool/lsp.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/tool/lsp.ts:37-110</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">export const LspTool = Tool.define(</span></span>
  <span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">  &quot;lsp&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  Effect.gen(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">    const lsp = yield* LSP.Service</span></span>
  <span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">    const fs = yield* AppFileSystem.Service</span></span>
  <span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">    return {</span></span>
  <span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">      description: DESCRIPTION,</span></span>
  <span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">      parameters: Parameters,</span></span>
  <span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">      execute: (args: Schema.Schema.Type&lt;typeof Parameters&gt;, ctx: Tool.Context) =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">        Effect.gen(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">          const instance = yield* InstanceState.context</span></span>
  <span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">          const file = path.isAbsolute(args.filePath) ? args.filePath : path.join(instance.directory, args.filePath)</span></span>
  <span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">          yield* assertExternalDirectoryEffect(ctx, file)</span></span>
  <span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">          const meta =</span></span>
  <span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">            args.operation === &quot;workspaceSymbol&quot;</span></span>
  <span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">              ? { operation: args.operation }</span></span>
  <span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">              : args.operation === &quot;documentSymbol&quot;</span></span>
  <span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">                ? { operation: args.operation, filePath: file }</span></span>
  <span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">                : { operation: args.operation, filePath: file, line: args.line, character: args.character }</span></span>
  <span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">          yield* ctx.ask({</span></span>
  <span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">            permission: &quot;lsp&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">            patterns: [&quot;*&quot;],</span></span>
  <span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">            always: [&quot;*&quot;],</span></span>
  <span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">            metadata: meta,</span></span>
  <span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">62</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">          const uri = pathToFileURL(file).href</span></span>
  <span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">          const position = { file, line: args.line - 1, character: args.character - 1 }</span></span>
  <span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">          const relPath = path.relative(instance.worktree, file)</span></span>
  <span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">          const detail =</span></span>
  <span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">            args.operation === &quot;workspaceSymbol&quot;</span></span>
  <span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">              ? &quot;&quot;</span></span>
  <span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">              : args.operation === &quot;documentSymbol&quot;</span></span>
  <span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">                ? relPath</span></span>
  <span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">                : `${relPath}:${args.line}:${args.character}`</span></span>
  <span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">          const title = detail ? `${args.operation} ${detail}` : args.operation</span></span>
  <span class="source-line"><span class="source-line-number">73</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">          const exists = yield* fs.existsSafe(file)</span></span>
  <span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">          if (!exists) throw new Error(`File not found: ${file}`)</span></span>
  <span class="source-line"><span class="source-line-number">76</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">          const available = yield* lsp.hasClients(file)</span></span>
  <span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">          if (!available) throw new Error(&quot;No LSP server available for this file type.&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">79</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">          yield* lsp.touchFile(file, &quot;document&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">81</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">          const result: unknown[] = yield* (() =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">            switch (args.operation) {</span></span>
  <span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">              case &quot;goToDefinition&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">                return lsp.definition(position)</span></span>
  <span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">              case &quot;findReferences&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">                return lsp.references(position)</span></span>
  <span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">              case &quot;hover&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">                return lsp.hover(position)</span></span>
  <span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">              case &quot;documentSymbol&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">                return lsp.documentSymbol(uri)</span></span>
  <span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">              case &quot;workspaceSymbol&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">                return lsp.workspaceSymbol(args.query ?? &quot;&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">              case &quot;goToImplementation&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">                return lsp.implementation(position)</span></span>
  <span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">              case &quot;prepareCallHierarchy&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">                return lsp.prepareCallHierarchy(position)</span></span>
  <span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">              case &quot;incomingCalls&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">                return lsp.incomingCalls(position)</span></span>
  <span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">              case &quot;outgoingCalls&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">                return lsp.outgoingCalls(position)</span></span>
  <span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">          })()</span></span>
  <span class="source-line"><span class="source-line-number">104</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">          return {</span></span>
  <span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">            title,</span></span>
  <span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">            metadata: { result },</span></span>
  <span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">            output: result.length === 0 ? `No results found for ${args.operation}` : JSON.stringify(result, null, 2),</span></span>
  <span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">        }).pipe(Effect.orDie),</span></span></code></pre>
  </details>

11. `packages/opencode/src/tool/edit.ts:192-207`、`packages/opencode/src/tool/write.ts:80-99`：编辑后诊断回填。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/tool/edit.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/tool/edit.ts:192-207</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">          let output = &quot;Edit applied successfully.&quot;</span></span>
  <span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">          yield* lsp.touchFile(filePath, &quot;document&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">          const diagnostics = yield* lsp.diagnostics()</span></span>
  <span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">          const normalizedFilePath = AppFileSystem.normalizePath(filePath)</span></span>
  <span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">          const block = LSP.Diagnostic.report(filePath, diagnostics[normalizedFilePath] ?? [])</span></span>
  <span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">          if (block) output += `\n\nLSP errors detected in this file, please fix:\n${block}`</span></span>
  <span class="source-line"><span class="source-line-number">198</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">          return {</span></span>
  <span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">            metadata: {</span></span>
  <span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">              diagnostics,</span></span>
  <span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">              diff,</span></span>
  <span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">              filediff,</span></span>
  <span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">            },</span></span>
  <span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">            title: `${path.relative(instance.worktree, filePath)}`,</span></span>
  <span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">            output,</span></span>
  <span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">          }</span></span></code></pre>
  </details>

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/tool/write.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/tool/write.ts:80-99</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">            const current = file === normalizedFilepath</span></span>
  <span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">            if (!current &amp;&amp; projectDiagnosticsCount &gt;= MAX_PROJECT_DIAGNOSTICS_FILES) continue</span></span>
  <span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">            const block = LSP.Diagnostic.report(current ? filepath : file, issues)</span></span>
  <span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">            if (!block) continue</span></span>
  <span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">            if (current) {</span></span>
  <span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">              output += `\n\nLSP errors detected in this file, please fix:\n${block}`</span></span>
  <span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">              continue</span></span>
  <span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">            projectDiagnosticsCount++</span></span>
  <span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">            output += `\n\nLSP errors detected in other files:\n${block}`</span></span>
  <span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">91</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">          return {</span></span>
  <span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">            title: path.relative(instance.worktree, filepath),</span></span>
  <span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">            metadata: {</span></span>
  <span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">              diagnostics,</span></span>
  <span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">              filepath,</span></span>
  <span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">              exists: exists,</span></span>
  <span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">            },</span></span>
  <span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">            output,</span></span></code></pre>
  </details>


## 6. 用户输入到 agent 行动的整体链路

### 6.1 edit/write 后触发诊断

编辑成功后，`EditTool` 会触发 LSP：

```ts
let output = "Edit applied successfully."
yield* lsp.touchFile(filePath, "document")
const diagnostics = yield* lsp.diagnostics()
const normalizedFilePath = AppFileSystem.normalizePath(filePath)
const block = LSP.Diagnostic.report(filePath, diagnostics[normalizedFilePath] ?? [])
if (block) output += `\n\nLSP errors detected in this file, please fix:\n${block}`
```

路径：`packages/opencode/src/tool/edit.ts:192-197`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/edit.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/edit.ts:192-197</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">          let output = &quot;Edit applied successfully.&quot;</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">          yield* lsp.touchFile(filePath, &quot;document&quot;)</span></span>
<span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">          const diagnostics = yield* lsp.diagnostics()</span></span>
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">          const normalizedFilePath = AppFileSystem.normalizePath(filePath)</span></span>
<span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">          const block = LSP.Diagnostic.report(filePath, diagnostics[normalizedFilePath] ?? [])</span></span>
<span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">          if (block) output += `\n\nLSP errors detected in this file, please fix:\n${block}`</span></span></code></pre>
</details>


`WriteTool` 会把当前文件和其它文件的 diagnostics 都拼到输出里：

```ts
const block = LSP.Diagnostic.report(current ? filepath : file, issues)
if (!block) continue
if (current) {
  output += `\n\nLSP errors detected in this file, please fix:\n${block}`
  continue
}
projectDiagnosticsCount++
output += `\n\nLSP errors detected in other files:\n${block}`
```

路径：`packages/opencode/src/tool/write.ts:80-89`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/write.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/write.ts:80-89</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">            const current = file === normalizedFilepath</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">            if (!current &amp;&amp; projectDiagnosticsCount &gt;= MAX_PROJECT_DIAGNOSTICS_FILES) continue</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">            const block = LSP.Diagnostic.report(current ? filepath : file, issues)</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">            if (!block) continue</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">            if (current) {</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">              output += `\n\nLSP errors detected in this file, please fix:\n${block}`</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">              continue</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">            projectDiagnosticsCount++</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">            output += `\n\nLSP errors detected in other files:\n${block}`</span></span></code></pre>
</details>


这就是 agent 能“改了继续修”的关键反馈链路。

### 6.2 lsp tool 主动查询语义

```ts
const operations = [
  "goToDefinition",
  "findReferences",
  "hover",
  "documentSymbol",
  "workspaceSymbol",
  "goToImplementation",
  "prepareCallHierarchy",
  "incomingCalls",
  "outgoingCalls",
] as const
```

路径：`packages/opencode/src/tool/lsp.ts:11-21`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/lsp.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/lsp.ts:11-21</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">const operations = [</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">  &quot;goToDefinition&quot;,</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">  &quot;findReferences&quot;,</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">  &quot;hover&quot;,</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">  &quot;documentSymbol&quot;,</span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">  &quot;workspaceSymbol&quot;,</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  &quot;goToImplementation&quot;,</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">  &quot;prepareCallHierarchy&quot;,</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">  &quot;incomingCalls&quot;,</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">  &quot;outgoingCalls&quot;,</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">] as const</span></span></code></pre>
</details>


执行时先做路径和权限检查：

```ts
const file = path.isAbsolute(args.filePath) ? args.filePath : path.join(instance.directory, args.filePath)
yield* assertExternalDirectoryEffect(ctx, file)
yield* ctx.ask({
  permission: "lsp",
  patterns: ["*"],
  always: ["*"],
  metadata: meta,
})
```

路径：`packages/opencode/src/tool/lsp.ts:47-61`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/lsp.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/lsp.ts:47-61</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">          const instance = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">          const file = path.isAbsolute(args.filePath) ? args.filePath : path.join(instance.directory, args.filePath)</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">          yield* assertExternalDirectoryEffect(ctx, file)</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">          const meta =</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">            args.operation === &quot;workspaceSymbol&quot;</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">              ? { operation: args.operation }</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">              : args.operation === &quot;documentSymbol&quot;</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">                ? { operation: args.operation, filePath: file }</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">                : { operation: args.operation, filePath: file, line: args.line, character: args.character }</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">          yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">            permission: &quot;lsp&quot;,</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">            patterns: [&quot;*&quot;],</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">            always: [&quot;*&quot;],</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">            metadata: meta,</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">          })</span></span></code></pre>
</details>


然后检查文件存在、是否有可用 client，触发 document diagnostics，再执行具体操作：

```ts
const exists = yield* fs.existsSafe(file)
if (!exists) throw new Error(`File not found: ${file}`)

const available = yield* lsp.hasClients(file)
if (!available) throw new Error("No LSP server available for this file type.")

yield* lsp.touchFile(file, "document")

const result: unknown[] = yield* (() => {
  switch (args.operation) {
    case "goToDefinition":
      return lsp.definition(position)
    case "findReferences":
      return lsp.references(position)
    case "hover":
      return lsp.hover(position)
    case "documentSymbol":
      return lsp.documentSymbol(uri)
    case "workspaceSymbol":
      return lsp.workspaceSymbol(args.query ?? "")
    ...
  }
})()
```

路径：`packages/opencode/src/tool/lsp.ts:74-103`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/lsp.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/lsp.ts:74-103</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">          const exists = yield* fs.existsSafe(file)</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">          if (!exists) throw new Error(`File not found: ${file}`)</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">          const available = yield* lsp.hasClients(file)</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">          if (!available) throw new Error(&quot;No LSP server available for this file type.&quot;)</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">          yield* lsp.touchFile(file, &quot;document&quot;)</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">          const result: unknown[] = yield* (() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">            switch (args.operation) {</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">              case &quot;goToDefinition&quot;:</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">                return lsp.definition(position)</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">              case &quot;findReferences&quot;:</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">                return lsp.references(position)</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">              case &quot;hover&quot;:</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">                return lsp.hover(position)</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">              case &quot;documentSymbol&quot;:</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">                return lsp.documentSymbol(uri)</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">              case &quot;workspaceSymbol&quot;:</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">                return lsp.workspaceSymbol(args.query ?? &quot;&quot;)</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">              case &quot;goToImplementation&quot;:</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">                return lsp.implementation(position)</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">              case &quot;prepareCallHierarchy&quot;:</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">                return lsp.prepareCallHierarchy(position)</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">              case &quot;incomingCalls&quot;:</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">                return lsp.incomingCalls(position)</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">              case &quot;outgoingCalls&quot;:</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">                return lsp.outgoingCalls(position)</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">          })()</span></span></code></pre>
</details>


### 6.3 按文件懒启动 LSP client

```ts
const getClients = Effect.fnUntraced(function* (file: string) {
  const ctx = yield* InstanceState.context
  if (!containsPath(file, ctx)) return [] as LSPClient.Info[]
  const s = yield* InstanceState.get(state)
  return yield* Effect.promise(async () => {
    const extension = path.parse(file).ext || file
    const result: LSPClient.Info[] = []

    for (const server of Object.values(s.servers)) {
      if (server.extensions.length && !server.extensions.includes(extension)) continue

      const root = await server.root(file, ctx)
      if (!root) continue
      if (s.broken.has(root + server.id)) continue

      const match = s.clients.find((x) => x.root === root && x.serverID === server.id)
      if (match) {
        result.push(match)
        continue
      }

      const inflight = s.spawning.get(root + server.id)
      if (inflight) {
        const client = await inflight
        if (!client) continue
        result.push(client)
        continue
      }

      const task = schedule(server, root, root + server.id)
      s.spawning.set(root + server.id, task)
      const client = await task
      if (!client) continue

      result.push(client)
      await Bus.publish(ctx, Event.Updated, {})
    }

    return result
  })
})
```

路径：`packages/opencode/src/lsp/lsp.ts:211-299`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/lsp.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/lsp.ts:211-299</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">    const getClients = Effect.fnUntraced(function* (file: string) {</span></span>
<span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">      const ctx = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">      if (!containsPath(file, ctx)) return [] as LSPClient.Info[]</span></span>
<span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">      const s = yield* InstanceState.get(state)</span></span>
<span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">      return yield* Effect.promise(async () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">        const extension = path.parse(file).ext || file</span></span>
<span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">        const result: LSPClient.Info[] = []</span></span>
<span class="source-line"><span class="source-line-number">218</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">        async function schedule(server: LSPServer.Info, root: string, key: string) {</span></span>
<span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">          const handle = await server</span></span>
<span class="source-line"><span class="source-line-number">221</span><span class="source-line-text">            .spawn(root, ctx, flags)</span></span>
<span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">            .then((value) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">              if (!value) s.broken.add(key)</span></span>
<span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">              return value</span></span>
<span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">226</span><span class="source-line-text">            .catch((err) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">              s.broken.add(key)</span></span>
<span class="source-line"><span class="source-line-number">228</span><span class="source-line-text">              log.error(`Failed to spawn LSP server ${server.id}`, { error: err })</span></span>
<span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">              return undefined</span></span>
<span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">231</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">          if (!handle) return undefined</span></span>
<span class="source-line"><span class="source-line-number">233</span><span class="source-line-text">          log.info(&quot;spawned lsp server&quot;, { serverID: server.id, root })</span></span>
<span class="source-line"><span class="source-line-number">234</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">235</span><span class="source-line-text">          const client = await LSPClient.create({</span></span>
<span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">            serverID: server.id,</span></span>
<span class="source-line"><span class="source-line-number">237</span><span class="source-line-text">            server: handle,</span></span>
<span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">            root,</span></span>
<span class="source-line"><span class="source-line-number">239</span><span class="source-line-text">            directory: ctx.directory,</span></span>
<span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">            instance: ctx,</span></span>
<span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">          }).catch(async (err) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">            s.broken.add(key)</span></span>
<span class="source-line"><span class="source-line-number">243</span><span class="source-line-text">            await Process.stop(handle.process)</span></span>
<span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">            log.error(`Failed to initialize LSP client ${server.id}`, { error: err })</span></span>
<span class="source-line"><span class="source-line-number">245</span><span class="source-line-text">            return undefined</span></span>
<span class="source-line"><span class="source-line-number">246</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">247</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">          if (!client) return undefined</span></span>
<span class="source-line"><span class="source-line-number">249</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">          const existing = s.clients.find((x) =&gt; x.root === root &amp;&amp; x.serverID === server.id)</span></span>
<span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">          if (existing) {</span></span>
<span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">            await Process.stop(handle.process)</span></span>
<span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">            return existing</span></span>
<span class="source-line"><span class="source-line-number">254</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">255</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">256</span><span class="source-line-text">          s.clients.push(client)</span></span>
<span class="source-line"><span class="source-line-number">257</span><span class="source-line-text">          return client</span></span>
<span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">259</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">        for (const server of Object.values(s.servers)) {</span></span>
<span class="source-line"><span class="source-line-number">261</span><span class="source-line-text">          if (server.extensions.length &amp;&amp; !server.extensions.includes(extension)) continue</span></span>
<span class="source-line"><span class="source-line-number">262</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">          const root = await server.root(file, ctx)</span></span>
<span class="source-line"><span class="source-line-number">264</span><span class="source-line-text">          if (!root) continue</span></span>
<span class="source-line"><span class="source-line-number">265</span><span class="source-line-text">          if (s.broken.has(root + server.id)) continue</span></span>
<span class="source-line"><span class="source-line-number">266</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">          const match = s.clients.find((x) =&gt; x.root === root &amp;&amp; x.serverID === server.id)</span></span>
<span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">          if (match) {</span></span>
<span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">            result.push(match)</span></span>
<span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">272</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">          const inflight = s.spawning.get(root + server.id)</span></span>
<span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">          if (inflight) {</span></span>
<span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">            const client = await inflight</span></span>
<span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">            if (!client) continue</span></span>
<span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">            result.push(client)</span></span>
<span class="source-line"><span class="source-line-number">278</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">          const task = schedule(server, root, root + server.id)</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">          s.spawning.set(root + server.id, task)</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text">          task.finally(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">            if (s.spawning.get(root + server.id) === task) {</span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">              s.spawning.delete(root + server.id)</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">289</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">          const client = await task</span></span>
<span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">          if (!client) continue</span></span>
<span class="source-line"><span class="source-line-number">292</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">293</span><span class="source-line-text">          result.push(client)</span></span>
<span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">          await Bus.publish(ctx, Event.Updated, {})</span></span>
<span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">        return result</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">    })</span></span></code></pre>
</details>


关键点：

- 只处理 instance 内部文件：`containsPath(file, ctx)`。
- 根据 extension 匹配 server。
- 根据 server root function 找项目根。
- 已有 client 直接复用。
- 正在 spawn 的 client 复用 inflight promise，避免重复启动。
- 启动失败会放入 `broken`，避免反复重试。

## 7. 核心源码逐段讲解

### 7.1 LSP service interface

```ts
export interface Interface {
  readonly init: () => Effect.Effect<void>
  readonly status: () => Effect.Effect<Status[]>
  readonly hasClients: (file: string) => Effect.Effect<boolean>
  readonly touchFile: (input: string, diagnostics?: "document" | "full") => Effect.Effect<void>
  readonly diagnostics: () => Effect.Effect<Record<string, LSPClient.Diagnostic[]>>
  readonly hover: (input: LocInput) => Effect.Effect<any>
  readonly definition: (input: LocInput) => Effect.Effect<any[]>
  readonly references: (input: LocInput) => Effect.Effect<any[]>
  readonly implementation: (input: LocInput) => Effect.Effect<any[]>
  readonly documentSymbol: (uri: string) => Effect.Effect<(DocumentSymbol | Symbol)[]>
  readonly workspaceSymbol: (query: string) => Effect.Effect<Symbol[]>
  readonly prepareCallHierarchy: (input: LocInput) => Effect.Effect<any[]>
  readonly incomingCalls: (input: LocInput) => Effect.Effect<any[]>
  readonly outgoingCalls: (input: LocInput) => Effect.Effect<any[]>
}
```

路径：`packages/opencode/src/lsp/lsp.ts:123-138`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/lsp.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/lsp.ts:123-138</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">export interface Interface {</span></span>
<span class="source-line"><span class="source-line-number">124</span><span class="source-line-text">  readonly init: () =&gt; Effect.Effect&lt;void&gt;</span></span>
<span class="source-line"><span class="source-line-number">125</span><span class="source-line-text">  readonly status: () =&gt; Effect.Effect&lt;Status[]&gt;</span></span>
<span class="source-line"><span class="source-line-number">126</span><span class="source-line-text">  readonly hasClients: (file: string) =&gt; Effect.Effect&lt;boolean&gt;</span></span>
<span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">  readonly touchFile: (input: string, diagnostics?: &quot;document&quot; | &quot;full&quot;) =&gt; Effect.Effect&lt;void&gt;</span></span>
<span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">  readonly diagnostics: () =&gt; Effect.Effect&lt;Record&lt;string, LSPClient.Diagnostic[]&gt;&gt;</span></span>
<span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">  readonly hover: (input: LocInput) =&gt; Effect.Effect&lt;any&gt;</span></span>
<span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">  readonly definition: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
<span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">  readonly references: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
<span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">  readonly implementation: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
<span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">  readonly documentSymbol: (uri: string) =&gt; Effect.Effect&lt;(DocumentSymbol | Symbol)[]&gt;</span></span>
<span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">  readonly workspaceSymbol: (query: string) =&gt; Effect.Effect&lt;Symbol[]&gt;</span></span>
<span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">  readonly prepareCallHierarchy: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
<span class="source-line"><span class="source-line-number">136</span><span class="source-line-text">  readonly incomingCalls: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
<span class="source-line"><span class="source-line-number">137</span><span class="source-line-text">  readonly outgoingCalls: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
<span class="source-line"><span class="source-line-number">138</span><span class="source-line-text">}</span></span></code></pre>
</details>


这个接口分三类：生命周期/状态、诊断、语义查询。

### 7.2 server 配置和自定义 LSP

```ts
if (!cfg.lsp) {
  log.info("all LSPs are disabled")
} else {
  for (const server of Object.values(LSPServer)) {
    servers[server.id] = server
  }

  filterExperimentalServers(servers, flags)

  if (cfg.lsp !== true) {
    for (const [name, item] of Object.entries(cfg.lsp)) {
      const existing = servers[name]
      if (item.disabled) {
        delete servers[name]
        continue
      }
      servers[name] = {
        ...existing,
        id: name,
        root: existing?.root ?? (async (_file, ctx) => ctx.directory),
        extensions: item.extensions ?? existing?.extensions ?? [],
        spawn: async (root) => ({
          process: lspspawn(item.command[0], item.command.slice(1), {
            cwd: root,
            env: { ...process.env, ...item.env },
          }),
          initialization: item.initialization,
        }),
      }
    }
  }
}
```

路径：`packages/opencode/src/lsp/lsp.ts:154-185`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/lsp.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/lsp.ts:154-185</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">        if (!cfg.lsp) {</span></span>
<span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">          log.info(&quot;all LSPs are disabled&quot;)</span></span>
<span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">        } else {</span></span>
<span class="source-line"><span class="source-line-number">157</span><span class="source-line-text">          for (const server of Object.values(LSPServer)) {</span></span>
<span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">            servers[server.id] = server</span></span>
<span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">          filterExperimentalServers(servers, flags)</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">          if (cfg.lsp !== true) {</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">            for (const [name, item] of Object.entries(cfg.lsp)) {</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">              const existing = servers[name]</span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">              if (item.disabled) {</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">                log.info(`LSP server ${name} is disabled`)</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">                delete servers[name]</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">                continue</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">              servers[name] = {</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">                ...existing,</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">                id: name,</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">                root: existing?.root ?? (async (_file, ctx) =&gt; ctx.directory),</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">                extensions: item.extensions ?? existing?.extensions ?? [],</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">                spawn: async (root) =&gt; ({</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">                  process: lspspawn(item.command[0], item.command.slice(1), {</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">                    cwd: root,</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">                    env: { ...process.env, ...item.env },</span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">                  }),</span></span>
<span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">                  initialization: item.initialization,</span></span>
<span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">                }),</span></span>
<span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">          }</span></span></code></pre>
</details>


LSP 可以全关、使用内置 server，也可以通过配置覆盖/新增 server。这里的 `spawn` 是用户配置命令。

### 7.3 TypeScript language server 配置

```ts
export const Typescript: Info = {
  id: "typescript",
  root: NearestRoot(
    ["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock"],
    ["deno.json", "deno.jsonc"],
  ),
  extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
  async spawn(root, ctx) {
    const tsserver = Module.resolve("typescript/lib/tsserver.js", ctx.directory)
    if (!tsserver) return
    const bin = await Npm.which("typescript-language-server")
    if (!bin) return
    const proc = spawn(bin, ["--stdio"], {
      cwd: root,
      env: { ...process.env },
    })
    return {
      process: proc,
      initialization: {
        tsserver: { path: tsserver },
      },
    }
  },
}
```

路径：`packages/opencode/src/lsp/server.ts:94-121`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/server.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/server.ts:94-121</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">export const Typescript: Info = {</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">  id: &quot;typescript&quot;,</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">  root: NearestRoot(</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">    [&quot;package-lock.json&quot;, &quot;bun.lockb&quot;, &quot;bun.lock&quot;, &quot;pnpm-lock.yaml&quot;, &quot;yarn.lock&quot;],</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">    [&quot;deno.json&quot;, &quot;deno.jsonc&quot;],</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">  ),</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">  extensions: [&quot;.ts&quot;, &quot;.tsx&quot;, &quot;.js&quot;, &quot;.jsx&quot;, &quot;.mjs&quot;, &quot;.cjs&quot;, &quot;.mts&quot;, &quot;.cts&quot;],</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">  async spawn(root, ctx) {</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">    const tsserver = Module.resolve(&quot;typescript/lib/tsserver.js&quot;, ctx.directory)</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">    log.info(&quot;typescript server&quot;, { tsserver })</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">    if (!tsserver) return</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">    const bin = await Npm.which(&quot;typescript-language-server&quot;)</span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">    if (!bin) return</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">    const proc = spawn(bin, [&quot;--stdio&quot;], {</span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">      cwd: root,</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">      env: {</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">        ...process.env,</span></span>
<span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">    return {</span></span>
<span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">      process: proc,</span></span>
<span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">      initialization: {</span></span>
<span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">        tsserver: {</span></span>
<span class="source-line"><span class="source-line-number">117</span><span class="source-line-text">          path: tsserver,</span></span>
<span class="source-line"><span class="source-line-number">118</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">120</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">  },</span></span></code></pre>
</details>


Java 类比：这是一个 `LanguageServerFactory`，按文件扩展和项目根决定是否能服务。

### 7.4 创建 JSON-RPC client

```ts
const connection = createMessageConnection(
  new StreamMessageReader(input.server.process.stdout as any),
  new StreamMessageWriter(input.server.process.stdin as any),
)
```

路径：`packages/opencode/src/lsp/client.ts:152-155`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/client.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/client.ts:152-155</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">  const connection = createMessageConnection(</span></span>
<span class="source-line"><span class="source-line-number">153</span><span class="source-line-text">    new StreamMessageReader(input.server.process.stdout as any),</span></span>
<span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">    new StreamMessageWriter(input.server.process.stdin as any),</span></span>
<span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">  )</span></span></code></pre>
</details>


LSP 本质是基于 stdin/stdout 的 JSON-RPC。OpenCode 启动 language server 进程，然后用 `vscode-jsonrpc` 建连接。

initialize 请求：

```ts
const initialized = await withTimeout(
  connection.sendRequest<{ capabilities?: ServerCapabilities }>("initialize", {
    rootUri: pathToFileURL(input.root).href,
    processId: input.server.process.pid,
    workspaceFolders: [
      {
        name: "workspace",
        uri: pathToFileURL(input.root).href,
      },
    ],
    initializationOptions: {
      ...input.server.initialization,
    },
    capabilities: {
      workspace: {
        configuration: true,
        didChangeWatchedFiles: { dynamicRegistration: true },
        diagnostics: { refreshSupport: false },
      },
      textDocument: {
        synchronization: { didOpen: true, didChange: true },
        diagnostic: { dynamicRegistration: true, relatedDocumentSupport: true },
        publishDiagnostics: { versionSupport: false },
      },
    },
  }),
  INITIALIZE_TIMEOUT_MS,
)
```

路径：`packages/opencode/src/lsp/client.ts:248-290`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/client.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/client.ts:248-290</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">  logger.info(&quot;sending initialize&quot;)</span></span>
<span class="source-line"><span class="source-line-number">249</span><span class="source-line-text">  const initialized = await withTimeout(</span></span>
<span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">    connection.sendRequest&lt;{ capabilities?: ServerCapabilities }&gt;(&quot;initialize&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">      rootUri: pathToFileURL(input.root).href,</span></span>
<span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">      processId: input.server.process.pid,</span></span>
<span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">      workspaceFolders: [</span></span>
<span class="source-line"><span class="source-line-number">254</span><span class="source-line-text">        {</span></span>
<span class="source-line"><span class="source-line-number">255</span><span class="source-line-text">          name: &quot;workspace&quot;,</span></span>
<span class="source-line"><span class="source-line-number">256</span><span class="source-line-text">          uri: pathToFileURL(input.root).href,</span></span>
<span class="source-line"><span class="source-line-number">257</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">      ],</span></span>
<span class="source-line"><span class="source-line-number">259</span><span class="source-line-text">      initializationOptions: {</span></span>
<span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">        ...input.server.initialization,</span></span>
<span class="source-line"><span class="source-line-number">261</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">262</span><span class="source-line-text">      capabilities: {</span></span>
<span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">        window: {</span></span>
<span class="source-line"><span class="source-line-number">264</span><span class="source-line-text">          workDoneProgress: true,</span></span>
<span class="source-line"><span class="source-line-number">265</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">        workspace: {</span></span>
<span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">          configuration: true,</span></span>
<span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">          didChangeWatchedFiles: {</span></span>
<span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">            dynamicRegistration: true,</span></span>
<span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">          diagnostics: {</span></span>
<span class="source-line"><span class="source-line-number">272</span><span class="source-line-text">            refreshSupport: false,</span></span>
<span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">        textDocument: {</span></span>
<span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">          synchronization: {</span></span>
<span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">            didOpen: true,</span></span>
<span class="source-line"><span class="source-line-number">278</span><span class="source-line-text">            didChange: true,</span></span>
<span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text">          diagnostic: {</span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">            dynamicRegistration: true,</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">            relatedDocumentSupport: true,</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text">          publishDiagnostics: {</span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">            versionSupport: false,</span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">    }),</span></span>
<span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">    INITIALIZE_TIMEOUT_MS,</span></span></code></pre>
</details>


### 7.5 push diagnostics 和 pull diagnostics

push diagnostics 来自 server 主动推送：

```ts
connection.onNotification("textDocument/publishDiagnostics", (params) => {
  const filePath = getFilePath(params.uri)
  if (!filePath) return
  published.set(filePath, {
    at: Date.now(),
    version: typeof params.version === "number" ? params.version : undefined,
  })
  if (shouldSeedDiagnosticsOnFirstPush(input.serverID) && !pushDiagnostics.has(filePath)) {
    pushDiagnostics.set(filePath, params.diagnostics)
    return
  }
  updatePushDiagnostics(filePath, params.diagnostics)
})
```

路径：`packages/opencode/src/lsp/client.ts:191-208`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/client.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/client.ts:191-208</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">  connection.onNotification(&quot;textDocument/publishDiagnostics&quot;, (params) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">    const filePath = getFilePath(params.uri)</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">    if (!filePath) return</span></span>
<span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">    logger.info(&quot;textDocument/publishDiagnostics&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      path: filePath,</span></span>
<span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">      count: params.diagnostics.length,</span></span>
<span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">      version: params.version,</span></span>
<span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">    published.set(filePath, {</span></span>
<span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">      at: Date.now(),</span></span>
<span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">      version: typeof params.version === &quot;number&quot; ? params.version : undefined,</span></span>
<span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">    if (shouldSeedDiagnosticsOnFirstPush(input.serverID) &amp;&amp; !pushDiagnostics.has(filePath)) {</span></span>
<span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">      pushDiagnostics.set(filePath, params.diagnostics)</span></span>
<span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">      return</span></span>
<span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">    updatePushDiagnostics(filePath, params.diagnostics)</span></span>
<span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">  })</span></span></code></pre>
</details>


pull diagnostics 是 OpenCode 主动请求：

```ts
async function requestDiagnosticReport(filePath: string, identifier?: string): Promise<DiagnosticRequestResult> {
  const report = await withTimeout(
    connection.sendRequest<DocumentDiagnosticReport | null>("textDocument/diagnostic", {
      ...(identifier ? { identifier } : {}),
      textDocument: {
        uri: pathToFileURL(filePath).href,
      },
    }),
    DIAGNOSTICS_REQUEST_TIMEOUT_MS,
  ).catch(() => null)
  if (!report) return { handled: false, matched: false, byFile: new Map<string, Diagnostic[]>() }
  ...
}
```

路径：`packages/opencode/src/lsp/client.ts:332-366`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/client.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/client.ts:332-366</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">332</span><span class="source-line-text">  async function requestDiagnosticReport(filePath: string, identifier?: string): Promise&lt;DiagnosticRequestResult&gt; {</span></span>
<span class="source-line"><span class="source-line-number">333</span><span class="source-line-text">    const report = await withTimeout(</span></span>
<span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">      connection.sendRequest&lt;DocumentDiagnosticReport | null&gt;(&quot;textDocument/diagnostic&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">        ...(identifier ? { identifier } : {}),</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">        textDocument: {</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text">          uri: pathToFileURL(filePath).href,</span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text">      }),</span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">      DIAGNOSTICS_REQUEST_TIMEOUT_MS,</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">    ).catch(() =&gt; null)</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text">    if (!report) return { handled: false, matched: false, byFile: new Map&lt;string, Diagnostic[]&gt;() }</span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text">    const byFile = new Map&lt;string, Diagnostic[]&gt;()</span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">    const push = (target: string, items: Diagnostic[]) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">346</span><span class="source-line-text">      const existing = byFile.get(target) ?? []</span></span>
<span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">      byFile.set(target, existing.concat(items))</span></span>
<span class="source-line"><span class="source-line-number">348</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">349</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">    let handled = false</span></span>
<span class="source-line"><span class="source-line-number">351</span><span class="source-line-text">    let matched = false</span></span>
<span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">    if (Array.isArray(report.items)) {</span></span>
<span class="source-line"><span class="source-line-number">353</span><span class="source-line-text">      push(filePath, report.items)</span></span>
<span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">      handled = true</span></span>
<span class="source-line"><span class="source-line-number">355</span><span class="source-line-text">      matched = true</span></span>
<span class="source-line"><span class="source-line-number">356</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">357</span><span class="source-line-text">    for (const [uri, related] of Object.entries(report.relatedDocuments ?? {})) {</span></span>
<span class="source-line"><span class="source-line-number">358</span><span class="source-line-text">      const relatedPath = getFilePath(uri)</span></span>
<span class="source-line"><span class="source-line-number">359</span><span class="source-line-text">      if (!relatedPath || !Array.isArray(related.items)) continue</span></span>
<span class="source-line"><span class="source-line-number">360</span><span class="source-line-text">      push(relatedPath, related.items)</span></span>
<span class="source-line"><span class="source-line-number">361</span><span class="source-line-text">      handled = true</span></span>
<span class="source-line"><span class="source-line-number">362</span><span class="source-line-text">      matched = matched || relatedPath === filePath</span></span>
<span class="source-line"><span class="source-line-number">363</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">364</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">365</span><span class="source-line-text">    return { handled, matched, byFile }</span></span>
<span class="source-line"><span class="source-line-number">366</span><span class="source-line-text">  }</span></span></code></pre>
</details>


这解释了为什么 LSP diagnostics 逻辑比“读一个错误列表”复杂：有些 server push，有些支持 pull，有些动态注册 diagnostic capability。

### 7.6 touchFile

```ts
const touchFile = Effect.fn("LSP.touchFile")(function* (input: string, diagnostics?: "document" | "full") {
  const clients = yield* getClients(input)
  yield* Effect.promise(() =>
    Promise.all(
      clients.map(async (client) => {
        const after = Date.now()
        const version = await client.notify.open({ path: input })
        if (!diagnostics) return
        return client.waitForDiagnostics({
          path: input,
          version,
          mode: diagnostics,
          after,
        })
      }),
    ).catch((err) => {
      log.error("failed to touch file", { err, file: input })
    }),
  )
})
```

路径：`packages/opencode/src/lsp/lsp.ts:346-366`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/lsp.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/lsp.ts:346-366</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">346</span><span class="source-line-text">    const touchFile = Effect.fn(&quot;LSP.touchFile&quot;)(function* (input: string, diagnostics?: &quot;document&quot; | &quot;full&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">      log.info(&quot;touching file&quot;, { file: input })</span></span>
<span class="source-line"><span class="source-line-number">348</span><span class="source-line-text">      const clients = yield* getClients(input)</span></span>
<span class="source-line"><span class="source-line-number">349</span><span class="source-line-text">      yield* Effect.promise(() =&gt;</span></span>
<span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">        Promise.all(</span></span>
<span class="source-line"><span class="source-line-number">351</span><span class="source-line-text">          clients.map(async (client) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">            const after = Date.now()</span></span>
<span class="source-line"><span class="source-line-number">353</span><span class="source-line-text">            const version = await client.notify.open({ path: input })</span></span>
<span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">            if (!diagnostics) return</span></span>
<span class="source-line"><span class="source-line-number">355</span><span class="source-line-text">            return client.waitForDiagnostics({</span></span>
<span class="source-line"><span class="source-line-number">356</span><span class="source-line-text">              path: input,</span></span>
<span class="source-line"><span class="source-line-number">357</span><span class="source-line-text">              version,</span></span>
<span class="source-line"><span class="source-line-number">358</span><span class="source-line-text">              mode: diagnostics,</span></span>
<span class="source-line"><span class="source-line-number">359</span><span class="source-line-text">              after,</span></span>
<span class="source-line"><span class="source-line-number">360</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">361</span><span class="source-line-text">          }),</span></span>
<span class="source-line"><span class="source-line-number">362</span><span class="source-line-text">        ).catch((err) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">363</span><span class="source-line-text">          log.error(&quot;failed to touch file&quot;, { err, file: input })</span></span>
<span class="source-line"><span class="source-line-number">364</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">365</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">366</span><span class="source-line-text">    })</span></span></code></pre>
</details>


`touchFile` 做两件事：打开/变更文件，必要时等待诊断。它吞掉错误并记录日志，避免 LSP 故障直接让 edit/write 失败。

### 7.7 client.notify.open

```ts
async open(request: { path: string }) {
  request.path = Filesystem.normalizePath(
    path.isAbsolute(request.path) ? request.path : path.resolve(input.directory, request.path),
  )
  const text = await Filesystem.readText(request.path)
  const extension = path.extname(request.path)
  const languageId = LANGUAGE_EXTENSIONS[extension] ?? "plaintext"

  const document = files[request.path]
  if (document !== undefined) {
    await connection.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [{ uri: pathToFileURL(request.path).href, type: FILE_CHANGE_CHANGED }],
    })
    const next = document.version + 1
    files[request.path] = { version: next, text }
    await connection.sendNotification("textDocument/didChange", {
      textDocument: { uri: pathToFileURL(request.path).href, version: next },
      contentChanges: syncKind === TEXT_DOCUMENT_SYNC_INCREMENTAL
        ? [{ range: { start: { line: 0, character: 0 }, end: endPosition(document.text) }, text }]
        : [{ text }],
    })
    return next
  }

  await connection.sendNotification("textDocument/didOpen", {
    textDocument: {
      uri: pathToFileURL(request.path).href,
      languageId,
      version: 0,
      text,
    },
  })
  files[request.path] = { version: 0, text }
  return 0
}
```

路径：`packages/opencode/src/lsp/client.ts:594-669`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/client.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/client.ts:594-669</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">594</span><span class="source-line-text">    notify: {</span></span>
<span class="source-line"><span class="source-line-number">595</span><span class="source-line-text">      async open(request: { path: string }) {</span></span>
<span class="source-line"><span class="source-line-number">596</span><span class="source-line-text">        request.path = Filesystem.normalizePath(</span></span>
<span class="source-line"><span class="source-line-number">597</span><span class="source-line-text">          path.isAbsolute(request.path) ? request.path : path.resolve(input.directory, request.path),</span></span>
<span class="source-line"><span class="source-line-number">598</span><span class="source-line-text">        )</span></span>
<span class="source-line"><span class="source-line-number">599</span><span class="source-line-text">        const text = await Filesystem.readText(request.path)</span></span>
<span class="source-line"><span class="source-line-number">600</span><span class="source-line-text">        const extension = path.extname(request.path)</span></span>
<span class="source-line"><span class="source-line-number">601</span><span class="source-line-text">        const languageId = LANGUAGE_EXTENSIONS[extension] ?? &quot;plaintext&quot;</span></span>
<span class="source-line"><span class="source-line-number">602</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">603</span><span class="source-line-text">        const document = files[request.path]</span></span>
<span class="source-line"><span class="source-line-number">604</span><span class="source-line-text">        if (document !== undefined) {</span></span>
<span class="source-line"><span class="source-line-number">605</span><span class="source-line-text">          // Do not wipe diagnostics on didChange. Some servers (e.g. clangd) only</span></span>
<span class="source-line"><span class="source-line-number">606</span><span class="source-line-text">          // re-emit diagnostics when the content actually changes, so clearing</span></span>
<span class="source-line"><span class="source-line-number">607</span><span class="source-line-text">          // here would lose errors for no-op touchFile calls. Let the server's</span></span>
<span class="source-line"><span class="source-line-number">608</span><span class="source-line-text">          // next push/pull overwrite naturally.</span></span>
<span class="source-line"><span class="source-line-number">609</span><span class="source-line-text">          logger.info(&quot;workspace/didChangeWatchedFiles&quot;, request)</span></span>
<span class="source-line"><span class="source-line-number">610</span><span class="source-line-text">          await connection.sendNotification(&quot;workspace/didChangeWatchedFiles&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">611</span><span class="source-line-text">            changes: [</span></span>
<span class="source-line"><span class="source-line-number">612</span><span class="source-line-text">              {</span></span>
<span class="source-line"><span class="source-line-number">613</span><span class="source-line-text">                uri: pathToFileURL(request.path).href,</span></span>
<span class="source-line"><span class="source-line-number">614</span><span class="source-line-text">                type: FILE_CHANGE_CHANGED,</span></span>
<span class="source-line"><span class="source-line-number">615</span><span class="source-line-text">              },</span></span>
<span class="source-line"><span class="source-line-number">616</span><span class="source-line-text">            ],</span></span>
<span class="source-line"><span class="source-line-number">617</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">618</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">619</span><span class="source-line-text">          const next = document.version + 1</span></span>
<span class="source-line"><span class="source-line-number">620</span><span class="source-line-text">          files[request.path] = { version: next, text }</span></span>
<span class="source-line"><span class="source-line-number">621</span><span class="source-line-text">          logger.info(&quot;textDocument/didChange&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">622</span><span class="source-line-text">            path: request.path,</span></span>
<span class="source-line"><span class="source-line-number">623</span><span class="source-line-text">            version: next,</span></span>
<span class="source-line"><span class="source-line-number">624</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">625</span><span class="source-line-text">          await connection.sendNotification(&quot;textDocument/didChange&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">626</span><span class="source-line-text">            textDocument: {</span></span>
<span class="source-line"><span class="source-line-number">627</span><span class="source-line-text">              uri: pathToFileURL(request.path).href,</span></span>
<span class="source-line"><span class="source-line-number">628</span><span class="source-line-text">              version: next,</span></span>
<span class="source-line"><span class="source-line-number">629</span><span class="source-line-text">            },</span></span>
<span class="source-line"><span class="source-line-number">630</span><span class="source-line-text">            contentChanges:</span></span>
<span class="source-line"><span class="source-line-number">631</span><span class="source-line-text">              syncKind === TEXT_DOCUMENT_SYNC_INCREMENTAL</span></span>
<span class="source-line"><span class="source-line-number">632</span><span class="source-line-text">                ? [</span></span>
<span class="source-line"><span class="source-line-number">633</span><span class="source-line-text">                    {</span></span>
<span class="source-line"><span class="source-line-number">634</span><span class="source-line-text">                      range: {</span></span>
<span class="source-line"><span class="source-line-number">635</span><span class="source-line-text">                        start: { line: 0, character: 0 },</span></span>
<span class="source-line"><span class="source-line-number">636</span><span class="source-line-text">                        end: endPosition(document.text),</span></span>
<span class="source-line"><span class="source-line-number">637</span><span class="source-line-text">                      },</span></span>
<span class="source-line"><span class="source-line-number">638</span><span class="source-line-text">                      text,</span></span>
<span class="source-line"><span class="source-line-number">639</span><span class="source-line-text">                    },</span></span>
<span class="source-line"><span class="source-line-number">640</span><span class="source-line-text">                  ]</span></span>
<span class="source-line"><span class="source-line-number">641</span><span class="source-line-text">                : [{ text }],</span></span>
<span class="source-line"><span class="source-line-number">642</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">643</span><span class="source-line-text">          return next</span></span>
<span class="source-line"><span class="source-line-number">644</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">645</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">646</span><span class="source-line-text">        logger.info(&quot;workspace/didChangeWatchedFiles&quot;, request)</span></span>
<span class="source-line"><span class="source-line-number">647</span><span class="source-line-text">        await connection.sendNotification(&quot;workspace/didChangeWatchedFiles&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">648</span><span class="source-line-text">          changes: [</span></span>
<span class="source-line"><span class="source-line-number">649</span><span class="source-line-text">            {</span></span>
<span class="source-line"><span class="source-line-number">650</span><span class="source-line-text">              uri: pathToFileURL(request.path).href,</span></span>
<span class="source-line"><span class="source-line-number">651</span><span class="source-line-text">              type: FILE_CHANGE_CREATED,</span></span>
<span class="source-line"><span class="source-line-number">652</span><span class="source-line-text">            },</span></span>
<span class="source-line"><span class="source-line-number">653</span><span class="source-line-text">          ],</span></span>
<span class="source-line"><span class="source-line-number">654</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">655</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">656</span><span class="source-line-text">        logger.info(&quot;textDocument/didOpen&quot;, request)</span></span>
<span class="source-line"><span class="source-line-number">657</span><span class="source-line-text">        pushDiagnostics.delete(request.path)</span></span>
<span class="source-line"><span class="source-line-number">658</span><span class="source-line-text">        pullDiagnostics.delete(request.path)</span></span>
<span class="source-line"><span class="source-line-number">659</span><span class="source-line-text">        await connection.sendNotification(&quot;textDocument/didOpen&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">660</span><span class="source-line-text">          textDocument: {</span></span>
<span class="source-line"><span class="source-line-number">661</span><span class="source-line-text">            uri: pathToFileURL(request.path).href,</span></span>
<span class="source-line"><span class="source-line-number">662</span><span class="source-line-text">            languageId,</span></span>
<span class="source-line"><span class="source-line-number">663</span><span class="source-line-text">            version: 0,</span></span>
<span class="source-line"><span class="source-line-number">664</span><span class="source-line-text">            text,</span></span>
<span class="source-line"><span class="source-line-number">665</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">666</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">667</span><span class="source-line-text">        files[request.path] = { version: 0, text }</span></span>
<span class="source-line"><span class="source-line-number">668</span><span class="source-line-text">        return 0</span></span>
<span class="source-line"><span class="source-line-number">669</span><span class="source-line-text">      },</span></span></code></pre>
</details>


如果文件已经 open，就发 `didChange`；否则发 `didOpen`。这和 IDE 打开文件后编辑的行为一样。

### 7.8 diagnostics 聚合和格式化

```ts
const diagnostics = Effect.fn("LSP.diagnostics")(function* () {
  const results: Record<string, LSPClient.Diagnostic[]> = {}
  const all = yield* runAll(async (client) => client.diagnostics)
  for (const result of all) {
    for (const [p, diags] of result.entries()) {
      const arr = results[p] || []
      arr.push(...diags)
      results[p] = arr
    }
  }
  return results
})
```

路径：`packages/opencode/src/lsp/lsp.ts:368-379`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/lsp.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/lsp.ts:368-379</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">368</span><span class="source-line-text">    const diagnostics = Effect.fn(&quot;LSP.diagnostics&quot;)(function* () {</span></span>
<span class="source-line"><span class="source-line-number">369</span><span class="source-line-text">      const results: Record&lt;string, LSPClient.Diagnostic[]&gt; = {}</span></span>
<span class="source-line"><span class="source-line-number">370</span><span class="source-line-text">      const all = yield* runAll(async (client) =&gt; client.diagnostics)</span></span>
<span class="source-line"><span class="source-line-number">371</span><span class="source-line-text">      for (const result of all) {</span></span>
<span class="source-line"><span class="source-line-number">372</span><span class="source-line-text">        for (const [p, diags] of result.entries()) {</span></span>
<span class="source-line"><span class="source-line-number">373</span><span class="source-line-text">          const arr = results[p] || []</span></span>
<span class="source-line"><span class="source-line-number">374</span><span class="source-line-text">          arr.push(...diags)</span></span>
<span class="source-line"><span class="source-line-number">375</span><span class="source-line-text">          results[p] = arr</span></span>
<span class="source-line"><span class="source-line-number">376</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">377</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">378</span><span class="source-line-text">      return results</span></span>
<span class="source-line"><span class="source-line-number">379</span><span class="source-line-text">    })</span></span></code></pre>
</details>


格式化：

```ts
export function report(file: string, issues: LSPClient.Diagnostic[]) {
  const errors = issues.filter((item) => item.severity === 1)
  if (errors.length === 0) return ""
  const limited = errors.slice(0, MAX_PER_FILE)
  const more = errors.length - MAX_PER_FILE
  const suffix = more > 0 ? `\n... and ${more} more` : ""
  return `<diagnostics file="${file}">\n${limited.map(pretty).join("\n")}${suffix}\n</diagnostics>`
}
```

路径：`packages/opencode/src/lsp/diagnostic.ts:20-27`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/diagnostic.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/diagnostic.ts:20-27</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">export function report(file: string, issues: LSPClient.Diagnostic[]) {</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">  const errors = issues.filter((item) =&gt; item.severity === 1)</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">  if (errors.length === 0) return &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  const limited = errors.slice(0, MAX_PER_FILE)</span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">  const more = errors.length - MAX_PER_FILE</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">  const suffix = more &gt; 0 ? `\n... and ${more} more` : &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">  return `&lt;diagnostics file=&quot;${file}&quot;&gt;\n${limited.map(pretty).join(&quot;\n&quot;)}${suffix}\n&lt;/diagnostics&gt;`</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">}</span></span></code></pre>
</details>


注意只报告 severity 为 1 的 errors，不把 warn/info/hint 都塞给模型。

## 8. 关键 TypeScript 语法复习

### `as const`

```ts
const operations = [
  "goToDefinition",
  "findReferences",
  "hover",
  ...
] as const
```

路径：`packages/opencode/src/tool/lsp.ts:11-21`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/lsp.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/lsp.ts:11-21</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">const operations = [</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">  &quot;goToDefinition&quot;,</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">  &quot;findReferences&quot;,</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">  &quot;hover&quot;,</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">  &quot;documentSymbol&quot;,</span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">  &quot;workspaceSymbol&quot;,</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  &quot;goToImplementation&quot;,</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">  &quot;prepareCallHierarchy&quot;,</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">  &quot;incomingCalls&quot;,</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">  &quot;outgoingCalls&quot;,</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">] as const</span></span></code></pre>
</details>


`as const` 让数组元素变成字面量类型，后面 `Schema.Literals(operations)` 可以生成 operation union。

### interface

```ts
export interface Interface {
  readonly init: () => Effect.Effect<void>
  readonly status: () => Effect.Effect<Status[]>
  ...
}
```

路径：`packages/opencode/src/lsp/lsp.ts:123-138`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/lsp.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/lsp.ts:123-138</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">export interface Interface {</span></span>
<span class="source-line"><span class="source-line-number">124</span><span class="source-line-text">  readonly init: () =&gt; Effect.Effect&lt;void&gt;</span></span>
<span class="source-line"><span class="source-line-number">125</span><span class="source-line-text">  readonly status: () =&gt; Effect.Effect&lt;Status[]&gt;</span></span>
<span class="source-line"><span class="source-line-number">126</span><span class="source-line-text">  readonly hasClients: (file: string) =&gt; Effect.Effect&lt;boolean&gt;</span></span>
<span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">  readonly touchFile: (input: string, diagnostics?: &quot;document&quot; | &quot;full&quot;) =&gt; Effect.Effect&lt;void&gt;</span></span>
<span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">  readonly diagnostics: () =&gt; Effect.Effect&lt;Record&lt;string, LSPClient.Diagnostic[]&gt;&gt;</span></span>
<span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">  readonly hover: (input: LocInput) =&gt; Effect.Effect&lt;any&gt;</span></span>
<span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">  readonly definition: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
<span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">  readonly references: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
<span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">  readonly implementation: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
<span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">  readonly documentSymbol: (uri: string) =&gt; Effect.Effect&lt;(DocumentSymbol | Symbol)[]&gt;</span></span>
<span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">  readonly workspaceSymbol: (query: string) =&gt; Effect.Effect&lt;Symbol[]&gt;</span></span>
<span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">  readonly prepareCallHierarchy: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
<span class="source-line"><span class="source-line-number">136</span><span class="source-line-text">  readonly incomingCalls: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
<span class="source-line"><span class="source-line-number">137</span><span class="source-line-text">  readonly outgoingCalls: (input: LocInput) =&gt; Effect.Effect&lt;any[]&gt;</span></span>
<span class="source-line"><span class="source-line-number">138</span><span class="source-line-text">}</span></span></code></pre>
</details>


Java 类比 interface，但 TS interface 只在编译期存在，运行时没有。

### optional parameter

```ts
readonly touchFile: (input: string, diagnostics?: "document" | "full") => Effect.Effect<void>
```

路径：`packages/opencode/src/lsp/lsp.ts:127`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/lsp.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/lsp.ts:127</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">  readonly touchFile: (input: string, diagnostics?: &quot;document&quot; | &quot;full&quot;) =&gt; Effect.Effect&lt;void&gt;</span></span></code></pre>
</details>


`diagnostics?` 可以不传；如果传，只能是 `"document"` 或 `"full"`。

### generic function

```ts
const run = Effect.fnUntraced(function* <T>(file: string, fn: (client: LSPClient.Info) => Promise<T>) {
  const clients = yield* getClients(file)
  return yield* Effect.promise(() => Promise.all(clients.map((x) => fn(x))))
})
```

路径：`packages/opencode/src/lsp/lsp.ts:301-304`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/lsp.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/lsp.ts:301-304</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">    const run = Effect.fnUntraced(function* &lt;T&gt;(file: string, fn: (client: LSPClient.Info) =&gt; Promise&lt;T&gt;) {</span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">      const clients = yield* getClients(file)</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">      return yield* Effect.promise(() =&gt; Promise.all(clients.map((x) =&gt; fn(x))))</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">    })</span></span></code></pre>
</details>


`<T>` 表示返回类型由传入函数决定。Java 类比 `<T> List<T> run(String file, Function<Client, T> fn)`。

### getter

```ts
get diagnostics() {
  const result = new Map<string, Diagnostic[]>()
  ...
  return result
}
```

路径：`packages/opencode/src/lsp/client.ts:671-677`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/client.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/client.ts:671-677</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">671</span><span class="source-line-text">    get diagnostics() {</span></span>
<span class="source-line"><span class="source-line-number">672</span><span class="source-line-text">      const result = new Map&lt;string, Diagnostic[]&gt;()</span></span>
<span class="source-line"><span class="source-line-number">673</span><span class="source-line-text">      for (const key of new Set([...pushDiagnostics.keys(), ...pullDiagnostics.keys()])) {</span></span>
<span class="source-line"><span class="source-line-number">674</span><span class="source-line-text">        result.set(key, mergedDiagnostics(key))</span></span>
<span class="source-line"><span class="source-line-number">675</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">676</span><span class="source-line-text">      return result</span></span>
<span class="source-line"><span class="source-line-number">677</span><span class="source-line-text">    },</span></span></code></pre>
</details>


这是 JS/TS getter，调用时像属性：`client.diagnostics`。

### Array flat/filter(Boolean)

```ts
return results.flat().filter(Boolean)
```

路径：`packages/opencode/src/lsp/lsp.ts:392-402`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/lsp/lsp.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/lsp/lsp.ts:392-402</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">392</span><span class="source-line-text">    const definition = Effect.fn(&quot;LSP.definition&quot;)(function* (input: LocInput) {</span></span>
<span class="source-line"><span class="source-line-number">393</span><span class="source-line-text">      const results = yield* run(input.file, (client) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">394</span><span class="source-line-text">        client.connection</span></span>
<span class="source-line"><span class="source-line-number">395</span><span class="source-line-text">          .sendRequest(&quot;textDocument/definition&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">396</span><span class="source-line-text">            textDocument: { uri: pathToFileURL(input.file).href },</span></span>
<span class="source-line"><span class="source-line-number">397</span><span class="source-line-text">            position: { line: input.line, character: input.character },</span></span>
<span class="source-line"><span class="source-line-number">398</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">399</span><span class="source-line-text">          .catch(() =&gt; null),</span></span>
<span class="source-line"><span class="source-line-number">400</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">401</span><span class="source-line-text">      return results.flat().filter(Boolean)</span></span>
<span class="source-line"><span class="source-line-number">402</span><span class="source-line-text">    })</span></span></code></pre>
</details>


把多 client 结果拍平，并过滤 null/undefined。Java 类比 stream `flatMap(...).filter(Objects::nonNull)`。

### discriminated switch

```ts
switch (args.operation) {
  case "goToDefinition":
    return lsp.definition(position)
  case "findReferences":
    return lsp.references(position)
  ...
}
```

路径：`packages/opencode/src/tool/lsp.ts:82-103`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/lsp.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/lsp.ts:82-103</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">          const result: unknown[] = yield* (() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">            switch (args.operation) {</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">              case &quot;goToDefinition&quot;:</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">                return lsp.definition(position)</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">              case &quot;findReferences&quot;:</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">                return lsp.references(position)</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">              case &quot;hover&quot;:</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">                return lsp.hover(position)</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">              case &quot;documentSymbol&quot;:</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">                return lsp.documentSymbol(uri)</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">              case &quot;workspaceSymbol&quot;:</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">                return lsp.workspaceSymbol(args.query ?? &quot;&quot;)</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">              case &quot;goToImplementation&quot;:</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">                return lsp.implementation(position)</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">              case &quot;prepareCallHierarchy&quot;:</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">                return lsp.prepareCallHierarchy(position)</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">              case &quot;incomingCalls&quot;:</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">                return lsp.incomingCalls(position)</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">              case &quot;outgoingCalls&quot;:</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">                return lsp.outgoingCalls(position)</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">          })()</span></span></code></pre>
</details>


operation 是 literal union，所以 switch 分支可被 TS 检查。

## 9. 涉及的设计模式和架构思想

- **Lazy initialization**：只在文件需要时启动 LSP client。
- **Factory**：`LSPServer.Info.spawn` 创建不同 language server。
- **Registry**：`servers` 和 `clients` 维护可用 server/client。
- **JSON-RPC adapter**：`LSPClient.create` 封装 stdin/stdout connection。
- **Feedback loop**：edit/write 后 diagnostics 回到 tool output，再进入下一轮 LLM。
- **Capability probing**：initialize 后根据 capabilities 决定 diagnostics 路径。
- **Best-effort enhancement**：`touchFile` 捕获错误记录日志，LSP 故障不应让文件编辑整体崩掉。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

- 和 Tool：edit/write 自动触发 diagnostics；lsp tool 暴露语义查询。来源：`packages/opencode/src/tool/edit.ts:192-207`、`packages/opencode/src/tool/write.ts:80-99`、`packages/opencode/src/tool/lsp.ts:37-110`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/tool/edit.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/tool/edit.ts:192-207</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">          let output = &quot;Edit applied successfully.&quot;</span></span>
  <span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">          yield* lsp.touchFile(filePath, &quot;document&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">          const diagnostics = yield* lsp.diagnostics()</span></span>
  <span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">          const normalizedFilePath = AppFileSystem.normalizePath(filePath)</span></span>
  <span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">          const block = LSP.Diagnostic.report(filePath, diagnostics[normalizedFilePath] ?? [])</span></span>
  <span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">          if (block) output += `\n\nLSP errors detected in this file, please fix:\n${block}`</span></span>
  <span class="source-line"><span class="source-line-number">198</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">          return {</span></span>
  <span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">            metadata: {</span></span>
  <span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">              diagnostics,</span></span>
  <span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">              diff,</span></span>
  <span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">              filediff,</span></span>
  <span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">            },</span></span>
  <span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">            title: `${path.relative(instance.worktree, filePath)}`,</span></span>
  <span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">            output,</span></span>
  <span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">          }</span></span></code></pre>
  </details>

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/tool/write.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/tool/write.ts:80-99</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">            const current = file === normalizedFilepath</span></span>
  <span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">            if (!current &amp;&amp; projectDiagnosticsCount &gt;= MAX_PROJECT_DIAGNOSTICS_FILES) continue</span></span>
  <span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">            const block = LSP.Diagnostic.report(current ? filepath : file, issues)</span></span>
  <span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">            if (!block) continue</span></span>
  <span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">            if (current) {</span></span>
  <span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">              output += `\n\nLSP errors detected in this file, please fix:\n${block}`</span></span>
  <span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">              continue</span></span>
  <span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">            projectDiagnosticsCount++</span></span>
  <span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">            output += `\n\nLSP errors detected in other files:\n${block}`</span></span>
  <span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">91</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">          return {</span></span>
  <span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">            title: path.relative(instance.worktree, filepath),</span></span>
  <span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">            metadata: {</span></span>
  <span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">              diagnostics,</span></span>
  <span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">              filepath,</span></span>
  <span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">              exists: exists,</span></span>
  <span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">            },</span></span>
  <span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">            output,</span></span></code></pre>
  </details>

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/tool/lsp.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/tool/lsp.ts:37-110</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">export const LspTool = Tool.define(</span></span>
  <span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">  &quot;lsp&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  Effect.gen(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">    const lsp = yield* LSP.Service</span></span>
  <span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">    const fs = yield* AppFileSystem.Service</span></span>
  <span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">    return {</span></span>
  <span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">      description: DESCRIPTION,</span></span>
  <span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">      parameters: Parameters,</span></span>
  <span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">      execute: (args: Schema.Schema.Type&lt;typeof Parameters&gt;, ctx: Tool.Context) =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">        Effect.gen(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">          const instance = yield* InstanceState.context</span></span>
  <span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">          const file = path.isAbsolute(args.filePath) ? args.filePath : path.join(instance.directory, args.filePath)</span></span>
  <span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">          yield* assertExternalDirectoryEffect(ctx, file)</span></span>
  <span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">          const meta =</span></span>
  <span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">            args.operation === &quot;workspaceSymbol&quot;</span></span>
  <span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">              ? { operation: args.operation }</span></span>
  <span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">              : args.operation === &quot;documentSymbol&quot;</span></span>
  <span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">                ? { operation: args.operation, filePath: file }</span></span>
  <span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">                : { operation: args.operation, filePath: file, line: args.line, character: args.character }</span></span>
  <span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">          yield* ctx.ask({</span></span>
  <span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">            permission: &quot;lsp&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">            patterns: [&quot;*&quot;],</span></span>
  <span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">            always: [&quot;*&quot;],</span></span>
  <span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">            metadata: meta,</span></span>
  <span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">62</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">          const uri = pathToFileURL(file).href</span></span>
  <span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">          const position = { file, line: args.line - 1, character: args.character - 1 }</span></span>
  <span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">          const relPath = path.relative(instance.worktree, file)</span></span>
  <span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">          const detail =</span></span>
  <span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">            args.operation === &quot;workspaceSymbol&quot;</span></span>
  <span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">              ? &quot;&quot;</span></span>
  <span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">              : args.operation === &quot;documentSymbol&quot;</span></span>
  <span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">                ? relPath</span></span>
  <span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">                : `${relPath}:${args.line}:${args.character}`</span></span>
  <span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">          const title = detail ? `${args.operation} ${detail}` : args.operation</span></span>
  <span class="source-line"><span class="source-line-number">73</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">          const exists = yield* fs.existsSafe(file)</span></span>
  <span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">          if (!exists) throw new Error(`File not found: ${file}`)</span></span>
  <span class="source-line"><span class="source-line-number">76</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">          const available = yield* lsp.hasClients(file)</span></span>
  <span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">          if (!available) throw new Error(&quot;No LSP server available for this file type.&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">79</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">          yield* lsp.touchFile(file, &quot;document&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">81</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">          const result: unknown[] = yield* (() =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">            switch (args.operation) {</span></span>
  <span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">              case &quot;goToDefinition&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">                return lsp.definition(position)</span></span>
  <span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">              case &quot;findReferences&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">                return lsp.references(position)</span></span>
  <span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">              case &quot;hover&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">                return lsp.hover(position)</span></span>
  <span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">              case &quot;documentSymbol&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">                return lsp.documentSymbol(uri)</span></span>
  <span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">              case &quot;workspaceSymbol&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">                return lsp.workspaceSymbol(args.query ?? &quot;&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">              case &quot;goToImplementation&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">                return lsp.implementation(position)</span></span>
  <span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">              case &quot;prepareCallHierarchy&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">                return lsp.prepareCallHierarchy(position)</span></span>
  <span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">              case &quot;incomingCalls&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">                return lsp.incomingCalls(position)</span></span>
  <span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">              case &quot;outgoingCalls&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">                return lsp.outgoingCalls(position)</span></span>
  <span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">          })()</span></span>
  <span class="source-line"><span class="source-line-number">104</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">          return {</span></span>
  <span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">            title,</span></span>
  <span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">            metadata: { result },</span></span>
  <span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">            output: result.length === 0 ? `No results found for ${args.operation}` : JSON.stringify(result, null, 2),</span></span>
  <span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">        }).pipe(Effect.orDie),</span></span></code></pre>
  </details>

- 和 Provider：Provider 不直接调用 LSP；LLM 通过 tool result 或主动 lsp tool 获取 LSP 信息。
- 和 Session：diagnostics 被写进 tool output，成为 message history 的一部分，下一轮模型能看到。
- 和文件系统：client.open 读取文件文本，发送 didOpen/didChange。来源：`packages/opencode/src/lsp/client.ts:594-669`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/lsp/client.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/lsp/client.ts:594-669</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">594</span><span class="source-line-text">    notify: {</span></span>
  <span class="source-line"><span class="source-line-number">595</span><span class="source-line-text">      async open(request: { path: string }) {</span></span>
  <span class="source-line"><span class="source-line-number">596</span><span class="source-line-text">        request.path = Filesystem.normalizePath(</span></span>
  <span class="source-line"><span class="source-line-number">597</span><span class="source-line-text">          path.isAbsolute(request.path) ? request.path : path.resolve(input.directory, request.path),</span></span>
  <span class="source-line"><span class="source-line-number">598</span><span class="source-line-text">        )</span></span>
  <span class="source-line"><span class="source-line-number">599</span><span class="source-line-text">        const text = await Filesystem.readText(request.path)</span></span>
  <span class="source-line"><span class="source-line-number">600</span><span class="source-line-text">        const extension = path.extname(request.path)</span></span>
  <span class="source-line"><span class="source-line-number">601</span><span class="source-line-text">        const languageId = LANGUAGE_EXTENSIONS[extension] ?? &quot;plaintext&quot;</span></span>
  <span class="source-line"><span class="source-line-number">602</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">603</span><span class="source-line-text">        const document = files[request.path]</span></span>
  <span class="source-line"><span class="source-line-number">604</span><span class="source-line-text">        if (document !== undefined) {</span></span>
  <span class="source-line"><span class="source-line-number">605</span><span class="source-line-text">          // Do not wipe diagnostics on didChange. Some servers (e.g. clangd) only</span></span>
  <span class="source-line"><span class="source-line-number">606</span><span class="source-line-text">          // re-emit diagnostics when the content actually changes, so clearing</span></span>
  <span class="source-line"><span class="source-line-number">607</span><span class="source-line-text">          // here would lose errors for no-op touchFile calls. Let the server's</span></span>
  <span class="source-line"><span class="source-line-number">608</span><span class="source-line-text">          // next push/pull overwrite naturally.</span></span>
  <span class="source-line"><span class="source-line-number">609</span><span class="source-line-text">          logger.info(&quot;workspace/didChangeWatchedFiles&quot;, request)</span></span>
  <span class="source-line"><span class="source-line-number">610</span><span class="source-line-text">          await connection.sendNotification(&quot;workspace/didChangeWatchedFiles&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">611</span><span class="source-line-text">            changes: [</span></span>
  <span class="source-line"><span class="source-line-number">612</span><span class="source-line-text">              {</span></span>
  <span class="source-line"><span class="source-line-number">613</span><span class="source-line-text">                uri: pathToFileURL(request.path).href,</span></span>
  <span class="source-line"><span class="source-line-number">614</span><span class="source-line-text">                type: FILE_CHANGE_CHANGED,</span></span>
  <span class="source-line"><span class="source-line-number">615</span><span class="source-line-text">              },</span></span>
  <span class="source-line"><span class="source-line-number">616</span><span class="source-line-text">            ],</span></span>
  <span class="source-line"><span class="source-line-number">617</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">618</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">619</span><span class="source-line-text">          const next = document.version + 1</span></span>
  <span class="source-line"><span class="source-line-number">620</span><span class="source-line-text">          files[request.path] = { version: next, text }</span></span>
  <span class="source-line"><span class="source-line-number">621</span><span class="source-line-text">          logger.info(&quot;textDocument/didChange&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">622</span><span class="source-line-text">            path: request.path,</span></span>
  <span class="source-line"><span class="source-line-number">623</span><span class="source-line-text">            version: next,</span></span>
  <span class="source-line"><span class="source-line-number">624</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">625</span><span class="source-line-text">          await connection.sendNotification(&quot;textDocument/didChange&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">626</span><span class="source-line-text">            textDocument: {</span></span>
  <span class="source-line"><span class="source-line-number">627</span><span class="source-line-text">              uri: pathToFileURL(request.path).href,</span></span>
  <span class="source-line"><span class="source-line-number">628</span><span class="source-line-text">              version: next,</span></span>
  <span class="source-line"><span class="source-line-number">629</span><span class="source-line-text">            },</span></span>
  <span class="source-line"><span class="source-line-number">630</span><span class="source-line-text">            contentChanges:</span></span>
  <span class="source-line"><span class="source-line-number">631</span><span class="source-line-text">              syncKind === TEXT_DOCUMENT_SYNC_INCREMENTAL</span></span>
  <span class="source-line"><span class="source-line-number">632</span><span class="source-line-text">                ? [</span></span>
  <span class="source-line"><span class="source-line-number">633</span><span class="source-line-text">                    {</span></span>
  <span class="source-line"><span class="source-line-number">634</span><span class="source-line-text">                      range: {</span></span>
  <span class="source-line"><span class="source-line-number">635</span><span class="source-line-text">                        start: { line: 0, character: 0 },</span></span>
  <span class="source-line"><span class="source-line-number">636</span><span class="source-line-text">                        end: endPosition(document.text),</span></span>
  <span class="source-line"><span class="source-line-number">637</span><span class="source-line-text">                      },</span></span>
  <span class="source-line"><span class="source-line-number">638</span><span class="source-line-text">                      text,</span></span>
  <span class="source-line"><span class="source-line-number">639</span><span class="source-line-text">                    },</span></span>
  <span class="source-line"><span class="source-line-number">640</span><span class="source-line-text">                  ]</span></span>
  <span class="source-line"><span class="source-line-number">641</span><span class="source-line-text">                : [{ text }],</span></span>
  <span class="source-line"><span class="source-line-number">642</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">643</span><span class="source-line-text">          return next</span></span>
  <span class="source-line"><span class="source-line-number">644</span><span class="source-line-text">        }</span></span>
  <span class="source-line"><span class="source-line-number">645</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">646</span><span class="source-line-text">        logger.info(&quot;workspace/didChangeWatchedFiles&quot;, request)</span></span>
  <span class="source-line"><span class="source-line-number">647</span><span class="source-line-text">        await connection.sendNotification(&quot;workspace/didChangeWatchedFiles&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">648</span><span class="source-line-text">          changes: [</span></span>
  <span class="source-line"><span class="source-line-number">649</span><span class="source-line-text">            {</span></span>
  <span class="source-line"><span class="source-line-number">650</span><span class="source-line-text">              uri: pathToFileURL(request.path).href,</span></span>
  <span class="source-line"><span class="source-line-number">651</span><span class="source-line-text">              type: FILE_CHANGE_CREATED,</span></span>
  <span class="source-line"><span class="source-line-number">652</span><span class="source-line-text">            },</span></span>
  <span class="source-line"><span class="source-line-number">653</span><span class="source-line-text">          ],</span></span>
  <span class="source-line"><span class="source-line-number">654</span><span class="source-line-text">        })</span></span>
  <span class="source-line"><span class="source-line-number">655</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">656</span><span class="source-line-text">        logger.info(&quot;textDocument/didOpen&quot;, request)</span></span>
  <span class="source-line"><span class="source-line-number">657</span><span class="source-line-text">        pushDiagnostics.delete(request.path)</span></span>
  <span class="source-line"><span class="source-line-number">658</span><span class="source-line-text">        pullDiagnostics.delete(request.path)</span></span>
  <span class="source-line"><span class="source-line-number">659</span><span class="source-line-text">        await connection.sendNotification(&quot;textDocument/didOpen&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">660</span><span class="source-line-text">          textDocument: {</span></span>
  <span class="source-line"><span class="source-line-number">661</span><span class="source-line-text">            uri: pathToFileURL(request.path).href,</span></span>
  <span class="source-line"><span class="source-line-number">662</span><span class="source-line-text">            languageId,</span></span>
  <span class="source-line"><span class="source-line-number">663</span><span class="source-line-text">            version: 0,</span></span>
  <span class="source-line"><span class="source-line-number">664</span><span class="source-line-text">            text,</span></span>
  <span class="source-line"><span class="source-line-number">665</span><span class="source-line-text">          },</span></span>
  <span class="source-line"><span class="source-line-number">666</span><span class="source-line-text">        })</span></span>
  <span class="source-line"><span class="source-line-number">667</span><span class="source-line-text">        files[request.path] = { version: 0, text }</span></span>
  <span class="source-line"><span class="source-line-number">668</span><span class="source-line-text">        return 0</span></span>
  <span class="source-line"><span class="source-line-number">669</span><span class="source-line-text">      },</span></span></code></pre>
  </details>

- 和权限：lsp tool 会 `ctx.ask({ permission: "lsp" })`；外部路径还会走 external directory 检查。来源：`packages/opencode/src/tool/lsp.ts:47-61`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/tool/lsp.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/tool/lsp.ts:47-61</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">          const instance = yield* InstanceState.context</span></span>
  <span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">          const file = path.isAbsolute(args.filePath) ? args.filePath : path.join(instance.directory, args.filePath)</span></span>
  <span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">          yield* assertExternalDirectoryEffect(ctx, file)</span></span>
  <span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">          const meta =</span></span>
  <span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">            args.operation === &quot;workspaceSymbol&quot;</span></span>
  <span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">              ? { operation: args.operation }</span></span>
  <span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">              : args.operation === &quot;documentSymbol&quot;</span></span>
  <span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">                ? { operation: args.operation, filePath: file }</span></span>
  <span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">                : { operation: args.operation, filePath: file, line: args.line, character: args.character }</span></span>
  <span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">          yield* ctx.ask({</span></span>
  <span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">            permission: &quot;lsp&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">            patterns: [&quot;*&quot;],</span></span>
  <span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">            always: [&quot;*&quot;],</span></span>
  <span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">            metadata: meta,</span></span>
  <span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">          })</span></span></code></pre>
  </details>


## 11. 如果自己实现 mini agent，这一章对应什么代码

mini agent 可以先实现“编辑后跑检查”的低配版，不必一开始接 LSP：

```ts
async function afterEdit(file: string, ctx: ToolContext) {
  const diagnostics = await diagnosticsService.check(file)
  if (diagnostics.errors.length === 0) {
    return "Edit applied successfully."
  }
  return [
    "Edit applied successfully.",
    "",
    "Diagnostics detected, please fix:",
    formatDiagnostics(file, diagnostics.errors),
  ].join("\n")
}
```

再逐步升级：

1. 用 `tsc --noEmit` 或 `eslint` 作为第一版 diagnostics。
2. 接入一个 TypeScript language server。
3. 实现 `touchFile`：open/change 文件。
4. 实现 `diagnostics()` 聚合。
5. 增加 `definition/hover/references` tool。
6. 把 errors 写回 tool result，让下一轮 LLM 修。

## 12. 费曼复述区

请你不看源码复述：

1. 为什么 edit/write 工具要在修改后调用 LSP？
2. `getClients` 为什么要按文件扩展和 root 懒启动？
3. `touchFile` 做了哪两件事？
4. push diagnostics 和 pull diagnostics 的差异是什么？
5. `lsp` tool 和 edit/write 自动 diagnostics 的关系是什么？

如果说不出来，常见卡点是：

- 把 LSP 当成一次性 lint 命令，没有理解它是长期运行的 JSON-RPC server。
- 只看 `lsp.diagnostics()`，没看 `touchFile` 如何让 server 更新状态。
- 没把 diagnostics 回填到 tool output 和下一轮 LLM 联系起来。

换一种说法：LSP 是 agent 的“IDE 感官”。agent 可以写代码，但 LSP 让它知道自己刚才写出来的代码有没有被语言服务认可。

## 13. 练习题

### 入门题

1. 找到 `LSP.Interface`，把方法分成 lifecycle、diagnostics、semantic query 三类。
2. 找到 `Typescript` server，说明它支持哪些文件扩展。
3. 找到 `Diagnostic.report`，说明它为什么只输出 error。

### 进阶题

1. 阅读 `getClients`，解释 `clients`、`spawning`、`broken` 三个状态集合的用途。
2. 阅读 `client.notify.open`，解释 didOpen 和 didChange 的差异。
3. 阅读 `waitForDocumentDiagnostics`，说明它如何同时等待 push 和 pull。

### 源码追踪题

1. 从 `EditTool` 的 `lsp.touchFile` 追到 `client.notify.open`。
2. 从 `WriteTool` 的 diagnostics 输出追到 `Diagnostic.report`。
3. 从 `LspTool.execute` 追到 `lsp.definition` 和 `connection.sendRequest("textDocument/definition")`。
4. 从 `LSPServer.Typescript.spawn` 追到 `LSPClient.create`。

### 小实现题

写一个 mini diagnostics service：

- `touchFile(file)`：记录文件版本。
- `diagnostics()`：返回 `{ [file]: Diagnostic[] }`。
- `report(file, diagnostics)`：只输出 error。
- 在 edit tool 修改后调用它，并把结果追加到 tool output。

## 14. 源码追踪任务

建议按这个顺序读：

1. `packages/opencode/src/tool/edit.ts:192-207`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/tool/edit.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/tool/edit.ts:192-207</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">          let output = &quot;Edit applied successfully.&quot;</span></span>
  <span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">          yield* lsp.touchFile(filePath, &quot;document&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">          const diagnostics = yield* lsp.diagnostics()</span></span>
  <span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">          const normalizedFilePath = AppFileSystem.normalizePath(filePath)</span></span>
  <span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">          const block = LSP.Diagnostic.report(filePath, diagnostics[normalizedFilePath] ?? [])</span></span>
  <span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">          if (block) output += `\n\nLSP errors detected in this file, please fix:\n${block}`</span></span>
  <span class="source-line"><span class="source-line-number">198</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">          return {</span></span>
  <span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">            metadata: {</span></span>
  <span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">              diagnostics,</span></span>
  <span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">              diff,</span></span>
  <span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">              filediff,</span></span>
  <span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">            },</span></span>
  <span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">            title: `${path.relative(instance.worktree, filePath)}`,</span></span>
  <span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">            output,</span></span>
  <span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">          }</span></span></code></pre>
  </details>

2. `packages/opencode/src/lsp/lsp.ts:346-379`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/lsp/lsp.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/lsp/lsp.ts:346-379</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">346</span><span class="source-line-text">    const touchFile = Effect.fn(&quot;LSP.touchFile&quot;)(function* (input: string, diagnostics?: &quot;document&quot; | &quot;full&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">      log.info(&quot;touching file&quot;, { file: input })</span></span>
  <span class="source-line"><span class="source-line-number">348</span><span class="source-line-text">      const clients = yield* getClients(input)</span></span>
  <span class="source-line"><span class="source-line-number">349</span><span class="source-line-text">      yield* Effect.promise(() =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">        Promise.all(</span></span>
  <span class="source-line"><span class="source-line-number">351</span><span class="source-line-text">          clients.map(async (client) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">            const after = Date.now()</span></span>
  <span class="source-line"><span class="source-line-number">353</span><span class="source-line-text">            const version = await client.notify.open({ path: input })</span></span>
  <span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">            if (!diagnostics) return</span></span>
  <span class="source-line"><span class="source-line-number">355</span><span class="source-line-text">            return client.waitForDiagnostics({</span></span>
  <span class="source-line"><span class="source-line-number">356</span><span class="source-line-text">              path: input,</span></span>
  <span class="source-line"><span class="source-line-number">357</span><span class="source-line-text">              version,</span></span>
  <span class="source-line"><span class="source-line-number">358</span><span class="source-line-text">              mode: diagnostics,</span></span>
  <span class="source-line"><span class="source-line-number">359</span><span class="source-line-text">              after,</span></span>
  <span class="source-line"><span class="source-line-number">360</span><span class="source-line-text">            })</span></span>
  <span class="source-line"><span class="source-line-number">361</span><span class="source-line-text">          }),</span></span>
  <span class="source-line"><span class="source-line-number">362</span><span class="source-line-text">        ).catch((err) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">363</span><span class="source-line-text">          log.error(&quot;failed to touch file&quot;, { err, file: input })</span></span>
  <span class="source-line"><span class="source-line-number">364</span><span class="source-line-text">        }),</span></span>
  <span class="source-line"><span class="source-line-number">365</span><span class="source-line-text">      )</span></span>
  <span class="source-line"><span class="source-line-number">366</span><span class="source-line-text">    })</span></span>
  <span class="source-line"><span class="source-line-number">367</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">368</span><span class="source-line-text">    const diagnostics = Effect.fn(&quot;LSP.diagnostics&quot;)(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">369</span><span class="source-line-text">      const results: Record&lt;string, LSPClient.Diagnostic[]&gt; = {}</span></span>
  <span class="source-line"><span class="source-line-number">370</span><span class="source-line-text">      const all = yield* runAll(async (client) =&gt; client.diagnostics)</span></span>
  <span class="source-line"><span class="source-line-number">371</span><span class="source-line-text">      for (const result of all) {</span></span>
  <span class="source-line"><span class="source-line-number">372</span><span class="source-line-text">        for (const [p, diags] of result.entries()) {</span></span>
  <span class="source-line"><span class="source-line-number">373</span><span class="source-line-text">          const arr = results[p] || []</span></span>
  <span class="source-line"><span class="source-line-number">374</span><span class="source-line-text">          arr.push(...diags)</span></span>
  <span class="source-line"><span class="source-line-number">375</span><span class="source-line-text">          results[p] = arr</span></span>
  <span class="source-line"><span class="source-line-number">376</span><span class="source-line-text">        }</span></span>
  <span class="source-line"><span class="source-line-number">377</span><span class="source-line-text">      }</span></span>
  <span class="source-line"><span class="source-line-number">378</span><span class="source-line-text">      return results</span></span>
  <span class="source-line"><span class="source-line-number">379</span><span class="source-line-text">    })</span></span></code></pre>
  </details>

3. `packages/opencode/src/lsp/lsp.ts:211-299`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/lsp/lsp.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/lsp/lsp.ts:211-299</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">    const getClients = Effect.fnUntraced(function* (file: string) {</span></span>
  <span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">      const ctx = yield* InstanceState.context</span></span>
  <span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">      if (!containsPath(file, ctx)) return [] as LSPClient.Info[]</span></span>
  <span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">      const s = yield* InstanceState.get(state)</span></span>
  <span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">      return yield* Effect.promise(async () =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">        const extension = path.parse(file).ext || file</span></span>
  <span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">        const result: LSPClient.Info[] = []</span></span>
  <span class="source-line"><span class="source-line-number">218</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">        async function schedule(server: LSPServer.Info, root: string, key: string) {</span></span>
  <span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">          const handle = await server</span></span>
  <span class="source-line"><span class="source-line-number">221</span><span class="source-line-text">            .spawn(root, ctx, flags)</span></span>
  <span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">            .then((value) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">              if (!value) s.broken.add(key)</span></span>
  <span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">              return value</span></span>
  <span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">            })</span></span>
  <span class="source-line"><span class="source-line-number">226</span><span class="source-line-text">            .catch((err) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">              s.broken.add(key)</span></span>
  <span class="source-line"><span class="source-line-number">228</span><span class="source-line-text">              log.error(`Failed to spawn LSP server ${server.id}`, { error: err })</span></span>
  <span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">              return undefined</span></span>
  <span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">            })</span></span>
  <span class="source-line"><span class="source-line-number">231</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">          if (!handle) return undefined</span></span>
  <span class="source-line"><span class="source-line-number">233</span><span class="source-line-text">          log.info(&quot;spawned lsp server&quot;, { serverID: server.id, root })</span></span>
  <span class="source-line"><span class="source-line-number">234</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">235</span><span class="source-line-text">          const client = await LSPClient.create({</span></span>
  <span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">            serverID: server.id,</span></span>
  <span class="source-line"><span class="source-line-number">237</span><span class="source-line-text">            server: handle,</span></span>
  <span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">            root,</span></span>
  <span class="source-line"><span class="source-line-number">239</span><span class="source-line-text">            directory: ctx.directory,</span></span>
  <span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">            instance: ctx,</span></span>
  <span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">          }).catch(async (err) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">            s.broken.add(key)</span></span>
  <span class="source-line"><span class="source-line-number">243</span><span class="source-line-text">            await Process.stop(handle.process)</span></span>
  <span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">            log.error(`Failed to initialize LSP client ${server.id}`, { error: err })</span></span>
  <span class="source-line"><span class="source-line-number">245</span><span class="source-line-text">            return undefined</span></span>
  <span class="source-line"><span class="source-line-number">246</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">247</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">          if (!client) return undefined</span></span>
  <span class="source-line"><span class="source-line-number">249</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">          const existing = s.clients.find((x) =&gt; x.root === root &amp;&amp; x.serverID === server.id)</span></span>
  <span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">          if (existing) {</span></span>
  <span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">            await Process.stop(handle.process)</span></span>
  <span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">            return existing</span></span>
  <span class="source-line"><span class="source-line-number">254</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">255</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">256</span><span class="source-line-text">          s.clients.push(client)</span></span>
  <span class="source-line"><span class="source-line-number">257</span><span class="source-line-text">          return client</span></span>
  <span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">        }</span></span>
  <span class="source-line"><span class="source-line-number">259</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">        for (const server of Object.values(s.servers)) {</span></span>
  <span class="source-line"><span class="source-line-number">261</span><span class="source-line-text">          if (server.extensions.length &amp;&amp; !server.extensions.includes(extension)) continue</span></span>
  <span class="source-line"><span class="source-line-number">262</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">          const root = await server.root(file, ctx)</span></span>
  <span class="source-line"><span class="source-line-number">264</span><span class="source-line-text">          if (!root) continue</span></span>
  <span class="source-line"><span class="source-line-number">265</span><span class="source-line-text">          if (s.broken.has(root + server.id)) continue</span></span>
  <span class="source-line"><span class="source-line-number">266</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">          const match = s.clients.find((x) =&gt; x.root === root &amp;&amp; x.serverID === server.id)</span></span>
  <span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">          if (match) {</span></span>
  <span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">            result.push(match)</span></span>
  <span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">            continue</span></span>
  <span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">272</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">          const inflight = s.spawning.get(root + server.id)</span></span>
  <span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">          if (inflight) {</span></span>
  <span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">            const client = await inflight</span></span>
  <span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">            if (!client) continue</span></span>
  <span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">            result.push(client)</span></span>
  <span class="source-line"><span class="source-line-number">278</span><span class="source-line-text">            continue</span></span>
  <span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">280</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">          const task = schedule(server, root, root + server.id)</span></span>
  <span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">          s.spawning.set(root + server.id, task)</span></span>
  <span class="source-line"><span class="source-line-number">283</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">284</span><span class="source-line-text">          task.finally(() =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">            if (s.spawning.get(root + server.id) === task) {</span></span>
  <span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">              s.spawning.delete(root + server.id)</span></span>
  <span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">289</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">          const client = await task</span></span>
  <span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">          if (!client) continue</span></span>
  <span class="source-line"><span class="source-line-number">292</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">293</span><span class="source-line-text">          result.push(client)</span></span>
  <span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">          await Bus.publish(ctx, Event.Updated, {})</span></span>
  <span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">        }</span></span>
  <span class="source-line"><span class="source-line-number">296</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">        return result</span></span>
  <span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">      })</span></span>
  <span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">    })</span></span></code></pre>
  </details>

4. `packages/opencode/src/lsp/client.ts:594-692`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/lsp/client.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/lsp/client.ts:594-692</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">594</span><span class="source-line-text">    notify: {</span></span>
  <span class="source-line"><span class="source-line-number">595</span><span class="source-line-text">      async open(request: { path: string }) {</span></span>
  <span class="source-line"><span class="source-line-number">596</span><span class="source-line-text">        request.path = Filesystem.normalizePath(</span></span>
  <span class="source-line"><span class="source-line-number">597</span><span class="source-line-text">          path.isAbsolute(request.path) ? request.path : path.resolve(input.directory, request.path),</span></span>
  <span class="source-line"><span class="source-line-number">598</span><span class="source-line-text">        )</span></span>
  <span class="source-line"><span class="source-line-number">599</span><span class="source-line-text">        const text = await Filesystem.readText(request.path)</span></span>
  <span class="source-line"><span class="source-line-number">600</span><span class="source-line-text">        const extension = path.extname(request.path)</span></span>
  <span class="source-line"><span class="source-line-number">601</span><span class="source-line-text">        const languageId = LANGUAGE_EXTENSIONS[extension] ?? &quot;plaintext&quot;</span></span>
  <span class="source-line"><span class="source-line-number">602</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">603</span><span class="source-line-text">        const document = files[request.path]</span></span>
  <span class="source-line"><span class="source-line-number">604</span><span class="source-line-text">        if (document !== undefined) {</span></span>
  <span class="source-line"><span class="source-line-number">605</span><span class="source-line-text">          // Do not wipe diagnostics on didChange. Some servers (e.g. clangd) only</span></span>
  <span class="source-line"><span class="source-line-number">606</span><span class="source-line-text">          // re-emit diagnostics when the content actually changes, so clearing</span></span>
  <span class="source-line"><span class="source-line-number">607</span><span class="source-line-text">          // here would lose errors for no-op touchFile calls. Let the server's</span></span>
  <span class="source-line"><span class="source-line-number">608</span><span class="source-line-text">          // next push/pull overwrite naturally.</span></span>
  <span class="source-line"><span class="source-line-number">609</span><span class="source-line-text">          logger.info(&quot;workspace/didChangeWatchedFiles&quot;, request)</span></span>
  <span class="source-line"><span class="source-line-number">610</span><span class="source-line-text">          await connection.sendNotification(&quot;workspace/didChangeWatchedFiles&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">611</span><span class="source-line-text">            changes: [</span></span>
  <span class="source-line"><span class="source-line-number">612</span><span class="source-line-text">              {</span></span>
  <span class="source-line"><span class="source-line-number">613</span><span class="source-line-text">                uri: pathToFileURL(request.path).href,</span></span>
  <span class="source-line"><span class="source-line-number">614</span><span class="source-line-text">                type: FILE_CHANGE_CHANGED,</span></span>
  <span class="source-line"><span class="source-line-number">615</span><span class="source-line-text">              },</span></span>
  <span class="source-line"><span class="source-line-number">616</span><span class="source-line-text">            ],</span></span>
  <span class="source-line"><span class="source-line-number">617</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">618</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">619</span><span class="source-line-text">          const next = document.version + 1</span></span>
  <span class="source-line"><span class="source-line-number">620</span><span class="source-line-text">          files[request.path] = { version: next, text }</span></span>
  <span class="source-line"><span class="source-line-number">621</span><span class="source-line-text">          logger.info(&quot;textDocument/didChange&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">622</span><span class="source-line-text">            path: request.path,</span></span>
  <span class="source-line"><span class="source-line-number">623</span><span class="source-line-text">            version: next,</span></span>
  <span class="source-line"><span class="source-line-number">624</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">625</span><span class="source-line-text">          await connection.sendNotification(&quot;textDocument/didChange&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">626</span><span class="source-line-text">            textDocument: {</span></span>
  <span class="source-line"><span class="source-line-number">627</span><span class="source-line-text">              uri: pathToFileURL(request.path).href,</span></span>
  <span class="source-line"><span class="source-line-number">628</span><span class="source-line-text">              version: next,</span></span>
  <span class="source-line"><span class="source-line-number">629</span><span class="source-line-text">            },</span></span>
  <span class="source-line"><span class="source-line-number">630</span><span class="source-line-text">            contentChanges:</span></span>
  <span class="source-line"><span class="source-line-number">631</span><span class="source-line-text">              syncKind === TEXT_DOCUMENT_SYNC_INCREMENTAL</span></span>
  <span class="source-line"><span class="source-line-number">632</span><span class="source-line-text">                ? [</span></span>
  <span class="source-line"><span class="source-line-number">633</span><span class="source-line-text">                    {</span></span>
  <span class="source-line"><span class="source-line-number">634</span><span class="source-line-text">                      range: {</span></span>
  <span class="source-line"><span class="source-line-number">635</span><span class="source-line-text">                        start: { line: 0, character: 0 },</span></span>
  <span class="source-line"><span class="source-line-number">636</span><span class="source-line-text">                        end: endPosition(document.text),</span></span>
  <span class="source-line"><span class="source-line-number">637</span><span class="source-line-text">                      },</span></span>
  <span class="source-line"><span class="source-line-number">638</span><span class="source-line-text">                      text,</span></span>
  <span class="source-line"><span class="source-line-number">639</span><span class="source-line-text">                    },</span></span>
  <span class="source-line"><span class="source-line-number">640</span><span class="source-line-text">                  ]</span></span>
  <span class="source-line"><span class="source-line-number">641</span><span class="source-line-text">                : [{ text }],</span></span>
  <span class="source-line"><span class="source-line-number">642</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">643</span><span class="source-line-text">          return next</span></span>
  <span class="source-line"><span class="source-line-number">644</span><span class="source-line-text">        }</span></span>
  <span class="source-line"><span class="source-line-number">645</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">646</span><span class="source-line-text">        logger.info(&quot;workspace/didChangeWatchedFiles&quot;, request)</span></span>
  <span class="source-line"><span class="source-line-number">647</span><span class="source-line-text">        await connection.sendNotification(&quot;workspace/didChangeWatchedFiles&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">648</span><span class="source-line-text">          changes: [</span></span>
  <span class="source-line"><span class="source-line-number">649</span><span class="source-line-text">            {</span></span>
  <span class="source-line"><span class="source-line-number">650</span><span class="source-line-text">              uri: pathToFileURL(request.path).href,</span></span>
  <span class="source-line"><span class="source-line-number">651</span><span class="source-line-text">              type: FILE_CHANGE_CREATED,</span></span>
  <span class="source-line"><span class="source-line-number">652</span><span class="source-line-text">            },</span></span>
  <span class="source-line"><span class="source-line-number">653</span><span class="source-line-text">          ],</span></span>
  <span class="source-line"><span class="source-line-number">654</span><span class="source-line-text">        })</span></span>
  <span class="source-line"><span class="source-line-number">655</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">656</span><span class="source-line-text">        logger.info(&quot;textDocument/didOpen&quot;, request)</span></span>
  <span class="source-line"><span class="source-line-number">657</span><span class="source-line-text">        pushDiagnostics.delete(request.path)</span></span>
  <span class="source-line"><span class="source-line-number">658</span><span class="source-line-text">        pullDiagnostics.delete(request.path)</span></span>
  <span class="source-line"><span class="source-line-number">659</span><span class="source-line-text">        await connection.sendNotification(&quot;textDocument/didOpen&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">660</span><span class="source-line-text">          textDocument: {</span></span>
  <span class="source-line"><span class="source-line-number">661</span><span class="source-line-text">            uri: pathToFileURL(request.path).href,</span></span>
  <span class="source-line"><span class="source-line-number">662</span><span class="source-line-text">            languageId,</span></span>
  <span class="source-line"><span class="source-line-number">663</span><span class="source-line-text">            version: 0,</span></span>
  <span class="source-line"><span class="source-line-number">664</span><span class="source-line-text">            text,</span></span>
  <span class="source-line"><span class="source-line-number">665</span><span class="source-line-text">          },</span></span>
  <span class="source-line"><span class="source-line-number">666</span><span class="source-line-text">        })</span></span>
  <span class="source-line"><span class="source-line-number">667</span><span class="source-line-text">        files[request.path] = { version: 0, text }</span></span>
  <span class="source-line"><span class="source-line-number">668</span><span class="source-line-text">        return 0</span></span>
  <span class="source-line"><span class="source-line-number">669</span><span class="source-line-text">      },</span></span>
  <span class="source-line"><span class="source-line-number">670</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">671</span><span class="source-line-text">    get diagnostics() {</span></span>
  <span class="source-line"><span class="source-line-number">672</span><span class="source-line-text">      const result = new Map&lt;string, Diagnostic[]&gt;()</span></span>
  <span class="source-line"><span class="source-line-number">673</span><span class="source-line-text">      for (const key of new Set([...pushDiagnostics.keys(), ...pullDiagnostics.keys()])) {</span></span>
  <span class="source-line"><span class="source-line-number">674</span><span class="source-line-text">        result.set(key, mergedDiagnostics(key))</span></span>
  <span class="source-line"><span class="source-line-number">675</span><span class="source-line-text">      }</span></span>
  <span class="source-line"><span class="source-line-number">676</span><span class="source-line-text">      return result</span></span>
  <span class="source-line"><span class="source-line-number">677</span><span class="source-line-text">    },</span></span>
  <span class="source-line"><span class="source-line-number">678</span><span class="source-line-text">    async waitForDiagnostics(request: { path: string; version: number; mode?: &quot;document&quot; | &quot;full&quot;; after?: number }) {</span></span>
  <span class="source-line"><span class="source-line-number">679</span><span class="source-line-text">      const normalizedPath = Filesystem.normalizePath(</span></span>
  <span class="source-line"><span class="source-line-number">680</span><span class="source-line-text">        path.isAbsolute(request.path) ? request.path : path.resolve(input.directory, request.path),</span></span>
  <span class="source-line"><span class="source-line-number">681</span><span class="source-line-text">      )</span></span>
  <span class="source-line"><span class="source-line-number">682</span><span class="source-line-text">      logger.info(&quot;waiting for diagnostics&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">683</span><span class="source-line-text">        path: normalizedPath,</span></span>
  <span class="source-line"><span class="source-line-number">684</span><span class="source-line-text">        mode: request.mode ?? &quot;full&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">685</span><span class="source-line-text">        version: request.version,</span></span>
  <span class="source-line"><span class="source-line-number">686</span><span class="source-line-text">      })</span></span>
  <span class="source-line"><span class="source-line-number">687</span><span class="source-line-text">      if (request.mode === &quot;document&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">688</span><span class="source-line-text">        await waitForDocumentDiagnostics({ path: normalizedPath, version: request.version, after: request.after })</span></span>
  <span class="source-line"><span class="source-line-number">689</span><span class="source-line-text">        return</span></span>
  <span class="source-line"><span class="source-line-number">690</span><span class="source-line-text">      }</span></span>
  <span class="source-line"><span class="source-line-number">691</span><span class="source-line-text">      await waitForFullDiagnostics({ path: normalizedPath, version: request.version, after: request.after })</span></span>
  <span class="source-line"><span class="source-line-number">692</span><span class="source-line-text">    },</span></span></code></pre>
  </details>

5. `packages/opencode/src/lsp/client.ts:191-208`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/lsp/client.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/lsp/client.ts:191-208</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">  connection.onNotification(&quot;textDocument/publishDiagnostics&quot;, (params) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">    const filePath = getFilePath(params.uri)</span></span>
  <span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">    if (!filePath) return</span></span>
  <span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">    logger.info(&quot;textDocument/publishDiagnostics&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      path: filePath,</span></span>
  <span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">      count: params.diagnostics.length,</span></span>
  <span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">      version: params.version,</span></span>
  <span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">    })</span></span>
  <span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">    published.set(filePath, {</span></span>
  <span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">      at: Date.now(),</span></span>
  <span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">      version: typeof params.version === &quot;number&quot; ? params.version : undefined,</span></span>
  <span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">    })</span></span>
  <span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">    if (shouldSeedDiagnosticsOnFirstPush(input.serverID) &amp;&amp; !pushDiagnostics.has(filePath)) {</span></span>
  <span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">      pushDiagnostics.set(filePath, params.diagnostics)</span></span>
  <span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">      return</span></span>
  <span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">    }</span></span>
  <span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">    updatePushDiagnostics(filePath, params.diagnostics)</span></span>
  <span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">  })</span></span></code></pre>
  </details>

6. `packages/opencode/src/lsp/client.ts:332-483`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/lsp/client.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/lsp/client.ts:332-483</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">332</span><span class="source-line-text">  async function requestDiagnosticReport(filePath: string, identifier?: string): Promise&lt;DiagnosticRequestResult&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">333</span><span class="source-line-text">    const report = await withTimeout(</span></span>
  <span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">      connection.sendRequest&lt;DocumentDiagnosticReport | null&gt;(&quot;textDocument/diagnostic&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">        ...(identifier ? { identifier } : {}),</span></span>
  <span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">        textDocument: {</span></span>
  <span class="source-line"><span class="source-line-number">337</span><span class="source-line-text">          uri: pathToFileURL(filePath).href,</span></span>
  <span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">        },</span></span>
  <span class="source-line"><span class="source-line-number">339</span><span class="source-line-text">      }),</span></span>
  <span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">      DIAGNOSTICS_REQUEST_TIMEOUT_MS,</span></span>
  <span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">    ).catch(() =&gt; null)</span></span>
  <span class="source-line"><span class="source-line-number">342</span><span class="source-line-text">    if (!report) return { handled: false, matched: false, byFile: new Map&lt;string, Diagnostic[]&gt;() }</span></span>
  <span class="source-line"><span class="source-line-number">343</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">344</span><span class="source-line-text">    const byFile = new Map&lt;string, Diagnostic[]&gt;()</span></span>
  <span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">    const push = (target: string, items: Diagnostic[]) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">346</span><span class="source-line-text">      const existing = byFile.get(target) ?? []</span></span>
  <span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">      byFile.set(target, existing.concat(items))</span></span>
  <span class="source-line"><span class="source-line-number">348</span><span class="source-line-text">    }</span></span>
  <span class="source-line"><span class="source-line-number">349</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">    let handled = false</span></span>
  <span class="source-line"><span class="source-line-number">351</span><span class="source-line-text">    let matched = false</span></span>
  <span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">    if (Array.isArray(report.items)) {</span></span>
  <span class="source-line"><span class="source-line-number">353</span><span class="source-line-text">      push(filePath, report.items)</span></span>
  <span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">      handled = true</span></span>
  <span class="source-line"><span class="source-line-number">355</span><span class="source-line-text">      matched = true</span></span>
  <span class="source-line"><span class="source-line-number">356</span><span class="source-line-text">    }</span></span>
  <span class="source-line"><span class="source-line-number">357</span><span class="source-line-text">    for (const [uri, related] of Object.entries(report.relatedDocuments ?? {})) {</span></span>
  <span class="source-line"><span class="source-line-number">358</span><span class="source-line-text">      const relatedPath = getFilePath(uri)</span></span>
  <span class="source-line"><span class="source-line-number">359</span><span class="source-line-text">      if (!relatedPath || !Array.isArray(related.items)) continue</span></span>
  <span class="source-line"><span class="source-line-number">360</span><span class="source-line-text">      push(relatedPath, related.items)</span></span>
  <span class="source-line"><span class="source-line-number">361</span><span class="source-line-text">      handled = true</span></span>
  <span class="source-line"><span class="source-line-number">362</span><span class="source-line-text">      matched = matched || relatedPath === filePath</span></span>
  <span class="source-line"><span class="source-line-number">363</span><span class="source-line-text">    }</span></span>
  <span class="source-line"><span class="source-line-number">364</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">365</span><span class="source-line-text">    return { handled, matched, byFile }</span></span>
  <span class="source-line"><span class="source-line-number">366</span><span class="source-line-text">  }</span></span>
  <span class="source-line"><span class="source-line-number">367</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">368</span><span class="source-line-text">  async function requestWorkspaceDiagnosticReport(</span></span>
  <span class="source-line"><span class="source-line-number">369</span><span class="source-line-text">    filePath: string,</span></span>
  <span class="source-line"><span class="source-line-number">370</span><span class="source-line-text">    identifier?: string,</span></span>
  <span class="source-line"><span class="source-line-number">371</span><span class="source-line-text">  ): Promise&lt;DiagnosticRequestResult&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">372</span><span class="source-line-text">    const report = await withTimeout(</span></span>
  <span class="source-line"><span class="source-line-number">373</span><span class="source-line-text">      connection.sendRequest&lt;WorkspaceDiagnosticReport | null&gt;(&quot;workspace/diagnostic&quot;, {</span></span>
  <span class="source-line"><span class="source-line-number">374</span><span class="source-line-text">        ...(identifier ? { identifier } : {}),</span></span>
  <span class="source-line"><span class="source-line-number">375</span><span class="source-line-text">        previousResultIds: [],</span></span>
  <span class="source-line"><span class="source-line-number">376</span><span class="source-line-text">      }),</span></span>
  <span class="source-line"><span class="source-line-number">377</span><span class="source-line-text">      DIAGNOSTICS_REQUEST_TIMEOUT_MS,</span></span>
  <span class="source-line"><span class="source-line-number">378</span><span class="source-line-text">    ).catch(() =&gt; null)</span></span>
  <span class="source-line"><span class="source-line-number">379</span><span class="source-line-text">    if (!report) return { handled: false, matched: false, byFile: new Map&lt;string, Diagnostic[]&gt;() }</span></span>
  <span class="source-line"><span class="source-line-number">380</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">381</span><span class="source-line-text">    const byFile = new Map&lt;string, Diagnostic[]&gt;()</span></span>
  <span class="source-line"><span class="source-line-number">382</span><span class="source-line-text">    let matched = false</span></span>
  <span class="source-line"><span class="source-line-number">383</span><span class="source-line-text">    for (const item of report.items ?? []) {</span></span>
  <span class="source-line"><span class="source-line-number">384</span><span class="source-line-text">      const relatedPath = item.uri ? getFilePath(item.uri) : undefined</span></span>
  <span class="source-line"><span class="source-line-number">385</span><span class="source-line-text">      if (!relatedPath || !Array.isArray(item.items)) continue</span></span>
  <span class="source-line"><span class="source-line-number">386</span><span class="source-line-text">      const existing = byFile.get(relatedPath) ?? []</span></span>
  <span class="source-line"><span class="source-line-number">387</span><span class="source-line-text">      byFile.set(relatedPath, existing.concat(item.items))</span></span>
  <span class="source-line"><span class="source-line-number">388</span><span class="source-line-text">      matched = matched || relatedPath === filePath</span></span>
  <span class="source-line"><span class="source-line-number">389</span><span class="source-line-text">    }</span></span>
  <span class="source-line"><span class="source-line-number">390</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">391</span><span class="source-line-text">    return { handled: true, matched, byFile }</span></span>
  <span class="source-line"><span class="source-line-number">392</span><span class="source-line-text">  }</span></span>
  <span class="source-line"><span class="source-line-number">393</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">394</span><span class="source-line-text">  function documentPullState() {</span></span>
  <span class="source-line"><span class="source-line-number">395</span><span class="source-line-text">    const documentRegistrations = [...diagnosticRegistrations.values()].filter(</span></span>
  <span class="source-line"><span class="source-line-number">396</span><span class="source-line-text">      (registration) =&gt; registration.registerOptions?.workspaceDiagnostics !== true,</span></span>
  <span class="source-line"><span class="source-line-number">397</span><span class="source-line-text">    )</span></span>
  <span class="source-line"><span class="source-line-number">398</span><span class="source-line-text">    return {</span></span>
  <span class="source-line"><span class="source-line-number">399</span><span class="source-line-text">      documentIdentifiers: [</span></span>
  <span class="source-line"><span class="source-line-number">400</span><span class="source-line-text">        ...new Set(documentRegistrations.flatMap((registration) =&gt; registration.registerOptions?.identifier ?? [])),</span></span>
  <span class="source-line"><span class="source-line-number">401</span><span class="source-line-text">      ],</span></span>
  <span class="source-line"><span class="source-line-number">402</span><span class="source-line-text">      supported: hasStaticPullDiagnostics || documentRegistrations.length &gt; 0,</span></span>
  <span class="source-line"><span class="source-line-number">403</span><span class="source-line-text">    }</span></span>
  <span class="source-line"><span class="source-line-number">404</span><span class="source-line-text">  }</span></span>
  <span class="source-line"><span class="source-line-number">405</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">406</span><span class="source-line-text">  function workspacePullState() {</span></span>
  <span class="source-line"><span class="source-line-number">407</span><span class="source-line-text">    const workspaceRegistrations = [...diagnosticRegistrations.values()].filter(</span></span>
  <span class="source-line"><span class="source-line-number">408</span><span class="source-line-text">      (registration) =&gt; registration.registerOptions?.workspaceDiagnostics === true,</span></span>
  <span class="source-line"><span class="source-line-number">409</span><span class="source-line-text">    )</span></span>
  <span class="source-line"><span class="source-line-number">410</span><span class="source-line-text">    return {</span></span>
  <span class="source-line"><span class="source-line-number">411</span><span class="source-line-text">      workspaceIdentifiers: [</span></span>
  <span class="source-line"><span class="source-line-number">412</span><span class="source-line-text">        ...new Set(workspaceRegistrations.flatMap((registration) =&gt; registration.registerOptions?.identifier ?? [])),</span></span>
  <span class="source-line"><span class="source-line-number">413</span><span class="source-line-text">      ],</span></span>
  <span class="source-line"><span class="source-line-number">414</span><span class="source-line-text">      supported: workspaceRegistrations.length &gt; 0,</span></span>
  <span class="source-line"><span class="source-line-number">415</span><span class="source-line-text">    }</span></span>
  <span class="source-line"><span class="source-line-number">416</span><span class="source-line-text">  }</span></span>
  <span class="source-line"><span class="source-line-number">417</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">418</span><span class="source-line-text">  const hasCurrentFileDiagnostics = (filePath: string, results: DiagnosticRequestResult[]) =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">419</span><span class="source-line-text">    results.some((result) =&gt; (result.byFile.get(filePath)?.length ?? 0) &gt; 0)</span></span>
  <span class="source-line"><span class="source-line-number">420</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">421</span><span class="source-line-text">  async function requestDiagnostics(</span></span>
  <span class="source-line"><span class="source-line-number">422</span><span class="source-line-text">    filePath: string,</span></span>
  <span class="source-line"><span class="source-line-number">423</span><span class="source-line-text">    requests: Promise&lt;DiagnosticRequestResult&gt;[],</span></span>
  <span class="source-line"><span class="source-line-number">424</span><span class="source-line-text">    done: (results: DiagnosticRequestResult[]) =&gt; boolean,</span></span>
  <span class="source-line"><span class="source-line-number">425</span><span class="source-line-text">  ) {</span></span>
  <span class="source-line"><span class="source-line-number">426</span><span class="source-line-text">    if (!requests.length) return { handled: false, matched: false }</span></span>
  <span class="source-line"><span class="source-line-number">427</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">428</span><span class="source-line-text">    const results: DiagnosticRequestResult[] = []</span></span>
  <span class="source-line"><span class="source-line-number">429</span><span class="source-line-text">    return new Promise&lt;{ handled: boolean; matched: boolean }&gt;((resolve) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">430</span><span class="source-line-text">      let pending = requests.length</span></span>
  <span class="source-line"><span class="source-line-number">431</span><span class="source-line-text">      let resolved = false</span></span>
  <span class="source-line"><span class="source-line-number">432</span><span class="source-line-text">      const finish = (merged: { handled: boolean; matched: boolean }, force = false) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">433</span><span class="source-line-text">        if (resolved) return</span></span>
  <span class="source-line"><span class="source-line-number">434</span><span class="source-line-text">        if (!force &amp;&amp; !done(results)) return</span></span>
  <span class="source-line"><span class="source-line-number">435</span><span class="source-line-text">        resolved = true</span></span>
  <span class="source-line"><span class="source-line-number">436</span><span class="source-line-text">        resolve(merged)</span></span>
  <span class="source-line"><span class="source-line-number">437</span><span class="source-line-text">      }</span></span>
  <span class="source-line"><span class="source-line-number">438</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">439</span><span class="source-line-text">      for (const request of requests) {</span></span>
  <span class="source-line"><span class="source-line-number">440</span><span class="source-line-text">        request.then((result) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">441</span><span class="source-line-text">          results.push(result)</span></span>
  <span class="source-line"><span class="source-line-number">442</span><span class="source-line-text">          pending -= 1</span></span>
  <span class="source-line"><span class="source-line-number">443</span><span class="source-line-text">          const merged = mergeResults(filePath, results)</span></span>
  <span class="source-line"><span class="source-line-number">444</span><span class="source-line-text">          finish(merged)</span></span>
  <span class="source-line"><span class="source-line-number">445</span><span class="source-line-text">          if (pending === 0) finish(merged, true)</span></span>
  <span class="source-line"><span class="source-line-number">446</span><span class="source-line-text">        })</span></span>
  <span class="source-line"><span class="source-line-number">447</span><span class="source-line-text">      }</span></span>
  <span class="source-line"><span class="source-line-number">448</span><span class="source-line-text">    })</span></span>
  <span class="source-line"><span class="source-line-number">449</span><span class="source-line-text">  }</span></span>
  <span class="source-line"><span class="source-line-number">450</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">  // LATENCY-CRITICAL: dispatch identifier pulls in parallel and unblock once one</span></span>
  <span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">  // batch already produced diagnostics for the current file. Let slower pulls keep</span></span>
  <span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">  // merging in the background; do not sequence identifier-by-identifier, and do</span></span>
  <span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">  // not add a post-match settle/debounce delay. See PR #23771.</span></span>
  <span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">  async function requestDocumentDiagnostics(filePath: string) {</span></span>
  <span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">    const state = documentPullState()</span></span>
  <span class="source-line"><span class="source-line-number">457</span><span class="source-line-text">    if (!state.supported) return { handled: false, matched: false }</span></span>
  <span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">    return requestDiagnostics(</span></span>
  <span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">      filePath,</span></span>
  <span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">      [</span></span>
  <span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">        requestDiagnosticReport(filePath),</span></span>
  <span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">        ...state.documentIdentifiers.map((identifier) =&gt; requestDiagnosticReport(filePath, identifier)),</span></span>
  <span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">      ],</span></span>
  <span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">      (results) =&gt; hasCurrentFileDiagnostics(filePath, results),</span></span>
  <span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">    )</span></span>
  <span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">  }</span></span>
  <span class="source-line"><span class="source-line-number">467</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">  async function requestFullDiagnostics(filePath: string) {</span></span>
  <span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">    const documentState = documentPullState()</span></span>
  <span class="source-line"><span class="source-line-number">470</span><span class="source-line-text">    const workspaceState = workspacePullState()</span></span>
  <span class="source-line"><span class="source-line-number">471</span><span class="source-line-text">    if (!documentState.supported &amp;&amp; !workspaceState.supported) return { handled: false, matched: false }</span></span>
  <span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">    return mergeResults(</span></span>
  <span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">      filePath,</span></span>
  <span class="source-line"><span class="source-line-number">474</span><span class="source-line-text">      await Promise.all([</span></span>
  <span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">        ...(documentState.supported ? [requestDiagnosticReport(filePath)] : []),</span></span>
  <span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">        ...documentState.documentIdentifiers.map((identifier) =&gt; requestDiagnosticReport(filePath, identifier)),</span></span>
  <span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">        ...(workspaceState.supported ? [requestWorkspaceDiagnosticReport(filePath)] : []),</span></span>
  <span class="source-line"><span class="source-line-number">478</span><span class="source-line-text">        ...workspaceState.workspaceIdentifiers.map((identifier) =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">479</span><span class="source-line-text">          requestWorkspaceDiagnosticReport(filePath, identifier),</span></span>
  <span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">        ),</span></span>
  <span class="source-line"><span class="source-line-number">481</span><span class="source-line-text">      ]),</span></span>
  <span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">    )</span></span>
  <span class="source-line"><span class="source-line-number">483</span><span class="source-line-text">  }</span></span></code></pre>
  </details>

7. `packages/opencode/src/tool/lsp.ts:37-110`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/tool/lsp.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/tool/lsp.ts:37-110</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">export const LspTool = Tool.define(</span></span>
  <span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">  &quot;lsp&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  Effect.gen(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">    const lsp = yield* LSP.Service</span></span>
  <span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">    const fs = yield* AppFileSystem.Service</span></span>
  <span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">    return {</span></span>
  <span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">      description: DESCRIPTION,</span></span>
  <span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">      parameters: Parameters,</span></span>
  <span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">      execute: (args: Schema.Schema.Type&lt;typeof Parameters&gt;, ctx: Tool.Context) =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">        Effect.gen(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">          const instance = yield* InstanceState.context</span></span>
  <span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">          const file = path.isAbsolute(args.filePath) ? args.filePath : path.join(instance.directory, args.filePath)</span></span>
  <span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">          yield* assertExternalDirectoryEffect(ctx, file)</span></span>
  <span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">          const meta =</span></span>
  <span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">            args.operation === &quot;workspaceSymbol&quot;</span></span>
  <span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">              ? { operation: args.operation }</span></span>
  <span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">              : args.operation === &quot;documentSymbol&quot;</span></span>
  <span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">                ? { operation: args.operation, filePath: file }</span></span>
  <span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">                : { operation: args.operation, filePath: file, line: args.line, character: args.character }</span></span>
  <span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">          yield* ctx.ask({</span></span>
  <span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">            permission: &quot;lsp&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">            patterns: [&quot;*&quot;],</span></span>
  <span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">            always: [&quot;*&quot;],</span></span>
  <span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">            metadata: meta,</span></span>
  <span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">62</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">          const uri = pathToFileURL(file).href</span></span>
  <span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">          const position = { file, line: args.line - 1, character: args.character - 1 }</span></span>
  <span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">          const relPath = path.relative(instance.worktree, file)</span></span>
  <span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">          const detail =</span></span>
  <span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">            args.operation === &quot;workspaceSymbol&quot;</span></span>
  <span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">              ? &quot;&quot;</span></span>
  <span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">              : args.operation === &quot;documentSymbol&quot;</span></span>
  <span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">                ? relPath</span></span>
  <span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">                : `${relPath}:${args.line}:${args.character}`</span></span>
  <span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">          const title = detail ? `${args.operation} ${detail}` : args.operation</span></span>
  <span class="source-line"><span class="source-line-number">73</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">          const exists = yield* fs.existsSafe(file)</span></span>
  <span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">          if (!exists) throw new Error(`File not found: ${file}`)</span></span>
  <span class="source-line"><span class="source-line-number">76</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">          const available = yield* lsp.hasClients(file)</span></span>
  <span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">          if (!available) throw new Error(&quot;No LSP server available for this file type.&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">79</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">          yield* lsp.touchFile(file, &quot;document&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">81</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">          const result: unknown[] = yield* (() =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">            switch (args.operation) {</span></span>
  <span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">              case &quot;goToDefinition&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">                return lsp.definition(position)</span></span>
  <span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">              case &quot;findReferences&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">                return lsp.references(position)</span></span>
  <span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">              case &quot;hover&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">                return lsp.hover(position)</span></span>
  <span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">              case &quot;documentSymbol&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">                return lsp.documentSymbol(uri)</span></span>
  <span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">              case &quot;workspaceSymbol&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">                return lsp.workspaceSymbol(args.query ?? &quot;&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">              case &quot;goToImplementation&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">                return lsp.implementation(position)</span></span>
  <span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">              case &quot;prepareCallHierarchy&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">                return lsp.prepareCallHierarchy(position)</span></span>
  <span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">              case &quot;incomingCalls&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">                return lsp.incomingCalls(position)</span></span>
  <span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">              case &quot;outgoingCalls&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">                return lsp.outgoingCalls(position)</span></span>
  <span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">          })()</span></span>
  <span class="source-line"><span class="source-line-number">104</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">          return {</span></span>
  <span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">            title,</span></span>
  <span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">            metadata: { result },</span></span>
  <span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">            output: result.length === 0 ? `No results found for ${args.operation}` : JSON.stringify(result, null, 2),</span></span>
  <span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">        }).pipe(Effect.orDie),</span></span></code></pre>
  </details>


读完画一条链：`edit -> touchFile -> getClients -> notify.open -> wait diagnostics -> Diagnostic.report -> tool output`。

## 15. 面试式自测

1. 为什么 LSP client 要缓存，而不是每次查询都启动一个 language server？
2. 如果 language server 启动失败，OpenCode 如何避免反复失败？
3. 为什么 `touchFile` 捕获错误而不是让 edit/write 失败？
4. 为什么 `LspTool` 查询前还要做权限审批？
5. diagnostics 是 session 状态的一部分吗？它最终怎样进入下一轮推理？
6. 如果你要给 mini agent 加 Java 支持，你会在哪里增加 Java language server？

## 16. 下一步阅读建议

下一章建议读 “UI / TUI / Desktop / IDE”。LSP 和权限都通过事件、tool output 和 session 状态对外呈现，UI 章会看到这些状态如何被不同前端消费。


