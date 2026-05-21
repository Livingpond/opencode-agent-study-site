---
title: "文件读写与代码修改"
description: "理解 read/edit/write 工具如何解析路径、申请权限、修改文件、格式化并触发诊断。"
sidebar:
  label: "06. 文件读写与代码修改"
  order: 6
---

<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">已完成</span></div>
  <div><strong>难度</strong>中等</div>
  <div><strong>预计阅读</strong>40 分钟</div>
  <div><strong>源文件</strong><a href="/markdown/06-file-editing.md"><code>markdown/06-file-editing.md</code></a></div>
</div>

## Agent 生成档案

- 章节 ID：`06-file-editing`
- 章节摘要：理解 read/edit/write 工具如何解析路径、申请权限、修改文件、格式化并触发诊断。
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

<li><code>packages/opencode/src/tool/read.ts</code></li>
<li><code>packages/opencode/src/tool/edit.ts</code></li>
<li><code>packages/opencode/src/tool/write.ts</code></li>
<li><code>packages/opencode/src/file/</code></li>
<li><code>packages/opencode/src/format/</code></li>
<li><code>packages/opencode/src/lsp/lsp.ts</code></li>

</ul>


> 对应模块：`study-output/02-opencode-function-outline.md` 的 “2.6 文件读写与代码修改”。  
> 主要源码：`packages/opencode/src/tool/read.ts`、`edit.ts`、`write.ts`、`external-directory.ts`、`packages/opencode/src/lsp/lsp.ts`。

## 0. 本章学习目标

你会学到：read/edit/write 工具如何定义参数，如何解析相对/绝对路径，如何检查外部目录，如何申请 read/edit 权限，如何写文件、格式化、发布文件事件，以及如何用 LSP diagnostics 反馈给模型。

## 1. 一句话讲明白

文件读写模块是 coding agent 真正改变工程的地方：它把模型的 read/edit/write 意图变成受权限保护、可诊断、可反馈的文件系统操作。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/read.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/read.ts:200-260</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">    const run = Effect.fn(&quot;ReadTool.execute&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">      params: Schema.Schema.Type&lt;typeof Parameters&gt;,</span></span>
<span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">      ctx: Tool.Context,</span></span>
<span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">      const instance = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">      let filepath = params.filePath</span></span>
<span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">      if (!path.isAbsolute(filepath)) {</span></span>
<span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">        filepath = path.resolve(instance.directory, filepath)</span></span>
<span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">209</span><span class="source-line-text">      if (process.platform === &quot;win32&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">        filepath = AppFileSystem.normalizePath(filepath)</span></span>
<span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">      yield* reference.ensure(filepath)</span></span>
<span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">      const title = path.relative(instance.worktree, filepath)</span></span>
<span class="source-line"><span class="source-line-number">214</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">      const stat = yield* fs.stat(filepath).pipe(</span></span>
<span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">        Effect.catchIf(</span></span>
<span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">          (err) =&gt; &quot;reason&quot; in err &amp;&amp; err.reason._tag === &quot;NotFound&quot;,</span></span>
<span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">          () =&gt; Effect.succeed(undefined),</span></span>
<span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">        ),</span></span>
<span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">221</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">      yield* assertExternalDirectoryEffect(ctx, filepath, {</span></span>
<span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">        bypass: Boolean(ctx.extra?.[&quot;bypassCwdCheck&quot;]) || (yield* reference.contains(filepath)),</span></span>
<span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">        kind: stat?.type === &quot;Directory&quot; ? &quot;directory&quot; : &quot;file&quot;,</span></span>
<span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">226</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">      yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">228</span><span class="source-line-text">        permission: &quot;read&quot;,</span></span>
<span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">        patterns: [path.relative(instance.worktree, filepath)],</span></span>
<span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">        always: [&quot;*&quot;],</span></span>
<span class="source-line"><span class="source-line-number">231</span><span class="source-line-text">        metadata: {},</span></span>
<span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">233</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">234</span><span class="source-line-text">      if (!stat) return yield* miss(filepath)</span></span>
<span class="source-line"><span class="source-line-number">235</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">      if (stat.type === &quot;Directory&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">237</span><span class="source-line-text">        const items = yield* list(filepath)</span></span>
<span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">        const limit = params.limit ?? DEFAULT_READ_LIMIT</span></span>
<span class="source-line"><span class="source-line-number">239</span><span class="source-line-text">        const offset = params.offset || 1</span></span>
<span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">        const start = offset - 1</span></span>
<span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">        const sliced = items.slice(start, start + limit)</span></span>
<span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">        const truncated = start + sliced.length &lt; items.length</span></span>
<span class="source-line"><span class="source-line-number">243</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">        return {</span></span>
<span class="source-line"><span class="source-line-number">245</span><span class="source-line-text">          title,</span></span>
<span class="source-line"><span class="source-line-number">246</span><span class="source-line-text">          output: [</span></span>
<span class="source-line"><span class="source-line-number">247</span><span class="source-line-text">            `&lt;path&gt;${filepath}&lt;/path&gt;`,</span></span>
<span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">            `&lt;type&gt;directory&lt;/type&gt;`,</span></span>
<span class="source-line"><span class="source-line-number">249</span><span class="source-line-text">            `&lt;entries&gt;`,</span></span>
<span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">            sliced.join(&quot;\n&quot;),</span></span>
<span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">            truncated</span></span>
<span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">              ? `\n(Showing ${sliced.length} of ${items.length} entries. Use 'offset' parameter to read beyond entry ${offset + sliced.length})`</span></span>
<span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">              : `\n(${items.length} entries)`,</span></span>
<span class="source-line"><span class="source-line-number">254</span><span class="source-line-text">            `&lt;/entries&gt;`,</span></span>
<span class="source-line"><span class="source-line-number">255</span><span class="source-line-text">          ].join(&quot;\n&quot;),</span></span>
<span class="source-line"><span class="source-line-number">256</span><span class="source-line-text">          metadata: {</span></span>
<span class="source-line"><span class="source-line-number">257</span><span class="source-line-text">            preview: sliced.slice(0, 20).join(&quot;\n&quot;),</span></span>
<span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">            truncated,</span></span>
<span class="source-line"><span class="source-line-number">259</span><span class="source-line-text">            loaded: [] as string[],</span></span>
<span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">          },</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/edit.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/edit.ts:88-208</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">          yield* lock(filePath).withPermits(1)(</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">            Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">              if (params.oldString === &quot;&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">                const existed = yield* afs.existsSafe(filePath)</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">                const source = existed ? yield* Bom.readFile(afs, filePath) : { bom: false, text: &quot;&quot; }</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">                const next = Bom.split(params.newString)</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">                const desiredBom = source.bom || next.bom</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">                contentOld = source.text</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">                contentNew = next.text</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">                diff = trimDiff(createTwoFilesPatch(filePath, filePath, contentOld, contentNew))</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">                yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">                  permission: &quot;edit&quot;,</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">                  patterns: [path.relative(instance.worktree, filePath)],</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">                  always: [&quot;*&quot;],</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">                  metadata: {</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">                    filepath: filePath,</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">                    diff,</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">                  },</span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">                yield* afs.writeWithDirs(filePath, Bom.join(contentNew, desiredBom))</span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">                if (yield* format.file(filePath)) {</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">                  contentNew = yield* Bom.syncFile(afs, filePath, desiredBom)</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">                yield* bus.publish(File.Event.Edited, { file: filePath })</span></span>
<span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">                yield* bus.publish(FileWatcher.Event.Updated, {</span></span>
<span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">                  file: filePath,</span></span>
<span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">                  event: existed ? &quot;change&quot; : &quot;add&quot;,</span></span>
<span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">                return</span></span>
<span class="source-line"><span class="source-line-number">117</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">118</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">              const info = yield* afs.stat(filePath).pipe(Effect.catch(() =&gt; Effect.succeed(undefined)))</span></span>
<span class="source-line"><span class="source-line-number">120</span><span class="source-line-text">              if (!info) throw new Error(`File ${filePath} not found`)</span></span>
<span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">              if (info.type === &quot;Directory&quot;) throw new Error(`Path is a directory, not a file: ${filePath}`)</span></span>
<span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">              const source = yield* Bom.readFile(afs, filePath)</span></span>
<span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">              contentOld = source.text</span></span>
<span class="source-line"><span class="source-line-number">124</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">125</span><span class="source-line-text">              const ending = detectLineEnding(contentOld)</span></span>
<span class="source-line"><span class="source-line-number">126</span><span class="source-line-text">              const old = convertToLineEnding(normalizeLineEndings(params.oldString), ending)</span></span>
<span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">              const replacement = convertToLineEnding(normalizeLineEndings(params.newString), ending)</span></span>
<span class="source-line"><span class="source-line-number">128</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">              const next = Bom.split(replace(contentOld, old, replacement, params.replaceAll))</span></span>
<span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">              const desiredBom = source.bom || next.bom</span></span>
<span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">              contentNew = next.text</span></span>
<span class="source-line"><span class="source-line-number">132</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">              diff = trimDiff(</span></span>
<span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">                createTwoFilesPatch(</span></span>
<span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">                  filePath,</span></span>
<span class="source-line"><span class="source-line-number">136</span><span class="source-line-text">                  filePath,</span></span>
<span class="source-line"><span class="source-line-number">137</span><span class="source-line-text">                  normalizeLineEndings(contentOld),</span></span>
<span class="source-line"><span class="source-line-number">138</span><span class="source-line-text">                  normalizeLineEndings(contentNew),</span></span>
<span class="source-line"><span class="source-line-number">139</span><span class="source-line-text">                ),</span></span>
<span class="source-line"><span class="source-line-number">140</span><span class="source-line-text">              )</span></span>
<span class="source-line"><span class="source-line-number">141</span><span class="source-line-text">              yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">142</span><span class="source-line-text">                permission: &quot;edit&quot;,</span></span>
<span class="source-line"><span class="source-line-number">143</span><span class="source-line-text">                patterns: [path.relative(instance.worktree, filePath)],</span></span>
<span class="source-line"><span class="source-line-number">144</span><span class="source-line-text">                always: [&quot;*&quot;],</span></span>
<span class="source-line"><span class="source-line-number">145</span><span class="source-line-text">                metadata: {</span></span>
<span class="source-line"><span class="source-line-number">146</span><span class="source-line-text">                  filepath: filePath,</span></span>
<span class="source-line"><span class="source-line-number">147</span><span class="source-line-text">                  diff,</span></span>
<span class="source-line"><span class="source-line-number">148</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">149</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">150</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">151</span><span class="source-line-text">              yield* afs.writeWithDirs(filePath, Bom.join(contentNew, desiredBom))</span></span>
<span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">              if (yield* format.file(filePath)) {</span></span>
<span class="source-line"><span class="source-line-number">153</span><span class="source-line-text">                contentNew = yield* Bom.syncFile(afs, filePath, desiredBom)</span></span>
<span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">              yield* bus.publish(File.Event.Edited, { file: filePath })</span></span>
<span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">              yield* bus.publish(FileWatcher.Event.Updated, {</span></span>
<span class="source-line"><span class="source-line-number">157</span><span class="source-line-text">                file: filePath,</span></span>
<span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">                event: &quot;change&quot;,</span></span>
<span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">              diff = trimDiff(</span></span>
<span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">                createTwoFilesPatch(</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">                  filePath,</span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">                  filePath,</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">                  normalizeLineEndings(contentOld),</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">                  normalizeLineEndings(contentNew),</span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">                ),</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">              )</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">            }).pipe(Effect.orDie),</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">          let additions = 0</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">          let deletions = 0</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">          for (const change of diffLines(contentOld, contentNew)) {</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">            if (change.added) additions += change.count || 0</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">            if (change.removed) deletions += change.count || 0</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">          const filediff: Snapshot.FileDiff = {</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">            file: filePath,</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">            patch: diff,</span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">            additions,</span></span>
<span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">            deletions,</span></span>
<span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">183</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">          yield* ctx.metadata({</span></span>
<span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">            metadata: {</span></span>
<span class="source-line"><span class="source-line-number">186</span><span class="source-line-text">              diff,</span></span>
<span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">              filediff,</span></span>
<span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">              diagnostics: {},</span></span>
<span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">            },</span></span>
<span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">191</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">          let output = &quot;Edit applied successfully.&quot;</span></span>
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
<span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">        }),</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/write.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/write.ts:38-102</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">      execute: (params: { content: string; filePath: string }, ctx: Tool.Context) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">        Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">          const instance = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">          const filepath = path.isAbsolute(params.filePath)</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">            ? params.filePath</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">            : path.join(instance.directory, params.filePath)</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">          yield* assertExternalDirectoryEffect(ctx, filepath)</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">          const exists = yield* fs.existsSafe(filepath)</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">          const source = exists ? yield* Bom.readFile(fs, filepath) : { bom: false, text: &quot;&quot; }</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">          const next = Bom.split(params.content)</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">          const desiredBom = source.bom || next.bom</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">          const contentOld = source.text</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">          const contentNew = next.text</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">          const diff = trimDiff(createTwoFilesPatch(filepath, filepath, contentOld, contentNew))</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">          yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">            permission: &quot;edit&quot;,</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">            patterns: [path.relative(instance.worktree, filepath)],</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">            always: [&quot;*&quot;],</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">            metadata: {</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">              filepath,</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">              diff,</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">            },</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">          yield* fs.writeWithDirs(filepath, Bom.join(contentNew, desiredBom))</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">          if (yield* format.file(filepath)) {</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">            yield* Bom.syncFile(fs, filepath, desiredBom)</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">          yield* bus.publish(File.Event.Edited, { file: filepath })</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">          yield* bus.publish(FileWatcher.Event.Updated, {</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">            file: filepath,</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">            event: exists ? &quot;change&quot; : &quot;add&quot;,</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">          let output = &quot;Wrote file successfully.&quot;</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">          yield* lsp.touchFile(filepath, &quot;document&quot;)</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">          const diagnostics = yield* lsp.diagnostics()</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">          const normalizedFilepath = AppFileSystem.normalizePath(filepath)</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">          let projectDiagnosticsCount = 0</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">          for (const [file, issues] of Object.entries(diagnostics)) {</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">            const current = file === normalizedFilepath</span></span>
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
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">            output,</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">        }).pipe(Effect.orDie),</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">    }</span></span></code></pre>
</details>。

## 2. 它在 OpenCode agent 中的位置

它位于 Tool 系统下面，是最关键的本地能力。`SessionTools.resolve` 把 read/edit/write 暴露给模型；模型发起 tool-call；工具执行时走路径解析、权限、文件操作、格式化、LSP 诊断；结果再写回 `ToolPart`。来源：<details class="source-ref source-ref--inline">
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
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/read.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/read.ts:200-260</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">    const run = Effect.fn(&quot;ReadTool.execute&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">      params: Schema.Schema.Type&lt;typeof Parameters&gt;,</span></span>
<span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">      ctx: Tool.Context,</span></span>
<span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">      const instance = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">      let filepath = params.filePath</span></span>
<span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">      if (!path.isAbsolute(filepath)) {</span></span>
<span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">        filepath = path.resolve(instance.directory, filepath)</span></span>
<span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">209</span><span class="source-line-text">      if (process.platform === &quot;win32&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">        filepath = AppFileSystem.normalizePath(filepath)</span></span>
<span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">      yield* reference.ensure(filepath)</span></span>
<span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">      const title = path.relative(instance.worktree, filepath)</span></span>
<span class="source-line"><span class="source-line-number">214</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">      const stat = yield* fs.stat(filepath).pipe(</span></span>
<span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">        Effect.catchIf(</span></span>
<span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">          (err) =&gt; &quot;reason&quot; in err &amp;&amp; err.reason._tag === &quot;NotFound&quot;,</span></span>
<span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">          () =&gt; Effect.succeed(undefined),</span></span>
<span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">        ),</span></span>
<span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">221</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">      yield* assertExternalDirectoryEffect(ctx, filepath, {</span></span>
<span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">        bypass: Boolean(ctx.extra?.[&quot;bypassCwdCheck&quot;]) || (yield* reference.contains(filepath)),</span></span>
<span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">        kind: stat?.type === &quot;Directory&quot; ? &quot;directory&quot; : &quot;file&quot;,</span></span>
<span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">226</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">      yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">228</span><span class="source-line-text">        permission: &quot;read&quot;,</span></span>
<span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">        patterns: [path.relative(instance.worktree, filepath)],</span></span>
<span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">        always: [&quot;*&quot;],</span></span>
<span class="source-line"><span class="source-line-number">231</span><span class="source-line-text">        metadata: {},</span></span>
<span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">233</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">234</span><span class="source-line-text">      if (!stat) return yield* miss(filepath)</span></span>
<span class="source-line"><span class="source-line-number">235</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">      if (stat.type === &quot;Directory&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">237</span><span class="source-line-text">        const items = yield* list(filepath)</span></span>
<span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">        const limit = params.limit ?? DEFAULT_READ_LIMIT</span></span>
<span class="source-line"><span class="source-line-number">239</span><span class="source-line-text">        const offset = params.offset || 1</span></span>
<span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">        const start = offset - 1</span></span>
<span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">        const sliced = items.slice(start, start + limit)</span></span>
<span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">        const truncated = start + sliced.length &lt; items.length</span></span>
<span class="source-line"><span class="source-line-number">243</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">        return {</span></span>
<span class="source-line"><span class="source-line-number">245</span><span class="source-line-text">          title,</span></span>
<span class="source-line"><span class="source-line-number">246</span><span class="source-line-text">          output: [</span></span>
<span class="source-line"><span class="source-line-number">247</span><span class="source-line-text">            `&lt;path&gt;${filepath}&lt;/path&gt;`,</span></span>
<span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">            `&lt;type&gt;directory&lt;/type&gt;`,</span></span>
<span class="source-line"><span class="source-line-number">249</span><span class="source-line-text">            `&lt;entries&gt;`,</span></span>
<span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">            sliced.join(&quot;\n&quot;),</span></span>
<span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">            truncated</span></span>
<span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">              ? `\n(Showing ${sliced.length} of ${items.length} entries. Use 'offset' parameter to read beyond entry ${offset + sliced.length})`</span></span>
<span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">              : `\n(${items.length} entries)`,</span></span>
<span class="source-line"><span class="source-line-number">254</span><span class="source-line-text">            `&lt;/entries&gt;`,</span></span>
<span class="source-line"><span class="source-line-number">255</span><span class="source-line-text">          ].join(&quot;\n&quot;),</span></span>
<span class="source-line"><span class="source-line-number">256</span><span class="source-line-text">          metadata: {</span></span>
<span class="source-line"><span class="source-line-number">257</span><span class="source-line-text">            preview: sliced.slice(0, 20).join(&quot;\n&quot;),</span></span>
<span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">            truncated,</span></span>
<span class="source-line"><span class="source-line-number">259</span><span class="source-line-text">            loaded: [] as string[],</span></span>
<span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">          },</span></span></code></pre>
</details>。

## 3. 生活类比

像让助理改合同：助理不能直接乱改。它先确认文件在哪里，检查是否越权，展示变更 diff，请你批准，再修改文件，最后跑一遍检查，告诉你还有哪些错误。

## 4. Java 开发者类比

- `ReadTool` / `EditTool` / `WriteTool` 类似三个 Application Service。
- `AppFileSystem` 类似 FileRepository。
- `ctx.ask` 类似审批拦截器。
- `Format.Service` 类似保存后的 formatter hook。
- `LSP.Service` 类似 IDE/编译器诊断服务。
- `Bus.publish(File.Event.Edited)` 类似 domain event。

## 5. 最小源码路径

1. <details class="source-ref source-ref--inline">
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
</details>：read 参数和 tool 定义。
2. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/read.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/read.ts:200-260</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">    const run = Effect.fn(&quot;ReadTool.execute&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">      params: Schema.Schema.Type&lt;typeof Parameters&gt;,</span></span>
<span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">      ctx: Tool.Context,</span></span>
<span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">      const instance = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">      let filepath = params.filePath</span></span>
<span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">      if (!path.isAbsolute(filepath)) {</span></span>
<span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">        filepath = path.resolve(instance.directory, filepath)</span></span>
<span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">209</span><span class="source-line-text">      if (process.platform === &quot;win32&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">        filepath = AppFileSystem.normalizePath(filepath)</span></span>
<span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">      yield* reference.ensure(filepath)</span></span>
<span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">      const title = path.relative(instance.worktree, filepath)</span></span>
<span class="source-line"><span class="source-line-number">214</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">      const stat = yield* fs.stat(filepath).pipe(</span></span>
<span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">        Effect.catchIf(</span></span>
<span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">          (err) =&gt; &quot;reason&quot; in err &amp;&amp; err.reason._tag === &quot;NotFound&quot;,</span></span>
<span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">          () =&gt; Effect.succeed(undefined),</span></span>
<span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">        ),</span></span>
<span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">221</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">      yield* assertExternalDirectoryEffect(ctx, filepath, {</span></span>
<span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">        bypass: Boolean(ctx.extra?.[&quot;bypassCwdCheck&quot;]) || (yield* reference.contains(filepath)),</span></span>
<span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">        kind: stat?.type === &quot;Directory&quot; ? &quot;directory&quot; : &quot;file&quot;,</span></span>
<span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">226</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">      yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">228</span><span class="source-line-text">        permission: &quot;read&quot;,</span></span>
<span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">        patterns: [path.relative(instance.worktree, filepath)],</span></span>
<span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">        always: [&quot;*&quot;],</span></span>
<span class="source-line"><span class="source-line-number">231</span><span class="source-line-text">        metadata: {},</span></span>
<span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">233</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">234</span><span class="source-line-text">      if (!stat) return yield* miss(filepath)</span></span>
<span class="source-line"><span class="source-line-number">235</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">      if (stat.type === &quot;Directory&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">237</span><span class="source-line-text">        const items = yield* list(filepath)</span></span>
<span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">        const limit = params.limit ?? DEFAULT_READ_LIMIT</span></span>
<span class="source-line"><span class="source-line-number">239</span><span class="source-line-text">        const offset = params.offset || 1</span></span>
<span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">        const start = offset - 1</span></span>
<span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">        const sliced = items.slice(start, start + limit)</span></span>
<span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">        const truncated = start + sliced.length &lt; items.length</span></span>
<span class="source-line"><span class="source-line-number">243</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">        return {</span></span>
<span class="source-line"><span class="source-line-number">245</span><span class="source-line-text">          title,</span></span>
<span class="source-line"><span class="source-line-number">246</span><span class="source-line-text">          output: [</span></span>
<span class="source-line"><span class="source-line-number">247</span><span class="source-line-text">            `&lt;path&gt;${filepath}&lt;/path&gt;`,</span></span>
<span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">            `&lt;type&gt;directory&lt;/type&gt;`,</span></span>
<span class="source-line"><span class="source-line-number">249</span><span class="source-line-text">            `&lt;entries&gt;`,</span></span>
<span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">            sliced.join(&quot;\n&quot;),</span></span>
<span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">            truncated</span></span>
<span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">              ? `\n(Showing ${sliced.length} of ${items.length} entries. Use 'offset' parameter to read beyond entry ${offset + sliced.length})`</span></span>
<span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">              : `\n(${items.length} entries)`,</span></span>
<span class="source-line"><span class="source-line-number">254</span><span class="source-line-text">            `&lt;/entries&gt;`,</span></span>
<span class="source-line"><span class="source-line-number">255</span><span class="source-line-text">          ].join(&quot;\n&quot;),</span></span>
<span class="source-line"><span class="source-line-number">256</span><span class="source-line-text">          metadata: {</span></span>
<span class="source-line"><span class="source-line-number">257</span><span class="source-line-text">            preview: sliced.slice(0, 20).join(&quot;\n&quot;),</span></span>
<span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">            truncated,</span></span>
<span class="source-line"><span class="source-line-number">259</span><span class="source-line-text">            loaded: [] as string[],</span></span>
<span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">          },</span></span></code></pre>
</details>：路径解析、外部目录检查、read 权限、目录输出。
3. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/edit.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/edit.ts:47-65</code></span>
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
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text"></span></span></code></pre>
</details>：edit 参数和依赖。
4. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/edit.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/edit.ts:88-160</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">          yield* lock(filePath).withPermits(1)(</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">            Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">              if (params.oldString === &quot;&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">                const existed = yield* afs.existsSafe(filePath)</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">                const source = existed ? yield* Bom.readFile(afs, filePath) : { bom: false, text: &quot;&quot; }</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">                const next = Bom.split(params.newString)</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">                const desiredBom = source.bom || next.bom</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">                contentOld = source.text</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">                contentNew = next.text</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">                diff = trimDiff(createTwoFilesPatch(filePath, filePath, contentOld, contentNew))</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">                yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">                  permission: &quot;edit&quot;,</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">                  patterns: [path.relative(instance.worktree, filePath)],</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">                  always: [&quot;*&quot;],</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">                  metadata: {</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">                    filepath: filePath,</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">                    diff,</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">                  },</span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">                yield* afs.writeWithDirs(filePath, Bom.join(contentNew, desiredBom))</span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">                if (yield* format.file(filePath)) {</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">                  contentNew = yield* Bom.syncFile(afs, filePath, desiredBom)</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">                yield* bus.publish(File.Event.Edited, { file: filePath })</span></span>
<span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">                yield* bus.publish(FileWatcher.Event.Updated, {</span></span>
<span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">                  file: filePath,</span></span>
<span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">                  event: existed ? &quot;change&quot; : &quot;add&quot;,</span></span>
<span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">                return</span></span>
<span class="source-line"><span class="source-line-number">117</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">118</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">              const info = yield* afs.stat(filePath).pipe(Effect.catch(() =&gt; Effect.succeed(undefined)))</span></span>
<span class="source-line"><span class="source-line-number">120</span><span class="source-line-text">              if (!info) throw new Error(`File ${filePath} not found`)</span></span>
<span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">              if (info.type === &quot;Directory&quot;) throw new Error(`Path is a directory, not a file: ${filePath}`)</span></span>
<span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">              const source = yield* Bom.readFile(afs, filePath)</span></span>
<span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">              contentOld = source.text</span></span>
<span class="source-line"><span class="source-line-number">124</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">125</span><span class="source-line-text">              const ending = detectLineEnding(contentOld)</span></span>
<span class="source-line"><span class="source-line-number">126</span><span class="source-line-text">              const old = convertToLineEnding(normalizeLineEndings(params.oldString), ending)</span></span>
<span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">              const replacement = convertToLineEnding(normalizeLineEndings(params.newString), ending)</span></span>
<span class="source-line"><span class="source-line-number">128</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">              const next = Bom.split(replace(contentOld, old, replacement, params.replaceAll))</span></span>
<span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">              const desiredBom = source.bom || next.bom</span></span>
<span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">              contentNew = next.text</span></span>
<span class="source-line"><span class="source-line-number">132</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">              diff = trimDiff(</span></span>
<span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">                createTwoFilesPatch(</span></span>
<span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">                  filePath,</span></span>
<span class="source-line"><span class="source-line-number">136</span><span class="source-line-text">                  filePath,</span></span>
<span class="source-line"><span class="source-line-number">137</span><span class="source-line-text">                  normalizeLineEndings(contentOld),</span></span>
<span class="source-line"><span class="source-line-number">138</span><span class="source-line-text">                  normalizeLineEndings(contentNew),</span></span>
<span class="source-line"><span class="source-line-number">139</span><span class="source-line-text">                ),</span></span>
<span class="source-line"><span class="source-line-number">140</span><span class="source-line-text">              )</span></span>
<span class="source-line"><span class="source-line-number">141</span><span class="source-line-text">              yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">142</span><span class="source-line-text">                permission: &quot;edit&quot;,</span></span>
<span class="source-line"><span class="source-line-number">143</span><span class="source-line-text">                patterns: [path.relative(instance.worktree, filePath)],</span></span>
<span class="source-line"><span class="source-line-number">144</span><span class="source-line-text">                always: [&quot;*&quot;],</span></span>
<span class="source-line"><span class="source-line-number">145</span><span class="source-line-text">                metadata: {</span></span>
<span class="source-line"><span class="source-line-number">146</span><span class="source-line-text">                  filepath: filePath,</span></span>
<span class="source-line"><span class="source-line-number">147</span><span class="source-line-text">                  diff,</span></span>
<span class="source-line"><span class="source-line-number">148</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">149</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">150</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">151</span><span class="source-line-text">              yield* afs.writeWithDirs(filePath, Bom.join(contentNew, desiredBom))</span></span>
<span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">              if (yield* format.file(filePath)) {</span></span>
<span class="source-line"><span class="source-line-number">153</span><span class="source-line-text">                contentNew = yield* Bom.syncFile(afs, filePath, desiredBom)</span></span>
<span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">              yield* bus.publish(File.Event.Edited, { file: filePath })</span></span>
<span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">              yield* bus.publish(FileWatcher.Event.Updated, {</span></span>
<span class="source-line"><span class="source-line-number">157</span><span class="source-line-text">                file: filePath,</span></span>
<span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">                event: &quot;change&quot;,</span></span>
<span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">              diff = trimDiff(</span></span></code></pre>
</details>：diff、审批、写文件、格式化、事件。
5. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/edit.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/edit.ts:192-208</code></span>
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
<span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">        }),</span></span></code></pre>
</details>：LSP diagnostics 反馈。
6. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/write.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/write.ts:20-30</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">export const Parameters = Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">  content: Schema.String.annotate({ description: &quot;The content to write to the file&quot; }),</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">  filePath: Schema.String.annotate({</span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">    description: &quot;The absolute path to the file to write (must be absolute, not relative)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">  }),</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">})</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">export const WriteTool = Tool.define(</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">  &quot;write&quot;,</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">  Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">    const lsp = yield* LSP.Service</span></span></code></pre>
</details>：write 参数和定义。
7. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/write.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/write.ts:38-102</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">      execute: (params: { content: string; filePath: string }, ctx: Tool.Context) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">        Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">          const instance = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">          const filepath = path.isAbsolute(params.filePath)</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">            ? params.filePath</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">            : path.join(instance.directory, params.filePath)</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">          yield* assertExternalDirectoryEffect(ctx, filepath)</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">          const exists = yield* fs.existsSafe(filepath)</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">          const source = exists ? yield* Bom.readFile(fs, filepath) : { bom: false, text: &quot;&quot; }</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">          const next = Bom.split(params.content)</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">          const desiredBom = source.bom || next.bom</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">          const contentOld = source.text</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">          const contentNew = next.text</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">          const diff = trimDiff(createTwoFilesPatch(filepath, filepath, contentOld, contentNew))</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">          yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">            permission: &quot;edit&quot;,</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">            patterns: [path.relative(instance.worktree, filepath)],</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">            always: [&quot;*&quot;],</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">            metadata: {</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">              filepath,</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">              diff,</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">            },</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">          yield* fs.writeWithDirs(filepath, Bom.join(contentNew, desiredBom))</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">          if (yield* format.file(filepath)) {</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">            yield* Bom.syncFile(fs, filepath, desiredBom)</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">          yield* bus.publish(File.Event.Edited, { file: filepath })</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">          yield* bus.publish(FileWatcher.Event.Updated, {</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">            file: filepath,</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">            event: exists ? &quot;change&quot; : &quot;add&quot;,</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">          let output = &quot;Wrote file successfully.&quot;</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">          yield* lsp.touchFile(filepath, &quot;document&quot;)</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">          const diagnostics = yield* lsp.diagnostics()</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">          const normalizedFilepath = AppFileSystem.normalizePath(filepath)</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">          let projectDiagnosticsCount = 0</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">          for (const [file, issues] of Object.entries(diagnostics)) {</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">            const current = file === normalizedFilepath</span></span>
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
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">            output,</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">        }).pipe(Effect.orDie),</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">    }</span></span></code></pre>
</details>：写文件完整流程。
8. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/external-directory.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/external-directory.ts:16-45</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">export const assertExternalDirectoryEffect = Effect.fn(&quot;Tool.assertExternalDirectory&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  ctx: Tool.Context,</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">  target?: string,</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">  options?: Options,</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">) {</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">  if (!target) return</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  if (options?.bypass) return</span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">  const ins = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">  const full = process.platform === &quot;win32&quot; ? AppFileSystem.normalizePath(target) : target</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">  if (containsPath(full, ins)) return</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">  const kind = options?.kind ?? &quot;file&quot;</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">  const dir = kind === &quot;directory&quot; ? full : path.dirname(full)</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">  const glob =</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">    process.platform === &quot;win32&quot;</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">      ? AppFileSystem.normalizePathPattern(path.join(dir, &quot;*&quot;))</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">      : path.join(dir, &quot;*&quot;).replaceAll(&quot;\\&quot;, &quot;/&quot;)</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">    permission: &quot;external_directory&quot;,</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">    patterns: [glob],</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">    always: [glob],</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">    metadata: {</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">      filepath: full,</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">      parentDir: dir,</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">})</span></span></code></pre>
</details>：外部目录审批。
9. <details class="source-ref source-ref--inline">
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
</details>：touchFile/diagnostics。

## 6. 用户输入到 agent 行动的整体链路

```text
model emits read/edit/write tool-call
  -> SessionTools.resolve execute
  -> ReadTool/EditTool/WriteTool.execute
  -> path resolve and external directory check
  -> ctx.ask(read/edit)
  -> fs read/write
  -> format.file for edit/write
  -> File.Event.Edited and FileWatcher.Event.Updated
  -> lsp.touchFile + lsp.diagnostics
  -> ToolResult output to model
```

## 7. 核心源码逐段讲解

### 7.1 ReadTool 参数

```ts
export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({ description: "The absolute path to the file or directory to read" }),
  offset: Schema.optional(NonNegativeInt),
  limit: Schema.optional(NonNegativeInt),
})
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/read.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/read.ts:29-37</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">export const Parameters = Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">  filePath: Schema.String.annotate({ description: &quot;The absolute path to the file or directory to read&quot; }),</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">  offset: Schema.optional(NonNegativeInt).annotate({</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">    description: &quot;The line number to start reading from (1-indexed)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">  }),</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">  limit: Schema.optional(NonNegativeInt).annotate({</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">    description: &quot;The maximum number of lines to read (defaults to 2000)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  }),</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">})</span></span></code></pre>
</details>

读工具支持文件和目录，也支持分页读取。

### 7.2 ReadTool 路径和权限

```ts
let filepath = params.filePath
if (!path.isAbsolute(filepath)) {
  filepath = path.resolve(instance.directory, filepath)
}
yield* assertExternalDirectoryEffect(ctx, filepath, {
  bypass: Boolean(ctx.extra?.["bypassCwdCheck"]) || (yield* reference.contains(filepath)),
  kind: stat?.type === "Directory" ? "directory" : "file",
})

yield* ctx.ask({
  permission: "read",
  patterns: [path.relative(instance.worktree, filepath)],
  always: ["*"],
  metadata: {},
})
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/read.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/read.ts:200-232</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">    const run = Effect.fn(&quot;ReadTool.execute&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">      params: Schema.Schema.Type&lt;typeof Parameters&gt;,</span></span>
<span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">      ctx: Tool.Context,</span></span>
<span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">      const instance = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">      let filepath = params.filePath</span></span>
<span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">      if (!path.isAbsolute(filepath)) {</span></span>
<span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">        filepath = path.resolve(instance.directory, filepath)</span></span>
<span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">209</span><span class="source-line-text">      if (process.platform === &quot;win32&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">        filepath = AppFileSystem.normalizePath(filepath)</span></span>
<span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">      yield* reference.ensure(filepath)</span></span>
<span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">      const title = path.relative(instance.worktree, filepath)</span></span>
<span class="source-line"><span class="source-line-number">214</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">      const stat = yield* fs.stat(filepath).pipe(</span></span>
<span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">        Effect.catchIf(</span></span>
<span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">          (err) =&gt; &quot;reason&quot; in err &amp;&amp; err.reason._tag === &quot;NotFound&quot;,</span></span>
<span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">          () =&gt; Effect.succeed(undefined),</span></span>
<span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">        ),</span></span>
<span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">221</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">      yield* assertExternalDirectoryEffect(ctx, filepath, {</span></span>
<span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">        bypass: Boolean(ctx.extra?.[&quot;bypassCwdCheck&quot;]) || (yield* reference.contains(filepath)),</span></span>
<span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">        kind: stat?.type === &quot;Directory&quot; ? &quot;directory&quot; : &quot;file&quot;,</span></span>
<span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">226</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">      yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">228</span><span class="source-line-text">        permission: &quot;read&quot;,</span></span>
<span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">        patterns: [path.relative(instance.worktree, filepath)],</span></span>
<span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">        always: [&quot;*&quot;],</span></span>
<span class="source-line"><span class="source-line-number">231</span><span class="source-line-text">        metadata: {},</span></span>
<span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">      })</span></span></code></pre>
</details>

这里有两道边界：外部目录审批、read 权限审批。

### 7.3 外部目录检查

```ts
if (options?.bypass) return
const ins = yield* InstanceState.context
if (containsPath(full, ins)) return
const glob = path.join(dir, "*").replaceAll("\\", "/")
yield* ctx.ask({
  permission: "external_directory",
  patterns: [glob],
  always: [glob],
  metadata: { filepath: full, parentDir: dir },
})
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/external-directory.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/external-directory.ts:16-45</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">export const assertExternalDirectoryEffect = Effect.fn(&quot;Tool.assertExternalDirectory&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  ctx: Tool.Context,</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">  target?: string,</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">  options?: Options,</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">) {</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">  if (!target) return</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  if (options?.bypass) return</span></span>
<span class="source-line"><span class="source-line-number">24</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">  const ins = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">  const full = process.platform === &quot;win32&quot; ? AppFileSystem.normalizePath(target) : target</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">  if (containsPath(full, ins)) return</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">  const kind = options?.kind ?? &quot;file&quot;</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">  const dir = kind === &quot;directory&quot; ? full : path.dirname(full)</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">  const glob =</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">    process.platform === &quot;win32&quot;</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">      ? AppFileSystem.normalizePathPattern(path.join(dir, &quot;*&quot;))</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">      : path.join(dir, &quot;*&quot;).replaceAll(&quot;\\&quot;, &quot;/&quot;)</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">    permission: &quot;external_directory&quot;,</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">    patterns: [glob],</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">    always: [glob],</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">    metadata: {</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">      filepath: full,</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">      parentDir: dir,</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">    },</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">})</span></span></code></pre>
</details>

这说明 prompt 里说“不要乱访问外部目录”不够，runtime 必须 enforce。

### 7.4 EditTool 参数

```ts
export const Parameters = Schema.Struct({
  filePath: Schema.String,
  oldString: Schema.String,
  newString: Schema.String,
  replaceAll: Schema.optional(Schema.Boolean),
})
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/edit.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/edit.ts:47-56</code></span>
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
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">})</span></span></code></pre>
</details>

Edit 是基于 oldString/newString 的替换式修改，不是直接让模型传 patch 字符串。

### 7.5 EditTool diff 和审批

```ts
diff = trimDiff(createTwoFilesPatch(filePath, filePath, contentOld, contentNew))
yield* ctx.ask({
  permission: "edit",
  patterns: [path.relative(instance.worktree, filePath)],
  always: ["*"],
  metadata: {
    filepath: filePath,
    diff,
  },
})
yield* afs.writeWithDirs(filePath, Bom.join(contentNew, desiredBom))
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/edit.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/edit.ts:90-107</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">              if (params.oldString === &quot;&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">                const existed = yield* afs.existsSafe(filePath)</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">                const source = existed ? yield* Bom.readFile(afs, filePath) : { bom: false, text: &quot;&quot; }</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">                const next = Bom.split(params.newString)</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">                const desiredBom = source.bom || next.bom</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">                contentOld = source.text</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">                contentNew = next.text</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">                diff = trimDiff(createTwoFilesPatch(filePath, filePath, contentOld, contentNew))</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">                yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">                  permission: &quot;edit&quot;,</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">                  patterns: [path.relative(instance.worktree, filePath)],</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">                  always: [&quot;*&quot;],</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">                  metadata: {</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">                    filepath: filePath,</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">                    diff,</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">                  },</span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">                yield* afs.writeWithDirs(filePath, Bom.join(contentNew, desiredBom))</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/edit.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/edit.ts:133-151</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">              diff = trimDiff(</span></span>
<span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">                createTwoFilesPatch(</span></span>
<span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">                  filePath,</span></span>
<span class="source-line"><span class="source-line-number">136</span><span class="source-line-text">                  filePath,</span></span>
<span class="source-line"><span class="source-line-number">137</span><span class="source-line-text">                  normalizeLineEndings(contentOld),</span></span>
<span class="source-line"><span class="source-line-number">138</span><span class="source-line-text">                  normalizeLineEndings(contentNew),</span></span>
<span class="source-line"><span class="source-line-number">139</span><span class="source-line-text">                ),</span></span>
<span class="source-line"><span class="source-line-number">140</span><span class="source-line-text">              )</span></span>
<span class="source-line"><span class="source-line-number">141</span><span class="source-line-text">              yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">142</span><span class="source-line-text">                permission: &quot;edit&quot;,</span></span>
<span class="source-line"><span class="source-line-number">143</span><span class="source-line-text">                patterns: [path.relative(instance.worktree, filePath)],</span></span>
<span class="source-line"><span class="source-line-number">144</span><span class="source-line-text">                always: [&quot;*&quot;],</span></span>
<span class="source-line"><span class="source-line-number">145</span><span class="source-line-text">                metadata: {</span></span>
<span class="source-line"><span class="source-line-number">146</span><span class="source-line-text">                  filepath: filePath,</span></span>
<span class="source-line"><span class="source-line-number">147</span><span class="source-line-text">                  diff,</span></span>
<span class="source-line"><span class="source-line-number">148</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">149</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">150</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">151</span><span class="source-line-text">              yield* afs.writeWithDirs(filePath, Bom.join(contentNew, desiredBom))</span></span></code></pre>
</details>

审批 metadata 带 diff，所以 UI/用户可以看到即将发生的变更。

### 7.6 EditTool 写入后格式化和事件

```ts
if (yield* format.file(filePath)) {
  contentNew = yield* Bom.syncFile(afs, filePath, desiredBom)
}
yield* bus.publish(File.Event.Edited, { file: filePath })
yield* bus.publish(FileWatcher.Event.Updated, {
  file: filePath,
  event: "change",
})
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/edit.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/edit.ts:151-159</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">151</span><span class="source-line-text">              yield* afs.writeWithDirs(filePath, Bom.join(contentNew, desiredBom))</span></span>
<span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">              if (yield* format.file(filePath)) {</span></span>
<span class="source-line"><span class="source-line-number">153</span><span class="source-line-text">                contentNew = yield* Bom.syncFile(afs, filePath, desiredBom)</span></span>
<span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">              yield* bus.publish(File.Event.Edited, { file: filePath })</span></span>
<span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">              yield* bus.publish(FileWatcher.Event.Updated, {</span></span>
<span class="source-line"><span class="source-line-number">157</span><span class="source-line-text">                file: filePath,</span></span>
<span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">                event: &quot;change&quot;,</span></span>
<span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">              })</span></span></code></pre>
</details>

文件写入不是静默操作，而会触发事件，给 UI/同步/后续逻辑使用。

### 7.7 EditTool LSP 诊断

```ts
let output = "Edit applied successfully."
yield* lsp.touchFile(filePath, "document")
const diagnostics = yield* lsp.diagnostics()
const block = LSP.Diagnostic.report(filePath, diagnostics[normalizedFilePath] ?? [])
if (block) output += `\n\nLSP errors detected in this file, please fix:\n${block}`
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/edit.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/edit.ts:192-198</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">          let output = &quot;Edit applied successfully.&quot;</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">          yield* lsp.touchFile(filePath, &quot;document&quot;)</span></span>
<span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">          const diagnostics = yield* lsp.diagnostics()</span></span>
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">          const normalizedFilePath = AppFileSystem.normalizePath(filePath)</span></span>
<span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">          const block = LSP.Diagnostic.report(filePath, diagnostics[normalizedFilePath] ?? [])</span></span>
<span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">          if (block) output += `\n\nLSP errors detected in this file, please fix:\n${block}`</span></span>
<span class="source-line"><span class="source-line-number">198</span><span class="source-line-text"></span></span></code></pre>
</details>

诊断文本进入 tool output，模型下一轮能继续修复。

### 7.8 WriteTool 完整写入

```ts
const filepath = path.isAbsolute(params.filePath)
  ? params.filePath
  : path.join(instance.directory, params.filePath)
yield* assertExternalDirectoryEffect(ctx, filepath)
const exists = yield* fs.existsSafe(filepath)
const diff = trimDiff(createTwoFilesPatch(filepath, filepath, contentOld, contentNew))
yield* ctx.ask({ permission: "edit", patterns: [path.relative(instance.worktree, filepath)], metadata: { filepath, diff } })
yield* fs.writeWithDirs(filepath, Bom.join(contentNew, desiredBom))
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/write.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/write.ts:38-64</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">      execute: (params: { content: string; filePath: string }, ctx: Tool.Context) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">        Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">          const instance = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">          const filepath = path.isAbsolute(params.filePath)</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">            ? params.filePath</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">            : path.join(instance.directory, params.filePath)</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">          yield* assertExternalDirectoryEffect(ctx, filepath)</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">          const exists = yield* fs.existsSafe(filepath)</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">          const source = exists ? yield* Bom.readFile(fs, filepath) : { bom: false, text: &quot;&quot; }</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">          const next = Bom.split(params.content)</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">          const desiredBom = source.bom || next.bom</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">          const contentOld = source.text</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">          const contentNew = next.text</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">          const diff = trimDiff(createTwoFilesPatch(filepath, filepath, contentOld, contentNew))</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">          yield* ctx.ask({</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">            permission: &quot;edit&quot;,</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">            patterns: [path.relative(instance.worktree, filepath)],</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">            always: [&quot;*&quot;],</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">            metadata: {</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">              filepath,</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">              diff,</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">            },</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">          yield* fs.writeWithDirs(filepath, Bom.join(contentNew, desiredBom))</span></span></code></pre>
</details>

Write 和 Edit 一样走 edit 权限，因为它会改变文件。

### 7.9 WriteTool 项目级 diagnostics

```ts
yield* lsp.touchFile(filepath, "document")
const diagnostics = yield* lsp.diagnostics()
for (const [file, issues] of Object.entries(diagnostics)) {
  const current = file === normalizedFilepath
  const block = LSP.Diagnostic.report(current ? filepath : file, issues)
  if (current) {
    output += `\n\nLSP errors detected in this file, please fix:\n${block}`
    continue
  }
  output += `\n\nLSP errors detected in other files:\n${block}`
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/tool/write.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/tool/write.ts:74-90</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">          let output = &quot;Wrote file successfully.&quot;</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">          yield* lsp.touchFile(filepath, &quot;document&quot;)</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">          const diagnostics = yield* lsp.diagnostics()</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">          const normalizedFilepath = AppFileSystem.normalizePath(filepath)</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">          let projectDiagnosticsCount = 0</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">          for (const [file, issues] of Object.entries(diagnostics)) {</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">            const current = file === normalizedFilepath</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">            if (!current &amp;&amp; projectDiagnosticsCount &gt;= MAX_PROJECT_DIAGNOSTICS_FILES) continue</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">            const block = LSP.Diagnostic.report(current ? filepath : file, issues)</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">            if (!block) continue</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">            if (current) {</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">              output += `\n\nLSP errors detected in this file, please fix:\n${block}`</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">              continue</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">            projectDiagnosticsCount++</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">            output += `\n\nLSP errors detected in other files:\n${block}`</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">          }</span></span></code></pre>
</details>

WriteTool 不只报告当前文件，还会有限报告其他文件的诊断。

### 7.10 LSP touch 和 diagnostics

```ts
const clients = yield* getClients(input)
yield* Effect.promise(() =>
  Promise.all(
    clients.map(async (client) => {
      const version = await client.notify.open({ path: input })
      if (!diagnostics) return
      return client.waitForDiagnostics({ path: input, version, mode: diagnostics, after })
    }),
  ).catch((err) => {
    log.error("failed to touch file", { err, file: input })
  }),
)
```

路径：<details class="source-ref source-ref--inline">
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

这把文件修改和语言服务反馈连接起来。

## 8. 关键 TypeScript 语法复习

- `Schema.Struct` 定义工具参数。来源：`read.ts:29-37`、`edit.ts:47-56`。
- optional property：`offset`、`limit`、`replaceAll`。来源同上。
- Effect error recovery：`fs.stat(...).pipe(Effect.catchIf(...))`。来源：`read.ts:215-220`。
- object literal metadata：`metadata: { filepath, diff }`。来源：`write.ts:54-62`。
- template literal：把 diagnostics 拼进 output。来源：`edit.ts:197`、`write.ts:85-89`。
- path normalization：`process.platform === "win32"` 分支。来源：`read.ts:209-211`、`external-directory.ts:26-34`。

## 9. 涉及的设计模式和架构思想

- Policy enforcement：外部目录和 read/edit permission。
- Unit of Work：编辑时锁定文件，生成 diff，写入，格式化，诊断。
- Domain Event：发布 `File.Event.Edited` 和 `FileWatcher.Event.Updated`。
- Feedback Loop：LSP diagnostics 进入 tool output，供模型继续推理。
- Adapter：工具把模型参数适配成本地文件系统操作。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

- Tool：通过 `Tool.define` 暴露为工具。来源：`read.ts:39-41`、`edit.ts:58-60`、`write.ts:27-30`。
- Session：Tool.Context 带 session/message，用于权限和结果回写。
- 文件系统：`AppFileSystem` 负责 stat/read/writeWithDirs。
- LSP：`lsp.touchFile` 和 `lsp.diagnostics` 提供反馈。
- Provider：本章不直接接触 Provider；Provider 只通过工具 schema 间接影响模型如何调用工具。这个判断来自本章源码未看到 provider service 直接参与 read/edit/write 执行，需要在 Provider 章验证工具 schema transform。

## 11. 如果自己实现 mini agent，这一章对应什么代码

```ts
async function editFile(args: { filePath: string; oldString: string; newString: string }, ctx: ToolContext) {
  const filePath = resolveInsideProject(args.filePath, ctx.cwd)
  const oldContent = await fs.readFile(filePath, "utf8")
  const newContent = oldContent.replace(args.oldString, args.newString)
  const diff = makeDiff(oldContent, newContent)
  await ctx.ask({ permission: "edit", patterns: [relative(ctx.root, filePath)], metadata: { diff } })
  await fs.writeFile(filePath, newContent)
  const diagnostics = await runTypecheckOrLsp(filePath)
  return { output: diagnostics ? `Edit applied.\n${diagnostics}` : "Edit applied." }
}
```

## 12. 费曼复述区

请复述：

1. ReadTool 执行前有哪些边界检查？
2. EditTool 为什么要生成 diff 再 ask？
3. LSP diagnostics 为什么要进入 tool output？

换一种说法：文件工具的目标不是“能改文件”，而是“可控地改文件，并把后果反馈给模型”。

## 13. 练习题

### 入门题

1. 找到 ReadTool 的参数定义。
2. 找到 EditTool 申请 `edit` 权限的代码。
3. 找到 WriteTool 调用 `lsp.touchFile` 的代码。

### 进阶题

1. 解释 `external_directory` 和 `read/edit` 两类权限的区别。
2. 解释为什么写入后要格式化。
3. 解释为什么 edit 要处理 BOM 和行尾。

### 小实现题

实现一个 `writeFile` tool：写文件前生成 diff，调用 `ctx.ask`，写入后运行一个假 diagnostics 函数。

## 14. 源码追踪任务

1. 从 `ToolRegistry` 的 `read/edit/write` 初始化追到具体工具文件。
2. 从 `ReadTool.execute` 追到 `assertExternalDirectoryEffect`。
3. 从 `EditTool` 的 `ctx.ask` 追到 permission 模块。
4. 从 `WriteTool` 的 `lsp.touchFile` 追到 `LSP.diagnostics`。
5. 从 `FileWatcher.Event.Updated` 追到 UI 或同步事件消费者。

## 15. 面试式自测

1. 为什么文件工具不能直接 `fs.writeFile`？
2. 如何防止 agent 修改项目外的文件？
3. 为什么 diff 要放进权限请求 metadata？
4. LSP diagnostics 对 agent loop 有什么作用？
5. `read` 和用户通过 `--file` 附加文件时的 read 有什么差异？

## 16. 下一步阅读建议

下一章读 “Shell / 命令执行”。文件工具和 shell 工具都操作本地环境，但 shell 的风险更高，会引入命令解析、cwd、timeout、环境变量和更复杂的权限扫描。


