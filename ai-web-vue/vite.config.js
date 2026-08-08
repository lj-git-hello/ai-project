import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// https://vitejs.dev/config/
// base：GitHub Pages 部署在子路径下需配置；开发/自定义域名部署用 '/'
//   用法：仓库根部署留空 ''，项目页用 '/仓库名/'
export default defineConfig({
  // GitHub Pages 部署时改为 '/你的仓库名/'，本地开发或自定义域名用 '/'
  base: './',
  plugins: [
    vue(),
    // 按需自动引入 Vue Composition API
    AutoImport({
      imports: ['vue'],
      resolvers: [ElementPlusResolver()],
      dts: false
    }),
    // 按需自动引入 Element Plus 组件间样式
    Components({
      resolvers: [ElementPlusResolver()],
      dts: false
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      // 将 SSE 流式接口代理到已完成的 Node.js 后端
      '/llm': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/llm_graph': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/history': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/upload': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})