//! Record indices for efficient lookups.

use crate::error::{Result, StoreError};
use crate::types::{BranchId, RecordId, Sequence};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

/// Magic bytes for index files.
const INDEX_MAGIC: &[u8; 4] = b"IDX\0";

/// Current index format version.
const INDEX_VERSION: u8 = 1;

/// Index entry size (sequence + offset).
const INDEX_ENTRY_SIZE: usize = 16;

/// Index mapping sequence numbers to file offsets.
pub struct RecordIndex {
    /// Path to the index file.
    path: PathBuf,

    /// In-memory index: (branch, sequence) -> offset.
    entries: RwLock<HashMap<(BranchId, Sequence), u64>>,

    /// Record ID to offset.
    id_to_offset: RwLock<HashMap<RecordId, u64>>,

    /// Record type to record IDs.
    type_index: RwLock<HashMap<String, Vec<RecordId>>>,

    /// caused_by index: record_id -> records that have it in caused_by.
    caused_by_index: RwLock<HashMap<RecordId, Vec<RecordId>>>,

    /// linked_to index: record_id -> records that have it in linked_to.
    linked_to_index: RwLock<HashMap<RecordId, Vec<RecordId>>>,
}

impl RecordIndex {
    /// Create a new index.
    pub fn new(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref().to_path_buf();

        Ok(Self {
            path,
            entries: RwLock::new(HashMap::new()),
            id_to_offset: RwLock::new(HashMap::new()),
            type_index: RwLock::new(HashMap::new()),
            caused_by_index: RwLock::new(HashMap::new()),
            linked_to_index: RwLock::new(HashMap::new()),
        })
    }

    /// Load index from file.
    pub fn load(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref().to_path_buf();

        let mut index = Self {
            path: path.clone(),
            entries: RwLock::new(HashMap::new()),
            id_to_offset: RwLock::new(HashMap::new()),
            type_index: RwLock::new(HashMap::new()),
            caused_by_index: RwLock::new(HashMap::new()),
            linked_to_index: RwLock::new(HashMap::new()),
        };

        if path.exists() {
            index.load_from_file()?;
        }

        Ok(index)
    }

    /// Add an entry to the index.
    pub fn add(
        &self,
        id: RecordId,
        branch: BranchId,
        sequence: Sequence,
        offset: u64,
        record_type: &str,
        caused_by: &[RecordId],
        linked_to: &[RecordId],
    ) {
        self.entries.write().insert((branch, sequence), offset);
        self.id_to_offset.write().insert(id, offset);

        self.type_index
            .write()
            .entry(record_type.to_string())
            .or_default()
            .push(id);

        for &cause in caused_by {
            self.caused_by_index
                .write()
                .entry(cause)
                .or_default()
                .push(id);
        }

        for &link in linked_to {
            self.linked_to_index
                .write()
                .entry(link)
                .or_default()
                .push(id);
        }
    }

    /// Get offset for a sequence on a branch.
    pub fn get_offset(&self, branch: BranchId, sequence: Sequence) -> Option<u64> {
        self.entries.read().get(&(branch, sequence)).copied()
    }

    /// Get offset for a record ID.
    pub fn get_offset_by_id(&self, id: RecordId) -> Option<u64> {
        self.id_to_offset.read().get(&id).copied()
    }

    /// Get all record IDs of a given type.
    pub fn get_by_type(&self, record_type: &str) -> Vec<RecordId> {
        self.type_index
            .read()
            .get(record_type)
            .cloned()
            .unwrap_or_default()
    }

    /// Get records that have `id` in their caused_by.
    pub fn get_caused_by(&self, id: RecordId) -> Vec<RecordId> {
        self.caused_by_index
            .read()
            .get(&id)
            .cloned()
            .unwrap_or_default()
    }

    /// Get records that have `id` in their linked_to.
    pub fn get_linked_to(&self, id: RecordId) -> Vec<RecordId> {
        self.linked_to_index
            .read()
            .get(&id)
            .cloned()
            .unwrap_or_default()
    }

    /// Rebuild causation indexes for a record (used when reopening store).
    pub fn rebuild_causation_for(&self, id: RecordId, caused_by: &[RecordId], linked_to: &[RecordId]) {
        for &cause in caused_by {
            self.caused_by_index
                .write()
                .entry(cause)
                .or_default()
                .push(id);
        }

        for &link in linked_to {
            self.linked_to_index
                .write()
                .entry(link)
                .or_default()
                .push(id);
        }
    }

    /// Get the highest sequence for a branch.
    pub fn max_sequence(&self, branch: BranchId) -> Option<Sequence> {
        self.entries
            .read()
            .keys()
            .filter(|(b, _)| *b == branch)
            .map(|(_, s)| *s)
            .max()
    }

    /// Get count of records.
    pub fn count(&self) -> usize {
        self.id_to_offset.read().len()
    }

    /// Save index to file.
    pub fn save(&self) -> Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&self.path)?;

        // Write magic
        file.write_all(INDEX_MAGIC)?;

        // Write version
        file.write_all(&[INDEX_VERSION])?;

        // Write entry count
        let entries = self.entries.read();
        let count = entries.len() as u64;
        file.write_all(&count.to_le_bytes())?;

        // Write entries
        for ((branch, sequence), offset) in entries.iter() {
            file.write_all(&branch.0.to_le_bytes())?;
            file.write_all(&sequence.0.to_le_bytes())?;
            file.write_all(&offset.to_le_bytes())?;
        }

        // Write ID index
        let id_to_offset = self.id_to_offset.read();
        let id_count = id_to_offset.len() as u64;
        file.write_all(&id_count.to_le_bytes())?;

        for (id, offset) in id_to_offset.iter() {
            file.write_all(&id.0.to_le_bytes())?;
            file.write_all(&offset.to_le_bytes())?;
        }

        // Write type index
        let type_index = self.type_index.read();
        let type_count = type_index.len() as u64;
        file.write_all(&type_count.to_le_bytes())?;

        for (record_type, ids) in type_index.iter() {
            let type_bytes = record_type.as_bytes();
            file.write_all(&(type_bytes.len() as u16).to_le_bytes())?;
            file.write_all(type_bytes)?;
            file.write_all(&(ids.len() as u64).to_le_bytes())?;
            for id in ids {
                file.write_all(&id.0.to_le_bytes())?;
            }
        }

        file.sync_all()?;
        Ok(())
    }

    /// Load index from file.
    fn load_from_file(&mut self) -> Result<()> {
        let mut file = File::open(&self.path)?;

        // Read magic
        let mut magic = [0u8; 4];
        file.read_exact(&mut magic)?;
        if &magic != INDEX_MAGIC {
            return Err(StoreError::InvalidFormat("Invalid index magic".into()));
        }

        // Read version
        let mut version = [0u8; 1];
        file.read_exact(&mut version)?;
        if version[0] != INDEX_VERSION {
            return Err(StoreError::InvalidFormat(format!(
                "Unsupported index version: {}",
                version[0]
            )));
        }

        // Read entry count
        let mut count_bytes = [0u8; 8];
        file.read_exact(&mut count_bytes)?;
        let count = u64::from_le_bytes(count_bytes) as usize;

        // Read entries
        let mut entries = self.entries.write();
        for _ in 0..count {
            let mut branch_bytes = [0u8; 8];
            file.read_exact(&mut branch_bytes)?;
            let branch = BranchId(u64::from_le_bytes(branch_bytes));

            let mut seq_bytes = [0u8; 8];
            file.read_exact(&mut seq_bytes)?;
            let sequence = Sequence(u64::from_le_bytes(seq_bytes));

            let mut offset_bytes = [0u8; 8];
            file.read_exact(&mut offset_bytes)?;
            let offset = u64::from_le_bytes(offset_bytes);

            entries.insert((branch, sequence), offset);
        }
        drop(entries);

        // Read ID index
        let mut id_count_bytes = [0u8; 8];
        file.read_exact(&mut id_count_bytes)?;
        let id_count = u64::from_le_bytes(id_count_bytes) as usize;

        let mut id_to_offset = self.id_to_offset.write();
        for _ in 0..id_count {
            let mut id_bytes = [0u8; 8];
            file.read_exact(&mut id_bytes)?;
            let id = RecordId(u64::from_le_bytes(id_bytes));

            let mut offset_bytes = [0u8; 8];
            file.read_exact(&mut offset_bytes)?;
            let offset = u64::from_le_bytes(offset_bytes);

            id_to_offset.insert(id, offset);
        }
        drop(id_to_offset);

        // Read type index
        let mut type_count_bytes = [0u8; 8];
        file.read_exact(&mut type_count_bytes)?;
        let type_count = u64::from_le_bytes(type_count_bytes) as usize;

        let mut type_index = self.type_index.write();
        for _ in 0..type_count {
            let mut type_len_bytes = [0u8; 2];
            file.read_exact(&mut type_len_bytes)?;
            let type_len = u16::from_le_bytes(type_len_bytes) as usize;

            let mut type_bytes = vec![0u8; type_len];
            file.read_exact(&mut type_bytes)?;
            let record_type = String::from_utf8_lossy(&type_bytes).into_owned();

            let mut ids_count_bytes = [0u8; 8];
            file.read_exact(&mut ids_count_bytes)?;
            let ids_count = u64::from_le_bytes(ids_count_bytes) as usize;

            let mut ids = Vec::with_capacity(ids_count);
            for _ in 0..ids_count {
                let mut id_bytes = [0u8; 8];
                file.read_exact(&mut id_bytes)?;
                ids.push(RecordId(u64::from_le_bytes(id_bytes)));
            }

            type_index.insert(record_type, ids);
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_add_and_lookup() {
        let dir = TempDir::new().unwrap();
        let index = RecordIndex::new(dir.path().join("index.bin")).unwrap();

        let id = RecordId(1);
        let branch = BranchId(1);
        let seq = Sequence(1);

        index.add(id, branch, seq, 0, "test", &[], &[]);

        assert_eq!(index.get_offset(branch, seq), Some(0));
        assert_eq!(index.get_offset_by_id(id), Some(0));
    }

    #[test]
    fn test_type_index() {
        let dir = TempDir::new().unwrap();
        let index = RecordIndex::new(dir.path().join("index.bin")).unwrap();

        let branch = BranchId(1);

        index.add(RecordId(1), branch, Sequence(1), 0, "message", &[], &[]);
        index.add(RecordId(2), branch, Sequence(2), 100, "message", &[], &[]);
        index.add(RecordId(3), branch, Sequence(3), 200, "code", &[], &[]);

        let messages = index.get_by_type("message");
        assert_eq!(messages.len(), 2);

        let code = index.get_by_type("code");
        assert_eq!(code.len(), 1);
    }

    #[test]
    fn test_caused_by_index() {
        let dir = TempDir::new().unwrap();
        let index = RecordIndex::new(dir.path().join("index.bin")).unwrap();

        let branch = BranchId(1);
        let cause = RecordId(1);

        index.add(cause, branch, Sequence(1), 0, "cause", &[], &[]);
        index.add(
            RecordId(2),
            branch,
            Sequence(2),
            100,
            "effect",
            &[cause],
            &[],
        );
        index.add(
            RecordId(3),
            branch,
            Sequence(3),
            200,
            "effect",
            &[cause],
            &[],
        );

        let effects = index.get_caused_by(cause);
        assert_eq!(effects.len(), 2);
    }

    #[test]
    fn test_save_and_load() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("index.bin");

        // Create and save
        {
            let index = RecordIndex::new(&path).unwrap();
            let branch = BranchId(1);

            index.add(RecordId(1), branch, Sequence(1), 0, "test", &[], &[]);
            index.add(RecordId(2), branch, Sequence(2), 100, "test", &[], &[]);

            index.save().unwrap();
        }

        // Load and verify
        {
            let index = RecordIndex::load(&path).unwrap();

            assert_eq!(index.get_offset(BranchId(1), Sequence(1)), Some(0));
            assert_eq!(index.get_offset(BranchId(1), Sequence(2)), Some(100));
            assert_eq!(index.get_by_type("test").len(), 2);
        }
    }
}
