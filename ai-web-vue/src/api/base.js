/**
 * API 基础配置
 * 生产环境通过 VITE_API_BASE 指定后端域名（前后端分域部署时）；
 * 默认空串走相对路径，适用于前后端同域（Nginx 同时代理静态与 API）。
 * @module api/base
 */
export const API_BASE = import.meta.env.VITE_API_BASE || ''