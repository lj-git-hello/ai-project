/**
 * Markdown 渲染工具
 * 基于 markdown-it + highlight.js，并自定义代码块（fence）渲染，
 * 为每个代码块包裹头部（语言标签 + 复制按钮），同时把原始代码登记到
 * 渲染时传入的 `env.codeBucket`，供组件事件委托复制使用。
 * @module utils/markdown
 */
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    // 优先按标注语言高亮；不识别或未标注时用 highlightAuto 自动检测，
    // 保证代码块始终带 hljs-* token 着色，避免单色难以阅读。
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
      } catch (e) {
        /* 高亮失败回退到自动检测 */
      }
    }
    try {
      return hljs.highlightAuto(str).value
    } catch (e) {
      return md.utils.escapeHtml(str)
    }
  }
})

// 自定义 fence 渲染规则：输出带头部（语言 + 复制按钮）的代码块容器
const defaultFence =
  md.renderer.rules.fence ||
  function defaultFence(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const info = (token.info || '').trim()
  const lang = info.split(/\s+/)[0] || ''
  const rawCode = token.content

  // 登记原始代码，data-idx 指向 env.codeBucket 的下标
  const envs = env || {}
  envs.codeBucket = envs.codeBucket || []
  const codeIndex = envs.codeBucket.length
  envs.codeBucket.push(rawCode)

  const highlighted = options.highlight(rawCode, lang)
  const langLabel = lang && hljs.getLanguage(lang) ? lang : ''

  return (
    `<div class="code-block">` +
    `<div class="code-block__head">` +
    `<span class="code-block__lang">${langLabel || 'code'}</span>` +
    `<button type="button" class="code-copy-btn" data-idx="${codeIndex}">复制</button>` +
    `</div>` +
    `<pre><code class="hljs">${highlighted}</code></pre>` +
    `</div>`
  )
}

/**
 * 渲染 Markdown 文本。
 * @param {string} content - Markdown 原文
 * @returns {{ html: string, codes: string[] }} 渲染后的 HTML 与代码块原始代码数组
 */
export function renderMarkdown(content) {
  const env = { codeBucket: [] }
  const html = md.render(content || '', env)
  return { html, codes: env.codeBucket }
}