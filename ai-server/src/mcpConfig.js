// MCP 配置
// 远程 HTTP MCP（mcpmarket）session 易过期报 "Session not found"，
// 工具能力已全部用自研工具替代（时间/搜索/抓取/文件），更稳定可控。
// 如需启用 MCP，在此添加配置即可。
export const mcpConfig = {
  // chrome-devtools：需服务器安装 Chrome，部署环境通常不启用
  // "chrome-devtools": {
  //   "transport": "stdio",
  //   "command": "npx",
  //   "args": ["chrome-devtools-mcp@latest"]
  // },
}