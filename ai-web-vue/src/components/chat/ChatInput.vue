<script setup>
/**
 * 输入框
 *  - Enter 发送，Shift+Enter 换行
 *  - textarea 自动撑高（max 200px）
 *  - 流式生成中切换为「停止」按钮
 *  - 支持文件上传：选文件即上传，发送时连同文件信息一起抛出
 */
import { ref, nextTick, watch, computed } from 'vue'
import { Send, Square, Paperclip, X, Loader2 } from 'lucide-vue-next'
import { uploadFiles } from '@/api/upload'

const props = defineProps({
  /** 是否正在流式生成 */
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['send', 'stop'])

const input = ref('')
const textareaRef = ref(null)
const fileInputRef = ref(null)

/** 已上传成功的文件列表（含后端返回的 fileName） */
const uploadedFiles = ref([])
/** 正在上传中 */
const uploading = ref(false)

/** 发送按钮可用：有文本或有已上传文件 */
const canSend = computed(() => !!input.value.trim() || uploadedFiles.value.length > 0)

/** 自适应高度 */
function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

watch(input, () => nextTick(autoResize))

/** 选择文件后立即上传 */
async function onFileChange(e) {
  const files = Array.from(e.target.files || [])
  e.target.value = '' // 清空，允许重复选同一文件
  if (files.length === 0) return
  uploading.value = true
  try {
    const result = await uploadFiles(files)
    uploadedFiles.value.push(...result)
  } catch (err) {
    alert(err.message || '文件上传失败')
  } finally {
    uploading.value = false
  }
}

/** 移除已上传文件 */
function removeFile(idx) {
  uploadedFiles.value.splice(idx, 1)
}

function submit() {
  if (!canSend.value || props.loading) return
  // emit 文本 + 已上传文件信息（副本，防止后续清空影响）
  emit('send', { text: input.value.trim(), files: uploadedFiles.value.slice() })
  input.value = ''
  uploadedFiles.value = []
  nextTick(autoResize)
}
function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

function stop() {
  emit('stop')
}

/** 暴露方法：供父组件「编辑重发」时回填 */
defineExpose({
  setText(text) {
    input.value = text
    nextTick(() => {
      autoResize()
      textareaRef.value?.focus()
    })
  }
})
</script>

<template>
  <div class="chat-input">
    <div class="input-box">
      <!-- 文件上传按钮 -->
      <input
        ref="fileInputRef"
        type="file"
        multiple
        class="hidden"
        accept=".pdf,.docx,.xlsx,.xls,.md,.txt,.csv"
        @change="onFileChange"
      />
      <button
        class="attach-btn"
        :disabled="loading || uploading"
        title="上传文件"
        @click="fileInputRef?.click()"
      >
        <Loader2 v-if="uploading" :size="18" class="spin" />
        <Paperclip v-else :size="18" />
      </button>

      <textarea
        ref="textareaRef"
        v-model="input"
        class="input-area scrollbar-thin"
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        rows="1"
        @keydown="onKeydown"
      />
      <button v-if="!loading" class="send-btn" :disabled="!canSend" title="发送" @click="submit">
        <Send :size="18" />
      </button>
      <button v-else class="stop-btn" title="停止生成" @click="stop">
        <Square :size="16" />
      </button>
    </div>

    <!-- 已上传文件列表 -->
    <div v-if="uploadedFiles.length > 0" class="file-list">
      <div v-for="(f, idx) in uploadedFiles" :key="f.fileName" class="file-chip">
        <Paperclip :size="13" class="flex-shrink-0" />
        <span class="file-name">{{ f.originalName }}</span>
        <button class="file-remove" title="移除" @click="removeFile(idx)">
          <X :size="13" />
        </button>
      </div>
    </div>

    <p class="input-tip">
      按 Enter 发送 / Shift+Enter 换行 · 支持 pdf/docx/xlsx/md/txt/csv（≤10MB）
    </p>
  </div>
</template>

<style scoped>
.chat-input {
  @apply w-full max-w-3xl mx-auto px-4 pb-4;
}

.input-box {
  @apply flex items-end gap-2 p-2 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 dark:focus-within:ring-brand-700/40 transition-all;
}

.attach-btn {
  @apply flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl
    text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700
    disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer;
}

.input-area {
  @apply flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-6 text-gray-800 dark:text-gray-100 focus:outline-none max-h-[200px];
}

.send-btn,
.stop-btn {
  @apply flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl transition-colors cursor-pointer;
}

.send-btn {
  @apply bg-brand-500 text-white hover:bg-brand-600 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed;
}

.stop-btn {
  @apply bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600;
}

.file-list {
  @apply flex flex-wrap gap-2 mt-2 px-1;
}

.file-chip {
  @apply inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs
    bg-brand-50 dark:bg-brand-700/20 text-brand-600 dark:text-brand-300
    border border-brand-100 dark:border-brand-700/40;
}

.file-name {
  @apply max-w-[180px] truncate;
}

.file-remove {
  @apply flex-shrink-0 hover:text-brand-700 dark:hover:text-white cursor-pointer;
}

.input-tip {
  @apply text-center text-xs text-gray-400 dark:text-gray-500 mt-2;
}

.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>