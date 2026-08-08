import express from "express"
import cors from "cors"
import multer from "multer"
import path from "path"
import fs from "fs"
import { userChatChain, ragChatChain } from "./chain.js"
import { RunnableWithMessageHistory } from "@langchain/core/runnables"
import { ChatMessageHistory } from "@langchain/community/stores/message/in_memory"
import { getUserHistory, writeUserHistory, getSessionList, deleteSession, getRawSession } from "./utils.js"
import { MyHistory } from "./class/MyHistory.js"
import { toolMap } from "./tool.js"
import { AIMessage, HumanMessage, mapChatMessagesToStoredMessages, ToolMessage } from "@langchain/core/messages"
import { MultiServerMCPClient } from "@langchain/mcp-adapters"
import { mcpConfig } from "./mcpConfig.js"
import { app as workFlow } from "./langgraph.js"
import { initRAG, searchDocs } from "./rag/init.js"
import { PORT, IS_PROD } from "./config.js"

const app = express()
app.use(express.json())
app.use(cors())

// ===== 运行时目录（确保存在，避免首次写入报错） =====
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads')
const CHAT_DIR = path.resolve(process.cwd(), 'chat')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })
if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true })

// ===== 文件上传配置 =====
const ALLOWED_EXT = ['.pdf', '.docx', '.xlsx', '.xls', '.md', '.txt', '.csv']
/** 单文件大小上限 10MB */
const MAX_SIZE = 10 * 1024 * 1024

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // 用 时间戳+随机 + 原扩展名 命名，避免冲突且保留扩展名供 loader 识别
    const ext = path.extname(file.originalname).toLowerCase()
    const name = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`
    cb(null, name)
  }
})
const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (ALLOWED_EXT.includes(ext)) cb(null, true)
    else cb(new Error(`不支持的文件类型: ${ext}，仅支持 ${ALLOWED_EXT.join(', ')}`))
  }
})

const client = new MultiServerMCPClient({
  mcpServers: mcpConfig,
  prefixToolNameWithServerName: true,
  additionalToolNamePrefix: "mcp"
})

// MCP 工具加载：单个 server 失败时降级跳过，不阻塞整体启动
let mcpTools = []
try {
  mcpTools = await client.getTools()
  console.log(`[MCP] 已加载 ${mcpTools.length} 个工具: ${mcpTools.map(t => t.name).join(', ') || '(无)'}`)
} catch (e) {
  console.warn(`[MCP] 部分服务连接失败，已降级跳过：${e.message?.slice(0, 120) || e}`)
}
for (const tool of mcpTools) {
  toolMap[tool.name] = tool
}



/**
 * 核心对话函数。
 * @param {string|object} q - 用户提问文本 / 工具结果（单对象或数组）
 * @param {string} userId
 * @param {string} sessionId
 * @param {object} res - Express Response（用于 SSE 写出）
 * @param {string} type - "human" 或 "tool"
 * @param {Array<{fileName:string,originalName:string}>} [files] - 用户上传的文件列表
 */
async function chatTo(q, userId, sessionId, res, type = "human", files = []) {
  let historyMessage = new MyHistory(userId, sessionId)
  // 工具结果可能是单个对象或数组（多个并行工具调用的结果一次性回传）
  const query = type === 'human'
    ? new HumanMessage(q)
    : Array.isArray(q) ? q.map(r => new ToolMessage(r)) : new ToolMessage(q)

  // 用户提问时走 RAG 链，工具回调时沿用原链
  const chain = type === "human" ? ragChatChain(mcpTools, type) : userChatChain(mcpTools, type)
  const runnableChat = new RunnableWithMessageHistory({
    runnable: chain,
    getMessageHistory() {
      return historyMessage
    },
    inputMessagesKey: type === "human" ? "question" : "toolResult",
    historyMessagesKey: "history"
  })

  const invokePramas = {
    role: "聊天机器人"
  }
  if (type === "human") {
    // 若用户上传了文件，在提问后附加文件提示，引导模型调用 read_file 读取
    let questionText = query.content
    if (files && files.length > 0) {
      const fileList = files
        .map((f) => `- 文件名: ${f.fileName}（原始名: ${f.originalName}）`)
        .join('\n')
      questionText += `\n\n[用户上传了以下文件，请使用 read_file 工具读取相关文件后再回答]\n${fileList}`
    }
    invokePramas.question = questionText

    // RAG 检索：把最相关的文档片段注入 context
    const docs = await searchDocs(q)
    invokePramas.context = docs.length > 0
      ? docs.map(d => d.pageContent).join('\n\n---\n\n')
      : "无相关参考资料"
  } else {
    invokePramas.toolResult = Array.isArray(query) ? query : [query]
  }
  let result = await runnableChat.stream(invokePramas, {
    configurable: {
      sessionId: "defult"
    }
  })

  let arr = []
  let answer = new AIMessage("")
  // 工具调用按 index 分组累加（支持模型一次发起多个并行工具调用）
  const toolCallsMap = new Map()
  for await (const chunk of result) {
    if (chunk.content) {
      answer.content += chunk.content
      arr.push(chunk)
      res.write(`data: ${JSON.stringify(mapChatMessagesToStoredMessages([answer]))} \n\n`)
    }
    // 遍历该 chunk 的所有 tool_call_chunks（并行调用会有多个，各自带不同 index）
    const chunks = chunk.tool_call_chunks
    if (chunks && chunks.length) {
      arr.push(chunks)
      for (const tc of chunks) {
        if (!tc) continue
        const idx = tc.index ?? 0
        if (!toolCallsMap.has(idx)) {
          toolCallsMap.set(idx, { id: '', name: '', args: '' })
        }
        const cur = toolCallsMap.get(idx)
        if (tc.id) cur.id += tc.id
        if (tc.name) cur.name += tc.name
        if (tc.args) cur.args += tc.args
      }
    }
  }

  // 取出所有完整工具调用（按 index 排序）
  const toolCalls = [...toolCallsMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v)
    .filter((tc) => tc.id)

  console.log('toolCalls:', toolCalls.map(t => t.name))

  // 依次执行所有工具调用，收集结果
  if (toolCalls.length > 0) {
    const toolResults = []
    for (const tc of toolCalls) {
      const targetTool = toolMap[tc.name]
      if (!targetTool) {
        console.warn(`[chatTo] 未找到工具: ${tc.name}，跳过`)
        // 回传一条错误提示，避免模型等待缺失的工具结果
        toolResults.push({ content: `工具 ${tc.name} 不存在`, tool_call_id: tc.id })
        continue
      }
      let parsedArgs = {}
      try {
        parsedArgs = JSON.parse(tc.args || '{}')
      } catch (e) {
        console.warn(`[chatTo] 工具参数解析失败: ${tc.name} args=${tc.args}`)
      }
      try {
        const toolResult = await targetTool.invoke(parsedArgs)
        toolResults.push({ content: toolResult, tool_call_id: tc.id })
      } catch (e) {
        // schema 不匹配 / 工具执行失败：回传错误提示，让模型修正参数重试，而非整个请求崩溃
        console.warn(`[chatTo] 工具执行失败: ${tc.name} 错误: ${e.message}`)
        toolResults.push({
          content: `工具 ${tc.name} 调用失败：${e.message}。请检查参数后重试。`,
          tool_call_id: tc.id
        })
      }
    }
    // 所有工具结果一次性回传（保持并行调用的语义，避免逐个递归破坏上下文）
    result = await chatTo(toolResults, userId, sessionId, res, "tool")
  }

  // 调试写盘：仅开发环境，生产环境关闭避免磁盘占用
  if (!IS_PROD) {
    fs.writeFileSync('./chunList.json', JSON.stringify(arr))
  }
  res.send()
}




// 健康检查端点（Render 部署探活用，不依赖外部服务）
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

app.get('/llm', async (req, res) => {

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  const { q, userId, sessionId, files } = req.query
  // files 为 JSON 字符串：[{fileName, originalName}, ...]
  let fileList = []
  try {
    fileList = files ? JSON.parse(files) : []
  } catch (e) {
    fileList = []
  }
  await chatTo(q, userId, sessionId, res, "human", fileList)
})


// 文件上传：单次可多文件，字段名 files。返回上传后的文件信息（含 fileName 供 read_file 使用）
app.post('/upload', upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: '未收到文件' })
  }
  const files = req.files.map((f) => ({
    fileName: f.filename,
    originalName: f.originalname,
    size: f.size
  }))
  res.json({ files })
})

// 上传错误处理（文件超限 / 类型不符）
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message?.includes('不支持的文件类型')) {
    return res.status(400).json({ error: err.message })
  }
  next(err)
})


app.get('/llm_graph', async (req, res) => {

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  const { q, userId, sessionId } = req.query

  const eventStream = workFlow.streamEvents(
    {
      messages: [
        {
          role: 'user',
          content: q
        }
      ]
    },
    {
      configurable: {
        userId,
        sessionId
      },
      recursionLimit: 20,
      version: "v2"
    }
  )

  for await (const event of eventStream) {
    // 过滤出 LLM token 流事件
    if (event.event === "on_chat_model_stream") {
      const chunk = event.data.chunk
      if (chunk.content) {
        res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`)
      }
    }
  }

  res.end()

})


// 获取登录用户的历史会话列表
app.get('/history', (req, res) => {
  const { userId } = req.query
  if (!userId) {
    return res.status(400).json({ error: '缺少 userId 参数' })
  }
  try {
    const sessions = getSessionList(userId)
    res.json({ sessions })
  } catch (e) {
    res.status(500).json({ error: '获取历史会话失败' })
  }
})

// 删除指定会话
app.delete('/history', (req, res) => {
  const { userId, sessionId } = req.query
  if (!userId || !sessionId) {
    return res.status(400).json({ error: '缺少 userId 或 sessionId 参数' })
  }
  try {
    const ok = deleteSession(userId, sessionId)
    res.json({ success: ok })
  } catch (e) {
    res.status(500).json({ error: '删除会话失败' })
  }
})

// 获取某会话的原始存储记录（含 tool_calls / reasoning 等，分页）
//   userId, sessionId 必填；limit 默认 20，offset 默认 0（从最新算起）
app.get('/history/raw', (req, res) => {
  const { userId, sessionId } = req.query
  if (!userId || !sessionId) {
    return res.status(400).json({ error: '缺少 userId 或 sessionId 参数' })
  }
  const limit = parseInt(req.query.limit, 10)
  const offset = parseInt(req.query.offset, 10)
  try {
    const data = getRawSession(
      userId,
      sessionId,
      Number.isNaN(limit) ? 20 : limit,
      Number.isNaN(offset) ? 0 : offset
    )
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: '获取原始记录失败' })
  }
})




// 初始化 RAG，然后启动服务
async function main() {
  await initRAG()

  app.listen(PORT, () => {
    console.log("Server start at port " + PORT);
  })
}

main()

