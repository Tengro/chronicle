<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
import { onMounted } from 'vue';
import { useBranchesStore } from '@/stores/branches';
import BranchSelector from '@/components/BranchSelector.vue';
import StatsPanel from '@/components/StatsPanel.vue';

const branchesStore = useBranchesStore();

onMounted(() => {
  branchesStore.fetchBranches();
});
</script>

<template>
  <div class="flex flex-col h-screen">
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 px-4 py-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <h1 class="text-xl font-semibold text-gray-900">Chronicle</h1>
          <nav class="flex gap-1">
            <RouterLink
              to="/"
              class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              :class="$route.path === '/' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'"
            >
              Records
            </RouterLink>
            <RouterLink
              to="/states"
              class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              :class="$route.path === '/states' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'"
            >
              States
            </RouterLink>
            <RouterLink
              to="/branches"
              class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              :class="$route.path === '/branches' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'"
            >
              Branches
            </RouterLink>
          </nav>
        </div>
        <div class="flex items-center gap-4">
          <BranchSelector />
          <StatsPanel />
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1 overflow-hidden">
      <RouterView />
    </main>
  </div>
</template>
