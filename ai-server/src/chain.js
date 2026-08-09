import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { customCalc, fetchUrl, bingSearch, getCurrentTime, readFile } from "./tool.js";
import { LLM_API_KEY, LLM_BASE_URL, CHAT_MODEL } from "./config.js";
import { userSettings } from "./userSettings.js";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

/** 自研工具集合：随每次对话注入，与 MCP 工具(extraTool)合并后绑定到模型 */
const builtinTools = [customCalc, fetchUrl, bingSearch, getCurrentTime, readFile]

/**
 * 读取 system prompt 模版文件（src/context/systemContext.md）。
 * 模块加载时读取一次到内存，之后每次对话只做 {role} 替换 + 追加用户上下文，不再读文件。
 * 文件不存在或读取失败时回退到内置默认模版，保证服务可用。
 */
const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = resolve(__dirname, "context/systemContext.md")

let _templateCache
try {
  _templateCache = fs.readFileSync(TEMPLATE_PATH, "utf-8")
  console.log("[chain] 已加载 system prompt 模版: context/systemContext.md")
} catch (e) {
  _templateCache = "你是「{role}」，一个高效、专业的企业级 AI 助手。"
  console.warn("[chain] 读取 system prompt 模版失败，使用默认: ", e.message)
}

/**
 * 生成最终 system prompt：
 *  1. 读取模版文件，替换 {role}（用户未设则默认"个人助手"）
 *  2. 追加用户自定义的系统上下文（userSettings.systemContext）
 * @returns {string} 完整 system prompt
 */
function buildSystemPrompt() {
  const role = userSettings.role && userSettings.role.trim()
    ? userSettings.role.trim()
    : "个人助手"
  let prompt = _templateCache.replace(/\{role\}/g, role)
  // 追加用户自定义上下文
  if (userSettings.systemContext && userSettings.systemContext.trim()) {
    prompt += "\n\n## 用户自定义上下文\n" + userSettings.systemContext.trim()
  }
  return prompt
}

/**
 * 构建对话链（非 RAG，工具回调时用）。
 * @param {Array} extraTool - 额外的工具列表（MCP 工具）
 * @param {string} type - "human" 或 "tool"
 */
export function userChatChain(extraTool, type = "human") {
  const systemPrompt = buildSystemPrompt()
  let prompt = null
  if (type === 'human') {
    prompt = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      new MessagesPlaceholder("history"),
      ["human", "{question}"]
    ])
  } else {
    prompt = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      new MessagesPlaceholder("history"),
      new MessagesPlaceholder("toolResult")
    ])
  }

  const model = new ChatOpenAI({
    model: CHAT_MODEL,
    apiKey: LLM_API_KEY,
    configuration: {
      baseURL: LLM_BASE_URL
    },
    maxTokens: 8192
  })
  const modelWithTool = model.bindTools([...builtinTools, ...extraTool])

  const chain = prompt.pipe(modelWithTool)
  return chain
}

/**
 * RAG 对话链：system prompt 中注入检索到的参考资料
 * @param {Array} extraTool - 额外的工具列表
 * @param {string} type - "human" 或 "tool"
 */
export function ragChatChain(extraTool, type = "human") {
  const systemPrompt = buildSystemPrompt()
  let prompt = null
  if (type === 'human') {
    prompt = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt + "\n\n以下是相关的参考资料，请优先基于这些资料回答问题：\n{context}"],
      new MessagesPlaceholder("history"),
      ["human", "{question}"]
    ])
  } else {
    prompt = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      new MessagesPlaceholder("history"),
      new MessagesPlaceholder("toolResult")
    ])
  }

  const model = new ChatOpenAI({
    model: CHAT_MODEL,
    apiKey: LLM_API_KEY,
    configuration: {
      baseURL: LLM_BASE_URL
    },
    maxTokens: 8192
  })
  const modelWithTool = model.bindTools([...builtinTools, ...extraTool])

  const chain = prompt.pipe(modelWithTool)
  return chain
}