<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { client, type StoreStats } from '@/api/client';

const stats = ref<StoreStats | null>(null);
const loading = ref(false);
const showPopover = ref(false);

async function fetchStats() {
  loading.value = true;
  try {
    stats.value = await client.getStats();
  } catch (e) {
    console.error('Failed to fetch stats:', e);
  } finally {
    loading.value = false;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

onMounted(fetchStats);
</script>

<template>
  <div class="relative">
    <button
      @click="showPopover = !showPopover"
      @mouseenter="fetchStats"
      class="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <span v-if="stats">{{ stats.recordCount }} records</span>
      <span v-else>Stats</span>
    </button>

    <!-- Popover -->
    <div
      v-if="showPopover && stats"
      class="absolute right-0 mt-1 w-64 bg-white rounded-md shadow-lg border border-gray-200 p-4 z-50"
    >
      <h3 class="text-sm font-semibold text-gray-900 mb-3">Store Statistics</h3>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-gray-500">Records</span>
          <span class="font-medium">{{ stats.recordCount.toLocaleString() }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Blobs</span>
          <span class="font-medium">{{ stats.blobCount.toLocaleString() }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Branches</span>
          <span class="font-medium">{{ stats.branchCount }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">States</span>
          <span class="font-medium">{{ stats.stateSlotCount }}</span>
        </div>
        <div class="border-t border-gray-100 my-2"></div>
        <div class="flex justify-between">
          <span class="text-gray-500">Total Size</span>
          <span class="font-medium">{{ formatBytes(stats.totalSizeBytes) }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Blob Size</span>
          <span class="font-medium">{{ formatBytes(stats.blobSizeBytes) }}</span>
        </div>
      </div>
      <button
        @click="fetchStats"
        class="mt-3 w-full text-xs text-center text-blue-600 hover:text-blue-700"
        :disabled="loading"
      >
        {{ loading ? 'Refreshing...' : 'Refresh' }}
      </button>
    </div>

    <!-- Click outside to close -->
    <div
      v-if="showPopover"
      class="fixed inset-0 z-40"
      @click="showPopover = false"
    ></div>
  </div>
</template>
