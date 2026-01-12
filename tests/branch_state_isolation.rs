//! Tests for branch and state isolation.
//!
//! These tests verify that:
//! 1. State is properly isolated between branches
//! 2. Time-travel branching works correctly
//! 3. State persists correctly across reopens and branch switches
//! 4. Branch deletion properly handles state
//! 5. Empty branches work correctly

use chronicle::{
    StateOperation, StateRegistration, StateStrategy, Store, StoreConfig,
};
use tempfile::TempDir;

fn test_store(dir: &TempDir) -> Store {
    Store::create(StoreConfig {
        path: dir.path().join("store"),
        blob_cache_size: 100,
        create_if_missing: true,
    })
    .unwrap()
}

fn open_store(dir: &TempDir) -> Store {
    Store::open(StoreConfig {
        path: dir.path().join("store"),
        blob_cache_size: 100,
        create_if_missing: false,
    })
    .unwrap()
}

// =============================================================================
// BRANCH STATE ISOLATION TESTS
// =============================================================================

#[test]
fn test_child_branch_inherits_parent_state() {
    let dir = TempDir::new().unwrap();
    let store = test_store(&dir);

    // Setup state on main
    store
        .register_state(StateRegistration {
            id: "messages".to_string(),
            strategy: StateStrategy::AppendLog { delta_snapshot_every: 10, full_snapshot_every: 50 },
            initial_value: None,
        })
        .unwrap();

    // Add messages on main
    store.update_state("messages", StateOperation::Append(b"\"msg1\"".to_vec())).unwrap();
    store.update_state("messages", StateOperation::Append(b"\"msg2\"".to_vec())).unwrap();

    // Create child branch
    store.create_branch("child", None).unwrap();
    store.switch_branch("child").unwrap();

    // Child should see parent's messages
    let state = store.get_state("messages").unwrap().unwrap();
    let messages: Vec<String> = serde_json::from_slice(&state).unwrap();
    assert_eq!(messages, vec!["msg1", "msg2"]);
}

#[test]
fn test_child_branch_changes_dont_affect_parent() {
    let dir = TempDir::new().unwrap();
    let store = test_store(&dir);

    // Setup state on main
    store
        .register_state(StateRegistration {
            id: "messages".to_string(),
            strategy: StateStrategy::AppendLog { delta_snapshot_every: 10, full_snapshot_every: 50 },
            initial_value: None,
        })
        .unwrap();

    // Add messages on main
    store.update_state("messages", StateOperation::Append(b"\"msg1\"".to_vec())).unwrap();
    store.update_state("messages", StateOperation::Append(b"\"msg2\"".to_vec())).unwrap();

    // Create child branch and add more messages
    store.create_branch("child", None).unwrap();
    store.switch_branch("child").unwrap();
    store.update_state("messages", StateOperation::Append(b"\"child_msg\"".to_vec())).unwrap();

    // Child should have 3 messages
    let child_state = store.get_state("messages").unwrap().unwrap();
    let child_messages: Vec<String> = serde_json::from_slice(&child_state).unwrap();
    assert_eq!(child_messages, vec!["msg1", "msg2", "child_msg"]);

    // Switch back to main - should only have 2 messages
    store.switch_branch("main").unwrap();
    let main_state = store.get_state("messages").unwrap().unwrap();
    let main_messages: Vec<String> = serde_json::from_slice(&main_state).unwrap();
    assert_eq!(main_messages, vec!["msg1", "msg2"]);
}

#[test]
fn test_parent_changes_after_branch_dont_affect_child() {
    let dir = TempDir::new().unwrap();
    let store = test_store(&dir);

    // Setup state on main
    store
        .register_state(StateRegistration {
            id: "messages".to_string(),
            strategy: StateStrategy::AppendLog { delta_snapshot_every: 10, full_snapshot_every: 50 },
            initial_value: None,
        })
        .unwrap();

    store.update_state("messages", StateOperation::Append(b"\"msg1\"".to_vec())).unwrap();

    // Create child branch
    store.create_branch("child", None).unwrap();

    // Add more messages on main AFTER creating child
    store.update_state("messages", StateOperation::Append(b"\"msg2_main\"".to_vec())).unwrap();

    // Main should have 2 messages
    let main_state = store.get_state("messages").unwrap().unwrap();
    let main_messages: Vec<String> = serde_json::from_slice(&main_state).unwrap();
    assert_eq!(main_messages, vec!["msg1", "msg2_main"]);

    // Switch to child - should only have 1 message (the one from before branching)
    store.switch_branch("child").unwrap();
    let child_state = store.get_state("messages").unwrap().unwrap();
    let child_messages: Vec<String> = serde_json::from_slice(&child_state).unwrap();
    assert_eq!(child_messages, vec!["msg1"]);
}

#[test]
fn test_multiple_branches_with_independent_state() {
    let dir = TempDir::new().unwrap();
    let store = test_store(&dir);

    store
        .register_state(StateRegistration {
            id: "data".to_string(),
            strategy: StateStrategy::AppendLog { delta_snapshot_every: 10, full_snapshot_every: 50 },
            initial_value: None,
        })
        .unwrap();

    // Add base data on main
    store.update_state("data", StateOperation::Append(b"\"base\"".to_vec())).unwrap();

    // Create branch A and add data
    store.create_branch("branch_a", None).unwrap();
    store.switch_branch("branch_a").unwrap();
    store.update_state("data", StateOperation::Append(b"\"a1\"".to_vec())).unwrap();
    store.update_state("data", StateOperation::Append(b"\"a2\"".to_vec())).unwrap();

    // Switch back to main, create branch B
    store.switch_branch("main").unwrap();
    store.create_branch("branch_b", None).unwrap();
    store.switch_branch("branch_b").unwrap();
    store.update_state("data", StateOperation::Append(b"\"b1\"".to_vec())).unwrap();

    // Verify each branch has correct state
    let b_state = store.get_state("data").unwrap().unwrap();
    let b_data: Vec<String> = serde_json::from_slice(&b_state).unwrap();
    assert_eq!(b_data, vec!["base", "b1"]);

    store.switch_branch("branch_a").unwrap();
    let a_state = store.get_state("data").unwrap().unwrap();
    let a_data: Vec<String> = serde_json::from_slice(&a_state).unwrap();
    assert_eq!(a_data, vec!["base", "a1", "a2"]);

    store.switch_branch("main").unwrap();
    let main_state = store.get_state("data").unwrap().unwrap();
    let main_data: Vec<String> = serde_json::from_slice(&main_state).unwrap();
    assert_eq!(main_data, vec!["base"]);
}

#[test]
fn test_nested_branches_isolation() {
    let dir = TempDir::new().unwrap();
    let store = test_store(&dir);

    store
        .register_state(StateRegistration {
            id: "log".to_string(),
            strategy: StateStrategy::AppendLog { delta_snapshot_every: 10, full_snapshot_every: 50 },
            initial_value: None,
        })
        .unwrap();

    // main -> child -> grandchild
    store.update_state("log", StateOperation::Append(b"\"main\"".to_vec())).unwrap();

    store.create_branch("child", None).unwrap();
    store.switch_branch("child").unwrap();
    store.update_state("log", StateOperation::Append(b"\"child\"".to_vec())).unwrap();

    store.create_branch("grandchild", None).unwrap();
    store.switch_branch("grandchild").unwrap();
    store.update_state("log", StateOperation::Append(b"\"grandchild\"".to_vec())).unwrap();

    // Verify grandchild sees all
    let gc_state = store.get_state("log").unwrap().unwrap();
    let gc_log: Vec<String> = serde_json::from_slice(&gc_state).unwrap();
    assert_eq!(gc_log, vec!["main", "child", "grandchild"]);

    // Child should not see grandchild's addition
    store.switch_branch("child").unwrap();
    let c_state = store.get_state("log").unwrap().unwrap();
    let c_log: Vec<String> = serde_json::from_slice(&c_state).unwrap();
    assert_eq!(c_log, vec!["main", "child"]);

    // Main should only see its own
    store.switch_branch("main").unwrap();
    let m_state = store.get_state("log").unwrap().unwrap();
    let m_log: Vec<String> = serde_json::from_slice(&m_state).unwrap();
    assert_eq!(m_log, vec!["main"]);
}

#[test]
fn test_snapshot_state_isolation() {
    let dir = TempDir::new().unwrap();
    let store = test_store(&dir);

    // Test with Snapshot strategy (not just AppendLog)
    store
        .register_state(StateRegistration {
            id: "config".to_string(),
            strategy: StateStrategy::Snapshot,
            initial_value: None,
        })
        .unwrap();

    store.update_state("config", StateOperation::Set(b"{\"version\": 1}".to_vec())).unwrap();

    store.create_branch("feature", None).unwrap();
    store.switch_branch("feature").unwrap();
    store.update_state("config", StateOperation::Set(b"{\"version\": 2, \"feature\": true}".to_vec())).unwrap();

    // Feature branch has updated config
    let f_state = store.get_state("config").unwrap().unwrap();
    let f_config: serde_json::Value = serde_json::from_slice(&f_state).unwrap();
    assert_eq!(f_config["version"], 2);
    assert_eq!(f_config["feature"], true);

    // Main still has original
    store.switch_branch("main").unwrap();
    let m_state = store.get_state("config").unwrap().unwrap();
    let m_config: serde_json::Value = serde_json::from_slice(&m_state).unwrap();
    assert_eq!(m_config["version"], 1);
    assert!(m_config.get("feature").is_none());
}

#[test]
fn test_multiple_state_slots_isolation() {
    let dir = TempDir::new().unwrap();
    let store = test_store(&dir);

    // Register multiple state slots
    store
        .register_state(StateRegistration {
            id: "messages".to_string(),
            strategy: StateStrategy::AppendLog { delta_snapshot_every: 10, full_snapshot_every: 50 },
            initial_value: None,
        })
        .unwrap();

    store
        .register_state(StateRegistration {
            id: "config".to_string(),
            strategy: StateStrategy::Snapshot,
            initial_value: None,
        })
        .unwrap();

    // Setup main state
    store.update_state("messages", StateOperation::Append(b"\"hello\"".to_vec())).unwrap();
    store.update_state("config", StateOperation::Set(b"{\"theme\": \"light\"}".to_vec())).unwrap();

    // Create branch and modify both
    store.create_branch("dark_mode", None).unwrap();
    store.switch_branch("dark_mode").unwrap();
    store.update_state("messages", StateOperation::Append(b"\"switching theme\"".to_vec())).unwrap();
    store.update_state("config", StateOperation::Set(b"{\"theme\": \"dark\"}".to_vec())).unwrap();

    // Verify branch state
    let dm_msgs = store.get_state("messages").unwrap().unwrap();
    let dm_msgs: Vec<String> = serde_json::from_slice(&dm_msgs).unwrap();
    assert_eq!(dm_msgs, vec!["hello", "switching theme"]);

    let dm_cfg = store.get_state("config").unwrap().unwrap();
    let dm_cfg: serde_json::Value = serde_json::from_slice(&dm_cfg).unwrap();
    assert_eq!(dm_cfg["theme"], "dark");

    // Verify main is unchanged
    store.switch_branch("main").unwrap();
    let m_msgs = store.get_state("messages").unwrap().unwrap();
    let m_msgs: Vec<String> = serde_json::from_slice(&m_msgs).unwrap();
    assert_eq!(m_msgs, vec!["hello"]);

    let m_cfg = store.get_state("config").unwrap().unwrap();
    let m_cfg: serde_json::Value = serde_json::from_slice(&m_cfg).unwrap();
    assert_eq!(m_cfg["theme"], "light");
}

// =============================================================================
// EMPTY BRANCH TESTS
// =============================================================================

#[test]
fn test_create_empty_branch_no_state_inheritance() {
    let dir = TempDir::new().unwrap();
    let store = test_store(&dir);

    store
        .register_state(StateRegistration {
            id: "data".to_string(),
            strategy: StateStrategy::AppendLog { delta_snapshot_every: 10, full_snapshot_every: 50 },
            initial_value: None,
        })
        .unwrap();

    // Add data on main
    store.update_state("data", StateOperation::Append(b"\"main1\"".to_vec())).unwrap();
    store.update_state("data", StateOperation::Append(b"\"main2\"".to_vec())).unwrap();

    // Create empty branch - should NOT inherit state
    store.create_empty_branch("empty", None).unwrap();
    store.switch_branch("empty").unwrap();

    // Empty branch should have no data
    let state = store.get_state("data").unwrap();
    assert!(state.is_none());

    // Can add new data
    store.update_state("data", StateOperation::Append(b"\"empty1\"".to_vec())).unwrap();
    let state = store.get_state("data").unwrap().unwrap();
    let data: Vec<String> = serde_json::from_slice(&state).unwrap();
    assert_eq!(data, vec!["empty1"]);

    // Main still has its data
    store.switch_branch("main").unwrap();
    let state = store.get_state("data").unwrap().unwrap();
    let data: Vec<String> = serde_json::from_slice(&state).unwrap();
    assert_eq!(data, vec!["main1", "main2"]);
}

#[test]
fn test_empty_branch_for_time_travel() {
    let dir = TempDir::new().unwrap();
    let store = test_store(&dir);

    store
        .register_state(StateRegistration {
            id: "history".to_string(),
            strategy: StateStrategy::AppendLog { delta_snapshot_every: 10, full_snapshot_every: 50 },
            initial_value: None,
        })
        .unwrap();

    // Build up history on main
    for i in 1..=10 {
        store.update_state("history", StateOperation::Append(format!("\"event{}\"", i).into_bytes())).unwrap();
    }

    // Verify main has 10 events
    let main_state = store.get_state("history").unwrap().unwrap();
    let main_history: Vec<String> = serde_json::from_slice(&main_state).unwrap();
    assert_eq!(main_history.len(), 10);

    // Create empty branch and manually add only first 5 events (time-travel simulation)
    store.create_empty_branch("time_travel", None).unwrap();
    store.switch_branch("time_travel").unwrap();

    for i in 1..=5 {
        store.update_state("history", StateOperation::Append(format!("\"event{}\"", i).into_bytes())).unwrap();
    }

    // Time-travel branch should have exactly 5 events
    let tt_state = store.get_state("history").unwrap().unwrap();
    let tt_history: Vec<String> = serde_json::from_slice(&tt_state).unwrap();
    assert_eq!(tt_history, vec!["event1", "event2", "event3", "event4", "event5"]);

    // Main still has all 10
    store.switch_branch("main").unwrap();
    let main_state = store.get_state("history").unwrap().unwrap();
    let main_history: Vec<String> = serde_json::from_slice(&main_state).unwrap();
    assert_eq!(main_history.len(), 10);
}

// =============================================================================
// PERSISTENCE AND REOPEN TESTS
// =============================================================================

#[test]
fn test_branch_state_persists_across_reopen() {
    let dir = TempDir::new().unwrap();

    // First session
    {
        let store = test_store(&dir);

        store
            .register_state(StateRegistration {
                id: "data".to_string(),
                strategy: StateStrategy::AppendLog { delta_snapshot_every: 10, full_snapshot_every: 50 },
                initial_value: None,
            })
            .unwrap();

        store.update_state("data", StateOperation::Append(b"\"main\"".to_vec())).unwrap();

        store.create_branch("feature", None).unwrap();
        store.switch_branch("feature").unwrap();
        store.update_state("data", StateOperation::Append(b"\"feature\"".to_vec())).unwrap();

        store.sync().unwrap();
    }

    // Second session - verify both branches have correct state
    {
        let store = open_store(&dir);

        // Check feature branch (should be current after reopen? Let's check main first)
        store.switch_branch("main").unwrap();
        let main_state = store.get_state("data").unwrap().unwrap();
        let main_data: Vec<String> = serde_json::from_slice(&main_state).unwrap();
        assert_eq!(main_data, vec!["main"]);

        store.switch_branch("feature").unwrap();
        let feature_state = store.get_state("data").unwrap().unwrap();
        let feature_data: Vec<String> = serde_json::from_slice(&feature_state).unwrap();
        assert_eq!(feature_data, vec!["main", "feature"]);
    }
}

#[test]
fn test_multiple_branches_persist_across_reopen() {
    let dir = TempDir::new().unwrap();

    // First session - create multiple branches with different state
    {
        let store = test_store(&dir);

        store
            .register_state(StateRegistration {
                id: "log".to_string(),
                strategy: StateStrategy::AppendLog { delta_snapshot_every: 10, full_snapshot_every: 50 },
                initial_value: None,
            })
            .unwrap();

        store.update_state("log", StateOperation::Append(b"\"base\"".to_vec())).unwrap();

        // Branch A
        store.create_branch("a", None).unwrap();
        store.switch_branch("a").unwrap();
        store.update_state("log", StateOperation::Append(b"\"a1\"".to_vec())).unwrap();
        store.update_state("log", StateOperation::Append(b"\"a2\"".to_vec())).unwrap();

        // Branch B (from main)
        store.switch_branch("main").unwrap();
        store.create_branch("b", None).unwrap();
        store.switch_branch("b").unwrap();
        store.update_state("log", StateOperation::Append(b"\"b1\"".to_vec())).unwrap();

        // Branch C (from A)
        store.switch_branch("a").unwrap();
        store.create_branch("c", Some("a")).unwrap();
        store.switch_branch("c").unwrap();
        store.update_state("log", StateOperation::Append(b"\"c1\"".to_vec())).unwrap();

        store.sync().unwrap();
    }

    // Second session - verify all branches
    {
        let store = open_store(&dir);

        store.switch_branch("main").unwrap();
        let state = store.get_state("log").unwrap().unwrap();
        let data: Vec<String> = serde_json::from_slice(&state).unwrap();
        assert_eq!(data, vec!["base"]);

        store.switch_branch("a").unwrap();
        let state = store.get_state("log").unwrap().unwrap();
        let data: Vec<String> = serde_json::from_slice(&state).unwrap();
        assert_eq!(data, vec!["base", "a1", "a2"]);

        store.switch_branch("b").unwrap();
        let state = store.get_state("log").unwrap().unwrap();
        let data: Vec<String> = serde_json::from_slice(&state).unwrap();
        assert_eq!(data, vec!["base", "b1"]);

        store.switch_branch("c").unwrap();
        let state = store.get_state("log").unwrap().unwrap();
        let data: Vec<String> = serde_json::from_slice(&state).unwrap();
        assert_eq!(data, vec!["base", "a1", "a2", "c1"]);
    }
}

#[test]
fn test_empty_branch_persists_across_reopen() {
    let dir = TempDir::new().unwrap();

    // First session
    {
        let store = test_store(&dir);

        store
            .register_state(StateRegistration {
                id: "data".to_string(),
                strategy: StateStrategy::AppendLog { delta_snapshot_every: 10, full_snapshot_every: 50 },
                initial_value: None,
            })
            .unwrap();

        store.update_state("data", StateOperation::Append(b"\"main1\"".to_vec())).unwrap();
        store.update_state("data", StateOperation::Append(b"\"main2\"".to_vec())).unwrap();

        store.create_empty_branch("empty", None).unwrap();
        store.switch_branch("empty").unwrap();
        store.update_state("data", StateOperation::Append(b"\"empty1\"".to_vec())).unwrap();

        store.sync().unwrap();
    }

    // Second session
    {
        let store = open_store(&dir);

        store.switch_branch("main").unwrap();
        let state = store.get_state("data").unwrap().unwrap();
        let data: Vec<String> = serde_json::from_slice(&state).unwrap();
        assert_eq!(data, vec!["main1", "main2"]);

        store.switch_branch("empty").unwrap();
        let state = store.get_state("data").unwrap().unwrap();
        let data: Vec<String> = serde_json::from_slice(&state).unwrap();
        assert_eq!(data, vec!["empty1"]);
    }
}

#[test]
fn test_state_modifications_after_reopen() {
    let dir = TempDir::new().unwrap();

    // First session - setup
    {
        let store = test_store(&dir);

        store
            .register_state(StateRegistration {
                id: "counter".to_string(),
                strategy: StateStrategy::AppendLog { delta_snapshot_every: 10, full_snapshot_every: 50 },
                initial_value: None,
            })
            .unwrap();

        store.update_state("counter", StateOperation::Append(b"1".to_vec())).unwrap();

        store.create_branch("feature", None).unwrap();
        store.switch_branch("feature").unwrap();
        store.update_state("counter", StateOperation::Append(b"2".to_vec())).unwrap();

        store.sync().unwrap();
    }

    // Second session - modify both branches
    {
        let store = open_store(&dir);

        // Add to main
        store.switch_branch("main").unwrap();
        store.update_state("counter", StateOperation::Append(b"10".to_vec())).unwrap();

        // Add to feature
        store.switch_branch("feature").unwrap();
        store.update_state("counter", StateOperation::Append(b"20".to_vec())).unwrap();

        store.sync().unwrap();
    }

    // Third session - verify
    {
        let store = open_store(&dir);

        store.switch_branch("main").unwrap();
        let state = store.get_state("counter").unwrap().unwrap();
        let data: Vec<i32> = serde_json::from_slice(&state).unwrap();
        assert_eq!(data, vec![1, 10]);

        store.switch_branch("feature").unwrap();
        let state = store.get_state("counter").unwrap().unwrap();
        let data: Vec<i32> = serde_json::from_slice(&state).unwrap();
        assert_eq!(data, vec![1, 2, 20]);
    }
}

// =============================================================================
// BRANCH DELETION TESTS
// =============================================================================

#[test]
fn test_delete_branch_doesnt_affect_parent() {
    let dir = TempDir::new().unwrap();
    let store = test_store(&dir);

    store
        .register_state(StateRegistration {
            id: "data".to_string(),
            strategy: StateStrategy::AppendLog { delta_snapshot_every: 10, full_snapshot_every: 50 },
            initial_value: None,
        })
        .unwrap();

    store.update_state("data", StateOperation::Append(b"\"base\"".to_vec())).unwrap();

    store.create_branch("child", None).unwrap();
    store.switch_branch("child").unwrap();
    store.update_state("data", StateOperation::Append(b"\"child\"".to_vec())).unwrap();

    // Delete the child branch
    store.switch_branch("main").unwrap();
    store.delete_branch("child").unwrap();

    // Main should still work
    let state = store.get_state("data").unwrap().unwrap();
    let data: Vec<String> = serde_json::from_slice(&state).unwrap();
    assert_eq!(data, vec!["base"]);

    // Can still add to main
    store.update_state("data", StateOperation::Append(b"\"new\"".to_vec())).unwrap();
    let state = store.get_state("data").unwrap().unwrap();
    let data: Vec<String> = serde_json::from_slice(&state).unwrap();
    assert_eq!(data, vec!["base", "new"]);
}

#[test]
fn test_delete_branch_doesnt_affect_sibling() {
    let dir = TempDir::new().unwrap();
    let store = test_store(&dir);

    store
        .register_state(StateRegistration {
            id: "data".to_string(),
            strategy: StateStrategy::AppendLog { delta_snapshot_every: 10, full_snapshot_every: 50 },
            initial_value: None,
        })
        .unwrap();

    store.update_state("data", StateOperation::Append(b"\"base\"".to_vec())).unwrap();

    // Create two sibling branches
    store.create_branch("branch_a", None).unwrap();
    store.switch_branch("branch_a").unwrap();
    store.update_state("data", StateOperation::Append(b"\"a\"".to_vec())).unwrap();

    store.switch_branch("main").unwrap();
    store.create_branch("branch_b", None).unwrap();
    store.switch_branch("branch_b").unwrap();
    store.update_state("data", StateOperation::Append(b"\"b\"".to_vec())).unwrap();

    // Delete branch_a
    store.delete_branch("branch_a").unwrap();

    // branch_b should be unaffected
    let state = store.get_state("data").unwrap().unwrap();
    let data: Vec<String> = serde_json::from_slice(&state).unwrap();
    assert_eq!(data, vec!["base", "b"]);
}

#[test]
fn test_recreate_branch_after_deletion() {
    let dir = TempDir::new().unwrap();
    let store = test_store(&dir);

    store
        .register_state(StateRegistration {
            id: "data".to_string(),
            strategy: StateStrategy::AppendLog { delta_snapshot_every: 10, full_snapshot_every: 50 },
            initial_value: None,
        })
        .unwrap();

    store.update_state("data", StateOperation::Append(b"\"v1\"".to_vec())).unwrap();

    // Create, use, and delete a branch
    store.create_branch("temp", None).unwrap();
    store.switch_branch("temp").unwrap();
    store.update_state("data", StateOperation::Append(b"\"temp_data\"".to_vec())).unwrap();
    store.switch_branch("main").unwrap();
    store.delete_branch("temp").unwrap();

    // Add more to main
    store.update_state("data", StateOperation::Append(b"\"v2\"".to_vec())).unwrap();

    // Recreate branch with same name
    store.create_branch("temp", None).unwrap();
    store.switch_branch("temp").unwrap();

    // New temp branch should see current main state, not old temp state
    let state = store.get_state("data").unwrap().unwrap();
    let data: Vec<String> = serde_json::from_slice(&state).unwrap();
    assert_eq!(data, vec!["v1", "v2"]);
}

// =============================================================================
// EDGE CASES
// =============================================================================

#[test]
fn test_rapid_branch_switching_preserves_state() {
    let dir = TempDir::new().unwrap();
    let store = test_store(&dir);

    store
        .register_state(StateRegistration {
            id: "data".to_string(),
            strategy: StateStrategy::AppendLog { delta_snapshot_every: 10, full_snapshot_every: 50 },
            initial_value: None,
        })
        .unwrap();

    store.update_state("data", StateOperation::Append(b"\"main\"".to_vec())).unwrap();
    store.create_branch("a", None).unwrap();
    store.switch_branch("a").unwrap();
    store.update_state("data", StateOperation::Append(b"\"a\"".to_vec())).unwrap();
    store.switch_branch("main").unwrap();
    store.create_branch("b", None).unwrap();
    store.switch_branch("b").unwrap();
    store.update_state("data", StateOperation::Append(b"\"b\"".to_vec())).unwrap();

    // Rapidly switch between branches
    for _ in 0..100 {
        store.switch_branch("main").unwrap();
        store.switch_branch("a").unwrap();
        store.switch_branch("b").unwrap();
    }

    // All branches should still have correct state
    store.switch_branch("main").unwrap();
    let state = store.get_state("data").unwrap().unwrap();
    let data: Vec<String> = serde_json::from_slice(&state).unwrap();
    assert_eq!(data, vec!["main"]);

    store.switch_branch("a").unwrap();
    let state = store.get_state("data").unwrap().unwrap();
    let data: Vec<String> = serde_json::from_slice(&state).unwrap();
    assert_eq!(data, vec!["main", "a"]);

    store.switch_branch("b").unwrap();
    let state = store.get_state("data").unwrap().unwrap();
    let data: Vec<String> = serde_json::from_slice(&state).unwrap();
    assert_eq!(data, vec!["main", "b"]);
}

#[test]
fn test_branch_from_specific_parent() {
    let dir = TempDir::new().unwrap();
    let store = test_store(&dir);

    store
        .register_state(StateRegistration {
            id: "data".to_string(),
            strategy: StateStrategy::AppendLog { delta_snapshot_every: 10, full_snapshot_every: 50 },
            initial_value: None,
        })
        .unwrap();

    store.update_state("data", StateOperation::Append(b"\"main\"".to_vec())).unwrap();

    store.create_branch("parent", None).unwrap();
    store.switch_branch("parent").unwrap();
    store.update_state("data", StateOperation::Append(b"\"parent\"".to_vec())).unwrap();

    // Create child from "parent" while on "parent"
    store.create_branch("child", Some("parent")).unwrap();
    store.switch_branch("child").unwrap();
    store.update_state("data", StateOperation::Append(b"\"child\"".to_vec())).unwrap();

    let state = store.get_state("data").unwrap().unwrap();
    let data: Vec<String> = serde_json::from_slice(&state).unwrap();
    assert_eq!(data, vec!["main", "parent", "child"]);

    // Create another child from "parent" while on "child"
    store.create_branch("sibling", Some("parent")).unwrap();
    store.switch_branch("sibling").unwrap();
    store.update_state("data", StateOperation::Append(b"\"sibling\"".to_vec())).unwrap();

    let state = store.get_state("data").unwrap().unwrap();
    let data: Vec<String> = serde_json::from_slice(&state).unwrap();
    assert_eq!(data, vec!["main", "parent", "sibling"]);
}

#[test]
fn test_empty_state_on_branches() {
    let dir = TempDir::new().unwrap();
    let store = test_store(&dir);

    store
        .register_state(StateRegistration {
            id: "optional".to_string(),
            strategy: StateStrategy::AppendLog { delta_snapshot_every: 10, full_snapshot_every: 50 },
            initial_value: None,
        })
        .unwrap();

    // Don't add any state on main
    store.create_branch("feature", None).unwrap();
    store.switch_branch("feature").unwrap();

    // State should be None on feature too
    let state = store.get_state("optional").unwrap();
    assert!(state.is_none());

    // Add state only on feature
    store.update_state("optional", StateOperation::Append(b"\"feature_only\"".to_vec())).unwrap();

    // Feature has state
    let state = store.get_state("optional").unwrap().unwrap();
    let data: Vec<String> = serde_json::from_slice(&state).unwrap();
    assert_eq!(data, vec!["feature_only"]);

    // Main still has no state
    store.switch_branch("main").unwrap();
    let state = store.get_state("optional").unwrap();
    assert!(state.is_none());
}
