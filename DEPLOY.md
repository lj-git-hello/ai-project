# 部署指南：GitHub Pages（前端）+ Render（后端）

整体架构：
```
浏览器
  ├─ 静态页面 ← GitHub Pages（前端 dist）
  └─ /llm /history /upload → Render（后端 Node 常驻进程）
                                   └─ 阿里云百炼（qwen 模型）
```

---

## 第一部分：后端部署到 Render

### 0. 前置准备
- 代码已推到 GitHub 仓库（根目录含 `ai-server/` 和 `ai-web-vue/`）
- 已注册 [Render](https://render.com) 账号（GitHub 登录，免信用卡）

### 1. 创建 Web Service
1. Render 控制台 → **New +** → **Web Service**
2. 连接你的 GitHub 仓库
3. 填写配置：
   - **Name**：`ai-assistant-api`
   - **Root Directory**：`ai-server`（关键！后端在子目录）
   - **Runtime**：`Node`
   - **Build Command**：`npm install`
   - **Start Command**：`npm start`
   - **Instance Type**：`Free`
4. 点 **Advanced** 展开：
   - **Health Check Path**：`/health`
   - 确保勾选自动部署

### 2. 配置环境变量
在 Render 服务页 → **Environment** → 添加：

| Key | Value | 说明 |
|-----|-------|------|
| `DASHSCOPE_API_KEY` | `sk-你的密钥` | 阿里云百炼密钥（敏感，只在控制台填） |
| `NODE_ENV` | `production` | 生产环境（关闭调试写盘） |
| `DASHSCOPE_BASE_URL` | `https://ws-lni3s5bm8fy9o869...` | 百炼端点（见 .env） |
| `CHAT_MODEL` | `qwen3.7-max-preview` | 对话模型 |
| `EMBEDDING_MODEL` | `qwen3.7-text-embedding` | 向量模型 |
| `EMBEDDING_DIMENSIONS` | `1024` | 向量维度 |
| `PORT` | `10000` | Render 会注入端口，可不填 |

> Render 会自动注入 `PORT` 环境变量，代码已用 `process.env.PORT || 3000` 兼容。

### 3. 部署并验证
1. 点 **Create Web Service**，等待构建
2. 首次部署会触发 RAG 冷启动（向量化 rag/ 文档），需 1-3 分钟
3. 部署成功后，Render 给一个域名：`https://ai-assistant-api.onrender.com`
4. 验证：浏览器访问 `https://ai-assistant-api.onrender.com/health`
   - 返回 `{"status":"ok","uptime":...}` 即成功

### 4. 注意事项
- **Render 免费层会休眠**：15 分钟无请求自动休眠，下次请求冷启动 ~30 秒。面试演示前先访问一次唤醒。
- **磁盘不持久**：免费层重启后 `chat/` `uploads/` 数据会丢失。用户历史和上传文件是临时的（演示足够，生产需外接数据库）。
- **LanceDB 数据**：部署时不随代码走（在 .gitignore），首次启动会重新向量化 rag/ 文档，需等冷启动完成。

---

## 第二部分：前端部署到 GitHub Pages

### 1. 配置 Vite base 路径
GitHub Pages 的 URL 是 `https://用户名.github.io/仓库名/`，需带子路径。
在 `ai-web-vue/vite.config.js` 的 `defineConfig` 内加 `base`：

```js
export default defineConfig({
  base: '/你的仓库名/',  // 例如 '/ai-study/'
  // ... 其余配置
})
```

### 2. 配置后端地址
创建 `ai-web-vue/.env.production`：
```
VITE_API_BASE=https://ai-assistant-api.onrender.com
```
构建时 Vite 会把这个值打进产物，前端请求会指向 Render 后端。

### 3. 添加部署脚本
在 `ai-web-vue/package.json` 的 scripts 加：
```json
"build": "vite build",
"deploy": "vite build && gh-pages -d dist"
```
（需 `npm install -D gh-pages`）

### 4. 配置 GitHub Pages
1. 推代码到 GitHub
2. 仓库 **Settings** → **Pages**
3. **Source** 选 **Deploy from a branch**
4. **Branch** 选 `gh-pages`（运行 deploy 脚本后自动生成），目录 `/root`
5. 等待几分钟，访问 `https://用户名.github.io/仓库名/`

### 5. 一键部署流程
```bash
cd ai-web-vue
npm install -D gh-pages
npm run deploy   # 构建 + 推送 dist 到 gh-pages 分支
```

---

## 第三部分：联调验证

1. 确认后端 `https://xxx.onrender.com/health` 返回 ok
2. 确认前端 `https://用户名.github.io/仓库名/` 能打开
3. 在页面发一条消息，应能收到流式回复
4. 检查浏览器控制台无 CORS 报错（后端已配 `cors()`）

## 常见问题

**Q: 前端请求报 CORS 错误？**
A: 后端已 `app.use(cors())` 全开，不应报错。若报错检查后端是否启动成功。

**Q: Render 服务启动后立即 crash？**
A: 看 Render 日志。最可能是环境变量没配全（缺 DASHSCOPE_API_KEY）。

**Q: 对话没响应 / 一直转圈？**
A: 可能 Render 在休眠，冷启动需 30 秒。先单独访问 /health 唤醒。

**Q: RAG 冷启动卡住？**
A: 首次部署向量化文档较慢，看日志等 "文档向量化完成" 出现。文档量小通常 1 分钟内。