import { BaseCheckpointSaver } from "@langchain/langgraph";
import { mapChatMessagesToStoredMessages, mapStoredMessagesToChatMessages } from "@langchain/core/messages"
import fs from "fs"

export class FileSystemSaver extends BaseCheckpointSaver {
  constructor(baseDir = './chat') {
    super()
    this.baseDir = baseDir
  }

  getUserHistory(userId, sessionId) {
    const userPath = `./chat/${userId}.json`

    const isExit = fs.existsSync(userPath)
    if (isExit) {

      const history = JSON.parse(fs.readFileSync(userPath).toString())
      const userHistory = history[sessionId] || {}
      // 兼容 /llm 接口的数组格式：如果是数组说明是 /llm 写入的，返回空对象当作新对话
      if (Array.isArray(userHistory)) {
        return {}
      }
      return userHistory

    } else {
      const initHistory = {
        [sessionId]: {}
      }

      fs.writeFileSync(userPath, JSON.stringify(initHistory))
      return []
    }

  }

  writeUserHistory(userId, sessionId, historyMessage) {
    const userPath = `./chat/${userId}.json`
    const history = JSON.parse(fs.readFileSync(userPath).toString())
    history[sessionId] = historyMessage
    fs.writeFileSync(userPath, JSON.stringify(history))
  }

  async put(config, writes, metadata) {
    const { userId, sessionId } = config.configurable
    this.writeUserHistory(userId, sessionId, {
      checkpoint: writes,
      metadata: metadata
    })
  }
  async getTuple(config) {
    // 根据用户的id查询到之前的记录，继续回复对话，如果不存在就是新对话
    const { userId, sessionId } = config.configurable
    const history = this.getUserHistory(userId, sessionId)
    const checkpoint = history.checkpoint
    if (checkpoint) {
      // 已经存在的对话
      return {
        checkpoint: checkpoint,
        metadata: history.metadata,
        config: {
          configurable: {
            userId,
            sessionId
          }
        }
      }
    } else {
      // 新对话
      return undefined
    }
  }
  async putWrites() {
    // 存增量

  }
}