/**
 * 设置状态管理（Pinia）
 * 负责主题、角色、系统上下文等用户偏好的持久化与暗色主题切换。
 * role 和 systemContext 同时保存到后端内存（供 LLM 调用时读取）。
 * @module stores/settings
 */
import { defineStore } from 'pinia'
import { saveSettings as saveSettingsApi, fetchSettings as fetchSettingsApi } from '@/api/settings'

const STORAGE_KEY = 'ai-web:settings'

/** 读取本地存储中的设置 */
function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    return {}
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    /** @type {'light'|'dark'} 当前主题 */
    theme: loadSettings().theme || 'light',
    /** @type {string} 用户自定义角色（如"法律顾问""代码助手"） */
    role: loadSettings().role || '',
    /** @type {string} 用户自定义系统上下文（追加到模版 prompt 后） */
    systemContext: loadSettings().systemContext || ''
  }),

  actions: {
    /** 持久化到 localStorage */
    persist() {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ theme: this.theme, role: this.role, systemContext: this.systemContext })
      )
    },

    /**
     * 切换主题并同步到 <html> 的 class 上。
     * @param {'light'|'dark'} [theme] - 指定主题；缺省则切换
     */
    toggleTheme(theme) {
      this.theme = theme || (this.theme === 'dark' ? 'light' : 'dark')
      this.applyTheme()
      this.persist()
    },

    /** 应用当前主题到 DOM */
    applyTheme() {
      document.documentElement.classList.toggle('dark', this.theme === 'dark')
    },

    /**
     * 保存角色与系统上下文：本地持久化 + 同步到后端内存。
     * @returns {Promise<boolean>} 是否保存成功
     */
    async saveToServer() {
      this.persist()
      try {
        await saveSettingsApi({ role: this.role, systemContext: this.systemContext })
        return true
      } catch (e) {
        console.error('[settings] 同步到后端失败:', e)
        return false
      }
    },

    /**
     * 从后端拉取设置（页面初始化时调用，保持前后端一致）。
     */
    async loadFromServer() {
      try {
        const data = await fetchSettingsApi()
        if (data.role) this.role = data.role
        if (data.systemContext) this.systemContext = data.systemContext
      } catch (e) {
        /* 后端不可用时用本地值 */
      }
    }
  }
})