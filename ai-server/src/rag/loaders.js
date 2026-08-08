import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx"
import { Document } from "@langchain/core/documents"
import * as XLSX from "xlsx"
import fs from "fs"
import path from "path"

/**
 * Excel 加载器：使用 xlsx 库提取每个工作表的文本
 */
class ExcelLoader {
  constructor(filePath) {
    this.filePath = filePath
  }

  async load() {
    const buffer = fs.readFileSync(this.filePath)
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    // 逐个工作表拼接，保留表名与行结构，便于模型理解
    const sheets = workbook.SheetNames.map((name) => {
      const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name])
      return `# 工作表: ${name}\n${csv}`
    }).join('\n\n')
    return [new Document({
      pageContent: sheets,
      metadata: { source: this.filePath }
    })]
  }
}

/**
 * 纯文本加载器（md / txt）
 */
class TextLoader {
  constructor(filePath) {
    this.filePath = filePath
  }

  async load() {
    const text = fs.readFileSync(this.filePath, "utf-8")
    return [new Document({
      pageContent: text,
      metadata: { source: this.filePath }
    })]
  }
}

/**
 * 根据文件扩展名返回对应的加载器实例
 * @param {string} filePath
 * @returns {object|null} 加载器实例，不支持的格式返回 null
 */
function getLoader(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.pdf':
      return new PDFLoader(filePath)
    case '.docx':
      return new DocxLoader(filePath)
    case '.md':
    case '.txt':
      return new TextLoader(filePath)
    case '.xlsx':
    case '.xls':
      return new ExcelLoader(filePath)
    default:
      return null
  }
}

/**
 * 扫描目录并加载所有支持的文档
 * @param {string} dirPath - 文档目录路径
 * @returns {Document[]}
 */
export async function loadDocumentsFromDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`[RAG] 目录不存在: ${dirPath}，跳过文档加载`)
    return []
  }

  const files = fs.readdirSync(dirPath)
  const allDocs = []

  for (const file of files) {
    const filePath = path.join(dirPath, file)
    // 跳过子目录
    if (fs.statSync(filePath).isDirectory()) continue

    const loader = getLoader(filePath)
    if (!loader) {
      console.log(`[RAG] 跳过不支持的文件格式: ${file}`)
      continue
    }

    try {
      const docs = await loader.load()
      allDocs.push(...docs)
      console.log(`[RAG] 已加载: ${file} (${docs.length} 个文档块)`)
    } catch (err) {
      console.error(`[RAG] 加载文件失败: ${file}`, err.message)
    }
  }

  console.log(`[RAG] 共加载 ${allDocs.length} 个文档块`)
  return allDocs
}

/**
 * 按路径加载文档（单文件或目录），供 read_file 工具调用。
 * 单文件时根据扩展名选择加载器；目录时委托 loadDocumentsFromDir。
 * @param {string} filePathOrDir - 文件或目录路径
 * @returns {Document[]}
 */
export async function loadDocumentsByPath(filePathOrDir) {
  if (!fs.existsSync(filePathOrDir)) return []
  if (fs.statSync(filePathOrDir).isDirectory()) {
    return loadDocumentsFromDir(filePathOrDir)
  }
  const loader = getLoader(filePathOrDir)
  if (!loader) return []
  try {
    return await loader.load()
  } catch (e) {
    console.error(`[loaders] 加载失败: ${filePathOrDir}`, e.message)
    return []
  }
}
