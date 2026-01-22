<script setup lang="ts">
import { onMounted, ref, watch, computed } from 'vue';
import { useStatesStore } from '@/stores/states';
import { useBranchesStore } from '@/stores/branches';
import AppendLogViewer from '@/components/AppendLogViewer.vue';
import JsonViewer from '@/components/JsonViewer.vue';

const statesStore = useStatesStore();
const branchesStore = useBranchesStore();

// Check if selected state is an append_log
const isAppendLog = computed(() => {
  const strategy = statesStore.selectedState?.strategy?.toLowerCase();
  return strategy === 'append_log' || strategy === 'appendlog';
});

const historySequence = ref<number | null>(null);
const historyValue = ref<unknown>(null);
const loadingHistory = ref(false);

async function loadAtSequence() {
  if (!statesStore.selectedState || historySequence.value === null) return;
  loadingHistory.value = true;
  try {
    historyValue.value = await statesStore.fetchStateAt(
      statesStore.selectedState.id,
      historySequence.value
    );
  } finally {
    loadingHistory.value = false;
  }
}

onMounted(() => {
  statesStore.fetchStates();
});

// Refetch when branch changes
watch(() => branchesStore.currentBranch, () => {
  statesStore.fetchStates();
  statesStore.clearSelection();
});

// Reset history when selection changes
watch(() => statesStore.selectedState, () => {
  historySequence.value = null;
  historyValue.value = null;
});
</script>

<template>
  <div class="h-full flex">
    <!-- States List -->
    <div class="w-80 border-r border-gray-200 flex flex-col">
      <div class="p-4 border-b border-gray-200 bg-gray-50">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold text-gray-900">States</h2>
          <button
            @click="statesStore.fetchStates()"
            :disabled="statesStore.loading"
            class="text-sm text-blue-600 hover:text-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>
      <div class="flex-1 overflow-auto">
        <div
          v-for="state in statesStore.states"
          :key="state.id"
          @click="statesStore.fetchState(state.id)"
          class="px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50"
          :class="statesStore.selectedState?.id === state.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''"
        >
          <div class="font-medium text-gray-900 truncate">{{ state.id }}</div>
          <div class="text-xs text-gray-500 mt-1 flex gap-3">
            <span class="px-1.5 py-0.5 bg-gray-200 rounded">{{ state.strategy }}</span>
            <span v-if="state.opsSinceSnapshot">{{ state.opsSinceSnapshot }} ops since snap</span>
            <span v-if="state.itemCount">{{ state.itemCount }} items</span>
          </div>
        </div>
        <div v-if="statesStore.states.length === 0 && !statesStore.loading" class="p-4 text-center text-gray-500">
          No states found
        </div>
      </div>
    </div>

    <!-- State Detail -->
    <div class="flex-1 min-w-0 flex flex-col">
      <template v-if="statesStore.selectedState">
        <!-- AppendLog Viewer for append_log states -->
        <template v-if="isAppendLog">
          <div class="p-3 border-b border-gray-200 bg-gray-50">
            <h2 class="font-semibold text-gray-900">{{ statesStore.selectedState.id }}</h2>
            <div class="text-xs text-gray-500 mt-1">
              <span class="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">append_log</span>
            </div>
          </div>
          <AppendLogViewer :state-id="statesStore.selectedState.id" class="flex-1" />
        </template>

        <!-- Standard state viewer for snapshot states -->
        <template v-else>
          <div class="p-4 border-b border-gray-200 bg-gray-50">
            <h2 class="font-semibold text-gray-900">{{ statesStore.selectedState.id }}</h2>
            <div class="text-sm text-gray-500 mt-1">
              Strategy: {{ statesStore.selectedState.strategy }}
              <span v-if="statesStore.selectedState.opsSinceSnapshot" class="ml-3">
                {{ statesStore.selectedState.opsSinceSnapshot }} ops since last snapshot
              </span>
            </div>
          </div>

          <!-- Current Value -->
          <div class="flex-1 overflow-auto p-4">
            <div class="mb-4">
              <h3 class="text-sm font-medium text-gray-700 mb-2">Current Value</h3>
              <JsonViewer :data="statesStore.selectedState.value" />
            </div>

            <!-- Historical Access -->
            <div class="border-t border-gray-200 pt-4">
              <h3 class="text-sm font-medium text-gray-700 mb-2">Historical Value</h3>
              <div class="flex items-center gap-2 mb-2">
                <input
                  v-model.number="historySequence"
                  type="number"
                  min="0"
                  :max="branchesStore.currentBranch?.head || 0"
                  placeholder="Sequence number"
                  class="px-2 py-1 border border-gray-300 rounded text-sm w-40"
                />
                <button
                  @click="loadAtSequence"
                  :disabled="loadingHistory || historySequence === null"
                  class="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 disabled:opacity-50"
                >
                  {{ loadingHistory ? 'Loading...' : 'Load' }}
                </button>
              </div>
              <div v-if="historyValue !== null">
                <JsonViewer :data="historyValue" />
              </div>
              <div v-else class="text-sm text-gray-500">
                Enter a sequence number to view historical state
              </div>
            </div>
          </div>
        </template>
      </template>

      <template v-else>
        <div class="flex-1 flex items-center justify-center text-gray-500">
          Select a state to view details
        </div>
      </template>
    </div>
  </div>
</template>
