<script setup>
/**
 * 单条消息气泡
 *  - 用户消息：右对齐纯文本，支持复制 / 编辑后重发
 *  - 助手消息：左对齐 Markdown 渲染，支持复制 / 重试；流式或思考中时展示指示器
 * 代码块的一键复制由 MarkdownRenderer 内部事件委托完成
 */
import { computed, ref } from 'vue'
import { User, Sparkles, Copy, Check, RotateCw, Pencil } from 'lucide-vue-next'
import MarkdownRenderer from './MarkdownRenderer.vue'
import TypingIndicator from './TypingIndicator.vue'
import { copyText } from '@/utils/clipboard'

const props = defineProps({
  /** 消息对象 { id, role, content, status } */
  message: { type: Object, required: true },
  /** 是否为流式生成中的最后一条（用于显示思考态） */
  streaming: { type: Boolean, default: false }
})

const emit = defineEmits(['retry', 'edit'])

const isUser = computed(() => props.message.role === 'user')
const isAssistant = computed(() => props.message.role === 'assistant')

/** 助手是否处于思考中：流式中且尚无任何内容 */
const isThinking = computed(
  () => isAssistant.value && props.streaming && !props.message.content
)

/** 助手正在流式输出 */
const isStreamingText = computed(
  () => isAssistant.value && props.streaming && !!props.message.content
)

const status = computed(() => props.message.status)
const isError = computed(() => status.value === 'error')

/** 复制整条消息文本 */
const copied = ref(false)
let copyTimer = null
async function onCopy() {
  const ok = await copyText(props.message.content)
  if (ok) {
    copied.value = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied.value = false), 1500)
  }
}

/** 用户消息：进入编辑态 */
const editing = ref(false)
const draft = ref('')
function startEdit() {
  draft.value = props.message.content
  editing.value = true
}
function confirmEdit() {
  const text = draft.value.trim()
  editing.value = false
  if (text && text !== props.message.content) {
    emit('edit', text)
  }
}
function cancelEdit() {
  editing.value = false
}
</script>

<template>
  <div class="message-item fade-in-up" :class="isUser ? 'is-user' : 'is-assistant'">
    <!-- 头像 -->
    <div class="avatar" :class="isUser ? 'avatar-user' : 'avatar-ai'">
      <User v-if="isUser" :size="18" />
      <Sparkles v-else :size="18" />
    </div>

    <!-- 内容区 -->
    <div class="bubble-wrap">
      <div
        class="bubble"
        :class="{
          'bubble-user': isUser,
          'bubble-ai': isAssistant,
          'bubble-error': isError
        }"
      >
        <!-- 思考中 -->
        <TypingIndicator v-if="isThinking" />

        <!-- 用户编辑态 -->
        <div v-else-if="isUser && editing" class="edit-area">
          <textarea
            v-model="draft"
            rows="3"
            class="edit-input"
            @keydown.enter.exact.prevent="confirmEdit"
            @keydown.escape="cancelEdit"
          />
          <div class="edit-actions">
            <button class="mini-btn" @click="cancelEdit">取消</button>
            <button class="mini-btn primary" @click="confirmEdit">保存并重发</button>
          </div>
        </div>

        <!-- 用户消息：纯文本（保留换行） -->
        <div v-else-if="isUser" class="user-text">{{ message.content }}</div>

        <!-- 助手消息：Markdown 渲染 -->
        <MarkdownRenderer
          v-else
          :content="message.content"
        />

        <!-- 流式光标 -->
        <span v-if="isStreamingText" class="stream-cursor" />

        <!-- 错误提示 -->
        <div v-if="isError" class="error-tip">
          生成失败，可点击重试
        </div>
      </div>

      <!-- 操作栏（hover 显示；流式中隐藏） -->
      <div v-if="!streaming && !editing" class="actions">
        <button class="action-btn" :title="copied ? '已复制' : '复制'" @click="onCopy">
          <Check v-if="copied" :size="14" class="text-emerald-500" />
          <Copy v-else :size="14" />
        </button>

        <button
          v-if="isAssistant"
          class="action-btn"
          title="重新生成"
          @click="emit('retry')"
        >
          <RotateCw :size="14" />
        </button>

        <button
          v-if="isUser"
          class="action-btn"
          title="编辑后重发"
          @click="startEdit"
        >
          <Pencil :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-item {
  @apply flex gap-2 px-2 py-4 max-w-3xl mx-auto w-full
    md:gap-3 md:px-4 md:py-5;
}
.message-item.is-user {
  @apply flex-row-reverse;
}

.avatar {
  @apply flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full
    text-white;
}
.avatar-user {
  @apply bg-brand-500;
}
.avatar-ai {
  @apply bg-gradient-to-br from-brand-400 to-brand-600;
}

.bubble-wrap {
  @apply flex flex-col min-w-0;
  min-width: 0;
}
.is-user .bubble-wrap {
  @apply items-end;
}

.bubble {
  @apply rounded-2xl px-4 py-3 text-[15px] leading-7 break-words;
  max-width: 100%;
}
.bubble-user {
  @apply bg-brand-500 text-white rounded-tr-sm;
}
.bubble-ai {
  @apply bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100
    border border-gray-100 dark:border-gray-700 rounded-tl-sm shadow-sm;
}
.bubble-error {
  @apply border-red-200 dark:border-red-800;
}

/* 用户文本保留换行，并覆盖 markdown 行内码配色（白底蓝字不协调） */
.user-text {
  @apply whitespace-pre-wrap;
}

.edit-area {
  @apply flex flex-col gap-2 w-72 max-w-full;
}
.edit-input {
  @apply w-full px-3 py-2 rounded-lg text-gray-900
    bg-white/95 dark:bg-gray-900 border border-white/40
    focus:outline-none focus:ring-2 focus:ring-white/60 resize-y;
}
.edit-actions {
  @apply flex justify-end gap-2;
}
.mini-btn {
  @apply px-3 py-1 rounded-md text-sm text-white/90 hover:bg-white/15;
}
.mini-btn.primary {
  @apply bg-white/25 hover:bg-white/35;
}

/* 操作栏 */
.actions {
  @apply flex gap-1 mt-1 opacity-0 transition-opacity;
  transition-delay: 0.05s;
}
.message-item:hover .actions {
  @apply opacity-100;
}
.is-user .actions {
  @apply flex-row-reverse;
}
.action-btn {
  @apply p-1.5 rounded-md text-gray-400 hover:text-brand-500
    hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors;
}
.bubble-user ~ .actions .action-btn {
  @apply text-white/70 hover:text-white hover:bg-white/15;
}

/* 流式光标 */
.stream-cursor {
  @apply inline-block w-[2px] h-[1em] align-text-bottom ml-0.5;
  background: currentColor;
  animation: blink 1s steps(2, start) infinite;
}
@keyframes blink {
  to {
    visibility: hidden;
  }
}

.error-tip {
  @apply mt-2 text-sm text-red-500;
}
</style>
