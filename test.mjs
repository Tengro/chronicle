import { JsStore } from './index.js';

console.log('Testing record-store TypeScript bindings...\n');

// Test 1: Create a new store
console.log('1. Creating store...');
const store = JsStore.openOrCreate({
  path: './test-store',
  blobCacheSize: 100
});
console.log('✓ Store created');

// Test 2: Get stats
console.log('\n2. Getting store stats...');
const stats = store.stats();
console.log('✓ Stats:', JSON.stringify(stats, null, 2));

// Test 3: Store a blob
console.log('\n3. Storing blob...');
const blobData = Buffer.from('Hello from TypeScript!');
const blobHash = store.storeBlob(blobData, 'text/plain');
console.log('✓ Blob stored with hash:', blobHash);

// Test 4: Retrieve blob
console.log('\n4. Retrieving blob...');
const retrieved = store.getBlob(blobHash);
console.log('✓ Blob retrieved:', retrieved.toString());

// Test 5: Append a record
console.log('\n5. Appending record...');
const record = store.appendJson('test.message', {
  message: 'Hello from TS bindings!'
});
console.log('✓ Record appended:', JSON.stringify(record, null, 2));

// Test 6: Get record by ID
console.log('\n6. Retrieving record by ID...');
const fetched = store.getRecord(record.id);
console.log('✓ Record retrieved:', JSON.stringify(fetched, null, 2));

// Test 7: Get records by type
console.log('\n7. Getting records by type...');
const recordIds = store.getRecordIdsByType('test.message');
console.log('✓ Found', recordIds.length, 'record(s) of type test.message');

// Test 8: Register and use state (AppendLog)
console.log('\n8. Registering AppendLog state...');
store.registerState({
  id: 'messages',
  strategy: 'append_log',
  deltaSnapshotEvery: 5,
  fullSnapshotEvery: 20
});
console.log('✓ State registered');

// Test 9: Append to state
console.log('\n9. Appending to state...');
store.appendToStateJson('messages', { text: 'First message' });
store.appendToStateJson('messages', { text: 'Second message' });
store.appendToStateJson('messages', { text: 'Third message' });
console.log('✓ Added 3 messages to state');

// Test 10: Get state
console.log('\n10. Getting state...');
const state = store.getStateJson('messages');
console.log('✓ State:', JSON.stringify(state, null, 2));

// Test 11: Get state length
console.log('\n11. Getting state length...');
const len = store.getStateLen('messages');
console.log('✓ State length:', len);

// Test 12: Get state tail
console.log('\n12. Getting state tail (last 2 items)...');
const tail = store.getStateTail('messages', 2);
console.log('✓ Tail:', JSON.stringify(tail, null, 2));

// Test 13: Create branch
console.log('\n13. Creating branch...');
const branchId = store.createBranch('test-branch', null);
console.log('✓ Branch created:', branchId);

// Test 14: List branches
console.log('\n14. Listing branches...');
const branches = store.listBranches();
console.log('✓ Branches:', JSON.stringify(branches, null, 2));

// Test 15: Switch to branch
console.log('\n15. Switching to branch...');
store.switchBranch('test-branch');
console.log('✓ Switched to branch:', store.currentBranch().name);

// Test 16: Add data to branch
console.log('\n16. Adding data to branch...');
store.appendToStateJson('messages', { text: 'Branch-only message' });
const branchState = store.getStateJson('messages');
console.log('✓ Branch state:', JSON.stringify(branchState, null, 2));

// Test 17: Switch back to main
console.log('\n17. Switching back to main...');
store.switchBranch('main');
const mainState = store.getStateJson('messages');
console.log('✓ Main state (no branch message):', JSON.stringify(mainState, null, 2));

// Test 18: Causation links
console.log('\n18. Testing causation links...');
const msg = store.appendJson('message', { text: 'user message' });
const response = store.appendJsonWithLinks('response', { text: 'assistant response' }, {
  causedBy: [msg.id]
});
const toolCall = store.appendJsonWithLinks('tool_call', { tool: 'search' }, {
  causedBy: [response.id],
  linkedTo: [msg.id]
});
console.log('✓ Created causation chain: msg -> response -> tool_call');
console.log('  Response causedBy:', response.causedBy);
console.log('  Tool call causedBy:', toolCall.causedBy, 'linkedTo:', toolCall.linkedTo);

// Test 19: Reverse lookups
console.log('\n19. Testing reverse lookups (getEffects, getLinksTo)...');
const effectsOfMsg = store.getEffects(msg.id);
const linksToMsg = store.getLinksTo(msg.id);
console.log('✓ Effects of message:', effectsOfMsg);
console.log('✓ Links to message:', linksToMsg);

// Test 20: Query with filters
console.log('\n20. Testing query...');
const allRecords = store.query({});
console.log('✓ All records:', allRecords.length);

const messagesOnly = store.query({ types: ['message'] });
console.log('✓ Messages only:', messagesOnly.length);

const limited = store.query({ limit: 3 });
console.log('✓ Limited to 3:', limited.length);

// Test 21: List states
console.log('\n21. Testing listStates...');
const states = store.listStates();
console.log('✓ States:', states);

// Test 22: Current sequence
console.log('\n22. Testing currentSequence...');
const seq = store.currentSequence();
console.log('✓ Current sequence:', seq);

// Test 23: Historical state access
console.log('\n23. Testing historical state access (getStateAt)...');
// Add more messages with known sequences
const r1 = store.appendToStateJson('messages', { text: 'msg4' });
const r2 = store.appendToStateJson('messages', { text: 'msg5' });
const r3 = store.appendToStateJson('messages', { text: 'msg6' });

const currentState = store.getStateJson('messages');
console.log('✓ Current state has', currentState.length, 'items');

// Get state at r1's sequence (should have 4 items: 3 original + 1)
const stateAtR1 = store.getStateJsonAt('messages', r1.sequence);
console.log('✓ State at seq', r1.sequence, 'has', stateAtR1.length, 'items');

// Get state at r2's sequence (should have 5 items)
const stateAtR2 = store.getStateJsonAt('messages', r2.sequence);
console.log('✓ State at seq', r2.sequence, 'has', stateAtR2.length, 'items');

// Test 24: Sync
console.log('\n24. Testing sync...');
store.sync();
console.log('✓ Sync completed');

console.log('\n✅ All tests passed!');
