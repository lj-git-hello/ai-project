/**
 * 会话状态管理（Pinia）
 * 会话管理已迁至后端：会话列表从 /history 拉取、删除走 /history，
 * 前端本地仅持久化 userId（用户信息），不再缓存会话。
 * 后端流式接口每次推送的是「已拼接的完整文本」，因此 assistant 消息必须
 * 全量覆盖替换（updateAssistantContent），而非逐字追加。
 * @module stores/chat
 */
import { defineStore } from 'pinia'
import { genId, genUserId, genSessionId } from '@/utils/id'
import { formatTitle } from '@/utils/time'
import { fetchHistory as fetchHistoryApi, deleteHistory as deleteHistoryApi } from '@/api/history'

const USER_KEY = 'ai-web:userId'

export const useChatStore = defineStore('chat', {
  state: () => ({
    /** @type {string} 当前用户匿名标识 */
    userId: '',
    /** @type {Array<{id:string,title:string,createdAt:number,messages:Array}>} 会话列表 */
    sessions: [],
    /** @type {string|null} 当前激活会话 ID */
    activeSessionId: null,
    /** @type {string|null} 正在流式生成的会话 ID */
    streamingSessionId: null,
    /** @type {boolean} 会话列表是否正在从服务端加载 */
    loading: false
  }),

  getters: {
    /** 当前激活的会话对象 */
    activeSession(state) {
      return state.sessions.find((s) => s.id === state.activeSessionId) || null
    },

    /** 当前会话消息列表 */
    messages(state) {
      return this.activeSession ? this.activeSession.messages : []
    },

    /** 是否正在生成中 */
    isStreaming() {
      return !!this.streamingSessionId
    }
  },

  actions: {
    /** 初始化：确保存在 userId（会话列表由 fetchHistory 从服务端拉取） */
    initStore() {
      let id = localStorage.getItem(USER_KEY)
      if (!id) {
        id = genUserId()
        localStorage.setItem(USER_KEY, id)
      }
      this.userId = id
    },

    /**
     * 从服务端拉取历史会话列表并填充。
     * 会话管理已迁至后端，前端本地不再持久化会话。
     */
    async fetchHistory() {
      if (!this.userId) return
      this.loading = true
      try {
        const remote = await fetchHistoryApi(this.userId)
        this.sessions = remote
          .map((s) => ({
            id: s.id,
            title: s.title || '新对话',
            createdAt: s.createdAt || Date.now(),
            messages: (s.messages || []).map((m) => ({
              id: genId('m_'),
              role: m.role,
              content: m.content,
              status: 'done'
            }))
          }))
          // 按 createdAt 倒序，保证 sessions[0] 为最新会话
          .sort((a, b) => b.createdAt - a.createdAt)
        if (this.sessions.length > 0) {
          this.activeSessionId = this.sessions[0].id
        } else if (!this.activeSessionId) {
          // 服务端无历史：建一个空会话兜底，便于直接输入
          this.createSession()
        }
      } catch (e) {
        // 拉取失败：若无任何会话则建一个空会话，保证可用
        if (this.sessions.length === 0) {
          this.createSession()
        }
      } finally {
        this.loading = false
      }
    },

    /** 新建会话并激活 */
    createSession() {
      const session = {
        id: genSessionId(),
        title: '新对话',
        createdAt: Date.now(),
        messages: []
      }
      this.sessions.unshift(session)
      this.activeSessionId = session.id
      return session
    },

    /** 切换到指定会话 */
    selectSession(id) {
      if (!this.sessions.find((s) => s.id === id)) return
      this.activeSessionId = id
    },

    /**
     * 添加一条消息并返回该消息。
     * @param {string} role - 'user' | 'assistant'
     * @param {string} content - 消息内容
     * @param {{status?: string, id?: string}} [opts]
     * @returns {object} 新消息对象
     */
    pushMessage(sessionId, role, content, opts = {}) {
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return null
      const message = {
        id: opts.id || genSessionId(),
        role,
        content,
        status: opts.status || 'done'
      }
      session.messages.push(message)

      // 用首条用户输入自动生成会话标题
      if (role === 'user' && session.title === '新对话') {
        session.title = formatTitle(content)
      }
      return message
    },

    /**
     * 全量覆盖替换 assistant 消息内容（后端推送的是完整累加值）。
     * @param {string} sessionId - 会话 ID
     * @param {string} messageId - 消息 ID
     * @param {string} content - 最新完整文本
     */
    updateAssistantContent(sessionId, messageId, content) {
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return
      const msg = session.messages.find((m) => m.id === messageId)
      if (msg) msg.content = content
    },

    /** 修改消息状态（streaming / done / error） */
    setMessageStatus(sessionId, messageId, status) {
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return
      const msg = session.messages.find((m) => m.id === messageId)
      if (msg) msg.status = status
    },

    /** 开始流式生成：记录会话并持有 AbortController */
    startStreaming(sessionId) {
      this.streamingSessionId = sessionId
      this._controller = new AbortController()
    },

    /** 中断当前流式请求（AbortController.abort） */
    stopStreaming() {
      if (this._controller) {
        this._controller.abort()
        this._controller = null
      }
      this.streamingSessionId = null
    },

    /** 流式结束（正常或出错）时清理状态 */
    finishStreaming() {
      this._controller = null
      if (this.streamingSessionId) {
        this.streamingSessionId = null
      }
    },

    /** 重命名会话 */
    renameSession(id, title) {
      const session = this.sessions.find((s) => s.id === id)
      if (session && title && title.trim()) {
        session.title = title.trim()
      }
    },

    /**
     * 删除会话：乐观删除本地 + 同步后端，失败回滚。
     * 仅本地存在（尚未同步到后端）的会话，后端返回 false 也视为成功。
     * @param {string} id - 会话 ID
     */
    async deleteSession(id) {
      const prev = this.sessions
      const prevActive = this.activeSessionId
      this.sessions = this.sessions.filter((s) => s.id !== id)
      if (this.activeSessionId === id) {
        this.activeSessionId = this.sessions.length > 0 ? this.sessions[0].id : null
      }
      try {
        await deleteHistoryApi(this.userId, id)
      } catch (e) {
        // 后端删除失败：回滚本地状态
        this.sessions = prev
        this.activeSessionId = prevActive
        throw e
      }
    },

    /** 清空当前会话消息 */
    clearSession() {
      if (this.activeSession) {
        this.activeSession.messages = []
        this.activeSession.title = '新对话'
        this.activeSession.createdAt = Date.now()
      }
    },

    /**
     * 删除指定会话中的某条消息。
     * @param {string} sessionId - 会话 ID
     * @param {string} messageId - 消息 ID
     */
    removeMessage(sessionId, messageId) {
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return
      session.messages = session.messages.filter((m) => m.id !== messageId)
    },

    /**
     * 截断会话消息：保留截至（不含）指定消息之前的所有消息。
     * 用于「编辑后重发」场景——丢弃该用户消息及其后的所有回复重新生成。
     * @param {string} sessionId - 会话 ID
     * @param {string} messageId - 截断起点的消息 ID
     * @returns {Array} 被截断掉的消息（含起点），调用方可取首条用户输入重发
     */
    truncateAfter(sessionId, messageId) {
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return []
      const idx = session.messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return []
      const removed = session.messages.splice(idx)
      return removed
    }
  }
})