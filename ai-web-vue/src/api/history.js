/**
 * 历史会话接口封装
 * 会话管理已迁至后端，前端通过这两个接口拉取列表 / 删除会话。
 * @module api/history
 */
import { API_BASE } from './base'

/**
 * 获取用户的历史会话列表（含每个会话的完整消息）。
 * @param {string} userId - 用户标识
 * @returns {Promise<Array<{id:string,title:string,createdAt:number,messages:Array}>>}
 */
export async function fetchHistory(userId) {
  const res = await fetch(`${API_BASE}/history?userId=${encodeURIComponent(userId)}`, {
    headers: { Accept: 'application/json' }
  })
  if (!res.ok) {
    throw new Error(`获取历史会话失败：${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  return data.sessions || []
}

/**
 * 删除指定会话。
 * @param {string} userId - 用户标识
 * @param {string} sessionId - 会话标识
 * @returns {Promise<boolean>} 后端是否删除成功（会话不存在时返回 false）
 */
export async function deleteHistory(userId, sessionId) {
  const params = new URLSearchParams({ userId, sessionId })
  const res = await fetch(`${API_BASE}/history?${params.toString()}`, { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(`删除会话失败：${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  return !!data.success
}

/**
 * 获取某会话的原始存储记录（含 tool_calls / reasoning_content / token 用量等）。
 * 分页：offset 从末尾算（0 = 含最新一条），limit 为本次取多少条更早的。
 * @param {string} userId
 * @param {string} sessionId
 * @param {number} [limit=20] - 本次条数；传 0 表示取全部（小会话一次性加载）
 * @param {number} [offset=0] - 跳过最新多少条
 * @returns {Promise<{total:number, messages:Array, hasMore:boolean}>}
 */
export async function fetchRawHistory(userId, sessionId, limit = 20, offset = 0) {
  const params = new URLSearchParams({
    userId,
    sessionId,
    limit: String(limit),
    offset: String(offset)
  })
  const res = await fetch(`${API_BASE}/history/raw?${params.toString()}`, {
    headers: { Accept: 'application/json' }
  })
  if (!res.ok) {
    throw new Error(`获取原始记录失败：${res.status} ${res.statusText}`)
  }
  return res.json()
}
