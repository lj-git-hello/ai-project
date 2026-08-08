<script setup>
/**
 * 应用根组件
 * - 应用主题（从 settings store 恢复暗色模式）
 * - 渲染路由出口
 */
import { onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()

onMounted(() => {
  settingsStore.applyTheme()
})
</script>

<template>
  <router-view />
</template>

<style>
/* 全局样式在 main.js 中通过 styles/index.css 引入 */
</style>
