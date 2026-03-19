# OriginDefender Architecture

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Users/Founders                             │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  Frontend (bags.fm + OriginDefender UI)               │
│  • Narrative input form                                                │
│  • Bond calculator (2–5 SOL)                                          │
│  • Backer verification button                                         │
│  • Badge display (Origin/Derivative/Suspected Vamp)                  │
│  • Oracle dashboard                                                   │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
                                │ (1) Check derivative via API
                                │ (2) Register narrative (CPI)
                                │ (3) Transfer bond to PDA
                                │ (4) Call bags.fm create instruction
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                 Off-Chain Services (FastAPI)                           │
│  • Narrative Similarity API                                            │
│    - Text → 384-dim embedding (sentence-transformers)                 │
│    - FAISS/pgvector nearest neighbor search                          │
│    - Returns (is_derivative, origin_mint, similarity)                │
│  • Backer Verification Server                                          │
│    - OAuth 1.0a with Twitter, OAuth2 with Discord                    │
│    - Ed25519 JWT signing                                              │
│    - Redis nonce cache                                                │
│  • bags.fm Indexer                                                    │
│    - Subscribe to bags.fm program logs (Create, Trade)              │
│    - Fetch BondingCurveAccount PDA state                             │
│    - Maintain PostgreSQL cache (narratives, metrics, liquidity)     │
│  • Public API                                                          │
│    - GET /metrics/{mint} – combined badge + metrics                  │
│    - GET /feed?sort=visibility – ranked discovery feed              │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
                                │ (5) CPI instructions
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Solana Blockchain                                  │
│  ┌────────────────────────────────────────────────────────────┐       │
│  │ OriginDefender Program (immutable)                         │       │
│  │                                                             │       │
│  │  PDAs:                                                     │       │
│  │  • NarrativeRecord [b"narrative", mint]                    │       │
│  │  • NarrativeBond [b"bond", mint]                           │       │
│  │  • BackerRecord [b"backer", wallet, mint]                  │       │
│  │  • OracleRecord [b"oracle", wallet, index]                 │       │
│  │  • VestingAccount [b"vesting", mint] (optional)            │       │
│  │  • GlobalState [b"global"]                                 │       │
│  └────────────────────────────────────────────────────────────┘       │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐       │
│  │ bags.fm Program (immutable, unmodified)                   │       │
│  │                                                             │       │
│  │  PDAs:                                                     │       │
│  │  • Global config [b"global"]                               │       │
│  │  • Bag [b"bag", mint]                                      │       │
│  │  • BondingCurve [b"bonding-curve", bag]                   │       │
│  │  • Metadata (Metaplex standard)                            │       │
│  │  • Creator vault [b"creator-vault", creator] (optional)   │       │
│  └────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                │ (6) On-chain events
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  Discovery Feed (bags.fm UI or custom)                │
│  • Visibility score = base × (1+origin_bonus) × backer_mult × liq_mult │
│  • Badges: Origin / Derivative / Suspected Vamp                       │
│  • Metrics: backer_density, bond_amount, suspicion_index, real_sol    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Token Launch Flow (bags.fm)

```
Founder generates mint keypair and prepares narrative JSON
   │
   ▼
Frontend calls /check_derivative API
   ├─ If unique (similarity < 0.85): suggest bond amount, enable "Create Token"
   └─ If derivative: show warning, origin_badge will be false; founder can still proceed
   │
   ▼
Founder approves bond transfer (2–5 SOL) to OriginDefender Bond PDA
   │
   ▼
Founder calls register_narrative(mint, narrative_hash, bond_amount)
   └─ NarrativeRecord created (origin_badge set based on similarity)
   │
   ▼
Frontend calls bags.fm `create_bag` instruction with same mint
   └─ Bag, token mint, and bonding curve PDAs created on-chain
   │
   ▼
Indexer sees bags.fm Create event → marks NarrativeRecord.is_active = true
   and stores bonding_curve PDA for liquidity metrics
   │
   ▼
Token appears in discovery feed with Origin/Derivative badge and metrics
```

### 2. Early Backer Flow

```
User buys token → Sees "Verify as Early Backer" (if within first 100) →
  Clicks → OAuth flow (Twitter/Discord) → Backend issues JWT →
  Frontend calls record_verified_backer(JWT) → BackerRecord PDA created →
  Indexer tracks count per token

Off-chain bot: When token reaches 100 verified backers, calls mark_early_backers
  to set is_early_backer = true for first 100 by timestamp

Metrics updated in NarrativeRecord (backer_count, backer_density)
```

### 3. Derivative Detection Flow

```
New token registers → NarrativeRecord created with similar_to = None →
  Oracle or any user can call verify_derivative (off-chain similarity check) →
  If similarity > 0.85, they call verify_derivative instruction with similarity score →
  New token's similar_to set, origin_badge = false

If suspicion_index becomes high (vamp patterns), oracles can slash bond
```

### 4. Vesting Release Flow

```
After cliff (90 days) → Founder calls release_vested →
  Program calculates vested_amount = total × (elapsed - cliff) / duration →
  Transfers tokens from Vesting PDA to founder's destination account →
  Emits event

If rug detected (oracle vote), remaining locked tokens can be burned or redistributed
  via separate instruction (not implemented here; could be part of slash_bond)
```

## State Storage Layout

All accounts are PDAs (no rent-exempt balances held by users). This minimizes rent costs and simplifies recovery.

### GlobalState (PDA seeds: [b"global"])

```
Offset  Type    Field
0       8       discriminator (anchor)
8       Pubkey  authority
40      1       initialized (bool)
41      4       narrative_count (u32)
45      4       oracle_count (u32)
49      2       fee_basis_points (u16)
51      4       next_oracle_index (u32)
55      ?       padding to 8-byte boundary
Total: 64 bytes (8+56)
```

### NarrativeRecord (PDA seeds: [b"narrative", mint])

```
Offset  Type            Field
0       8               discriminator
8       Pubkey          mint
40      Pubkey          creator
72      [u8; 32]        narrative_hash
104     Option<[u8;16]> embedding_minhash (128 bits)  -> stored as fixed array with Option flag?
... parse carefully
```

Let's compute:

- mint: 32 bytes (Pubkey)
- creator: 32 bytes (Pubkey)
- narrative_hash: 32 bytes
- embedding_minhash: 16 bytes (Option means we use a separate bool or discriminant; for simplicity we store [u8;16] always, zero if unused)
- registered_at: 8 bytes (i64)
- lock_amount: 8 bytes (u64)
- lock_duration: 8 bytes (i64)
- narrative_bond: 8 bytes (u64)
- origin_badge: 1 byte (bool)
- similar_to: Option<Pubkey> = 1 byte discriminant + 32 bytes if Some, but we can store Pubkey with zero if None
- backer_count: 4 bytes (u32)
- backer_density: 4 bytes (f32)
- suspicion_index: 4 bytes (f32)
- is_active: 1 byte (bool)

We need to align to 8 bytes. Let's compute raw size without discriminator (8 bytes already accounted):

- mint (32) + creator (32) = 64
- narrative_hash (32) = 96
- embedding_minhash (16) = 112
- registered_at (8) = 120
- lock_amount (8) = 128
- lock_duration (8) = 136
- narrative_bond (8) = 144
- origin_badge (1) = 145
- similar_to: store as [u8;32] + 1 byte flag = 33 -> 178
- backer_count (4) = 182
- backer_density (4) = 186
- suspicion_index (4) = 190
- is_active (1) = 191

Plus padding to multiple of 8: 192. Anchor adds 8 byte discriminator before -> total 200 bytes. That's acceptable.

### VestingAccount (PDA seeds: [b"vesting", mint])

- mint (32)
- beneficiary (32)
- authority (32)
- start_timestamp (8)
- cliff (8)
- duration (8)
- total_amount (8)
- released_amount (8)

Total without discriminator: 32*3 + 8*4 = 96+32 = 128 -> aligned. With discriminator: 136 bytes.

### BackerRecord (PDA seeds: [b"backer", wallet, mint])

- wallet (32)
- token_mint (32)
- social_platform (1)
- social_handle (String → 4-byte length + bytes)
- follower_count (4)
- verified_at (8)
- is_early_backer (1)

Let's compute base: 32+32=64; +1=65; +4=69; +8=77; +1=78. Pad to 8: 80. Without discriminator. With discriminator: 88 + string length. Maximum assumed 50 bytes social_handle → 4+50 = 54, so total 80+54 = 134, then anchor aligns to 8? Actually Anchor aligns to 8, so we need to account. We'll simply use `#[account]` and let Anchor compute.

### OracleRecord (PDA seeds: [b"oracle", wallet, index])

- wallet (32)
- origin_token (32)
- added_at (8)
- is_active (1)
- total_fees_earned (8)

Total: 32+32=64; +8=72; +1=73; +8=81; pad to 8: 88. With discriminator: 96 bytes.

### NarrativeBond (PDA seeds: [b"bond", mint])

- mint (32)
- creator (32)
- amount (8)
- posted_at (8)
- slash_percentage (1)
- is_slashed (1)

Total: 32+32=64; +8=72; +8=80; +1=81; +1=82; pad to 8: 88. With discriminator: 96 bytes.

## Security Considerations

1. **Narrative Hash is Commit-Only:** The hash is computed off-chain and stored. The off-chain similarity service is trusted to be accurate. If the service is compromised, it could mis-flag derivatives. Oracle review mitigates this — final decision is on-chain via oracles.

2. **Vesting Authority is PDA:** Only the vesting PDA itself (program) can transfer tokens after cliff, not the founder. This prevents premature withdrawal.

3. **Bond Account Uses System Program:** Lamports are transferred to a PDA controlled by this program. Slashing is only possible via `slash_bond` instruction, which requires an oracle signer (or admin in early stages).

4. **Backer Verification JWT:** The JWT is signed by off-chain service with a private key whose public key is stored in GlobalState. The on-chain program can optionally verify the JWT signature (currently skipped for simplicity but should be added). Replay attacks prevented by nonce in Redis.

5. **Oracle Authority:** Only oracles can slash bonds. Initially, the admin adds oracles. After sufficient decentralization, admin role can be removed and governance transitioned to DAO.

6. **Similarity Threshold Tunable:** Currently hard-coded to 0.85. Could be made configurable in GlobalState.

## Performance

- **NarrativeRegistration:** ~200k CU (mostly CPI to system program for account creation)
- **LockBondedLiquidity:** ~300k CU (including token transfer CPI)
- **RecordVerifiedBacker:** ~150k CU
- **SlashBond:** ~250k CU

Total ~900k CU per full token launch, within typical transaction limits.

## Indexing Strategy

Off-chain indexer listens to program events:

- `NarrativeRegistered` → insert/update NarrativeRecord in PostgreSQL
- `BackerVerified` → increment backer count in cache
- `LiquidityLocked` → update lock metrics
- `BondSlashed` → update narrative bond status

The indexer also:
- Periodically queries on-chain for BackerRecord count per token to compute backer density
- Fetches token metadata (metadata program) for images/names
- Serves API endpoints for similarity checking and discovery feed

## Upgradeability

This program is **not upgradeable** by design. To change logic, must deploy new program ID and migrate accounts via a manual process. This aligns with security — the rules should be stable.

If governance later wants upgradeability, can use Anchor's upgrade authority (loader program), but that requires a trusted upgrade authority. Better to keep immutable and use new PDAs for new versions.

---
