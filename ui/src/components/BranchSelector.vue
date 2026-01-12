<script setup lang="ts">
import { ref } from 'vue';
import { useBranchesStore } from '@/stores/branches';

const branchesStore = useBranchesStore();
const showDropdown = ref(false);

async function handleSwitch(name: string) {
  try {
    await branchesStore.switchBranch(name);
    showDropdown.value = false;
  } catch {
    // Error handled by store
  }
}
</script>

<template>
  <div class="relative">
    <button
      @click="showDropdown = !showDropdown"
      class="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
    >
      <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
      </svg>
      <span class="font-medium">{{ branchesStore.currentBranch?.name || 'No branch' }}</span>
      <span class="text-gray-500">#{{ branchesStore.currentBranch?.head || 0 }}</span>
      <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Dropdown -->
    <div
      v-if="showDropdown"
      class="absolute right-0 mt-1 w-56 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50"
    >
      <div class="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Branches
      </div>
      <div v-for="branch in branchesStore.branches" :key="branch.id">
        <button
          @click="handleSwitch(branch.name)"
          class="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between"
          :class="branch.isCurrent ? 'bg-blue-50 text-blue-700' : 'text-gray-700'"
        >
          <span class="flex items-center gap-2">
            <svg v-if="branch.isCurrent" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
            <span v-else class="w-4"></span>
            {{ branch.name }}
          </span>
          <span class="text-gray-400 text-xs">#{{ branch.head }}</span>
        </button>
      </div>
    </div>

    <!-- Click outside to close -->
    <div
      v-if="showDropdown"
      class="fixed inset-0 z-40"
      @click="showDropdown = false"
    ></div>
  </div>
</template>
