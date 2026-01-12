<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useBranchesStore } from '@/stores/branches';

const branchesStore = useBranchesStore();

const showCreateModal = ref(false);
const newBranchName = ref('');
const newBranchFrom = ref<string | null>(null);
const creating = ref(false);
const deleteConfirm = ref<string | null>(null);

async function createBranch() {
  if (!newBranchName.value.trim()) return;
  creating.value = true;
  try {
    await branchesStore.createBranch(
      newBranchName.value.trim(),
      newBranchFrom.value || undefined
    );
    showCreateModal.value = false;
    newBranchName.value = '';
    newBranchFrom.value = null;
  } finally {
    creating.value = false;
  }
}

async function deleteBranch(name: string) {
  await branchesStore.deleteBranch(name);
  deleteConfirm.value = null;
}

async function switchToBranch(name: string) {
  await branchesStore.switchBranch(name);
}

onMounted(() => {
  branchesStore.fetchBranches();
});
</script>

<template>
  <div class="h-full p-6">
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-semibold text-gray-900">Branches</h1>
        <button
          @click="showCreateModal = true"
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
        >
          Create Branch
        </button>
      </div>

      <div v-if="branchesStore.error" class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
        {{ branchesStore.error }}
      </div>

      <!-- Branches List -->
      <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div
          v-for="branch in branchesStore.branches"
          :key="branch.id"
          class="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-b-0"
          :class="branch.isCurrent ? 'bg-blue-50' : ''"
        >
          <div class="flex items-center gap-3">
            <svg v-if="branch.isCurrent" class="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
            <div v-else class="w-5"></div>
            <div>
              <div class="font-medium text-gray-900">{{ branch.name }}</div>
              <div class="text-xs text-gray-500">
                Head: {{ branch.head }}
                <span v-if="branch.parentId" class="ml-2">
                  Parent: {{ branch.parentId }} @ {{ branch.branchPoint }}
                </span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="!branch.isCurrent"
              @click="switchToBranch(branch.name)"
              class="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
            >
              Switch
            </button>
            <button
              v-if="!branch.isCurrent && branch.name !== 'main'"
              @click="deleteConfirm = branch.name"
              class="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
            >
              Delete
            </button>
          </div>
        </div>
        <div v-if="branchesStore.branches.length === 0 && !branchesStore.loading" class="p-8 text-center text-gray-500">
          No branches found
        </div>
      </div>

      <!-- Create Modal -->
      <div v-if="showCreateModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl w-96 p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Create Branch</h2>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                v-model="newBranchName"
                type="text"
                placeholder="feature/my-branch"
                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Fork From (optional)</label>
              <select
                v-model="newBranchFrom"
                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option :value="null">Current branch head</option>
                <option v-for="b in branchesStore.branches" :key="b.id" :value="b.name">
                  {{ b.name }} (head: {{ b.head }})
                </option>
              </select>
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-6">
            <button
              @click="showCreateModal = false"
              class="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
            <button
              @click="createBranch"
              :disabled="creating || !newBranchName.trim()"
              class="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {{ creating ? 'Creating...' : 'Create' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Delete Confirmation -->
      <div v-if="deleteConfirm" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl w-96 p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-2">Delete Branch</h2>
          <p class="text-gray-600 text-sm mb-4">
            Are you sure you want to delete branch "{{ deleteConfirm }}"? This action cannot be undone.
          </p>
          <div class="flex justify-end gap-2">
            <button
              @click="deleteConfirm = null"
              class="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
            <button
              @click="deleteBranch(deleteConfirm!)"
              class="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
