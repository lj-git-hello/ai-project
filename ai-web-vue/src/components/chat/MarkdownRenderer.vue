<script setup>
/**
 * Markdown 渲染组件
 * 通过 utils/markdown.renderMarkdown 将原文渲染为 HTML（含代码块复制按钮），
 * 用 v-html 输出，并在容器上做事件委托处理代码块的一键复制与成功反馈。
 * 流式更新时每次传入的最新完整文本会整体重渲染，天然满足「全量覆盖」。
 */
import { ref, watch, onBeforeUnmount } from 'vue'
import { renderMarkdown } from '@/utils/markdown'
import { copyText } from '@/utils/clipboard'

const props = defineProps({
  /** Markdown 原文（后端推送的完整累加文本） */
  content: { type: String, default: '' }
})

/** 渲染后的 HTML */
const html = ref('')
/** 每次渲染绑定的原始代码数组（与 data-idx 对应） */
const codes = ref([])

// content 变化即整体重渲染（流式每次推送的是完整文本，天然满足「全量覆盖」）
watch(
  () => props.content,
  (val) => {
    const result = renderMarkdown(val)
    html.value = result.html
    codes.value = result.codes
  },
  { immediate: true }
)

/** 当前复制成功的代码块下标，用于反馈态 */
const copiedIdx = ref(null)
let feedbackTimer = null

/** 事件委托：点击复制按钮时从 codes 取原文复制 */
async function onContainerClick(e) {
  const btn = e.target.closest('.code-copy-btn')
  if (!btn) return
  const idx = Number(btn.dataset.idx)
  const code = codes.value[idx]
  if (!code) return

  const ok = await copyText(code)
  if (ok) {
    copiedIdx.value = idx
    clearTimeout(feedbackTimer)
    feedbackTimer = setTimeout(() => (copiedIdx.value = null), 1500)
  }
}

onBeforeUnmount(() => clearTimeout(feedbackTimer))
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="markdown-body" @click="onContainerClick" v-html="html"></div>
</template>