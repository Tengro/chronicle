import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { client, type Branch } from '@/api/client';

export const useBranchesStore = defineStore('branches', () => {
  const branches = ref<Branch[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const currentBranch = computed(() => branches.value.find((b) => b.isCurrent));

  async function fetchBranches() {
    loading.value = true;
    error.value = null;
    try {
      branches.value = await client.listBranches();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch branches';
    } finally {
      loading.value = false;
    }
  }

  async function switchBranch(name: string) {
    loading.value = true;
    error.value = null;
    try {
      await client.switchBranch(name);
      await fetchBranches();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to switch branch';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createBranch(name: string, from?: string) {
    loading.value = true;
    error.value = null;
    try {
      await client.createBranch(name, from);
      await fetchBranches();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create branch';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function deleteBranch(name: string) {
    loading.value = true;
    error.value = null;
    try {
      await client.deleteBranch(name);
      await fetchBranches();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to delete branch';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return {
    branches,
    currentBranch,
    loading,
    error,
    fetchBranches,
    switchBranch,
    createBranch,
    deleteBranch,
  };
});
