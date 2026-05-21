---
title: "CLI / 启动入口"
description: "理解 opencode 命令如何启动、注册子命令，并把 run/serve 等命令导向统一 runtime。"
sidebar:
  label: "01. CLI / 启动入口"
  order: 1
---

<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">已完成</span></div>
  <div><strong>难度</strong>入门</div>
  <div><strong>预计阅读</strong>30 分钟</div>
  <div><strong>源文件</strong><a href="/markdown/01-cli-startup.md"><code>markdown/01-cli-startup.md</code></a></div>
</div>

## Agent 生成档案

- 章节 ID：`01-cli-startup`
- 章节摘要：理解 opencode 命令如何启动、注册子命令，并把 run/serve 等命令导向统一 runtime。
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

<li><code>packages/opencode/package.json</code></li>
<li><code>packages/opencode/src/index.ts</code></li>
<li><code>packages/opencode/src/cli/cmd/run.ts</code></li>
<li><code>packages/opencode/src/cli/effect-cmd.ts</code></li>

</ul>


> 对应模块：`study-output/02-opencode-function-outline.md` 的 “2.1 CLI / 启动入口”。  
> 主要源码：`packages/opencode/src/index.ts`、`packages/opencode/src/cli/cmd/run.ts`、`packages/opencode/src/cli/effect-cmd.ts`。

## 0. 本章学习目标

你会学到：`opencode` 进程如何启动，yargs 如何注册子命令，`run` 命令如何处理 CLI 参数、stdin、文件附件、session 创建/恢复、事件订阅，以及为什么本地模式最终也走同一套 server/SDK 通道。

## 1. 一句话讲明白

OpenCode 的 CLI 层不是 agent 本体，而是一个入口适配层：它负责把命令行输入整理成 session API 请求，再交给 runtime 的 `SessionPrompt` 和 agent loop。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/index.ts:70-180</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">const cli = yargs(args)</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">  .parserConfiguration({ &quot;populate--&quot;: true })</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">  .scriptName(&quot;opencode&quot;)</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">  .wrap(100)</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">  .help(&quot;help&quot;, &quot;show help&quot;)</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  .alias(&quot;help&quot;, &quot;h&quot;)</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">  .version(&quot;version&quot;, &quot;show version number&quot;, InstallationVersion)</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">  .alias(&quot;version&quot;, &quot;v&quot;)</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">  .option(&quot;print-logs&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">    describe: &quot;print logs to stderr&quot;,</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">    type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">  .option(&quot;log-level&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">    describe: &quot;log level&quot;,</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">    type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">    choices: [&quot;DEBUG&quot;, &quot;INFO&quot;, &quot;WARN&quot;, &quot;ERROR&quot;],</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">  .option(&quot;pure&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">    describe: &quot;run without external plugins&quot;,</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">    type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">  .middleware(async (opts) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">    if (opts.pure) {</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">      process.env.OPENCODE_PURE = &quot;1&quot;</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">    await Log.init({</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">      print: process.argv.includes(&quot;--print-logs&quot;),</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">      dev: Installation.isLocal(),</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">      level: (() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">        if (opts.logLevel) return opts.logLevel as Log.Level</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">        if (Installation.isLocal()) return &quot;DEBUG&quot;</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">        return &quot;INFO&quot;</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">      })(),</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">    Heap.start()</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">    process.env.AGENT = &quot;1&quot;</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">    process.env.OPENCODE = &quot;1&quot;</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">    process.env.OPENCODE_PID = String(process.pid)</span></span>
<span class="source-line"><span class="source-line-number">111</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">    Log.Default.info(&quot;opencode&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">      version: InstallationVersion,</span></span>
<span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">      args: process.argv.slice(2),</span></span>
<span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">      process_role: processMetadata.processRole,</span></span>
<span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">      run_id: processMetadata.runID,</span></span>
<span class="source-line"><span class="source-line-number">117</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">118</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">    const marker = path.join(Global.Path.data, &quot;opencode.db&quot;)</span></span>
<span class="source-line"><span class="source-line-number">120</span><span class="source-line-text">    if (!(await Filesystem.exists(marker))) {</span></span>
<span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">      const tty = process.stderr.isTTY</span></span>
<span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">      process.stderr.write(&quot;Performing one time database migration, may take a few minutes...&quot; + EOL)</span></span>
<span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">      const width = 36</span></span>
<span class="source-line"><span class="source-line-number">124</span><span class="source-line-text">      const orange = &quot;\x1b[38;5;214m&quot;</span></span>
<span class="source-line"><span class="source-line-number">125</span><span class="source-line-text">      const muted = &quot;\x1b[0;2m&quot;</span></span>
<span class="source-line"><span class="source-line-number">126</span><span class="source-line-text">      const reset = &quot;\x1b[0m&quot;</span></span>
<span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">      let last = -1</span></span>
<span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">      if (tty) process.stderr.write(&quot;\x1b[?25l&quot;)</span></span>
<span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">      try {</span></span>
<span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">        await JsonMigration.run(drizzle({ client: Database.Client().$client }), {</span></span>
<span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">          progress: (event) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">            const percent = Math.floor((event.current / event.total) * 100)</span></span>
<span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">            if (percent === last &amp;&amp; event.current !== event.total) return</span></span>
<span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">            last = percent</span></span>
<span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">            if (tty) {</span></span>
<span class="source-line"><span class="source-line-number">136</span><span class="source-line-text">              const fill = Math.round((percent / 100) * width)</span></span>
<span class="source-line"><span class="source-line-number">137</span><span class="source-line-text">              const bar = `${&quot;■&quot;.repeat(fill)}${&quot;･&quot;.repeat(width - fill)}`</span></span>
<span class="source-line"><span class="source-line-number">138</span><span class="source-line-text">              process.stderr.write(</span></span>
<span class="source-line"><span class="source-line-number">139</span><span class="source-line-text">                `\r${orange}${bar} ${percent.toString().padStart(3)}%${reset} ${muted}${event.label.padEnd(12)} ${event.current}/${event.total}${reset}`,</span></span>
<span class="source-line"><span class="source-line-number">140</span><span class="source-line-text">              )</span></span>
<span class="source-line"><span class="source-line-number">141</span><span class="source-line-text">              if (event.current === event.total) process.stderr.write(&quot;\n&quot;)</span></span>
<span class="source-line"><span class="source-line-number">142</span><span class="source-line-text">            } else {</span></span>
<span class="source-line"><span class="source-line-number">143</span><span class="source-line-text">              process.stderr.write(`sqlite-migration:${percent}${EOL}`)</span></span>
<span class="source-line"><span class="source-line-number">144</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">145</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">146</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">147</span><span class="source-line-text">      } finally {</span></span>
<span class="source-line"><span class="source-line-number">148</span><span class="source-line-text">        if (tty) process.stderr.write(&quot;\x1b[?25h&quot;)</span></span>
<span class="source-line"><span class="source-line-number">149</span><span class="source-line-text">        else {</span></span>
<span class="source-line"><span class="source-line-number">150</span><span class="source-line-text">          process.stderr.write(`sqlite-migration:done${EOL}`)</span></span>
<span class="source-line"><span class="source-line-number">151</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">153</span><span class="source-line-text">      process.stderr.write(&quot;Database migration complete.&quot; + EOL)</span></span>
<span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">  .usage(&quot;&quot;)</span></span>
<span class="source-line"><span class="source-line-number">157</span><span class="source-line-text">  .completion(&quot;completion&quot;, &quot;generate shell completion script&quot;)</span></span>
<span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">  .command(AcpCommand)</span></span>
<span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">  .command(McpCommand)</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">  .command(TuiThreadCommand)</span></span>
<span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">  .command(AttachCommand)</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">  .command(RunCommand)</span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">  .command(GenerateCommand)</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">  .command(DebugCommand)</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">  .command(ConsoleCommand)</span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">  .command(ProvidersCommand)</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">  .command(AgentCommand)</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">  .command(UpgradeCommand)</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">  .command(UninstallCommand)</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">  .command(ServeCommand)</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">  .command(WebCommand)</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">  .command(ModelsCommand)</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">  .command(StatsCommand)</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">  .command(ExportCommand)</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">  .command(ImportCommand)</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">  .command(GithubCommand)</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">  .command(PrCommand)</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">  .command(SessionCommand)</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">  .command(PluginCommand)</span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">  .command(DbCommand)</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
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
</details>。

## 2. 它在 OpenCode agent 中的位置

`packages/opencode/src/index.ts` 相当于进程 `main()`：注册全局参数、初始化日志/环境、注册所有命令。`RunCommand` 是学习 agent 的第一入口，因为它最终调用 `client.session.prompt` 或 `client.session.command`。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/index.ts:70-91</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">const cli = yargs(args)</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">  .parserConfiguration({ &quot;populate--&quot;: true })</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">  .scriptName(&quot;opencode&quot;)</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">  .wrap(100)</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">  .help(&quot;help&quot;, &quot;show help&quot;)</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  .alias(&quot;help&quot;, &quot;h&quot;)</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">  .version(&quot;version&quot;, &quot;show version number&quot;, InstallationVersion)</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">  .alias(&quot;version&quot;, &quot;v&quot;)</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">  .option(&quot;print-logs&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">    describe: &quot;print logs to stderr&quot;,</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">    type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">  .option(&quot;log-level&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">    describe: &quot;log level&quot;,</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">    type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">    choices: [&quot;DEBUG&quot;, &quot;INFO&quot;, &quot;WARN&quot;, &quot;ERROR&quot;],</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">  .option(&quot;pure&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">    describe: &quot;run without external plugins&quot;,</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">    type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">  .middleware(async (opts) =&gt; {</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/index.ts:158-180</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">  .command(AcpCommand)</span></span>
<span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">  .command(McpCommand)</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">  .command(TuiThreadCommand)</span></span>
<span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">  .command(AttachCommand)</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">  .command(RunCommand)</span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">  .command(GenerateCommand)</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">  .command(DebugCommand)</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">  .command(ConsoleCommand)</span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">  .command(ProvidersCommand)</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">  .command(AgentCommand)</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">  .command(UpgradeCommand)</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">  .command(UninstallCommand)</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">  .command(ServeCommand)</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">  .command(WebCommand)</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">  .command(ModelsCommand)</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">  .command(StatsCommand)</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">  .command(ExportCommand)</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">  .command(ImportCommand)</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">  .command(GithubCommand)</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">  .command(PrCommand)</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">  .command(SessionCommand)</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">  .command(PluginCommand)</span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">  .command(DbCommand)</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:127-245</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">export const RunCommand = effectCmd({</span></span>
<span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">  command: &quot;run [message..]&quot;,</span></span>
<span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">  describe: &quot;run opencode with a message&quot;,</span></span>
<span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">  // --attach connects to a remote server (no local instance needed); the</span></span>
<span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">  // default path runs an in-process server and needs the project instance.</span></span>
<span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">  instance: (args) =&gt; !args.attach,</span></span>
<span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">  // For --dir without --attach, load instance for the resolved target dir.</span></span>
<span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">  // The handler also chdirs (preserving the legacy order: chdir → file resolution).</span></span>
<span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">  directory: (args) =&gt; (args.dir &amp;&amp; !args.attach ? path.resolve(process.cwd(), args.dir) : process.cwd()),</span></span>
<span class="source-line"><span class="source-line-number">136</span><span class="source-line-text">  builder: (yargs: Argv) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">137</span><span class="source-line-text">    yargs</span></span>
<span class="source-line"><span class="source-line-number">138</span><span class="source-line-text">      .positional(&quot;message&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">139</span><span class="source-line-text">        describe: &quot;message to send&quot;,</span></span>
<span class="source-line"><span class="source-line-number">140</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">141</span><span class="source-line-text">        array: true,</span></span>
<span class="source-line"><span class="source-line-number">142</span><span class="source-line-text">        default: [],</span></span>
<span class="source-line"><span class="source-line-number">143</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">144</span><span class="source-line-text">      .option(&quot;command&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">145</span><span class="source-line-text">        describe: &quot;the command to run, use message for args&quot;,</span></span>
<span class="source-line"><span class="source-line-number">146</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">147</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">148</span><span class="source-line-text">      .option(&quot;continue&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">149</span><span class="source-line-text">        alias: [&quot;c&quot;],</span></span>
<span class="source-line"><span class="source-line-number">150</span><span class="source-line-text">        describe: &quot;continue the last session&quot;,</span></span>
<span class="source-line"><span class="source-line-number">151</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">153</span><span class="source-line-text">      .option(&quot;session&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">        alias: [&quot;s&quot;],</span></span>
<span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">        describe: &quot;session id to continue&quot;,</span></span>
<span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">157</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">      .option(&quot;fork&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">        describe: &quot;fork the session before continuing (requires --continue or --session)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">      .option(&quot;share&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">        describe: &quot;share the session&quot;,</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">      .option(&quot;model&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">        alias: [&quot;m&quot;],</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">        describe: &quot;model to use in the format of provider/model&quot;,</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">      .option(&quot;agent&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">        describe: &quot;agent to use&quot;,</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">      .option(&quot;format&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">        choices: [&quot;default&quot;, &quot;json&quot;],</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">        default: &quot;default&quot;,</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">        describe: &quot;format: default (formatted) or json (raw JSON events)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">      .option(&quot;file&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">        alias: [&quot;f&quot;],</span></span>
<span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">        array: true,</span></span>
<span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">        describe: &quot;file(s) to attach to message&quot;,</span></span>
<span class="source-line"><span class="source-line-number">186</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">      .option(&quot;title&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">        describe: &quot;title for the session (uses truncated prompt if no value provided)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">      .option(&quot;attach&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">        describe: &quot;attach to a running opencode server (e.g., http://localhost:4096)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      .option(&quot;password&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">        alias: [&quot;p&quot;],</span></span>
<span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">        describe: &quot;basic auth password (defaults to OPENCODE_SERVER_PASSWORD)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">      .option(&quot;username&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">        alias: [&quot;u&quot;],</span></span>
<span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">        describe: &quot;basic auth username (defaults to OPENCODE_SERVER_USERNAME or 'opencode')&quot;,</span></span>
<span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">      .option(&quot;dir&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">        describe: &quot;directory to run in, path on remote server if attaching&quot;,</span></span>
<span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">209</span><span class="source-line-text">      .option(&quot;port&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">        type: &quot;number&quot;,</span></span>
<span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">        describe: &quot;port for the local server (defaults to random port if no value provided)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">      .option(&quot;variant&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">        describe: &quot;model variant (provider-specific reasoning effort, e.g., high, max, minimal)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">      .option(&quot;thinking&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">        describe: &quot;show thinking blocks&quot;,</span></span>
<span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">221</span><span class="source-line-text">      .option(&quot;replay&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">        default: false,</span></span>
<span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">        describe: &quot;replay visible session history on interactive resume&quot;,</span></span>
<span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">226</span><span class="source-line-text">      .option(&quot;replay-limit&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">        type: &quot;number&quot;,</span></span>
<span class="source-line"><span class="source-line-number">228</span><span class="source-line-text">        describe: &quot;cap visible interactive replay to the newest N messages&quot;,</span></span>
<span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">      .option(&quot;interactive&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">231</span><span class="source-line-text">        alias: [&quot;i&quot;],</span></span>
<span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">233</span><span class="source-line-text">        describe: &quot;run in direct interactive split-footer mode&quot;,</span></span>
<span class="source-line"><span class="source-line-number">234</span><span class="source-line-text">        default: false,</span></span>
<span class="source-line"><span class="source-line-number">235</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">      .option(&quot;dangerously-skip-permissions&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">237</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">        describe: &quot;auto-approve permissions that are not explicitly denied (dangerous!)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">239</span><span class="source-line-text">        default: false,</span></span>
<span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">      .option(&quot;demo&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">243</span><span class="source-line-text">        default: false,</span></span>
<span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">        describe: &quot;enable direct interactive demo slash commands; pass one as the message to run it immediately&quot;,</span></span>
<span class="source-line"><span class="source-line-number">245</span><span class="source-line-text">      }),</span></span></code></pre>
</details>。

## 3. 生活类比

CLI 像服务台：用户说“帮我改这个项目”，服务台先确认目录、附件、是否继续旧会话、是否需要交互界面，再把工单交给后面的 agent 服务系统。

## 4. Java 开发者类比

- `index.ts` 类似 `public static void main(String[] args)` + Picocli/JCommander 根命令。
- `RunCommand` 类似一个 `@Command` handler。
- `effectCmd` 类似命令执行拦截器：负责加载项目上下文、注入依赖、finally 清理。
- `createOpencodeClient` + `Server.Default().app.fetch` 类似本地 in-process controller 调用，而不是重复实现 service 逻辑。

## 5. 最小源码路径

1. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/index.ts:58-91</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">const args = hideBin(process.argv)</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">function show(out: string) {</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">  const text = out.trimStart()</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">  if (!text.startsWith(&quot;opencode &quot;)) {</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">    process.stderr.write(UI.logo() + EOL + EOL)</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    process.stderr.write(text)</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">    return</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">  process.stderr.write(out)</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">const cli = yargs(args)</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">  .parserConfiguration({ &quot;populate--&quot;: true })</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">  .scriptName(&quot;opencode&quot;)</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">  .wrap(100)</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">  .help(&quot;help&quot;, &quot;show help&quot;)</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  .alias(&quot;help&quot;, &quot;h&quot;)</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">  .version(&quot;version&quot;, &quot;show version number&quot;, InstallationVersion)</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">  .alias(&quot;version&quot;, &quot;v&quot;)</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">  .option(&quot;print-logs&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">    describe: &quot;print logs to stderr&quot;,</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">    type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">  .option(&quot;log-level&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">    describe: &quot;log level&quot;,</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">    type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">    choices: [&quot;DEBUG&quot;, &quot;INFO&quot;, &quot;WARN&quot;, &quot;ERROR&quot;],</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">  .option(&quot;pure&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">    describe: &quot;run without external plugins&quot;,</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">    type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">  .middleware(async (opts) =&gt; {</span></span></code></pre>
</details>：从 `process.argv` 得到 args，创建 yargs。
2. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/index.ts:158-180</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">  .command(AcpCommand)</span></span>
<span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">  .command(McpCommand)</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">  .command(TuiThreadCommand)</span></span>
<span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">  .command(AttachCommand)</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">  .command(RunCommand)</span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">  .command(GenerateCommand)</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">  .command(DebugCommand)</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">  .command(ConsoleCommand)</span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">  .command(ProvidersCommand)</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">  .command(AgentCommand)</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">  .command(UpgradeCommand)</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">  .command(UninstallCommand)</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">  .command(ServeCommand)</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">  .command(WebCommand)</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">  .command(ModelsCommand)</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">  .command(StatsCommand)</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">  .command(ExportCommand)</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">  .command(ImportCommand)</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">  .command(GithubCommand)</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">  .command(PrCommand)</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">  .command(SessionCommand)</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">  .command(PluginCommand)</span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">  .command(DbCommand)</span></span></code></pre>
</details>：注册 `RunCommand` 等命令。
3. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/effect-cmd.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/effect-cmd.ts:70-93</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">export const effectCmd = &lt;Args, A&gt;(opts: EffectCmdOpts&lt;Args, A&gt;) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">  cmd&lt;{}, Args&gt;({</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">    command: opts.command,</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">    aliases: opts.aliases,</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">    describe: opts.describe,</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">    builder: opts.builder as never,</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">    async handler(rawArgs) {</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">      // yargs typing wraps Args in ArgumentsCamelCase&lt;WithDoubleDash&lt;...&gt;&gt;; cast at the boundary.</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">      const args = rawArgs as unknown as WithDoubleDash&lt;Args&gt;</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">      const useInstance = typeof opts.instance === &quot;function&quot; ? opts.instance(args) : opts.instance !== false</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">      if (!useInstance) {</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">        await AppRuntime.runPromise(opts.handler(args))</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">        return</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">      const directory = opts.directory?.(args) ?? process.cwd()</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">      const { store, ctx } = await AppRuntime.runPromise(</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">        InstanceStore.Service.use((store) =&gt; store.load({ directory }).pipe(Effect.map((ctx) =&gt; ({ store, ctx })))),</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">      try {</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">        await AppRuntime.runPromise(opts.handler(args).pipe(Effect.provideService(InstanceRef, ctx)))</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">      } finally {</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">        await AppRuntime.runPromise(store.dispose(ctx))</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">    },</span></span></code></pre>
</details>：把 yargs handler 包成 Effect runtime，并加载/释放 instance。
4. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:127-245</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">export const RunCommand = effectCmd({</span></span>
<span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">  command: &quot;run [message..]&quot;,</span></span>
<span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">  describe: &quot;run opencode with a message&quot;,</span></span>
<span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">  // --attach connects to a remote server (no local instance needed); the</span></span>
<span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">  // default path runs an in-process server and needs the project instance.</span></span>
<span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">  instance: (args) =&gt; !args.attach,</span></span>
<span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">  // For --dir without --attach, load instance for the resolved target dir.</span></span>
<span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">  // The handler also chdirs (preserving the legacy order: chdir → file resolution).</span></span>
<span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">  directory: (args) =&gt; (args.dir &amp;&amp; !args.attach ? path.resolve(process.cwd(), args.dir) : process.cwd()),</span></span>
<span class="source-line"><span class="source-line-number">136</span><span class="source-line-text">  builder: (yargs: Argv) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">137</span><span class="source-line-text">    yargs</span></span>
<span class="source-line"><span class="source-line-number">138</span><span class="source-line-text">      .positional(&quot;message&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">139</span><span class="source-line-text">        describe: &quot;message to send&quot;,</span></span>
<span class="source-line"><span class="source-line-number">140</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">141</span><span class="source-line-text">        array: true,</span></span>
<span class="source-line"><span class="source-line-number">142</span><span class="source-line-text">        default: [],</span></span>
<span class="source-line"><span class="source-line-number">143</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">144</span><span class="source-line-text">      .option(&quot;command&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">145</span><span class="source-line-text">        describe: &quot;the command to run, use message for args&quot;,</span></span>
<span class="source-line"><span class="source-line-number">146</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">147</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">148</span><span class="source-line-text">      .option(&quot;continue&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">149</span><span class="source-line-text">        alias: [&quot;c&quot;],</span></span>
<span class="source-line"><span class="source-line-number">150</span><span class="source-line-text">        describe: &quot;continue the last session&quot;,</span></span>
<span class="source-line"><span class="source-line-number">151</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">153</span><span class="source-line-text">      .option(&quot;session&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">        alias: [&quot;s&quot;],</span></span>
<span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">        describe: &quot;session id to continue&quot;,</span></span>
<span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">157</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">      .option(&quot;fork&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">        describe: &quot;fork the session before continuing (requires --continue or --session)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">      .option(&quot;share&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">        describe: &quot;share the session&quot;,</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">      .option(&quot;model&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">        alias: [&quot;m&quot;],</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">        describe: &quot;model to use in the format of provider/model&quot;,</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">      .option(&quot;agent&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">        describe: &quot;agent to use&quot;,</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">      .option(&quot;format&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">        choices: [&quot;default&quot;, &quot;json&quot;],</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">        default: &quot;default&quot;,</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">        describe: &quot;format: default (formatted) or json (raw JSON events)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">      .option(&quot;file&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">        alias: [&quot;f&quot;],</span></span>
<span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">        array: true,</span></span>
<span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">        describe: &quot;file(s) to attach to message&quot;,</span></span>
<span class="source-line"><span class="source-line-number">186</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">      .option(&quot;title&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">        describe: &quot;title for the session (uses truncated prompt if no value provided)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">      .option(&quot;attach&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">        describe: &quot;attach to a running opencode server (e.g., http://localhost:4096)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      .option(&quot;password&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">        alias: [&quot;p&quot;],</span></span>
<span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">        describe: &quot;basic auth password (defaults to OPENCODE_SERVER_PASSWORD)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">      .option(&quot;username&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">        alias: [&quot;u&quot;],</span></span>
<span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">        describe: &quot;basic auth username (defaults to OPENCODE_SERVER_USERNAME or 'opencode')&quot;,</span></span>
<span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">      .option(&quot;dir&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">        describe: &quot;directory to run in, path on remote server if attaching&quot;,</span></span>
<span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">209</span><span class="source-line-text">      .option(&quot;port&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">        type: &quot;number&quot;,</span></span>
<span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">        describe: &quot;port for the local server (defaults to random port if no value provided)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">      .option(&quot;variant&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">        describe: &quot;model variant (provider-specific reasoning effort, e.g., high, max, minimal)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">      .option(&quot;thinking&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">        describe: &quot;show thinking blocks&quot;,</span></span>
<span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">221</span><span class="source-line-text">      .option(&quot;replay&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">        default: false,</span></span>
<span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">        describe: &quot;replay visible session history on interactive resume&quot;,</span></span>
<span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">226</span><span class="source-line-text">      .option(&quot;replay-limit&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">        type: &quot;number&quot;,</span></span>
<span class="source-line"><span class="source-line-number">228</span><span class="source-line-text">        describe: &quot;cap visible interactive replay to the newest N messages&quot;,</span></span>
<span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">      .option(&quot;interactive&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">231</span><span class="source-line-text">        alias: [&quot;i&quot;],</span></span>
<span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">233</span><span class="source-line-text">        describe: &quot;run in direct interactive split-footer mode&quot;,</span></span>
<span class="source-line"><span class="source-line-number">234</span><span class="source-line-text">        default: false,</span></span>
<span class="source-line"><span class="source-line-number">235</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">      .option(&quot;dangerously-skip-permissions&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">237</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">        describe: &quot;auto-approve permissions that are not explicitly denied (dangerous!)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">239</span><span class="source-line-text">        default: false,</span></span>
<span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">      .option(&quot;demo&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">243</span><span class="source-line-text">        default: false,</span></span>
<span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">        describe: &quot;enable direct interactive demo slash commands; pass one as the message to run it immediately&quot;,</span></span>
<span class="source-line"><span class="source-line-number">245</span><span class="source-line-text">      }),</span></span></code></pre>
</details>：定义 `run [message..]` 的参数。
5. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:246-360</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">246</span><span class="source-line-text">  handler: Effect.fn(&quot;Cli.run&quot;)(function* (args) {</span></span>
<span class="source-line"><span class="source-line-number">247</span><span class="source-line-text">    const agentSvc = yield* Agent.Service</span></span>
<span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">    const flags = yield* RuntimeFlags.Service</span></span>
<span class="source-line"><span class="source-line-number">249</span><span class="source-line-text">    const localInstance = yield* InstanceRef</span></span>
<span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">    yield* Effect.promise(async () =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">      const rawMessage = [...args.message, ...(args[&quot;--&quot;] || [])].join(&quot; &quot;)</span></span>
<span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">      const thinking = args.interactive ? (args.thinking ?? true) : (args.thinking ?? false)</span></span>
<span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">      const die = (message: string): never =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">254</span><span class="source-line-text">        UI.error(message)</span></span>
<span class="source-line"><span class="source-line-number">255</span><span class="source-line-text">        process.exit(1)</span></span>
<span class="source-line"><span class="source-line-number">256</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">257</span><span class="source-line-text">      const dieInteractive = (error: unknown): never =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">        if (error instanceof Error &amp;&amp; error.message === INTERACTIVE_INPUT_ERROR) {</span></span>
<span class="source-line"><span class="source-line-number">259</span><span class="source-line-text">          die(error.message)</span></span>
<span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">261</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">262</span><span class="source-line-text">        throw error</span></span>
<span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">264</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">265</span><span class="source-line-text">      let message = [...args.message, ...(args[&quot;--&quot;] || [])]</span></span>
<span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">        .map((arg) =&gt; (arg.includes(&quot; &quot;) ? `&quot;${arg.replace(/&quot;/g, '\\&quot;')}&quot;` : arg))</span></span>
<span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">        .join(&quot; &quot;)</span></span>
<span class="source-line"><span class="source-line-number">268</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">      if (args.interactive &amp;&amp; args.command) {</span></span>
<span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">        die(&quot;--interactive cannot be used with --command&quot;)</span></span>
<span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">272</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">      if (args.demo &amp;&amp; !args.interactive) {</span></span>
<span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">        die(&quot;--demo requires --interactive&quot;)</span></span>
<span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">276</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">      if (args.interactive &amp;&amp; args.format === &quot;json&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">278</span><span class="source-line-text">        die(&quot;--interactive cannot be used with --format json&quot;)</span></span>
<span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">      if (args.replay &amp;&amp; !args.interactive) {</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">        die(&quot;--replay requires --interactive&quot;)</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">      if (args[&quot;replay-limit&quot;] !== undefined &amp;&amp; !args.interactive) {</span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">        die(&quot;--replay-limit requires --interactive&quot;)</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">288</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">      if (</span></span>
<span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">        args[&quot;replay-limit&quot;] !== undefined &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">        (!Number.isInteger(args[&quot;replay-limit&quot;]) || args[&quot;replay-limit&quot;] &lt;= 0)</span></span>
<span class="source-line"><span class="source-line-number">292</span><span class="source-line-text">      ) {</span></span>
<span class="source-line"><span class="source-line-number">293</span><span class="source-line-text">        die(&quot;--replay-limit must be a positive integer&quot;)</span></span>
<span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">295</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text">      if (args.interactive &amp;&amp; !process.stdout.isTTY) {</span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">        die(&quot;--interactive requires a TTY stdout&quot;)</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">      if (args.interactive) {</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">        try {</span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">          resolveInteractiveStdin().cleanup?.()</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">        } catch (error) {</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">          dieInteractive(error)</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">      const replay = args.replay || args[&quot;replay-limit&quot;] !== undefined</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text">      const root = Filesystem.resolve(process.env.PWD ?? process.cwd())</span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">      const directory = (() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">        if (!args.dir) return args.attach ? undefined : root</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">        if (args.attach) return args.dir</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">        try {</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">          process.chdir(path.isAbsolute(args.dir) ? args.dir : path.join(root, args.dir))</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">          return process.cwd()</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text">        } catch {</span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">          UI.error(&quot;Failed to change directory to &quot; + args.dir)</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">          process.exit(1)</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">      })()</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text">      const attachHeaders = args.attach</span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">        ? ServerAuth.headers({ password: args.password, username: args.username })</span></span>
<span class="source-line"><span class="source-line-number">325</span><span class="source-line-text">        : undefined</span></span>
<span class="source-line"><span class="source-line-number">326</span><span class="source-line-text">      const attachSDK = (dir?: string) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">        return createOpencodeClient({</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">          baseUrl: args.attach!,</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">          directory: dir,</span></span>
<span class="source-line"><span class="source-line-number">330</span><span class="source-line-text">          headers: attachHeaders,</span></span>
<span class="source-line"><span class="source-line-number">331</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">332</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">333</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">      const files: FilePart[] = []</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">      if (args.file) {</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">        const list = Array.isArray(args.file) ? args.file : [args.file]</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">        for (const filePath of list) {</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text">          const resolvedPath = path.resolve(args.attach ? root : (directory ?? root), filePath)</span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">          if (!(await Filesystem.exists(resolvedPath))) {</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">            UI.error(`File not found: ${filePath}`)</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text">            process.exit(1)</span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">          const mime = (await Filesystem.isDir(resolvedPath)) ? &quot;application/x-directory&quot; : &quot;text/plain&quot;</span></span>
<span class="source-line"><span class="source-line-number">346</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">          files.push({</span></span>
<span class="source-line"><span class="source-line-number">348</span><span class="source-line-text">            type: &quot;file&quot;,</span></span>
<span class="source-line"><span class="source-line-number">349</span><span class="source-line-text">            url: pathToFileURL(resolvedPath).href,</span></span>
<span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">            filename: path.basename(resolvedPath),</span></span>
<span class="source-line"><span class="source-line-number">351</span><span class="source-line-text">            mime,</span></span>
<span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">353</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">355</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">356</span><span class="source-line-text">      const piped = process.stdin.isTTY ? undefined : await Bun.stdin.text()</span></span>
<span class="source-line"><span class="source-line-number">357</span><span class="source-line-text">      message = resolveRunInput(message, piped) ?? &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">358</span><span class="source-line-text">      const initialInput = resolveRunInput(rawMessage, piped)</span></span>
<span class="source-line"><span class="source-line-number">359</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">360</span><span class="source-line-text">      if (message.trim().length === 0 &amp;&amp; !args.command &amp;&amp; !args.interactive) {</span></span></code></pre>
</details>：处理 message、stdin、目录和文件附件。
6. <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:396-516</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">396</span><span class="source-line-text">      async function session(sdk: OpencodeClient): Promise&lt;SessionInfo | undefined&gt; {</span></span>
<span class="source-line"><span class="source-line-number">397</span><span class="source-line-text">        if (args.session) {</span></span>
<span class="source-line"><span class="source-line-number">398</span><span class="source-line-text">          const current = await sdk.session</span></span>
<span class="source-line"><span class="source-line-number">399</span><span class="source-line-text">            .get({</span></span>
<span class="source-line"><span class="source-line-number">400</span><span class="source-line-text">              sessionID: args.session,</span></span>
<span class="source-line"><span class="source-line-number">401</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">402</span><span class="source-line-text">            .catch(() =&gt; undefined)</span></span>
<span class="source-line"><span class="source-line-number">403</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">404</span><span class="source-line-text">          if (!current?.data) {</span></span>
<span class="source-line"><span class="source-line-number">405</span><span class="source-line-text">            UI.error(&quot;Session not found&quot;)</span></span>
<span class="source-line"><span class="source-line-number">406</span><span class="source-line-text">            process.exit(1)</span></span>
<span class="source-line"><span class="source-line-number">407</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">408</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">409</span><span class="source-line-text">          if (args.fork) {</span></span>
<span class="source-line"><span class="source-line-number">410</span><span class="source-line-text">            const forked = await sdk.session.fork({</span></span>
<span class="source-line"><span class="source-line-number">411</span><span class="source-line-text">              sessionID: args.session,</span></span>
<span class="source-line"><span class="source-line-number">412</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">413</span><span class="source-line-text">            const id = forked.data?.id</span></span>
<span class="source-line"><span class="source-line-number">414</span><span class="source-line-text">            if (!id) {</span></span>
<span class="source-line"><span class="source-line-number">415</span><span class="source-line-text">              return</span></span>
<span class="source-line"><span class="source-line-number">416</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">417</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">418</span><span class="source-line-text">            return {</span></span>
<span class="source-line"><span class="source-line-number">419</span><span class="source-line-text">              id,</span></span>
<span class="source-line"><span class="source-line-number">420</span><span class="source-line-text">              title: forked.data?.title ?? current.data.title,</span></span>
<span class="source-line"><span class="source-line-number">421</span><span class="source-line-text">              directory: forked.data?.directory ?? current.data.directory,</span></span>
<span class="source-line"><span class="source-line-number">422</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">423</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">424</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">425</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">426</span><span class="source-line-text">            id: current.data.id,</span></span>
<span class="source-line"><span class="source-line-number">427</span><span class="source-line-text">            title: current.data.title,</span></span>
<span class="source-line"><span class="source-line-number">428</span><span class="source-line-text">            directory: current.data.directory,</span></span>
<span class="source-line"><span class="source-line-number">429</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">430</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">431</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">432</span><span class="source-line-text">        const base = args.continue ? (await sdk.session.list()).data?.find((item) =&gt; !item.parentID) : undefined</span></span>
<span class="source-line"><span class="source-line-number">433</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">434</span><span class="source-line-text">        if (base &amp;&amp; args.fork) {</span></span>
<span class="source-line"><span class="source-line-number">435</span><span class="source-line-text">          const forked = await sdk.session.fork({</span></span>
<span class="source-line"><span class="source-line-number">436</span><span class="source-line-text">            sessionID: base.id,</span></span>
<span class="source-line"><span class="source-line-number">437</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">438</span><span class="source-line-text">          const id = forked.data?.id</span></span>
<span class="source-line"><span class="source-line-number">439</span><span class="source-line-text">          if (!id) {</span></span>
<span class="source-line"><span class="source-line-number">440</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">441</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">442</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">443</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">444</span><span class="source-line-text">            id,</span></span>
<span class="source-line"><span class="source-line-number">445</span><span class="source-line-text">            title: forked.data?.title ?? base.title,</span></span>
<span class="source-line"><span class="source-line-number">446</span><span class="source-line-text">            directory: forked.data?.directory ?? base.directory,</span></span>
<span class="source-line"><span class="source-line-number">447</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">448</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">449</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">450</span><span class="source-line-text">        if (base) {</span></span>
<span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">            id: base.id,</span></span>
<span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">            title: base.title,</span></span>
<span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">            directory: base.directory,</span></span>
<span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">457</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">        const name = title()</span></span>
<span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">        const result = await sdk.session.create({</span></span>
<span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">          title: name,</span></span>
<span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">          permission: rules,</span></span>
<span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">        const id = result.data?.id</span></span>
<span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">        if (!id) {</span></span>
<span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">          return</span></span>
<span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">467</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">        return {</span></span>
<span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">          id,</span></span>
<span class="source-line"><span class="source-line-number">470</span><span class="source-line-text">          title: result.data?.title ?? name,</span></span>
<span class="source-line"><span class="source-line-number">471</span><span class="source-line-text">          directory: result.data?.directory,</span></span>
<span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">474</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">      async function share(sdk: OpencodeClient, sessionID: string) {</span></span>
<span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">        const cfg = await sdk.config.get()</span></span>
<span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">        if (!cfg.data) return</span></span>
<span class="source-line"><span class="source-line-number">478</span><span class="source-line-text">        if (cfg.data.share !== &quot;auto&quot; &amp;&amp; !flags.autoShare &amp;&amp; !args.share) return</span></span>
<span class="source-line"><span class="source-line-number">479</span><span class="source-line-text">        const res = await sdk.session.share({ sessionID }).catch((error) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">          if (error instanceof Error &amp;&amp; error.message.includes(&quot;disabled&quot;)) {</span></span>
<span class="source-line"><span class="source-line-number">481</span><span class="source-line-text">            UI.println(UI.Style.TEXT_DANGER_BOLD + &quot;!  &quot; + error.message)</span></span>
<span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">483</span><span class="source-line-text">          return { error }</span></span>
<span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">        if (!res.error &amp;&amp; &quot;data&quot; in res &amp;&amp; res.data?.share?.url) {</span></span>
<span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">          UI.println(UI.Style.TEXT_INFO_BOLD + &quot;~  &quot; + res.data.share.url)</span></span>
<span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">489</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">      async function createFreshSession(</span></span>
<span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">        sdk: OpencodeClient,</span></span>
<span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">        input: { agent: string | undefined; model: ModelInput | undefined; variant: string | undefined },</span></span>
<span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">      ): Promise&lt;SessionInfo&gt; {</span></span>
<span class="source-line"><span class="source-line-number">494</span><span class="source-line-text">        const result = await sdk.session.create({</span></span>
<span class="source-line"><span class="source-line-number">495</span><span class="source-line-text">          title: args.title !== undefined &amp;&amp; args.title !== &quot;&quot; ? args.title : undefined,</span></span>
<span class="source-line"><span class="source-line-number">496</span><span class="source-line-text">          agent: input.agent,</span></span>
<span class="source-line"><span class="source-line-number">497</span><span class="source-line-text">          model: input.model</span></span>
<span class="source-line"><span class="source-line-number">498</span><span class="source-line-text">            ? {</span></span>
<span class="source-line"><span class="source-line-number">499</span><span class="source-line-text">                providerID: input.model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">500</span><span class="source-line-text">                id: input.model.modelID,</span></span>
<span class="source-line"><span class="source-line-number">501</span><span class="source-line-text">                variant: input.variant,</span></span>
<span class="source-line"><span class="source-line-number">502</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">503</span><span class="source-line-text">            : undefined,</span></span>
<span class="source-line"><span class="source-line-number">504</span><span class="source-line-text">          permission: rules,</span></span>
<span class="source-line"><span class="source-line-number">505</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">506</span><span class="source-line-text">        const id = result.data?.id</span></span>
<span class="source-line"><span class="source-line-number">507</span><span class="source-line-text">        if (!id) {</span></span>
<span class="source-line"><span class="source-line-number">508</span><span class="source-line-text">          throw new Error(&quot;Failed to create session&quot;)</span></span>
<span class="source-line"><span class="source-line-number">509</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">510</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">511</span><span class="source-line-text">        void share(sdk, id).catch(() =&gt; {})</span></span>
<span class="source-line"><span class="source-line-number">512</span><span class="source-line-text">        return {</span></span>
<span class="source-line"><span class="source-line-number">513</span><span class="source-line-text">          id,</span></span>
<span class="source-line"><span class="source-line-number">514</span><span class="source-line-text">          title: result.data?.title,</span></span>
<span class="source-line"><span class="source-line-number">515</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">516</span><span class="source-line-text">      }</span></span></code></pre>
</details>：创建、继续、fork session。
7. <details class="source-ref source-ref--inline">
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
</details>：订阅事件并调用 session prompt/command。

### 5.1 源码速查：按调用顺序展开

第一次读不用在编辑器里来回跳文件，先按下面的顺序展开源码卡片：从 package 的 `bin` 入口开始，看 `index.ts` 怎么注册根命令，再看 `RunCommand` 如何把命令行输入整理成 session prompt。

<details class="source-ref">
  <summary>
    <span class="source-ref-title">package bin：opencode 命令指向可执行入口</span>
    <span class="source-ref-path"><code>packages/opencode/package.json:21-23</code></span>
  </summary>
  <p class="source-ref-note">安装后用户敲 opencode，先进入这个 package 暴露的 bin，再由启动脚本加载 TypeScript 入口。</p>
<pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">  &quot;bin&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">    &quot;opencode&quot;: &quot;./bin/opencode&quot;</span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  },</span></span></code></pre>
</details>

<details class="source-ref">
  <summary>
    <span class="source-ref-title">index.ts：从 process.argv 到 yargs 全局中间件</span>
    <span class="source-ref-path"><code>packages/opencode/src/index.ts:58-110</code></span>
  </summary>
  <p class="source-ref-note">这里是 CLI main 的核心启动段：拿 argv、创建 yargs、注册全局 option，并初始化日志和进程环境变量。</p>
<pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">const args = hideBin(process.argv)</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">function show(out: string) {</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">  const text = out.trimStart()</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">  if (!text.startsWith(&quot;opencode &quot;)) {</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">    process.stderr.write(UI.logo() + EOL + EOL)</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    process.stderr.write(text)</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">    return</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">  process.stderr.write(out)</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">const cli = yargs(args)</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">  .parserConfiguration({ &quot;populate--&quot;: true })</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">  .scriptName(&quot;opencode&quot;)</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">  .wrap(100)</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">  .help(&quot;help&quot;, &quot;show help&quot;)</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  .alias(&quot;help&quot;, &quot;h&quot;)</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">  .version(&quot;version&quot;, &quot;show version number&quot;, InstallationVersion)</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">  .alias(&quot;version&quot;, &quot;v&quot;)</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">  .option(&quot;print-logs&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">    describe: &quot;print logs to stderr&quot;,</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">    type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">  .option(&quot;log-level&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">    describe: &quot;log level&quot;,</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">    type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">    choices: [&quot;DEBUG&quot;, &quot;INFO&quot;, &quot;WARN&quot;, &quot;ERROR&quot;],</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">  .option(&quot;pure&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">    describe: &quot;run without external plugins&quot;,</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">    type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">  .middleware(async (opts) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">    if (opts.pure) {</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">      process.env.OPENCODE_PURE = &quot;1&quot;</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">    await Log.init({</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">      print: process.argv.includes(&quot;--print-logs&quot;),</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">      dev: Installation.isLocal(),</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">      level: (() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">        if (opts.logLevel) return opts.logLevel as Log.Level</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">        if (Installation.isLocal()) return &quot;DEBUG&quot;</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">        return &quot;INFO&quot;</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">      })(),</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">    Heap.start()</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">    process.env.AGENT = &quot;1&quot;</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">    process.env.OPENCODE = &quot;1&quot;</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">    process.env.OPENCODE_PID = String(process.pid)</span></span></code></pre>
</details>

<details class="source-ref">
  <summary>
    <span class="source-ref-title">index.ts：注册 RunCommand、ServeCommand 等子命令</span>
    <span class="source-ref-path"><code>packages/opencode/src/index.ts:158-180</code></span>
  </summary>
  <p class="source-ref-note">这段决定 opencode 这个根命令下面能接哪些子命令，RunCommand 就是在这里挂进去的。</p>
<pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">  .command(AcpCommand)</span></span>
<span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">  .command(McpCommand)</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">  .command(TuiThreadCommand)</span></span>
<span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">  .command(AttachCommand)</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">  .command(RunCommand)</span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">  .command(GenerateCommand)</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">  .command(DebugCommand)</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">  .command(ConsoleCommand)</span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">  .command(ProvidersCommand)</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">  .command(AgentCommand)</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">  .command(UpgradeCommand)</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">  .command(UninstallCommand)</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">  .command(ServeCommand)</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">  .command(WebCommand)</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">  .command(ModelsCommand)</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">  .command(StatsCommand)</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">  .command(ExportCommand)</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">  .command(ImportCommand)</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">  .command(GithubCommand)</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">  .command(PrCommand)</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">  .command(SessionCommand)</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">  .command(PluginCommand)</span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">  .command(DbCommand)</span></span></code></pre>
</details>

<details class="source-ref">
  <summary>
    <span class="source-ref-title">effectCmd：给每个 CLI handler 套运行时外壳</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/effect-cmd.ts:70-93</code></span>
  </summary>
  <p class="source-ref-note">它统一处理 InstanceContext 加载、Effect runtime 执行和 finally 清理，让具体命令只写业务逻辑。</p>
<pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">export const effectCmd = &lt;Args, A&gt;(opts: EffectCmdOpts&lt;Args, A&gt;) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">  cmd&lt;{}, Args&gt;({</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">    command: opts.command,</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">    aliases: opts.aliases,</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">    describe: opts.describe,</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">    builder: opts.builder as never,</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">    async handler(rawArgs) {</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">      // yargs typing wraps Args in ArgumentsCamelCase&lt;WithDoubleDash&lt;...&gt;&gt;; cast at the boundary.</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">      const args = rawArgs as unknown as WithDoubleDash&lt;Args&gt;</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">      const useInstance = typeof opts.instance === &quot;function&quot; ? opts.instance(args) : opts.instance !== false</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">      if (!useInstance) {</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">        await AppRuntime.runPromise(opts.handler(args))</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">        return</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">      const directory = opts.directory?.(args) ?? process.cwd()</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">      const { store, ctx } = await AppRuntime.runPromise(</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">        InstanceStore.Service.use((store) =&gt; store.load({ directory }).pipe(Effect.map((ctx) =&gt; ({ store, ctx })))),</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">      try {</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">        await AppRuntime.runPromise(opts.handler(args).pipe(Effect.provideService(InstanceRef, ctx)))</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">      } finally {</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">        await AppRuntime.runPromise(store.dispose(ctx))</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">    },</span></span></code></pre>
</details>

<details class="source-ref">
  <summary>
    <span class="source-ref-title">RunCommand：定义 run [message..] 和参数面</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:127-245</code></span>
  </summary>
  <p class="source-ref-note">这段展示 run 命令为什么不是简单字符串输入，而是包含 session、model、agent、file、attach、interactive 等完整入口。</p>
<pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">export const RunCommand = effectCmd({</span></span>
<span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">  command: &quot;run [message..]&quot;,</span></span>
<span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">  describe: &quot;run opencode with a message&quot;,</span></span>
<span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">  // --attach connects to a remote server (no local instance needed); the</span></span>
<span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">  // default path runs an in-process server and needs the project instance.</span></span>
<span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">  instance: (args) =&gt; !args.attach,</span></span>
<span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">  // For --dir without --attach, load instance for the resolved target dir.</span></span>
<span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">  // The handler also chdirs (preserving the legacy order: chdir → file resolution).</span></span>
<span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">  directory: (args) =&gt; (args.dir &amp;&amp; !args.attach ? path.resolve(process.cwd(), args.dir) : process.cwd()),</span></span>
<span class="source-line"><span class="source-line-number">136</span><span class="source-line-text">  builder: (yargs: Argv) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">137</span><span class="source-line-text">    yargs</span></span>
<span class="source-line"><span class="source-line-number">138</span><span class="source-line-text">      .positional(&quot;message&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">139</span><span class="source-line-text">        describe: &quot;message to send&quot;,</span></span>
<span class="source-line"><span class="source-line-number">140</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">141</span><span class="source-line-text">        array: true,</span></span>
<span class="source-line"><span class="source-line-number">142</span><span class="source-line-text">        default: [],</span></span>
<span class="source-line"><span class="source-line-number">143</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">144</span><span class="source-line-text">      .option(&quot;command&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">145</span><span class="source-line-text">        describe: &quot;the command to run, use message for args&quot;,</span></span>
<span class="source-line"><span class="source-line-number">146</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">147</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">148</span><span class="source-line-text">      .option(&quot;continue&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">149</span><span class="source-line-text">        alias: [&quot;c&quot;],</span></span>
<span class="source-line"><span class="source-line-number">150</span><span class="source-line-text">        describe: &quot;continue the last session&quot;,</span></span>
<span class="source-line"><span class="source-line-number">151</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">153</span><span class="source-line-text">      .option(&quot;session&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">        alias: [&quot;s&quot;],</span></span>
<span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">        describe: &quot;session id to continue&quot;,</span></span>
<span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">157</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">      .option(&quot;fork&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">        describe: &quot;fork the session before continuing (requires --continue or --session)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">      .option(&quot;share&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">        describe: &quot;share the session&quot;,</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">      .option(&quot;model&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">        alias: [&quot;m&quot;],</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">        describe: &quot;model to use in the format of provider/model&quot;,</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">      .option(&quot;agent&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">        describe: &quot;agent to use&quot;,</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">      .option(&quot;format&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">        choices: [&quot;default&quot;, &quot;json&quot;],</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">        default: &quot;default&quot;,</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">        describe: &quot;format: default (formatted) or json (raw JSON events)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">      .option(&quot;file&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">        alias: [&quot;f&quot;],</span></span>
<span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">        array: true,</span></span>
<span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">        describe: &quot;file(s) to attach to message&quot;,</span></span>
<span class="source-line"><span class="source-line-number">186</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">      .option(&quot;title&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">        describe: &quot;title for the session (uses truncated prompt if no value provided)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">      .option(&quot;attach&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">        describe: &quot;attach to a running opencode server (e.g., http://localhost:4096)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      .option(&quot;password&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">        alias: [&quot;p&quot;],</span></span>
<span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">        describe: &quot;basic auth password (defaults to OPENCODE_SERVER_PASSWORD)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">      .option(&quot;username&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">        alias: [&quot;u&quot;],</span></span>
<span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">        describe: &quot;basic auth username (defaults to OPENCODE_SERVER_USERNAME or 'opencode')&quot;,</span></span>
<span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">      .option(&quot;dir&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">        describe: &quot;directory to run in, path on remote server if attaching&quot;,</span></span>
<span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">209</span><span class="source-line-text">      .option(&quot;port&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">        type: &quot;number&quot;,</span></span>
<span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">        describe: &quot;port for the local server (defaults to random port if no value provided)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">      .option(&quot;variant&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">        describe: &quot;model variant (provider-specific reasoning effort, e.g., high, max, minimal)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">      .option(&quot;thinking&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">        describe: &quot;show thinking blocks&quot;,</span></span>
<span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">221</span><span class="source-line-text">      .option(&quot;replay&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">        default: false,</span></span>
<span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">        describe: &quot;replay visible session history on interactive resume&quot;,</span></span>
<span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">226</span><span class="source-line-text">      .option(&quot;replay-limit&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">        type: &quot;number&quot;,</span></span>
<span class="source-line"><span class="source-line-number">228</span><span class="source-line-text">        describe: &quot;cap visible interactive replay to the newest N messages&quot;,</span></span>
<span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">      .option(&quot;interactive&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">231</span><span class="source-line-text">        alias: [&quot;i&quot;],</span></span>
<span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">233</span><span class="source-line-text">        describe: &quot;run in direct interactive split-footer mode&quot;,</span></span>
<span class="source-line"><span class="source-line-number">234</span><span class="source-line-text">        default: false,</span></span>
<span class="source-line"><span class="source-line-number">235</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">      .option(&quot;dangerously-skip-permissions&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">237</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">        describe: &quot;auto-approve permissions that are not explicitly denied (dangerous!)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">239</span><span class="source-line-text">        default: false,</span></span>
<span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">      .option(&quot;demo&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">243</span><span class="source-line-text">        default: false,</span></span>
<span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">        describe: &quot;enable direct interactive demo slash commands; pass one as the message to run it immediately&quot;,</span></span>
<span class="source-line"><span class="source-line-number">245</span><span class="source-line-text">      }),</span></span></code></pre>
</details>

<details class="source-ref">
  <summary>
    <span class="source-ref-title">RunCommand：解析 --file 和 piped stdin</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:334-358</code></span>
  </summary>
  <p class="source-ref-note">用户输入会被拆成 file parts 和 text part，后面一起交给 session prompt。</p>
<pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">      const files: FilePart[] = []</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">      if (args.file) {</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">        const list = Array.isArray(args.file) ? args.file : [args.file]</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">        for (const filePath of list) {</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text">          const resolvedPath = path.resolve(args.attach ? root : (directory ?? root), filePath)</span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">          if (!(await Filesystem.exists(resolvedPath))) {</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">            UI.error(`File not found: ${filePath}`)</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text">            process.exit(1)</span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">          const mime = (await Filesystem.isDir(resolvedPath)) ? &quot;application/x-directory&quot; : &quot;text/plain&quot;</span></span>
<span class="source-line"><span class="source-line-number">346</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">          files.push({</span></span>
<span class="source-line"><span class="source-line-number">348</span><span class="source-line-text">            type: &quot;file&quot;,</span></span>
<span class="source-line"><span class="source-line-number">349</span><span class="source-line-text">            url: pathToFileURL(resolvedPath).href,</span></span>
<span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">            filename: path.basename(resolvedPath),</span></span>
<span class="source-line"><span class="source-line-number">351</span><span class="source-line-text">            mime,</span></span>
<span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">353</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">355</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">356</span><span class="source-line-text">      const piped = process.stdin.isTTY ? undefined : await Bun.stdin.text()</span></span>
<span class="source-line"><span class="source-line-number">357</span><span class="source-line-text">      message = resolveRunInput(message, piped) ?? &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">358</span><span class="source-line-text">      const initialInput = resolveRunInput(rawMessage, piped)</span></span></code></pre>
</details>

<details class="source-ref">
  <summary>
    <span class="source-ref-title">RunCommand：创建、继续和 fork session</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:396-516</code></span>
  </summary>
  <p class="source-ref-note">coding agent 需要可恢复上下文，所以 CLI 在真正 prompt 前会先确定 session。</p>
<pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">396</span><span class="source-line-text">      async function session(sdk: OpencodeClient): Promise&lt;SessionInfo | undefined&gt; {</span></span>
<span class="source-line"><span class="source-line-number">397</span><span class="source-line-text">        if (args.session) {</span></span>
<span class="source-line"><span class="source-line-number">398</span><span class="source-line-text">          const current = await sdk.session</span></span>
<span class="source-line"><span class="source-line-number">399</span><span class="source-line-text">            .get({</span></span>
<span class="source-line"><span class="source-line-number">400</span><span class="source-line-text">              sessionID: args.session,</span></span>
<span class="source-line"><span class="source-line-number">401</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">402</span><span class="source-line-text">            .catch(() =&gt; undefined)</span></span>
<span class="source-line"><span class="source-line-number">403</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">404</span><span class="source-line-text">          if (!current?.data) {</span></span>
<span class="source-line"><span class="source-line-number">405</span><span class="source-line-text">            UI.error(&quot;Session not found&quot;)</span></span>
<span class="source-line"><span class="source-line-number">406</span><span class="source-line-text">            process.exit(1)</span></span>
<span class="source-line"><span class="source-line-number">407</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">408</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">409</span><span class="source-line-text">          if (args.fork) {</span></span>
<span class="source-line"><span class="source-line-number">410</span><span class="source-line-text">            const forked = await sdk.session.fork({</span></span>
<span class="source-line"><span class="source-line-number">411</span><span class="source-line-text">              sessionID: args.session,</span></span>
<span class="source-line"><span class="source-line-number">412</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">413</span><span class="source-line-text">            const id = forked.data?.id</span></span>
<span class="source-line"><span class="source-line-number">414</span><span class="source-line-text">            if (!id) {</span></span>
<span class="source-line"><span class="source-line-number">415</span><span class="source-line-text">              return</span></span>
<span class="source-line"><span class="source-line-number">416</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">417</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">418</span><span class="source-line-text">            return {</span></span>
<span class="source-line"><span class="source-line-number">419</span><span class="source-line-text">              id,</span></span>
<span class="source-line"><span class="source-line-number">420</span><span class="source-line-text">              title: forked.data?.title ?? current.data.title,</span></span>
<span class="source-line"><span class="source-line-number">421</span><span class="source-line-text">              directory: forked.data?.directory ?? current.data.directory,</span></span>
<span class="source-line"><span class="source-line-number">422</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">423</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">424</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">425</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">426</span><span class="source-line-text">            id: current.data.id,</span></span>
<span class="source-line"><span class="source-line-number">427</span><span class="source-line-text">            title: current.data.title,</span></span>
<span class="source-line"><span class="source-line-number">428</span><span class="source-line-text">            directory: current.data.directory,</span></span>
<span class="source-line"><span class="source-line-number">429</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">430</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">431</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">432</span><span class="source-line-text">        const base = args.continue ? (await sdk.session.list()).data?.find((item) =&gt; !item.parentID) : undefined</span></span>
<span class="source-line"><span class="source-line-number">433</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">434</span><span class="source-line-text">        if (base &amp;&amp; args.fork) {</span></span>
<span class="source-line"><span class="source-line-number">435</span><span class="source-line-text">          const forked = await sdk.session.fork({</span></span>
<span class="source-line"><span class="source-line-number">436</span><span class="source-line-text">            sessionID: base.id,</span></span>
<span class="source-line"><span class="source-line-number">437</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">438</span><span class="source-line-text">          const id = forked.data?.id</span></span>
<span class="source-line"><span class="source-line-number">439</span><span class="source-line-text">          if (!id) {</span></span>
<span class="source-line"><span class="source-line-number">440</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">441</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">442</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">443</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">444</span><span class="source-line-text">            id,</span></span>
<span class="source-line"><span class="source-line-number">445</span><span class="source-line-text">            title: forked.data?.title ?? base.title,</span></span>
<span class="source-line"><span class="source-line-number">446</span><span class="source-line-text">            directory: forked.data?.directory ?? base.directory,</span></span>
<span class="source-line"><span class="source-line-number">447</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">448</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">449</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">450</span><span class="source-line-text">        if (base) {</span></span>
<span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">            id: base.id,</span></span>
<span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">            title: base.title,</span></span>
<span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">            directory: base.directory,</span></span>
<span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">457</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">        const name = title()</span></span>
<span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">        const result = await sdk.session.create({</span></span>
<span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">          title: name,</span></span>
<span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">          permission: rules,</span></span>
<span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">        const id = result.data?.id</span></span>
<span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">        if (!id) {</span></span>
<span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">          return</span></span>
<span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">467</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">        return {</span></span>
<span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">          id,</span></span>
<span class="source-line"><span class="source-line-number">470</span><span class="source-line-text">          title: result.data?.title ?? name,</span></span>
<span class="source-line"><span class="source-line-number">471</span><span class="source-line-text">          directory: result.data?.directory,</span></span>
<span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">474</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">      async function share(sdk: OpencodeClient, sessionID: string) {</span></span>
<span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">        const cfg = await sdk.config.get()</span></span>
<span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">        if (!cfg.data) return</span></span>
<span class="source-line"><span class="source-line-number">478</span><span class="source-line-text">        if (cfg.data.share !== &quot;auto&quot; &amp;&amp; !flags.autoShare &amp;&amp; !args.share) return</span></span>
<span class="source-line"><span class="source-line-number">479</span><span class="source-line-text">        const res = await sdk.session.share({ sessionID }).catch((error) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">          if (error instanceof Error &amp;&amp; error.message.includes(&quot;disabled&quot;)) {</span></span>
<span class="source-line"><span class="source-line-number">481</span><span class="source-line-text">            UI.println(UI.Style.TEXT_DANGER_BOLD + &quot;!  &quot; + error.message)</span></span>
<span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">483</span><span class="source-line-text">          return { error }</span></span>
<span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">        if (!res.error &amp;&amp; &quot;data&quot; in res &amp;&amp; res.data?.share?.url) {</span></span>
<span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">          UI.println(UI.Style.TEXT_INFO_BOLD + &quot;~  &quot; + res.data.share.url)</span></span>
<span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">489</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">      async function createFreshSession(</span></span>
<span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">        sdk: OpencodeClient,</span></span>
<span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">        input: { agent: string | undefined; model: ModelInput | undefined; variant: string | undefined },</span></span>
<span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">      ): Promise&lt;SessionInfo&gt; {</span></span>
<span class="source-line"><span class="source-line-number">494</span><span class="source-line-text">        const result = await sdk.session.create({</span></span>
<span class="source-line"><span class="source-line-number">495</span><span class="source-line-text">          title: args.title !== undefined &amp;&amp; args.title !== &quot;&quot; ? args.title : undefined,</span></span>
<span class="source-line"><span class="source-line-number">496</span><span class="source-line-text">          agent: input.agent,</span></span>
<span class="source-line"><span class="source-line-number">497</span><span class="source-line-text">          model: input.model</span></span>
<span class="source-line"><span class="source-line-number">498</span><span class="source-line-text">            ? {</span></span>
<span class="source-line"><span class="source-line-number">499</span><span class="source-line-text">                providerID: input.model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">500</span><span class="source-line-text">                id: input.model.modelID,</span></span>
<span class="source-line"><span class="source-line-number">501</span><span class="source-line-text">                variant: input.variant,</span></span>
<span class="source-line"><span class="source-line-number">502</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">503</span><span class="source-line-text">            : undefined,</span></span>
<span class="source-line"><span class="source-line-number">504</span><span class="source-line-text">          permission: rules,</span></span>
<span class="source-line"><span class="source-line-number">505</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">506</span><span class="source-line-text">        const id = result.data?.id</span></span>
<span class="source-line"><span class="source-line-number">507</span><span class="source-line-text">        if (!id) {</span></span>
<span class="source-line"><span class="source-line-number">508</span><span class="source-line-text">          throw new Error(&quot;Failed to create session&quot;)</span></span>
<span class="source-line"><span class="source-line-number">509</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">510</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">511</span><span class="source-line-text">        void share(sdk, id).catch(() =&gt; {})</span></span>
<span class="source-line"><span class="source-line-number">512</span><span class="source-line-text">        return {</span></span>
<span class="source-line"><span class="source-line-number">513</span><span class="source-line-text">          id,</span></span>
<span class="source-line"><span class="source-line-number">514</span><span class="source-line-text">          title: result.data?.title,</span></span>
<span class="source-line"><span class="source-line-number">515</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">516</span><span class="source-line-text">      }</span></span></code></pre>
</details>

<details class="source-ref">
  <summary>
    <span class="source-ref-title">RunCommand：事件订阅 loop 如何渲染输出</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:637-759</code></span>
  </summary>
  <p class="source-ref-note">模型回复、tool 执行、错误、权限请求都会变成事件，CLI 只是订阅并渲染这些事件。</p>
<pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">637</span><span class="source-line-text">        async function loop(client: OpencodeClient, events: Awaited&lt;ReturnType&lt;typeof sdk.event.subscribe&gt;&gt;) {</span></span>
<span class="source-line"><span class="source-line-number">638</span><span class="source-line-text">          const toggles = new Map&lt;string, boolean&gt;()</span></span>
<span class="source-line"><span class="source-line-number">639</span><span class="source-line-text">          let error: string | undefined</span></span>
<span class="source-line"><span class="source-line-number">640</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">641</span><span class="source-line-text">          for await (const event of events.stream) {</span></span>
<span class="source-line"><span class="source-line-number">642</span><span class="source-line-text">            if (</span></span>
<span class="source-line"><span class="source-line-number">643</span><span class="source-line-text">              event.type === &quot;message.updated&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">644</span><span class="source-line-text">              event.properties.sessionID === sessionID &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">645</span><span class="source-line-text">              event.properties.info.role === &quot;assistant&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">646</span><span class="source-line-text">              args.format !== &quot;json&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">647</span><span class="source-line-text">              toggles.get(&quot;start&quot;) !== true</span></span>
<span class="source-line"><span class="source-line-number">648</span><span class="source-line-text">            ) {</span></span>
<span class="source-line"><span class="source-line-number">649</span><span class="source-line-text">              UI.empty()</span></span>
<span class="source-line"><span class="source-line-number">650</span><span class="source-line-text">              UI.println(`&gt; ${event.properties.info.agent} · ${event.properties.info.modelID}`)</span></span>
<span class="source-line"><span class="source-line-number">651</span><span class="source-line-text">              UI.empty()</span></span>
<span class="source-line"><span class="source-line-number">652</span><span class="source-line-text">              toggles.set(&quot;start&quot;, true)</span></span>
<span class="source-line"><span class="source-line-number">653</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">654</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">655</span><span class="source-line-text">            if (event.type === &quot;message.part.updated&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">656</span><span class="source-line-text">              const part = event.properties.part</span></span>
<span class="source-line"><span class="source-line-number">657</span><span class="source-line-text">              if (part.sessionID !== sessionID) continue</span></span>
<span class="source-line"><span class="source-line-number">658</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">659</span><span class="source-line-text">              if (part.type === &quot;tool&quot; &amp;&amp; (part.state.status === &quot;completed&quot; || part.state.status === &quot;error&quot;)) {</span></span>
<span class="source-line"><span class="source-line-number">660</span><span class="source-line-text">                if (emit(&quot;tool_use&quot;, { part })) continue</span></span>
<span class="source-line"><span class="source-line-number">661</span><span class="source-line-text">                if (part.state.status === &quot;completed&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">662</span><span class="source-line-text">                  await tool(part)</span></span>
<span class="source-line"><span class="source-line-number">663</span><span class="source-line-text">                  continue</span></span>
<span class="source-line"><span class="source-line-number">664</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">665</span><span class="source-line-text">                await toolError(part)</span></span>
<span class="source-line"><span class="source-line-number">666</span><span class="source-line-text">                UI.error(part.state.error)</span></span>
<span class="source-line"><span class="source-line-number">667</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">668</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">669</span><span class="source-line-text">              if (</span></span>
<span class="source-line"><span class="source-line-number">670</span><span class="source-line-text">                part.type === &quot;tool&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">671</span><span class="source-line-text">                part.tool === &quot;task&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">672</span><span class="source-line-text">                part.state.status === &quot;running&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">673</span><span class="source-line-text">                args.format !== &quot;json&quot;</span></span>
<span class="source-line"><span class="source-line-number">674</span><span class="source-line-text">              ) {</span></span>
<span class="source-line"><span class="source-line-number">675</span><span class="source-line-text">                if (toggles.get(part.id) === true) continue</span></span>
<span class="source-line"><span class="source-line-number">676</span><span class="source-line-text">                await tool(part)</span></span>
<span class="source-line"><span class="source-line-number">677</span><span class="source-line-text">                toggles.set(part.id, true)</span></span>
<span class="source-line"><span class="source-line-number">678</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">679</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">680</span><span class="source-line-text">              if (part.type === &quot;step-start&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">681</span><span class="source-line-text">                if (emit(&quot;step_start&quot;, { part })) continue</span></span>
<span class="source-line"><span class="source-line-number">682</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">683</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">684</span><span class="source-line-text">              if (part.type === &quot;step-finish&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">685</span><span class="source-line-text">                if (emit(&quot;step_finish&quot;, { part })) continue</span></span>
<span class="source-line"><span class="source-line-number">686</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">687</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">688</span><span class="source-line-text">              if (part.type === &quot;text&quot; &amp;&amp; part.time?.end) {</span></span>
<span class="source-line"><span class="source-line-number">689</span><span class="source-line-text">                if (emit(&quot;text&quot;, { part })) continue</span></span>
<span class="source-line"><span class="source-line-number">690</span><span class="source-line-text">                const text = part.text.trim()</span></span>
<span class="source-line"><span class="source-line-number">691</span><span class="source-line-text">                if (!text) continue</span></span>
<span class="source-line"><span class="source-line-number">692</span><span class="source-line-text">                if (!process.stdout.isTTY) {</span></span>
<span class="source-line"><span class="source-line-number">693</span><span class="source-line-text">                  process.stdout.write(text + EOL)</span></span>
<span class="source-line"><span class="source-line-number">694</span><span class="source-line-text">                  continue</span></span>
<span class="source-line"><span class="source-line-number">695</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">696</span><span class="source-line-text">                UI.empty()</span></span>
<span class="source-line"><span class="source-line-number">697</span><span class="source-line-text">                UI.println(text)</span></span>
<span class="source-line"><span class="source-line-number">698</span><span class="source-line-text">                UI.empty()</span></span>
<span class="source-line"><span class="source-line-number">699</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">700</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">701</span><span class="source-line-text">              if (part.type === &quot;reasoning&quot; &amp;&amp; part.time?.end &amp;&amp; thinking) {</span></span>
<span class="source-line"><span class="source-line-number">702</span><span class="source-line-text">                if (emit(&quot;reasoning&quot;, { part })) continue</span></span>
<span class="source-line"><span class="source-line-number">703</span><span class="source-line-text">                const text = part.text.trim()</span></span>
<span class="source-line"><span class="source-line-number">704</span><span class="source-line-text">                if (!text) continue</span></span>
<span class="source-line"><span class="source-line-number">705</span><span class="source-line-text">                const line = `Thinking: ${text}`</span></span>
<span class="source-line"><span class="source-line-number">706</span><span class="source-line-text">                if (process.stdout.isTTY) {</span></span>
<span class="source-line"><span class="source-line-number">707</span><span class="source-line-text">                  UI.empty()</span></span>
<span class="source-line"><span class="source-line-number">708</span><span class="source-line-text">                  UI.println(`${UI.Style.TEXT_DIM}\u001b[3m${line}\u001b[0m${UI.Style.TEXT_NORMAL}`)</span></span>
<span class="source-line"><span class="source-line-number">709</span><span class="source-line-text">                  UI.empty()</span></span>
<span class="source-line"><span class="source-line-number">710</span><span class="source-line-text">                  continue</span></span>
<span class="source-line"><span class="source-line-number">711</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">712</span><span class="source-line-text">                process.stdout.write(line + EOL)</span></span>
<span class="source-line"><span class="source-line-number">713</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">714</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">715</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">716</span><span class="source-line-text">            if (event.type === &quot;session.error&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">717</span><span class="source-line-text">              const props = event.properties</span></span>
<span class="source-line"><span class="source-line-number">718</span><span class="source-line-text">              if (props.sessionID !== sessionID || !props.error) continue</span></span>
<span class="source-line"><span class="source-line-number">719</span><span class="source-line-text">              let err = String(props.error.name)</span></span>
<span class="source-line"><span class="source-line-number">720</span><span class="source-line-text">              if (&quot;data&quot; in props.error &amp;&amp; props.error.data &amp;&amp; &quot;message&quot; in props.error.data) {</span></span>
<span class="source-line"><span class="source-line-number">721</span><span class="source-line-text">                err = String(props.error.data.message)</span></span>
<span class="source-line"><span class="source-line-number">722</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">723</span><span class="source-line-text">              error = error ? error + EOL + err : err</span></span>
<span class="source-line"><span class="source-line-number">724</span><span class="source-line-text">              if (emit(&quot;error&quot;, { error: props.error })) continue</span></span>
<span class="source-line"><span class="source-line-number">725</span><span class="source-line-text">              UI.error(err)</span></span>
<span class="source-line"><span class="source-line-number">726</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">727</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">728</span><span class="source-line-text">            if (</span></span>
<span class="source-line"><span class="source-line-number">729</span><span class="source-line-text">              event.type === &quot;session.status&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">730</span><span class="source-line-text">              event.properties.sessionID === sessionID &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">731</span><span class="source-line-text">              event.properties.status.type === &quot;idle&quot;</span></span>
<span class="source-line"><span class="source-line-number">732</span><span class="source-line-text">            ) {</span></span>
<span class="source-line"><span class="source-line-number">733</span><span class="source-line-text">              break</span></span>
<span class="source-line"><span class="source-line-number">734</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">735</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">736</span><span class="source-line-text">            if (event.type === &quot;permission.asked&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">737</span><span class="source-line-text">              const permission = event.properties</span></span>
<span class="source-line"><span class="source-line-number">738</span><span class="source-line-text">              if (permission.sessionID !== sessionID) continue</span></span>
<span class="source-line"><span class="source-line-number">739</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">740</span><span class="source-line-text">              if (args[&quot;dangerously-skip-permissions&quot;]) {</span></span>
<span class="source-line"><span class="source-line-number">741</span><span class="source-line-text">                await client.permission.reply({</span></span>
<span class="source-line"><span class="source-line-number">742</span><span class="source-line-text">                  requestID: permission.id,</span></span>
<span class="source-line"><span class="source-line-number">743</span><span class="source-line-text">                  reply: &quot;once&quot;,</span></span>
<span class="source-line"><span class="source-line-number">744</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">745</span><span class="source-line-text">              } else {</span></span>
<span class="source-line"><span class="source-line-number">746</span><span class="source-line-text">                UI.println(</span></span>
<span class="source-line"><span class="source-line-number">747</span><span class="source-line-text">                  UI.Style.TEXT_WARNING_BOLD + &quot;!&quot;,</span></span>
<span class="source-line"><span class="source-line-number">748</span><span class="source-line-text">                  UI.Style.TEXT_NORMAL +</span></span>
<span class="source-line"><span class="source-line-number">749</span><span class="source-line-text">                    `permission requested: ${permission.permission} (${permission.patterns.join(&quot;, &quot;)}); auto-rejecting`,</span></span>
<span class="source-line"><span class="source-line-number">750</span><span class="source-line-text">                )</span></span>
<span class="source-line"><span class="source-line-number">751</span><span class="source-line-text">                await client.permission.reply({</span></span>
<span class="source-line"><span class="source-line-number">752</span><span class="source-line-text">                  requestID: permission.id,</span></span>
<span class="source-line"><span class="source-line-number">753</span><span class="source-line-text">                  reply: &quot;reject&quot;,</span></span>
<span class="source-line"><span class="source-line-number">754</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">755</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">756</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">757</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">758</span><span class="source-line-text">          return error</span></span>
<span class="source-line"><span class="source-line-number">759</span><span class="source-line-text">        }</span></span></code></pre>
</details>

<details class="source-ref">
  <summary>
    <span class="source-ref-title">RunCommand：调用 session prompt，并在本地模式复用 Server.Default</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:768-879</code></span>
  </summary>
  <p class="source-ref-note">非交互模式订阅事件后调用 client.session.prompt；本地模式通过 in-process fetch 进入同一套 server handler。</p>
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

## 6. 用户输入到 agent 行动的整体链路

```text
process.argv
  -> hideBin
  -> yargs(args)
  -> RunCommand handler
  -> resolve message/stdin/files/session
  -> createOpencodeClient
  -> client.session.prompt
  -> session HTTP handler
  -> SessionPrompt.prompt
```

关键片段：

```ts
const args = hideBin(process.argv)

const cli = yargs(args)
  .scriptName("opencode")
  .option("pure", { describe: "run without external plugins", type: "boolean" })
  .middleware(async (opts) => {
    if (opts.pure) {
      process.env.OPENCODE_PURE = "1"
    }
    await Log.init({ print: process.argv.includes("--print-logs") })
    process.env.AGENT = "1"
    process.env.OPENCODE = "1"
    process.env.OPENCODE_PID = String(process.pid)
  })
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/index.ts:58-110</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">const args = hideBin(process.argv)</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">function show(out: string) {</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">  const text = out.trimStart()</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">  if (!text.startsWith(&quot;opencode &quot;)) {</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">    process.stderr.write(UI.logo() + EOL + EOL)</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    process.stderr.write(text)</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">    return</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">  process.stderr.write(out)</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">const cli = yargs(args)</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">  .parserConfiguration({ &quot;populate--&quot;: true })</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">  .scriptName(&quot;opencode&quot;)</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">  .wrap(100)</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">  .help(&quot;help&quot;, &quot;show help&quot;)</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  .alias(&quot;help&quot;, &quot;h&quot;)</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">  .version(&quot;version&quot;, &quot;show version number&quot;, InstallationVersion)</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">  .alias(&quot;version&quot;, &quot;v&quot;)</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">  .option(&quot;print-logs&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">    describe: &quot;print logs to stderr&quot;,</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">    type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">  .option(&quot;log-level&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">    describe: &quot;log level&quot;,</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">    type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">    choices: [&quot;DEBUG&quot;, &quot;INFO&quot;, &quot;WARN&quot;, &quot;ERROR&quot;],</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">  .option(&quot;pure&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">    describe: &quot;run without external plugins&quot;,</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">    type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">  .middleware(async (opts) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">    if (opts.pure) {</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">      process.env.OPENCODE_PURE = &quot;1&quot;</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">    await Log.init({</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">      print: process.argv.includes(&quot;--print-logs&quot;),</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">      dev: Installation.isLocal(),</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">      level: (() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">        if (opts.logLevel) return opts.logLevel as Log.Level</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">        if (Installation.isLocal()) return &quot;DEBUG&quot;</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">        return &quot;INFO&quot;</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">      })(),</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">    Heap.start()</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">    process.env.AGENT = &quot;1&quot;</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">    process.env.OPENCODE = &quot;1&quot;</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">    process.env.OPENCODE_PID = String(process.pid)</span></span></code></pre>
</details>

```ts
.command(RunCommand)
.command(ServeCommand)
.command(WebCommand)
.command(SessionCommand)
.command(PluginCommand)
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/index.ts:158-180</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">  .command(AcpCommand)</span></span>
<span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">  .command(McpCommand)</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">  .command(TuiThreadCommand)</span></span>
<span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">  .command(AttachCommand)</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">  .command(RunCommand)</span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">  .command(GenerateCommand)</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">  .command(DebugCommand)</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">  .command(ConsoleCommand)</span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">  .command(ProvidersCommand)</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">  .command(AgentCommand)</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">  .command(UpgradeCommand)</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">  .command(UninstallCommand)</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">  .command(ServeCommand)</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">  .command(WebCommand)</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">  .command(ModelsCommand)</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">  .command(StatsCommand)</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">  .command(ExportCommand)</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">  .command(ImportCommand)</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">  .command(GithubCommand)</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">  .command(PrCommand)</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">  .command(SessionCommand)</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">  .command(PluginCommand)</span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">  .command(DbCommand)</span></span></code></pre>
</details>

## 7. 核心源码逐段讲解

### 7.1 顶层错误兜底

```ts
process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", { e: errorMessage(e) })
})

process.on("uncaughtException", (e) => {
  Log.Default.error("exception", { e: errorMessage(e) })
})
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/index.ts:46-56</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">process.on(&quot;unhandledRejection&quot;, (e) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">  Log.Default.error(&quot;rejection&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">    e: errorMessage(e),</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">})</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">process.on(&quot;uncaughtException&quot;, (e) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">  Log.Default.error(&quot;exception&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">    e: errorMessage(e),</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">})</span></span></code></pre>
</details>

这是 CLI 进程级兜底，避免 promise rejection 或未捕获异常悄悄丢失。

### 7.2 yargs 注册全局参数和中间件

```ts
const cli = yargs(args)
  .scriptName("opencode")
  .help("help", "show help")
  .option("print-logs", { type: "boolean" })
  .option("log-level", { choices: ["DEBUG", "INFO", "WARN", "ERROR"] })
  .option("pure", { describe: "run without external plugins", type: "boolean" })
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/index.ts:70-90</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">const cli = yargs(args)</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">  .parserConfiguration({ &quot;populate--&quot;: true })</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">  .scriptName(&quot;opencode&quot;)</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">  .wrap(100)</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">  .help(&quot;help&quot;, &quot;show help&quot;)</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  .alias(&quot;help&quot;, &quot;h&quot;)</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">  .version(&quot;version&quot;, &quot;show version number&quot;, InstallationVersion)</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">  .alias(&quot;version&quot;, &quot;v&quot;)</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">  .option(&quot;print-logs&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">    describe: &quot;print logs to stderr&quot;,</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">    type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">  .option(&quot;log-level&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">    describe: &quot;log level&quot;,</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">    type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">    choices: [&quot;DEBUG&quot;, &quot;INFO&quot;, &quot;WARN&quot;, &quot;ERROR&quot;],</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">  .option(&quot;pure&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">    describe: &quot;run without external plugins&quot;,</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">    type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">  })</span></span></code></pre>
</details>

中间件初始化日志、Heap 和环境变量。Java 类比：Spring Boot 启动前的 global filter/bootstrap hook。

### 7.3 `effectCmd`：命令 handler 的运行时外壳

```ts
const useInstance = typeof opts.instance === "function" ? opts.instance(args) : opts.instance !== false
if (!useInstance) {
  await AppRuntime.runPromise(opts.handler(args))
  return
}
const directory = opts.directory?.(args) ?? process.cwd()
const { store, ctx } = await AppRuntime.runPromise(
  InstanceStore.Service.use((store) => store.load({ directory }).pipe(Effect.map((ctx) => ({ store, ctx })))),
)
try {
  await AppRuntime.runPromise(opts.handler(args).pipe(Effect.provideService(InstanceRef, ctx)))
} finally {
  await AppRuntime.runPromise(store.dispose(ctx))
}
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/effect-cmd.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/effect-cmd.ts:70-93</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">export const effectCmd = &lt;Args, A&gt;(opts: EffectCmdOpts&lt;Args, A&gt;) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">  cmd&lt;{}, Args&gt;({</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">    command: opts.command,</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">    aliases: opts.aliases,</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">    describe: opts.describe,</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">    builder: opts.builder as never,</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">    async handler(rawArgs) {</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">      // yargs typing wraps Args in ArgumentsCamelCase&lt;WithDoubleDash&lt;...&gt;&gt;; cast at the boundary.</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">      const args = rawArgs as unknown as WithDoubleDash&lt;Args&gt;</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">      const useInstance = typeof opts.instance === &quot;function&quot; ? opts.instance(args) : opts.instance !== false</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">      if (!useInstance) {</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">        await AppRuntime.runPromise(opts.handler(args))</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">        return</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">      const directory = opts.directory?.(args) ?? process.cwd()</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">      const { store, ctx } = await AppRuntime.runPromise(</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">        InstanceStore.Service.use((store) =&gt; store.load({ directory }).pipe(Effect.map((ctx) =&gt; ({ store, ctx })))),</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">      try {</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">        await AppRuntime.runPromise(opts.handler(args).pipe(Effect.provideService(InstanceRef, ctx)))</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">      } finally {</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">        await AppRuntime.runPromise(store.dispose(ctx))</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">    },</span></span></code></pre>
</details>

这段是 CLI 的关键工程设计：命令本身不用关心项目实例怎么加载和释放，`effectCmd` 统一处理。`run --attach` 不需要本地 instance，所以 `RunCommand` 的 `instance: (args) => !args.attach` 会跳过本地项目加载。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:127-135</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">export const RunCommand = effectCmd({</span></span>
<span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">  command: &quot;run [message..]&quot;,</span></span>
<span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">  describe: &quot;run opencode with a message&quot;,</span></span>
<span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">  // --attach connects to a remote server (no local instance needed); the</span></span>
<span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">  // default path runs an in-process server and needs the project instance.</span></span>
<span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">  instance: (args) =&gt; !args.attach,</span></span>
<span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">  // For --dir without --attach, load instance for the resolved target dir.</span></span>
<span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">  // The handler also chdirs (preserving the legacy order: chdir → file resolution).</span></span>
<span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">  directory: (args) =&gt; (args.dir &amp;&amp; !args.attach ? path.resolve(process.cwd(), args.dir) : process.cwd()),</span></span></code></pre>
</details>。

### 7.4 `RunCommand` 参数面很宽

`RunCommand` 支持 message、command、continue、session、fork、share、model、agent、format、file、attach、dir、interactive、dangerously-skip-permissions 等。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:127-245</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">export const RunCommand = effectCmd({</span></span>
<span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">  command: &quot;run [message..]&quot;,</span></span>
<span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">  describe: &quot;run opencode with a message&quot;,</span></span>
<span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">  // --attach connects to a remote server (no local instance needed); the</span></span>
<span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">  // default path runs an in-process server and needs the project instance.</span></span>
<span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">  instance: (args) =&gt; !args.attach,</span></span>
<span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">  // For --dir without --attach, load instance for the resolved target dir.</span></span>
<span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">  // The handler also chdirs (preserving the legacy order: chdir → file resolution).</span></span>
<span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">  directory: (args) =&gt; (args.dir &amp;&amp; !args.attach ? path.resolve(process.cwd(), args.dir) : process.cwd()),</span></span>
<span class="source-line"><span class="source-line-number">136</span><span class="source-line-text">  builder: (yargs: Argv) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">137</span><span class="source-line-text">    yargs</span></span>
<span class="source-line"><span class="source-line-number">138</span><span class="source-line-text">      .positional(&quot;message&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">139</span><span class="source-line-text">        describe: &quot;message to send&quot;,</span></span>
<span class="source-line"><span class="source-line-number">140</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">141</span><span class="source-line-text">        array: true,</span></span>
<span class="source-line"><span class="source-line-number">142</span><span class="source-line-text">        default: [],</span></span>
<span class="source-line"><span class="source-line-number">143</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">144</span><span class="source-line-text">      .option(&quot;command&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">145</span><span class="source-line-text">        describe: &quot;the command to run, use message for args&quot;,</span></span>
<span class="source-line"><span class="source-line-number">146</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">147</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">148</span><span class="source-line-text">      .option(&quot;continue&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">149</span><span class="source-line-text">        alias: [&quot;c&quot;],</span></span>
<span class="source-line"><span class="source-line-number">150</span><span class="source-line-text">        describe: &quot;continue the last session&quot;,</span></span>
<span class="source-line"><span class="source-line-number">151</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">153</span><span class="source-line-text">      .option(&quot;session&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">        alias: [&quot;s&quot;],</span></span>
<span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">        describe: &quot;session id to continue&quot;,</span></span>
<span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">157</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">      .option(&quot;fork&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">        describe: &quot;fork the session before continuing (requires --continue or --session)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">      .option(&quot;share&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">        describe: &quot;share the session&quot;,</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">      .option(&quot;model&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">        alias: [&quot;m&quot;],</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">        describe: &quot;model to use in the format of provider/model&quot;,</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">      .option(&quot;agent&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">        describe: &quot;agent to use&quot;,</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">      .option(&quot;format&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">        choices: [&quot;default&quot;, &quot;json&quot;],</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">        default: &quot;default&quot;,</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">        describe: &quot;format: default (formatted) or json (raw JSON events)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">      .option(&quot;file&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">        alias: [&quot;f&quot;],</span></span>
<span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">        array: true,</span></span>
<span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">        describe: &quot;file(s) to attach to message&quot;,</span></span>
<span class="source-line"><span class="source-line-number">186</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">      .option(&quot;title&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">        describe: &quot;title for the session (uses truncated prompt if no value provided)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">      .option(&quot;attach&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">        describe: &quot;attach to a running opencode server (e.g., http://localhost:4096)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      .option(&quot;password&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">        alias: [&quot;p&quot;],</span></span>
<span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">        describe: &quot;basic auth password (defaults to OPENCODE_SERVER_PASSWORD)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">      .option(&quot;username&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">        alias: [&quot;u&quot;],</span></span>
<span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">        describe: &quot;basic auth username (defaults to OPENCODE_SERVER_USERNAME or 'opencode')&quot;,</span></span>
<span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">      .option(&quot;dir&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">        describe: &quot;directory to run in, path on remote server if attaching&quot;,</span></span>
<span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">209</span><span class="source-line-text">      .option(&quot;port&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">        type: &quot;number&quot;,</span></span>
<span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">        describe: &quot;port for the local server (defaults to random port if no value provided)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">      .option(&quot;variant&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">        type: &quot;string&quot;,</span></span>
<span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">        describe: &quot;model variant (provider-specific reasoning effort, e.g., high, max, minimal)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">      .option(&quot;thinking&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">        describe: &quot;show thinking blocks&quot;,</span></span>
<span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">221</span><span class="source-line-text">      .option(&quot;replay&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">        default: false,</span></span>
<span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">        describe: &quot;replay visible session history on interactive resume&quot;,</span></span>
<span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">226</span><span class="source-line-text">      .option(&quot;replay-limit&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">        type: &quot;number&quot;,</span></span>
<span class="source-line"><span class="source-line-number">228</span><span class="source-line-text">        describe: &quot;cap visible interactive replay to the newest N messages&quot;,</span></span>
<span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">      .option(&quot;interactive&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">231</span><span class="source-line-text">        alias: [&quot;i&quot;],</span></span>
<span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">233</span><span class="source-line-text">        describe: &quot;run in direct interactive split-footer mode&quot;,</span></span>
<span class="source-line"><span class="source-line-number">234</span><span class="source-line-text">        default: false,</span></span>
<span class="source-line"><span class="source-line-number">235</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">      .option(&quot;dangerously-skip-permissions&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">237</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">        describe: &quot;auto-approve permissions that are not explicitly denied (dangerous!)&quot;,</span></span>
<span class="source-line"><span class="source-line-number">239</span><span class="source-line-text">        default: false,</span></span>
<span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">      })</span></span>
<span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">      .option(&quot;demo&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">        type: &quot;boolean&quot;,</span></span>
<span class="source-line"><span class="source-line-number">243</span><span class="source-line-text">        default: false,</span></span>
<span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">        describe: &quot;enable direct interactive demo slash commands; pass one as the message to run it immediately&quot;,</span></span>
<span class="source-line"><span class="source-line-number">245</span><span class="source-line-text">      }),</span></span></code></pre>
</details>。

这说明 CLI 不只是“把字符串发给模型”，它还负责会话选择、模型选择、文件附件、交互模式和权限策略。

### 7.5 文件附件和 stdin

```ts
const files: FilePart[] = []
if (args.file) {
  const list = Array.isArray(args.file) ? args.file : [args.file]
  for (const filePath of list) {
    const resolvedPath = path.resolve(args.attach ? root : (directory ?? root), filePath)
    if (!(await Filesystem.exists(resolvedPath))) {
      UI.error(`File not found: ${filePath}`)
      process.exit(1)
    }
    files.push({
      type: "file",
      url: pathToFileURL(resolvedPath).href,
      filename: path.basename(resolvedPath),
      mime,
    })
  }
}

const piped = process.stdin.isTTY ? undefined : await Bun.stdin.text()
message = resolveRunInput(message, piped) ?? ""
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:334-358</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">      const files: FilePart[] = []</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">      if (args.file) {</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">        const list = Array.isArray(args.file) ? args.file : [args.file]</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">        for (const filePath of list) {</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text">          const resolvedPath = path.resolve(args.attach ? root : (directory ?? root), filePath)</span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">          if (!(await Filesystem.exists(resolvedPath))) {</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">            UI.error(`File not found: ${filePath}`)</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text">            process.exit(1)</span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">          const mime = (await Filesystem.isDir(resolvedPath)) ? &quot;application/x-directory&quot; : &quot;text/plain&quot;</span></span>
<span class="source-line"><span class="source-line-number">346</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">          files.push({</span></span>
<span class="source-line"><span class="source-line-number">348</span><span class="source-line-text">            type: &quot;file&quot;,</span></span>
<span class="source-line"><span class="source-line-number">349</span><span class="source-line-text">            url: pathToFileURL(resolvedPath).href,</span></span>
<span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">            filename: path.basename(resolvedPath),</span></span>
<span class="source-line"><span class="source-line-number">351</span><span class="source-line-text">            mime,</span></span>
<span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">353</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">355</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">356</span><span class="source-line-text">      const piped = process.stdin.isTTY ? undefined : await Bun.stdin.text()</span></span>
<span class="source-line"><span class="source-line-number">357</span><span class="source-line-text">      message = resolveRunInput(message, piped) ?? &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">358</span><span class="source-line-text">      const initialInput = resolveRunInput(rawMessage, piped)</span></span></code></pre>
</details>

TS 里的 `FilePart[]` 是编译期类型；真正传给 runtime 的是普通对象数组。

### 7.6 session 创建、继续和 fork

```ts
if (args.session) {
  const current = await sdk.session.get({ sessionID: args.session }).catch(() => undefined)
  if (args.fork) {
    const forked = await sdk.session.fork({ sessionID: args.session })
    return { id, title: forked.data?.title ?? current.data.title }
  }
  return { id: current.data.id, title: current.data.title, directory: current.data.directory }
}

const base = args.continue ? (await sdk.session.list()).data?.find((item) => !item.parentID) : undefined
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:396-456</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">396</span><span class="source-line-text">      async function session(sdk: OpencodeClient): Promise&lt;SessionInfo | undefined&gt; {</span></span>
<span class="source-line"><span class="source-line-number">397</span><span class="source-line-text">        if (args.session) {</span></span>
<span class="source-line"><span class="source-line-number">398</span><span class="source-line-text">          const current = await sdk.session</span></span>
<span class="source-line"><span class="source-line-number">399</span><span class="source-line-text">            .get({</span></span>
<span class="source-line"><span class="source-line-number">400</span><span class="source-line-text">              sessionID: args.session,</span></span>
<span class="source-line"><span class="source-line-number">401</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">402</span><span class="source-line-text">            .catch(() =&gt; undefined)</span></span>
<span class="source-line"><span class="source-line-number">403</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">404</span><span class="source-line-text">          if (!current?.data) {</span></span>
<span class="source-line"><span class="source-line-number">405</span><span class="source-line-text">            UI.error(&quot;Session not found&quot;)</span></span>
<span class="source-line"><span class="source-line-number">406</span><span class="source-line-text">            process.exit(1)</span></span>
<span class="source-line"><span class="source-line-number">407</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">408</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">409</span><span class="source-line-text">          if (args.fork) {</span></span>
<span class="source-line"><span class="source-line-number">410</span><span class="source-line-text">            const forked = await sdk.session.fork({</span></span>
<span class="source-line"><span class="source-line-number">411</span><span class="source-line-text">              sessionID: args.session,</span></span>
<span class="source-line"><span class="source-line-number">412</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">413</span><span class="source-line-text">            const id = forked.data?.id</span></span>
<span class="source-line"><span class="source-line-number">414</span><span class="source-line-text">            if (!id) {</span></span>
<span class="source-line"><span class="source-line-number">415</span><span class="source-line-text">              return</span></span>
<span class="source-line"><span class="source-line-number">416</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">417</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">418</span><span class="source-line-text">            return {</span></span>
<span class="source-line"><span class="source-line-number">419</span><span class="source-line-text">              id,</span></span>
<span class="source-line"><span class="source-line-number">420</span><span class="source-line-text">              title: forked.data?.title ?? current.data.title,</span></span>
<span class="source-line"><span class="source-line-number">421</span><span class="source-line-text">              directory: forked.data?.directory ?? current.data.directory,</span></span>
<span class="source-line"><span class="source-line-number">422</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">423</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">424</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">425</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">426</span><span class="source-line-text">            id: current.data.id,</span></span>
<span class="source-line"><span class="source-line-number">427</span><span class="source-line-text">            title: current.data.title,</span></span>
<span class="source-line"><span class="source-line-number">428</span><span class="source-line-text">            directory: current.data.directory,</span></span>
<span class="source-line"><span class="source-line-number">429</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">430</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">431</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">432</span><span class="source-line-text">        const base = args.continue ? (await sdk.session.list()).data?.find((item) =&gt; !item.parentID) : undefined</span></span>
<span class="source-line"><span class="source-line-number">433</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">434</span><span class="source-line-text">        if (base &amp;&amp; args.fork) {</span></span>
<span class="source-line"><span class="source-line-number">435</span><span class="source-line-text">          const forked = await sdk.session.fork({</span></span>
<span class="source-line"><span class="source-line-number">436</span><span class="source-line-text">            sessionID: base.id,</span></span>
<span class="source-line"><span class="source-line-number">437</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">438</span><span class="source-line-text">          const id = forked.data?.id</span></span>
<span class="source-line"><span class="source-line-number">439</span><span class="source-line-text">          if (!id) {</span></span>
<span class="source-line"><span class="source-line-number">440</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">441</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">442</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">443</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">444</span><span class="source-line-text">            id,</span></span>
<span class="source-line"><span class="source-line-number">445</span><span class="source-line-text">            title: forked.data?.title ?? base.title,</span></span>
<span class="source-line"><span class="source-line-number">446</span><span class="source-line-text">            directory: forked.data?.directory ?? base.directory,</span></span>
<span class="source-line"><span class="source-line-number">447</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">448</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">449</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">450</span><span class="source-line-text">        if (base) {</span></span>
<span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">            id: base.id,</span></span>
<span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">            title: base.title,</span></span>
<span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">            directory: base.directory,</span></span>
<span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">        }</span></span></code></pre>
</details>

这段解释了为什么 CLI 是 session-aware 的：agent 任务需要可恢复的上下文，而不是一次性进程。

### 7.7 事件订阅驱动输出

```ts
const events = await client.event.subscribe()
loop(client, events).catch((e) => {
  console.error(e)
  process.exit(1)
})
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:768-773</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">768</span><span class="source-line-text">        if (!args.interactive) {</span></span>
<span class="source-line"><span class="source-line-number">769</span><span class="source-line-text">          const events = await client.event.subscribe()</span></span>
<span class="source-line"><span class="source-line-number">770</span><span class="source-line-text">          loop(client, events).catch((e) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">771</span><span class="source-line-text">            console.error(e)</span></span>
<span class="source-line"><span class="source-line-number">772</span><span class="source-line-text">            process.exit(1)</span></span>
<span class="source-line"><span class="source-line-number">773</span><span class="source-line-text">          })</span></span></code></pre>
</details>

事件 loop 监听 `message.updated`、`message.part.updated`、`session.error`、`session.status`、`permission.asked`。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:637-759</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">637</span><span class="source-line-text">        async function loop(client: OpencodeClient, events: Awaited&lt;ReturnType&lt;typeof sdk.event.subscribe&gt;&gt;) {</span></span>
<span class="source-line"><span class="source-line-number">638</span><span class="source-line-text">          const toggles = new Map&lt;string, boolean&gt;()</span></span>
<span class="source-line"><span class="source-line-number">639</span><span class="source-line-text">          let error: string | undefined</span></span>
<span class="source-line"><span class="source-line-number">640</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">641</span><span class="source-line-text">          for await (const event of events.stream) {</span></span>
<span class="source-line"><span class="source-line-number">642</span><span class="source-line-text">            if (</span></span>
<span class="source-line"><span class="source-line-number">643</span><span class="source-line-text">              event.type === &quot;message.updated&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">644</span><span class="source-line-text">              event.properties.sessionID === sessionID &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">645</span><span class="source-line-text">              event.properties.info.role === &quot;assistant&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">646</span><span class="source-line-text">              args.format !== &quot;json&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">647</span><span class="source-line-text">              toggles.get(&quot;start&quot;) !== true</span></span>
<span class="source-line"><span class="source-line-number">648</span><span class="source-line-text">            ) {</span></span>
<span class="source-line"><span class="source-line-number">649</span><span class="source-line-text">              UI.empty()</span></span>
<span class="source-line"><span class="source-line-number">650</span><span class="source-line-text">              UI.println(`&gt; ${event.properties.info.agent} · ${event.properties.info.modelID}`)</span></span>
<span class="source-line"><span class="source-line-number">651</span><span class="source-line-text">              UI.empty()</span></span>
<span class="source-line"><span class="source-line-number">652</span><span class="source-line-text">              toggles.set(&quot;start&quot;, true)</span></span>
<span class="source-line"><span class="source-line-number">653</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">654</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">655</span><span class="source-line-text">            if (event.type === &quot;message.part.updated&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">656</span><span class="source-line-text">              const part = event.properties.part</span></span>
<span class="source-line"><span class="source-line-number">657</span><span class="source-line-text">              if (part.sessionID !== sessionID) continue</span></span>
<span class="source-line"><span class="source-line-number">658</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">659</span><span class="source-line-text">              if (part.type === &quot;tool&quot; &amp;&amp; (part.state.status === &quot;completed&quot; || part.state.status === &quot;error&quot;)) {</span></span>
<span class="source-line"><span class="source-line-number">660</span><span class="source-line-text">                if (emit(&quot;tool_use&quot;, { part })) continue</span></span>
<span class="source-line"><span class="source-line-number">661</span><span class="source-line-text">                if (part.state.status === &quot;completed&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">662</span><span class="source-line-text">                  await tool(part)</span></span>
<span class="source-line"><span class="source-line-number">663</span><span class="source-line-text">                  continue</span></span>
<span class="source-line"><span class="source-line-number">664</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">665</span><span class="source-line-text">                await toolError(part)</span></span>
<span class="source-line"><span class="source-line-number">666</span><span class="source-line-text">                UI.error(part.state.error)</span></span>
<span class="source-line"><span class="source-line-number">667</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">668</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">669</span><span class="source-line-text">              if (</span></span>
<span class="source-line"><span class="source-line-number">670</span><span class="source-line-text">                part.type === &quot;tool&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">671</span><span class="source-line-text">                part.tool === &quot;task&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">672</span><span class="source-line-text">                part.state.status === &quot;running&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">673</span><span class="source-line-text">                args.format !== &quot;json&quot;</span></span>
<span class="source-line"><span class="source-line-number">674</span><span class="source-line-text">              ) {</span></span>
<span class="source-line"><span class="source-line-number">675</span><span class="source-line-text">                if (toggles.get(part.id) === true) continue</span></span>
<span class="source-line"><span class="source-line-number">676</span><span class="source-line-text">                await tool(part)</span></span>
<span class="source-line"><span class="source-line-number">677</span><span class="source-line-text">                toggles.set(part.id, true)</span></span>
<span class="source-line"><span class="source-line-number">678</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">679</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">680</span><span class="source-line-text">              if (part.type === &quot;step-start&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">681</span><span class="source-line-text">                if (emit(&quot;step_start&quot;, { part })) continue</span></span>
<span class="source-line"><span class="source-line-number">682</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">683</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">684</span><span class="source-line-text">              if (part.type === &quot;step-finish&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">685</span><span class="source-line-text">                if (emit(&quot;step_finish&quot;, { part })) continue</span></span>
<span class="source-line"><span class="source-line-number">686</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">687</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">688</span><span class="source-line-text">              if (part.type === &quot;text&quot; &amp;&amp; part.time?.end) {</span></span>
<span class="source-line"><span class="source-line-number">689</span><span class="source-line-text">                if (emit(&quot;text&quot;, { part })) continue</span></span>
<span class="source-line"><span class="source-line-number">690</span><span class="source-line-text">                const text = part.text.trim()</span></span>
<span class="source-line"><span class="source-line-number">691</span><span class="source-line-text">                if (!text) continue</span></span>
<span class="source-line"><span class="source-line-number">692</span><span class="source-line-text">                if (!process.stdout.isTTY) {</span></span>
<span class="source-line"><span class="source-line-number">693</span><span class="source-line-text">                  process.stdout.write(text + EOL)</span></span>
<span class="source-line"><span class="source-line-number">694</span><span class="source-line-text">                  continue</span></span>
<span class="source-line"><span class="source-line-number">695</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">696</span><span class="source-line-text">                UI.empty()</span></span>
<span class="source-line"><span class="source-line-number">697</span><span class="source-line-text">                UI.println(text)</span></span>
<span class="source-line"><span class="source-line-number">698</span><span class="source-line-text">                UI.empty()</span></span>
<span class="source-line"><span class="source-line-number">699</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">700</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">701</span><span class="source-line-text">              if (part.type === &quot;reasoning&quot; &amp;&amp; part.time?.end &amp;&amp; thinking) {</span></span>
<span class="source-line"><span class="source-line-number">702</span><span class="source-line-text">                if (emit(&quot;reasoning&quot;, { part })) continue</span></span>
<span class="source-line"><span class="source-line-number">703</span><span class="source-line-text">                const text = part.text.trim()</span></span>
<span class="source-line"><span class="source-line-number">704</span><span class="source-line-text">                if (!text) continue</span></span>
<span class="source-line"><span class="source-line-number">705</span><span class="source-line-text">                const line = `Thinking: ${text}`</span></span>
<span class="source-line"><span class="source-line-number">706</span><span class="source-line-text">                if (process.stdout.isTTY) {</span></span>
<span class="source-line"><span class="source-line-number">707</span><span class="source-line-text">                  UI.empty()</span></span>
<span class="source-line"><span class="source-line-number">708</span><span class="source-line-text">                  UI.println(`${UI.Style.TEXT_DIM}\u001b[3m${line}\u001b[0m${UI.Style.TEXT_NORMAL}`)</span></span>
<span class="source-line"><span class="source-line-number">709</span><span class="source-line-text">                  UI.empty()</span></span>
<span class="source-line"><span class="source-line-number">710</span><span class="source-line-text">                  continue</span></span>
<span class="source-line"><span class="source-line-number">711</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">712</span><span class="source-line-text">                process.stdout.write(line + EOL)</span></span>
<span class="source-line"><span class="source-line-number">713</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">714</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">715</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">716</span><span class="source-line-text">            if (event.type === &quot;session.error&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">717</span><span class="source-line-text">              const props = event.properties</span></span>
<span class="source-line"><span class="source-line-number">718</span><span class="source-line-text">              if (props.sessionID !== sessionID || !props.error) continue</span></span>
<span class="source-line"><span class="source-line-number">719</span><span class="source-line-text">              let err = String(props.error.name)</span></span>
<span class="source-line"><span class="source-line-number">720</span><span class="source-line-text">              if (&quot;data&quot; in props.error &amp;&amp; props.error.data &amp;&amp; &quot;message&quot; in props.error.data) {</span></span>
<span class="source-line"><span class="source-line-number">721</span><span class="source-line-text">                err = String(props.error.data.message)</span></span>
<span class="source-line"><span class="source-line-number">722</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">723</span><span class="source-line-text">              error = error ? error + EOL + err : err</span></span>
<span class="source-line"><span class="source-line-number">724</span><span class="source-line-text">              if (emit(&quot;error&quot;, { error: props.error })) continue</span></span>
<span class="source-line"><span class="source-line-number">725</span><span class="source-line-text">              UI.error(err)</span></span>
<span class="source-line"><span class="source-line-number">726</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">727</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">728</span><span class="source-line-text">            if (</span></span>
<span class="source-line"><span class="source-line-number">729</span><span class="source-line-text">              event.type === &quot;session.status&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">730</span><span class="source-line-text">              event.properties.sessionID === sessionID &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">731</span><span class="source-line-text">              event.properties.status.type === &quot;idle&quot;</span></span>
<span class="source-line"><span class="source-line-number">732</span><span class="source-line-text">            ) {</span></span>
<span class="source-line"><span class="source-line-number">733</span><span class="source-line-text">              break</span></span>
<span class="source-line"><span class="source-line-number">734</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">735</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">736</span><span class="source-line-text">            if (event.type === &quot;permission.asked&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">737</span><span class="source-line-text">              const permission = event.properties</span></span>
<span class="source-line"><span class="source-line-number">738</span><span class="source-line-text">              if (permission.sessionID !== sessionID) continue</span></span>
<span class="source-line"><span class="source-line-number">739</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">740</span><span class="source-line-text">              if (args[&quot;dangerously-skip-permissions&quot;]) {</span></span>
<span class="source-line"><span class="source-line-number">741</span><span class="source-line-text">                await client.permission.reply({</span></span>
<span class="source-line"><span class="source-line-number">742</span><span class="source-line-text">                  requestID: permission.id,</span></span>
<span class="source-line"><span class="source-line-number">743</span><span class="source-line-text">                  reply: &quot;once&quot;,</span></span>
<span class="source-line"><span class="source-line-number">744</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">745</span><span class="source-line-text">              } else {</span></span>
<span class="source-line"><span class="source-line-number">746</span><span class="source-line-text">                UI.println(</span></span>
<span class="source-line"><span class="source-line-number">747</span><span class="source-line-text">                  UI.Style.TEXT_WARNING_BOLD + &quot;!&quot;,</span></span>
<span class="source-line"><span class="source-line-number">748</span><span class="source-line-text">                  UI.Style.TEXT_NORMAL +</span></span>
<span class="source-line"><span class="source-line-number">749</span><span class="source-line-text">                    `permission requested: ${permission.permission} (${permission.patterns.join(&quot;, &quot;)}); auto-rejecting`,</span></span>
<span class="source-line"><span class="source-line-number">750</span><span class="source-line-text">                )</span></span>
<span class="source-line"><span class="source-line-number">751</span><span class="source-line-text">                await client.permission.reply({</span></span>
<span class="source-line"><span class="source-line-number">752</span><span class="source-line-text">                  requestID: permission.id,</span></span>
<span class="source-line"><span class="source-line-number">753</span><span class="source-line-text">                  reply: &quot;reject&quot;,</span></span>
<span class="source-line"><span class="source-line-number">754</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">755</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">756</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">757</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">758</span><span class="source-line-text">          return error</span></span>
<span class="source-line"><span class="source-line-number">759</span><span class="source-line-text">        }</span></span></code></pre>
</details>。

这就是 CLI 的“UI 层”：agent runtime 更新 message parts，CLI 只负责把事件渲染出来。

### 7.8 本地模式复用 Server.Default

```ts
const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const { Server } = await import("@/server/server")
  const request = new Request(input, init)
  return Server.Default().app.fetch(request)
}) as typeof globalThis.fetch
const sdk = createOpencodeClient({
  baseUrl: "http://opencode.internal",
  fetch: fetchFn,
  directory,
})
await execute(sdk)
```

路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:869-879</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">869</span><span class="source-line-text">      const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) =&gt; {</span></span>
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

这是很值得学的一点：本地 CLI 不绕过 API，而是构造一个 in-process fetch，让 SDK 走同一套 server handler。

## 8. 关键 TypeScript 语法复习

- default import：`import yargs from "yargs"`，路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/index.ts:1</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1</span><span class="source-line-text">import yargs from &quot;yargs&quot;</span></span></code></pre>
</details>。
- named import：`import { RunCommand } from "./cli/cmd/run"`，路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/index.ts:3</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">3</span><span class="source-line-text">import { RunCommand } from &quot;./cli/cmd/run&quot;</span></span></code></pre>
</details>。
- namespace import：`import * as Log from "@opencode-ai/core/util/log"`，路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/index.ts:5</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">5</span><span class="source-line-text">import * as Log from &quot;@opencode-ai/core/util/log&quot;</span></span></code></pre>
</details>。
- arrow function：`.middleware(async (opts) => { ... })`，路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/index.ts:91-110</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">  .middleware(async (opts) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">    if (opts.pure) {</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">      process.env.OPENCODE_PURE = &quot;1&quot;</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">    }</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">    await Log.init({</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">      print: process.argv.includes(&quot;--print-logs&quot;),</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">      dev: Installation.isLocal(),</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">      level: (() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">        if (opts.logLevel) return opts.logLevel as Log.Level</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">        if (Installation.isLocal()) return &quot;DEBUG&quot;</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">        return &quot;INFO&quot;</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">      })(),</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">    Heap.start()</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">    process.env.AGENT = &quot;1&quot;</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">    process.env.OPENCODE = &quot;1&quot;</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">    process.env.OPENCODE_PID = String(process.pid)</span></span></code></pre>
</details>。
- 泛型函数：`export const effectCmd = <Args, A>(opts: EffectCmdOpts<Args, A>) => ...`，路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/effect-cmd.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/effect-cmd.ts:70</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">export const effectCmd = &lt;Args, A&gt;(opts: EffectCmdOpts&lt;Args, A&gt;) =&gt;</span></span></code></pre>
</details>。
- optional property：`directory?: (args: Args) => string`，路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/effect-cmd.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/effect-cmd.ts:48-49</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">  /** Defaults to process.cwd(). Override for commands that take a directory positional. */</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">  directory?: (args: Args) =&gt; string</span></span></code></pre>
</details>。
- object spread：`parts: [...files, { type: "text", text: message }]`，路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:791-798</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">791</span><span class="source-line-text">          const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">792</span><span class="source-line-text">          const result = await client.session.prompt({</span></span>
<span class="source-line"><span class="source-line-number">793</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">794</span><span class="source-line-text">            agent,</span></span>
<span class="source-line"><span class="source-line-number">795</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">796</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">797</span><span class="source-line-text">            parts: [...files, { type: &quot;text&quot;, text: message }],</span></span>
<span class="source-line"><span class="source-line-number">798</span><span class="source-line-text">          })</span></span></code></pre>
</details>。
- dynamic import：`const { Server } = await import("@/server/server")`，路径：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:869-872</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">869</span><span class="source-line-text">      const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">870</span><span class="source-line-text">        const { Server } = await import(&quot;@/server/server&quot;)</span></span>
<span class="source-line"><span class="source-line-number">871</span><span class="source-line-text">        const request = new Request(input, init)</span></span>
<span class="source-line"><span class="source-line-number">872</span><span class="source-line-text">        return Server.Default().app.fetch(request)</span></span></code></pre>
</details>。

## 9. 涉及的设计模式和架构思想

- Command Pattern：每个 yargs command 是一个命令对象。
- Adapter：CLI 参数适配成 session API payload。
- Interceptor：`effectCmd` 包住 handler，统一 instance 加载/释放。
- Event-driven UI：CLI 订阅事件渲染输出。
- Single runtime path：本地 CLI 和远程 attach 都通过 SDK/API 进入 runtime。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

- Session：`run.ts` 创建/继续/fork session，然后调用 `client.session.prompt`。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:396-516</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">396</span><span class="source-line-text">      async function session(sdk: OpencodeClient): Promise&lt;SessionInfo | undefined&gt; {</span></span>
<span class="source-line"><span class="source-line-number">397</span><span class="source-line-text">        if (args.session) {</span></span>
<span class="source-line"><span class="source-line-number">398</span><span class="source-line-text">          const current = await sdk.session</span></span>
<span class="source-line"><span class="source-line-number">399</span><span class="source-line-text">            .get({</span></span>
<span class="source-line"><span class="source-line-number">400</span><span class="source-line-text">              sessionID: args.session,</span></span>
<span class="source-line"><span class="source-line-number">401</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">402</span><span class="source-line-text">            .catch(() =&gt; undefined)</span></span>
<span class="source-line"><span class="source-line-number">403</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">404</span><span class="source-line-text">          if (!current?.data) {</span></span>
<span class="source-line"><span class="source-line-number">405</span><span class="source-line-text">            UI.error(&quot;Session not found&quot;)</span></span>
<span class="source-line"><span class="source-line-number">406</span><span class="source-line-text">            process.exit(1)</span></span>
<span class="source-line"><span class="source-line-number">407</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">408</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">409</span><span class="source-line-text">          if (args.fork) {</span></span>
<span class="source-line"><span class="source-line-number">410</span><span class="source-line-text">            const forked = await sdk.session.fork({</span></span>
<span class="source-line"><span class="source-line-number">411</span><span class="source-line-text">              sessionID: args.session,</span></span>
<span class="source-line"><span class="source-line-number">412</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">413</span><span class="source-line-text">            const id = forked.data?.id</span></span>
<span class="source-line"><span class="source-line-number">414</span><span class="source-line-text">            if (!id) {</span></span>
<span class="source-line"><span class="source-line-number">415</span><span class="source-line-text">              return</span></span>
<span class="source-line"><span class="source-line-number">416</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">417</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">418</span><span class="source-line-text">            return {</span></span>
<span class="source-line"><span class="source-line-number">419</span><span class="source-line-text">              id,</span></span>
<span class="source-line"><span class="source-line-number">420</span><span class="source-line-text">              title: forked.data?.title ?? current.data.title,</span></span>
<span class="source-line"><span class="source-line-number">421</span><span class="source-line-text">              directory: forked.data?.directory ?? current.data.directory,</span></span>
<span class="source-line"><span class="source-line-number">422</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">423</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">424</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">425</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">426</span><span class="source-line-text">            id: current.data.id,</span></span>
<span class="source-line"><span class="source-line-number">427</span><span class="source-line-text">            title: current.data.title,</span></span>
<span class="source-line"><span class="source-line-number">428</span><span class="source-line-text">            directory: current.data.directory,</span></span>
<span class="source-line"><span class="source-line-number">429</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">430</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">431</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">432</span><span class="source-line-text">        const base = args.continue ? (await sdk.session.list()).data?.find((item) =&gt; !item.parentID) : undefined</span></span>
<span class="source-line"><span class="source-line-number">433</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">434</span><span class="source-line-text">        if (base &amp;&amp; args.fork) {</span></span>
<span class="source-line"><span class="source-line-number">435</span><span class="source-line-text">          const forked = await sdk.session.fork({</span></span>
<span class="source-line"><span class="source-line-number">436</span><span class="source-line-text">            sessionID: base.id,</span></span>
<span class="source-line"><span class="source-line-number">437</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">438</span><span class="source-line-text">          const id = forked.data?.id</span></span>
<span class="source-line"><span class="source-line-number">439</span><span class="source-line-text">          if (!id) {</span></span>
<span class="source-line"><span class="source-line-number">440</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">441</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">442</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">443</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">444</span><span class="source-line-text">            id,</span></span>
<span class="source-line"><span class="source-line-number">445</span><span class="source-line-text">            title: forked.data?.title ?? base.title,</span></span>
<span class="source-line"><span class="source-line-number">446</span><span class="source-line-text">            directory: forked.data?.directory ?? base.directory,</span></span>
<span class="source-line"><span class="source-line-number">447</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">448</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">449</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">450</span><span class="source-line-text">        if (base) {</span></span>
<span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">          return {</span></span>
<span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">            id: base.id,</span></span>
<span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">            title: base.title,</span></span>
<span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">            directory: base.directory,</span></span>
<span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">457</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">        const name = title()</span></span>
<span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">        const result = await sdk.session.create({</span></span>
<span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">          title: name,</span></span>
<span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">          permission: rules,</span></span>
<span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">        const id = result.data?.id</span></span>
<span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">        if (!id) {</span></span>
<span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">          return</span></span>
<span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">467</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">        return {</span></span>
<span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">          id,</span></span>
<span class="source-line"><span class="source-line-number">470</span><span class="source-line-text">          title: result.data?.title ?? name,</span></span>
<span class="source-line"><span class="source-line-number">471</span><span class="source-line-text">          directory: result.data?.directory,</span></span>
<span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">474</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">      async function share(sdk: OpencodeClient, sessionID: string) {</span></span>
<span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">        const cfg = await sdk.config.get()</span></span>
<span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">        if (!cfg.data) return</span></span>
<span class="source-line"><span class="source-line-number">478</span><span class="source-line-text">        if (cfg.data.share !== &quot;auto&quot; &amp;&amp; !flags.autoShare &amp;&amp; !args.share) return</span></span>
<span class="source-line"><span class="source-line-number">479</span><span class="source-line-text">        const res = await sdk.session.share({ sessionID }).catch((error) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">          if (error instanceof Error &amp;&amp; error.message.includes(&quot;disabled&quot;)) {</span></span>
<span class="source-line"><span class="source-line-number">481</span><span class="source-line-text">            UI.println(UI.Style.TEXT_DANGER_BOLD + &quot;!  &quot; + error.message)</span></span>
<span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">483</span><span class="source-line-text">          return { error }</span></span>
<span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">        if (!res.error &amp;&amp; &quot;data&quot; in res &amp;&amp; res.data?.share?.url) {</span></span>
<span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">          UI.println(UI.Style.TEXT_INFO_BOLD + &quot;~  &quot; + res.data.share.url)</span></span>
<span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">489</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">      async function createFreshSession(</span></span>
<span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">        sdk: OpencodeClient,</span></span>
<span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">        input: { agent: string | undefined; model: ModelInput | undefined; variant: string | undefined },</span></span>
<span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">      ): Promise&lt;SessionInfo&gt; {</span></span>
<span class="source-line"><span class="source-line-number">494</span><span class="source-line-text">        const result = await sdk.session.create({</span></span>
<span class="source-line"><span class="source-line-number">495</span><span class="source-line-text">          title: args.title !== undefined &amp;&amp; args.title !== &quot;&quot; ? args.title : undefined,</span></span>
<span class="source-line"><span class="source-line-number">496</span><span class="source-line-text">          agent: input.agent,</span></span>
<span class="source-line"><span class="source-line-number">497</span><span class="source-line-text">          model: input.model</span></span>
<span class="source-line"><span class="source-line-number">498</span><span class="source-line-text">            ? {</span></span>
<span class="source-line"><span class="source-line-number">499</span><span class="source-line-text">                providerID: input.model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">500</span><span class="source-line-text">                id: input.model.modelID,</span></span>
<span class="source-line"><span class="source-line-number">501</span><span class="source-line-text">                variant: input.variant,</span></span>
<span class="source-line"><span class="source-line-number">502</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">503</span><span class="source-line-text">            : undefined,</span></span>
<span class="source-line"><span class="source-line-number">504</span><span class="source-line-text">          permission: rules,</span></span>
<span class="source-line"><span class="source-line-number">505</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">506</span><span class="source-line-text">        const id = result.data?.id</span></span>
<span class="source-line"><span class="source-line-number">507</span><span class="source-line-text">        if (!id) {</span></span>
<span class="source-line"><span class="source-line-number">508</span><span class="source-line-text">          throw new Error(&quot;Failed to create session&quot;)</span></span>
<span class="source-line"><span class="source-line-number">509</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">510</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">511</span><span class="source-line-text">        void share(sdk, id).catch(() =&gt; {})</span></span>
<span class="source-line"><span class="source-line-number">512</span><span class="source-line-text">        return {</span></span>
<span class="source-line"><span class="source-line-number">513</span><span class="source-line-text">          id,</span></span>
<span class="source-line"><span class="source-line-number">514</span><span class="source-line-text">          title: result.data?.title,</span></span>
<span class="source-line"><span class="source-line-number">515</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">516</span><span class="source-line-text">      }</span></span></code></pre>
</details>、<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:791-798</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">791</span><span class="source-line-text">          const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">792</span><span class="source-line-text">          const result = await client.session.prompt({</span></span>
<span class="source-line"><span class="source-line-number">793</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">794</span><span class="source-line-text">            agent,</span></span>
<span class="source-line"><span class="source-line-number">795</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">796</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">797</span><span class="source-line-text">            parts: [...files, { type: &quot;text&quot;, text: message }],</span></span>
<span class="source-line"><span class="source-line-number">798</span><span class="source-line-text">          })</span></span></code></pre>
</details>。
- Provider：CLI 只解析 `provider/model` 字符串，不直接调 provider。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:31-41</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">const runtimeTask = import(&quot;./run/runtime&quot;)</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">type ModelInput = Parameters&lt;OpencodeClient[&quot;session&quot;][&quot;prompt&quot;]&gt;[0][&quot;model&quot;]</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">function pick(value: string | undefined): ModelInput | undefined {</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">  if (!value) return undefined</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  const [providerID, ...rest] = value.split(&quot;/&quot;)</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">  return {</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">    providerID,</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">    modelID: rest.join(&quot;/&quot;),</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  } as ModelInput</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">}</span></span></code></pre>
</details>。
- Tool：CLI 可通过 `--file` 附带文件，真正读文件在 `SessionPrompt.createUserMessage` 和 `ReadTool` 中发生。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:334-354</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">      const files: FilePart[] = []</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">      if (args.file) {</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">        const list = Array.isArray(args.file) ? args.file : [args.file]</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">        for (const filePath of list) {</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text">          const resolvedPath = path.resolve(args.attach ? root : (directory ?? root), filePath)</span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">          if (!(await Filesystem.exists(resolvedPath))) {</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">            UI.error(`File not found: ${filePath}`)</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text">            process.exit(1)</span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">          const mime = (await Filesystem.isDir(resolvedPath)) ? &quot;application/x-directory&quot; : &quot;text/plain&quot;</span></span>
<span class="source-line"><span class="source-line-number">346</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">          files.push({</span></span>
<span class="source-line"><span class="source-line-number">348</span><span class="source-line-text">            type: &quot;file&quot;,</span></span>
<span class="source-line"><span class="source-line-number">349</span><span class="source-line-text">            url: pathToFileURL(resolvedPath).href,</span></span>
<span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">            filename: path.basename(resolvedPath),</span></span>
<span class="source-line"><span class="source-line-number">351</span><span class="source-line-text">            mime,</span></span>
<span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">353</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">      }</span></span></code></pre>
</details>。
- 文件系统：CLI 负责 cwd、`--dir` 和附件存在性检查。来源：<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:310-356</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">310</span><span class="source-line-text">      const root = Filesystem.resolve(process.env.PWD ?? process.cwd())</span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">      const directory = (() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">        if (!args.dir) return args.attach ? undefined : root</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">        if (args.attach) return args.dir</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">        try {</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">          process.chdir(path.isAbsolute(args.dir) ? args.dir : path.join(root, args.dir))</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">          return process.cwd()</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text">        } catch {</span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">          UI.error(&quot;Failed to change directory to &quot; + args.dir)</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">          process.exit(1)</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">      })()</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text">      const attachHeaders = args.attach</span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">        ? ServerAuth.headers({ password: args.password, username: args.username })</span></span>
<span class="source-line"><span class="source-line-number">325</span><span class="source-line-text">        : undefined</span></span>
<span class="source-line"><span class="source-line-number">326</span><span class="source-line-text">      const attachSDK = (dir?: string) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">        return createOpencodeClient({</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">          baseUrl: args.attach!,</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">          directory: dir,</span></span>
<span class="source-line"><span class="source-line-number">330</span><span class="source-line-text">          headers: attachHeaders,</span></span>
<span class="source-line"><span class="source-line-number">331</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">332</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">333</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">      const files: FilePart[] = []</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">      if (args.file) {</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">        const list = Array.isArray(args.file) ? args.file : [args.file]</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">        for (const filePath of list) {</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text">          const resolvedPath = path.resolve(args.attach ? root : (directory ?? root), filePath)</span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">          if (!(await Filesystem.exists(resolvedPath))) {</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">            UI.error(`File not found: ${filePath}`)</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text">            process.exit(1)</span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">          const mime = (await Filesystem.isDir(resolvedPath)) ? &quot;application/x-directory&quot; : &quot;text/plain&quot;</span></span>
<span class="source-line"><span class="source-line-number">346</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">          files.push({</span></span>
<span class="source-line"><span class="source-line-number">348</span><span class="source-line-text">            type: &quot;file&quot;,</span></span>
<span class="source-line"><span class="source-line-number">349</span><span class="source-line-text">            url: pathToFileURL(resolvedPath).href,</span></span>
<span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">            filename: path.basename(resolvedPath),</span></span>
<span class="source-line"><span class="source-line-number">351</span><span class="source-line-text">            mime,</span></span>
<span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">353</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">355</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">356</span><span class="source-line-text">      const piped = process.stdin.isTTY ? undefined : await Bun.stdin.text()</span></span></code></pre>
</details>。

## 11. 如果自己实现 mini agent，这一章对应什么代码

先写 CLI wrapper：

```ts
async function main(argv: string[]) {
  const args = parseArgs(argv)
  const cwd = resolveDirectory(args.dir)
  const files = await resolveFiles(args.file, cwd)
  const client = createMiniAgentClient({ cwd })
  const sessionID = await getOrCreateSession(client, args)
  const events = client.subscribe(sessionID)
  renderEvents(events)
  await client.prompt(sessionID, {
    agent: args.agent,
    model: parseModel(args.model),
    parts: [...files, { type: "text", text: args.message }],
  })
}
```

先不要做 TUI。先把 CLI -> session -> event render 跑通。

## 12. 费曼复述区

请用自己的话回答：

1. 为什么 CLI 不是 agent 核心？
2. `effectCmd` 帮命令 handler 解决了什么重复问题？
3. 为什么本地模式也要走 `createOpencodeClient`？

如果答不出来，通常是把“输入适配层”和“agent runtime”混在一起了。换句话说：CLI 是门口，agent loop 是厨房。

## 13. 练习题

### 入门题

1. 找到 `index.ts` 中注册 `RunCommand` 的地方。
2. 找到 `RunCommand` 的 `--model` 和 `--agent` 参数定义。
3. 找到 `run.ts` 读取 piped stdin 的代码。

### 进阶题

1. 解释 `run --attach` 为什么不需要本地 instance。
2. 解释 `Server.Default().app.fetch` 让本地 CLI 获得了什么好处。
3. 解释 `permission.asked` 事件在非交互 CLI 中如何处理。

### 小实现题

写一个最小 CLI：支持 `mini-agent run "hello"`、`--file a.ts`、`--session id`，然后打印模拟的 event stream。

## 14. 源码追踪任务

1. 从 <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/index.ts:158-180</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">  .command(AcpCommand)</span></span>
<span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">  .command(McpCommand)</span></span>
<span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">  .command(TuiThreadCommand)</span></span>
<span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">  .command(AttachCommand)</span></span>
<span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">  .command(RunCommand)</span></span>
<span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">  .command(GenerateCommand)</span></span>
<span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">  .command(DebugCommand)</span></span>
<span class="source-line"><span class="source-line-number">165</span><span class="source-line-text">  .command(ConsoleCommand)</span></span>
<span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">  .command(ProvidersCommand)</span></span>
<span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">  .command(AgentCommand)</span></span>
<span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">  .command(UpgradeCommand)</span></span>
<span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">  .command(UninstallCommand)</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">  .command(ServeCommand)</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">  .command(WebCommand)</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">  .command(ModelsCommand)</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">  .command(StatsCommand)</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">  .command(ExportCommand)</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">  .command(ImportCommand)</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">  .command(GithubCommand)</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">  .command(PrCommand)</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">  .command(SessionCommand)</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">  .command(PluginCommand)</span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">  .command(DbCommand)</span></span></code></pre>
</details> 追到 `RunCommand`。
2. 从 <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/effect-cmd.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/effect-cmd.ts:70-93</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">export const effectCmd = &lt;Args, A&gt;(opts: EffectCmdOpts&lt;Args, A&gt;) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">  cmd&lt;{}, Args&gt;({</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">    command: opts.command,</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">    aliases: opts.aliases,</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text">    describe: opts.describe,</span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">    builder: opts.builder as never,</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">    async handler(rawArgs) {</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">      // yargs typing wraps Args in ArgumentsCamelCase&lt;WithDoubleDash&lt;...&gt;&gt;; cast at the boundary.</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">      const args = rawArgs as unknown as WithDoubleDash&lt;Args&gt;</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">      const useInstance = typeof opts.instance === &quot;function&quot; ? opts.instance(args) : opts.instance !== false</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">      if (!useInstance) {</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">        await AppRuntime.runPromise(opts.handler(args))</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">        return</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">      const directory = opts.directory?.(args) ?? process.cwd()</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">      const { store, ctx } = await AppRuntime.runPromise(</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">        InstanceStore.Service.use((store) =&gt; store.load({ directory }).pipe(Effect.map((ctx) =&gt; ({ store, ctx })))),</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">      try {</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">        await AppRuntime.runPromise(opts.handler(args).pipe(Effect.provideService(InstanceRef, ctx)))</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">      } finally {</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">        await AppRuntime.runPromise(store.dispose(ctx))</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">    },</span></span></code></pre>
</details> 追到 `InstanceStore.Service.load`。
3. 从 <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:791-798</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">791</span><span class="source-line-text">          const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">792</span><span class="source-line-text">          const result = await client.session.prompt({</span></span>
<span class="source-line"><span class="source-line-number">793</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">794</span><span class="source-line-text">            agent,</span></span>
<span class="source-line"><span class="source-line-number">795</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">796</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">797</span><span class="source-line-text">            parts: [...files, { type: &quot;text&quot;, text: message }],</span></span>
<span class="source-line"><span class="source-line-number">798</span><span class="source-line-text">          })</span></span></code></pre>
</details> 追到 session API handler。
4. 从 <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:637-759</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">637</span><span class="source-line-text">        async function loop(client: OpencodeClient, events: Awaited&lt;ReturnType&lt;typeof sdk.event.subscribe&gt;&gt;) {</span></span>
<span class="source-line"><span class="source-line-number">638</span><span class="source-line-text">          const toggles = new Map&lt;string, boolean&gt;()</span></span>
<span class="source-line"><span class="source-line-number">639</span><span class="source-line-text">          let error: string | undefined</span></span>
<span class="source-line"><span class="source-line-number">640</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">641</span><span class="source-line-text">          for await (const event of events.stream) {</span></span>
<span class="source-line"><span class="source-line-number">642</span><span class="source-line-text">            if (</span></span>
<span class="source-line"><span class="source-line-number">643</span><span class="source-line-text">              event.type === &quot;message.updated&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">644</span><span class="source-line-text">              event.properties.sessionID === sessionID &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">645</span><span class="source-line-text">              event.properties.info.role === &quot;assistant&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">646</span><span class="source-line-text">              args.format !== &quot;json&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">647</span><span class="source-line-text">              toggles.get(&quot;start&quot;) !== true</span></span>
<span class="source-line"><span class="source-line-number">648</span><span class="source-line-text">            ) {</span></span>
<span class="source-line"><span class="source-line-number">649</span><span class="source-line-text">              UI.empty()</span></span>
<span class="source-line"><span class="source-line-number">650</span><span class="source-line-text">              UI.println(`&gt; ${event.properties.info.agent} · ${event.properties.info.modelID}`)</span></span>
<span class="source-line"><span class="source-line-number">651</span><span class="source-line-text">              UI.empty()</span></span>
<span class="source-line"><span class="source-line-number">652</span><span class="source-line-text">              toggles.set(&quot;start&quot;, true)</span></span>
<span class="source-line"><span class="source-line-number">653</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">654</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">655</span><span class="source-line-text">            if (event.type === &quot;message.part.updated&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">656</span><span class="source-line-text">              const part = event.properties.part</span></span>
<span class="source-line"><span class="source-line-number">657</span><span class="source-line-text">              if (part.sessionID !== sessionID) continue</span></span>
<span class="source-line"><span class="source-line-number">658</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">659</span><span class="source-line-text">              if (part.type === &quot;tool&quot; &amp;&amp; (part.state.status === &quot;completed&quot; || part.state.status === &quot;error&quot;)) {</span></span>
<span class="source-line"><span class="source-line-number">660</span><span class="source-line-text">                if (emit(&quot;tool_use&quot;, { part })) continue</span></span>
<span class="source-line"><span class="source-line-number">661</span><span class="source-line-text">                if (part.state.status === &quot;completed&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">662</span><span class="source-line-text">                  await tool(part)</span></span>
<span class="source-line"><span class="source-line-number">663</span><span class="source-line-text">                  continue</span></span>
<span class="source-line"><span class="source-line-number">664</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">665</span><span class="source-line-text">                await toolError(part)</span></span>
<span class="source-line"><span class="source-line-number">666</span><span class="source-line-text">                UI.error(part.state.error)</span></span>
<span class="source-line"><span class="source-line-number">667</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">668</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">669</span><span class="source-line-text">              if (</span></span>
<span class="source-line"><span class="source-line-number">670</span><span class="source-line-text">                part.type === &quot;tool&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">671</span><span class="source-line-text">                part.tool === &quot;task&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">672</span><span class="source-line-text">                part.state.status === &quot;running&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">673</span><span class="source-line-text">                args.format !== &quot;json&quot;</span></span>
<span class="source-line"><span class="source-line-number">674</span><span class="source-line-text">              ) {</span></span>
<span class="source-line"><span class="source-line-number">675</span><span class="source-line-text">                if (toggles.get(part.id) === true) continue</span></span>
<span class="source-line"><span class="source-line-number">676</span><span class="source-line-text">                await tool(part)</span></span>
<span class="source-line"><span class="source-line-number">677</span><span class="source-line-text">                toggles.set(part.id, true)</span></span>
<span class="source-line"><span class="source-line-number">678</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">679</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">680</span><span class="source-line-text">              if (part.type === &quot;step-start&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">681</span><span class="source-line-text">                if (emit(&quot;step_start&quot;, { part })) continue</span></span>
<span class="source-line"><span class="source-line-number">682</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">683</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">684</span><span class="source-line-text">              if (part.type === &quot;step-finish&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">685</span><span class="source-line-text">                if (emit(&quot;step_finish&quot;, { part })) continue</span></span>
<span class="source-line"><span class="source-line-number">686</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">687</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">688</span><span class="source-line-text">              if (part.type === &quot;text&quot; &amp;&amp; part.time?.end) {</span></span>
<span class="source-line"><span class="source-line-number">689</span><span class="source-line-text">                if (emit(&quot;text&quot;, { part })) continue</span></span>
<span class="source-line"><span class="source-line-number">690</span><span class="source-line-text">                const text = part.text.trim()</span></span>
<span class="source-line"><span class="source-line-number">691</span><span class="source-line-text">                if (!text) continue</span></span>
<span class="source-line"><span class="source-line-number">692</span><span class="source-line-text">                if (!process.stdout.isTTY) {</span></span>
<span class="source-line"><span class="source-line-number">693</span><span class="source-line-text">                  process.stdout.write(text + EOL)</span></span>
<span class="source-line"><span class="source-line-number">694</span><span class="source-line-text">                  continue</span></span>
<span class="source-line"><span class="source-line-number">695</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">696</span><span class="source-line-text">                UI.empty()</span></span>
<span class="source-line"><span class="source-line-number">697</span><span class="source-line-text">                UI.println(text)</span></span>
<span class="source-line"><span class="source-line-number">698</span><span class="source-line-text">                UI.empty()</span></span>
<span class="source-line"><span class="source-line-number">699</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">700</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">701</span><span class="source-line-text">              if (part.type === &quot;reasoning&quot; &amp;&amp; part.time?.end &amp;&amp; thinking) {</span></span>
<span class="source-line"><span class="source-line-number">702</span><span class="source-line-text">                if (emit(&quot;reasoning&quot;, { part })) continue</span></span>
<span class="source-line"><span class="source-line-number">703</span><span class="source-line-text">                const text = part.text.trim()</span></span>
<span class="source-line"><span class="source-line-number">704</span><span class="source-line-text">                if (!text) continue</span></span>
<span class="source-line"><span class="source-line-number">705</span><span class="source-line-text">                const line = `Thinking: ${text}`</span></span>
<span class="source-line"><span class="source-line-number">706</span><span class="source-line-text">                if (process.stdout.isTTY) {</span></span>
<span class="source-line"><span class="source-line-number">707</span><span class="source-line-text">                  UI.empty()</span></span>
<span class="source-line"><span class="source-line-number">708</span><span class="source-line-text">                  UI.println(`${UI.Style.TEXT_DIM}\u001b[3m${line}\u001b[0m${UI.Style.TEXT_NORMAL}`)</span></span>
<span class="source-line"><span class="source-line-number">709</span><span class="source-line-text">                  UI.empty()</span></span>
<span class="source-line"><span class="source-line-number">710</span><span class="source-line-text">                  continue</span></span>
<span class="source-line"><span class="source-line-number">711</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">712</span><span class="source-line-text">                process.stdout.write(line + EOL)</span></span>
<span class="source-line"><span class="source-line-number">713</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">714</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">715</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">716</span><span class="source-line-text">            if (event.type === &quot;session.error&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">717</span><span class="source-line-text">              const props = event.properties</span></span>
<span class="source-line"><span class="source-line-number">718</span><span class="source-line-text">              if (props.sessionID !== sessionID || !props.error) continue</span></span>
<span class="source-line"><span class="source-line-number">719</span><span class="source-line-text">              let err = String(props.error.name)</span></span>
<span class="source-line"><span class="source-line-number">720</span><span class="source-line-text">              if (&quot;data&quot; in props.error &amp;&amp; props.error.data &amp;&amp; &quot;message&quot; in props.error.data) {</span></span>
<span class="source-line"><span class="source-line-number">721</span><span class="source-line-text">                err = String(props.error.data.message)</span></span>
<span class="source-line"><span class="source-line-number">722</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">723</span><span class="source-line-text">              error = error ? error + EOL + err : err</span></span>
<span class="source-line"><span class="source-line-number">724</span><span class="source-line-text">              if (emit(&quot;error&quot;, { error: props.error })) continue</span></span>
<span class="source-line"><span class="source-line-number">725</span><span class="source-line-text">              UI.error(err)</span></span>
<span class="source-line"><span class="source-line-number">726</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">727</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">728</span><span class="source-line-text">            if (</span></span>
<span class="source-line"><span class="source-line-number">729</span><span class="source-line-text">              event.type === &quot;session.status&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">730</span><span class="source-line-text">              event.properties.sessionID === sessionID &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">731</span><span class="source-line-text">              event.properties.status.type === &quot;idle&quot;</span></span>
<span class="source-line"><span class="source-line-number">732</span><span class="source-line-text">            ) {</span></span>
<span class="source-line"><span class="source-line-number">733</span><span class="source-line-text">              break</span></span>
<span class="source-line"><span class="source-line-number">734</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">735</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">736</span><span class="source-line-text">            if (event.type === &quot;permission.asked&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">737</span><span class="source-line-text">              const permission = event.properties</span></span>
<span class="source-line"><span class="source-line-number">738</span><span class="source-line-text">              if (permission.sessionID !== sessionID) continue</span></span>
<span class="source-line"><span class="source-line-number">739</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">740</span><span class="source-line-text">              if (args[&quot;dangerously-skip-permissions&quot;]) {</span></span>
<span class="source-line"><span class="source-line-number">741</span><span class="source-line-text">                await client.permission.reply({</span></span>
<span class="source-line"><span class="source-line-number">742</span><span class="source-line-text">                  requestID: permission.id,</span></span>
<span class="source-line"><span class="source-line-number">743</span><span class="source-line-text">                  reply: &quot;once&quot;,</span></span>
<span class="source-line"><span class="source-line-number">744</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">745</span><span class="source-line-text">              } else {</span></span>
<span class="source-line"><span class="source-line-number">746</span><span class="source-line-text">                UI.println(</span></span>
<span class="source-line"><span class="source-line-number">747</span><span class="source-line-text">                  UI.Style.TEXT_WARNING_BOLD + &quot;!&quot;,</span></span>
<span class="source-line"><span class="source-line-number">748</span><span class="source-line-text">                  UI.Style.TEXT_NORMAL +</span></span>
<span class="source-line"><span class="source-line-number">749</span><span class="source-line-text">                    `permission requested: ${permission.permission} (${permission.patterns.join(&quot;, &quot;)}); auto-rejecting`,</span></span>
<span class="source-line"><span class="source-line-number">750</span><span class="source-line-text">                )</span></span>
<span class="source-line"><span class="source-line-number">751</span><span class="source-line-text">                await client.permission.reply({</span></span>
<span class="source-line"><span class="source-line-number">752</span><span class="source-line-text">                  requestID: permission.id,</span></span>
<span class="source-line"><span class="source-line-number">753</span><span class="source-line-text">                  reply: &quot;reject&quot;,</span></span>
<span class="source-line"><span class="source-line-number">754</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">755</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">756</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">757</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">758</span><span class="source-line-text">          return error</span></span>
<span class="source-line"><span class="source-line-number">759</span><span class="source-line-text">        }</span></span></code></pre>
</details> 找出 CLI 渲染哪些事件。
5. 从 <details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:869-879</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">869</span><span class="source-line-text">      const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) =&gt; {</span></span>
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
</details> 解释本地 SDK 如何调用 server handler。

## 15. 面试式自测

1. CLI 层应该不应该直接调用模型？为什么？
2. 一个 coding agent CLI 为什么要支持 session resume/fork？
3. `--file` 在 CLI 层和 runtime 层分别做什么？
4. 为什么非交互 CLI 默认会 auto-reject permission？
5. 如果你要支持远程 server，CLI 入口要怎么设计？

## 16. 下一步阅读建议

下一章读 “用户输入与会话”。CLI 已经把输入交给了 `client.session.prompt`，下一步要理解 session API 如何把 payload 转成 `MessageV2.User` 和 parts。

