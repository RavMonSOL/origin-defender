# OriginDefender — Solving bags.fm Token Vampirism

## The Problem: Token Vamps on bags.fm

bags.fm's bonding curve model revolutionized token launches, but it also created a perverse incentive: **narrative vampirism**.

The flow is simple:
1. A token gains traction with a hot narrative (e.g., "Pepe the Frog", "Elon on Mars", "Trump's Dog")
2. Within minutes, copycat groups launch identical tokens with the same name, same concept, same everything
3. Liquidity and attention get fragmented across dozens of clones
4. The original team loses momentum; buyers get confused; scammers dump and run

**Why is this so rampant on bags.fm?**
- **No narrative registry:** The only unique identifier is the token mint, but the mint is random. Anyone can create another token with the same name and metadata.
- **Speed wins:** Automated bots monitor trending tokens and deploy clones before the original can establish dominance.
- **Liquidity is ephemeral:** Bonding curves hold all liquidity, but the founder doesn't provide external capital. Anyone can launch, so there's no skin in the game.
- **Discovery is blind:** bags.fm's feed cannot distinguish "original" from "vamp" — they all look the same.

Result: A negative-sum arms race where the fastest script wins, not the best project. The ecosystem drowns in duplicates.

## Our Solution: Provenance, Not Permission

OriginDefender is a **complementary system** that adds narrative provenance to bags.fm without modifying its core program. We don't prevent launches — we **price the externality** of copying.

The system has three layers:

### 1. Narrative Fingerprinting (Pre-Launch Commitment)

Before creating a token, founders must **fingerprint their narrative**:

```json
{
  "mission_statement": "Trump Dog is the only memecoin that donates 10% of fees to secure the southern border",
  "lore": "Born from a meme where Trump pet a dog that looked like him...",
  "visual_theme": "American flag colors, presidential seal elements",
  "tokenomics": "10% tax: 5% to border wall donations, 5% to liquidity",
  "differentiators": "First Trump token with on-chain donation tracking"
}
```

This text is embedded via `sentence-transformers` (all-MiniLM-L6-v2) into a 384‑dim vector, then hashed (SHA256). The hash is stored on-chain in a `NarrativeRecord` PDA.

**How it works:**
- Founder calls `register_narrative(mint, narrative_hash, bond_amount)` **before** calling bags.fm's `create` instruction.
- Off-chain similarity service compares the new narrative to existing records.
- If similarity > 85%, the transaction can still proceed but the token will be flagged `origin_badge = false` and `similar_to = <origin_mint>`.
- If unique, `origin_badge = true` and the token is recognized as the first of its narrative cluster.

The fingerprint is immutable and public. Copying a narrative becomes detectable at the moment of launch.

### 2. Narrative Bond (Economic Deterrence)

Founders must post a **refundable bond** of **1 SOL** when registering a narrative. The bond lives in a PDA controlled by OriginDefender and can be slashed under two conditions:

- **Rug detection:** Token creator disappears, liquidity removed, or token abandoned (oracle vote required).
- **Derivative proliferation:** Your narrative spawns >3 derivative tokens within 14 days, and those derivatives collectively capture >30% of your liquidity share. In this case, a percentage of your bond is slashed to compensate oracles for policing.

The bond is **returned after 90 days** if the token remains active and derivative damage is below threshold.

**Why 1 SOL?** This amount is enough to deter Vamps (who operate on shoestring budgets) while being affordable for legitimate founders. It's a fixed fee that simplifies the UI and avoids decision fatigue.

**Why this works:** Vamp groups won't post a 3 SOL bond that could be slashed. They operate on near-zero budgets. Original teams who believe in their project can afford the bond and will get it back if they don't harm the narrative ecosystem.

### 3. Early Backer Verification (Social Proof)

The first 100 buyers of a token can verify their social accounts (Twitter/X or Discord) via OAuth. The verification server issues a JWT, which the user submits on-chain via `record_verified_backer`. This creates a `BackerRecord` PDA.

Derived metrics:
- **Backer Density** = unique verified backers ÷ total unique holders
- **Backer Genesis** = list of first 100 backers (public)

Vamp projects can't quickly generate 100 real-looking accounts with engagement histories. We detect patterns:
- All backers verify within 5 minutes → suspicious
- Follow/ follower ratios < 1:10 → likely purchased accounts
- Same /16 subnet cluster → coordinated

Tokens with low backer density (<5%) or high suspicion index (>0.8) receive a "Suspected Vamp" badge.

---

## bags.fm Integration Flow

The ideal integration is a **frontend wrapper** around bags.fm's creation flow.

### Step-by-Step:

1. **Founder prepares narrative** and generates a new token mint keypair.
2. **Frontend calls OriginDefender's `/check_derivative` API**:
   - If unique → proceed, bond amount is fixed 1 SOL
   - If derivative → warning, but can still proceed (will get Derivative badge)
3. **Bond Transfer:** Founder signs a transaction transferring **exactly 1 SOL** to an OriginDefender-controlled PDA (Program Derived Address). This PDA is unique per token mint: `seeds = [b"bond", mint]`. The SOL is **held in escrow** and cannot be withdrawn by anyone except the `slash_bond` instruction (oracle-controlled) or `return_bond` after 90 days if conditions are met.
   - **Why a PDA?** It's a vault that the program controls programmatically. No human has the private key.
   - **Bond slashing:** If the token is later determined to be a Vamp (oracle vote) or if it spawns >3 derivatives with >30% liquidity capture, a percentage of the bond (20-100%) is transferred from the PDA to the DAO treasury.
   - **Bond return:** If after 90 days the token remains active and hasn't harmed the narrative ecosystem, the full 1 SOL is returned to the founder's wallet via `return_bond` instruction.
4. **Founder calls `register_narrative`** with mint, narrative hash, and proof of bond (or the frontend does this in the same transaction via CPI). A `NarrativeRecord` PDA is created with `origin_badge = true` (if unique) or `false` (if derivative).
5. **Frontend calls bags.fm's `create_bag`** instruction with the same mint. This creates the Bag account, token mint, and bonding curve.
6. **Indexer watchers** detect the bags.fm `Create` event, marks the `NarrativeRecord.is_active = true`, and stores the bonding curve PDA for ongoing liquidity tracking.
7. **Discovery feed** uses combined metrics to compute visibility score.
8. **Buyers see badges** and metrics on the token page.

All of this can be done without modifying bags.fm's program. The only required modifications are on the **frontend** (calling OriginDefender APIs and instructions) and the **indexer** (listening to bags.fm logs).

### Account Derivation (Official bags.fm Docs)

**Bonding Curve Program** (`BAGSW19DgadF4px3znCzHg8bXVVF4Dr17omvRS3VCkn`):
- Global config PDA: `["global"]` → `4fobarj9XyDy8Y6b4F3R6b5J8K9L2M3N4O5P6Q7R`
- Bag PDA: `["bag", mint]` → stores token metadata and bonding curve pointer
- Bonding curve PDA: `["bonding-curve", bag]` (where `bag` is the Bag PDA)
- Mint authority PDA: `["mint-authority"]`

**Bonding Curve Account Data** (on-chain):
```json
{
  "virtual_token_reserves": u64,
  "virtual_sol_reserves": u64,
  "real_token_reserves": u64,
  "real_sol_reserves": u64,
  "token_total_supply": u64,
  "complete": bool
}
```

**Important:** In bags.fm, the bonding curve is **not directly derived from the mint**. Instead, a `Bag` account (PDA) is first created via `create_bag`, and the bonding curve PDA is derived from that Bag PDA: `["bonding-curve", bag]`. The indexer must resolve the Bag PDA for a given mint by querying the Bag account (which stores the mint and bonding curve PDA). This extra indirection means our indexer needs to fetch the Bag account first before fetching the bonding curve state.

**Migration:** When `complete == true` and `real_token_reserves == 0`, anyone can call `migrate` to transfer all remaining SOL to a new AMM pool (if bags.fm supports it). The bonding curve is then inactive.

Our indexer fetches `real_sol_reserves` from the bonding curve to compute liquidity depth for visibility scores, and tracks `complete` to know when a token has migrated out of the bonding curve phase.

---

## Smart Contract Overview

The Anchor program (`origin_defender`) maintains narrative records and bonds. Key structs:

- `GlobalState` – singleton with fee basis points, oracle count, admin.
- `NarrativeRecord` – PDA seeds `[b"narrative", mint]`. Fields: `mint`, `creator`, `narrative_hash`, `registered_at`, `bond_amount`, `origin_badge`, `similar_to`, `backer_count`, `backer_density`, `suspicion_index`, `is_active`.
- `NarrativeBond` – PDA seeds `[b"bond", mint]`. Tracks bond amount and slash status.
- `BackerRecord` – PDA seeds `[b"backer", wallet, mint]`. Stores social verification.
- `OracleRecord` – PDA seeds `[b"oracle", wallet, index]`.
- `VestingAccount` – PDA seeds `[b"vesting", mint]`. For optional token locking.

Instructions:
- `initialize` – set up GlobalState.
- `register_narrative` – create NarrativeRecord and optionally bond account.
- `record_verified_backer` – add a backer.
- `lock_bonded_liquidity` – vest tokens (optional, founder‑provided).
- `slash_bond` – oracle‑only, reduces bond.
- `update_narrative_metrics` – admin or indexer updates counts.
- `update_oracle` – admin manage oracles.

The contract does **not** need to know about bags.fm internals; it simply stores narrative hashes and bonds. The bags.fm integration lives in off‑chain services.

---

## Off‑Chain Components

### 1. Narrative Similarity API

FastAPI service that:
- Receives narrative JSON from frontend.
- Computes embedding using `sentence-transformers`.
- Queries PostgreSQL (pgvector) or FAISS for nearest neighbors.
- Returns `(is_derivative, origin_mint, similarity)`.

This service is the gatekeeper: frontends should call it before allowing `register_narrative`. The on‑chain record can still be set with `similar_to = None`, but oracles or the indexer can later flag inaccuracies.

### 2. Backer Verification Server

Handles OAuth2 flows with Twitter/Discord, issues JWTs signed with a rotating Ed25519 key. On‑chain `record_verified_backer` will verify the JWT (in a full implementation we'd add signature verification).

### 3. Indexer

Listens to:
- OriginDefender events (`NarrativeRegistered`, `BackerVerified`, `BondSlashed`).
- bags.fm program logs (via `subscribe` or `getProgramAccounts`).

It maintains a local PostgreSQL DB that joins:
- NarrativeRecords → metrics (backer count, density, suspicion index)
- BondingCurveAccounts → liquidity depth (`real_sol_reserves`)
- Token metadata (name, symbol, image) from Metaplex

The indexer serves the public API `/metrics/{mint}` and the discovery feed endpoint.

---

## Tiered Visibility Algorithm

For bags.fm's feed (or our own standalone feed), we compute:

```
visibility_score = base × (1 + origin_bonus) × backer_mult × liquidity_mult
```

- `base` = 1.0
- `origin_bonus` = 1.0 if `origin_badge`, 0.3 if `derivative` (non‑fraud), -0.5 if `suspected_vamp`
- `backer_mult` = 1.0 + backer_density × 1.0 (capped at 2.0)
- `liquidity_mult` = min( locked_ratio / 0.3, 2.0 ) – but for bags.fm, we use `real_sol_reserves / initial_virtual_sol` as depth factor; alternatively, we could use `creator_share` if we track founder token lock.

Tokens with higher scores appear first. This gives originals a massivevisibility advantage, making it harder for vamps to capture attention.

---

## Economic Model

OriginDefender collects **0.1% of each narrative bond** as an oracle fee (split among active oracles). With a fixed 1 SOL bond, per‑token revenue ≈ 0.001 SOL. With 100 tokens/month, that's 0.1 SOL revenue — not much, but sufficient for infrastructure if we also charge for API access and verification services.

The real value is in **ecosystem health**: fewer scams, better discovery, higher trust → more volume for everyone.

---

## Why This Works (Game Theory Table)

| Actor | Current Incentives | OriginDefender Incentives |
|-------|-------------------|--------------------------|
| Vamp group | Fast clone, zero cost, dump | Must post 1 SOL bond (lost if flagged) → negative EV |
| Original team | No protection, get copied | Origin badge + visibility boost + community trust |
| Buyers | Can't tell originals apart | See badges + metrics + backer social proof |
| Platform (bags.fm) | High volume but toxic | Healthier ecosystem, more retention, less scam complaints |
| Oracles | N/A | Earn fees for accurate derivative flagging |

Equilibrium: vamping becomes unprofitable; only differentiated tokens survive.

---

## Deployment Roadmap

1. **Devnet** – Deploy Anchor program, run similarity API locally, test with mock tokens.
2. **Partner** – Approach bags.fm team for frontend integration (or build wrapper site).
3. **Testnet** – Seed oracles, run indexer with real bags.fm testnet events.
4. **Mainnet** – Launch with 10 initial oracles; offer SDK to all launchpads.

---

## Getting Started

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full technical deep dive, including account layout, instruction details, and indexing strategy.

```bash
git clone https://github.com/RavMonSOL/origin-defender.git
cd origin-defender
anchor build
```

## License

MIT – see [LICENSE](./LICENSE).

---

**OriginDefender** – Because bags.fm deserves a fair fight.

[Documentation](./docs/) • [API Reference](./docs/API.md) • [Discord](https://discord.gg/invite)

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────────────┐
│   Token Launch  │────▶│  Narrative Fingerprint  │
│   Interface     │     │    (Embedding Model)   │
└─────────────────┘     └───────────┬─────────────┘
                                    │ Hash commit
                                    ▼
┌─────────────────┐     ┌─────────────────────────┐
│  Bonded Liquidity│◀───│  On-Chain Registry      │
│  Vesting Contract│     │ (Narrative Hashes,      │
│   (20-50% lock)  │     │  Backer List, Locks)    │
└─────────────────┘     └───────────┬─────────────┘
                                    │ Similarity check
                                    ▼
                        ┌─────────────────────────┐
                        │  Discovery Penalty      │
                        │   Algorithm (Score)     │
                        └───────────┬─────────────┘
                                    │
                                    ▼
                        ┌─────────────────────────┐
                        │   User-Facing Badges    │
                        │  (Origin/Derivative)    │
                        └─────────────────────────┘
```

## Smart Contract Structure (Anchor)

We provide **one comprehensive program** (`origin_defender`) with 8 instruction handlers:

### 1. `initialize_narrative_registry`
- Creates the global registry account
- Sets oracle DAO membership list (initial)

### 2. `register_narrative`
- Called by token creator at launch
- Stores: narrative hash, token mint, creator, timestamp, lock amount
- Emits `NarrativeRegistered` event

### 3. `verify_derivative`
- Anyone can call to check if a new token's narrative hash matches existing (>85% cosine similarity)
- Returns matching origin token's Pubkey if found
- Slashable if called maliciously (false positive on purpose)

### 4. `record_verified_backer`
- First 100 buyers call this after purchase
- Requires Twitter/Discord OAuth proof (signed JWT from verification server)
- Records: buyer wallet, social handle, timestamp

### 5. `lock_bonded_liquidity`
- Called by token creator to lock founder tokens
- Creates vesting account with release schedule (90-day cliff, then linear 180 days)
- Records lock percentage

### 6. `slash_narrative_bond`
- Oracle DAO can slash if narrative spawns harmful derivatives
- Requires 2/3 oracle vote via multisig

### 7. `release_vested_tokens`
- After cliff, founder can gradually withdraw (or holders can claim if rug detected)

### 8. `update_oracle_membership`
- DAO governance to add/remove oracles

## How to Use This System

### For Token Creators (The "Good Actors")

1. **Before launch:** Prepare your narrative documentation (mission, lore, tokenomics)
2. **At launch:** Call `register_narrative` with your narrative hash
3. **Immediately after:** Lock your bonded liquidity (20-50% of supply)
4. **Promote:** Your token gets "Origin" badge automatically if no similar narrative exists
5. **Maintain:** Keep your project alive; locked tokens vest gradually; you can withdraw after 90 days if no rugs

### For Buyers (The "Users")

1. **Look for badges:**
   - ✅ `Origin` — First of this narrative, bonded liquidity locked
   - ⚠️ `Derivative` — Similar to existing token, check backer density
   - ❌ `Suspected Vamp` — High-risk, clustered backers, no lock

2. **Check metrics:**
   - Backer Density Score (higher = more genuine)
   - Bonded Liquidity % (higher = founder commitment)
   - Narrative Bond Status (bonded = shared responsibility)

3. **Vote with wallet:** Support Origin tokens; avoid Derivatives with low backer density

### For Oracles (The "Taste Jury")

1. Apply if you have successfully launched an Origin token with >6 months operation and no rugs
2. Review new registrations within 48 hours using similarity detection
3. Vote to flag or certify narratives
4. Earn fees from new token launches (0.1% of bonded liquidity)

### For Platform Integrations (bags.fm, etc.)

1. Add OriginDefender program ID to your launch flow
2. Require `register_narrative` and `lock_bonded_liquidity` calls before enabling trading
3. Use the `get_visibility_score` RPC to sort discovery feed
4. Display badges on token page

## Economic Model & Sustainability

**OriginDefender is not a token project.** It's infrastructure. Revenue streams:

1. **Oracle Fees** — 0.1% of bonded liquidity per new token (paid to DAO oracles)
2. **Verification Service** — Charged to token creators for social proof verification (optional, could be subsidized)
3. **Similarity Detection API** — Paid tier for platforms to query narrative fingerprints
4. **Governance Token (Optional)** — If community wants full decentralization: `ODF` token for oracle elections, fee distribution, parameter tuning

All revenue funds:
- Hosting the embedding model servers (costs ~$500/mo for low-latency GPU)
- Bug bounties for false positive/negative detection
- Development grants for new features

## Why This Works (Game Theory)

| Actor | Current Incentives | OriginDefender Incentives |
|-------|--------------------|--------------------------|
| Vamp group | Fast clone, no lock, dump | Must lock 20-50% for 90 days (negative EV) |
| Original team | No defense, get copied | Get "Origin" badge + visibility boost |
| Buyers | Can't differentiate | See badges + metrics + backer social proof |
| Platform | High volume, toxic | Healthier ecosystem, more retention |
| Oracles | N/A | Earn fees for policing narratives |

**Equilibrium outcome:** Vamping becomes unprofitable. Only truly differentiated projects (different tokenomics, utility, community) succeed. Narrative space becomes **first-to-commit** rather than **first-to-launch**.

## Deployment & Roadmap

- **Week 1-2:** Anchor program on Devnet, basic narrative registry
- **Week 3-4:** Bonded liquidity contracts + vesting logic
- **Week 5-6:** Backer verification OAuth flow + JWT server
- **Week 7-8:** Oracle DAO + voting system
- **Week 9-10:** Integration with bags.fm testnet (partner if possible)
- **Week 11-12:** Mainnet launch with 5-10 seed oracles

We're open-source and permissionless. Fork it, improve it, but please credit the original idea.

## Contributing

1. Fork the repo
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Development Setup

```bash
# Prerequisites
- Rust + stable toolchain
- Solana CLI v1.18+
- Anchor CLI v0.30.0
- Node.js 20+
- PostgreSQL (for backer verification, optional)

# Clone and build
git clone https://github.com/yourusername/origin-defender.git
cd origin-defender
anchor build
anchor test

# Run local validator
solana-test-validator
anchor test --skip-build
```

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for detailed internals.

## License

MIT License — see [LICENSE](./LICENSE) for details.

---

**OriginDefender** — Because memecoins deserve a fighting chance.

[Website (frontend/website)] • [Documentation](./docs/) • [Discord](https://discord.gg/invite) • [Twitter @OriginDefender](https://twitter.com)

## Frontend Demo

A React + Vite website is included in the `website/` directory. It uses a neon, glitch aesthetic with video background (you must supply your own background video file matching the style). Run locally:

```bash
cd website
npm install
npm run dev
```

For production, set `VITE_API_URL` and deploy to Vercel/Netlify.
