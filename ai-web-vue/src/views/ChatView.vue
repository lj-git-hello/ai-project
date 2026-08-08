<script setup>
/**
 * 聊天主页
 * 桌面端：左侧 Sidebar + 中间消息区 + 右侧原始记录（三栏）
 * 移动端：侧栏覆盖式滑出，原始记录隐藏
 * 流式协议核心：后端每次推送的 content 是「已拼接的完整文本」，
 * 故通过 updateAssistantContent 全量覆盖；首字到达前展示思考态。
 */
import { ref, nextTick, computed, onMounted, watch } from 'vue'
import { Sparkles, MessageSquarePlus, Loader2, Menu, Code2 } from 'lucide-vue-next'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import { useChatStream } from '@/composables/useChatStream'
import Sidebar from '@/components/chat/Sidebar.vue'
import MessageItem from '@/components/chat/MessageItem.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import RawHistory from '@/components/chat/RawHistory.vue'

const chatStore = useChatStore()
const settingsStore = useSettingsStore()
const { runLLM } = useChatStream()

/** 右侧原始记录面板开关（桌面端默认展开，移动端不显示） */
const showRaw = ref(true)

/** 思考态（独立于 store，避免历史会话渲染时被波及） */
const thinking = ref(false)

/** 流式中的 assistant 消息 id（用于 MessageItem 高亮当前生成项） */
const streamingMsgId = ref(null)

const messages = computed(() => chatStore.messages)
const hasMessages = computed(() => messages.value.length > 0)
const streamingSessionId = computed(() => chatStore.streamingSessionId)
const activeId = computed(() => chatStore.activeSessionId)

/** 当前激活会话里正在生成的消息 id（仅当流式目标 == 当前会话） */
const activeStreamingMsgId = computed(() =>
  streamingSessionId.value === activeId.value ? streamingMsgId.value : null
)

const scrollRef = ref(null)
const chatInputRef = ref(null)

/** 移动端侧栏开关（全屏覆盖式，md 以上不依赖此状态） */
const sidebarOpen = ref(false)

/** 移动端：切到会话后自动关闭侧栏 */
function closeSidebarMobile() {
  sidebarOpen.value = false
}

/** 欢迎页预设提示词（覆盖核心能力，便于面试演示） */
const suggestions = [
  '搜索一下最近 AI 大模型的最新进展',   // 演示联网搜索 bing_search
  '上传文件后帮我总结要点',                // 演示文件读取 read_file
  '用通俗语言解释什么是 RAG',             // 演示知识库回答
  '查一下美国洛杉矶现在几点'               // 演示时间工具调用
]

/** 滚动到底部 */
function scrollToBottom(smooth = true) {
  nextTick(() => {
    const el = scrollRef.value
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  })
}

/** 用户是否已上滑（避免流式时强制拽回底部，打扰阅读） */
const userScrolledUp = ref(false)
function onScroll() {
  const el = scrollRef.value
  if (!el) return
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  userScrolledUp.value = distance > 120
}

/**
 * 发送一条消息并触发流式生成。
 * @param {string} text - 用户输入
 * @param {object} [opts]
 * @param {string} [opts.query] - 实际透传后端的 query（编辑重发时为新文本）
 * @param {boolean} [opts.skipPushUser] - 重试时不重复插入用户消息
 * @param {Array} [opts.files] - 上传文件信息数组（{fileName, originalName}）
 */
async function sendMessage(text, opts = {}) {
  const query = opts.query || text
  const files = opts.files || []
  // 有文本或有文件才允许发送
  if (!query.trim() && files.length === 0) return
  // 会话列表加载中时拒绝发送，避免与 fetchHistory 覆盖竞态
  if (chatStore.loading) return
  // 生成中时拒绝重复发送
  if (chatStore.isStreaming) return

  // 确保有会话
  if (!chatStore.activeSession) {
    chatStore.createSession()
  }
  const sessionId = chatStore.activeSessionId
  const userId = chatStore.userId

  // 插入用户消息（重试场景已由调用方截断，这里仍需补回用户提问）
  if (!opts.skipPushUser) {
    // 用户消息里附带文件名，便于在气泡中展示
    const displayText = files.length > 0
      ? `${query}\n\n📎 已上传：${files.map((f) => f.originalName).join('、')}`
      : query
    chatStore.pushMessage(sessionId, 'user', displayText)
  }

  // 插入占位 assistant 消息
  const aiMsg = chatStore.pushMessage(sessionId, 'assistant', '', { status: 'streaming' })
  streamingMsgId.value = aiMsg.id

  chatStore.startStreaming(sessionId)
  thinking.value = true
  scrollToBottom(false)

  try {
    await runLLM({
      query,
      userId,
      sessionId,
      files,
      signal: chatStore._controller.signal,
      onContent(content) {
        chatStore.updateAssistantContent(sessionId, aiMsg.id, content)
        if (!userScrolledUp.value) scrollToBottom(false)
      },
      onThinkingChange(val) {
        thinking.value = val
      }
    })
    chatStore.setMessageStatus(sessionId, aiMsg.id, 'done')
  } catch (err) {
    // 用户主动中断不算错误
    if (err && err.name === 'AbortError') {
      chatStore.setMessageStatus(sessionId, aiMsg.id, 'done')
    } else {
      chatStore.setMessageStatus(sessionId, aiMsg.id, 'error')
      // eslint-disable-next-line no-console
      console.error('[LLM] 流式请求失败:', err)
    }
  } finally {
    chatStore.finishStreaming()
    thinking.value = false
    streamingMsgId.value = null
  }
}

/** 停止生成 */
function stopGenerate() {
  chatStore.stopStreaming()
}

/**
 * 重新生成：移除最后一条 assistant 消息，用上一条用户提问重发。
 */
function handleRetry() {
  const sessionId = chatStore.activeSessionId
  if (!sessionId) return
  const msgs = chatStore.activeSession.messages
  // 找到最后一条 user 消息
  let lastUserIdx = -1
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') {
      lastUserIdx = i
      break
    }
  }
  if (lastUserIdx === -1) return
  const query = msgs[lastUserIdx].content
  // 截断该用户消息（含）之后的所有消息
  chatStore.truncateAfter(sessionId, msgs[lastUserIdx].id)
  // 重发，跳过再次插入用户消息
  sendMessage(query, { query, skipPushUser: true })
}

/**
 * 编辑用户消息后重发：截断该消息及之后内容，回填输入框由用户确认。
 * 这里采用「直接重发」策略：用新文本作为 query。
 */
function handleEdit(message, newContent) {
  const sessionId = chatStore.activeSessionId
  if (!sessionId) return
  chatStore.truncateAfter(sessionId, message.id)
  sendMessage(newContent, { query: newContent, skipPushUser: true })
}

/** 新建对话并聚焦输入框 */
function newChat() {
  chatStore.createSession()
  nextTick(() => chatInputRef.value?.focus?.())
}

/** 切换会话时滚到底部 */
watch(activeId, () => {
  userScrolledUp.value = false
  scrollToBottom(false)
})

onMounted(async () => {
  chatStore.initStore()
  // 从后端拉取用户角色与系统上下文设置
  settingsStore.loadFromServer()
  // 会话列表从服务端拉取；失败时 store 内部会兜底建空会话
  await chatStore.fetchHistory()
  scrollToBottom(false)
})
</script>

<template>
  <div class="chat-layout">
    <!-- 移动端遮罩：半透明，点击关闭侧栏 -->
    <div
      v-if="sidebarOpen"
      class="sidebar-overlay"
      @click="sidebarOpen = false"
    />

    <!-- 侧栏：移动端全屏覆盖式滑出，桌面端常驻 -->
    <div class="sidebar-wrap" :class="{ open: sidebarOpen }">
      <Sidebar @select-mobile="closeSidebarMobile" />
    </div>

    <main class="chat-main">
      <!-- 顶部栏 -->
      <header class="chat-header">
        <!-- 移动端菜单按钮 -->
        <button class="menu-btn" title="会话列表" @click="sidebarOpen = true">
          <Menu :size="20" />
        </button>
        <h1 class="title">
          {{ chatStore.activeSession ? chatStore.activeSession.title : 'AI 个人助手' }}
        </h1>
        <div class="header-actions">
          <button
            class="header-btn hidden md:inline-flex"
            :class="{ active: showRaw }"
            :title="showRaw ? '收起原始记录' : '查看原始记录'"
            @click="showRaw = !showRaw"
          >
            <Code2 :size="16" />
            <span>原始记录</span>
          </button>
          <button class="header-btn" title="新建对话" @click="newChat">
            <MessageSquarePlus :size="18" />
            <span class="hidden sm:inline">新建</span>
          </button>
        </div>
      </header>

      <!-- 消息区 -->
      <div
        ref="scrollRef"
        class="message-list scrollbar-thin"
        :class="{ 'has-messages': hasMessages }"
        @scroll="onScroll"
      >
        <!-- 加载中 -->
        <div v-if="chatStore.loading && !hasMessages" class="state-tip">
          <Loader2 :size="22" class="spin" />
          <span>加载历史会话…</span>
        </div>

        <!-- 欢迎页 -->
        <div v-if="!hasMessages" class="welcome">
          <div class="welcome-icon">
            <Sparkles :size="40" />
          </div>
          <h2 class="welcome-title">AI 个人助手</h2>
          <p class="welcome-desc">有什么可以帮你的？试着问点什么吧。</p>

          <div class="suggest-grid">
            <button
              v-for="s in suggestions"
              :key="s"
              class="suggest-card"
              @click="sendMessage(s)"
            >
              {{ s }}
            </button>
          </div>
        </div>

        <!-- 消息列表 -->
        <template v-else>
          <MessageItem
            v-for="msg in messages"
            :key="msg.id"
            :message="msg"
            :streaming="msg.id === activeStreamingMsgId"
            @retry="handleRetry"
            @edit="(text) => handleEdit(msg, text)"
          />

          <!-- 思考中（assistant 占位未显示时，底部额外提示） -->
          <div v-if="thinking && !activeStreamingMsgId" class="bottom-thinking">
            <MessageItem
              :message="{ id: 'thinking', role: 'assistant', content: '', status: 'streaming' }"
              :streaming="true"
            />
          </div>
        </template>
      </div>

      <!-- 输入区 -->
      <footer class="chat-footer">
        <ChatInput
          ref="chatInputRef"
          :loading="chatStore.isStreaming"
          @send="({ text, files }) => sendMessage(text, { files })"
          @stop="stopGenerate"
        />
      </footer>
    </main>

    <!-- 右侧第三栏：原始记录（仅桌面端 md 以上显示，移动端隐藏） -->
    <RawHistory
      v-if="showRaw && activeId"
      class="hidden md:flex"
      :user-id="chatStore.userId"
      :session-id="activeId"
      @close="showRaw = false"
    />
  </div>
</template>

<style scoped>
.chat-layout {
  @apply flex h-screen w-screen overflow-hidden;
}

/* ===== 侧栏：移动端全屏覆盖式 / 桌面端常驻 ===== */
.sidebar-overlay {
  @apply fixed inset-0 z-30 bg-black/50 md:hidden;
}

/* 移动端（默认）：从左侧滑出，宽度 85% */
.sidebar-wrap {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 40;
  height: 100%;
  width: 85%;
  max-width: 320px;
  transform: translateX(-100%);
  transition: transform 0.25s ease;
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.15);
}
.sidebar-wrap.open {
  transform: translateX(0);
}

/* 桌面端（md 以上）：恢复为正常文档流，固定宽度常驻 */
@media (min-width: 768px) {
  .sidebar-wrap {
    position: static;
    width: auto;
    max-width: none;
    transform: none;
    transition: none;
    z-index: auto;
    box-shadow: none;
  }
}

/* 移动端菜单按钮：md 以上隐藏 */
.menu-btn {
  @apply flex items-center justify-center w-9 h-9 rounded-lg
    text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800
    md:hidden;
}

.chat-main {
  @apply flex-1 flex flex-col min-w-0 bg-gray-50 dark:bg-gray-950;
}

.chat-header {
  @apply flex items-center gap-2 px-3 h-14
    border-b border-gray-200 dark:border-gray-800
    bg-white/80 dark:bg-gray-900/80 backdrop-blur
    md:px-4;
}
.title {
  @apply text-sm font-medium text-gray-700 dark:text-gray-200 truncate flex-1;
}
.header-actions {
  @apply flex items-center gap-1;
}
.header-btn {
  @apply inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm
    text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800
    transition-colors
    md:px-3;
}

.message-list {
  @apply flex-1 overflow-y-auto;
}
.message-list.has-messages {
  @apply py-4;
}

/* 加载/状态提示 */
.state-tip {
  @apply h-full flex flex-col items-center justify-center gap-2
    text-gray-400 dark:text-gray-500;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 欢迎页 */
.welcome {
  @apply h-full flex flex-col items-center justify-center px-6 text-center;
}
.welcome-icon {
  @apply flex items-center justify-center w-20 h-20 rounded-2xl mb-6
    text-white bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg;
}
.welcome-title {
  @apply text-3xl font-bold mb-2
    text-gray-800 dark:text-gray-100;
}
.welcome-desc {
  @apply text-gray-500 dark:text-gray-400 mb-8;
}
.suggest-grid {
  @apply grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl;
}
.suggest-card {
  @apply px-4 py-3 text-left text-sm rounded-xl
    bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
    text-gray-600 dark:text-gray-300
    hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400
    hover:shadow-sm transition-all cursor-pointer;
}

.chat-footer {
  @apply border-t border-gray-200 dark:border-gray-800
    bg-white/80 dark:bg-gray-900/80 backdrop-blur;
}

.bottom-thinking {
  @apply contents;
}
</style>
