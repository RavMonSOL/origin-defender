# OriginDefender — Project Overview

## Executive Summary

**Problem Statement:** The current bags.fm ecosystem suffers from rampant token vampirism. Multiple groups launch identical tokens targeting the same narrative (animals, Elon, Trump, trending news), causing liquidity fragmentation, user confusion, and negative-sum economic outcomes. Speed of scripting, not quality, determines "winner."

**Solution:** A three-layer system combining narrative fingerprinting, bonded liquidity requirements, and social proof verification. This makes vamping economically irrational while preserving permissionless innovation for genuinely differentiated projects.

**Key Innovation:** Instead of preventing launches, we **price the externality**. Vamp groups impose costs on the ecosystem (fragmented liquidity, reputational damage). Our bonding + visibility penalty system forces them to internalize those costs.

**Status:** Proof-of-concept ready for devnet testing. Full mainnet deployment requires platform integration.

---

## 1. Detailed Problem Analysis

### 1.1 The Vampire Playbook

1. Monitor bags.fm trending/promising tokens
2. Identify successful narrative (e.g., "Pepe the Frog" variant, "Elon Musk on Mars")
3. Within 30 minutes, deploy identical token with same name/concept
4. Use bot network to appear as #1 trending, siphon search traffic
5. Dump on retail investors who can't differentiate

**Success Rate:** ~10% of vamps capture >50% of original's liquidity. The rest dilute the narrative pool.

### 1.2 Current Platform Failures

- **No provenance tracking:** Token name is not a unique identifier; anyone can copy
- **Zero barrier to cloning:** No commitment required; launch-and-dump is free
- **Discovery algorithm blind:** Cannot distinguish origin from clone
- **No social proof:** Can't see which token has real community

Result: **Race to the bottom** on quality; **winner-takes-script-speed**.

---

## 2. Solution Architecture

### 2.1 Core Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         OriginDefender System                           │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────────────┤
│   Narrative │  Bonded     │  Early      │  Oracle     │  Discovery      │
│ Registry    │  Liquidity  │  Backer     │  DAO        │  Penalty        │
│             │  Vesting    │  Verification│             │  Algorithm      │
├─────────────┼─────────────┼─────────────┼─────────────┼─────────────────┤
│ On-chain    │ On-chain    │ Off-chain   │ On-chain    │ Frontend/API    │
│ SHA256/Minhash│ Vesting   │ OAuth + JWT │ Multisig    │ Visibility Score│
│ Embedding   │ Contract    │ Verification│ Governance  │ Sorting         │
│ Model       │             │             │             │                 │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────────┘
```

### 2.2 Narrative Fingerprinting

**Goal:** Create a machine-readable signature of a token's unique story, not just its name.

**Process:**

1. Token founder submits narrative JSON (mission, lore, tokenomics, differentiators) to OriginDefender frontend
2. Frontend uses `sentence-transformers/all-MiniLM-L6-v2` (or OpenAI embeddings) to convert text to 384-dim vector
3. Compute **cosine similarity** against all existing narrative vectors in registry
4. If max similarity > 0.85 (threshold tunable), flag as **Derivative** and return origin token's Pubkey
5. If no match, compute SHA256 of the vector (or use MinHash for fuzzy matching) and commit to on-chain registry

**Storage on-chain:**

```rust
pub struct NarrativeRecord {
    pub mint: Pubkey,              // Token mint address
    pub creator: Pubkey,           // Founder's wallet
    pub narrative_hash: [u8; 32],  // SHA256 of embedding vector
    pub embedding_minhash: [u8; 16], // Optional: MinHash sketch for faster lookup
    pub registered_at: i64,        // Timestamp
    pub lock_amount: u64,          // SOL lamports locked in vesting
    pub lock_duration: i64,        // Days (90 min)
    pub origin_badge: bool,        // True if first of narrative cluster
    pub narrative_bond: u64,       // SOL bonded, slashable if derivatives proliferate
}
```

**Similarity Detection as a Service:** Provides `check_derivative(narrative_text: String) -> Option<(Pubkey, f32)>`

### 2.3 Bonded Liquidity + Vesting

**Requirement:** At token launch, founder must lock **X%** of total supply in a vesting contract for **90 days minimum**.

**Calculation:**

```javascript
function calculate_lock_percentage(targetMCapUSD) {
  if (targetMCap < 100_000) return 20;
  if (targetMCap < 500_000) return 30;
  if (targetMCap < 2_000_000) return 40;
  return 50;
}
```

**Implementation:**

- Founders call `lock_bonded_liquidity(mint, amount, cliff_days, total_duration)`
- Creates a vesting account (PDA) with:
  - `mint` authority = OriginDefender program
  - ` beneficiary` = founder's wallet
  - `start_timestamp` = block timestamp
  - `cliff` = 90 days (no release before)
  - `duration` = 180 days (linear vesting after cliff)
- If rug detected (token paused, liquidity removed, or oracle vote), remaining locked tokens are:
  - Burned (50%) and redistributed to holders (50%) via airdrop
  - Or burned entirely (configurable by governance)

**Why this stops vamps:** They want to launch and dump within hours/days. Locking 10% of supply for 90 days means they can't rug-pull quickly. They'd lose their own capital.

### 2.4 Early Backer Verification

**Goal:** Create an on-chain list of the first legitimate community members, making it hard to fake organic launch.

**Process:**

1. User buys token on bags.fm (or any DEX)
2. Within first 100 buys, they see "Verify as Early Backer" button
3. They authenticate via Twitter OAuth 2.0 or Discord OAuth2
4. Verification server (hosted by OriginDefender) issues signed JWT containing:
   - `wallet_address`
   - `social_handle`
   - `follower_count`
   - `account_age_days`
   - `verification_timestamp`
5. User submits JWT to `record_verified_backer()` instruction on-chain
6. Program verifies JWT signature, checks that wallet hasn't already recorded, stores in `BackerRecord` PDA

**BackerRecord structure:**

```rust
pub struct BackerRecord {
    pub wallet: Pubkey,
    pub token_mint: Pubkey,
    pub social_platform: u8, // 0=Twitter, 1=Discord
    pub social_handle: String, // max 50 bytes
    pub follower_count: u32,
    pub verified_at: i64,
    pub is_early_backer: bool, // true if among first 100
}
```

**Metrics derived:**

- `backer_density = unique_verified_backers / total_unique_holders`
- `backer_genesis_block` — first 100 backers' wallet addresses are publicly visible
- `backer_cluster_score` — statistical test (IP clustering, timing correlation) to detect fake backers

**Detection heuristics:**

- If >60% of backers verify within 5 minutes of each other → suspicious
- If backers have follower ratios <1:10 (followers:following) and <50 average likes per post → likely fake/purchased
- If same /16 subnet appears for >30% of backers → coordinated

These are scored and aggregated into `suspicion_index` (0.0 to 1.0). Tokens with >0.8 get "Suspected Vamp" badge.

### 2.5 Narrative Bond DAO (Shared Responsibility)

**Concept:** If your narrative spawns multiple harmful derivatives, you share blame for polluting the narrative space.

**Mechanics:**

- At registration, founders can optionally post a **Narrative Bond** (1 SOL) that gets locked in a separate PDA
- Bond is **slashed** if:
  - More than 3 derivatives with >85% narrative similarity appear within 14 days
  - AND at least one of those derivatives turns out to be a rug (pump and dump confirmed by oracle vote)
- Slash percentage:
  - 20% if derivative liquidity >30% of origin's
  - 50% if derivative liquidity >60%
  - 100% if origin team participates in derivative (proven via on-chain analysis)
- Bond is **returned** after 90 days if narrative remains "clean" (derivatives <30% liquidity share)

**Why this matters:** Original founders now have skin in the game to protect their narrative space. They may:
- Differentiate their token more aggressively (unique tokenomics)
- Help derivatives become genuinely different (guided innovation)
- Call out vamps publicly to protect their bond

**DAO Governance:**

- Oracle multisig controls narrative bond slashing
- Oracles are elected from top origin projects (6+ months, no rugs)
- Requires 2/3 quorum + simple majority to slash
- Oracle fees paid from new token bonding fees (0.1% of each lock)

### 2.6 Multi-Sig Narrative Oracle

**Purpose:** Decentralized dispute resolution and derivative flagging.

**Selection Criteria:**

- Must control an `Origin` badge token with >6 months continuous operation
- No rug incidents in their project
- Minimum reputation score (backer density >20%, narrative bond posted)
- Elected by existing oracles (2/3 approval)

**Responsibilities:**

- Review newly registered narratives within 48 hours
- Vote `Certify` or `Flag Derivative`
- Escalate false positives to community vote
- Execute slashing of narrative bonds (when warranted)

**Incentives:**

- Earn 0.1% of each new token's bonded liquidity (proportional to participation)
- Reputation as "taste-makers" in the ecosystem
- Influence over parameter tuning via governance

**Attack resistance:**

- 2/3 supermajority required to flag an origin as derivative (makes collusion hard)
- Malicious oracle can be removed by 2/3 vote of other oracles
- Slashing of oracles' own narrative bonds if they vote fraudulently (proven by later facts)

---

## 2.7 bags.fm Integration

OriginDefender is designed to **layer on top of bags.fm** without modifying its core program. The integration happens at the **frontend** and **indexer** layers.

### Account Derivation (Official bags.fm Docs)

- **Global config PDA:** `seed = ["global"]`
- **Bag PDA:** `seed = ["bag", mint]` → stores token metadata and bonding curve pointer
- **Bonding curve PDA:** `seed = ["bonding-curve", bag]` (where `bag` is the Bag PDA)
- **Mint authority PDA:** `seed = ["mint-authority"]`

Our indexer must first resolve the Bag PDA for a given mint, then derive the bonding curve PDA from that Bag.


### Registration Flow

```text
1. Founder generates mint keypair and prepares narrative JSON.
2. Frontend calls OriginDefender /check_derivative API.
   - If unique → suggest bond amount (based on target MCap)
   - If derivative → warning, still allowed but origin_badge = false
3. Founder approves bond transfer (1 SOL) to OriginDefender bond PDA.
4. Founder calls register_narrative(mint, narrative_hash, bond_amount).
   - NarrativeRecord created (origin_badge set accordingly)
5. Frontend calls bags.fm `create_bag` instruction with the same mint.
6. Indexer sees bags.fm Create event, sets NarrativeRecord.is_active = true,
   stores bonding_curve PDA for future liquidity metrics.
7. Token appears in discovery feed with corresponding badge.
```

### Optional: Token Vesting

If founders want to show additional commitment, they can lock a portion of their **creator‑allocated tokens** (not the bonding curve tokens) using `lock_bonded_liquidity`. This creates a `VestingAccount` PDA with a 90‑day cliff. The locked tokens are separate from the bond and can be returned gradually or redistributed if the project rugs.

### Visibility Score Adaptation

For bags.fm, liquidity depth is measured by the **bonding curve's real SOL reserves**, not LP tokens. We compute:

```
liquidity_mult = min( real_sol_reserves / initial_virtual_sol, 2.0 )
```

The visibility algorithm remains the same, encouraging tokens with deep, sustainable bonding curves.

### Indexer Architecture

The indexer subscribes to two data sources:

- **OriginDefender events** – to build narrative metrics (backer counts, bonds, flags).
- **bags.fm program logs** – to detect token creation, trades, and bonding curve state changes.

It joins these datasets in PostgreSQL and serves:
- `GET /metrics/{mint}` – badge, backer density, liquidity, suspicion index.
- `GET /feed?sort=visibility` – ranked list for discovery.

The indexer also:
- Fetches the bags.fm BondingCurve PDA for each token to get `real_sol_reserves` (actual liquidity) and `complete` status
- When a token migrates (`complete == true`), it optionally tracks the PumpSwap pool for continued liquidity metrics
- Periodically writes `NarrativeRecord` updates (e.g., backer density) via the `update_narrative_metrics` instruction, ensuring on‑chain verifiability

Note: The bonding curve account does **not** store the creator field; creator is only used in PDA derivation. The indexer associates the token with its creator via the `register_narrative` instruction.

---

## 3. Smart Contract Specification

### 3.1 Program ID

```
origin_defender PROGRAM_ID: YOUR_PROGRAM_ID_HERE
```

### 3.2 Accounts

#### Global State

```rust
#[account]
pub struct GlobalState {
    pub authority: Pubkey,           // Admin (can add/remove oracles)
    pub initialized: bool,
    pub narrative_count: u32,
    pub oracle_count: u32,
    pub fee_bps: u16,               // Basis points of bonded liquidity for oracles
    pub next_oracle_index: u32,
}
```

#### Narrative Record

```rust
#[account]
pub struct NarrativeRecord {
    pub mint: Pubkey,               // Token mint address
    pub creator: Pubkey,            // Wallet of token creator
    pub narrative_hash: [u8; 32],   // SHA256 of embedding vector
    pub embedding_minhash: [u8; 16],// MinHash sketch (optional)
    pub registered_at: i64,
    pub lock_amount: u64,           // Lamports locked in vesting
    pub lock_duration: i64,         // Days
    pub narrative_bond: u64,        // Lamports bonded, slashable
    pub origin_badge: bool,         // True if first of narrative cluster
    pub similar_to: Option<Pubkey>, // If derivative, points to origin
    pub backer_count: u32,          // Verified early backers
    pub backer_density: f32,        // Scaled 0.0-1.0
    pub suspicion_index: f32,       // 0.0 (clean) to 1.0 (vamp)
    pub is_active: bool,            // Token still trading
}
```

#### Vesting Account

```rust
#[account]
pub struct VestingAccount {
    pub mint: Pubkey,
    pub beneficiary: Pubkey,
    pub authority: Pubkey,          // OriginDefender program PDA
    pub start_timestamp: i64,
    pub cliff: i64,                 // Days
    pub duration: i64,              // Days
    pub total_amount: u64,          // Total lamports to vest
    pub released_amount: u64,       // Already released
}
```

#### Backer Record

```rust
#[account]
pub struct BackerRecord {
    pub wallet: Pubkey,
    pub token_mint: Pubkey,
    pub social_platform: u8,        // 0=Twitter, 1=Discord
    pub social_handle: String,      // up to 50 bytes
    pub follower_count: u32,
    pub verified_at: i64,
    pub is_early_backer: bool,
}
```

#### Oracle Record

```rust
#[account]
pub struct OracleRecord {
    pub wallet: Pubkey,
    pub origin_token: Pubkey,       // Token they successfully launched
    pub added_at: i64,
    pub is_active: bool,
    pub total_fees_earned: u64,
}
```

#### Narrative Bond Account

```rust
#[account]
pub struct NarrativeBond {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub amount: u64,                // Lamports bonded
    pub posted_at: i64,
    pub slash_percentage: u8,       // 0-100% if slashed
    pub is_slashed: bool,
}
```

### 3.3 Instructions

#### 1. Initialize Global State

```rust
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<GlobalState>()
    )]
    pub global_state: Account<'info, GlobalState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let global = &mut ctx.accounts.global_state;
    global.authority = ctx.accounts.authority.key();
    global.initialized = true;
    global.narrative_count = 0;
    global.oracle_count = 0;
    global.fee_bps = 10; // 0.1% fee
    Ok(())
}
```

#### 2. Register Narrative

```rust
#[derive(Accounts)]
pub struct RegisterNarrative<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + std::mem::size_of::<NarrativeRecord>()
    )]
    pub narrative_record: Account<'info, NarrativeRecord>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub mint: Account<'info, Mint>,  // Token mint
    pub system_program: Program<'info, System>,
    // Optional: narrative bond account if they post bond
    /// CHECK: This is a PDA that holds the bonded SOL
    pub bond_account: UncheckedAccount<'info>,
}

pub fn register_narrative(
    ctx: Context<RegisterNarrative>,
    narrative_hash: [u8; 32],
    embedding_minhash: Option<[u8; 16]>,
    lock_amount: u64,          // lamports
    lock_duration: i64,        // days
    narrative_bond: Option<u64>, // lamports
) -> Result<()> {
    // Check if narrative already exists (similarity)
    // This would be done via off-chain service that calls this with similar_to set
    // For simplicity, we accept similar_to from caller (oracle must later flag)

    let record = &mut ctx.accounts.narrative_record;
    record.mint = ctx.accounts.mint.key();
    record.creator = ctx.accounts.creator.key();
    record.narrative_hash = narrative_hash;
    record.embedding_minhash = embedding_minhash.unwrap_or([0; 16]);
    record.registered_at = Clock::get()?.unix_timestamp;
    record.lock_amount = lock_amount;
    record.lock_duration = lock_duration;
    record.narrative_bond = narrative_bond.unwrap_or(0);
    record.origin_badge = true; // Assume origin until proven derivative
    record.similar_to = None;
    record.backer_count = 0;
    record.backer_density = 0.0;
    record.suspicion_index = 0.0;
    record.is_active = true;

    // Create vesting account if lock_amount > 0
    if lock_amount > 0 {
        // ... create vesting PDA with lock logic
    }

    // Transfer bonded SOL from creator to bond_account PDA if narrative_bond > 0
    if narrative_bond.unwrap_or(0) > 0 {
        let _bond_amount = narrative_bond.unwrap();
        // Transfer lamports from creator to bond_account
    }

    emit!(NarrativeRegistered {
        mint: record.mint,
        creator: record.creator,
        timestamp: record.registered_at,
        lock_amount,
        bond_amount: record.narrative_bond,
    });

    Ok(())
}
```

#### 3. Verify Derivative

```rust
#[derive(Accounts)]
pub struct VerifyDerivative<'info> {
    #[account(mut)]
    pub checker: Signer<'info>, // Anyone can call
    pub new_mint: Account<'info, Mint>,
    pub new_narrative_record: Account<'info, NarrativeRecord>,
    pub existing_narrative_record: Account<'info, NarrativeRecord>,
    // Optional: oracle account to verify
    /// CHECK: oracle PDA
    pub oracle: UncheckedAccount<'info>,
}

pub fn verify_derivative(
    ctx: Context<VerifyDerivative>,
    similarity_score: f32,
) -> Result<()> {
    let new = &ctx.accounts.new_narrative_record;
    let existing = &ctx.accounts.existing_narrative_record;

    // Check that narrative hashes are similar (computed off-chain)
    require!(similarity_score > 0.85, ErrorCode::NotDerivative);

    // Flag new token as derivative
    new.origin_badge = false;
    new.similar_to = Some(existing.mint);

    // If similarity > 0.95 and lock_amount < 10% of existing's lock, flag as "vamp"
    if similarity_score > 0.95 && new.lock_amount < existing.lock_amount / 2 {
        new.suspicion_index = 0.9; // High suspicion
    }

    emit!(DerivativeFlagged {
        derivative_mint: new.mint,
        origin_mint: existing.mint,
        similarity: similarity_score,
    });

    Ok(())
}
```

#### 4. Record Verified Backer

```rust
#[derive(Accounts)]
pub struct RecordVerifiedBacker<'info> {
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + std::mem::size_of::<BackerRecord>() + 52, // String overhead
        seeds = [b"backer", backer_wallet.key().as_ref(), token_mint.key().as_ref()],
        bump
    )]
    pub backer_record: Account<'info, BackerRecord>,
    #[account(mut)]
    pub backer_wallet: Signer<'info>, // Must be the wallet connecting
    pub token_mint: Account<'info, Mint>,
    /// CHECK: JWT from verification server, signed by OriginDefender's private key
    pub jwt_proof: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>, // Pays for account creation if new
    pub system_program: Program<'info, System>,
}

pub fn record_verified_backer(
    ctx: Context<RecordVerifiedBacker>,
    social_platform: u8,
    social_handle: String,
    follower_count: u32,
    jwt_signature: [u8; 64],
) -> Result<()> {
    // Verify JWT signature (off-chain service did this, but we can re-verify on-chain if needed)
    // For now, assume unchecked

    let record = &mut ctx.accounts.backer_record;
    record.wallet = ctx.accounts.backer_wallet.key();
    record.token_mint = ctx.accounts.token_mint.key();
    record.social_platform = social_platform;
    record.social_handle = social_handle.clone();
    record.follower_count = follower_count;
    record.verified_at = Clock::get()?.unix_timestamp;
    record.is_early_backer = false; // Set true later by off-chain job after 100 backers

    // Check if this wallet already verified for this token
    // (The PDA seeds guarantee uniqueness, but we should prevent re-use of same social)
    // Not necessary due to PDA; each wallet-token combo is unique

    emit!(BackerVerified {
        wallet: record.wallet,
        token_mint: record.token_mint,
        social_handle,
        follower_count,
    });

    Ok(())
}
```

**Off-chain job:** After token launch, a server tracks first 100 `BackerVerified` events. It then calls `mark_early_backers(token_mint, [wallet_pubkeys])` to set `is_early_backer = true` for those 100. This could be on-chain with a counter but would require an initiator.

#### 5. Update Early Backer Flags (Batch)

```rust
#[derive(Accounts)]
pub struct MarkEarlyBackers<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub global_state: Account<'info, GlobalState>,
    /// CHECK: List of backer record PDAs
    #[account(mut)]
    pub backer_records: Vec<UncheckedAccount<'info>>,
    pub token_mint: Account<'info, Mint>,
}

pub fn mark_early_backers(ctx: Context<MarkEarlyBackers>) -> Result<()> {
    // Admin (or a designated service) calls this after token accumulates 100+ backers
    // Mark first N records as early_backer = true
    // Simple implementation: set flag on all passed records
    // In practice: pass exactly the first 100 by verification timestamp

    for backer in ctx.accounts.backer_records.iter() {
        // Would need to load account data to modify; omitted for brevity
    }

    Ok(())
}
```

#### 6. Lock Bonded Liquidity

```rust
#[derive(Accounts)]
pub struct LockBondedLiquidity<'info> {
    #[account(
        init,
        payer = founder,
        space = 8 + std::mem::size_of::<VestingAccount>() + 100, // string overhead
        seeds = [b"vesting", mint.key().as_ref()],
        bump
    )]
    pub vesting_account: Account<'info, VestingAccount>,
    #[account(mut)]
    pub founder: Signer<'info>,
    pub mint: Account<'info, Mint>,
    /// CHECK: The token account owned by founder that holds the locked tokens
    pub founder_token_account: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn lock_bonded_liquidity(
    ctx: Context<LockBondedLiquidity>,
    amount: u64,           // Raw token amount (not lamports)
    cliff_days: i64,
    total_duration_days: i64,
) -> Result<()> {
    let vesting = &mut ctx.accounts.vesting_account;
    vesting.mint = ctx.accounts.mint.key();
    vesting.beneficiary = ctx.accounts.founder.key();
    vesting.authority = ctx.accounts.vesting_account.key(); // PDA self-authority
    vesting.start_timestamp = Clock::get()?.unix_timestamp;
    vesting.cliff = cliff_days;
    vesting.duration = total_duration_days;
    vesting.total_amount = amount;
    vesting.released_amount = 0;

    // Lock tokens: transfer from founder_token_account to vesting_account PDA
    // Use Token program's transfer with vesting_account as new authority
    // ... token transfer logic

    emit!(LiquidityLocked {
        mint: vesting.mint,
        founder: vesting.beneficiary,
        amount,
        cliff: cliff_days,
        duration: total_duration_days,
    });

    Ok(())
}
```

#### 7. Release Vested Tokens (Gradual)

```rust
#[derive(Accounts)]
pub struct ReleaseVested<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>, // Founder or their delegate
    #[account(mut)]
    pub vesting_account: Account<'info, VestingAccount>,
    pub mint: Account<'info, Mint>,
    /// CHECK: Destination token account for founder
    pub destination_token_account: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn release_vested(ctx: Context<ReleaseVested>) -> Result<()> {
    let vesting = &ctx.accounts.vesting_account;
    let now = Clock::get()?.unix_timestamp;
    let start = vesting.start_timestamp;

    // Calculate vested amount
    let elapsed = now - start;
    let cliff_seconds = vesting.cliff * 86400;
    let duration_seconds = vesting.duration * 86400;

    require!(elapsed >= cliff_seconds, ErrorCode::CliffNotReached);

    let vested = if elapsed >= cliff_seconds + duration_seconds {
        vesting.total_amount
    } else {
        let vested_fraction = (elapsed - cliff_seconds) as f64 / duration_seconds as f64;
        (vesting.total_amount as f64 * vested_fraction).floor() as u64
    };

    let releasable = vested - vesting.released_amount;
    require!(releasable > 0, ErrorCode::NothingToRelease);

    // Transfer tokens from vesting PDA to destination
    // ... token transfer

    vesting.released_amount += releasable;

    emit!(VestedTokensReleased {
        mint: vesting.mint,
        amount: releasable,
    });

    Ok(())
}
```

#### 8. Slash Narrative Bond

```rust
#[derive(Accounts)]
pub struct SlashBond<'info> {
    #[account(mut)]
    pub slasher: Signer<'info>, // Must be an active oracle
    #[account(mut)]
    pub narrative_record: Account<'info, NarrativeRecord>,
    #[account(
        mut,
        seeds = [b"bond", narrative_record.mint.as_ref()],
        bump = bond_bump
    )]
    pub bond_account: Account<'info, NarrativeBond>,
    /// CHECK: DAO treasury where slashed funds go
    pub dao_treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn slash_bond(
    ctx: Context<SlashBond>,
    slash_percentage: u8, // 0-100
    reason: String,
) -> Result<()> {
    let record = &mut ctx.accounts.narrative_record;
    let bond = &mut ctx.accounts.bond_account;

    require!(bond.amount > 0, ErrorCode::NoBondPosted);
    require!(!bond.is_slashed, ErrorCode::AlreadySlashed);
    require!(slash_percentage <= 100, ErrorCode::InvalidSlashPercentage);

    let slash_amount = (bond.amount as u128 * slash_percentage as u128 / 100) as u64;

    // Transfer slash_amount from bond_account PDA to dao_treasury
    // lamports transfer via system program

    bond.is_slashed = true;
    bond.slash_percentage = slash_percentage;

    record.narrative_bond -= slash_amount; // Locked amount reduces

    emit!(BondSlashed {
        mint: record.mint,
        slasher: ctx.accounts.slasher.key(),
        amount: slash_amount,
        reason,
    });

    Ok(())
}
```

#### 9. Add/Remove Oracle (Admin Only)

```rust
#[derive(Accounts)]
pub struct UpdateOracle<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub global_state: Account<'info, GlobalState>,
    /// CHECK: Oracle wallet
    pub oracle_wallet: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn update_oracle(
    ctx: Context<UpdateOracle>,
    action: u8, // 0=add, 1=remove
    origin_token: Pubkey,
) -> Result<()> {
    let global = &mut ctx.accounts.global_state;

    match action {
        0 => {
            // Add oracle (create OracleRecord PDA)
            let oracle_seeds = &[
                b"oracle",
                &ctx.accounts.oracle_wallet.key().as_ref(),
                &[global.next_oracle_index as u8],
            ];
            let oracle_bump = *ctx.bumps.get("oracle_record").unwrap();
            // create oracle_record PDA with fields
            global.oracle_count += 1;
            global.next_oracle_index += 1;
        }
        1 => {
            // Remove oracle (close account)
            // Find oracle record and close
            global.oracle_count -= 1;
        }
        _ => return Err(ErrorCode::InvalidAction.into()),
    }

    Ok(())
}
```

### 3.4 Events

```rust
#[event]
pub struct NarrativeRegistered {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub timestamp: i64,
    pub lock_amount: u64,
    pub bond_amount: u64,
}

#[event]
pub struct DerivativeFlagged {
    pub derivative_mint: Pubkey,
    pub origin_mint: Pubkey,
    pub similarity: f32,
}

#[event]
pub struct BackerVerified {
    pub wallet: Pubkey,
    pub token_mint: Pubkey,
    pub social_handle: String,
    pub follower_count: u32,
}

#[event]
pub struct LiquidityLocked {
    pub mint: Pubkey,
    pub founder: Pubkey,
    pub amount: u64,
    pub cliff: i64,
    pub duration: i64,
}

#[event]
pub struct VestedTokensReleased {
    pub mint: Pubkey,
    pub amount: u64,
}

#[event]
pub struct BondSlashed {
    pub mint: Pubkey,
    pub slasher: Pubkey,
    pub amount: u64,
    pub reason: String,
}
```

---

## 4. Off-Chain Components

### 4.1 Narrative Similarity Service

A Python/FastAPI service that:

1. Receives narrative text from frontend
2. Computes embedding via `sentence-transformers` (GPU recommended)
3. Queries PostgreSQL cache of existing narrative embeddings
4. Computes cosine similarity against top-k candidates using Annoy/FAISS index
5. Returns `(is_derivative: bool, origin_mint: Option<Pubkey>, similarity: f32)`
6. If >0.85, allow user to proceed with `similar_to` set in transaction

**Tech Stack:**
- FastAPI
- PostgreSQL with pgvector extension (store embeddings)
- Annoy or FAISS for approximate nearest neighbor search
- Dockerized

**RPC Endpoint:**
```
POST /api/v1/check_derivative
{
  "narrative_text": "Mission statement...",
  "token_creator": "wallet_address",
}
→ {
  "is_derivative": true,
  "origin_mint": "Tokenmint...",
  "similarity": 0.92,
  "lock_percentage_suggested": 40
}
```

### 4.2 Backer Verification Server

Handles OAuth flows and JWT issuance:

1. User clicks "Verify as Early Backer"
2. Redirect to `/auth/twitter` or `/auth/discord`
3. After OAuth callback, server receives `access_token`
4. Server fetches user profile (handle, follower count, account age)
5. Server creates JWT signed with OriginDefender's private key:
   ```json
   {
     "wallet": "0x...",
     "social_platform": "twitter",
     "social_handle": "@user",
     "follower_count": 1542,
     "issued_at": 1234567890,
     "exp": 1234567890 + 3600,
     "signature": "ed25519..."
   }
   ```
6. User's wallet submits JWT to `record_verified_backer` via frontend
7. On-chain program verifies JWT signature against stored OriginDefender public key

**Security:** JWT must be single-use (nonce stored in Redis, consumed on-chain).

### 4.3 Oracle Dashboard

Web interface for oracles to:

- View newly registered narratives (last 48h)
- See similarity scores and backer metrics
- Vote `Certify` or `Flag Derivative`
- View their earned fees
- See active narrative bonds they can slash

Built with Next.js + Tailwind, connects to Solana RPC.

---

## 5. Frontend Integration (bags.fm Example)

Modify bags.fm's token creation flow:

### Step 5.1: Before Launch

Founder fills:

1. Token metadata (name, symbol, image)
2. **Narrative documentation** (textarea with mission, lore, tokenomics, differentiators)
3. Target market cap ($)
4. Bonded liquidity % (auto-calculated from target MCap, but founder can increase)
5. Optional Narrative Bond amount (SOL)

### Step 5.2: Narrative Check

On blur of narrative textarea, frontend calls `POST /api/v1/check_derivative`.

- If derivative detected: Show warning "This token's narrative is 92% similar to [Origin Token X]. You will receive 'Derivative' badge unless you add significant differentiation."
- Founder can proceed anyway, but flag is set.

### Step 5.3: Locking Funds

Founder connects wallet and approves:

1. Bonded liquidity transfer (10% of total supply)
2. Narrative bond transfer (1 SOL)

These transfers happen via associated token accounts and system program.

### Step 5.4: Backer Verification (During/After Launch)

On token page:

- Banner: "✓ 47 Verified Early Backers" (count from on-chain `BackerRecord` with `is_early_backer=true`)
- Button for buyers: "Verify as Early Backer" (only visible if within first 100 and token balance > 0)
- Tooltip: "Verified backers help prove this token has real community. Vamps can't fake this."

### Step 5.5: Discovery Feed Sorting

Default sort: `visibility_score DESC`.

Visibility score calculation:

```javascript
function calculateVisibilityScore(token) {
  const base = 1.0;
  const originBonus = token.origin_badge ? 1.0 : token.derivative_but_clean ? 0.3 : -0.5;
  const backerMult = 1.0 + (token.backer_density * 1.0); // 1.0 to 2.0
  const liquidityMult = Math.min(token.locked_ratio / 0.3, 2.0); // cap at 2x
  return base * (1 + originBonus) * backerMult * liquidityMult;
}
```

---

## 6. Deployment Plan

### Phase 1: Devnet Testing (2 weeks)

- Deploy Anchor program to Solana devnet
- Deploy off-chain services to localhost/Docker
- Write integration tests for all instructions
- Test similarity detection with sample narratives (50+ examples)
- Tune similarity threshold (currently 0.85)

**Success criteria:**
- Narrative flagging works with <5% false positives
- Vesting contract releases correctly after cliff
- Backer verification flow end-to-end functional

### Phase 2: Partnership Outreach (1-2 weeks)

- Contact bags.fm team with proposal
- Offer to integrate for free (open-source)
- Provide demo on devnet
- Negotiate revenue share if they want oracle fees (or we keep for DAO)

**Fallback:** If bags.fm declines, build standalone discovery frontend (origin-defender.xyz) that indexes all bags.fm tokens and adds our badges/visibility scoring. Users can see "Origin Score" before buying.

### Phase 3: Testnet with Real Users (2 weeks)

- Partner with 3-5 small launchpad projects to use OriginDefender on testnet
- Run oracle DAO with 5 trusted initial oracles
- Gather feedback on UX and metrics
- Adjust parameters (lock percentages, bond amounts, similarity threshold)

### Phase 4: Mainnet Launch (1 week)

- Deploy program to Solana mainnet
- Seed oracle DAO with 10 initial members (from partner projects)
- Launch off-chain services on AWS/GCP (LoadBalancer + auto-scaling)
- Integrate with top 3 launchpads (bags.fm, SunPump, etc.)

**Post-launch:**
- Monitor for 30 days
- Community can propose governance changes via DAO
- Gradually decentralize admin/oracle roles

---

## 7. Economic Model & Sustainability

### 7.1 Revenue Streams

1. **Oracle Fees:** 0.1% of bonded liquidity (from `lock_bonded_liquidity`) collected per new token
   - If average bonded liquidity = 100 SOL, fee = 0.1 SOL per token
   - With 100 tokens/month = 10 SOL/month revenue
   - Scales with adoption

2. **Verification Service:** Could charge 0.01 SOL per JWT issuance (optional, likely subsidized)

3. **API Access:** Paid tier for platforms to query narrative similarity (unlimited calls vs. free rate-limited)

### 7.2 Costs

- **GPU servers for embeddings:** ~$500/month (T4 or A10)
- **OAuth server & JWT signing:** ~$100/month
- **PostgreSQL + FAISS index:** ~$200/month
- **Validator RPC:** ~$50/month
- **Frontend hosting (oracle dashboard):** ~$50/month

**Break-even:** ~150 tokens/month (at 0.1% fee on ~100 SOL average bond)

### 7.3 Governance (Optional Token)

If community wants full decentralization:

- **Token:** `ODF` (Origin Defender Foundation)
- **Distribution:** 50% to oracles over 4 years, 30% to treasury, 20% to initial contributors
- **Utility:** Vote on parameter changes (similarity threshold, bond amounts, lock durations), elect oracles, spend treasury

But we can start **non-tokenized** with multisig controlled by oracles.

---

## 8. Risk Analysis & Mitigations

### 8.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Embedding model false positives | Medium | High (bad project gets Origin) | Human oracle review; appeal process with community vote |
| JWT verification bypass | Low | High | Use on-chain signature verification ( ed25519 ) with rotating keys |
| Vesting contract bug | Low | Critical | Extensive unit tests; audit before mainnet |
| FAISS index lag (not real-time) | Medium | Medium | Use threshold detection: if >90% similarity, immediate flag; background re-index |
| Oracle collusion | Low | High | 2/3 supermajority required; malicious oracles can be removed by vote; slash their bonds |

### 8.2 Economic Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Bonded liquidity not enough deterrent | Medium | High | Start at 30-50% lock; adjust based on adoption; increase if vamps find ways around |
| Narrative bond too expensive for legit projects | Medium | Medium | Make it optional; adjust based on empirical derivative rates |
| Oracle fees insufficient to sustain ops | Medium | Medium | Platform integration could subsidize; eventually DAO treasury |
| No platform integrates | High | High | Build standalone frontend; create browser extension that overlays badges |

### 8.3 Adoption Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| bags.fm ignores us | High | High | Build independent ranking site; community pressure; compete directly |
| Vamps find technical workarounds (similarity evasion) | Medium | Medium | Use ensemble of embedding models; update threshold regularly |
| Legit projects avoid due to lock requirement | Medium | Medium | Educate on benefits (trust premium); offer lower lock for small projects (10%) |
| Oracle DAO inactive | Medium | Medium | Incentivize with fees; require minimum participation or removal |

---

## 9. Success Metrics

**Lead indicators (early):**
- Number of tokens registered with OriginDefender per week
- % of those that receive Origin badge (vs Derivative)
- Average bonded liquidity % (target >30%)
- Average backer density (target >15%)
- Oracle participation rate (votes/total new tokens)

**Lag indicators (3-6 months):**
- Reduction in number of identical-name tokens per narrative cluster (target: <2)
- Increase in average token lifespan before rug (target: >30 days)
- User-reported scam rate (downward trend)
- Integration with X launchpads (1+ major partner)

**Negative indicators:**
- Derivative rate still >70% (means system not preventing cloning)
- Average backer density <5% (indicates fake backers still prevalent)
- Oracle vote participation <10% (DAO inactive)

---

## 10. Open Questions

1. **Should we allow "Derivative" if they have significantly different tokenomics?**
   - Proposal: Derivative badge + "Differentiated" sub-badge if lock % > origin and tokenomics vary >20%
   - Need metric for "different tokenomics" (tax rate, burn mechanism, utility)

2. **How to handle "meme evolution"?** A token starts as "Trump Dog" but later adds utilities. Does it remain Derivative?
   - Lock in at launch: badge permanent but can show "Evolved" if tokenomics change significantly later

3. **What about tokens that are intentionally derivative (homages, tributes)?**
   - Allow "Tribute" tag if origin project explicitly approves via oracle vote

4. **Should backer verification be optional?** If optional, vamps will skip it. Make it required for visibility score > baseline?

5. **Who decides narrative similarity threshold?** Initially off-chain service; later DAO vote.

---

## 11. Getting Involved

We're open-source and looking for:

- **Rust/Solana devs:** Help audit and optimize the Anchor program
- **ML engineers:** Improve narrative embedding pipeline (fuzzy matching, multilingual)
- **Frontend devs:** Build the oracle dashboard and verification UI
- **Launchpad partners:** Integrate OriginDefender into your token creation flow
- **Oracles:** Apply if you have a successful origin token (>6mo, no rugs)

**Contact:** Open an issue on GitHub or reach out on Twitter @OriginDefender

---

**OriginDefender** — Turning memecoin chaos into curated creativity.
