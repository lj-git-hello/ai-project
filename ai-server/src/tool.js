import { tool } from "@langchain/core/tools";
import z from "zod"
import { loadDocumentsByPath } from "./rag/loaders.js"
import path from "path"
import fs from "fs"

/** 上传文件存放根目录（read_file 仅允许读取该目录下文件，防路径穿越） */
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads')

/**
 * 网页抓取工具：给定 URL，返回清洗后的正文文本。
 * 用于搜索拿到链接后读取网页内容，形成「搜+读+总结」闭环。
 * 内置简单 HTML 标签/脚本清理，控制返回长度避免撑爆上下文。
 */
export const fetchUrl = tool(
  async ({ url }) => {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AI-Assistant/1.0)',
        Accept: 'text/html,application/xhtml+xml'
      },
      redirect: 'follow'
    })
    if (!res.ok) {
      return `抓取失败：HTTP ${res.status} ${res.statusText}`
    }
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return `不支持的响应类型：${contentType}`
    }
    const html = await res.text()

    // 简单清洗：去 script/style/nav，剥标签，压空白
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    // 截断，避免单次抓取占用过多 token
    const MAX = 6000
    return cleaned.length > MAX ? cleaned.slice(0, MAX) + '\n\n...(内容已截断)' : cleaned
  },
  {
    name: 'fetch_url',
    description: '抓取指定 URL 的网页正文内容。当需要读取某个网页链接的详细内容时调用，输入完整网址。常用于搜索后读取具体页面。',
    schema: z.object({
      url: z.string().url().describe("要抓取的完整网页地址，需包含 http(s)://")
    })
  }
)

/**
 * Bing 搜索工具：国内可直连、免 API Key 的联网搜索。
 * 直接抓取 cn.bing.com 搜索结果页，解析提取标题/链接/摘要返回给模型。
 * 配合 fetch_url 工具形成「搜 -> 读 -> 总结」闭环。
 */
export const bingSearch = tool(
  async ({ query, count = 5 }) => {
    const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=${count}`
    const res = await fetch(url, {
      headers: {
        // 带浏览器 UA，避免被 Bing 识别为机器人返回空结果
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      redirect: 'follow'
    })
    if (!res.ok) {
      return `搜索失败：HTTP ${res.status} ${res.statusText}`
    }
    const html = await res.text()

    // Bing 搜索结果项在 <li class="b_algo"> 内，提取标题/链接/摘要
    const results = []
    const items = html.match(/<li class="b_algo"[\s\S]*?<\/li>/gi) || []
    for (const item of items.slice(0, count)) {
      const titleMatch = item.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)
      const linkMatch = item.match(/<a[^>]+href="([^"]+)"/i)
      const snippetMatch = item.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
        || item.match(/class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i)
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : ''
      const link = linkMatch ? linkMatch[1] : ''
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : ''
      if (title) {
        results.push({ title, link, snippet })
      }
    }

    if (results.length === 0) {
      return `未找到与「${query}」相关的搜索结果，可尝试换个关键词。`
    }

    // 拼成结构化文本，方便模型理解并决定是否调 fetch_url 深入读取
    const text = results
      .map((r, i) => `${i + 1}. ${r.title}\n   链接: ${r.link}\n   摘要: ${r.snippet}`)
      .join('\n\n')
    return `搜索「${query}」找到 ${results.length} 条结果：\n\n${text}`
  },
  {
    name: 'bing_search',
    description: '使用 Bing 搜索引擎联网搜索。当用户询问时事、最新信息、或需要查找网络资料时调用。返回多条搜索结果（标题+链接+摘要），如需深入了解某条结果，可再用 fetch_url 工具读取对应链接。',
    schema: z.object({
      query: z.string().describe("搜索关键词"),
      count: z.number().optional().describe("返回结果数量，默认 5 条")
    })
  }
)

/**
 * 时间查询工具：获取指定时区的当前时间，或进行时区换算。
 * 自研替代原 time MCP，不依赖外部 session，零网络依赖更稳定。
 */
export const getCurrentTime = tool(
  async ({ timezone }) => {
    try {
      const now = new Date()
      let timeStr
      if (timezone) {
        // 指定时区：用 Intl 格式化
        timeStr = new Intl.DateTimeFormat('zh-CN', {
          timeZone: timezone,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false
        }).format(now)
      } else {
        // 本地时间
        timeStr = new Intl.DateTimeFormat('zh-CN', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false
        }).format(now)
      }
      return `当前时间（${timezone || '本地时区'}）：${timeStr}`
    } catch (e) {
      // 时区无效时回退本地时间
      return `时区「${timezone}」无效，当前本地时间：${new Date().toLocaleString('zh-CN')}`
    }
  },
  {
    name: 'get_current_time',
    description: '获取指定时区的当前时间。当用户询问"现在几点""某个城市的时间"或需要时区换算时调用。',
    schema: z.object({
      timezone: z.string().optional().describe("时区标识，如 Asia/Shanghai、America/New_York、America/Los_Angeles。不填则返回本地时间")
    })
  }
)

/**
 * 文件读取工具：读取用户上传的文档文件内容（支持 pdf/docx/xlsx/md/txt/csv）。
 * 出于安全考虑，仅允许读取 uploads 目录下的文件，路径会被规范化后做穿越校验。
 * 入参 fileName 为上传时返回的文件名（不含目录）。
 */
export const readFile = tool(
  async ({ fileName }) => {
    try {
      // 仅允许读 uploads 目录：resolve 后校验是否仍在该目录内，防 ../ 穿越
      const safePath = path.resolve(UPLOAD_DIR, fileName)
      if (!safePath.startsWith(UPLOAD_DIR + path.sep)) {
        return `拒绝读取：路径越界，仅允许读取上传目录下的文件`
      }
      if (!fs.existsSync(safePath)) {
        return `文件不存在：${fileName}`
      }
      const docs = await loadDocumentsByPath(safePath)
      if (docs.length === 0) {
        return `未找到可读取的内容：${fileName}`
      }
      const text = docs
        .map((d) => `[来源: ${fileName}]\n${d.pageContent}`)
        .join('\n\n---\n\n')
      const MAX = 8000
      return text.length > MAX ? text.slice(0, MAX) + '\n\n...(内容已截断)' : text
    } catch (e) {
      return `读取文件失败：${e.message}`
    }
  },
  {
    name: 'read_file',
    description: '读取用户上传文档的文本内容，支持 pdf、docx、xlsx、md、txt、csv 格式。当用户上传了文件、或要求分析某文档时调用，传入上传返回的 fileName。',
    schema: z.object({
      fileName: z.string().describe("上传文件返回的文件名，例如 'abc123_report.pdf'")
    })
  }
)

export const toolMap = {
  [fetchUrl.name]: fetchUrl,
  [bingSearch.name]: bingSearch,
  [getCurrentTime.name]: getCurrentTime,
  [readFile.name]: readFile
}
