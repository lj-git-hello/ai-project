import { DASHSCOPE_API_KEY } from "./config.js"

export const mcpConfig = {
  // chrome-devtools：需服务器安装 Chrome，部署环境通常不启用
  // "chrome-devtools": {
  //   "transport": "stdio",
  //   "command": "npx",
  //   "args": ["chrome-devtools-mcp@latest"]
  // },
  "time": {
    "transport": "http",
    "url": "https://mcpmarket.cn/mcp/67f270fe36e5587add805ea5"
  }
  // 网页抓取改用自研工具 fetch_url（功能等价，不依赖外部 MCP 会话，更稳定）
  // "WebSearch": {
  //   "transport": "http",
  //   "url": "https://mcpmarket.cn/mcp/fbf9102459f622ed4bbdf4b8"
  // }
}
