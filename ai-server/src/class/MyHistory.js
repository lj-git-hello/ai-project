import { BaseChatMessageHistory } from "@langchain/core/chat_history";
import { getUserHistory, writeUserHistory } from "../utils.js";

/** 保留最近的消息条数（超出裁剪，防 token 爆炸） */
const MAX_RECENT = 20

export class MyHistory extends BaseChatMessageHistory {
  messages = []
  constructor(userId, sessionId) {
    super()
    const _history = getUserHistory(userId, sessionId)
    this.messages = _history
    this.userId = userId
    this.sessionId = sessionId
  }

  /**
   * 返回裁剪后的历史：保留第一条（会话主题上下文）+ 最近 MAX_RECENT 条。
   * 存储仍保留全量，仅传给模型时裁剪，不丢数据。
   */
  async getMessages() {
    const all = this.messages
    if (all.length <= MAX_RECENT + 1) return all
    // 第一条 + 最后 MAX_RECENT 条
    return [all[0], ...all.slice(-(MAX_RECENT))]
  }
  addMessages(mes) {
    if (Array.isArray(mes)) {
      this.messages.push(...mes)
    } else {
      this.messages.push(mes)
    }
    writeUserHistory(this.userId, this.sessionId, this.messages)
  }
  // 3. 实现 clear 方法
  async clear() {
    this.messages = []
    writeUserHistory(this.userId, this.sessionId, [])
  }
}