<script setup>
/**
 * 思考中指示器：三点跳动动画。
 * 在 assistant 首字到达前或工具调用间隙展示。
 */
defineProps({
  /** 是否显示文字提示 */
  text: { type: String, default: '思考中' }
})
</script>

<template>
  <div class="typing-indicator">
    <span class="typing-dot" />
    <span class="typing-dot" style="animation-delay: 0.15s" />
    <span class="typing-dot" style="animation-delay: 0.3s" />
    <span v-if="text" class="typing-text">{{ text }}</span>
  </div>
</template>

<style scoped>
.typing-indicator {
  @apply inline-flex items-center gap-1 px-1 py-2 text-gray-400 dark:text-gray-500;
}
.typing-dot {
  @apply inline-block w-2 h-2 rounded-full bg-current;
}
.typing-text {
  @apply ml-2 text-sm;
}
</style>
