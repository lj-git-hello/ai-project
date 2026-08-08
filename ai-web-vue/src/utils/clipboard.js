/**
 * 剪贴板工具
 * @module utils/clipboard
 */

/**
 * 将文本复制到剪贴板。
 * 优先使用 `navigator.clipboard`，在非安全上下文（非 https/localhost）下回退到
 * 隐藏 textarea + `document.execCommand('copy')`。
 * @param {string} text - 要复制的文本
 * @returns {Promise<boolean>} 是否复制成功
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (e) {
    // 继续走回退方案
  }

  return new Promise((resolve) => {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    try {
      const ok = document.execCommand('copy')
      resolve(ok)
    } catch (e) {
      resolve(false)
    } finally {
      document.body.removeChild(textarea)
    }
  })
}