/**
 * 设置状态管理（Pinia）
 * 负责主题、API Key、System Prompt 等用户偏好的持久化与暗色主题切换。
 * @module stores/settings
 */
import { defineStore } from 'pinia'

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
    /** @type {string} API Key（仅本地偏好，后端持钥，不参与透传） */
    apiKey: loadSettings().apiKey || '',
    /** @type {string} System Prompt（本地偏好配置） */
    systemPrompt: loadSettings().systemPrompt || ''
  }),

  actions: {
    /** 持久化到 localStorage */
    persist() {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ theme: this.theme, apiKey: this.apiKey, systemPrompt: this.systemPrompt })
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

    /** 更新 API Key */
    setApiKey(value) {
      this.apiKey = value
      this.persist()
    },

    /** 更新 System Prompt */
    setSystemPrompt(value) {
      this.systemPrompt = value
      this.persist()
    }
  }
})