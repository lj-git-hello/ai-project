/**
 * SSE 流式解析 Composable（契约核心）
 *
 * 封装对后端 GET /llm 的流式请求解析：
 *  - 使用 fetch + ReadableStream 逐步读取，而非 EventSource（便于携带 AbortController 中断）；
 *  - 后端每次推送的 `content` 是「已拼接的完整文本累加值」，通过 onContent 回调
 *    **全量覆盖**替换，调用方绝不可逐字追加，否则文本会重复；
 *  - 内置「思考中/调用工具中」检测：距离上一次收到内容超过阈值即回调 onThinkingChange(true)，
 *    覆盖多轮 Tool Call 导致的打字暂停期。
 *
 * 约定后端 data 结构（已与后端源码核对）：
 *   data: [ { type: "ai", data: { content: "完整文本" } } ]
 *
 * @module composables/useChatStream
 */
import { onUnmounted } from 'vue'
import { buildLLMUrl, fetchLLMStream } from '@/api/llm'

/** 超过该时长未收到新内容即判定为「思考中」 */
const THINKING_THRESHOLD = 800

/**
 * 供组件 UI 层使用的流式请求入口。
 * @returns {{ runLLM: (opts: object) => Promise<string> }} runLLM 返回最终累积文本
 */
export function useChatStream() {
  let thinkingTimer = null

  onUnmounted(() => clearInterval(thinkingTimer))

  /**
   * 从 SSE data 载荷中提取完整文本（兼容数组格式与 { data } 对象格式）。
   * @param {any} payload - JSON.parse 后的 data
   * @returns {string|undefined} 文本内容
   */
  function extractContent(payload) {
    if (Array.isArray(payload)) {
      // 契约格式：[{ type:"ai", data:{ content } }]
      return payload[0]?.data?.content
    }
    // 兼容 { content } / { data: { content } } 形态
    if (payload && typeof payload === 'object') {
      return payload.data?.content ?? payload.content
    }
    return undefined
  }

  /**
   * 触发思考状态切换（带防抖去重）。
   * @param {(thinking: boolean) => void} cb
   * @param {boolean} value
   */
  function emitThinking(cb, value) {
    if (typeof cb === 'function') cb(value)
  }

  /**
   * 发起一次流式对话请求。
   * @param {object} opts
   * @param {string} opts.query - 用户输入
   * @param {string} opts.userId - 用户标识
   * @param {string} opts.sessionId - 会话标识
   * @param {AbortSignal} opts.signal - 中断信号（由 store 的 AbortController 提供）
   * @param {Array} [opts.files] - 上传文件信息数组（{fileName, originalName}）
   * @param {(content: string) => void} [opts.onContent] - 每次收到完整文本时回调（全量覆盖）
   * @param {(thinking: boolean) => void} [opts.onThinkingChange] - 思考态变化回调
   * @returns {Promise<string>} 累积的最终完整文本
   */
  async function runLLM({ query, userId, sessionId, signal, files, onContent, onThinkingChange }) {
    const url = buildLLMUrl({ q: query, userId, sessionId, files })
    const reader = await fetchLLMStream(url, signal)

    // 思考态检测：距上次内容超过阈值则进入思考中
    let lastActive = Date.now()
    const restartThinkingTimer = () => {
      clearInterval(thinkingTimer)
      thinkingTimer = setInterval(() => {
        if (Date.now() - lastActive >= THINKING_THRESHOLD) {
          emitThinking(onThinkingChange, true)
        }
      }, THINKING_THRESHOLD)
    }
    restartThinkingTimer()

    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let finalContent = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // 按 SSE 事件分隔符 \n\n（兼容 \r\n\r\n）切分
        const parts = buffer.split(/\r?\n\r?\n/)
        buffer = parts.pop() // 保留未完成的部分

        for (const event of parts) {
          const dataLine = event
            .split(/\r?\n/)
            .find((line) => line.startsWith('data:'))
          if (!dataLine) continue

          const payloadRaw = dataLine.slice(5).trim()
          if (!payloadRaw) continue

          let payload
          try {
            payload = JSON.parse(payloadRaw)
          } catch (e) {
            continue // 忽略无法解析的事件
          }

          const content = extractContent(payload)
          if (content == null) continue

          // 全量覆盖：content 是已拼接的完整文本
          finalContent = content
          emitThinking(onThinkingChange, false)
          lastActive = Date.now()
          if (typeof onContent === 'function') onContent(content)
        }
      }
      return finalContent
    } finally {
      clearInterval(thinkingTimer)
      thinkingTimer = null
      emitThinking(onThinkingChange, false)
    }
  }

  return { runLLM }
}