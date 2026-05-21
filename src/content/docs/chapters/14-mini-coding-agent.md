---
title: "从 OpenCode 反推 mini coding agent"
description: "把 OpenCode 的 CLI、session、LLM、tool、permission 和 processor 源码反推成一个可自己实现的 mini coding agent 闭环。"
sidebar:
  label: "14. 从 OpenCode 反推 mini coding agent"
  order: 14
---

<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">已完成</span></div>
  <div><strong>难度</strong>中等</div>
  <div><strong>预计阅读</strong>60 分钟</div>
  <div><strong>源文件</strong><a href="/markdown/14-mini-coding-agent.md"><code>markdown/14-mini-coding-agent.md</code></a></div>
</div>

## Agent 生成档案

- 章节 ID：`14-mini-coding-agent`
- 章节摘要：把 OpenCode 的 CLI、session、LLM、tool、permission 和 processor 源码反推成一个可自己实现的 mini coding agent 闭环。
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

<li><code>packages/opencode/src/cli/cmd/run.ts</code></li>
<li><code>packages/opencode/src/session/prompt.ts</code></li>
<li><code>packages/opencode/src/session/llm.ts</code></li>
<li><code>packages/opencode/src/tool/tool.ts</code></li>
<li><code>packages/opencode/src/session/tools.ts</code></li>
<li><code>packages/opencode/src/permission/index.ts</code></li>
<li><code>packages/opencode/src/tool/read.ts</code></li>
<li><code>packages/opencode/src/tool/edit.ts</code></li>
<li><code>packages/opencode/src/tool/shell.ts</code></li>
<li><code>packages/opencode/src/session/processor.ts</code></li>
<li><code>packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts</code></li>

</ul>


## 0. 本章学习目标

这一章不是继续介绍 OpenCode 的某个单独模块，而是把前面章节反推成一个你可以自己实现的 mini coding agent。

学完你应该能：

1. 从 OpenCode 的真实源码里提炼一个最小 agent 架构。
2. 知道第一版必须保留哪些模块，哪些可以延后。
3. 能用 Java 后端分层方式理解 TypeScript agent 代码。
4. 能写出一个 mini agent 的 CLI、Session、LLM、Tool、Permission、事件输出骨架。

## 1. 一句话讲明白

一个 mini coding agent 的最小闭环是：接收用户输入，保存成 session message，调用 LLM，发现 tool call，执行工具并写回 tool result，再把结果发回 LLM，直到模型停止。

这条链路在 OpenCode 里的真实来源主要是：

- CLI 输入：`packages/opencode/src/cli/cmd/run.ts:768-803`

  <details class="source-ref source-ref--inline">
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

- prompt/session 入口：`packages/opencode/src/session/prompt.ts:1211-1230`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1211-1230</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1211</span><span class="source-line-text">    const prompt: (input: PromptInput) =&gt; Effect.Effect&lt;MessageV2.WithParts, Image.Error&gt; = Effect.fn(</span></span>
  <span class="source-line"><span class="source-line-number">1212</span><span class="source-line-text">      &quot;SessionPrompt.prompt&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1213</span><span class="source-line-text">    )(function* (input: PromptInput) {</span></span>
  <span class="source-line"><span class="source-line-number">1214</span><span class="source-line-text">      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)</span></span>
  <span class="source-line"><span class="source-line-number">1215</span><span class="source-line-text">      yield* revert.cleanup(session)</span></span>
  <span class="source-line"><span class="source-line-number">1216</span><span class="source-line-text">      const message = yield* createUserMessage(input)</span></span>
  <span class="source-line"><span class="source-line-number">1217</span><span class="source-line-text">      yield* sessions.touch(input.sessionID)</span></span>
  <span class="source-line"><span class="source-line-number">1218</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1219</span><span class="source-line-text">      const permissions: Permission.Ruleset = []</span></span>
  <span class="source-line"><span class="source-line-number">1220</span><span class="source-line-text">      for (const [t, enabled] of Object.entries(input.tools ?? {})) {</span></span>
  <span class="source-line"><span class="source-line-number">1221</span><span class="source-line-text">        permissions.push({ permission: t, action: enabled ? &quot;allow&quot; : &quot;deny&quot;, pattern: &quot;*&quot; })</span></span>
  <span class="source-line"><span class="source-line-number">1222</span><span class="source-line-text">      }</span></span>
  <span class="source-line"><span class="source-line-number">1223</span><span class="source-line-text">      if (permissions.length &gt; 0) {</span></span>
  <span class="source-line"><span class="source-line-number">1224</span><span class="source-line-text">        session.permission = permissions</span></span>
  <span class="source-line"><span class="source-line-number">1225</span><span class="source-line-text">        yield* sessions.setPermission({ sessionID: session.id, permission: permissions })</span></span>
  <span class="source-line"><span class="source-line-number">1226</span><span class="source-line-text">      }</span></span>
  <span class="source-line"><span class="source-line-number">1227</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1228</span><span class="source-line-text">      if (input.noReply === true) return message</span></span>
  <span class="source-line"><span class="source-line-number">1229</span><span class="source-line-text">      return yield* loop({ sessionID: input.sessionID })</span></span>
  <span class="source-line"><span class="source-line-number">1230</span><span class="source-line-text">    })</span></span></code></pre>
  </details>

- agent loop：`packages/opencode/src/session/prompt.ts:1248-1489`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1248-1489</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1248</span><span class="source-line-text">        while (true) {</span></span>
  <span class="source-line"><span class="source-line-number">1249</span><span class="source-line-text">          yield* status.set(sessionID, { type: &quot;busy&quot; })</span></span>
  <span class="source-line"><span class="source-line-number">1250</span><span class="source-line-text">          yield* slog.info(&quot;loop&quot;, { step })</span></span>
  <span class="source-line"><span class="source-line-number">1251</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1252</span><span class="source-line-text">          let msgs = yield* MessageV2.filterCompactedEffect(sessionID)</span></span>
  <span class="source-line"><span class="source-line-number">1253</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1254</span><span class="source-line-text">          const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)</span></span>
  <span class="source-line"><span class="source-line-number">1255</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1256</span><span class="source-line-text">          if (!lastUser) throw new Error(&quot;No user message found in stream. This should never happen.&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">1257</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1258</span><span class="source-line-text">          const lastAssistantMsg = msgs.findLast(</span></span>
  <span class="source-line"><span class="source-line-number">1259</span><span class="source-line-text">            (msg) =&gt; msg.info.role === &quot;assistant&quot; &amp;&amp; msg.info.id === lastAssistant?.id,</span></span>
  <span class="source-line"><span class="source-line-number">1260</span><span class="source-line-text">          )</span></span>
  <span class="source-line"><span class="source-line-number">1261</span><span class="source-line-text">          // Some providers return &quot;stop&quot; even when the assistant message contains tool calls.</span></span>
  <span class="source-line"><span class="source-line-number">1262</span><span class="source-line-text">          // Keep the loop running so tool results can be sent back to the model.</span></span>
  <span class="source-line"><span class="source-line-number">1263</span><span class="source-line-text">          // Skip provider-executed tool parts — those were fully handled within the</span></span>
  <span class="source-line"><span class="source-line-number">1264</span><span class="source-line-text">          // provider's stream (e.g. DWS Agent Platform) and don't need a re-loop.</span></span>
  <span class="source-line"><span class="source-line-number">1265</span><span class="source-line-text">          const hasToolCalls =</span></span>
  <span class="source-line"><span class="source-line-number">1266</span><span class="source-line-text">            lastAssistantMsg?.parts.some((part) =&gt; part.type === &quot;tool&quot; &amp;&amp; !part.metadata?.providerExecuted) ?? false</span></span>
  <span class="source-line"><span class="source-line-number">1267</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1268</span><span class="source-line-text">          if (</span></span>
  <span class="source-line"><span class="source-line-number">1269</span><span class="source-line-text">            lastAssistant?.finish &amp;&amp;</span></span>
  <span class="source-line"><span class="source-line-number">1270</span><span class="source-line-text">            ![&quot;tool-calls&quot;].includes(lastAssistant.finish) &amp;&amp;</span></span>
  <span class="source-line"><span class="source-line-number">1271</span><span class="source-line-text">            !hasToolCalls &amp;&amp;</span></span>
  <span class="source-line"><span class="source-line-number">1272</span><span class="source-line-text">            lastUser.id &lt; lastAssistant.id</span></span>
  <span class="source-line"><span class="source-line-number">1273</span><span class="source-line-text">          ) {</span></span>
  <span class="source-line"><span class="source-line-number">1274</span><span class="source-line-text">            yield* slog.info(&quot;exiting loop&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">1275</span><span class="source-line-text">            break</span></span>
  <span class="source-line"><span class="source-line-number">1276</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1277</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1278</span><span class="source-line-text">          step++</span></span>
  <span class="source-line"><span class="source-line-number">1279</span><span class="source-line-text">          if (step === 1)</span></span>
  <span class="source-line"><span class="source-line-number">1280</span><span class="source-line-text">            yield* title({</span></span>
  <span class="source-line"><span class="source-line-number">1281</span><span class="source-line-text">              session,</span></span>
  <span class="source-line"><span class="source-line-number">1282</span><span class="source-line-text">              modelID: lastUser.model.modelID,</span></span>
  <span class="source-line"><span class="source-line-number">1283</span><span class="source-line-text">              providerID: lastUser.model.providerID,</span></span>
  <span class="source-line"><span class="source-line-number">1284</span><span class="source-line-text">              history: msgs,</span></span>
  <span class="source-line"><span class="source-line-number">1285</span><span class="source-line-text">            }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
  <span class="source-line"><span class="source-line-number">1286</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1287</span><span class="source-line-text">          const model = yield* getModel(lastUser.model.providerID, lastUser.model.modelID, sessionID)</span></span>
  <span class="source-line"><span class="source-line-number">1288</span><span class="source-line-text">          const task = tasks.pop()</span></span>
  <span class="source-line"><span class="source-line-number">1289</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1290</span><span class="source-line-text">          if (task?.type === &quot;subtask&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">1291</span><span class="source-line-text">            yield* handleSubtask({ task, model, lastUser, sessionID, session, msgs })</span></span>
  <span class="source-line"><span class="source-line-number">1292</span><span class="source-line-text">            continue</span></span>
  <span class="source-line"><span class="source-line-number">1293</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1294</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1295</span><span class="source-line-text">          if (task?.type === &quot;compaction&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">1296</span><span class="source-line-text">            const result = yield* compaction.process({</span></span>
  <span class="source-line"><span class="source-line-number">1297</span><span class="source-line-text">              messages: msgs,</span></span>
  <span class="source-line"><span class="source-line-number">1298</span><span class="source-line-text">              parentID: lastUser.id,</span></span>
  <span class="source-line"><span class="source-line-number">1299</span><span class="source-line-text">              sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1300</span><span class="source-line-text">              auto: task.auto,</span></span>
  <span class="source-line"><span class="source-line-number">1301</span><span class="source-line-text">              overflow: task.overflow,</span></span>
  <span class="source-line"><span class="source-line-number">1302</span><span class="source-line-text">            })</span></span>
  <span class="source-line"><span class="source-line-number">1303</span><span class="source-line-text">            if (result === &quot;stop&quot;) break</span></span>
  <span class="source-line"><span class="source-line-number">1304</span><span class="source-line-text">            continue</span></span>
  <span class="source-line"><span class="source-line-number">1305</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1306</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1307</span><span class="source-line-text">          if (</span></span>
  <span class="source-line"><span class="source-line-number">1308</span><span class="source-line-text">            lastFinished &amp;&amp;</span></span>
  <span class="source-line"><span class="source-line-number">1309</span><span class="source-line-text">            lastFinished.summary !== true &amp;&amp;</span></span>
  <span class="source-line"><span class="source-line-number">1310</span><span class="source-line-text">            (yield* compaction.isOverflow({ tokens: lastFinished.tokens, model }))</span></span>
  <span class="source-line"><span class="source-line-number">1311</span><span class="source-line-text">          ) {</span></span>
  <span class="source-line"><span class="source-line-number">1312</span><span class="source-line-text">            yield* compaction.create({ sessionID, agent: lastUser.agent, model: lastUser.model, auto: true })</span></span>
  <span class="source-line"><span class="source-line-number">1313</span><span class="source-line-text">            continue</span></span>
  <span class="source-line"><span class="source-line-number">1314</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1315</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1316</span><span class="source-line-text">          const agent = yield* agents.get(lastUser.agent)</span></span>
  <span class="source-line"><span class="source-line-number">1317</span><span class="source-line-text">          if (!agent) {</span></span>
  <span class="source-line"><span class="source-line-number">1318</span><span class="source-line-text">            const available = (yield* agents.list()).filter((a) =&gt; !a.hidden).map((a) =&gt; a.name)</span></span>
  <span class="source-line"><span class="source-line-number">1319</span><span class="source-line-text">            const hint = available.length ? ` Available agents: ${available.join(&quot;, &quot;)}` : &quot;&quot;</span></span>
  <span class="source-line"><span class="source-line-number">1320</span><span class="source-line-text">            const error = new NamedError.Unknown({ message: `Agent not found: &quot;${lastUser.agent}&quot;.${hint}` })</span></span>
  <span class="source-line"><span class="source-line-number">1321</span><span class="source-line-text">            yield* bus.publish(Session.Event.Error, { sessionID, error: error.toObject() })</span></span>
  <span class="source-line"><span class="source-line-number">1322</span><span class="source-line-text">            throw error</span></span>
  <span class="source-line"><span class="source-line-number">1323</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1324</span><span class="source-line-text">          const maxSteps = agent.steps ?? Infinity</span></span>
  <span class="source-line"><span class="source-line-number">1325</span><span class="source-line-text">          const isLastStep = step &gt;= maxSteps</span></span>
  <span class="source-line"><span class="source-line-number">1326</span><span class="source-line-text">          msgs = yield* SessionReminders.apply({ messages: msgs, agent, session }).pipe(</span></span>
  <span class="source-line"><span class="source-line-number">1327</span><span class="source-line-text">            Effect.provideService(RuntimeFlags.Service, flags),</span></span>
  <span class="source-line"><span class="source-line-number">1328</span><span class="source-line-text">            Effect.provideService(AppFileSystem.Service, fsys),</span></span>
  <span class="source-line"><span class="source-line-number">1329</span><span class="source-line-text">            Effect.provideService(Session.Service, sessions),</span></span>
  <span class="source-line"><span class="source-line-number">1330</span><span class="source-line-text">          )</span></span>
  <span class="source-line"><span class="source-line-number">1331</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1332</span><span class="source-line-text">          const msg: MessageV2.Assistant = {</span></span>
  <span class="source-line"><span class="source-line-number">1333</span><span class="source-line-text">            id: MessageID.ascending(),</span></span>
  <span class="source-line"><span class="source-line-number">1334</span><span class="source-line-text">            parentID: lastUser.id,</span></span>
  <span class="source-line"><span class="source-line-number">1335</span><span class="source-line-text">            role: &quot;assistant&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1336</span><span class="source-line-text">            mode: agent.name,</span></span>
  <span class="source-line"><span class="source-line-number">1337</span><span class="source-line-text">            agent: agent.name,</span></span>
  <span class="source-line"><span class="source-line-number">1338</span><span class="source-line-text">            variant: lastUser.model.variant,</span></span>
  <span class="source-line"><span class="source-line-number">1339</span><span class="source-line-text">            path: { cwd: ctx.directory, root: ctx.worktree },</span></span>
  <span class="source-line"><span class="source-line-number">1340</span><span class="source-line-text">            cost: 0,</span></span>
  <span class="source-line"><span class="source-line-number">1341</span><span class="source-line-text">            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },</span></span>
  <span class="source-line"><span class="source-line-number">1342</span><span class="source-line-text">            modelID: model.id,</span></span>
  <span class="source-line"><span class="source-line-number">1343</span><span class="source-line-text">            providerID: model.providerID,</span></span>
  <span class="source-line"><span class="source-line-number">1344</span><span class="source-line-text">            time: { created: Date.now() },</span></span>
  <span class="source-line"><span class="source-line-number">1345</span><span class="source-line-text">            sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1346</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1347</span><span class="source-line-text">          yield* sessions.updateMessage(msg)</span></span>
  <span class="source-line"><span class="source-line-number">1348</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1349</span><span class="source-line-text">          const finalizeInterruptedAssistant = Effect.gen(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">1350</span><span class="source-line-text">            if (msg.time.completed) return</span></span>
  <span class="source-line"><span class="source-line-number">1351</span><span class="source-line-text">            msg.error ??= MessageV2.fromError(new DOMException(&quot;Aborted&quot;, &quot;AbortError&quot;), {</span></span>
  <span class="source-line"><span class="source-line-number">1352</span><span class="source-line-text">              providerID: msg.providerID,</span></span>
  <span class="source-line"><span class="source-line-number">1353</span><span class="source-line-text">              aborted: true,</span></span>
  <span class="source-line"><span class="source-line-number">1354</span><span class="source-line-text">            })</span></span>
  <span class="source-line"><span class="source-line-number">1355</span><span class="source-line-text">            msg.time.completed = Date.now()</span></span>
  <span class="source-line"><span class="source-line-number">1356</span><span class="source-line-text">            yield* sessions.updateMessage(msg)</span></span>
  <span class="source-line"><span class="source-line-number">1357</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">1358</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1359</span><span class="source-line-text">          const handle = yield* processor</span></span>
  <span class="source-line"><span class="source-line-number">1360</span><span class="source-line-text">            .create({</span></span>
  <span class="source-line"><span class="source-line-number">1361</span><span class="source-line-text">              assistantMessage: msg,</span></span>
  <span class="source-line"><span class="source-line-number">1362</span><span class="source-line-text">              sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1363</span><span class="source-line-text">              model,</span></span>
  <span class="source-line"><span class="source-line-number">1364</span><span class="source-line-text">            })</span></span>
  <span class="source-line"><span class="source-line-number">1365</span><span class="source-line-text">            .pipe(Effect.onInterrupt(() =&gt; finalizeInterruptedAssistant))</span></span>
  <span class="source-line"><span class="source-line-number">1366</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1367</span><span class="source-line-text">          const outcome: &quot;break&quot; | &quot;continue&quot; = yield* Effect.gen(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">1368</span><span class="source-line-text">            const lastUserMsg = msgs.findLast((m) =&gt; m.info.role === &quot;user&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">1369</span><span class="source-line-text">            const bypassAgentCheck = lastUserMsg?.parts.some((p) =&gt; p.type === &quot;agent&quot;) ?? false</span></span>
  <span class="source-line"><span class="source-line-number">1370</span><span class="source-line-text">            const promptOps = yield* ops()</span></span>
  <span class="source-line"><span class="source-line-number">1371</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1372</span><span class="source-line-text">            const tools = yield* SessionTools.resolve({</span></span>
  <span class="source-line"><span class="source-line-number">1373</span><span class="source-line-text">              agent,</span></span>
  <span class="source-line"><span class="source-line-number">1374</span><span class="source-line-text">              session,</span></span>
  <span class="source-line"><span class="source-line-number">1375</span><span class="source-line-text">              model,</span></span>
  <span class="source-line"><span class="source-line-number">1376</span><span class="source-line-text">              processor: handle,</span></span>
  <span class="source-line"><span class="source-line-number">1377</span><span class="source-line-text">              bypassAgentCheck,</span></span>
  <span class="source-line"><span class="source-line-number">1378</span><span class="source-line-text">              messages: msgs,</span></span>
  <span class="source-line"><span class="source-line-number">1379</span><span class="source-line-text">              promptOps,</span></span>
  <span class="source-line"><span class="source-line-number">1380</span><span class="source-line-text">            }).pipe(</span></span>
  <span class="source-line"><span class="source-line-number">1381</span><span class="source-line-text">              Effect.provideService(Plugin.Service, plugin),</span></span>
  <span class="source-line"><span class="source-line-number">1382</span><span class="source-line-text">              Effect.provideService(Permission.Service, permission),</span></span>
  <span class="source-line"><span class="source-line-number">1383</span><span class="source-line-text">              Effect.provideService(ToolRegistry.Service, registry),</span></span>
  <span class="source-line"><span class="source-line-number">1384</span><span class="source-line-text">              Effect.provideService(MCP.Service, mcp),</span></span>
  <span class="source-line"><span class="source-line-number">1385</span><span class="source-line-text">              Effect.provideService(Truncate.Service, truncate),</span></span>
  <span class="source-line"><span class="source-line-number">1386</span><span class="source-line-text">            )</span></span>
  <span class="source-line"><span class="source-line-number">1387</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1388</span><span class="source-line-text">            if (lastUser.format?.type === &quot;json_schema&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">1389</span><span class="source-line-text">              tools[&quot;StructuredOutput&quot;] = createStructuredOutputTool({</span></span>
  <span class="source-line"><span class="source-line-number">1390</span><span class="source-line-text">                schema: lastUser.format.schema,</span></span>
  <span class="source-line"><span class="source-line-number">1391</span><span class="source-line-text">                onSuccess(output) {</span></span>
  <span class="source-line"><span class="source-line-number">1392</span><span class="source-line-text">                  structured = output</span></span>
  <span class="source-line"><span class="source-line-number">1393</span><span class="source-line-text">                },</span></span>
  <span class="source-line"><span class="source-line-number">1394</span><span class="source-line-text">              })</span></span>
  <span class="source-line"><span class="source-line-number">1395</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">1396</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1397</span><span class="source-line-text">            if (step === 1)</span></span>
  <span class="source-line"><span class="source-line-number">1398</span><span class="source-line-text">              yield* summary.summarize({ sessionID, messageID: lastUser.id }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
  <span class="source-line"><span class="source-line-number">1399</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1400</span><span class="source-line-text">            if (step &gt; 1 &amp;&amp; lastFinished) {</span></span>
  <span class="source-line"><span class="source-line-number">1401</span><span class="source-line-text">              for (const m of msgs) {</span></span>
  <span class="source-line"><span class="source-line-number">1402</span><span class="source-line-text">                if (m.info.role !== &quot;user&quot; || m.info.id &lt;= lastFinished.id) continue</span></span>
  <span class="source-line"><span class="source-line-number">1403</span><span class="source-line-text">                for (const p of m.parts) {</span></span>
  <span class="source-line"><span class="source-line-number">1404</span><span class="source-line-text">                  if (p.type !== &quot;text&quot; || p.ignored || p.synthetic) continue</span></span>
  <span class="source-line"><span class="source-line-number">1405</span><span class="source-line-text">                  if (!p.text.trim()) continue</span></span>
  <span class="source-line"><span class="source-line-number">1406</span><span class="source-line-text">                  p.text = [</span></span>
  <span class="source-line"><span class="source-line-number">1407</span><span class="source-line-text">                    &quot;&lt;system-reminder&gt;&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1408</span><span class="source-line-text">                    &quot;The user sent the following message:&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1409</span><span class="source-line-text">                    p.text,</span></span>
  <span class="source-line"><span class="source-line-number">1410</span><span class="source-line-text">                    &quot;&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1411</span><span class="source-line-text">                    &quot;Please address this message and continue with your tasks.&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1412</span><span class="source-line-text">                    &quot;&lt;/system-reminder&gt;&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1413</span><span class="source-line-text">                  ].join(&quot;\n&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">1414</span><span class="source-line-text">                }</span></span>
  <span class="source-line"><span class="source-line-number">1415</span><span class="source-line-text">              }</span></span>
  <span class="source-line"><span class="source-line-number">1416</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">1417</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1418</span><span class="source-line-text">            yield* plugin.trigger(&quot;experimental.chat.messages.transform&quot;, {}, { messages: msgs })</span></span>
  <span class="source-line"><span class="source-line-number">1419</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1420</span><span class="source-line-text">            const [skills, env, instructions, modelMsgs] = yield* Effect.all([</span></span>
  <span class="source-line"><span class="source-line-number">1421</span><span class="source-line-text">              sys.skills(agent),</span></span>
  <span class="source-line"><span class="source-line-number">1422</span><span class="source-line-text">              sys.environment(model),</span></span>
  <span class="source-line"><span class="source-line-number">1423</span><span class="source-line-text">              instruction.system().pipe(Effect.orDie),</span></span>
  <span class="source-line"><span class="source-line-number">1424</span><span class="source-line-text">              MessageV2.toModelMessagesEffect(msgs, model),</span></span>
  <span class="source-line"><span class="source-line-number">1425</span><span class="source-line-text">            ])</span></span>
  <span class="source-line"><span class="source-line-number">1426</span><span class="source-line-text">            const system = [...env, ...instructions, ...(skills ? [skills] : [])]</span></span>
  <span class="source-line"><span class="source-line-number">1427</span><span class="source-line-text">            const format = lastUser.format ?? { type: &quot;text&quot; as const }</span></span>
  <span class="source-line"><span class="source-line-number">1428</span><span class="source-line-text">            if (format.type === &quot;json_schema&quot;) system.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)</span></span>
  <span class="source-line"><span class="source-line-number">1429</span><span class="source-line-text">            const result = yield* handle.process({</span></span>
  <span class="source-line"><span class="source-line-number">1430</span><span class="source-line-text">              user: lastUser,</span></span>
  <span class="source-line"><span class="source-line-number">1431</span><span class="source-line-text">              agent,</span></span>
  <span class="source-line"><span class="source-line-number">1432</span><span class="source-line-text">              permission: session.permission,</span></span>
  <span class="source-line"><span class="source-line-number">1433</span><span class="source-line-text">              sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1434</span><span class="source-line-text">              parentSessionID: session.parentID,</span></span>
  <span class="source-line"><span class="source-line-number">1435</span><span class="source-line-text">              system,</span></span>
  <span class="source-line"><span class="source-line-number">1436</span><span class="source-line-text">              messages: [...modelMsgs, ...(isLastStep ? [{ role: &quot;assistant&quot; as const, content: MAX_STEPS }] : [])],</span></span>
  <span class="source-line"><span class="source-line-number">1437</span><span class="source-line-text">              tools,</span></span>
  <span class="source-line"><span class="source-line-number">1438</span><span class="source-line-text">              model,</span></span>
  <span class="source-line"><span class="source-line-number">1439</span><span class="source-line-text">              toolChoice: format.type === &quot;json_schema&quot; ? &quot;required&quot; : undefined,</span></span>
  <span class="source-line"><span class="source-line-number">1440</span><span class="source-line-text">            })</span></span>
  <span class="source-line"><span class="source-line-number">1441</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1442</span><span class="source-line-text">            if (structured !== undefined) {</span></span>
  <span class="source-line"><span class="source-line-number">1443</span><span class="source-line-text">              handle.message.structured = structured</span></span>
  <span class="source-line"><span class="source-line-number">1444</span><span class="source-line-text">              handle.message.finish = handle.message.finish ?? &quot;stop&quot;</span></span>
  <span class="source-line"><span class="source-line-number">1445</span><span class="source-line-text">              yield* sessions.updateMessage(handle.message)</span></span>
  <span class="source-line"><span class="source-line-number">1446</span><span class="source-line-text">              return &quot;break&quot; as const</span></span>
  <span class="source-line"><span class="source-line-number">1447</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">1448</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1449</span><span class="source-line-text">            const finished = handle.message.finish &amp;&amp; ![&quot;tool-calls&quot;, &quot;unknown&quot;].includes(handle.message.finish)</span></span>
  <span class="source-line"><span class="source-line-number">1450</span><span class="source-line-text">            if (finished &amp;&amp; !handle.message.error) {</span></span>
  <span class="source-line"><span class="source-line-number">1451</span><span class="source-line-text">              if (format.type === &quot;json_schema&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">1452</span><span class="source-line-text">                handle.message.error = new MessageV2.StructuredOutputError({</span></span>
  <span class="source-line"><span class="source-line-number">1453</span><span class="source-line-text">                  message: &quot;Model did not produce structured output&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1454</span><span class="source-line-text">                  retries: 0,</span></span>
  <span class="source-line"><span class="source-line-number">1455</span><span class="source-line-text">                }).toObject()</span></span>
  <span class="source-line"><span class="source-line-number">1456</span><span class="source-line-text">                yield* sessions.updateMessage(handle.message)</span></span>
  <span class="source-line"><span class="source-line-number">1457</span><span class="source-line-text">                return &quot;break&quot; as const</span></span>
  <span class="source-line"><span class="source-line-number">1458</span><span class="source-line-text">              }</span></span>
  <span class="source-line"><span class="source-line-number">1459</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">1460</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1461</span><span class="source-line-text">            if (result === &quot;stop&quot;) return &quot;break&quot; as const</span></span>
  <span class="source-line"><span class="source-line-number">1462</span><span class="source-line-text">            if (result === &quot;compact&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">1463</span><span class="source-line-text">              yield* compaction.create({</span></span>
  <span class="source-line"><span class="source-line-number">1464</span><span class="source-line-text">                sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1465</span><span class="source-line-text">                agent: lastUser.agent,</span></span>
  <span class="source-line"><span class="source-line-number">1466</span><span class="source-line-text">                model: lastUser.model,</span></span>
  <span class="source-line"><span class="source-line-number">1467</span><span class="source-line-text">                auto: true,</span></span>
  <span class="source-line"><span class="source-line-number">1468</span><span class="source-line-text">                overflow: !handle.message.finish,</span></span>
  <span class="source-line"><span class="source-line-number">1469</span><span class="source-line-text">              })</span></span>
  <span class="source-line"><span class="source-line-number">1470</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">1471</span><span class="source-line-text">            return &quot;continue&quot; as const</span></span>
  <span class="source-line"><span class="source-line-number">1472</span><span class="source-line-text">          }).pipe(</span></span>
  <span class="source-line"><span class="source-line-number">1473</span><span class="source-line-text">            Effect.ensuring(instruction.clear(handle.message.id)),</span></span>
  <span class="source-line"><span class="source-line-number">1474</span><span class="source-line-text">            Effect.onInterrupt(() =&gt; finalizeInterruptedAssistant),</span></span>
  <span class="source-line"><span class="source-line-number">1475</span><span class="source-line-text">          )</span></span>
  <span class="source-line"><span class="source-line-number">1476</span><span class="source-line-text">          if (outcome === &quot;break&quot;) break</span></span>
  <span class="source-line"><span class="source-line-number">1477</span><span class="source-line-text">          continue</span></span>
  <span class="source-line"><span class="source-line-number">1478</span><span class="source-line-text">        }</span></span>
  <span class="source-line"><span class="source-line-number">1479</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1480</span><span class="source-line-text">        yield* compaction.prune({ sessionID }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
  <span class="source-line"><span class="source-line-number">1481</span><span class="source-line-text">        return yield* lastAssistant(sessionID)</span></span>
  <span class="source-line"><span class="source-line-number">1482</span><span class="source-line-text">      },</span></span>
  <span class="source-line"><span class="source-line-number">1483</span><span class="source-line-text">    )</span></span>
  <span class="source-line"><span class="source-line-number">1484</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1485</span><span class="source-line-text">    const loop: (input: LoopInput) =&gt; Effect.Effect&lt;MessageV2.WithParts&gt; = Effect.fn(&quot;SessionPrompt.loop&quot;)(function* (</span></span>
  <span class="source-line"><span class="source-line-number">1486</span><span class="source-line-text">      input: LoopInput,</span></span>
  <span class="source-line"><span class="source-line-number">1487</span><span class="source-line-text">    ) {</span></span>
  <span class="source-line"><span class="source-line-number">1488</span><span class="source-line-text">      return yield* state.ensureRunning(input.sessionID, lastAssistant(input.sessionID), runLoop(input.sessionID))</span></span>
  <span class="source-line"><span class="source-line-number">1489</span><span class="source-line-text">    })</span></span></code></pre>
  </details>

- LLM 输入类型：`packages/opencode/src/session/llm.ts:39-60`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/llm.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/llm.ts:39-60</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">export type StreamInput = {</span></span>
  <span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  user: MessageV2.User</span></span>
  <span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">  sessionID: string</span></span>
  <span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  parentSessionID?: string</span></span>
  <span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  model: Provider.Model</span></span>
  <span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  agent: Agent.Info</span></span>
  <span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">  permission?: Permission.Ruleset</span></span>
  <span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">  system: string[]</span></span>
  <span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">  messages: ModelMessage[]</span></span>
  <span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">  small?: boolean</span></span>
  <span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">  tools: Record&lt;string, Tool&gt;</span></span>
  <span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">  retries?: number</span></span>
  <span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">  toolChoice?: &quot;auto&quot; | &quot;required&quot; | &quot;none&quot;</span></span>
  <span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">}</span></span>
  <span class="source-line"><span class="source-line-number">53</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">export type StreamRequest = StreamInput &amp; {</span></span>
  <span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">  abort: AbortSignal</span></span>
  <span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">}</span></span>
  <span class="source-line"><span class="source-line-number">57</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">export interface Interface {</span></span>
  <span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">  readonly stream: (input: StreamInput) =&gt; Stream.Stream&lt;LLMEvent, unknown&gt;</span></span>
  <span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">}</span></span></code></pre>
  </details>

- tool 统一接口：`packages/opencode/src/tool/tool.ts:16-45`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/tool/tool.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/tool/tool.ts:16-45</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">export type Context&lt;M extends Metadata = Metadata&gt; = {</span></span>
  <span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  sessionID: SessionID</span></span>
  <span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">  messageID: MessageID</span></span>
  <span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">  agent: string</span></span>
  <span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">  abort: AbortSignal</span></span>
  <span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">  callID?: string</span></span>
  <span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">  extra?: { [key: string]: unknown }</span></span>
  <span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  messages: MessageV2.WithParts[]</span></span>
  <span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">  metadata(input: { title?: string; metadata?: M }): Effect.Effect&lt;void&gt;</span></span>
  <span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">  ask(input: Omit&lt;Permission.Request, &quot;id&quot; | &quot;sessionID&quot; | &quot;tool&quot;&gt;): Effect.Effect&lt;void&gt;</span></span>
  <span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">}</span></span>
  <span class="source-line"><span class="source-line-number">27</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">export interface ExecuteResult&lt;M extends Metadata = Metadata&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">  title: string</span></span>
  <span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">  metadata: M</span></span>
  <span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">  output: string</span></span>
  <span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">  attachments?: Omit&lt;MessageV2.FilePart, &quot;id&quot; | &quot;sessionID&quot; | &quot;messageID&quot;&gt;[]</span></span>
  <span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">}</span></span>
  <span class="source-line"><span class="source-line-number">34</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">export interface Def&lt;</span></span>
  <span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  Parameters extends Schema.Decoder&lt;unknown&gt; = Schema.Decoder&lt;unknown&gt;,</span></span>
  <span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">  M extends Metadata = Metadata,</span></span>
  <span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  id: string</span></span>
  <span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  description: string</span></span>
  <span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">  parameters: Parameters</span></span>
  <span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  jsonSchema?: JSONSchema7</span></span>
  <span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  execute(args: Schema.Schema.Type&lt;Parameters&gt;, ctx: Context): Effect.Effect&lt;ExecuteResult&lt;M&gt;&gt;</span></span>
  <span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  formatValidationError?(error: unknown): string</span></span>
  <span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">}</span></span></code></pre>
  </details>

- tool 包装和执行：`packages/opencode/src/session/tools.ts:42-115`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:42-115</code></span>
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
  <span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">  })</span></span>
  <span class="source-line"><span class="source-line-number">74</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  for (const item of yield* registry.tools({</span></span>
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
  <span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">    })</span></span></code></pre>
  </details>

- tool result 写回：`packages/opencode/src/session/processor.ts:451-500`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:451-500</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">          case &quot;tool-result&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">            const toolCall = yield* readToolCall(value.id)</span></span>
  <span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">            const rawOutput = toolResultOutput(value)</span></span>
  <span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">            const normalized = yield* Effect.forEach(rawOutput.attachments ?? [], (attachment) =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">              attachment.mime.startsWith(&quot;image/&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">                ? image.normalize(attachment).pipe(</span></span>
  <span class="source-line"><span class="source-line-number">457</span><span class="source-line-text">                    Effect.catchIf(</span></span>
  <span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">                      (error) =&gt; error instanceof Image.ResizerUnavailableError,</span></span>
  <span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">                      () =&gt; Effect.succeed(attachment),</span></span>
  <span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">                    ),</span></span>
  <span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">                    Effect.exit,</span></span>
  <span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">                  )</span></span>
  <span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">                : Effect.succeed(Exit.succeed&lt;MessageV2.FilePart&gt;(attachment)),</span></span>
  <span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">            )</span></span>
  <span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">            const omitted = normalized.filter(Exit.isFailure).length</span></span>
  <span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">            const attachments = normalized.filter(Exit.isSuccess).map((item) =&gt; item.value)</span></span>
  <span class="source-line"><span class="source-line-number">467</span><span class="source-line-text">            const output = {</span></span>
  <span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">              ...rawOutput,</span></span>
  <span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">              output:</span></span>
  <span class="source-line"><span class="source-line-number">470</span><span class="source-line-text">                omitted === 0</span></span>
  <span class="source-line"><span class="source-line-number">471</span><span class="source-line-text">                  ? rawOutput.output</span></span>
  <span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">                  : `${rawOutput.output}\n\n[${omitted} image${omitted === 1 ? &quot;&quot; : &quot;s&quot;} omitted: could not be resized below the image size limit.]`,</span></span>
  <span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">              attachments: attachments.length ? attachments : undefined,</span></span>
  <span class="source-line"><span class="source-line-number">474</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">            // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
  <span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">            if (flags.experimentalEventSystem) {</span></span>
  <span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">              yield* events.publish(SessionEvent.Tool.Success, {</span></span>
  <span class="source-line"><span class="source-line-number">478</span><span class="source-line-text">                sessionID: ctx.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">479</span><span class="source-line-text">                callID: value.id,</span></span>
  <span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">                structured: output.metadata,</span></span>
  <span class="source-line"><span class="source-line-number">481</span><span class="source-line-text">                content: [</span></span>
  <span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">                  {</span></span>
  <span class="source-line"><span class="source-line-number">483</span><span class="source-line-text">                    type: &quot;text&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">                    text: output.output,</span></span>
  <span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">                  },</span></span>
  <span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">                  ...(output.attachments?.map((item: MessageV2.FilePart) =&gt; ({</span></span>
  <span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">                    type: &quot;file&quot; as const,</span></span>
  <span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">                    uri: item.url,</span></span>
  <span class="source-line"><span class="source-line-number">489</span><span class="source-line-text">                    mime: item.mime,</span></span>
  <span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">                    name: item.filename,</span></span>
  <span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">                  })) ?? []),</span></span>
  <span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">                ],</span></span>
  <span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">                provider: {</span></span>
  <span class="source-line"><span class="source-line-number">494</span><span class="source-line-text">                  executed: value.providerExecuted === true || toolCall?.part.metadata?.providerExecuted === true,</span></span>
  <span class="source-line"><span class="source-line-number">495</span><span class="source-line-text">                },</span></span>
  <span class="source-line"><span class="source-line-number">496</span><span class="source-line-text">                timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
  <span class="source-line"><span class="source-line-number">497</span><span class="source-line-text">              })</span></span>
  <span class="source-line"><span class="source-line-number">498</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">499</span><span class="source-line-text">            yield* completeToolCall(value.id, output)</span></span>
  <span class="source-line"><span class="source-line-number">500</span><span class="source-line-text">            return</span></span></code></pre>
  </details>

- 权限审批：`packages/opencode/src/permission/index.ts:161-195`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:161-195</code></span>
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
  <span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      )</span></span></code></pre>
  </details>


## 2. 它在 OpenCode agent 中的位置

这章是前面所有章节的“缩小版总装图”。

OpenCode 是成熟实现，包含：

- 多入口：CLI、TUI、Desktop、VS Code、SDK/API。
- 多模型 provider。
- 内置工具、MCP 工具、插件工具。
- session 存储、事件流、权限审批、LSP、文件系统、shell。
- 构建、测试、SDK 生成、跨平台打包。

mini agent 不需要一次实现这些全部能力。第一版只要保留闭环：

```text
CLI -> Session -> LLM -> Tool Registry -> Tool Execution -> Tool Result -> LLM -> Final Answer
```

## 3. 生活类比

OpenCode 像一间成熟的软件工作室：

- 用户是产品经理，提出需求。
- Session 是项目记录本，记录每轮对话和每次工具结果。
- LLM 是主程，决定下一步要读文件、改代码还是执行命令。
- Tool 是具体工种，比如读文件、改文件、跑命令。
- Permission 是安全负责人，危险操作先审批。
- Processor 是会议纪要员，把主程说的话、调用的工具、工具结果写回记录本。

mini agent 第一版只需要一个小团队：产品经理、主程、两个工种、一个审批开关、一本记录本。

## 4. Java 开发者类比

| Mini agent 概念 | Java 后端类比 | OpenCode 源码依据 |
|---|---|---|
| CLI 输入 | `main(String[] args)` / Picocli command | `run.ts:768-803` |
| SessionPrompt | Application Service | `prompt.ts:1211-1230` |
| Message/Part | Aggregate + child entity | `message-v2.ts`，前面章节已读 |
| Agent loop | State machine / workflow engine | `prompt.ts:1248-1489` |
| LLM service | Gateway / Client adapter | `llm.ts:39-60` |
| Tool registry | Strategy registry / plugin registry | `session/tools.ts:75-115` |
| Permission | Spring Security interceptor + async approval | `permission/index.ts:161-195` |
| Event stream | ApplicationEventPublisher + SSE | `handlers/event.ts:21-53` |

## 5. 最小源码路径

如果你只想反推 mini agent，按这个顺序读：

1. `packages/opencode/src/cli/cmd/run.ts:768-803`：非交互 CLI 如何把输入送进 `client.session.prompt`。

  <details class="source-ref source-ref--inline">
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

2. `packages/opencode/src/session/prompt.ts:1211-1230`：prompt 如何创建 user message 并进入 loop。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1211-1230</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1211</span><span class="source-line-text">    const prompt: (input: PromptInput) =&gt; Effect.Effect&lt;MessageV2.WithParts, Image.Error&gt; = Effect.fn(</span></span>
  <span class="source-line"><span class="source-line-number">1212</span><span class="source-line-text">      &quot;SessionPrompt.prompt&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1213</span><span class="source-line-text">    )(function* (input: PromptInput) {</span></span>
  <span class="source-line"><span class="source-line-number">1214</span><span class="source-line-text">      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)</span></span>
  <span class="source-line"><span class="source-line-number">1215</span><span class="source-line-text">      yield* revert.cleanup(session)</span></span>
  <span class="source-line"><span class="source-line-number">1216</span><span class="source-line-text">      const message = yield* createUserMessage(input)</span></span>
  <span class="source-line"><span class="source-line-number">1217</span><span class="source-line-text">      yield* sessions.touch(input.sessionID)</span></span>
  <span class="source-line"><span class="source-line-number">1218</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1219</span><span class="source-line-text">      const permissions: Permission.Ruleset = []</span></span>
  <span class="source-line"><span class="source-line-number">1220</span><span class="source-line-text">      for (const [t, enabled] of Object.entries(input.tools ?? {})) {</span></span>
  <span class="source-line"><span class="source-line-number">1221</span><span class="source-line-text">        permissions.push({ permission: t, action: enabled ? &quot;allow&quot; : &quot;deny&quot;, pattern: &quot;*&quot; })</span></span>
  <span class="source-line"><span class="source-line-number">1222</span><span class="source-line-text">      }</span></span>
  <span class="source-line"><span class="source-line-number">1223</span><span class="source-line-text">      if (permissions.length &gt; 0) {</span></span>
  <span class="source-line"><span class="source-line-number">1224</span><span class="source-line-text">        session.permission = permissions</span></span>
  <span class="source-line"><span class="source-line-number">1225</span><span class="source-line-text">        yield* sessions.setPermission({ sessionID: session.id, permission: permissions })</span></span>
  <span class="source-line"><span class="source-line-number">1226</span><span class="source-line-text">      }</span></span>
  <span class="source-line"><span class="source-line-number">1227</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1228</span><span class="source-line-text">      if (input.noReply === true) return message</span></span>
  <span class="source-line"><span class="source-line-number">1229</span><span class="source-line-text">      return yield* loop({ sessionID: input.sessionID })</span></span>
  <span class="source-line"><span class="source-line-number">1230</span><span class="source-line-text">    })</span></span></code></pre>
  </details>

3. `packages/opencode/src/session/prompt.ts:1248-1276`：loop 如何判断继续还是退出。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1248-1276</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1248</span><span class="source-line-text">        while (true) {</span></span>
  <span class="source-line"><span class="source-line-number">1249</span><span class="source-line-text">          yield* status.set(sessionID, { type: &quot;busy&quot; })</span></span>
  <span class="source-line"><span class="source-line-number">1250</span><span class="source-line-text">          yield* slog.info(&quot;loop&quot;, { step })</span></span>
  <span class="source-line"><span class="source-line-number">1251</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1252</span><span class="source-line-text">          let msgs = yield* MessageV2.filterCompactedEffect(sessionID)</span></span>
  <span class="source-line"><span class="source-line-number">1253</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1254</span><span class="source-line-text">          const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)</span></span>
  <span class="source-line"><span class="source-line-number">1255</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1256</span><span class="source-line-text">          if (!lastUser) throw new Error(&quot;No user message found in stream. This should never happen.&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">1257</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1258</span><span class="source-line-text">          const lastAssistantMsg = msgs.findLast(</span></span>
  <span class="source-line"><span class="source-line-number">1259</span><span class="source-line-text">            (msg) =&gt; msg.info.role === &quot;assistant&quot; &amp;&amp; msg.info.id === lastAssistant?.id,</span></span>
  <span class="source-line"><span class="source-line-number">1260</span><span class="source-line-text">          )</span></span>
  <span class="source-line"><span class="source-line-number">1261</span><span class="source-line-text">          // Some providers return &quot;stop&quot; even when the assistant message contains tool calls.</span></span>
  <span class="source-line"><span class="source-line-number">1262</span><span class="source-line-text">          // Keep the loop running so tool results can be sent back to the model.</span></span>
  <span class="source-line"><span class="source-line-number">1263</span><span class="source-line-text">          // Skip provider-executed tool parts — those were fully handled within the</span></span>
  <span class="source-line"><span class="source-line-number">1264</span><span class="source-line-text">          // provider's stream (e.g. DWS Agent Platform) and don't need a re-loop.</span></span>
  <span class="source-line"><span class="source-line-number">1265</span><span class="source-line-text">          const hasToolCalls =</span></span>
  <span class="source-line"><span class="source-line-number">1266</span><span class="source-line-text">            lastAssistantMsg?.parts.some((part) =&gt; part.type === &quot;tool&quot; &amp;&amp; !part.metadata?.providerExecuted) ?? false</span></span>
  <span class="source-line"><span class="source-line-number">1267</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1268</span><span class="source-line-text">          if (</span></span>
  <span class="source-line"><span class="source-line-number">1269</span><span class="source-line-text">            lastAssistant?.finish &amp;&amp;</span></span>
  <span class="source-line"><span class="source-line-number">1270</span><span class="source-line-text">            ![&quot;tool-calls&quot;].includes(lastAssistant.finish) &amp;&amp;</span></span>
  <span class="source-line"><span class="source-line-number">1271</span><span class="source-line-text">            !hasToolCalls &amp;&amp;</span></span>
  <span class="source-line"><span class="source-line-number">1272</span><span class="source-line-text">            lastUser.id &lt; lastAssistant.id</span></span>
  <span class="source-line"><span class="source-line-number">1273</span><span class="source-line-text">          ) {</span></span>
  <span class="source-line"><span class="source-line-number">1274</span><span class="source-line-text">            yield* slog.info(&quot;exiting loop&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">1275</span><span class="source-line-text">            break</span></span>
  <span class="source-line"><span class="source-line-number">1276</span><span class="source-line-text">          }</span></span></code></pre>
  </details>

4. `packages/opencode/src/session/prompt.ts:1325-1440`：loop 如何创建 assistant message、resolve tools、调用 processor。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1325-1440</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1325</span><span class="source-line-text">          const isLastStep = step &gt;= maxSteps</span></span>
  <span class="source-line"><span class="source-line-number">1326</span><span class="source-line-text">          msgs = yield* SessionReminders.apply({ messages: msgs, agent, session }).pipe(</span></span>
  <span class="source-line"><span class="source-line-number">1327</span><span class="source-line-text">            Effect.provideService(RuntimeFlags.Service, flags),</span></span>
  <span class="source-line"><span class="source-line-number">1328</span><span class="source-line-text">            Effect.provideService(AppFileSystem.Service, fsys),</span></span>
  <span class="source-line"><span class="source-line-number">1329</span><span class="source-line-text">            Effect.provideService(Session.Service, sessions),</span></span>
  <span class="source-line"><span class="source-line-number">1330</span><span class="source-line-text">          )</span></span>
  <span class="source-line"><span class="source-line-number">1331</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1332</span><span class="source-line-text">          const msg: MessageV2.Assistant = {</span></span>
  <span class="source-line"><span class="source-line-number">1333</span><span class="source-line-text">            id: MessageID.ascending(),</span></span>
  <span class="source-line"><span class="source-line-number">1334</span><span class="source-line-text">            parentID: lastUser.id,</span></span>
  <span class="source-line"><span class="source-line-number">1335</span><span class="source-line-text">            role: &quot;assistant&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1336</span><span class="source-line-text">            mode: agent.name,</span></span>
  <span class="source-line"><span class="source-line-number">1337</span><span class="source-line-text">            agent: agent.name,</span></span>
  <span class="source-line"><span class="source-line-number">1338</span><span class="source-line-text">            variant: lastUser.model.variant,</span></span>
  <span class="source-line"><span class="source-line-number">1339</span><span class="source-line-text">            path: { cwd: ctx.directory, root: ctx.worktree },</span></span>
  <span class="source-line"><span class="source-line-number">1340</span><span class="source-line-text">            cost: 0,</span></span>
  <span class="source-line"><span class="source-line-number">1341</span><span class="source-line-text">            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },</span></span>
  <span class="source-line"><span class="source-line-number">1342</span><span class="source-line-text">            modelID: model.id,</span></span>
  <span class="source-line"><span class="source-line-number">1343</span><span class="source-line-text">            providerID: model.providerID,</span></span>
  <span class="source-line"><span class="source-line-number">1344</span><span class="source-line-text">            time: { created: Date.now() },</span></span>
  <span class="source-line"><span class="source-line-number">1345</span><span class="source-line-text">            sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1346</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1347</span><span class="source-line-text">          yield* sessions.updateMessage(msg)</span></span>
  <span class="source-line"><span class="source-line-number">1348</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1349</span><span class="source-line-text">          const finalizeInterruptedAssistant = Effect.gen(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">1350</span><span class="source-line-text">            if (msg.time.completed) return</span></span>
  <span class="source-line"><span class="source-line-number">1351</span><span class="source-line-text">            msg.error ??= MessageV2.fromError(new DOMException(&quot;Aborted&quot;, &quot;AbortError&quot;), {</span></span>
  <span class="source-line"><span class="source-line-number">1352</span><span class="source-line-text">              providerID: msg.providerID,</span></span>
  <span class="source-line"><span class="source-line-number">1353</span><span class="source-line-text">              aborted: true,</span></span>
  <span class="source-line"><span class="source-line-number">1354</span><span class="source-line-text">            })</span></span>
  <span class="source-line"><span class="source-line-number">1355</span><span class="source-line-text">            msg.time.completed = Date.now()</span></span>
  <span class="source-line"><span class="source-line-number">1356</span><span class="source-line-text">            yield* sessions.updateMessage(msg)</span></span>
  <span class="source-line"><span class="source-line-number">1357</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">1358</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1359</span><span class="source-line-text">          const handle = yield* processor</span></span>
  <span class="source-line"><span class="source-line-number">1360</span><span class="source-line-text">            .create({</span></span>
  <span class="source-line"><span class="source-line-number">1361</span><span class="source-line-text">              assistantMessage: msg,</span></span>
  <span class="source-line"><span class="source-line-number">1362</span><span class="source-line-text">              sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1363</span><span class="source-line-text">              model,</span></span>
  <span class="source-line"><span class="source-line-number">1364</span><span class="source-line-text">            })</span></span>
  <span class="source-line"><span class="source-line-number">1365</span><span class="source-line-text">            .pipe(Effect.onInterrupt(() =&gt; finalizeInterruptedAssistant))</span></span>
  <span class="source-line"><span class="source-line-number">1366</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1367</span><span class="source-line-text">          const outcome: &quot;break&quot; | &quot;continue&quot; = yield* Effect.gen(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">1368</span><span class="source-line-text">            const lastUserMsg = msgs.findLast((m) =&gt; m.info.role === &quot;user&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">1369</span><span class="source-line-text">            const bypassAgentCheck = lastUserMsg?.parts.some((p) =&gt; p.type === &quot;agent&quot;) ?? false</span></span>
  <span class="source-line"><span class="source-line-number">1370</span><span class="source-line-text">            const promptOps = yield* ops()</span></span>
  <span class="source-line"><span class="source-line-number">1371</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1372</span><span class="source-line-text">            const tools = yield* SessionTools.resolve({</span></span>
  <span class="source-line"><span class="source-line-number">1373</span><span class="source-line-text">              agent,</span></span>
  <span class="source-line"><span class="source-line-number">1374</span><span class="source-line-text">              session,</span></span>
  <span class="source-line"><span class="source-line-number">1375</span><span class="source-line-text">              model,</span></span>
  <span class="source-line"><span class="source-line-number">1376</span><span class="source-line-text">              processor: handle,</span></span>
  <span class="source-line"><span class="source-line-number">1377</span><span class="source-line-text">              bypassAgentCheck,</span></span>
  <span class="source-line"><span class="source-line-number">1378</span><span class="source-line-text">              messages: msgs,</span></span>
  <span class="source-line"><span class="source-line-number">1379</span><span class="source-line-text">              promptOps,</span></span>
  <span class="source-line"><span class="source-line-number">1380</span><span class="source-line-text">            }).pipe(</span></span>
  <span class="source-line"><span class="source-line-number">1381</span><span class="source-line-text">              Effect.provideService(Plugin.Service, plugin),</span></span>
  <span class="source-line"><span class="source-line-number">1382</span><span class="source-line-text">              Effect.provideService(Permission.Service, permission),</span></span>
  <span class="source-line"><span class="source-line-number">1383</span><span class="source-line-text">              Effect.provideService(ToolRegistry.Service, registry),</span></span>
  <span class="source-line"><span class="source-line-number">1384</span><span class="source-line-text">              Effect.provideService(MCP.Service, mcp),</span></span>
  <span class="source-line"><span class="source-line-number">1385</span><span class="source-line-text">              Effect.provideService(Truncate.Service, truncate),</span></span>
  <span class="source-line"><span class="source-line-number">1386</span><span class="source-line-text">            )</span></span>
  <span class="source-line"><span class="source-line-number">1387</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1388</span><span class="source-line-text">            if (lastUser.format?.type === &quot;json_schema&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">1389</span><span class="source-line-text">              tools[&quot;StructuredOutput&quot;] = createStructuredOutputTool({</span></span>
  <span class="source-line"><span class="source-line-number">1390</span><span class="source-line-text">                schema: lastUser.format.schema,</span></span>
  <span class="source-line"><span class="source-line-number">1391</span><span class="source-line-text">                onSuccess(output) {</span></span>
  <span class="source-line"><span class="source-line-number">1392</span><span class="source-line-text">                  structured = output</span></span>
  <span class="source-line"><span class="source-line-number">1393</span><span class="source-line-text">                },</span></span>
  <span class="source-line"><span class="source-line-number">1394</span><span class="source-line-text">              })</span></span>
  <span class="source-line"><span class="source-line-number">1395</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">1396</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1397</span><span class="source-line-text">            if (step === 1)</span></span>
  <span class="source-line"><span class="source-line-number">1398</span><span class="source-line-text">              yield* summary.summarize({ sessionID, messageID: lastUser.id }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
  <span class="source-line"><span class="source-line-number">1399</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1400</span><span class="source-line-text">            if (step &gt; 1 &amp;&amp; lastFinished) {</span></span>
  <span class="source-line"><span class="source-line-number">1401</span><span class="source-line-text">              for (const m of msgs) {</span></span>
  <span class="source-line"><span class="source-line-number">1402</span><span class="source-line-text">                if (m.info.role !== &quot;user&quot; || m.info.id &lt;= lastFinished.id) continue</span></span>
  <span class="source-line"><span class="source-line-number">1403</span><span class="source-line-text">                for (const p of m.parts) {</span></span>
  <span class="source-line"><span class="source-line-number">1404</span><span class="source-line-text">                  if (p.type !== &quot;text&quot; || p.ignored || p.synthetic) continue</span></span>
  <span class="source-line"><span class="source-line-number">1405</span><span class="source-line-text">                  if (!p.text.trim()) continue</span></span>
  <span class="source-line"><span class="source-line-number">1406</span><span class="source-line-text">                  p.text = [</span></span>
  <span class="source-line"><span class="source-line-number">1407</span><span class="source-line-text">                    &quot;&lt;system-reminder&gt;&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1408</span><span class="source-line-text">                    &quot;The user sent the following message:&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1409</span><span class="source-line-text">                    p.text,</span></span>
  <span class="source-line"><span class="source-line-number">1410</span><span class="source-line-text">                    &quot;&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1411</span><span class="source-line-text">                    &quot;Please address this message and continue with your tasks.&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1412</span><span class="source-line-text">                    &quot;&lt;/system-reminder&gt;&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1413</span><span class="source-line-text">                  ].join(&quot;\n&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">1414</span><span class="source-line-text">                }</span></span>
  <span class="source-line"><span class="source-line-number">1415</span><span class="source-line-text">              }</span></span>
  <span class="source-line"><span class="source-line-number">1416</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">1417</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1418</span><span class="source-line-text">            yield* plugin.trigger(&quot;experimental.chat.messages.transform&quot;, {}, { messages: msgs })</span></span>
  <span class="source-line"><span class="source-line-number">1419</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1420</span><span class="source-line-text">            const [skills, env, instructions, modelMsgs] = yield* Effect.all([</span></span>
  <span class="source-line"><span class="source-line-number">1421</span><span class="source-line-text">              sys.skills(agent),</span></span>
  <span class="source-line"><span class="source-line-number">1422</span><span class="source-line-text">              sys.environment(model),</span></span>
  <span class="source-line"><span class="source-line-number">1423</span><span class="source-line-text">              instruction.system().pipe(Effect.orDie),</span></span>
  <span class="source-line"><span class="source-line-number">1424</span><span class="source-line-text">              MessageV2.toModelMessagesEffect(msgs, model),</span></span>
  <span class="source-line"><span class="source-line-number">1425</span><span class="source-line-text">            ])</span></span>
  <span class="source-line"><span class="source-line-number">1426</span><span class="source-line-text">            const system = [...env, ...instructions, ...(skills ? [skills] : [])]</span></span>
  <span class="source-line"><span class="source-line-number">1427</span><span class="source-line-text">            const format = lastUser.format ?? { type: &quot;text&quot; as const }</span></span>
  <span class="source-line"><span class="source-line-number">1428</span><span class="source-line-text">            if (format.type === &quot;json_schema&quot;) system.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)</span></span>
  <span class="source-line"><span class="source-line-number">1429</span><span class="source-line-text">            const result = yield* handle.process({</span></span>
  <span class="source-line"><span class="source-line-number">1430</span><span class="source-line-text">              user: lastUser,</span></span>
  <span class="source-line"><span class="source-line-number">1431</span><span class="source-line-text">              agent,</span></span>
  <span class="source-line"><span class="source-line-number">1432</span><span class="source-line-text">              permission: session.permission,</span></span>
  <span class="source-line"><span class="source-line-number">1433</span><span class="source-line-text">              sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1434</span><span class="source-line-text">              parentSessionID: session.parentID,</span></span>
  <span class="source-line"><span class="source-line-number">1435</span><span class="source-line-text">              system,</span></span>
  <span class="source-line"><span class="source-line-number">1436</span><span class="source-line-text">              messages: [...modelMsgs, ...(isLastStep ? [{ role: &quot;assistant&quot; as const, content: MAX_STEPS }] : [])],</span></span>
  <span class="source-line"><span class="source-line-number">1437</span><span class="source-line-text">              tools,</span></span>
  <span class="source-line"><span class="source-line-number">1438</span><span class="source-line-text">              model,</span></span>
  <span class="source-line"><span class="source-line-number">1439</span><span class="source-line-text">              toolChoice: format.type === &quot;json_schema&quot; ? &quot;required&quot; : undefined,</span></span>
  <span class="source-line"><span class="source-line-number">1440</span><span class="source-line-text">            })</span></span></code></pre>
  </details>

5. `packages/opencode/src/session/llm.ts:39-60`：LLM stream 需要的输入。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/llm.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/llm.ts:39-60</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">export type StreamInput = {</span></span>
  <span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  user: MessageV2.User</span></span>
  <span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">  sessionID: string</span></span>
  <span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  parentSessionID?: string</span></span>
  <span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  model: Provider.Model</span></span>
  <span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  agent: Agent.Info</span></span>
  <span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">  permission?: Permission.Ruleset</span></span>
  <span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">  system: string[]</span></span>
  <span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">  messages: ModelMessage[]</span></span>
  <span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">  small?: boolean</span></span>
  <span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">  tools: Record&lt;string, Tool&gt;</span></span>
  <span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">  retries?: number</span></span>
  <span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">  toolChoice?: &quot;auto&quot; | &quot;required&quot; | &quot;none&quot;</span></span>
  <span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">}</span></span>
  <span class="source-line"><span class="source-line-number">53</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">export type StreamRequest = StreamInput &amp; {</span></span>
  <span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">  abort: AbortSignal</span></span>
  <span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">}</span></span>
  <span class="source-line"><span class="source-line-number">57</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">export interface Interface {</span></span>
  <span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">  readonly stream: (input: StreamInput) =&gt; Stream.Stream&lt;LLMEvent, unknown&gt;</span></span>
  <span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">}</span></span></code></pre>
  </details>

6. `packages/opencode/src/tool/tool.ts:16-45`：工具接口长什么样。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/tool/tool.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/tool/tool.ts:16-45</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">export type Context&lt;M extends Metadata = Metadata&gt; = {</span></span>
  <span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  sessionID: SessionID</span></span>
  <span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">  messageID: MessageID</span></span>
  <span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">  agent: string</span></span>
  <span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">  abort: AbortSignal</span></span>
  <span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">  callID?: string</span></span>
  <span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">  extra?: { [key: string]: unknown }</span></span>
  <span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  messages: MessageV2.WithParts[]</span></span>
  <span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">  metadata(input: { title?: string; metadata?: M }): Effect.Effect&lt;void&gt;</span></span>
  <span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">  ask(input: Omit&lt;Permission.Request, &quot;id&quot; | &quot;sessionID&quot; | &quot;tool&quot;&gt;): Effect.Effect&lt;void&gt;</span></span>
  <span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">}</span></span>
  <span class="source-line"><span class="source-line-number">27</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">export interface ExecuteResult&lt;M extends Metadata = Metadata&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">  title: string</span></span>
  <span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">  metadata: M</span></span>
  <span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">  output: string</span></span>
  <span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">  attachments?: Omit&lt;MessageV2.FilePart, &quot;id&quot; | &quot;sessionID&quot; | &quot;messageID&quot;&gt;[]</span></span>
  <span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">}</span></span>
  <span class="source-line"><span class="source-line-number">34</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">export interface Def&lt;</span></span>
  <span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  Parameters extends Schema.Decoder&lt;unknown&gt; = Schema.Decoder&lt;unknown&gt;,</span></span>
  <span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">  M extends Metadata = Metadata,</span></span>
  <span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  id: string</span></span>
  <span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  description: string</span></span>
  <span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">  parameters: Parameters</span></span>
  <span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  jsonSchema?: JSONSchema7</span></span>
  <span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  execute(args: Schema.Schema.Type&lt;Parameters&gt;, ctx: Context): Effect.Effect&lt;ExecuteResult&lt;M&gt;&gt;</span></span>
  <span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  formatValidationError?(error: unknown): string</span></span>
  <span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">}</span></span></code></pre>
  </details>

7. `packages/opencode/src/session/tools.ts:42-115`：工具如何被包装成模型可调用函数。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:42-115</code></span>
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
  <span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">  })</span></span>
  <span class="source-line"><span class="source-line-number">74</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  for (const item of yield* registry.tools({</span></span>
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
  <span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">    })</span></span></code></pre>
  </details>

8. `packages/opencode/src/permission/index.ts:161-195`：工具执行前如何 ask。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:161-195</code></span>
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
  <span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      )</span></span></code></pre>
  </details>

9. `packages/opencode/src/session/processor.ts:451-500`：tool result 如何写回。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:451-500</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">          case &quot;tool-result&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">            const toolCall = yield* readToolCall(value.id)</span></span>
  <span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">            const rawOutput = toolResultOutput(value)</span></span>
  <span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">            const normalized = yield* Effect.forEach(rawOutput.attachments ?? [], (attachment) =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">              attachment.mime.startsWith(&quot;image/&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">                ? image.normalize(attachment).pipe(</span></span>
  <span class="source-line"><span class="source-line-number">457</span><span class="source-line-text">                    Effect.catchIf(</span></span>
  <span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">                      (error) =&gt; error instanceof Image.ResizerUnavailableError,</span></span>
  <span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">                      () =&gt; Effect.succeed(attachment),</span></span>
  <span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">                    ),</span></span>
  <span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">                    Effect.exit,</span></span>
  <span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">                  )</span></span>
  <span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">                : Effect.succeed(Exit.succeed&lt;MessageV2.FilePart&gt;(attachment)),</span></span>
  <span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">            )</span></span>
  <span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">            const omitted = normalized.filter(Exit.isFailure).length</span></span>
  <span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">            const attachments = normalized.filter(Exit.isSuccess).map((item) =&gt; item.value)</span></span>
  <span class="source-line"><span class="source-line-number">467</span><span class="source-line-text">            const output = {</span></span>
  <span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">              ...rawOutput,</span></span>
  <span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">              output:</span></span>
  <span class="source-line"><span class="source-line-number">470</span><span class="source-line-text">                omitted === 0</span></span>
  <span class="source-line"><span class="source-line-number">471</span><span class="source-line-text">                  ? rawOutput.output</span></span>
  <span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">                  : `${rawOutput.output}\n\n[${omitted} image${omitted === 1 ? &quot;&quot; : &quot;s&quot;} omitted: could not be resized below the image size limit.]`,</span></span>
  <span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">              attachments: attachments.length ? attachments : undefined,</span></span>
  <span class="source-line"><span class="source-line-number">474</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">            // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
  <span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">            if (flags.experimentalEventSystem) {</span></span>
  <span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">              yield* events.publish(SessionEvent.Tool.Success, {</span></span>
  <span class="source-line"><span class="source-line-number">478</span><span class="source-line-text">                sessionID: ctx.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">479</span><span class="source-line-text">                callID: value.id,</span></span>
  <span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">                structured: output.metadata,</span></span>
  <span class="source-line"><span class="source-line-number">481</span><span class="source-line-text">                content: [</span></span>
  <span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">                  {</span></span>
  <span class="source-line"><span class="source-line-number">483</span><span class="source-line-text">                    type: &quot;text&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">                    text: output.output,</span></span>
  <span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">                  },</span></span>
  <span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">                  ...(output.attachments?.map((item: MessageV2.FilePart) =&gt; ({</span></span>
  <span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">                    type: &quot;file&quot; as const,</span></span>
  <span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">                    uri: item.url,</span></span>
  <span class="source-line"><span class="source-line-number">489</span><span class="source-line-text">                    mime: item.mime,</span></span>
  <span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">                    name: item.filename,</span></span>
  <span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">                  })) ?? []),</span></span>
  <span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">                ],</span></span>
  <span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">                provider: {</span></span>
  <span class="source-line"><span class="source-line-number">494</span><span class="source-line-text">                  executed: value.providerExecuted === true || toolCall?.part.metadata?.providerExecuted === true,</span></span>
  <span class="source-line"><span class="source-line-number">495</span><span class="source-line-text">                },</span></span>
  <span class="source-line"><span class="source-line-number">496</span><span class="source-line-text">                timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
  <span class="source-line"><span class="source-line-number">497</span><span class="source-line-text">              })</span></span>
  <span class="source-line"><span class="source-line-number">498</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">499</span><span class="source-line-text">            yield* completeToolCall(value.id, output)</span></span>
  <span class="source-line"><span class="source-line-number">500</span><span class="source-line-text">            return</span></span></code></pre>
  </details>

10. `packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts:21-53`：如果需要 UI，事件流如何输出。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts:21-53</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">function eventResponse(bus: Bus.Interface) {</span></span>
  <span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">  return Effect.gen(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">    // Subscribe eagerly: the bus subscription is acquired in the request scope</span></span>
  <span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    // at this yield, so any publish from now on is queued for the body-pump</span></span>
  <span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">    // fiber to drain — closing the race where Stream.concat(server.connected,</span></span>
  <span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">    // lazy-subscribe) used to drop publishes in the prefix-consume window.</span></span>
  <span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">    const events = (yield* bus.subscribeAll()).pipe(</span></span>
  <span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">      Stream.takeUntil((event) =&gt; event.type === Bus.InstanceDisposed.type),</span></span>
  <span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">    )</span></span>
  <span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">    const heartbeat = Stream.tick(&quot;10 seconds&quot;).pipe(</span></span>
  <span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">      Stream.drop(1),</span></span>
  <span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">      Stream.map(() =&gt; ({ id: Bus.createID(), type: &quot;server.heartbeat&quot;, properties: {} })),</span></span>
  <span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">    )</span></span>
  <span class="source-line"><span class="source-line-number">34</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">    log.info(&quot;event connected&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">    return HttpServerResponse.stream(</span></span>
  <span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">      Stream.make({ id: Bus.createID(), type: &quot;server.connected&quot;, properties: {} }).pipe(</span></span>
  <span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">        Stream.concat(events.pipe(Stream.merge(heartbeat, { haltStrategy: &quot;left&quot; }))),</span></span>
  <span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">        Stream.map(eventData),</span></span>
  <span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">        Stream.pipeThroughChannel(Sse.encode()),</span></span>
  <span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">        Stream.encodeText,</span></span>
  <span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">        Stream.ensuring(Effect.sync(() =&gt; log.info(&quot;event disconnected&quot;))),</span></span>
  <span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">      ),</span></span>
  <span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">      {</span></span>
  <span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">        contentType: &quot;text/event-stream&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">        headers: {</span></span>
  <span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">          &quot;Cache-Control&quot;: &quot;no-cache, no-transform&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">          &quot;X-Accel-Buffering&quot;: &quot;no&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">          &quot;X-Content-Type-Options&quot;: &quot;nosniff&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">        },</span></span>
  <span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">      },</span></span>
  <span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">    )</span></span>
  <span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">  })</span></span></code></pre>
  </details>


## 6. 用户输入到 agent 行动的整体链路

以非交互 CLI 为例，OpenCode 的链路是：

```text
用户输入 prompt
  -> run.ts 调用 client.session.prompt
  -> SessionPrompt.prompt 创建 user message
  -> loop 读取 session message
  -> 选择 agent/model
  -> 创建 assistant message
  -> SessionTools.resolve 暴露工具
  -> handle.process 调用 LLM stream
  -> LLM 输出 text/tool-call/tool-result event
  -> processor 写回 text/tool part
  -> 工具执行时通过 ctx.ask 走权限
  -> tool result 写回 message part
  -> loop 再次把 tool result 发给 LLM
  -> 模型 finish 后退出
```

如果你自己实现 mini agent，可以先不做 TUI、Desktop、MCP、插件、LSP，只保留这条链路。

## 7. 核心源码逐段讲解

### 7.1 CLI 只负责把输入送进 session

路径：`packages/opencode/src/cli/cmd/run.ts:768-803`

<details class="source-ref source-ref--inline">
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


```ts
if (!args.interactive) {
  const events = await client.event.subscribe()
  loop(client, events).catch((e) => {
    console.error(e)
    process.exit(1)
  })

  const model = pick(args.model)
  const result = await client.session.prompt({
    sessionID,
    agent,
    model,
    variant: args.variant,
    parts: [...files, { type: "text", text: message }],
  })
  if (result.error) {
    if (!emit("error", { error: result.error })) UI.error(formatRunError(result.error))
    process.exitCode = 1
  }
  return
}
```

这段对 mini agent 的启发：CLI 不应该直接实现 agent loop。CLI 只负责解析参数、整理 parts，然后调用 session service。

Java 类比：Controller 不写业务状态机，只调用 Application Service。

### 7.2 prompt 创建 user message，然后进入 loop

路径：`packages/opencode/src/session/prompt.ts:1211-1230`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1211-1230</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1211</span><span class="source-line-text">    const prompt: (input: PromptInput) =&gt; Effect.Effect&lt;MessageV2.WithParts, Image.Error&gt; = Effect.fn(</span></span>
<span class="source-line"><span class="source-line-number">1212</span><span class="source-line-text">      &quot;SessionPrompt.prompt&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1213</span><span class="source-line-text">    )(function* (input: PromptInput) {</span></span>
<span class="source-line"><span class="source-line-number">1214</span><span class="source-line-text">      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">1215</span><span class="source-line-text">      yield* revert.cleanup(session)</span></span>
<span class="source-line"><span class="source-line-number">1216</span><span class="source-line-text">      const message = yield* createUserMessage(input)</span></span>
<span class="source-line"><span class="source-line-number">1217</span><span class="source-line-text">      yield* sessions.touch(input.sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1218</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1219</span><span class="source-line-text">      const permissions: Permission.Ruleset = []</span></span>
<span class="source-line"><span class="source-line-number">1220</span><span class="source-line-text">      for (const [t, enabled] of Object.entries(input.tools ?? {})) {</span></span>
<span class="source-line"><span class="source-line-number">1221</span><span class="source-line-text">        permissions.push({ permission: t, action: enabled ? &quot;allow&quot; : &quot;deny&quot;, pattern: &quot;*&quot; })</span></span>
<span class="source-line"><span class="source-line-number">1222</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">1223</span><span class="source-line-text">      if (permissions.length &gt; 0) {</span></span>
<span class="source-line"><span class="source-line-number">1224</span><span class="source-line-text">        session.permission = permissions</span></span>
<span class="source-line"><span class="source-line-number">1225</span><span class="source-line-text">        yield* sessions.setPermission({ sessionID: session.id, permission: permissions })</span></span>
<span class="source-line"><span class="source-line-number">1226</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">1227</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1228</span><span class="source-line-text">      if (input.noReply === true) return message</span></span>
<span class="source-line"><span class="source-line-number">1229</span><span class="source-line-text">      return yield* loop({ sessionID: input.sessionID })</span></span>
<span class="source-line"><span class="source-line-number">1230</span><span class="source-line-text">    })</span></span></code></pre>
</details>


```ts
const prompt: (input: PromptInput) => Effect.Effect<MessageV2.WithParts, Image.Error> = Effect.fn(
  "SessionPrompt.prompt",
)(function* (input: PromptInput) {
  const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
  yield* revert.cleanup(session)
  const message = yield* createUserMessage(input)
  yield* sessions.touch(input.sessionID)

  const permissions: Permission.Ruleset = []
  for (const [t, enabled] of Object.entries(input.tools ?? {})) {
    permissions.push({ permission: t, action: enabled ? "allow" : "deny", pattern: "*" })
  }

  if (input.noReply === true) return message
  return yield* loop({ sessionID: input.sessionID })
})
```

mini agent 第一版可以简化成：

```text
prompt(input):
  session.addUserMessage(input.text)
  if noReply return
  return runLoop(session.id)
```

关键不是 Effect 语法，而是职责边界：prompt 负责写入用户消息，loop 负责后续推理。

### 7.3 loop 是一个状态机

路径：`packages/opencode/src/session/prompt.ts:1248-1276`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1248-1276</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1248</span><span class="source-line-text">        while (true) {</span></span>
<span class="source-line"><span class="source-line-number">1249</span><span class="source-line-text">          yield* status.set(sessionID, { type: &quot;busy&quot; })</span></span>
<span class="source-line"><span class="source-line-number">1250</span><span class="source-line-text">          yield* slog.info(&quot;loop&quot;, { step })</span></span>
<span class="source-line"><span class="source-line-number">1251</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1252</span><span class="source-line-text">          let msgs = yield* MessageV2.filterCompactedEffect(sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1253</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1254</span><span class="source-line-text">          const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)</span></span>
<span class="source-line"><span class="source-line-number">1255</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1256</span><span class="source-line-text">          if (!lastUser) throw new Error(&quot;No user message found in stream. This should never happen.&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1257</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1258</span><span class="source-line-text">          const lastAssistantMsg = msgs.findLast(</span></span>
<span class="source-line"><span class="source-line-number">1259</span><span class="source-line-text">            (msg) =&gt; msg.info.role === &quot;assistant&quot; &amp;&amp; msg.info.id === lastAssistant?.id,</span></span>
<span class="source-line"><span class="source-line-number">1260</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1261</span><span class="source-line-text">          // Some providers return &quot;stop&quot; even when the assistant message contains tool calls.</span></span>
<span class="source-line"><span class="source-line-number">1262</span><span class="source-line-text">          // Keep the loop running so tool results can be sent back to the model.</span></span>
<span class="source-line"><span class="source-line-number">1263</span><span class="source-line-text">          // Skip provider-executed tool parts — those were fully handled within the</span></span>
<span class="source-line"><span class="source-line-number">1264</span><span class="source-line-text">          // provider's stream (e.g. DWS Agent Platform) and don't need a re-loop.</span></span>
<span class="source-line"><span class="source-line-number">1265</span><span class="source-line-text">          const hasToolCalls =</span></span>
<span class="source-line"><span class="source-line-number">1266</span><span class="source-line-text">            lastAssistantMsg?.parts.some((part) =&gt; part.type === &quot;tool&quot; &amp;&amp; !part.metadata?.providerExecuted) ?? false</span></span>
<span class="source-line"><span class="source-line-number">1267</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1268</span><span class="source-line-text">          if (</span></span>
<span class="source-line"><span class="source-line-number">1269</span><span class="source-line-text">            lastAssistant?.finish &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1270</span><span class="source-line-text">            ![&quot;tool-calls&quot;].includes(lastAssistant.finish) &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1271</span><span class="source-line-text">            !hasToolCalls &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1272</span><span class="source-line-text">            lastUser.id &lt; lastAssistant.id</span></span>
<span class="source-line"><span class="source-line-number">1273</span><span class="source-line-text">          ) {</span></span>
<span class="source-line"><span class="source-line-number">1274</span><span class="source-line-text">            yield* slog.info(&quot;exiting loop&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1275</span><span class="source-line-text">            break</span></span>
<span class="source-line"><span class="source-line-number">1276</span><span class="source-line-text">          }</span></span></code></pre>
</details>


```ts
while (true) {
  yield* status.set(sessionID, { type: "busy" })
  let msgs = yield* MessageV2.filterCompactedEffect(sessionID)

  const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)

  if (!lastUser) throw new Error("No user message found in stream. This should never happen.")

  const hasToolCalls =
    lastAssistantMsg?.parts.some((part) => part.type === "tool" && !part.metadata?.providerExecuted) ?? false

  if (
    lastAssistant?.finish &&
    !["tool-calls"].includes(lastAssistant.finish) &&
    !hasToolCalls &&
    lastUser.id < lastAssistant.id
  ) {
    yield* slog.info("exiting loop")
    break
  }
```

这就是 agent 的心脏：不是“调用一次 LLM 就结束”，而是根据 message 状态判断是否继续。

mini agent 可以先用更简单的条件：

```text
while true:
  response = llm.stream(messages, tools)
  append assistant output
  if response has tool calls:
    execute tools
    append tool results
    continue
  break
```

### 7.4 每一步都创建 assistant message 和工具集合

路径：`packages/opencode/src/session/prompt.ts:1325-1440`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1325-1440</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1325</span><span class="source-line-text">          const isLastStep = step &gt;= maxSteps</span></span>
<span class="source-line"><span class="source-line-number">1326</span><span class="source-line-text">          msgs = yield* SessionReminders.apply({ messages: msgs, agent, session }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1327</span><span class="source-line-text">            Effect.provideService(RuntimeFlags.Service, flags),</span></span>
<span class="source-line"><span class="source-line-number">1328</span><span class="source-line-text">            Effect.provideService(AppFileSystem.Service, fsys),</span></span>
<span class="source-line"><span class="source-line-number">1329</span><span class="source-line-text">            Effect.provideService(Session.Service, sessions),</span></span>
<span class="source-line"><span class="source-line-number">1330</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1331</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1332</span><span class="source-line-text">          const msg: MessageV2.Assistant = {</span></span>
<span class="source-line"><span class="source-line-number">1333</span><span class="source-line-text">            id: MessageID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">1334</span><span class="source-line-text">            parentID: lastUser.id,</span></span>
<span class="source-line"><span class="source-line-number">1335</span><span class="source-line-text">            role: &quot;assistant&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1336</span><span class="source-line-text">            mode: agent.name,</span></span>
<span class="source-line"><span class="source-line-number">1337</span><span class="source-line-text">            agent: agent.name,</span></span>
<span class="source-line"><span class="source-line-number">1338</span><span class="source-line-text">            variant: lastUser.model.variant,</span></span>
<span class="source-line"><span class="source-line-number">1339</span><span class="source-line-text">            path: { cwd: ctx.directory, root: ctx.worktree },</span></span>
<span class="source-line"><span class="source-line-number">1340</span><span class="source-line-text">            cost: 0,</span></span>
<span class="source-line"><span class="source-line-number">1341</span><span class="source-line-text">            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },</span></span>
<span class="source-line"><span class="source-line-number">1342</span><span class="source-line-text">            modelID: model.id,</span></span>
<span class="source-line"><span class="source-line-number">1343</span><span class="source-line-text">            providerID: model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1344</span><span class="source-line-text">            time: { created: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">1345</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1346</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1347</span><span class="source-line-text">          yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">1348</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1349</span><span class="source-line-text">          const finalizeInterruptedAssistant = Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">1350</span><span class="source-line-text">            if (msg.time.completed) return</span></span>
<span class="source-line"><span class="source-line-number">1351</span><span class="source-line-text">            msg.error ??= MessageV2.fromError(new DOMException(&quot;Aborted&quot;, &quot;AbortError&quot;), {</span></span>
<span class="source-line"><span class="source-line-number">1352</span><span class="source-line-text">              providerID: msg.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1353</span><span class="source-line-text">              aborted: true,</span></span>
<span class="source-line"><span class="source-line-number">1354</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1355</span><span class="source-line-text">            msg.time.completed = Date.now()</span></span>
<span class="source-line"><span class="source-line-number">1356</span><span class="source-line-text">            yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">1357</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">1358</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1359</span><span class="source-line-text">          const handle = yield* processor</span></span>
<span class="source-line"><span class="source-line-number">1360</span><span class="source-line-text">            .create({</span></span>
<span class="source-line"><span class="source-line-number">1361</span><span class="source-line-text">              assistantMessage: msg,</span></span>
<span class="source-line"><span class="source-line-number">1362</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1363</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1364</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1365</span><span class="source-line-text">            .pipe(Effect.onInterrupt(() =&gt; finalizeInterruptedAssistant))</span></span>
<span class="source-line"><span class="source-line-number">1366</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1367</span><span class="source-line-text">          const outcome: &quot;break&quot; | &quot;continue&quot; = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">1368</span><span class="source-line-text">            const lastUserMsg = msgs.findLast((m) =&gt; m.info.role === &quot;user&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1369</span><span class="source-line-text">            const bypassAgentCheck = lastUserMsg?.parts.some((p) =&gt; p.type === &quot;agent&quot;) ?? false</span></span>
<span class="source-line"><span class="source-line-number">1370</span><span class="source-line-text">            const promptOps = yield* ops()</span></span>
<span class="source-line"><span class="source-line-number">1371</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1372</span><span class="source-line-text">            const tools = yield* SessionTools.resolve({</span></span>
<span class="source-line"><span class="source-line-number">1373</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">1374</span><span class="source-line-text">              session,</span></span>
<span class="source-line"><span class="source-line-number">1375</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1376</span><span class="source-line-text">              processor: handle,</span></span>
<span class="source-line"><span class="source-line-number">1377</span><span class="source-line-text">              bypassAgentCheck,</span></span>
<span class="source-line"><span class="source-line-number">1378</span><span class="source-line-text">              messages: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1379</span><span class="source-line-text">              promptOps,</span></span>
<span class="source-line"><span class="source-line-number">1380</span><span class="source-line-text">            }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1381</span><span class="source-line-text">              Effect.provideService(Plugin.Service, plugin),</span></span>
<span class="source-line"><span class="source-line-number">1382</span><span class="source-line-text">              Effect.provideService(Permission.Service, permission),</span></span>
<span class="source-line"><span class="source-line-number">1383</span><span class="source-line-text">              Effect.provideService(ToolRegistry.Service, registry),</span></span>
<span class="source-line"><span class="source-line-number">1384</span><span class="source-line-text">              Effect.provideService(MCP.Service, mcp),</span></span>
<span class="source-line"><span class="source-line-number">1385</span><span class="source-line-text">              Effect.provideService(Truncate.Service, truncate),</span></span>
<span class="source-line"><span class="source-line-number">1386</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">1387</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1388</span><span class="source-line-text">            if (lastUser.format?.type === &quot;json_schema&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1389</span><span class="source-line-text">              tools[&quot;StructuredOutput&quot;] = createStructuredOutputTool({</span></span>
<span class="source-line"><span class="source-line-number">1390</span><span class="source-line-text">                schema: lastUser.format.schema,</span></span>
<span class="source-line"><span class="source-line-number">1391</span><span class="source-line-text">                onSuccess(output) {</span></span>
<span class="source-line"><span class="source-line-number">1392</span><span class="source-line-text">                  structured = output</span></span>
<span class="source-line"><span class="source-line-number">1393</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">1394</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">1395</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1396</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1397</span><span class="source-line-text">            if (step === 1)</span></span>
<span class="source-line"><span class="source-line-number">1398</span><span class="source-line-text">              yield* summary.summarize({ sessionID, messageID: lastUser.id }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
<span class="source-line"><span class="source-line-number">1399</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1400</span><span class="source-line-text">            if (step &gt; 1 &amp;&amp; lastFinished) {</span></span>
<span class="source-line"><span class="source-line-number">1401</span><span class="source-line-text">              for (const m of msgs) {</span></span>
<span class="source-line"><span class="source-line-number">1402</span><span class="source-line-text">                if (m.info.role !== &quot;user&quot; || m.info.id &lt;= lastFinished.id) continue</span></span>
<span class="source-line"><span class="source-line-number">1403</span><span class="source-line-text">                for (const p of m.parts) {</span></span>
<span class="source-line"><span class="source-line-number">1404</span><span class="source-line-text">                  if (p.type !== &quot;text&quot; || p.ignored || p.synthetic) continue</span></span>
<span class="source-line"><span class="source-line-number">1405</span><span class="source-line-text">                  if (!p.text.trim()) continue</span></span>
<span class="source-line"><span class="source-line-number">1406</span><span class="source-line-text">                  p.text = [</span></span>
<span class="source-line"><span class="source-line-number">1407</span><span class="source-line-text">                    &quot;&lt;system-reminder&gt;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1408</span><span class="source-line-text">                    &quot;The user sent the following message:&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1409</span><span class="source-line-text">                    p.text,</span></span>
<span class="source-line"><span class="source-line-number">1410</span><span class="source-line-text">                    &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1411</span><span class="source-line-text">                    &quot;Please address this message and continue with your tasks.&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1412</span><span class="source-line-text">                    &quot;&lt;/system-reminder&gt;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1413</span><span class="source-line-text">                  ].join(&quot;\n&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1414</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">1415</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">1416</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1417</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1418</span><span class="source-line-text">            yield* plugin.trigger(&quot;experimental.chat.messages.transform&quot;, {}, { messages: msgs })</span></span>
<span class="source-line"><span class="source-line-number">1419</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1420</span><span class="source-line-text">            const [skills, env, instructions, modelMsgs] = yield* Effect.all([</span></span>
<span class="source-line"><span class="source-line-number">1421</span><span class="source-line-text">              sys.skills(agent),</span></span>
<span class="source-line"><span class="source-line-number">1422</span><span class="source-line-text">              sys.environment(model),</span></span>
<span class="source-line"><span class="source-line-number">1423</span><span class="source-line-text">              instruction.system().pipe(Effect.orDie),</span></span>
<span class="source-line"><span class="source-line-number">1424</span><span class="source-line-text">              MessageV2.toModelMessagesEffect(msgs, model),</span></span>
<span class="source-line"><span class="source-line-number">1425</span><span class="source-line-text">            ])</span></span>
<span class="source-line"><span class="source-line-number">1426</span><span class="source-line-text">            const system = [...env, ...instructions, ...(skills ? [skills] : [])]</span></span>
<span class="source-line"><span class="source-line-number">1427</span><span class="source-line-text">            const format = lastUser.format ?? { type: &quot;text&quot; as const }</span></span>
<span class="source-line"><span class="source-line-number">1428</span><span class="source-line-text">            if (format.type === &quot;json_schema&quot;) system.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)</span></span>
<span class="source-line"><span class="source-line-number">1429</span><span class="source-line-text">            const result = yield* handle.process({</span></span>
<span class="source-line"><span class="source-line-number">1430</span><span class="source-line-text">              user: lastUser,</span></span>
<span class="source-line"><span class="source-line-number">1431</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">1432</span><span class="source-line-text">              permission: session.permission,</span></span>
<span class="source-line"><span class="source-line-number">1433</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1434</span><span class="source-line-text">              parentSessionID: session.parentID,</span></span>
<span class="source-line"><span class="source-line-number">1435</span><span class="source-line-text">              system,</span></span>
<span class="source-line"><span class="source-line-number">1436</span><span class="source-line-text">              messages: [...modelMsgs, ...(isLastStep ? [{ role: &quot;assistant&quot; as const, content: MAX_STEPS }] : [])],</span></span>
<span class="source-line"><span class="source-line-number">1437</span><span class="source-line-text">              tools,</span></span>
<span class="source-line"><span class="source-line-number">1438</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1439</span><span class="source-line-text">              toolChoice: format.type === &quot;json_schema&quot; ? &quot;required&quot; : undefined,</span></span>
<span class="source-line"><span class="source-line-number">1440</span><span class="source-line-text">            })</span></span></code></pre>
</details>


```ts
const msg: MessageV2.Assistant = {
  id: MessageID.ascending(),
  parentID: lastUser.id,
  role: "assistant",
  agent: agent.name,
  modelID: model.id,
  providerID: model.providerID,
  time: { created: Date.now() },
  sessionID,
}
yield* sessions.updateMessage(msg)

const handle = yield* processor.create({
  assistantMessage: msg,
  sessionID,
  model,
})

const tools = yield* SessionTools.resolve({
  agent,
  session,
  model,
  processor: handle,
  bypassAgentCheck,
  messages: msgs,
  promptOps,
})

const result = yield* handle.process({
  user: lastUser,
  agent,
  permission: session.permission,
  sessionID,
  system,
  messages: [...modelMsgs, ...(isLastStep ? [{ role: "assistant" as const, content: MAX_STEPS }] : [])],
  tools,
  model,
})
```

这给 mini agent 一个很重要的设计：LLM 调用前要准备好 4 样东西：

- 当前 user / session。
- system prompts。
- 历史 messages。
- tools。

### 7.5 LLM service 是一个流式网关

路径：`packages/opencode/src/session/llm.ts:39-60`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/llm.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/llm.ts:39-60</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">export type StreamInput = {</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  user: MessageV2.User</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">  sessionID: string</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  parentSessionID?: string</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  model: Provider.Model</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  agent: Agent.Info</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">  permission?: Permission.Ruleset</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">  system: string[]</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">  messages: ModelMessage[]</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">  small?: boolean</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">  tools: Record&lt;string, Tool&gt;</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">  retries?: number</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">  toolChoice?: &quot;auto&quot; | &quot;required&quot; | &quot;none&quot;</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">export type StreamRequest = StreamInput &amp; {</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">  abort: AbortSignal</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">export interface Interface {</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">  readonly stream: (input: StreamInput) =&gt; Stream.Stream&lt;LLMEvent, unknown&gt;</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">}</span></span></code></pre>
</details>


```ts
export type StreamInput = {
  user: MessageV2.User
  sessionID: string
  parentSessionID?: string
  model: Provider.Model
  agent: Agent.Info
  permission?: Permission.Ruleset
  system: string[]
  messages: ModelMessage[]
  small?: boolean
  tools: Record<string, Tool>
  retries?: number
  toolChoice?: "auto" | "required" | "none"
}

export interface Interface {
  readonly stream: (input: StreamInput) => Stream.Stream<LLMEvent, unknown>
}
```

mini agent 的 `LlmClient` 可以先简单很多：

```ts
type LlmInput = {
  messages: ModelMessage[]
  tools: Record<string, ToolDef>
}

interface LlmClient {
  stream(input: LlmInput): AsyncIterable<LlmEvent>
}
```

这是教学示例，不是 OpenCode 源码。

### 7.6 Tool 接口要先设计好

路径：`packages/opencode/src/tool/tool.ts:16-45`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/tool.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/tool.ts:16-45</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">export type Context&lt;M extends Metadata = Metadata&gt; = {</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  sessionID: SessionID</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">  messageID: MessageID</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">  agent: string</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">  abort: AbortSignal</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">  callID?: string</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">  extra?: { [key: string]: unknown }</span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  messages: MessageV2.WithParts[]</span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">  metadata(input: { title?: string; metadata?: M }): Effect.Effect&lt;void&gt;</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">  ask(input: Omit&lt;Permission.Request, &quot;id&quot; | &quot;sessionID&quot; | &quot;tool&quot;&gt;): Effect.Effect&lt;void&gt;</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">export interface ExecuteResult&lt;M extends Metadata = Metadata&gt; {</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">  title: string</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">  metadata: M</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">  output: string</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">  attachments?: Omit&lt;MessageV2.FilePart, &quot;id&quot; | &quot;sessionID&quot; | &quot;messageID&quot;&gt;[]</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">export interface Def&lt;</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  Parameters extends Schema.Decoder&lt;unknown&gt; = Schema.Decoder&lt;unknown&gt;,</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">  M extends Metadata = Metadata,</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">&gt; {</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  id: string</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  description: string</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">  parameters: Parameters</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  jsonSchema?: JSONSchema7</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  execute(args: Schema.Schema.Type&lt;Parameters&gt;, ctx: Context): Effect.Effect&lt;ExecuteResult&lt;M&gt;&gt;</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  formatValidationError?(error: unknown): string</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">}</span></span></code></pre>
</details>


```ts
export type Context<M extends Metadata = Metadata> = {
  sessionID: SessionID
  messageID: MessageID
  agent: string
  abort: AbortSignal
  callID?: string
  extra?: { [key: string]: unknown }
  messages: MessageV2.WithParts[]
  metadata(input: { title?: string; metadata?: M }): Effect.Effect<void>
  ask(input: Omit<Permission.Request, "id" | "sessionID" | "tool">): Effect.Effect<void>
}

export interface ExecuteResult<M extends Metadata = Metadata> {
  title: string
  metadata: M
  output: string
  attachments?: Omit<MessageV2.FilePart, "id" | "sessionID" | "messageID">[]
}

export interface Def<Parameters extends Schema.Decoder<unknown> = Schema.Decoder<unknown>, M extends Metadata = Metadata> {
  id: string
  description: string
  parameters: Parameters
  execute(args: Schema.Schema.Type<Parameters>, ctx: Context): Effect.Effect<ExecuteResult<M>>
}
```

这个接口说明，工具不只是一个函数。工具需要：

- 参数 schema。
- 执行上下文。
- 权限申请能力。
- 结果 metadata。
- 可选附件。

mini agent 第一版至少保留 `id`、`description`、`parameters`、`execute`。

### 7.7 SessionTools.resolve 把内部工具包装成模型工具

路径：`packages/opencode/src/session/tools.ts:42-115`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:42-115</code></span>
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
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  for (const item of yield* registry.tools({</span></span>
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
<span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">    })</span></span></code></pre>
</details>


```ts
const context = (args: Record<string, unknown>, options: ToolExecutionOptions): Tool.Context => ({
  sessionID: input.session.id,
  abort: options.abortSignal!,
  messageID: input.processor.message.id,
  callID: options.toolCallId,
  agent: input.agent.name,
  messages: input.messages,
  metadata: (val) => input.processor.updateToolCall(options.toolCallId, ...),
  ask: (req) =>
    permission
      .ask({
        ...req,
        sessionID: input.session.id,
        tool: { messageID: input.processor.message.id, callID: options.toolCallId },
        ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),
      })
      .pipe(Effect.orDie),
})

for (const item of yield* registry.tools({ modelID, providerID, agent })) {
  const schema = ProviderTransform.schema(input.model, ToolJsonSchema.fromTool(item))
  tools[item.id] = tool({
    description: item.description,
    inputSchema: jsonSchema(schema),
    execute(args, options) {
      return run.promise(Effect.gen(function* () {
        const ctx = context(args, options)
        const result = yield* item.execute(args, ctx)
        return output
      }))
    },
  })
}
```

这里有一个适配器模式：OpenCode 内部 Tool 和 AI SDK 需要的 `tool(...)` 不是同一个接口，所以 `SessionTools.resolve` 做了转换。

mini agent 如果直接调用某个 provider SDK，也可能需要这一层。

### 7.8 权限是工具执行前的闸门

路径：`packages/opencode/src/permission/index.ts:161-195`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:161-195</code></span>
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
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      )</span></span></code></pre>
</details>


```ts
const ask = Effect.fn("Permission.ask")(function* (input: AskInput) {
  const { approved, pending } = yield* InstanceState.get(state)
  const { ruleset, ...request } = input
  let needsAsk = false

  for (const pattern of request.patterns) {
    const rule = evaluate(request.permission, pattern, ruleset, approved)
    if (rule.action === "deny") {
      return yield* new DeniedError({ ruleset: ruleset.filter((rule) => Wildcard.match(request.permission, rule.permission)) })
    }
    if (rule.action === "allow") continue
    needsAsk = true
  }

  if (!needsAsk) return

  const id = request.id ?? PermissionID.ascending()
  const deferred = yield* Deferred.make<void, RejectedError | CorrectedError>()
  pending.set(id, { info, deferred })
  yield* bus.publish(Event.Asked, info)
  return yield* Effect.ensuring(Deferred.await(deferred), Effect.sync(() => pending.delete(id)))
})
```

mini agent 可以先实现同步版：

```text
if rule == deny: throw
if rule == allow: run
if rule == ask: print prompt and wait for y/n
```

但是架构上最好保留 `PermissionService.ask(...)`，因为以后接 TUI 或 Web UI 时，审批会变成异步。

### 7.9 文件读写和 shell 是最小 coding agent 的两个核心工具

读文件路径：`packages/opencode/src/tool/read.ts:29-39`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/read.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/read.ts:29-39</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">export const Parameters = Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">  filePath: Schema.String.annotate({ description: &quot;The absolute path to the file or directory to read&quot; }),</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">  offset: Schema.optional(NonNegativeInt).annotate({</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">    description: &quot;The line number to start reading from (1-indexed)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">  }),</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">  limit: Schema.optional(NonNegativeInt).annotate({</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">    description: &quot;The maximum number of lines to read (defaults to 2000)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  }),</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">})</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">export const ReadTool = Tool.define(</span></span></code></pre>
</details>


```ts
export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({ description: "The absolute path to the file or directory to read" }),
  offset: Schema.optional(NonNegativeInt).annotate({
    description: "The line number to start reading from (1-indexed)",
  }),
  limit: Schema.optional(NonNegativeInt).annotate({
    description: "The maximum number of lines to read (defaults to 2000)",
  }),
})

export const ReadTool = Tool.define("read", ...)
```

编辑文件路径：`packages/opencode/src/tool/edit.ts:47-69`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/edit.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/edit.ts:47-69</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">export const Parameters = Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">  filePath: Schema.String.annotate({ description: &quot;The absolute path to the file to modify&quot; }),</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">  oldString: Schema.String.annotate({ description: &quot;The text to replace&quot; }),</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">  newString: Schema.String.annotate({</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">    description: &quot;The text to replace it with (must be different from oldString)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">  }),</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">  replaceAll: Schema.optional(Schema.Boolean).annotate({</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">    description: &quot;Replace all occurrences of oldString (default false)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">  }),</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">})</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">export const EditTool = Tool.define(</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">  &quot;edit&quot;,</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">  Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">    const lsp = yield* LSP.Service</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">    const afs = yield* AppFileSystem.Service</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">    const format = yield* Format.Service</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    const bus = yield* Bus.Service</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">    return {</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">      description: DESCRIPTION,</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">      parameters: Parameters,</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">      execute: (params: Schema.Schema.Type&lt;typeof Parameters&gt;, ctx: Tool.Context) =&gt;</span></span></code></pre>
</details>


```ts
export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({ description: "The absolute path to the file to modify" }),
  oldString: Schema.String.annotate({ description: "The text to replace" }),
  newString: Schema.String.annotate({
    description: "The text to replace it with (must be different from oldString)",
  }),
  replaceAll: Schema.optional(Schema.Boolean).annotate({
    description: "Replace all occurrences of oldString (default false)",
  }),
})

export const EditTool = Tool.define("edit", ...)
```

Shell 路径：`packages/opencode/src/tool/shell.ts:260-287`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:260-287</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">const parse = Effect.fn(&quot;ShellTool.parse&quot;)(function* (command: string, ps: boolean) {</span></span>
<span class="source-line"><span class="source-line-number">261</span><span class="source-line-text">  const tree = yield* Effect.promise(() =&gt; parser().then((p) =&gt; (ps ? p.ps : p.bash).parse(command)))</span></span>
<span class="source-line"><span class="source-line-number">262</span><span class="source-line-text">  if (!tree) throw new Error(&quot;Failed to parse command&quot;)</span></span>
<span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">  return tree</span></span>
<span class="source-line"><span class="source-line-number">264</span><span class="source-line-text">})</span></span>
<span class="source-line"><span class="source-line-number">265</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">const ask = Effect.fn(&quot;ShellTool.ask&quot;)(function* (ctx: Tool.Context, scan: Scan) {</span></span>
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


```ts
const parse = Effect.fn("ShellTool.parse")(function* (command: string, ps: boolean) {
  const tree = yield* Effect.promise(() => parser().then((p) => (ps ? p.ps : p.bash).parse(command)))
  if (!tree) throw new Error("Failed to parse command")
  return tree
})

const ask = Effect.fn("ShellTool.ask")(function* (ctx: Tool.Context, scan: Scan) {
  if (scan.dirs.size > 0) {
    yield* ctx.ask({ permission: "external_directory", patterns: globs, always: globs, metadata: {} })
  }

  if (scan.patterns.size === 0) return
  yield* ctx.ask({ permission: ShellID.ToolID, patterns: Array.from(scan.patterns), always: Array.from(scan.always), metadata: {} })
})
```

mini agent 第一版可以只做：

- `read_file`
- `edit_file`
- `run_shell`

并给 `edit_file` 和 `run_shell` 加权限确认。

### 7.10 tool result 被 processor 写回，再进入下一轮

路径：`packages/opencode/src/session/processor.ts:451-500`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:451-500</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">          case &quot;tool-result&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">            const toolCall = yield* readToolCall(value.id)</span></span>
<span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">            const rawOutput = toolResultOutput(value)</span></span>
<span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">            const normalized = yield* Effect.forEach(rawOutput.attachments ?? [], (attachment) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">              attachment.mime.startsWith(&quot;image/&quot;)</span></span>
<span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">                ? image.normalize(attachment).pipe(</span></span>
<span class="source-line"><span class="source-line-number">457</span><span class="source-line-text">                    Effect.catchIf(</span></span>
<span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">                      (error) =&gt; error instanceof Image.ResizerUnavailableError,</span></span>
<span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">                      () =&gt; Effect.succeed(attachment),</span></span>
<span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">                    Effect.exit,</span></span>
<span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">                  )</span></span>
<span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">                : Effect.succeed(Exit.succeed&lt;MessageV2.FilePart&gt;(attachment)),</span></span>
<span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">            const omitted = normalized.filter(Exit.isFailure).length</span></span>
<span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">            const attachments = normalized.filter(Exit.isSuccess).map((item) =&gt; item.value)</span></span>
<span class="source-line"><span class="source-line-number">467</span><span class="source-line-text">            const output = {</span></span>
<span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">              ...rawOutput,</span></span>
<span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">              output:</span></span>
<span class="source-line"><span class="source-line-number">470</span><span class="source-line-text">                omitted === 0</span></span>
<span class="source-line"><span class="source-line-number">471</span><span class="source-line-text">                  ? rawOutput.output</span></span>
<span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">                  : `${rawOutput.output}\n\n[${omitted} image${omitted === 1 ? &quot;&quot; : &quot;s&quot;} omitted: could not be resized below the image size limit.]`,</span></span>
<span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">              attachments: attachments.length ? attachments : undefined,</span></span>
<span class="source-line"><span class="source-line-number">474</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">            // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">            if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">              yield* events.publish(SessionEvent.Tool.Success, {</span></span>
<span class="source-line"><span class="source-line-number">478</span><span class="source-line-text">                sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">479</span><span class="source-line-text">                callID: value.id,</span></span>
<span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">                structured: output.metadata,</span></span>
<span class="source-line"><span class="source-line-number">481</span><span class="source-line-text">                content: [</span></span>
<span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">                  {</span></span>
<span class="source-line"><span class="source-line-number">483</span><span class="source-line-text">                    type: &quot;text&quot;,</span></span>
<span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">                    text: output.output,</span></span>
<span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">                  },</span></span>
<span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">                  ...(output.attachments?.map((item: MessageV2.FilePart) =&gt; ({</span></span>
<span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">                    type: &quot;file&quot; as const,</span></span>
<span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">                    uri: item.url,</span></span>
<span class="source-line"><span class="source-line-number">489</span><span class="source-line-text">                    mime: item.mime,</span></span>
<span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">                    name: item.filename,</span></span>
<span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">                  })) ?? []),</span></span>
<span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">                ],</span></span>
<span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">                provider: {</span></span>
<span class="source-line"><span class="source-line-number">494</span><span class="source-line-text">                  executed: value.providerExecuted === true || toolCall?.part.metadata?.providerExecuted === true,</span></span>
<span class="source-line"><span class="source-line-number">495</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">496</span><span class="source-line-text">                timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
<span class="source-line"><span class="source-line-number">497</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">498</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">499</span><span class="source-line-text">            yield* completeToolCall(value.id, output)</span></span>
<span class="source-line"><span class="source-line-number">500</span><span class="source-line-text">            return</span></span></code></pre>
</details>


```ts
case "tool-result": {
  const toolCall = yield* readToolCall(value.id)
  const rawOutput = toolResultOutput(value)
  const output = {
    ...rawOutput,
    output:
      omitted === 0
        ? rawOutput.output
        : `${rawOutput.output}\n\n[${omitted} images omitted: could not be resized below the image size limit.]`,
    attachments: attachments.length ? attachments : undefined,
  }
  yield* completeToolCall(value.id, output)
  return
}
```

路径：`packages/opencode/src/session/prompt.ts:1449-1477`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1449-1477</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1449</span><span class="source-line-text">            const finished = handle.message.finish &amp;&amp; ![&quot;tool-calls&quot;, &quot;unknown&quot;].includes(handle.message.finish)</span></span>
<span class="source-line"><span class="source-line-number">1450</span><span class="source-line-text">            if (finished &amp;&amp; !handle.message.error) {</span></span>
<span class="source-line"><span class="source-line-number">1451</span><span class="source-line-text">              if (format.type === &quot;json_schema&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1452</span><span class="source-line-text">                handle.message.error = new MessageV2.StructuredOutputError({</span></span>
<span class="source-line"><span class="source-line-number">1453</span><span class="source-line-text">                  message: &quot;Model did not produce structured output&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1454</span><span class="source-line-text">                  retries: 0,</span></span>
<span class="source-line"><span class="source-line-number">1455</span><span class="source-line-text">                }).toObject()</span></span>
<span class="source-line"><span class="source-line-number">1456</span><span class="source-line-text">                yield* sessions.updateMessage(handle.message)</span></span>
<span class="source-line"><span class="source-line-number">1457</span><span class="source-line-text">                return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1458</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">1459</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1460</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1461</span><span class="source-line-text">            if (result === &quot;stop&quot;) return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1462</span><span class="source-line-text">            if (result === &quot;compact&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1463</span><span class="source-line-text">              yield* compaction.create({</span></span>
<span class="source-line"><span class="source-line-number">1464</span><span class="source-line-text">                sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1465</span><span class="source-line-text">                agent: lastUser.agent,</span></span>
<span class="source-line"><span class="source-line-number">1466</span><span class="source-line-text">                model: lastUser.model,</span></span>
<span class="source-line"><span class="source-line-number">1467</span><span class="source-line-text">                auto: true,</span></span>
<span class="source-line"><span class="source-line-number">1468</span><span class="source-line-text">                overflow: !handle.message.finish,</span></span>
<span class="source-line"><span class="source-line-number">1469</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">1470</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1471</span><span class="source-line-text">            return &quot;continue&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1472</span><span class="source-line-text">          }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1473</span><span class="source-line-text">            Effect.ensuring(instruction.clear(handle.message.id)),</span></span>
<span class="source-line"><span class="source-line-number">1474</span><span class="source-line-text">            Effect.onInterrupt(() =&gt; finalizeInterruptedAssistant),</span></span>
<span class="source-line"><span class="source-line-number">1475</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1476</span><span class="source-line-text">          if (outcome === &quot;break&quot;) break</span></span>
<span class="source-line"><span class="source-line-number">1477</span><span class="source-line-text">          continue</span></span></code></pre>
</details>


```ts
const finished = handle.message.finish && !["tool-calls", "unknown"].includes(handle.message.finish)

if (result === "stop") return "break" as const
if (result === "compact") {
  yield* compaction.create({ sessionID, agent: lastUser.agent, model: lastUser.model, auto: true })
}
return "continue" as const
```

这就是“工具执行结果回到模型”的关键。mini agent 一定要把 tool result 写进 messages，否则下一轮 LLM 不知道工具做了什么。

## 8. 关键 TypeScript 语法复习

### 8.1 `Record<string, Tool>`

来源：`packages/opencode/src/session/llm.ts:49`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/llm.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/llm.ts:49</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">  tools: Record&lt;string, Tool&gt;</span></span></code></pre>
</details>


```ts
tools: Record<string, Tool>
```

表示一个 key 是 string、value 是 Tool 的对象。Java 类比：`Map<String, Tool>`。

### 8.2 literal union

来源：`packages/opencode/src/session/llm.ts:51`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/llm.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/llm.ts:51</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">  toolChoice?: &quot;auto&quot; | &quot;required&quot; | &quot;none&quot;</span></span></code></pre>
</details>


```ts
toolChoice?: "auto" | "required" | "none"
```

这比 Java enum 更轻量，运行时只是字符串，编译期限制只能取这三个值。

### 8.3 optional property

来源：`packages/opencode/src/session/llm.ts:42-51`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/llm.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/llm.ts:42-51</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  parentSessionID?: string</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  model: Provider.Model</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  agent: Agent.Info</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">  permission?: Permission.Ruleset</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">  system: string[]</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">  messages: ModelMessage[]</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">  small?: boolean</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">  tools: Record&lt;string, Tool&gt;</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">  retries?: number</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">  toolChoice?: &quot;auto&quot; | &quot;required&quot; | &quot;none&quot;</span></span></code></pre>
</details>


```ts
parentSessionID?: string
small?: boolean
retries?: number
```

`?` 表示字段可以是 `undefined`。Java 类比是 nullable field，但 TS 会在类型层提醒你处理。

### 8.4 泛型接口

来源：`packages/opencode/src/tool/tool.ts:28-45`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/tool.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/tool.ts:28-45</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">export interface ExecuteResult&lt;M extends Metadata = Metadata&gt; {</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">  title: string</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">  metadata: M</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">  output: string</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">  attachments?: Omit&lt;MessageV2.FilePart, &quot;id&quot; | &quot;sessionID&quot; | &quot;messageID&quot;&gt;[]</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">export interface Def&lt;</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  Parameters extends Schema.Decoder&lt;unknown&gt; = Schema.Decoder&lt;unknown&gt;,</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">  M extends Metadata = Metadata,</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">&gt; {</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  id: string</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  description: string</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">  parameters: Parameters</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  jsonSchema?: JSONSchema7</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  execute(args: Schema.Schema.Type&lt;Parameters&gt;, ctx: Context): Effect.Effect&lt;ExecuteResult&lt;M&gt;&gt;</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  formatValidationError?(error: unknown): string</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">}</span></span></code></pre>
</details>


```ts
export interface ExecuteResult<M extends Metadata = Metadata> {
  title: string
  metadata: M
  output: string
}
```

`M extends Metadata = Metadata` 表示 metadata 类型可定制，默认是 Metadata。Java 类比：`class ExecuteResult<M extends Metadata>`，但 TS 可以给泛型默认值。

### 8.5 `Omit`

来源：`packages/opencode/src/tool/tool.ts:25`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/tool.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/tool.ts:25</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">  ask(input: Omit&lt;Permission.Request, &quot;id&quot; | &quot;sessionID&quot; | &quot;tool&quot;&gt;): Effect.Effect&lt;void&gt;</span></span></code></pre>
</details>


```ts
ask(input: Omit<Permission.Request, "id" | "sessionID" | "tool">): Effect.Effect<void>
```

工具调用 `ask` 时不需要自己填 `id/sessionID/tool`，这些由上下文补齐。Java 里通常会建一个 `PermissionRequestDraft` DTO；TS 可以直接用 `Omit` 从已有类型裁剪。

### 8.6 `as const`

来源：`packages/opencode/src/session/prompt.ts:1436`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1436</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1436</span><span class="source-line-text">              messages: [...modelMsgs, ...(isLastStep ? [{ role: &quot;assistant&quot; as const, content: MAX_STEPS }] : [])],</span></span></code></pre>
</details>


```ts
{ role: "assistant" as const, content: MAX_STEPS }
```

`as const` 让 `"assistant"` 保持字面量类型，而不是泛化成 `string`。

## 9. 涉及的设计模式和架构思想

### 9.1 Controller -> Service -> State Machine

`run.ts` 像 Controller；`SessionPrompt.prompt` 像 Application Service；`runLoop` 是状态机。

### 9.2 Strategy / Registry

每个 tool 是一个 strategy；registry 根据 agent/model 选出可用工具。来源：`session/tools.ts:75-115`。

### 9.3 Adapter

内部 Tool 接口被适配成 provider/AI SDK 可调用的 tool。来源：`session/tools.ts:80-115`。

### 9.4 Event Bus

权限请求和 server event stream 都依赖事件发布。来源：`permission/index.ts:187-190`、`handlers/event.ts:21-53`。

### 9.5 Safety Gate

文件编辑和 shell 执行必须经过权限层。来源：`edit.ts:98-107`、`shell.ts:266-287`、`permission/index.ts:161-195`。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

mini agent 里可以压缩成 5 个服务：

| 服务 | 职责 | OpenCode 对应 |
|---|---|---|
| `SessionStore` | 保存 user/assistant/tool messages | `Session.Service`、`MessageV2` |
| `AgentLoop` | while 循环，判断继续/停止 | `SessionPrompt.runLoop` |
| `LlmClient` | 把 messages/tools 发给模型并返回事件 | `LLM.Service` |
| `ToolRegistry` | 管理 read/edit/shell 工具 | `ToolRegistry.Service`、`SessionTools.resolve` |
| `PermissionService` | allow/deny/ask | `Permission.Service` |

不要一开始就做插件、MCP、TUI、LSP。先做闭环，再加能力。

## 11. 如果自己实现 mini agent，这一章对应什么代码

下面是建议实现顺序。示例代码是“你可以自己写的 mini agent 草图”，不是 OpenCode 源码。

### 11.1 第一步：定义消息类型

```ts
type Role = "user" | "assistant" | "tool"

type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[]; finish?: "stop" | "tool-calls" }
  | { role: "tool"; toolCallID: string; content: string }

type ToolCall = {
  id: string
  name: string
  input: unknown
}
```

对应 OpenCode：`MessageV2.User`、`MessageV2.Assistant`、tool part。

### 11.2 第二步：定义 Tool 接口

```ts
type ToolContext = {
  sessionID: string
  ask(input: { permission: string; pattern: string }): Promise<void>
}

type ToolDef<TInput = unknown> = {
  id: string
  description: string
  parameters: unknown
  execute(input: TInput, ctx: ToolContext): Promise<{ output: string }>
}
```

对应 OpenCode：`packages/opencode/src/tool/tool.ts:16-45`。

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/tool.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/tool.ts:16-45</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">export type Context&lt;M extends Metadata = Metadata&gt; = {</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  sessionID: SessionID</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">  messageID: MessageID</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">  agent: string</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">  abort: AbortSignal</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">  callID?: string</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">  extra?: { [key: string]: unknown }</span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  messages: MessageV2.WithParts[]</span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">  metadata(input: { title?: string; metadata?: M }): Effect.Effect&lt;void&gt;</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">  ask(input: Omit&lt;Permission.Request, &quot;id&quot; | &quot;sessionID&quot; | &quot;tool&quot;&gt;): Effect.Effect&lt;void&gt;</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">export interface ExecuteResult&lt;M extends Metadata = Metadata&gt; {</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">  title: string</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">  metadata: M</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">  output: string</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">  attachments?: Omit&lt;MessageV2.FilePart, &quot;id&quot; | &quot;sessionID&quot; | &quot;messageID&quot;&gt;[]</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">export interface Def&lt;</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  Parameters extends Schema.Decoder&lt;unknown&gt; = Schema.Decoder&lt;unknown&gt;,</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">  M extends Metadata = Metadata,</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">&gt; {</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  id: string</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  description: string</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">  parameters: Parameters</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  jsonSchema?: JSONSchema7</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  execute(args: Schema.Schema.Type&lt;Parameters&gt;, ctx: Context): Effect.Effect&lt;ExecuteResult&lt;M&gt;&gt;</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  formatValidationError?(error: unknown): string</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">}</span></span></code></pre>
</details>


### 11.3 第三步：写 agent loop

```ts
async function runLoop(session: Session, llm: LlmClient, tools: Record<string, ToolDef>) {
  while (true) {
    const result = await llm.complete({
      messages: session.messages,
      tools,
    })

    session.messages.push(result.assistant)

    if (!result.assistant.toolCalls?.length) break

    for (const call of result.assistant.toolCalls) {
      const tool = tools[call.name]
      if (!tool) throw new Error(`Unknown tool: ${call.name}`)
      const output = await tool.execute(call.input, makeToolContext(session, call))
      session.messages.push({ role: "tool", toolCallID: call.id, content: output.output })
    }
  }
}
```

对应 OpenCode：`prompt.ts:1248-1489`、`session/tools.ts:42-115`、`processor.ts:451-500`。

### 11.4 第四步：实现 read/edit/shell

第一版推荐顺序：

1. `read_file`：只读项目目录内文本文件。
2. `edit_file`：只支持 `oldString/newString`。
3. `run_shell`：先只支持白名单命令，例如 `ls`、`cat`、`npm test`。

对应 OpenCode：`read.ts:29-39`、`edit.ts:47-69`、`shell.ts:260-287`。

### 11.5 第五步：加权限

第一版不要做复杂 ruleset，先做：

```text
read_file: allow
edit_file: ask
run_shell: ask 或 deny
```

对应 OpenCode：`permission/index.ts:161-195`。

### 11.6 第六步：加事件输出

如果你要接 Web UI，再加：

```text
event: message.created
event: part.updated
event: tool.started
event: tool.finished
event: permission.asked
```

对应 OpenCode：`handlers/event.ts:21-53`。

## 12. 费曼复述区

### 12.1 请你用自己的话解释

请你不用“agent loop”这个词，向一个 Java 同事解释：

> 为什么 coding agent 不能只调用一次 LLM？为什么 tool result 必须写回消息历史？

### 12.2 如果解释不出来，说明卡在这里

常见卡点：

- 以为 tool call 是本地代码主动决定的，而不是模型输出的结构化请求。
- 以为工具执行完就可以直接把结果给用户，不需要再给模型。
- 分不清 session message 和 UI event。
- 分不清 Tool 内部接口和 provider 看到的 tool schema。

### 12.3 换一种说法再解释

模型像一个只会发指令的主程。它说“读这个文件”，工具读完文件后，必须把结果告诉主程。主程看完结果，才能决定下一步是修改文件、跑测试，还是回答用户。

## 13. 练习题

### 入门题

1. 用 5 句话解释 `CLI -> Session -> LLM -> Tool -> LLM`。
2. 写出 mini agent 至少需要的 3 个 tool。
3. 说明为什么 `edit_file` 需要权限，而 `read_file` 第一版可以先宽松一些。

### 进阶题

1. 把 OpenCode 的 `Tool.Context` 简化成你自己的 `ToolContext`。
2. 写一个 `ToolRegistry`，输入 agent 名称，返回可用工具集合。
3. 写一个 `PermissionService.ask`，支持 allow/deny/ask 三种行为。

### 源码追踪题

1. 从 `run.ts:792` 的 `client.session.prompt` 追到 `prompt.ts:1211`。
2. 从 `prompt.ts:1372` 的 `SessionTools.resolve` 追到 `session/tools.ts:75`。
3. 从 `session/tools.ts:93` 的 `item.execute(args, ctx)` 追到 `edit.ts:69`。
4. 从 `edit.ts:98` 的 `ctx.ask` 追到 `permission/index.ts:161`。
5. 从 `processor.ts:499` 的 `completeToolCall` 回到 `prompt.ts:1461-1477` 的 continue/break 判断。

### 小实现题

实现一个真正能跑的 mini agent skeleton：

```text
src/
  cli.ts
  session.ts
  llm.ts
  tools/
    read-file.ts
    edit-file.ts
    run-shell.ts
  permission.ts
```

要求：

1. CLI 接收一句 prompt。
2. Session 保存 messages 到内存数组。
3. LLM 先用 fake client：如果用户说 “read package”，就返回 `read_file` tool call。
4. Tool 执行后把结果写回 messages。
5. Loop 再调用 fake LLM，让它输出最终回答。

## 14. 源码追踪任务

请你按下面顺序打开源码，并在旁边写一句“mini agent 里对应什么”：

1. `packages/opencode/src/cli/cmd/run.ts:768-803`

  <details class="source-ref source-ref--inline">
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

2. `packages/opencode/src/session/prompt.ts:1211-1230`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1211-1230</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1211</span><span class="source-line-text">    const prompt: (input: PromptInput) =&gt; Effect.Effect&lt;MessageV2.WithParts, Image.Error&gt; = Effect.fn(</span></span>
  <span class="source-line"><span class="source-line-number">1212</span><span class="source-line-text">      &quot;SessionPrompt.prompt&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1213</span><span class="source-line-text">    )(function* (input: PromptInput) {</span></span>
  <span class="source-line"><span class="source-line-number">1214</span><span class="source-line-text">      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)</span></span>
  <span class="source-line"><span class="source-line-number">1215</span><span class="source-line-text">      yield* revert.cleanup(session)</span></span>
  <span class="source-line"><span class="source-line-number">1216</span><span class="source-line-text">      const message = yield* createUserMessage(input)</span></span>
  <span class="source-line"><span class="source-line-number">1217</span><span class="source-line-text">      yield* sessions.touch(input.sessionID)</span></span>
  <span class="source-line"><span class="source-line-number">1218</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1219</span><span class="source-line-text">      const permissions: Permission.Ruleset = []</span></span>
  <span class="source-line"><span class="source-line-number">1220</span><span class="source-line-text">      for (const [t, enabled] of Object.entries(input.tools ?? {})) {</span></span>
  <span class="source-line"><span class="source-line-number">1221</span><span class="source-line-text">        permissions.push({ permission: t, action: enabled ? &quot;allow&quot; : &quot;deny&quot;, pattern: &quot;*&quot; })</span></span>
  <span class="source-line"><span class="source-line-number">1222</span><span class="source-line-text">      }</span></span>
  <span class="source-line"><span class="source-line-number">1223</span><span class="source-line-text">      if (permissions.length &gt; 0) {</span></span>
  <span class="source-line"><span class="source-line-number">1224</span><span class="source-line-text">        session.permission = permissions</span></span>
  <span class="source-line"><span class="source-line-number">1225</span><span class="source-line-text">        yield* sessions.setPermission({ sessionID: session.id, permission: permissions })</span></span>
  <span class="source-line"><span class="source-line-number">1226</span><span class="source-line-text">      }</span></span>
  <span class="source-line"><span class="source-line-number">1227</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1228</span><span class="source-line-text">      if (input.noReply === true) return message</span></span>
  <span class="source-line"><span class="source-line-number">1229</span><span class="source-line-text">      return yield* loop({ sessionID: input.sessionID })</span></span>
  <span class="source-line"><span class="source-line-number">1230</span><span class="source-line-text">    })</span></span></code></pre>
  </details>

3. `packages/opencode/src/session/prompt.ts:1248-1489`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1248-1489</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1248</span><span class="source-line-text">        while (true) {</span></span>
  <span class="source-line"><span class="source-line-number">1249</span><span class="source-line-text">          yield* status.set(sessionID, { type: &quot;busy&quot; })</span></span>
  <span class="source-line"><span class="source-line-number">1250</span><span class="source-line-text">          yield* slog.info(&quot;loop&quot;, { step })</span></span>
  <span class="source-line"><span class="source-line-number">1251</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1252</span><span class="source-line-text">          let msgs = yield* MessageV2.filterCompactedEffect(sessionID)</span></span>
  <span class="source-line"><span class="source-line-number">1253</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1254</span><span class="source-line-text">          const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)</span></span>
  <span class="source-line"><span class="source-line-number">1255</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1256</span><span class="source-line-text">          if (!lastUser) throw new Error(&quot;No user message found in stream. This should never happen.&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">1257</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1258</span><span class="source-line-text">          const lastAssistantMsg = msgs.findLast(</span></span>
  <span class="source-line"><span class="source-line-number">1259</span><span class="source-line-text">            (msg) =&gt; msg.info.role === &quot;assistant&quot; &amp;&amp; msg.info.id === lastAssistant?.id,</span></span>
  <span class="source-line"><span class="source-line-number">1260</span><span class="source-line-text">          )</span></span>
  <span class="source-line"><span class="source-line-number">1261</span><span class="source-line-text">          // Some providers return &quot;stop&quot; even when the assistant message contains tool calls.</span></span>
  <span class="source-line"><span class="source-line-number">1262</span><span class="source-line-text">          // Keep the loop running so tool results can be sent back to the model.</span></span>
  <span class="source-line"><span class="source-line-number">1263</span><span class="source-line-text">          // Skip provider-executed tool parts — those were fully handled within the</span></span>
  <span class="source-line"><span class="source-line-number">1264</span><span class="source-line-text">          // provider's stream (e.g. DWS Agent Platform) and don't need a re-loop.</span></span>
  <span class="source-line"><span class="source-line-number">1265</span><span class="source-line-text">          const hasToolCalls =</span></span>
  <span class="source-line"><span class="source-line-number">1266</span><span class="source-line-text">            lastAssistantMsg?.parts.some((part) =&gt; part.type === &quot;tool&quot; &amp;&amp; !part.metadata?.providerExecuted) ?? false</span></span>
  <span class="source-line"><span class="source-line-number">1267</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1268</span><span class="source-line-text">          if (</span></span>
  <span class="source-line"><span class="source-line-number">1269</span><span class="source-line-text">            lastAssistant?.finish &amp;&amp;</span></span>
  <span class="source-line"><span class="source-line-number">1270</span><span class="source-line-text">            ![&quot;tool-calls&quot;].includes(lastAssistant.finish) &amp;&amp;</span></span>
  <span class="source-line"><span class="source-line-number">1271</span><span class="source-line-text">            !hasToolCalls &amp;&amp;</span></span>
  <span class="source-line"><span class="source-line-number">1272</span><span class="source-line-text">            lastUser.id &lt; lastAssistant.id</span></span>
  <span class="source-line"><span class="source-line-number">1273</span><span class="source-line-text">          ) {</span></span>
  <span class="source-line"><span class="source-line-number">1274</span><span class="source-line-text">            yield* slog.info(&quot;exiting loop&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">1275</span><span class="source-line-text">            break</span></span>
  <span class="source-line"><span class="source-line-number">1276</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1277</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1278</span><span class="source-line-text">          step++</span></span>
  <span class="source-line"><span class="source-line-number">1279</span><span class="source-line-text">          if (step === 1)</span></span>
  <span class="source-line"><span class="source-line-number">1280</span><span class="source-line-text">            yield* title({</span></span>
  <span class="source-line"><span class="source-line-number">1281</span><span class="source-line-text">              session,</span></span>
  <span class="source-line"><span class="source-line-number">1282</span><span class="source-line-text">              modelID: lastUser.model.modelID,</span></span>
  <span class="source-line"><span class="source-line-number">1283</span><span class="source-line-text">              providerID: lastUser.model.providerID,</span></span>
  <span class="source-line"><span class="source-line-number">1284</span><span class="source-line-text">              history: msgs,</span></span>
  <span class="source-line"><span class="source-line-number">1285</span><span class="source-line-text">            }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
  <span class="source-line"><span class="source-line-number">1286</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1287</span><span class="source-line-text">          const model = yield* getModel(lastUser.model.providerID, lastUser.model.modelID, sessionID)</span></span>
  <span class="source-line"><span class="source-line-number">1288</span><span class="source-line-text">          const task = tasks.pop()</span></span>
  <span class="source-line"><span class="source-line-number">1289</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1290</span><span class="source-line-text">          if (task?.type === &quot;subtask&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">1291</span><span class="source-line-text">            yield* handleSubtask({ task, model, lastUser, sessionID, session, msgs })</span></span>
  <span class="source-line"><span class="source-line-number">1292</span><span class="source-line-text">            continue</span></span>
  <span class="source-line"><span class="source-line-number">1293</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1294</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1295</span><span class="source-line-text">          if (task?.type === &quot;compaction&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">1296</span><span class="source-line-text">            const result = yield* compaction.process({</span></span>
  <span class="source-line"><span class="source-line-number">1297</span><span class="source-line-text">              messages: msgs,</span></span>
  <span class="source-line"><span class="source-line-number">1298</span><span class="source-line-text">              parentID: lastUser.id,</span></span>
  <span class="source-line"><span class="source-line-number">1299</span><span class="source-line-text">              sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1300</span><span class="source-line-text">              auto: task.auto,</span></span>
  <span class="source-line"><span class="source-line-number">1301</span><span class="source-line-text">              overflow: task.overflow,</span></span>
  <span class="source-line"><span class="source-line-number">1302</span><span class="source-line-text">            })</span></span>
  <span class="source-line"><span class="source-line-number">1303</span><span class="source-line-text">            if (result === &quot;stop&quot;) break</span></span>
  <span class="source-line"><span class="source-line-number">1304</span><span class="source-line-text">            continue</span></span>
  <span class="source-line"><span class="source-line-number">1305</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1306</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1307</span><span class="source-line-text">          if (</span></span>
  <span class="source-line"><span class="source-line-number">1308</span><span class="source-line-text">            lastFinished &amp;&amp;</span></span>
  <span class="source-line"><span class="source-line-number">1309</span><span class="source-line-text">            lastFinished.summary !== true &amp;&amp;</span></span>
  <span class="source-line"><span class="source-line-number">1310</span><span class="source-line-text">            (yield* compaction.isOverflow({ tokens: lastFinished.tokens, model }))</span></span>
  <span class="source-line"><span class="source-line-number">1311</span><span class="source-line-text">          ) {</span></span>
  <span class="source-line"><span class="source-line-number">1312</span><span class="source-line-text">            yield* compaction.create({ sessionID, agent: lastUser.agent, model: lastUser.model, auto: true })</span></span>
  <span class="source-line"><span class="source-line-number">1313</span><span class="source-line-text">            continue</span></span>
  <span class="source-line"><span class="source-line-number">1314</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1315</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1316</span><span class="source-line-text">          const agent = yield* agents.get(lastUser.agent)</span></span>
  <span class="source-line"><span class="source-line-number">1317</span><span class="source-line-text">          if (!agent) {</span></span>
  <span class="source-line"><span class="source-line-number">1318</span><span class="source-line-text">            const available = (yield* agents.list()).filter((a) =&gt; !a.hidden).map((a) =&gt; a.name)</span></span>
  <span class="source-line"><span class="source-line-number">1319</span><span class="source-line-text">            const hint = available.length ? ` Available agents: ${available.join(&quot;, &quot;)}` : &quot;&quot;</span></span>
  <span class="source-line"><span class="source-line-number">1320</span><span class="source-line-text">            const error = new NamedError.Unknown({ message: `Agent not found: &quot;${lastUser.agent}&quot;.${hint}` })</span></span>
  <span class="source-line"><span class="source-line-number">1321</span><span class="source-line-text">            yield* bus.publish(Session.Event.Error, { sessionID, error: error.toObject() })</span></span>
  <span class="source-line"><span class="source-line-number">1322</span><span class="source-line-text">            throw error</span></span>
  <span class="source-line"><span class="source-line-number">1323</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1324</span><span class="source-line-text">          const maxSteps = agent.steps ?? Infinity</span></span>
  <span class="source-line"><span class="source-line-number">1325</span><span class="source-line-text">          const isLastStep = step &gt;= maxSteps</span></span>
  <span class="source-line"><span class="source-line-number">1326</span><span class="source-line-text">          msgs = yield* SessionReminders.apply({ messages: msgs, agent, session }).pipe(</span></span>
  <span class="source-line"><span class="source-line-number">1327</span><span class="source-line-text">            Effect.provideService(RuntimeFlags.Service, flags),</span></span>
  <span class="source-line"><span class="source-line-number">1328</span><span class="source-line-text">            Effect.provideService(AppFileSystem.Service, fsys),</span></span>
  <span class="source-line"><span class="source-line-number">1329</span><span class="source-line-text">            Effect.provideService(Session.Service, sessions),</span></span>
  <span class="source-line"><span class="source-line-number">1330</span><span class="source-line-text">          )</span></span>
  <span class="source-line"><span class="source-line-number">1331</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1332</span><span class="source-line-text">          const msg: MessageV2.Assistant = {</span></span>
  <span class="source-line"><span class="source-line-number">1333</span><span class="source-line-text">            id: MessageID.ascending(),</span></span>
  <span class="source-line"><span class="source-line-number">1334</span><span class="source-line-text">            parentID: lastUser.id,</span></span>
  <span class="source-line"><span class="source-line-number">1335</span><span class="source-line-text">            role: &quot;assistant&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1336</span><span class="source-line-text">            mode: agent.name,</span></span>
  <span class="source-line"><span class="source-line-number">1337</span><span class="source-line-text">            agent: agent.name,</span></span>
  <span class="source-line"><span class="source-line-number">1338</span><span class="source-line-text">            variant: lastUser.model.variant,</span></span>
  <span class="source-line"><span class="source-line-number">1339</span><span class="source-line-text">            path: { cwd: ctx.directory, root: ctx.worktree },</span></span>
  <span class="source-line"><span class="source-line-number">1340</span><span class="source-line-text">            cost: 0,</span></span>
  <span class="source-line"><span class="source-line-number">1341</span><span class="source-line-text">            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },</span></span>
  <span class="source-line"><span class="source-line-number">1342</span><span class="source-line-text">            modelID: model.id,</span></span>
  <span class="source-line"><span class="source-line-number">1343</span><span class="source-line-text">            providerID: model.providerID,</span></span>
  <span class="source-line"><span class="source-line-number">1344</span><span class="source-line-text">            time: { created: Date.now() },</span></span>
  <span class="source-line"><span class="source-line-number">1345</span><span class="source-line-text">            sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1346</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1347</span><span class="source-line-text">          yield* sessions.updateMessage(msg)</span></span>
  <span class="source-line"><span class="source-line-number">1348</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1349</span><span class="source-line-text">          const finalizeInterruptedAssistant = Effect.gen(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">1350</span><span class="source-line-text">            if (msg.time.completed) return</span></span>
  <span class="source-line"><span class="source-line-number">1351</span><span class="source-line-text">            msg.error ??= MessageV2.fromError(new DOMException(&quot;Aborted&quot;, &quot;AbortError&quot;), {</span></span>
  <span class="source-line"><span class="source-line-number">1352</span><span class="source-line-text">              providerID: msg.providerID,</span></span>
  <span class="source-line"><span class="source-line-number">1353</span><span class="source-line-text">              aborted: true,</span></span>
  <span class="source-line"><span class="source-line-number">1354</span><span class="source-line-text">            })</span></span>
  <span class="source-line"><span class="source-line-number">1355</span><span class="source-line-text">            msg.time.completed = Date.now()</span></span>
  <span class="source-line"><span class="source-line-number">1356</span><span class="source-line-text">            yield* sessions.updateMessage(msg)</span></span>
  <span class="source-line"><span class="source-line-number">1357</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">1358</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1359</span><span class="source-line-text">          const handle = yield* processor</span></span>
  <span class="source-line"><span class="source-line-number">1360</span><span class="source-line-text">            .create({</span></span>
  <span class="source-line"><span class="source-line-number">1361</span><span class="source-line-text">              assistantMessage: msg,</span></span>
  <span class="source-line"><span class="source-line-number">1362</span><span class="source-line-text">              sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1363</span><span class="source-line-text">              model,</span></span>
  <span class="source-line"><span class="source-line-number">1364</span><span class="source-line-text">            })</span></span>
  <span class="source-line"><span class="source-line-number">1365</span><span class="source-line-text">            .pipe(Effect.onInterrupt(() =&gt; finalizeInterruptedAssistant))</span></span>
  <span class="source-line"><span class="source-line-number">1366</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1367</span><span class="source-line-text">          const outcome: &quot;break&quot; | &quot;continue&quot; = yield* Effect.gen(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">1368</span><span class="source-line-text">            const lastUserMsg = msgs.findLast((m) =&gt; m.info.role === &quot;user&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">1369</span><span class="source-line-text">            const bypassAgentCheck = lastUserMsg?.parts.some((p) =&gt; p.type === &quot;agent&quot;) ?? false</span></span>
  <span class="source-line"><span class="source-line-number">1370</span><span class="source-line-text">            const promptOps = yield* ops()</span></span>
  <span class="source-line"><span class="source-line-number">1371</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1372</span><span class="source-line-text">            const tools = yield* SessionTools.resolve({</span></span>
  <span class="source-line"><span class="source-line-number">1373</span><span class="source-line-text">              agent,</span></span>
  <span class="source-line"><span class="source-line-number">1374</span><span class="source-line-text">              session,</span></span>
  <span class="source-line"><span class="source-line-number">1375</span><span class="source-line-text">              model,</span></span>
  <span class="source-line"><span class="source-line-number">1376</span><span class="source-line-text">              processor: handle,</span></span>
  <span class="source-line"><span class="source-line-number">1377</span><span class="source-line-text">              bypassAgentCheck,</span></span>
  <span class="source-line"><span class="source-line-number">1378</span><span class="source-line-text">              messages: msgs,</span></span>
  <span class="source-line"><span class="source-line-number">1379</span><span class="source-line-text">              promptOps,</span></span>
  <span class="source-line"><span class="source-line-number">1380</span><span class="source-line-text">            }).pipe(</span></span>
  <span class="source-line"><span class="source-line-number">1381</span><span class="source-line-text">              Effect.provideService(Plugin.Service, plugin),</span></span>
  <span class="source-line"><span class="source-line-number">1382</span><span class="source-line-text">              Effect.provideService(Permission.Service, permission),</span></span>
  <span class="source-line"><span class="source-line-number">1383</span><span class="source-line-text">              Effect.provideService(ToolRegistry.Service, registry),</span></span>
  <span class="source-line"><span class="source-line-number">1384</span><span class="source-line-text">              Effect.provideService(MCP.Service, mcp),</span></span>
  <span class="source-line"><span class="source-line-number">1385</span><span class="source-line-text">              Effect.provideService(Truncate.Service, truncate),</span></span>
  <span class="source-line"><span class="source-line-number">1386</span><span class="source-line-text">            )</span></span>
  <span class="source-line"><span class="source-line-number">1387</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1388</span><span class="source-line-text">            if (lastUser.format?.type === &quot;json_schema&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">1389</span><span class="source-line-text">              tools[&quot;StructuredOutput&quot;] = createStructuredOutputTool({</span></span>
  <span class="source-line"><span class="source-line-number">1390</span><span class="source-line-text">                schema: lastUser.format.schema,</span></span>
  <span class="source-line"><span class="source-line-number">1391</span><span class="source-line-text">                onSuccess(output) {</span></span>
  <span class="source-line"><span class="source-line-number">1392</span><span class="source-line-text">                  structured = output</span></span>
  <span class="source-line"><span class="source-line-number">1393</span><span class="source-line-text">                },</span></span>
  <span class="source-line"><span class="source-line-number">1394</span><span class="source-line-text">              })</span></span>
  <span class="source-line"><span class="source-line-number">1395</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">1396</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1397</span><span class="source-line-text">            if (step === 1)</span></span>
  <span class="source-line"><span class="source-line-number">1398</span><span class="source-line-text">              yield* summary.summarize({ sessionID, messageID: lastUser.id }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
  <span class="source-line"><span class="source-line-number">1399</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1400</span><span class="source-line-text">            if (step &gt; 1 &amp;&amp; lastFinished) {</span></span>
  <span class="source-line"><span class="source-line-number">1401</span><span class="source-line-text">              for (const m of msgs) {</span></span>
  <span class="source-line"><span class="source-line-number">1402</span><span class="source-line-text">                if (m.info.role !== &quot;user&quot; || m.info.id &lt;= lastFinished.id) continue</span></span>
  <span class="source-line"><span class="source-line-number">1403</span><span class="source-line-text">                for (const p of m.parts) {</span></span>
  <span class="source-line"><span class="source-line-number">1404</span><span class="source-line-text">                  if (p.type !== &quot;text&quot; || p.ignored || p.synthetic) continue</span></span>
  <span class="source-line"><span class="source-line-number">1405</span><span class="source-line-text">                  if (!p.text.trim()) continue</span></span>
  <span class="source-line"><span class="source-line-number">1406</span><span class="source-line-text">                  p.text = [</span></span>
  <span class="source-line"><span class="source-line-number">1407</span><span class="source-line-text">                    &quot;&lt;system-reminder&gt;&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1408</span><span class="source-line-text">                    &quot;The user sent the following message:&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1409</span><span class="source-line-text">                    p.text,</span></span>
  <span class="source-line"><span class="source-line-number">1410</span><span class="source-line-text">                    &quot;&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1411</span><span class="source-line-text">                    &quot;Please address this message and continue with your tasks.&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1412</span><span class="source-line-text">                    &quot;&lt;/system-reminder&gt;&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1413</span><span class="source-line-text">                  ].join(&quot;\n&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">1414</span><span class="source-line-text">                }</span></span>
  <span class="source-line"><span class="source-line-number">1415</span><span class="source-line-text">              }</span></span>
  <span class="source-line"><span class="source-line-number">1416</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">1417</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1418</span><span class="source-line-text">            yield* plugin.trigger(&quot;experimental.chat.messages.transform&quot;, {}, { messages: msgs })</span></span>
  <span class="source-line"><span class="source-line-number">1419</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1420</span><span class="source-line-text">            const [skills, env, instructions, modelMsgs] = yield* Effect.all([</span></span>
  <span class="source-line"><span class="source-line-number">1421</span><span class="source-line-text">              sys.skills(agent),</span></span>
  <span class="source-line"><span class="source-line-number">1422</span><span class="source-line-text">              sys.environment(model),</span></span>
  <span class="source-line"><span class="source-line-number">1423</span><span class="source-line-text">              instruction.system().pipe(Effect.orDie),</span></span>
  <span class="source-line"><span class="source-line-number">1424</span><span class="source-line-text">              MessageV2.toModelMessagesEffect(msgs, model),</span></span>
  <span class="source-line"><span class="source-line-number">1425</span><span class="source-line-text">            ])</span></span>
  <span class="source-line"><span class="source-line-number">1426</span><span class="source-line-text">            const system = [...env, ...instructions, ...(skills ? [skills] : [])]</span></span>
  <span class="source-line"><span class="source-line-number">1427</span><span class="source-line-text">            const format = lastUser.format ?? { type: &quot;text&quot; as const }</span></span>
  <span class="source-line"><span class="source-line-number">1428</span><span class="source-line-text">            if (format.type === &quot;json_schema&quot;) system.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)</span></span>
  <span class="source-line"><span class="source-line-number">1429</span><span class="source-line-text">            const result = yield* handle.process({</span></span>
  <span class="source-line"><span class="source-line-number">1430</span><span class="source-line-text">              user: lastUser,</span></span>
  <span class="source-line"><span class="source-line-number">1431</span><span class="source-line-text">              agent,</span></span>
  <span class="source-line"><span class="source-line-number">1432</span><span class="source-line-text">              permission: session.permission,</span></span>
  <span class="source-line"><span class="source-line-number">1433</span><span class="source-line-text">              sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1434</span><span class="source-line-text">              parentSessionID: session.parentID,</span></span>
  <span class="source-line"><span class="source-line-number">1435</span><span class="source-line-text">              system,</span></span>
  <span class="source-line"><span class="source-line-number">1436</span><span class="source-line-text">              messages: [...modelMsgs, ...(isLastStep ? [{ role: &quot;assistant&quot; as const, content: MAX_STEPS }] : [])],</span></span>
  <span class="source-line"><span class="source-line-number">1437</span><span class="source-line-text">              tools,</span></span>
  <span class="source-line"><span class="source-line-number">1438</span><span class="source-line-text">              model,</span></span>
  <span class="source-line"><span class="source-line-number">1439</span><span class="source-line-text">              toolChoice: format.type === &quot;json_schema&quot; ? &quot;required&quot; : undefined,</span></span>
  <span class="source-line"><span class="source-line-number">1440</span><span class="source-line-text">            })</span></span>
  <span class="source-line"><span class="source-line-number">1441</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1442</span><span class="source-line-text">            if (structured !== undefined) {</span></span>
  <span class="source-line"><span class="source-line-number">1443</span><span class="source-line-text">              handle.message.structured = structured</span></span>
  <span class="source-line"><span class="source-line-number">1444</span><span class="source-line-text">              handle.message.finish = handle.message.finish ?? &quot;stop&quot;</span></span>
  <span class="source-line"><span class="source-line-number">1445</span><span class="source-line-text">              yield* sessions.updateMessage(handle.message)</span></span>
  <span class="source-line"><span class="source-line-number">1446</span><span class="source-line-text">              return &quot;break&quot; as const</span></span>
  <span class="source-line"><span class="source-line-number">1447</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">1448</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1449</span><span class="source-line-text">            const finished = handle.message.finish &amp;&amp; ![&quot;tool-calls&quot;, &quot;unknown&quot;].includes(handle.message.finish)</span></span>
  <span class="source-line"><span class="source-line-number">1450</span><span class="source-line-text">            if (finished &amp;&amp; !handle.message.error) {</span></span>
  <span class="source-line"><span class="source-line-number">1451</span><span class="source-line-text">              if (format.type === &quot;json_schema&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">1452</span><span class="source-line-text">                handle.message.error = new MessageV2.StructuredOutputError({</span></span>
  <span class="source-line"><span class="source-line-number">1453</span><span class="source-line-text">                  message: &quot;Model did not produce structured output&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1454</span><span class="source-line-text">                  retries: 0,</span></span>
  <span class="source-line"><span class="source-line-number">1455</span><span class="source-line-text">                }).toObject()</span></span>
  <span class="source-line"><span class="source-line-number">1456</span><span class="source-line-text">                yield* sessions.updateMessage(handle.message)</span></span>
  <span class="source-line"><span class="source-line-number">1457</span><span class="source-line-text">                return &quot;break&quot; as const</span></span>
  <span class="source-line"><span class="source-line-number">1458</span><span class="source-line-text">              }</span></span>
  <span class="source-line"><span class="source-line-number">1459</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">1460</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1461</span><span class="source-line-text">            if (result === &quot;stop&quot;) return &quot;break&quot; as const</span></span>
  <span class="source-line"><span class="source-line-number">1462</span><span class="source-line-text">            if (result === &quot;compact&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">1463</span><span class="source-line-text">              yield* compaction.create({</span></span>
  <span class="source-line"><span class="source-line-number">1464</span><span class="source-line-text">                sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1465</span><span class="source-line-text">                agent: lastUser.agent,</span></span>
  <span class="source-line"><span class="source-line-number">1466</span><span class="source-line-text">                model: lastUser.model,</span></span>
  <span class="source-line"><span class="source-line-number">1467</span><span class="source-line-text">                auto: true,</span></span>
  <span class="source-line"><span class="source-line-number">1468</span><span class="source-line-text">                overflow: !handle.message.finish,</span></span>
  <span class="source-line"><span class="source-line-number">1469</span><span class="source-line-text">              })</span></span>
  <span class="source-line"><span class="source-line-number">1470</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">1471</span><span class="source-line-text">            return &quot;continue&quot; as const</span></span>
  <span class="source-line"><span class="source-line-number">1472</span><span class="source-line-text">          }).pipe(</span></span>
  <span class="source-line"><span class="source-line-number">1473</span><span class="source-line-text">            Effect.ensuring(instruction.clear(handle.message.id)),</span></span>
  <span class="source-line"><span class="source-line-number">1474</span><span class="source-line-text">            Effect.onInterrupt(() =&gt; finalizeInterruptedAssistant),</span></span>
  <span class="source-line"><span class="source-line-number">1475</span><span class="source-line-text">          )</span></span>
  <span class="source-line"><span class="source-line-number">1476</span><span class="source-line-text">          if (outcome === &quot;break&quot;) break</span></span>
  <span class="source-line"><span class="source-line-number">1477</span><span class="source-line-text">          continue</span></span>
  <span class="source-line"><span class="source-line-number">1478</span><span class="source-line-text">        }</span></span>
  <span class="source-line"><span class="source-line-number">1479</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1480</span><span class="source-line-text">        yield* compaction.prune({ sessionID }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
  <span class="source-line"><span class="source-line-number">1481</span><span class="source-line-text">        return yield* lastAssistant(sessionID)</span></span>
  <span class="source-line"><span class="source-line-number">1482</span><span class="source-line-text">      },</span></span>
  <span class="source-line"><span class="source-line-number">1483</span><span class="source-line-text">    )</span></span>
  <span class="source-line"><span class="source-line-number">1484</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1485</span><span class="source-line-text">    const loop: (input: LoopInput) =&gt; Effect.Effect&lt;MessageV2.WithParts&gt; = Effect.fn(&quot;SessionPrompt.loop&quot;)(function* (</span></span>
  <span class="source-line"><span class="source-line-number">1486</span><span class="source-line-text">      input: LoopInput,</span></span>
  <span class="source-line"><span class="source-line-number">1487</span><span class="source-line-text">    ) {</span></span>
  <span class="source-line"><span class="source-line-number">1488</span><span class="source-line-text">      return yield* state.ensureRunning(input.sessionID, lastAssistant(input.sessionID), runLoop(input.sessionID))</span></span>
  <span class="source-line"><span class="source-line-number">1489</span><span class="source-line-text">    })</span></span></code></pre>
  </details>

4. `packages/opencode/src/session/llm.ts:39-60`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/llm.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/llm.ts:39-60</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">export type StreamInput = {</span></span>
  <span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  user: MessageV2.User</span></span>
  <span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">  sessionID: string</span></span>
  <span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  parentSessionID?: string</span></span>
  <span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  model: Provider.Model</span></span>
  <span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  agent: Agent.Info</span></span>
  <span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">  permission?: Permission.Ruleset</span></span>
  <span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">  system: string[]</span></span>
  <span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">  messages: ModelMessage[]</span></span>
  <span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">  small?: boolean</span></span>
  <span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">  tools: Record&lt;string, Tool&gt;</span></span>
  <span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">  retries?: number</span></span>
  <span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">  toolChoice?: &quot;auto&quot; | &quot;required&quot; | &quot;none&quot;</span></span>
  <span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">}</span></span>
  <span class="source-line"><span class="source-line-number">53</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">export type StreamRequest = StreamInput &amp; {</span></span>
  <span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">  abort: AbortSignal</span></span>
  <span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">}</span></span>
  <span class="source-line"><span class="source-line-number">57</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">export interface Interface {</span></span>
  <span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">  readonly stream: (input: StreamInput) =&gt; Stream.Stream&lt;LLMEvent, unknown&gt;</span></span>
  <span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">}</span></span></code></pre>
  </details>

5. `packages/opencode/src/tool/tool.ts:16-45`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/tool/tool.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/tool/tool.ts:16-45</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">export type Context&lt;M extends Metadata = Metadata&gt; = {</span></span>
  <span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  sessionID: SessionID</span></span>
  <span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">  messageID: MessageID</span></span>
  <span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">  agent: string</span></span>
  <span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">  abort: AbortSignal</span></span>
  <span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">  callID?: string</span></span>
  <span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">  extra?: { [key: string]: unknown }</span></span>
  <span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  messages: MessageV2.WithParts[]</span></span>
  <span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">  metadata(input: { title?: string; metadata?: M }): Effect.Effect&lt;void&gt;</span></span>
  <span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">  ask(input: Omit&lt;Permission.Request, &quot;id&quot; | &quot;sessionID&quot; | &quot;tool&quot;&gt;): Effect.Effect&lt;void&gt;</span></span>
  <span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">}</span></span>
  <span class="source-line"><span class="source-line-number">27</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">export interface ExecuteResult&lt;M extends Metadata = Metadata&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">  title: string</span></span>
  <span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">  metadata: M</span></span>
  <span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">  output: string</span></span>
  <span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">  attachments?: Omit&lt;MessageV2.FilePart, &quot;id&quot; | &quot;sessionID&quot; | &quot;messageID&quot;&gt;[]</span></span>
  <span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">}</span></span>
  <span class="source-line"><span class="source-line-number">34</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">export interface Def&lt;</span></span>
  <span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  Parameters extends Schema.Decoder&lt;unknown&gt; = Schema.Decoder&lt;unknown&gt;,</span></span>
  <span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">  M extends Metadata = Metadata,</span></span>
  <span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  id: string</span></span>
  <span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  description: string</span></span>
  <span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">  parameters: Parameters</span></span>
  <span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  jsonSchema?: JSONSchema7</span></span>
  <span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  execute(args: Schema.Schema.Type&lt;Parameters&gt;, ctx: Context): Effect.Effect&lt;ExecuteResult&lt;M&gt;&gt;</span></span>
  <span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  formatValidationError?(error: unknown): string</span></span>
  <span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">}</span></span></code></pre>
  </details>

6. `packages/opencode/src/session/tools.ts:42-115`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:42-115</code></span>
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
  <span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">  })</span></span>
  <span class="source-line"><span class="source-line-number">74</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  for (const item of yield* registry.tools({</span></span>
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
  <span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">    })</span></span></code></pre>
  </details>

7. `packages/opencode/src/tool/read.ts:29-39`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/tool/read.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/tool/read.ts:29-39</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">export const Parameters = Schema.Struct({</span></span>
  <span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">  filePath: Schema.String.annotate({ description: &quot;The absolute path to the file or directory to read&quot; }),</span></span>
  <span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">  offset: Schema.optional(NonNegativeInt).annotate({</span></span>
  <span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">    description: &quot;The line number to start reading from (1-indexed)&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">  }),</span></span>
  <span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">  limit: Schema.optional(NonNegativeInt).annotate({</span></span>
  <span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">    description: &quot;The maximum number of lines to read (defaults to 2000)&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  }),</span></span>
  <span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">})</span></span>
  <span class="source-line"><span class="source-line-number">38</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">export const ReadTool = Tool.define(</span></span></code></pre>
  </details>

8. `packages/opencode/src/tool/edit.ts:47-69`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/tool/edit.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/tool/edit.ts:47-69</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">export const Parameters = Schema.Struct({</span></span>
  <span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">  filePath: Schema.String.annotate({ description: &quot;The absolute path to the file to modify&quot; }),</span></span>
  <span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">  oldString: Schema.String.annotate({ description: &quot;The text to replace&quot; }),</span></span>
  <span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">  newString: Schema.String.annotate({</span></span>
  <span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">    description: &quot;The text to replace it with (must be different from oldString)&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">  }),</span></span>
  <span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">  replaceAll: Schema.optional(Schema.Boolean).annotate({</span></span>
  <span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">    description: &quot;Replace all occurrences of oldString (default false)&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">  }),</span></span>
  <span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">})</span></span>
  <span class="source-line"><span class="source-line-number">57</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">export const EditTool = Tool.define(</span></span>
  <span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">  &quot;edit&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">  Effect.gen(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">    const lsp = yield* LSP.Service</span></span>
  <span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">    const afs = yield* AppFileSystem.Service</span></span>
  <span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">    const format = yield* Format.Service</span></span>
  <span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    const bus = yield* Bus.Service</span></span>
  <span class="source-line"><span class="source-line-number">65</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">    return {</span></span>
  <span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">      description: DESCRIPTION,</span></span>
  <span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">      parameters: Parameters,</span></span>
  <span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">      execute: (params: Schema.Schema.Type&lt;typeof Parameters&gt;, ctx: Tool.Context) =&gt;</span></span></code></pre>
  </details>

9. `packages/opencode/src/tool/shell.ts:260-287`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/tool/shell.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/tool/shell.ts:260-287</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">const parse = Effect.fn(&quot;ShellTool.parse&quot;)(function* (command: string, ps: boolean) {</span></span>
  <span class="source-line"><span class="source-line-number">261</span><span class="source-line-text">  const tree = yield* Effect.promise(() =&gt; parser().then((p) =&gt; (ps ? p.ps : p.bash).parse(command)))</span></span>
  <span class="source-line"><span class="source-line-number">262</span><span class="source-line-text">  if (!tree) throw new Error(&quot;Failed to parse command&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">  return tree</span></span>
  <span class="source-line"><span class="source-line-number">264</span><span class="source-line-text">})</span></span>
  <span class="source-line"><span class="source-line-number">265</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">const ask = Effect.fn(&quot;ShellTool.ask&quot;)(function* (ctx: Tool.Context, scan: Scan) {</span></span>
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

10. `packages/opencode/src/permission/index.ts:161-195`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:161-195</code></span>
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
  <span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      )</span></span></code></pre>
  </details>

11. `packages/opencode/src/session/processor.ts:451-500`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:451-500</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">          case &quot;tool-result&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">            const toolCall = yield* readToolCall(value.id)</span></span>
  <span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">            const rawOutput = toolResultOutput(value)</span></span>
  <span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">            const normalized = yield* Effect.forEach(rawOutput.attachments ?? [], (attachment) =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">              attachment.mime.startsWith(&quot;image/&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">                ? image.normalize(attachment).pipe(</span></span>
  <span class="source-line"><span class="source-line-number">457</span><span class="source-line-text">                    Effect.catchIf(</span></span>
  <span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">                      (error) =&gt; error instanceof Image.ResizerUnavailableError,</span></span>
  <span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">                      () =&gt; Effect.succeed(attachment),</span></span>
  <span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">                    ),</span></span>
  <span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">                    Effect.exit,</span></span>
  <span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">                  )</span></span>
  <span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">                : Effect.succeed(Exit.succeed&lt;MessageV2.FilePart&gt;(attachment)),</span></span>
  <span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">            )</span></span>
  <span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">            const omitted = normalized.filter(Exit.isFailure).length</span></span>
  <span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">            const attachments = normalized.filter(Exit.isSuccess).map((item) =&gt; item.value)</span></span>
  <span class="source-line"><span class="source-line-number">467</span><span class="source-line-text">            const output = {</span></span>
  <span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">              ...rawOutput,</span></span>
  <span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">              output:</span></span>
  <span class="source-line"><span class="source-line-number">470</span><span class="source-line-text">                omitted === 0</span></span>
  <span class="source-line"><span class="source-line-number">471</span><span class="source-line-text">                  ? rawOutput.output</span></span>
  <span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">                  : `${rawOutput.output}\n\n[${omitted} image${omitted === 1 ? &quot;&quot; : &quot;s&quot;} omitted: could not be resized below the image size limit.]`,</span></span>
  <span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">              attachments: attachments.length ? attachments : undefined,</span></span>
  <span class="source-line"><span class="source-line-number">474</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">            // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
  <span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">            if (flags.experimentalEventSystem) {</span></span>
  <span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">              yield* events.publish(SessionEvent.Tool.Success, {</span></span>
  <span class="source-line"><span class="source-line-number">478</span><span class="source-line-text">                sessionID: ctx.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">479</span><span class="source-line-text">                callID: value.id,</span></span>
  <span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">                structured: output.metadata,</span></span>
  <span class="source-line"><span class="source-line-number">481</span><span class="source-line-text">                content: [</span></span>
  <span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">                  {</span></span>
  <span class="source-line"><span class="source-line-number">483</span><span class="source-line-text">                    type: &quot;text&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">                    text: output.output,</span></span>
  <span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">                  },</span></span>
  <span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">                  ...(output.attachments?.map((item: MessageV2.FilePart) =&gt; ({</span></span>
  <span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">                    type: &quot;file&quot; as const,</span></span>
  <span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">                    uri: item.url,</span></span>
  <span class="source-line"><span class="source-line-number">489</span><span class="source-line-text">                    mime: item.mime,</span></span>
  <span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">                    name: item.filename,</span></span>
  <span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">                  })) ?? []),</span></span>
  <span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">                ],</span></span>
  <span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">                provider: {</span></span>
  <span class="source-line"><span class="source-line-number">494</span><span class="source-line-text">                  executed: value.providerExecuted === true || toolCall?.part.metadata?.providerExecuted === true,</span></span>
  <span class="source-line"><span class="source-line-number">495</span><span class="source-line-text">                },</span></span>
  <span class="source-line"><span class="source-line-number">496</span><span class="source-line-text">                timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
  <span class="source-line"><span class="source-line-number">497</span><span class="source-line-text">              })</span></span>
  <span class="source-line"><span class="source-line-number">498</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">499</span><span class="source-line-text">            yield* completeToolCall(value.id, output)</span></span>
  <span class="source-line"><span class="source-line-number">500</span><span class="source-line-text">            return</span></span></code></pre>
  </details>


## 15. 面试式自测

1. 你如何解释 agent loop 和普通 chatbot 的区别？
2. Tool result 为什么必须进入 message history？
3. Tool registry 为什么比 `if toolName === ...` 更适合扩展？
4. 权限系统为什么不应该写死在 `edit_file` 里？
5. 如果 LLM provider 的 tool schema 格式不同，你会在哪一层做适配？
6. 如果用户在工具执行中途取消，mini agent 至少要清理什么状态？

## 16. 下一步阅读建议

下一步最建议做一个真实小项目：

1. 先写 fake LLM，把 loop 跑通。
2. 再接一个真实 provider，但只开放 `read_file`。
3. 再加 `edit_file` 和权限确认。
4. 最后加 `run_shell` 和测试输出截断。

配置系统本轮没有生成完整章节。如果你希望站点完全覆盖最初的功能大纲，下一章建议补 `10-config-system`，因为它会解释 agent、provider、permission、plugin 的默认值从哪里来。

