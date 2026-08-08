/**
 * ID 生成工具
 * @module utils/id
 */

/**
 * 生成一个带前缀的唯一 ID。
 * 优先使用 `crypto.randomUUID()`，不可用时回退为时间戳 + 随机数。
 * @param {string} [prefix=''] - ID 前缀
 * @returns {string} 唯一 ID
 */
export function genId(prefix = '') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return prefix + crypto.randomUUID()
  }
  const rand = Math.random().toString(36).slice(2, 10)
  return `${prefix}${Date.now().toString(36)}-${rand}`
}

/** 生成一个用户 ID（浏览器本地匿名标识） */
export function genUserId() {
  return genId('u_')
}

/** 生成一个会话 ID（sessionId，透传给后端用于续接历史） */
export function genSessionId() {
  return genId('s_')
}