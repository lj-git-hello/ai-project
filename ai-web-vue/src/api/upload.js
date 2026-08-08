/**
 * 文件上传接口封装
 * 用户上传文件后，后端存入 uploads 目录并返回 fileName，
 * 后续 /llm 请求带上文件信息，模型通过 read_file 工具读取。
 * @module api/upload
 */
import { API_BASE } from './base'

/**
 * 上传文件（支持多文件）。
 * @param {File[]} files - 浏览器 File 对象数组
 * @returns {Promise<Array<{fileName:string,originalName:string,size:number}>>}
 */
export async function uploadFiles(files) {
  const formData = new FormData()
  for (const f of files) {
    formData.append('files', f)
  }
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData
  })
  if (!res.ok) {
    let msg = `上传失败：${res.status} ${res.statusText}`
    try {
      const data = await res.json()
      if (data.error) msg = data.error
    } catch (e) {
      /* 忽略解析错误 */
    }
    throw new Error(msg)
  }
  const data = await res.json()
  return data.files || []
}