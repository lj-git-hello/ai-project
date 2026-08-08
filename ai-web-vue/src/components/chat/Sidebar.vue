<script setup>
/**
 * 侧边栏：
 *  - 新建会话按钮
 *  - 历史会话分组列表
 *  - 用户设置/主题切换
 */
import { Plus, Settings, Sun, Moon, User, Trash2, Edit3 } from 'lucide-vue-next'
import { computed, ref, nextTick } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import { groupSessions } from '@/utils/time'

const chatStore = useChatStore()
const settingsStore = useSettingsStore()

const emit = defineEmits(['select-mobile'])

/** 选中会话：切换后通知父组件（移动端收起抽屉） */
function onSelectSession(id) {
  chatStore.selectSession(id)
  emit('select-mobile')
}

const showSettings = ref(false)
const searchQuery = ref('')
const renamingId = ref(null)
const renameValue = ref('')

const groupedSessions = computed(() => {
  const sessions = searchQuery.value
    ? chatStore.sessions.filter(s =>
        s.title.toLowerCase().includes(searchQuery.value.toLowerCase())
      )
    : chatStore.sessions

  return groupSessions(sessions)
})

const startRename = (session) => {
  renamingId.value = session.id
  renameValue.value = session.title
  nextTick(() => {
    const input = document.querySelector(`#rename-${session.id} input`)
    input?.focus()
    input?.select()
  })
}

const confirmRename = (session) => {
  if (renameValue.value.trim()) {
    chatStore.renameSession(session.id, renameValue.value)
  }
  renamingId.value = null
}

const cancelRename = () => {
  renamingId.value = null
}

const deleteSession = async (session) => {
  if (!confirm(`确定删除会话 "${session.title}" 吗？`)) return
  try {
    await chatStore.deleteSession(session.id)
  } catch (e) {
    alert('删除失败，请稍后重试')
  }
}

const toggleTheme = () => {
  settingsStore.toggleTheme()
}
</script>

<template>
  <div class="sidebar">
    <div class="header">
      <button
        class="new-chat-btn"
        @click="chatStore.createSession()"
      >
        <Plus :size="16" class="mr-2" />
        新建对话
      </button>
    </div>

    <div class="search">
      <input
        v-model="searchQuery"
        placeholder="搜索历史对话"
        class="search-input"
      />
    </div>

    <div class="session-list">
      <div v-for="group in groupedSessions" :key="group.label">
        <h4 class="group-title">
          {{ group.label }}
        </h4>

        <div class="group-items">
          <div
            v-for="session in group.sessions"
            :key="session.id"
            class="session-item group"
            :class="{ active: session.id === chatStore.activeSessionId }"
            @click="onSelectSession(session.id)"
            @dblclick="startRename(session)"
          >
            <div
              v-if="renamingId === session.id"
              class="rename-input"
              :id="`rename-${session.id}`"
            >
              <input
                v-model="renameValue"
                @keyup.enter="confirmRename(session)"
                @keyup.escape="cancelRename"
                @blur="confirmRename(session)"
              />
            </div>

            <template v-else>
              <span class="truncate">{{ session.title }}</span>
              <div class="session-actions">
                <button
                  class="action-btn"
                  @click.stop="startRename(session)"
                >
                  <Edit3 :size="14" />
                </button>
                <button
                  class="action-btn"
                  @click.stop="deleteSession(session)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      <div class="user-section">
        <div class="user-avatar">
          <User :size="18" />
        </div>
        <span class="user-id">用户 {{ chatStore.userId.slice(0, 8) }}</span>
      </div>

      <div class="settings-section">
        <button
          class="settings-btn"
          @click="showSettings = !showSettings"
        >
          <Settings :size="18" />
        </button>

        <button
          class="theme-btn"
          @click="toggleTheme"
        >
          <Sun v-if="settingsStore.theme === 'light'" :size="18" />
          <Moon v-else :size="18" />
        </button>
      </div>
    </div>

    <div
      v-if="showSettings"
      class="settings-panel"
    >
      <div class="settings-item">
        <label>API Key</label>
        <input
          type="password"
          v-model="settingsStore.apiKey"
          @change="settingsStore.persist()"
        />
      </div>

      <div class="settings-item">
        <label>System Prompt</label>
        <textarea
          v-model="settingsStore.systemPrompt"
          @change="settingsStore.persist()"
          rows="3"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  @apply flex flex-col h-full w-64 border-r border-gray-200 dark:border-gray-700
    bg-white dark:bg-gray-900;
}

.header {
  @apply p-4 border-b border-gray-200 dark:border-gray-700;
}

.new-chat-btn {
  @apply flex items-center justify-center w-full px-4 py-2 rounded-lg
    bg-brand-500 text-white hover:bg-brand-600 transition-colors;
}

.search {
  @apply p-2 border-b border-gray-200 dark:border-gray-700;
}

.search-input {
  @apply w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800
    focus:outline-none focus:ring-2 focus:ring-brand-500;
}

.session-list {
  @apply flex-1 overflow-y-auto;
}

.group-title {
  @apply px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400;
}

.group-items {
  @apply mb-2;
}

.session-item {
  @apply flex items-center justify-between px-4 py-2 mx-2 rounded-lg
    hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer;
}

.session-item.active {
  @apply bg-brand-100 dark:bg-brand-700/30 text-brand-600 dark:text-brand-300;
}

.rename-input {
  @apply flex-1;
}

.rename-input input {
  @apply w-full px-2 py-1 bg-transparent border-b border-brand-500
    focus:outline-none;
}

.session-actions {
  @apply flex opacity-0 group-hover:opacity-100;
}

.action-btn {
  @apply p-1 text-gray-500 hover:text-brand-500;
}

.footer {
  @apply flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700;
}

.user-section {
  @apply flex items-center;
}

.user-avatar {
  @apply flex items-center justify-center w-8 h-8 rounded-full
    bg-gray-200 dark:bg-gray-700 mr-2;
}

.user-id {
  @apply text-sm text-gray-600 dark:text-gray-300;
}

.settings-section {
  @apply flex items-center gap-2;
}

.settings-btn, .theme-btn {
  @apply p-1 rounded-full text-gray-500 hover:text-brand-500
    hover:bg-gray-200 dark:hover:bg-gray-700;
}

.settings-panel {
  @apply absolute bottom-16 left-4 right-4 p-4 rounded-lg
    bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700;
}

.settings-item {
  @apply mb-4;
}

.settings-item label {
  @apply block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300;
}

.settings-item input, .settings-item textarea {
  @apply w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
    bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500;
}
</style>