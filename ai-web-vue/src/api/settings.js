/**
 * 用户设置接口封装（角色 + 系统上下文）
 * 保存到后端内存，每次调 LLM 时读取替换。
 * @module api/settings
 */
import { API_BASE } from './base'

/**
 * 保存用户角色与系统上下文到后端。
 * @param {{role:string, systemContext:string}} settings
 * @returns {Promise<{success:boolean}>}
 */
export async function saveSettings(settings) {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  })
  if (!res.ok) {
    throw new Error(`保存失败：${res.status}`)
  }
  return res.json()
}

/**
 * 获取当前后端保存的用户设置。
 * @returns {Promise<{role:string, systemContext:string}>}
 */
export async function fetchSettings() {
  const res = await fetch(`${API_BASE}/settings`)
  if (!res.ok) {
    throw new Error(`获取失败：${res.status}`)
  }
  return res.json()
}