/**
 * 集中读取环境变量配置
 * 所有密钥、端点、模型名统一从此模块取，禁止在业务代码里硬编码。
 * 本地开发用 .env 文件提供（dotenv 加载），生产用环境变量注入。
 *
 * 当前架构（均走 OpenAI 兼容协议）：
 *   - 对话模型：火山引擎方舟
 *   - Embedding：阿里云百炼 DashScope
 * @module config
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

// 加载 .env：基于 config.js 文件位置定位（../.env），不依赖启动时 cwd
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

/** 缺失则给出明确提示，避免运行时静默失败 */
function requireEnv(key, fallback) {
  const v = process.env[key] || fallback
  if (!v) {
    console.warn(`[config] 环境变量 ${key} 未设置，相关功能可能不可用`)
  }
  return v
}

/* ===== 对话模型：火山引擎方舟（OpenAI 兼容协议） ===== */
/** 火山引擎 API Key（ark- 开头） */
export const LLM_API_KEY = requireEnv('LLM_API_KEY', '')
/** 火山引擎方舟 baseURL（OpenAI 兼容协议，Coding Plan 专属地址） */
export const LLM_BASE_URL = process.env.LLM_BASE_URL
  || 'https://ark.cn-beijing.volces.com/api/coding/v3'
/** Coding Plan 模型名（glm-5.3 / doubao-seed-2.0-lite / kimi-k2.7-code 等） */
export const CHAT_MODEL = process.env.CHAT_MODEL || 'glm-5.3'

/* ===== Embedding 模型：火山引擎方舟（与对话模型同一 Coding 端点/Key） ===== */
/** 火山引擎 API Key（ark- 开头） */
export const EMBEDDING_API_KEY = requireEnv('EMBEDDING_API_KEY', '')
/** 火山引擎方舟 baseURL（OpenAI 兼容协议，Coding Plan 专属地址） */
export const EMBEDDING_BASE_URL = process.env.EMBEDDING_BASE_URL
  || 'https://ark.cn-beijing.volces.com/api/coding/v3'
/** 方舟 embedding 模型名（doubao-embedding-vision，支持 dimensions=1024） */
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'doubao-embedding-vision'
/** Embedding 维度 */
export const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS) || 1024

/** 服务监听端口 */
export const PORT = Number(process.env.PORT) || 3000

/** 是否生产环境（控制调试写盘等行为） */
export const IS_PROD = process.env.NODE_ENV === 'production'

/* ===== 向后兼容：旧变量名映射 ===== */
export const DASHSCOPE_API_KEY = EMBEDDING_API_KEY
export const DASHSCOPE_BASE_URL = EMBEDDING_BASE_URL