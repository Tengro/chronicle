//! Subscription system for live store updates.
//!
//! This module provides in-process subscriptions to store events:
//! - Record appends
//! - State changes (snapshots and deltas)
//! - Branch operations
//!
//! Subscriptions support:
//! - Filtering by record type, state ID, etc.
//! - Historical catch-up from a given sequence
//! - Bounded buffers with slow-subscriber dropping
//!
//! # Example
//!
//! ```ignore
//! let manager = SubscriptionManager::new();
//!
//! // Subscribe to message records
//! let config = SubscriptionConfig {
//!     filter: SubscriptionFilter::record_types(vec!["message".to_string()]),
//!     from_sequence: Some(Sequence(100)),
//!     ..Default::default()
//! };
//! let handle = manager.subscribe(config);
//!
//! // Receive events
//! loop {
//!     match handle.recv() {
//!         Ok(StoreEvent::Record { record }) => println!("Got record: {:?}", record),
//!         Ok(StoreEvent::CaughtUp) => println!("Now live!"),
//!         Ok(StoreEvent::Dropped { reason }) => break,
//!         Err(_) => break,
//!     }
//! }
//! ```

mod manager;
mod types;

pub use manager::SubscriptionManager;
pub use types::{
    BranchSummary, DropReason, RecordSummary, StoreEvent, SubscriptionConfig, SubscriptionFilter,
    SubscriptionHandle, SubscriptionId,
};
