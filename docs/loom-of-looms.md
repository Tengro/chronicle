# Loom of Looms: Algebraic Specification (v2)

## Problem Statement

We want to construct a system where:
1. A **loom** is a branching event-sourced structure (like git for data)
2. An **inner loom** can be embedded within an **outer loom**
3. All mutations to the inner loom are observable as events in the outer loom
4. Query and reconstruction operations remain efficient (not O(n) full replay)
5. The construction is recursive (looms within looms within looms)
6. **Time travel**: "inner loom state at outer sequence S" is well-defined

---

## 1. Definition: Loom

A **Loom** L is a tuple:

```
L = (R, B, σ, →, ⊲)
```

Where:
- **R** is a set of records
- **B** is a set of branches
- **σ : B → ℕ** maps each branch to its head sequence
- **→ : B ⇀ B** is a partial function mapping branches to their parent (forms a forest)
- **⊲ : B ⇀ ℕ** is a partial function giving the branch point sequence

### 1.1 Record

A record r ∈ R is a tuple:

```
r = (id, seq, b, τ, π, caused, linked, t)
```

Where:
- `id ∈ ID` — unique identifier
- `seq ∈ ℕ` — sequence number within branch
- `b ∈ B` — branch this record belongs to
- `τ ∈ Type` — record type
- `π ∈ Payload` — payload data
- `caused ⊆ ID` — set of records that caused this one (hard references)
- `linked ⊆ ID` — set of related records (soft references)
- `t ∈ Timestamp` — creation time

### 1.2 Branch

A branch b ∈ B is characterized by:
- `par(b) = →(b)` — parent branch (undefined for roots)
- `bp(b) = ⊲(b)` — branch point sequence (undefined for roots)

### 1.3 Invariants

**Contiguity:** For each branch b, local records have sequences exactly `(bp(b)+1)..σ(b)`,
or `1..σ(b)` for root branches.

**Fork validity:** If `par(b)` defined, then `0 ≤ bp(b) ≤ σ(par(b))` and `σ(b) ≥ bp(b)`.

**Parent forest:** `→` is acyclic (forms a forest), and `⊲` defined iff `→` defined.

---

## 2. Visibility (Corrected)

### 2.1 Definition

Records visible on branch b up to sequence n:

```
Visible(b, n) = LocalRecords(b, n) ∪ InheritedRecords(b, n)
```

Where:

```
LocalRecords(b, n) = { r ∈ R | r.b = b ∧ bp(b) < r.seq ≤ n }

InheritedRecords(b, n) =
  | Visible(par(b), min(n, bp(b)))   if par(b) defined
  | ∅                                 otherwise
```

**Key fix:** Using `min(n, bp(b))` prevents over-inclusion when `n < bp(b)`.

### 2.2 Query Operations

**(A) Full reconstruction set** — everything needed to reconstruct state at `to`:

```
query_visible(L, b, to) = Visible(b, to)
```

**(B) Incremental delta** — new records on this branch between `from` and `to`:

```
query_Δ(L, b, from, to) = { r ∈ R | r.b = b ∧ from < r.seq ≤ to }
```

This separation enables:
- **Cold start**: fold over `query_visible(L, b, to)` in causal order
- **Warm start**: fold over `query_Δ(L, b, from, to)` from cached state

---

## 3. Mutation Operations

**Append**: Add record to branch
```
append : L × B × Record → L
append(L, b, r) = L' where
  r.seq = σ(b) + 1
  r.b = b
  R' = R ∪ {r}
  σ'(b) = r.seq
```

**Branch**: Create new branch from existing
```
branch : L × Name × B × ℕ → L
branch(L, name, parent, at) = L' where
  b' = fresh branch with name
  B' = B ∪ {b'}
  →'(b') = parent
  ⊲'(b') = at
  σ'(b') = at
```

---

## 4. Checkpoints (Efficient Reconstruction)

### 4.1 Checkpoint Record Type

A checkpoint at branch b, sequence n:
```
checkpoint = (id, n, b, τ="checkpoint", π={stateDigest, blobRef}, ...)
```

### 4.2 Fast Reconstruction

```
reconstruct(L, b, n) = fold(query_Δ(L, b, n₀, n), load(blobRef))
```

Where `(n₀, blobRef)` is the latest checkpoint with `n₀ ≤ n`.

**Complexity:** O(log #checkpoints) + O(k) for delta since checkpoint.

### 4.3 Checkpoint Index

```
checkpoint_index : BTreeMap<(BranchId, Sequence), BlobRef>
```

---

## 5. Loom Embedding

### 5.1 Namespace Function

Define namespace as a **path** (not string) to avoid encoding collisions:

```
Path = List<LoomID>

ns : Path × Name → Name
ns(p, name) = (p, name)  -- structured, not string concat
```

Composition law:
```
ns(p₁, ns(p₂, name)) = ns(p₁ ++ p₂, name)
```

Serialization to strings is an implementation detail.

### 5.2 ID Embedding

To handle potential ID collisions across independent looms, define:

```
φ_ID : ID_inner → ID_outer
```

**Option 1: Global uniqueness by construction**
- Use UUIDv7 / ULID / content-hash
- Then `φ_ID = identity`

**Option 2: Namespace IDs**
```
φ_ID(id) = (ℓ, id)  -- tuple of loom path and local id
```

### 5.3 Branch Embedding

```
φ_B : B_inner → B_outer
φ_B(b) = b' where b'.name = ns(ℓ, b.name)
```

### 5.4 Record Embedding

```
φ_R : R_inner → R_outer
φ_R(r) = r' where
  r'.id = φ_ID(r.id)
  r'.b = φ_B(r.b)
  r'.seq = r.seq           -- preserved within embedded branch
  r'.τ = r.τ
  r'.π = r.π
  r'.caused = { φ_ID(x) | x ∈ r.caused }
  r'.linked = { φ_ID(x) | x ∈ r.linked }
```

### 5.5 Homomorphism Property

Operations commute through φ:

```
φ(append(L_i, b, r)) = append(φ(L_i), φ_B(b), φ_R(r))
φ(branch(L_i, name, parent, at)) = branch(φ(L_i), ns(ℓ,name), φ_B(parent), at)
φ(query_visible(L_i, b, n)) = query_visible(φ(L_i), φ_B(b), n)
```

---

## 6. Control Log (The Critical Addition)

### 6.1 The Problem

Per-branch sequences are incomparable:
- `outer/main` has sequence 1, 2, 3, ...
- `loom:agent1/main` has sequence 1, 2, 3, ...

"Inner loom at outer sequence 5" is **undefined** without a shared timeline.

### 6.2 Solution: Control Branch

Designate a **control branch** `CTRL` (typically outer `main`).

Every inner loom mutation produces **two writes**:
1. The actual record to the namespaced embedded branch
2. An **envelope record** to `CTRL` describing what changed

### 6.3 Envelope Record Types

```
loom:append  { loom: ℓ, branch: b, seq: n, recId: φ_ID(r.id) }
loom:branch  { loom: ℓ, name: b', parent: b, at: k }
loom:merge   { loom: ℓ, into: bT, left: (b₁,n₁), right: (b₂,n₂), mergeRecId: ... }
loom:archive { loom: ℓ }
```

### 6.4 Head Tracking

Define `Heads(ℓ, s)` — the head sequence of each inner branch at outer sequence s:

```
Heads : LoomID × Sequence → (B_inner → ℕ)
```

Computed by folding envelope records on CTRL up to sequence s.

**Optimization:** Checkpoint head maps periodically for O(log n) lookup.

### 6.5 Observation at Outer Sequence

"Inner loom ℓ as of outer sequence s":

```
observe(L₀, ℓ, s) = { b ↦ query_visible(L₀, φ_B(b), Heads(ℓ,s)(b)) | b ∈ B_inner }
```

### 6.6 Key Property: Branching Outer Snapshots Inner

When we branch L₀ at CTRL sequence s:
```
branch(L₀, "experiment", main, s)
```

The new branch carries a frozen prefix of CTRL, therefore frozen `Heads(ℓ, s)` for all ℓ.

**All embedded looms are implicitly snapshotted.**

---

## 7. Efficiency Analysis

| Operation | Complexity |
|-----------|------------|
| Append to inner loom | O(1) amortized (2 writes) |
| Query inner branch by seq range | O(log n + k) via BTreeMap |
| Observe inner loom at outer seq s | O(log n) for Heads + O(k) per branch |
| Reconstruct state with checkpoints | O(log c) + O(δ) where c=#checkpoints, δ=delta size |
| Branch outer (snapshot all inner) | O(1) — just branch CTRL |

The control log adds O(1) overhead per mutation but enables O(log n) time travel.

---

## 8. Recursive Embedding

### 8.1 Nested Looms

A loom L₀ contains L₁, which contains L₁₁:

```
L₀
├── CTRL (main)
│   ├── loom:append { loom: "L₁", ... }
│   ├── loom:append { loom: "L₁", ... }  -- this is L₁ appending to L₁₁
│   └── ...
├── loom:L₁/CTRL
│   ├── loom:append { loom: "L₁₁", ... }
│   └── ...
├── loom:L₁/main
├── loom:L₁/loom:L₁₁/main
└── ...
```

### 8.2 Path Composition

```
ns(["L₁"], ns(["L₁₁"], "main")) = ns(["L₁", "L₁₁"], "main")
```

Observation composes:
```
observe(L₀, ["L₁", "L₁₁"], s) =
  let s₁ = Heads(L₀, "L₁", s)(CTRL)
  in observe(subview(L₀, "L₁"), "L₁₁", s₁)
```

---

## 9. Cross-Loom References

Records in one loom can reference records in another via `linked`:

```
r₁ ∈ L₁, r₂ ∈ L₂
r₁.linked = { φ_ID(r₂.id) }  -- fully qualified ID
```

Since both are embedded in L₀, references are just outer record IDs.

**Semantics:**
- `caused` = hard reference (implies causal dependency, affects GC reachability)
- `linked` = soft reference (informational, does not prevent GC of target)

---

## 10. Garbage Collection

### 10.1 Tier A: Logical GC (Tombstone)

```
append(CTRL, loom:archive { loom: ℓ })
```

Readers treat ℓ as inactive. No storage reclaimed yet.

### 10.2 Tier B: Storage GC (Reachability)

Define **roots**:
- All current branch heads (for non-archived looms)
- All pinned checkpoints
- Policy-pinned records (audit/legal)

**Live set** = transitive closure over:
- Parent visibility (branch ancestry)
- `caused` edges (hard dependencies)
- Optionally `linked` edges (policy choice)

Delete or archive non-live records.

### 10.3 Tier C: Compaction GC

For archived looms that must remain readable but not fully replayable:
- Generate final checkpoint per branch
- Keep checkpoint + minimal metadata
- Delete historical records

Works cleanly because each loom is namespace-isolated.

---

## 11. Merge

### 11.1 Merge Operator

```
merge : L × B × B × Resolver → L
```

Creates a merge record m on target branch:
```
m.caused = { head(bL), head(bR) }
m.π = resolver_output
```

### 11.2 Homomorphism Extension

```
φ(merge(L_i, bL, bR, res)) = merge(φ(L_i), φ_B(bL), φ_B(bR), res)
```

Plus envelope on CTRL:
```
loom:merge { loom: ℓ, into: bT, left: ..., right: ... }
```

---

## 12. Permissions

### 12.1 Path-Scoped ACL

```
canRead : Subject × Path → Bool
canWrite : Subject × Path → Bool
```

ACL updates are records on CTRL:
```
acl:grant  { path: p, subject: u, rights: [read, write] }
acl:revoke { path: p, subject: u }
```

ACL state reconstructed from CTRL (with checkpoints).

### 12.2 Cryptographic Isolation (Optional)

Encrypt payloads for defense-in-depth:
- Branch names may remain visible
- Record metadata may leak unless also encrypted

---

## 13. Distributed Sync

### 13.1 DAG Anti-Entropy Protocol

1. Exchange known branch heads: `(branchName → σ(branch))`
2. Request missing records by `(branch, seq range)` or by ID
3. Apply idempotently, update indexes

### 13.2 Multi-Writer CTRL

Options:
- One writer per CTRL (like git remotes), then merge
- CRDT-based CTRL log (more complex)

### 13.3 Loom-Scoped Sync

Replicate only branches under `ns(p, *)` — filters by path prefix.

Syncing outer loom syncs all embedded looms automatically.

---

## 14. Summary: Minimal Extension

To make the loom-of-looms construction correct and efficient, add:

1. **Corrected visibility** using `min(n, bp(b))`
2. **ID embedding** (global uniqueness or namespacing)
3. **Control-log envelopes** on CTRL branch
4. **Heads(ℓ, s)** function for time travel
5. **Checkpoints** for O(δ) reconstruction

Everything else (GC, merge, permissions, sync) becomes policy + record types.

---

## 15. Implementation Mapping

```
Chronicle Concept        →  Loom Algebra
──────────────────────────────────────────
JsStore                  →  Loom L
Branch                   →  b ∈ B
Record                   →  r ∈ R
query() with reverse     →  query_visible / query_Δ
createBranch()           →  branch(L, name, parent, at)
appendJson()             →  append(L, b, r)
BTreeMap index           →  O(log n + k) queries
Branch namespacing       →  φ_B with ns(path, name)
State with AppendLog     →  Envelope records on CTRL
getStateAt()             →  observe(L₀, ℓ, s)
```
