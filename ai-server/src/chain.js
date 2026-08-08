import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { customCalc, fetchUrl, bingSearch, readFile } from "./tool.js";
import { LLM_API_KEY, LLM_BASE_URL, CHAT_MODEL } from "./config.js";

/** 自研工具集合：随每次对话注入，与 MCP 工具(extraTool)合并后绑定到模型 */
const builtinTools = [customCalc, fetchUrl, bingSearch, readFile]


export function userChatChain(extraTool, type = "human") {
  let prompt = null
  if (type === 'human') {
    prompt = ChatPromptTemplate.fromMessages([
      ["system", "你是一个{role}"],
      new MessagesPlaceholder("history"),
      ["human", "{question}"]
    ])
  } else {
    prompt = ChatPromptTemplate.fromMessages([
      ["system", "你是一个{role}"],
      new MessagesPlaceholder("history"),
      new MessagesPlaceholder("toolResult")
    ])
  }

  const model = new ChatOpenAI({
    model: CHAT_MODEL,
    apiKey: LLM_API_KEY,
    configuration: {
      baseURL: LLM_BASE_URL
    }
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
  let prompt = null
  if (type === 'human') {
    prompt = ChatPromptTemplate.fromMessages([
      ["system", "你是一个{role}。\n\n以下是相关的参考资料，请优先基于这些资料回答问题：\n{context}"],
      new MessagesPlaceholder("history"),
      ["human", "{question}"]
    ])
  } else {
    prompt = ChatPromptTemplate.fromMessages([
      ["system", "你是一个{role}"],
      new MessagesPlaceholder("history"),
      new MessagesPlaceholder("toolResult")
    ])
  }

  const model = new ChatOpenAI({
    model: CHAT_MODEL,
    apiKey: LLM_API_KEY,
    configuration: {
      baseURL: LLM_BASE_URL
    }
  })
  const modelWithTool = model.bindTools([...builtinTools, ...extraTool])

  const chain = prompt.pipe(modelWithTool)
  return chain
}