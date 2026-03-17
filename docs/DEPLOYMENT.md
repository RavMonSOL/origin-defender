# Deployment Guide

## Prerequisites

- **Solana CLI** v1.18+ (`solana --version`)
- **Anchor CLI** v0.30.0 (`anchor --version`)
- **Rust** stable toolchain (`rustc --version`)
- **Node.js** 20+ (`node --version`)
- **Docker** (for off-chain services)
- **GitHub PAT** with repo permissions
- **Solana wallet** with SOL for deployment fees (~0.5 SOL)

---

## Step 1: Clone and Build

```bash
git clone https://github.com/yourusername/origin-defender.git
cd origin-defender

# Build the program
anchor build

# This will create:
# - target/deploy/origin_defender.so
# - target/idl/origin_defender.json
```

---

## Step 2: Get a Program ID

```bash
# Generate a new keypair
solana-keygen new --outfile target/deploy/origin_defender-keypair.json

# Get the pubkey
PUBKEY=$(solana-keygen pubkey target/deploy/origin_defender-keypair.json)
echo "Program ID: $PUBKEY"
```

---

## Step 3: Configure Anchor.toml

Update `Anchor.toml` with your program ID:

```toml
[programs.localnet]
origin_defender = "YOUR_PROGRAM_ID_HERE"

[provider]
cluster = "mainnet-beta"
wallet = "~/.config/solana/id.json"
```

---

## Step 4: Deploy to Devnet (Test First)

```bash
# Configure Solana for devnet
solana config set --url https://api.devnet.solana.com
solana airdrop 2  # Get some DEV SOL

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Verify deployment
solana program show <PROGRAM_ID> --url https://api.devnet.solana.com
```

---

## Step 5: Run Tests

```bash
# Unit tests (run against local validator)
solana-test-validator &
anchor test --skip-build

# When done, kill validator
pkill solana-test-validator
```

---

## Step 6: Deploy to Mainnet

**WARNING:** Mainnet deployment costs ~0.5-1.0 SOL (rent + tx fees). Ensure you have enough.

```bash
# Switch to mainnet
solana config set --url https://api.mainnet-beta.solana.com

# Fund your deployment wallet
# You need ~1 SOL for deployment + buffer

# Deploy
anchor deploy --provider.cluster mainnet-beta

# Record the program ID for future
PROGRAM_ID=$(solana-keygen pubkey target/deploy/origin_defender-keypair.json)
echo "Deployed OriginDefender to mainnet. Program ID: $PROGRAM_ID"
```

---

## Step 7: Initialize Global State

After deployment, you must call `initialize` to set the authority (initially your deployment wallet).

```bash
# Get program ID from keypair
PROGRAM_ID=$(solana-keygen pubkey target/deploy/origin_defender-keypair.json)

# Build initialize instruction
# You can use `anchor test` with a script that calls initialize, or:
anchor build && solana program write-buffer target/deploy/origin_defender.so
# Then use solana program deploy to deploy buffer (if using that flow)

# Simpler: create a TypeScript test that calls initialize and run it:
npx ts-node scripts/initialize.ts $PROGRAM_ID
```

Example initialization script (`scripts/initialize.ts`):

```typescript
import * as anchor from "@coral-xyz/anchor";
import { OriginDefender } from "../target/types/origin_defender";

async function main() {
  const programId = new anchor.web3.PublicKey(process.argv[2]);
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new anchor.Program(
    {} as any,
    { address: programId, provider }
  ) as OriginDefender;

  const globalStatePDA = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    programId
  )[0];

  await program.methods
    .initialize()
    .accounts({
      globalState: globalStatePDA,
      authority: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Global state initialized");
}

main().catch(console.error);
```

---

## Step 8: Deploy Off-Chain Services

The off-chain services need to be hosted. We provide a Docker Compose setup.

```bash
cd services
docker-compose up -d
```

This starts:

- `similarity-api`: FastAPI service on port `8000`
- `verification-server`: OAuth + JWT on port `8001`
- `postgres`: Database on port `5432`
- `redis`: Cache on port `6379`

### Environment Variables

Create a `.env` file in `services/`:

```bash
# Database
DATABASE_URL=postgresql://origin_defender:password@postgres:5432/origin_defender
REDIS_URL=redis://redis:6379

# Similarity API
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
FAISS_INDEX_PATH=/data/faiss.index
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Verification Server
TWITTER_CLIENT_ID=your_client_id
TWITTER_CLIENT_SECRET=your_client_secret
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
JWT_SECRET=your_jwt_secret_key_32_bytes
ORIGIN_DEFENDER_PROGRAM_ID=YOUR_PROGRAM_ID
```

---

## Step 9: Seed Initial Oracles

The oracle DAO starts empty. Add 5-10 trusted founders of successful memecoins (6+ months, no rugs).

```bash
# Use the admin script
npx ts-node scripts/add_oracle.ts <ORACLE_WALLET_PUBKEY>
```

Repeat for each oracle.

---

## Step 10: Index Existing bags.fm Tokens (Optional)

If you want your discovery feed to include existing tokens, run the indexer to backfill:

```bash
npx ts-node scripts/indexer/backfill.ts --since "2025-01-01"
```

This will:
1. Fetch all tokens from bags.fm API (or on-chain program)
2. For each token, prompt founder to register narrative (if they haven't)
3. Build initial FAISS index of embeddings

---

## Step 11: Integrate with bags.fm (or other launchpad)

Modify bags.fm's token creation UI:

1. Add "Narrative" tab before launch
2. Require narrative JSON input (validation: mission_statement > 100 chars, lore > 200 chars)
3. On blur, call `POST /check_derivative` and show warning if derivative
4. Require `lock_amount` and `lock_duration` based on target MCap
5. Add "Lock Liquidity" step before "Create Token"
6. After launch, call `register_narrative` with the narrative hash (computed by frontend via embedding model or by off-chain service)
7. Show badges on token page using `GET /metrics/{mint}`

Contact bags.fm team for integration: `team@bags.fm` (hypothetical)

---

## Step 12: Configure Monitoring & Alerts

Set up Grafana/Prometheus or use our provided dashboard:

```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

Metrics to watch:

- `origin_defender_registrations_total`
- `origin_defender_derivative_flags_total`
- `origin_defender_bond_slashes_total`
- `api_requests_total`
- `embedding_service_latency_seconds`

Set alerts for:
- Registration volume drop >50% overnight
- Derivative rate >80% (should trend down)
- Bond slashing events (spike indicates attack)

---

## Step 13: Register Frontend Domain (Optional)

If you want a standalone frontend:

```bash
# Deploy Next.js frontend to Vercel
cd frontend
vercel --prod

# Or self-host
docker build -t origin-defender-frontend .
docker run -p 3000:3000 origin-defender-frontend
```

Configure environment variables:

```env
NEXT_PUBLIC_API_URL=https://api.origin-defender.xyz/v1
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
NEXT_PUBLIC_PROGRAM_ID=YOUR_PROGRAM_ID
```

---

## Step 14: Setup CI/CD (GitHub Actions)

We provide workflows in `.github/workflows/`:

- `test.yml`: Runs `anchor test` on PR
- `deploy.yml`: Deploys program on tag (mainnet only)
- `docker-build.yml`: Builds and pushes off-chain services

Configure secrets in GitHub repo settings:

- `SOLANA_KEYPAIR`: base64-encoded keypair
- `RPC_URL`: mainnet RPC (Helius/QuickNode)
- `DOCKER_USERNAME` / `DOCKER_PASSWORD`: For pushing images

---

## Troubleshooting

### "Program failed to commit: insufficient funds"

- Your deployment wallet lacks SOL. Airdrop on devnet or fund on mainnet.

### "Insufficient funds for rent"

- Account creation requires rent-exempt balance. Some PDAs need ~0.02 SOL each. Ensure you have enough.

### "Similarity service not responding"

- Check Docker containers: `docker ps`
- View logs: `docker-compose logs similarity-api`
- Restart: `docker-compose restart similarity-api`

### "JWT verification failed"

- Ensure JWT secret matches between verification server and frontend
- Check server logs for signature errors

### "OAuth redirect URI mismatch"

- Configure correct redirect URIs in Twitter/Discord developer console:
  - `http://localhost:3000/auth/twitter/callback` (dev)
  - `https://yourdomain.com/auth/twitter/callback` (prod)

---

## Maintenance

### Updating the Program

1. Make changes
2. `anchor build`
3. `anchor deploy --provider.cluster mainnet-beta`
4. If you need to migrate state (rare), write a migration script that reads old PDAs and writes to new program IDs.

### Rebuilding FAISS Index

When narrative count grows large (>100k), rebuild index:

```bash
npx ts-node scripts/rebuild_faiss_index.ts
```

This will:
1. Fetch all NarrativeRecords from PostgreSQL
2. Recompute embeddings for any that changed
3. Write new FAISS index
4. Atomically swap index file

### Rotating JWT Secrets

1. Add new secret to verification server config (keep old)
2. Issue JWTs with new secret (both accepted during transition)
3. After 7 days, remove old secret
4. Update frontend if using static secret

---

## Security Checklist Before Mainnet Launch

- [ ] Program ID locked in code (no development key)
- [ ] Admin multisig (not single wallet) controls GlobalState authority
- [ ] Off-chain services behind load balancer, no direct public access to PostgreSQL
- [ ] Redis auth enabled, no default password
- [ ] JWT secret rotated, stored in environment variable (not in code)
- [ ] OAuth app set to production mode (no test users)
- [ ] Rate limiting enabled on all public endpoints
- [ ] Monitoring alerts configured
- [ ] Backup of FAISS index + PostgreSQL daily
- [ ] Incident response plan documented

---

## Need Help?

- Open an issue on GitHub
- Join Discord: `discord.gg/origin-defender`
- Email: dev@origin-defender.xyz
