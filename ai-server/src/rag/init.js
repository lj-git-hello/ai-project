import { RecursiveCharacterTextSplitter } from "@langchain/classic/text_splitter"
import { OpenAIEmbeddings } from "@langchain/openai"
import { RagLanceDBStore } from "./vectorStore.js"
import { loadDocumentsFromDir } from "./loaders.js"
import { EMBEDDING_API_KEY, EMBEDDING_BASE_URL, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "../config.js"
import { dirname } from "path"
import { fileURLToPath } from "url"

// 获取当前文件所在目录（import.meta.dirname 在 CJS 环境下不可用）
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 项目根目录 = src/rag/ 往上跳两级
const PROJECT_ROOT = `${__dirname}/../../`

// Embedding 模型配置（百炼 DashScope，集中读取环境变量）
const embeddingModel = new OpenAIEmbeddings({
  model: EMBEDDING_MODEL,
  apiKey: EMBEDDING_API_KEY,
  dimensions: EMBEDDING_DIMENSIONS,
  configuration: {
    baseURL: EMBEDDING_BASE_URL
  }
})

// 向量存储实例（模块级单例）
let vectorStore = null

/**
 * 初始化 RAG：加载文档、分块、向量化、存入 LanceDB
 * 服务启动时调用一次，已有数据则跳过
 */
export async function initRAG() {
  vectorStore = new RagLanceDBStore(embeddingModel)
  await vectorStore.init()

  // 已有数据，跳过重复初始化
  if (await vectorStore.hasDocuments()) {
    console.log("[RAG] LanceDB 中已有数据，跳过文档加载")
    return
  }

  // 加载 rag/ 目录下的所有文档（使用绝对路径，避免 CWD 问题）
  const docs = await loadDocumentsFromDir(`${PROJECT_ROOT}rag`)
  if (docs.length === 0) {
    console.log("[RAG] 没有找到文档，RAG 功能未启用")
    return
  }

  // 文本分块
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50
  })
  const chunks = await splitter.splitDocuments(docs)
  console.log(`[RAG] 文档分块完成: ${chunks.length} 个块`)

  // 向量化并存入 LanceDB
  await vectorStore.addDocuments(chunks)
  console.log("[RAG] 文档向量化完成，已存入 LanceDB")
}

/**
 * 搜索相关文档
 * @param {string} query - 用户查询
 * @returns {Document[]} 相关文档片段
 */
export async function searchDocs(query) {
  if (!vectorStore) return []
  return await vectorStore.similaritySearch(query, 3)
}
