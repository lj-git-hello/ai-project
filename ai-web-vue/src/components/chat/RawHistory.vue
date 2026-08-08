<script setup>
/**
 * 原始记录面板（右侧第三栏）
 * 展示当前会话在后端 chat 文件里的原始存储记录（含 tool_calls / reasoning_content /
 * token 用量等），让用户了解会话与模型的完整沟通过程。
 *
 * 分页：总条数 > 50 时只取最新 20 条，顶部「加载更多」每次向前加载 20 条；
 *      ≤ 50 条时一次性展示全部。超出容器范围滚动。
 * 消息按时间正序（最旧在上、最新在下），「加载更多」固定在顶部、点击后向前追加，
 * 并保持用户当前视觉位置不跳变。
 */
import { ref, computed, watch, nextTick } from 'vue'
import { RefreshCw, ChevronDown, ChevronUp, Code2, Loader2, X } from 'lucide-vue-next'
import { useChatStore } from '@/stores/chat'
import { fetchRawHistory } from '@/api/history'

const props = defineProps({
  userId: { type: String, default: '' },
  sessionId: { type: String, default: '' }
})

const emit = defineEmits(['close'])

const chatStore = useChatStore()

/** 每页条数 / 触发分页的阈值 */
const PAGE = 20
const THRESHOLD = 20

/** 当前已加载的原始消息（时间正序，最旧在前） */
const rawMessages = ref([])
/** 服务端总会话消息数 */
const total = ref(0)
const loading = ref(false)
const loadingMore = ref(false)
/** 展开的原始消息 key（用全数组下标，稳定不随翻页变） */
const expanded = ref(new Set())
const scrollRef = ref(null)

/** 是否还有更早的记录可加载 */
const hasMore = computed(() => rawMessages.value.length < total.value)

/** 消息在全数组中的下标（用于稳定 key 与展示 #序号） */
function fullIndex(i) {
  return total.value - rawMessages.value.length + i
}

function typeOf(msg) {
  return msg?.type || 'unknown'
}

/** 折叠态的预览文本 */
function previewOf(msg) {
  const data = msg?.data || {}
  const content = data.content || ''
  if (content) {
    const line = String(content).split('\n').find((l) => l.trim()) || ''
    return line.length > 50 ? line.slice(0, 50) + '…' : line
  }
  const tcs = data.tool_calls || data.additional_kwargs?.tool_calls
  if (tcs && tcs.length) {
    const name = tcs[0].name || tcs[0].function?.name || ''
    return `调用工具: ${name}`
  }
  if (msg?.type === 'tool') return '工具返回'
  return msg?.type || ''
}

function toggleExpand(key) {
  const s = new Set(expanded.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  expanded.value = s
}

function scrollToBottom() {
  nextTick(() => {
    const el = scrollRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

/** 初始加载：最新一页；总条数 ≤ 阈值则一次性取全部 */
async function loadInitial() {
  if (!props.userId || !props.sessionId) {
    rawMessages.value = []
    total.value = 0
    return
  }
  loading.value = true
  expanded.value = new Set()
  try {
    const data = await fetchRawHistory(props.userId, props.sessionId, PAGE, 0)
    total.value = data.total || 0
    let msgs = data.messages || []
    // 未超阈值且尚未取全 -> 一次性取全部
    if (total.value <= THRESHOLD && msgs.length < total.value) {
      const full = await fetchRawHistory(props.userId, props.sessionId, 0, 0)
      msgs = full.messages || []
    }
    rawMessages.value = msgs
  } catch (e) {
    rawMessages.value = []
    total.value = 0
  } finally {
    loading.value = false
    scrollToBottom()
  }
}

/** 加载更早的一页并前置追加，保持视觉位置不跳变 */
async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  const el = scrollRef.value
  const prevHeight = el?.scrollHeight || 0
  const prevTop = el?.scrollTop || 0
  try {
    const offset = rawMessages.value.length
    const data = await fetchRawHistory(props.userId, props.sessionId, PAGE, offset)
    total.value = data.total || total.value
    rawMessages.value = [...(data.messages || []), ...rawMessages.value]
    // 追加在顶部，原内容整体下移；保持原「距顶距离」不变
    nextTick(() => {
      if (el) el.scrollTop = prevTop + (el.scrollHeight - prevHeight)
    })
  } finally {
    loadingMore.value = false
  }
}

function refresh() {
  return loadInitial()
}

// 切换会话 -> 重新加载
watch(() => props.sessionId, () => loadInitial(), { immediate: true })

// 流式结束 -> 刷新（展示最新一轮沟通过程）；延迟少许等后端落盘
watch(
  () => chatStore.isStreaming,
  (cur, prev) => {
    if (prev && !cur) setTimeout(() => loadInitial(), 300)
  }
)

defineExpose({ refresh })
</script>

<template>
  <aside class="raw-panel">
    <header class="raw-header">
      <div class="raw-title">
        <Code2 :size="16" />
        <span>原始记录</span>
        <span v-if="total > 0" class="raw-count">共 {{ total }} 条</span>
      </div>
      <div class="raw-actions">
        <button class="icon-btn" title="刷新" @click="refresh">
          <RefreshCw :size="15" :class="{ spin: loading }" />
        </button>
        <button class="icon-btn" title="收起" @click="emit('close')">
          <X :size="16" />
        </button>
      </div>
    </header>

    <div ref="scrollRef" class="raw-body scrollbar-thin">
      <!-- 加载更多 -->
      <button
        v-if="hasMore"
        class="load-more"
        :disabled="loadingMore"
        @click="loadMore"
      >
        <Loader2 v-if="loadingMore" :size="14" class="spin" />
        <span>{{ loadingMore ? '加载中…' : '加载更早的 20 条记录' }}</span>
      </button>
      <p v-else-if="!loading && rawMessages.length > 0" class="no-more">
        已是全部记录
      </p>

      <!-- 加载中 -->
      <div v-if="loading && rawMessages.length === 0" class="raw-state">
        <Loader2 :size="20" class="spin" />
        <span>加载中…</span>
      </div>

      <!-- 空状态 -->
      <div v-else-if="!loading && rawMessages.length === 0" class="raw-state">
        <span>暂无原始记录</span>
      </div>

      <!-- 消息列表 -->
      <template v-else>
        <div
          v-for="(msg, i) in rawMessages"
          :key="fullIndex(i)"
          class="raw-item"
          :class="`is-${typeOf(msg)}`"
        >
          <div class="raw-item-head" @click="toggleExpand(fullIndex(i))">
            <span class="raw-badge">{{ typeOf(msg) }}</span>
            <span class="raw-idx">#{{ fullIndex(i) }}</span>
            <span class="raw-preview">{{ previewOf(msg) }}</span>
            <ChevronUp v-if="expanded.has(fullIndex(i))" :size="14" class="raw-chev" />
            <ChevronDown v-else :size="14" class="raw-chev" />
          </div>
          <pre
            v-if="expanded.has(fullIndex(i))"
            class="raw-json scrollbar-thin"
          >{{ JSON.stringify(msg, null, 2) }}</pre>
        </div>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.raw-panel {
  /* display 由外部 class 控制（hidden md:flex），不在此硬编码 */
  @apply flex-col h-full w-80 flex-shrink-0
    border-l border-gray-200 dark:border-gray-800
    bg-gray-50 dark:bg-gray-950;
}

.raw-header {
  @apply flex items-center justify-between px-3 h-12
    border-b border-gray-200 dark:border-gray-800
    bg-white dark:bg-gray-900;
}
.raw-title {
  @apply flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200;
}
.raw-count {
  @apply text-xs font-normal text-gray-400 dark:text-gray-500;
}
.raw-actions {
  @apply flex items-center gap-1;
}
.icon-btn {
  @apply p-1.5 rounded-md text-gray-400 hover:text-brand-500
    hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors;
}

.raw-body {
  @apply flex-1 overflow-y-auto p-2 space-y-2;
}

.load-more {
  @apply w-full flex items-center justify-center gap-1.5 py-2 mb-1
    text-xs text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-700/20
    rounded-lg border border-dashed border-brand-300 dark:border-brand-700
    disabled:opacity-50 transition-colors;
}
.no-more {
  @apply text-center text-xs text-gray-400 dark:text-gray-600 py-1 mb-1;
}

.raw-state {
  @apply flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500 py-10 text-sm;
}

.raw-item {
  @apply rounded-lg border border-gray-200 dark:border-gray-700
    bg-white dark:bg-gray-800 overflow-hidden text-xs;
}
.raw-item-head {
  @apply flex items-center gap-2 px-2 py-1.5 cursor-pointer
    hover:bg-gray-50 dark:hover:bg-gray-700/50;
}
.raw-badge {
  @apply flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium;
}
.is-human .raw-badge {
  @apply bg-brand-100 text-brand-600 dark:bg-brand-700/30 dark:text-brand-300;
}
.is-ai .raw-badge {
  @apply bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300;
}
.is-tool .raw-badge {
  @apply bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300;
}
.raw-idx {
  @apply flex-shrink-0 text-[10px] text-gray-400 dark:text-gray-500 font-mono;
}
.raw-preview {
  @apply flex-1 truncate text-gray-600 dark:text-gray-300;
}
.raw-chev {
  @apply flex-shrink-0 text-gray-400;
}

.raw-json {
  @apply m-0 px-2 py-2 text-[11px] leading-5 max-h-80 overflow-auto
    bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-200
    border-t border-gray-200 dark:border-gray-700 font-mono whitespace-pre;
}
</style>
