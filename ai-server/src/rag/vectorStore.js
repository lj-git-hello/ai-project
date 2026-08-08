import * as lancedb from "@lancedb/lancedb"
import { Document } from "@langchain/core/documents"

/**
 * LanceDB 向量存储封装
 * 用于 RAG 场景的文档存储和相似度检索
 */
export class RagLanceDBStore {
  constructor(embeddingModel, tableName = "rag_docs") {
    this.embeddings = embeddingModel
    this.tableName = tableName
    this.db = null
    this.table = null
  }

  /**
   * 初始化：连接数据库，打开或创建表
   */
  async init() {
    this.db = await lancedb.connect("./lancedb-data")
    const tables = await this.db.tableNames()
    if (tables.includes(this.tableName)) {
      this.table = await this.db.openTable(this.tableName)
    } else {
      this.table = null
    }
  }

  /**
   * 判断表中是否已有数据
   */
  async hasDocuments() {
    if (!this.table) return false
    const result = await this.table.query().limit(1).toArray()
    return result.length > 0
  }

  /**
   * 批量添加文档（含向量计算）
   * @param {Document[]} docs - LangChain Document 数组
   */
  async addDocuments(docs) {
    if (docs.length === 0) return

    // 批量生成向量
    const texts = docs.map(d => d.pageContent)
    const vectors = await this.embeddings.embedDocuments(texts)

    // 构建 LanceDB 行数据
    const rows = docs.map((doc, i) => ({
      text: doc.pageContent,
      vector: vectors[i],
      metadata: JSON.stringify(doc.metadata || {})
    }))

    if (!this.table) {
      // 表不存在，创建新表
      this.table = await this.db.createTable(this.tableName, rows, {
        mode: "create"
      })
    } else {
      // 表已存在，追加数据
      await this.table.add(rows)
    }
  }

  /**
   * 相似度搜索
   * @param {string} query - 查询文本
   * @param {number} k - 返回结果数
   * @returns {Document[]}
   */
  async similaritySearch(query, k = 3) {
    if (!this.table) return []

    // 生成查询向量
    const vector = await this.embeddings.embedQuery(query)

    // LanceDB 向量搜索
    const results = await this.table.search(vector).limit(k).toArray()

    // 转换为 LangChain Document
    return results.map(row => new Document({
      pageContent: row.text,
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    }))
  }
}
