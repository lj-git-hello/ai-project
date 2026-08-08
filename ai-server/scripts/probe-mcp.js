/**
 * MCP 连接探测脚本
 * 用法：node src/probe-mcp.js [serverName]
 *   不带参数：探测 mcpConfig 中所有 server
 *   带 serverName：只探测指定 server
 *
 * 对每个 http/sse server，会用底层 MCP SDK 逐个尝试以下组合，输出最详细的诊断：
 *   1. Streamable HTTP  - 原始 URL
 *   2. Streamable HTTP  - URL + /mcp
 *   3. SSE              - URL + /sse
 *   4. SSE              - 原始 URL（若已带 /sse）
 * 首个成功的组合即判定该 server 可用，并列出其提供的工具。
 * 全部失败则打印每个尝试的错误，便于定位（404/401/超时/协议不符）。
 */
import { mcpConfig } from '../src/mcpConfig.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

/** 颜色输出 */
const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`
}

/** 生成要尝试的 (传输方式, URL) 组合 */
function buildAttempts(cfg) {
  const url = cfg.url.replace(/\/$/, '') // 去尾斜杠
  const attempts = []
  // Streamable HTTP 优先（百炼新协议）
  attempts.push({ mode: 'streamable-http', url })
  if (!url.endsWith('/mcp')) attempts.push({ mode: 'streamable-http', url: `${url}/mcp` })
  // 百炼 MCP 正确路径常为单数 /mcp/{name}，补一组路径修正尝试
  const singleMcp = url.replace('/mcps/', '/mcp/')
  if (singleMcp !== url) attempts.push({ mode: 'streamable-http', url: singleMcp })
  // SSE 回退
  if (!url.endsWith('/sse')) attempts.push({ mode: 'sse', url: `${url}/sse` })
  if (url.endsWith('/sse')) attempts.push({ mode: 'sse', url })
  return attempts
}

/** 用指定传输方式连接，成功返回工具列表，失败抛错 */
async function tryConnect(mode, url, headers, timeoutMs = 10000) {
  const transport =
    mode === 'streamable-http'
      ? new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } })
      : new SSEClientTransport(new URL(url), { requestInit: { headers } })

  const client = new Client(
    { name: 'mcp-probe', version: '1.0.0' },
    { capabilities: {} }
  )

  // 超时保护：底层 SDK 连接无内置超时，手动包一层
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`连接超时（${timeoutMs}ms）`)), timeoutMs)
  )

  try {
    await Promise.race([client.connect(transport), timer])
    const { tools } = await client.listTools()
    await client.close()
    return tools
  } catch (e) {
    try { await client.close() } catch (_) { /* 忽略关闭错误 */ }
    throw e
  }
}

/** 提取错误关键信息 */
function describeError(e) {
  const msg = e?.message || String(e)
  // 提取 HTTP 状态码
  const m = msg.match(/(?:HTTP|status)[^\d]*(\d{3})/i)
  const code = m ? ` [HTTP ${m[1]}]` : ''
  return `${msg.slice(0, 200)}${code}`
}

async function probeServer(name, cfg) {
  console.log(c.bold(c.cyan(`\n━━━ 探测 [${name}] ━━━`)))
  console.log(c.dim(`  transport: ${cfg.transport}`))
  console.log(c.dim(`  url:       ${cfg.url}`))

  if (cfg.transport === 'stdio') {
    console.log(c.yellow('  ⏭  stdio 类型跳过（需启动子进程，请在实际服务中验证）'))
    return { name, ok: false, skipped: true }
  }

  const headers = cfg.headers || {}
  const attempts = buildAttempts(cfg)
  const results = []

  for (const a of attempts) {
    const tag = `[${a.mode}] ${a.url}`
    process.stdout.write(`  ${c.dim('尝试')} ${c.dim(tag)} ... `)
    try {
      const tools = await tryConnect(a.mode, a.url, headers)
      console.log(c.green('✓ 成功'))
      console.log(c.green(`    提供工具 (${tools.length}): ${tools.map((t) => t.name).join(', ') || '(无)'}`))
      results.push({ ...a, ok: true, tools })
      break // 首个成功即停
    } catch (e) {
      console.log(c.red('✗ ' + describeError(e)))
      results.push({ ...a, ok: false, error: describeError(e) })
    }
  }

  const okResult = results.find((r) => r.ok)
  if (okResult) {
    console.log(c.green(`  ✅ [${name}] 可用 —— 用 ${okResult.mode} 连接 ${okResult.url}`))
  } else {
    console.log(c.red(`  ❌ [${name}] 所有尝试均失败`))
    console.log(c.yellow(`  💡 建议：检查 URL / API Key / 网络可达性；若是百炼 MCP，确认 transport 应为 http 且 URL 不带 /sse`))
  }
  return { name, ok: !!okResult, attempts: results }
}

async function main() {
  const target = process.argv[2]
  const entries = Object.entries(mcpConfig).filter(([n]) => !target || n === target)

  if (entries.length === 0) {
    console.log(c.red(`未找到 server: ${target}`))
    console.log(c.dim(`可用: ${Object.keys(mcpConfig).join(', ')}`))
    process.exit(1)
  }

  console.log(c.bold(`探测 ${entries.length} 个 MCP server...`))
  const summary = []
  for (const [name, cfg] of entries) {
    summary.push(await probeServer(name, cfg))
  }

  console.log(c.bold(c.cyan('\n━━━ 汇总 ━━━')))
  for (const s of summary) {
    const flag = s.ok ? c.green('✓') : s.skipped ? c.yellow('⏭') : c.red('✗')
    console.log(`  ${flag} ${s.name}`)
  }
  process.exit(summary.every((s) => s.ok || s.skipped) ? 0 : 1)
}

main().catch((e) => {
  console.error(c.red('探测脚本异常:'), e)
  process.exit(1)
})