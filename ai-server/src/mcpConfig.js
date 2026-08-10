import { DASHSCOPE_API_KEY } from "./config.js"

export const mcpConfig = {
  // chrome-devtools：需服务器安装 Chrome，部署环境通常不启用
  // "chrome-devtools": {
  //   "transport": "stdio",
  //   "command": "npx",
  //   "args": ["chrome-devtools-mcp@latest"]
  // },
  // "time": {
  //   "transport": "http",
  //   "url": "https://mcpmarket.cn/mcp/67f270fe36e5587add805ea5"
  // }
  // "bing_search": {
  //   "transport": "http",
  //   "url": "https://mcpmarket.cn/mcp/f5a77cdf63dd4b3759d6b839"
  // }
  // 阿里云 ECS 访问 mcpmarket.cn 不稳定，已注释；搜索改用自研 bing_search（直连 cn.bing.com）
}
