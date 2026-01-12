import { defineStore } from 'pinia';
import { ref } from 'vue';
import { client, type StateInfo } from '@/api/client';

export const useStatesStore = defineStore('states', () => {
  const states = ref<StateInfo[]>([]);
  const selectedState = ref<StateInfo | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchStates() {
    loading.value = true;
    error.value = null;
    try {
      states.value = await client.listStates();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch states';
    } finally {
      loading.value = false;
    }
  }

  async function fetchState(id: string) {
    loading.value = true;
    error.value = null;
    try {
      selectedState.value = await client.getState(id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch state';
      selectedState.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function fetchStateAt(id: string, sequence: number) {
    loading.value = true;
    error.value = null;
    try {
      const result = await client.getStateAt(id, sequence);
      return result.value;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch state at sequence';
      return null;
    } finally {
      loading.value = false;
    }
  }

  function clearSelection() {
    selectedState.value = null;
  }

  return {
    states,
    selectedState,
    loading,
    error,
    fetchStates,
    fetchState,
    fetchStateAt,
    clearSelection,
  };
});
