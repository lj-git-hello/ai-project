import { BaseChatMessageHistory } from "@langchain/core/chat_history";
import { getUserHistory, writeUserHistory } from "../utils.js";

export class MyHistory extends BaseChatMessageHistory {
  messages = []
  constructor(userId, sessionId) {
    super()
    const _history = getUserHistory(userId, sessionId)
    this.messages = _history
    this.userId = userId
    this.sessionId = sessionId
  }

  async getMessages() {
    return this.messages
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