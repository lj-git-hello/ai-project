<script setup>
/**
 * 代码块组件：显示语言标签 + 一键复制 + 复制成功反馈。
 * 实际代码 HTML 由 MarkdownRenderer 渲染，本组件负责复制交互的视觉反馈，
 * 通过事件委托（MarkdownRenderer 容器）触发。
 */
import { ref } from 'vue'
import { Check, Copy } from 'lucide-vue-next'

const props = defineProps({
  /** 语言标签 */
  lang: { type: String, default: 'code' },
  /** 原始代码文本 */
  code: { type: String, default: '' }
})

const copied = ref(false)
let timer = null

/** 复制代码并显示成功反馈 */
function onCopy() {
  import('@/utils/clipboard')
    .then(({ copyText }) => copyText(props.code))
    .then(() => {
      copied.value = true
      clearTimeout(timer)
      timer = setTimeout(() => (copied.value = false), 1500)
    })
}
</script>

<template>
  <div class="code-block select-none">
    <div class="code-block__head">
      <span class="code-block__lang">{{ lang }}</span>
      <button type="button" class="code-copy-btn" @click="onCopy">
        <Check v-if="copied" :size="14" class="text-emerald-500" />
        <Copy v-else :size="14" />
        <span>{{ copied ? '已复制' : '复制' }}</span>
      </button>
    </div>
    <pre><code><slot /></code></pre>
  </div>
</template>