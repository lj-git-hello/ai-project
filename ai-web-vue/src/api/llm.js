/**
 * LLM 后端接口封装
 * 后端契约：GET /llm?q={query}&userId={userId}&sessionId={sessionId}
 * 响应为 SSE 流式返回，每条 `data:` 反序列化后是包单个 AIMessage 的数组：
 *   [{ type: "ai", data: { content: "已拼接的完整文本" } }]
 * @module api/llm
 */
import { API_BASE } from './base'

/**
 * 拼接 /llm 的 GET 请求 URL。
 * @param {{ q: string, userId: string, sessionId: string, files?: Array }} params
 *   files 为上传文件信息数组，会序列化为 JSON 字符串放入 query
 * @returns {string} 完整 URL
 */
export function buildLLMUrl({ q, userId, sessionId, files }) {
  const search = new URLSearchParams()
  search.set('q', q)
  search.set('userId', userId)
  search.set('sessionId', sessionId)
  if (files && files.length > 0) {
    search.set('files', JSON.stringify(files.map((f) => ({
      fileName: f.fileName,
      originalName: f.originalName
    }))))
  }
  return `${API_BASE}/llm?${search.toString()}`
}

/**
 * 发起流式请求，返回一个可逐步读取的 Reader。
 * 调用方负责传入 AbortController 的 signal 以支持中断。
 * @param {string} url - 由 buildLLMUrl 生成的 URL
 * @param {AbortSignal} [signal] - 中断信号
 * @returns {Promise<ReadableStreamDefaultReader<Uint8Array>>} 流读取器
 */
export async function fetchLLMStream(url, signal) {
  const res = await fetch(url, {
    method: 'GET',
    signal,
    headers: { Accept: 'text/event-stream' }
  })

  if (!res.ok) {
    throw new Error(`请求失败：${res.status} ${res.statusText}`)
  }
  if (!res.body) {
    throw new Error('当前环境不支持流式响应（ReadableStream）')
  }
  return res.body.getReader()
}