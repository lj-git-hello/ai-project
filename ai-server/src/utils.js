
import { mapChatMessagesToStoredMessages, mapStoredMessagesToChatMessages } from "@langchain/core/messages"
import fs from "fs"

export function getUserHistory(userId, sessionId) {
  const userPath = `./chat/${userId}.json`

  const isExit = fs.existsSync(userPath)
  if (isExit) {

    const history = JSON.parse(fs.readFileSync(userPath).toString())
    const userHistory = history[sessionId] || []
    // 兼容 /llm_graph 接口的 checkpoint 对象格式：如果不是数组说明是 /llm_graph 写入的，当作新对话
    if (!Array.isArray(userHistory)) {
      return []
    }
    return mapStoredMessagesToChatMessages(userHistory)

  } else {
    const initHistory = {
      [sessionId]: []
    }

    fs.writeFileSync(userPath, JSON.stringify(initHistory))
    return []
  }

}

export function writeUserHistory(userId, sessionId, historyMessage) {
  const userPath = `./chat/${userId}.json`
  const history = JSON.parse(fs.readFileSync(userPath).toString())
  history[sessionId] = mapChatMessagesToStoredMessages(historyMessage)
  fs.writeFileSync(userPath, JSON.stringify(history))
}

/**
 * 由存储格式的消息推导会话标题：取首条 human 消息的首行非空文本，超出长度截断。
 * 与前端 utils/time.js 的 formatTitle 逻辑保持一致。
 */
function deriveTitle(messages, max = 20) {
  const first = messages.find((m) => m.type === 'human' && m.data && m.data.content)
  const text = (first && first.data.content) || ''
  const firstLine = String(text).split('\n').find((l) => l.trim()) || '新对话'
  const trimmed = firstLine.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

/**
 * 将存储格式消息映射为前端展示格式：
 *  - human -> user
 *  - ai    -> assistant（空内容的工具调用占位 ai 跳过，避免历史里出现空气泡）
 *  - tool  -> 跳过
 */
function mapMessagesForClient(messages) {
  const result = []
  for (const m of messages) {
    const role = m.type === 'human' ? 'user' : m.type === 'ai' ? 'assistant' : null
    if (!role) continue
    const content = (m.data && m.data.content) || ''
    if (role === 'assistant' && !content) continue
    result.push({ role, content })
  }
  return result
}

/**
 * 获取某用户的会话历史列表（供 GET /history 接口）。
 * 仅返回数组格式（/llm 链路）的会话；checkpoint 格式（/llm_graph 写入）按既有逻辑视为空、不列出。
 * 注意：当前存储未记录每个会话的独立创建时间，createdAt 以文件最后修改时间为基准，
 * 并按写入顺序微调，保证前端按 createdAt 倒序排列时「最新会话在前」。
 * @param {string} userId
 * @returns {Array<{id:string,title:string,createdAt:number,messages:Array}>}
 */
export function getSessionList(userId) {
  const userPath = `./chat/${userId}.json`
  if (!fs.existsSync(userPath)) return []
  let history = {}
  try {
    history = JSON.parse(fs.readFileSync(userPath).toString())
  } catch (e) {
    return []
  }

  let mtime = Date.now()
  try {
    mtime = fs.statSync(userPath).mtimeMs
  } catch (e) {
    /* 取不到则用当前时间兜底 */
  }

  return Object.entries(history)
    .filter(([, v]) => Array.isArray(v))
    .map(([sid, msgs], idx) => ({
      id: sid,
      title: deriveTitle(msgs),
      createdAt: mtime + idx,
      messages: mapMessagesForClient(msgs)
    }))
}

/**
 * 删除某用户的指定会话（供 DELETE /history 接口）。
 * @param {string} userId
 * @param {string} sessionId
 * @returns {boolean} 是否删除成功（会话不存在时返回 false）
 */
export function deleteSession(userId, sessionId) {
  const userPath = `./chat/${userId}.json`
  if (!fs.existsSync(userPath)) return false
  let history = {}
  try {
    history = JSON.parse(fs.readFileSync(userPath).toString())
  } catch (e) {
    return false
  }
  if (!(sessionId in history)) return false
  delete history[sessionId]
  fs.writeFileSync(userPath, JSON.stringify(history))
  return true
}

/**
 * 获取某用户某会话的「原始存储记录」（供 GET /history/raw）。
 * 返回后端 chat 文件里未经加工的消息对象（含 tool_calls / reasoning_content /
 * response_metadata 等），用于让用户查看会话与模型的完整沟通过程。
 *
 * 分页约定：offset 从末尾算（0 = 包含最新一条），limit 为本次取多少条「更早」的。
 *   - offset=0,  limit=20, total=100 -> 取 messages[80..99]（最新 20 条），hasMore=true
 *   - offset=20, limit=20, total=100 -> 取 messages[60..79]（再向前 20 条），hasMore=true
 * 返回的 messages 保持时间正序（最旧在前），便于前端自上而下追加展示。
 *
 * @param {string} userId
 * @param {string} sessionId
 * @param {number} [limit=0] - 本次条数；<=0 表示取从开头到 offset 的全部（用于小会话一次性加载）
 * @param {number} [offset=0] - 跳过最新多少条
 * @returns {{total:number, messages:Array, hasMore:boolean}}
 */
export function getRawSession(userId, sessionId, limit = 0, offset = 0) {
  const userPath = `./chat/${userId}.json`
  if (!fs.existsSync(userPath)) return { total: 0, messages: [], hasMore: false }
  let history = {}
  try {
    history = JSON.parse(fs.readFileSync(userPath).toString())
  } catch (e) {
    return { total: 0, messages: [], hasMore: false }
  }
  const all = history[sessionId]
  // checkpoint 格式（/llm_graph 写入）非数组，无法按消息逐条展示
  if (!Array.isArray(all)) return { total: 0, messages: [], hasMore: false }

  const total = all.length
  const end = total - offset
  const start = limit > 0 ? Math.max(0, end - limit) : 0
  const messages = all.slice(start, end)
  const hasMore = start > 0
  return { total, messages, hasMore }
}

