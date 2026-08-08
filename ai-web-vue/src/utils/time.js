/**
 * 时间与会话分组工具
 * @module utils/time
 */

const DAY = 24 * 60 * 60 * 1000

/** 获取某天的 0 点时间戳 */
function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * 将会话按「今天 / 昨天 / 近 7 天 / 更早」分组，并按创建时间倒序排列。
 * @param {Array<{id: string, createdAt: number}>} sessions - 会话列表
 * @param {number} [now] - 参考时间戳（便于测试）
 * @returns {Array<{label: string, sessions: Array}>} 分组结果
 */
export function groupSessions(sessions, now = Date.now()) {
  const todayStart = startOfDay(new Date(now))
  const yesterdayStart = todayStart - DAY
  const weekStart = todayStart - 6 * DAY

  const groups = [
    { label: '今天', min: todayStart, list: [] },
    { label: '昨天', min: yesterdayStart, list: [] },
    { label: '近 7 天', min: weekStart, list: [] },
    { label: '更早', min: 0, list: [] }
  ]

  for (const s of sessions) {
    const created = Number(s.createdAt) || now
    const target = groups.find((g) => created >= g.min)
    if (target) target.list.push(s)
    else groups[groups.length - 1].list.push(s)
  }

  return groups
    .map((g) => ({ label: g.label, sessions: g.list.sort((a, b) => b.createdAt - a.createdAt) }))
    .filter((g) => g.sessions.length > 0)
}

/**
 * 格式化会话标题：取首行非空文本，超出长度截断。
 * @param {string} text - 原始文本
 * @param {number} [max=20] - 最大长度
 * @returns {string} 会话标题
 */
export function formatTitle(text, max = 20) {
  const firstLine = String(text || '').split('\n').find((l) => l.trim()) || '新对话'
  const trimmed = firstLine.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}