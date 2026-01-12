import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { client, type Record } from '@/api/client';

export const useRecordsStore = defineStore('records', () => {
  const records = ref<Record[]>([]);
  const recordTypes = ref<string[]>([]);
  const selectedRecord = ref<Record | null>(null);
  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref<string | null>(null);
  const totalCount = ref(0);
  const minSequence = ref<number | null>(null); // Track lowest sequence for efficient pagination
  const batchSize = 50;

  // Filter state
  const typeFilter = ref<string | null>(null);

  // Check if we can load more (have we reached sequence 0?)
  const hasMore = computed(() => minSequence.value !== null && minSequence.value > 0);

  // Fetch initial records (newest first)
  async function fetchRecords() {
    loading.value = true;
    error.value = null;
    try {
      const result = await client.getRecordsTail({
        limit: batchSize,
        type: typeFilter.value || undefined,
      });

      // Items already come newest-first from the tail endpoint
      records.value = result.items;
      totalCount.value = result.total;

      // Track the minimum sequence for pagination
      if (result.items.length > 0) {
        minSequence.value = Math.min(...result.items.map(r => r.sequence));
      } else {
        minSequence.value = null;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch records';
    } finally {
      loading.value = false;
    }
  }

  // Load more older records using sequence-based pagination with reverse query
  // This uses O(log n + k) BTreeMap reverse iteration for efficiency
  async function loadMore() {
    if (loadingMore.value || !hasMore.value || minSequence.value === null) return;

    loadingMore.value = true;
    try {
      // Fetch records with sequence < minSequence (older records)
      // Use reverse=true to get records nearest to minSequence first
      const result = await client.listRecords({
        type: typeFilter.value || undefined,
        to: minSequence.value - 1, // Exclusive: get records before our oldest
        limit: batchSize,
        reverse: true, // Get newest records in range first (nearest to minSequence)
      });

      if (result.items.length > 0) {
        // Items already come newest-first due to reverse query
        records.value = [...records.value, ...result.items];

        // Update min sequence (last item is the oldest in the batch)
        minSequence.value = Math.min(...result.items.map(r => r.sequence));
      } else {
        // No more records
        minSequence.value = 0;
      }
    } catch (e) {
      console.error('Failed to load more:', e);
    } finally {
      loadingMore.value = false;
    }
  }

  async function fetchRecordTypes() {
    try {
      recordTypes.value = await client.getRecordTypes();
    } catch (e) {
      console.error('Failed to fetch record types:', e);
    }
  }

  async function fetchRecord(id: string) {
    loading.value = true;
    error.value = null;
    try {
      selectedRecord.value = await client.getRecord(id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch record';
      selectedRecord.value = null;
    } finally {
      loading.value = false;
    }
  }

  function setTypeFilter(type: string | null) {
    typeFilter.value = type;
    records.value = [];
    minSequence.value = null;
    fetchRecords();
  }

  function clearFilters() {
    typeFilter.value = null;
    records.value = [];
    minSequence.value = null;
    fetchRecords();
  }

  function clearSelection() {
    selectedRecord.value = null;
  }

  // Compute loaded count from records array
  const loadedCount = computed(() => records.value.length);

  return {
    records,
    recordTypes,
    selectedRecord,
    loading,
    loadingMore,
    error,
    hasMore,
    totalCount,
    loadedCount,
    typeFilter,
    fetchRecords,
    fetchRecordTypes,
    fetchRecord,
    loadMore,
    setTypeFilter,
    clearFilters,
    clearSelection,
  };
});
