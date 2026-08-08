/**
 * 用户角色与系统上下文（内存存储）
 * 独立模块，避免 langchaindemo.js 与 chain.js 循环依赖。
 * 由 /settings 接口写入，chain.js 读取用于构建 system prompt。
 * @module userSettings
 */

export const userSettings = {
  role: '',
  systemContext: ''
}

/**
 * 更新用户设置
 * @param {{role:string, systemContext:string}} settings
 */
export function setUserSettings(settings) {
  userSettings.role = settings.role || ''
  userSettings.systemContext = settings.systemContext || ''
}