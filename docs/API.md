# OriginDefender API Reference

## Base URL

```
https://api.origin-defender.xyz/v1
```

(Development: `http://localhost:8000/v1`)

---

## Authentication

Most endpoints require an API key in header:

```
X-API-Key: your_api_key_here
```

Admin/oracle endpoints require JWT bearer token:

```
Authorization: Bearer <jwt_token>
```

---

## Endpoints

### 1. Check Derivative

Check if a proposed token narrative is derivative of an existing one.

**Request:**

```http
POST /check_derivative
Content-Type: application/json
X-API-Key: <key>
```

```json
{
  "narrative": {
    "mission_statement": "Trump Dog is the only memecoin that donates 10% of fees to secure the southern border",
    "lore": "Born from a meme where Trump pet a dog that looked like him...",
    "visual_theme": "American flag colors, presidential seal elements",
    "tokenomics": "10% tax, 5% to border wall donations, 5% to liquidity",
    "differentiators": "First Trump token with on-chain donation tracking"
  },
  "creator_wallet": "51yRZMqwazUaksziayNome9H5VvzhibtP4C3FP2KX7Ff",
  "threshold": 0.85
}
```

**Response:**

```json
{
  "is_derivative": true,
  "origin_mint": "TokenmintAddr...",
  "origin_name": "TRUMP",
  "origin_creator": "CreatorWallet...",
  "similarity": 0.92,
  "suggested_lock_percentage": 40,
  "warning": "Your narrative is 92% similar to an existing token. Consider adding unique tokenomics or utility."
}
```

If no similar narrative found:

```json
{
  "is_derivative": false,
  "origin_mint": null,
  "similarity": 0.0,
  "suggested_lock_percentage": 30,
  "message": "Narrative appears original. Good luck!"
}
```

**Error Codes:**

- `400`: Invalid narrative (missing required fields)
- `429`: Rate limit exceeded
- `500`: Embedding service error

---

### 2. Calculate Visibility Score

Get the discovery visibility score for a given token.

**Request:**

```http
GET /visibility/{mint}?include_metrics=true
```

**Response:**

```json
{
  "mint": "TokenmintAddr...",
  "visibility_score": 2.87,
  "components": {
    "base": 1.0,
    "origin_bonus": 1.0,
    "backer_multiplier": 1.4,
    "liquidity_multiplier": 1.34
  },
  "badge": "origin",
  "backer_density": 0.23,
  "locked_ratio": 0.35,
  "suspicion_index": 0.05
}
```

---

### 3. Submit JWT for Backer Verification

After OAuth, the frontend submits the JWT to get a nonce for on-chain submission.

**Request:**

```http
POST /backer/verify_jwt
Content-Type: application/json
X-API-Key: <key>
```

```json
{
  "jwt": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...",
  "token_mint": "TokenmintAddr..."
}
```

**Response:**

```json
{
  "valid": true,
  "wallet": "0xUserWallet...",
  "social_platform": "twitter",
  "social_handle": "@user",
  "follower_count": 1542,
  "nonce": "a1b2c3d4e5",
  "expires_in": 3600,
  "message": "JWT valid. Use this nonce when calling record_verified_backer on-chain."
}
```

If invalid:

```json
{
  "valid": false,
  "error": "Invalid signature or expired token"
}
```

---

### 4. Get Token Metrics (Public)

Get aggregated metrics for a token without API key.

**Request:**

```http
GET /metrics/{mint}
```

**Response:**

```json
{
  "mint": "TokenmintAddr...",
  "name": "Trump Dog",
  "symbol": "TRUMP",
  "badge": "origin",
  "backer_count": 73,
  "backer_density": 0.23,
  "locked_ratio": 0.35,
  "narrative_bond_sol": 2.5,
  "suspicion_index": 0.05,
  "similar_tokens": [
    {
      "mint": "OtherTokenMint",
      "name": "Trump Dog Clone",
      "similarity": 0.94,
      "status": "derivative"
    }
  ]
}
```

---

### 5. Oracle Dashboard APIs

These require JWT authentication with oracle role.

#### 5.1 List Pending Derivative Reviews

```http
GET /oracle/pending?since_hours=48
```

```json
{
  "pending": [
    {
      "mint": "Tokenmint...",
      "name": "Elon Cat 2",
      "creator": "Wallet...",
      "registered_at": 1742235600,
      "similar_to": "OriginTokenMint",
      "similarity": 0.91,
      "lock_percentage": 15,
      "backer_count": 2,
      "suspicion_index": 0.95
    }
  ]
}
```

#### 5.2 Submit Oracle Vote

```http
POST /oracle/vote
Content-Type: application/json
Authorization: Bearer <jwt>
```

```json
{
  "mint": "Tokenmint...",
  "vote": "flag_derivative",  // or "certify", "no_action"
  "reason": "Exact copy of mission statement and tokenomics"
}
```

Response:

```json
{
  "success": true,
  "vote_recorded": true,
  "current_votes": {
    "certify": 2,
    "flag_derivative": 7,
    "total": 9,
    "quorum": 6
  },
  "action_taken": "flag_derivative",
  "quorum_reached": true
}
```

When 2/3 quorum votes flag_derivative, the token's `origin_badge` is set to false on-chain via `update_narrative_metrics` instruction signed by admin bot (or multisig).

---

### 6. Indexer Event Stream (WebSocket)

Real-time event stream for frontend updates.

**WebSocket URL:**

```
wss://api.origin-defender.xyz/v1/events
```

**Subscribe:**

```json
{
  "type": "subscribe",
  "channels": ["narrative_registered", "backer_verified", "bond_slashed"]
}
```

**Events:**

```json
{
  "type": "narrative_registered",
  "data": {
    "mint": "Tokenmint...",
    "creator": "Wallet...",
    "timestamp": 1742235600,
    "origin_badge": true,
    "lock_amount": 1000000000, // lamports
    "bond_amount": 2500000000
  }
}
```

```json
{
  "type": "backer_verified",
  "data": {
    "wallet": "Wallet...",
    "token_mint": "Tokenmint...",
    "social_handle": "@user",
    "follower_count": 1542
  }
}
```

---

## Data Models

### NarrativeRecord (API view)

```typescript
interface NarrativeRecord {
  mint: string;
  name?: string;           // from metadata
  symbol?: string;
  creator: string;
  narrative_hash: string;  // hex
  registered_at: number;   // unix timestamp
  lock_amount: number;     // SOL lamports
  lock_duration: number;   // days
  narrative_bond: number;  // SOL lamports
  origin_badge: boolean;
  similar_to?: string;     // mint of origin
  backer_count: number;
  backer_density: number;  // 0-1
  suspicion_index: number; // 0-1
  is_active: boolean;
}
```

### BackerRecord

```typescript
interface BackerRecord {
  wallet: string;
  token_mint: string;
  social_platform: 'twitter' | 'discord';
  social_handle: string;
  follower_count: number;
  verified_at: number;
  is_early_backer: boolean;
}
```

---

## Rate Limits

- Public endpoints (/metrics, /visibility): 100 req/min per IP
- Authenticated endpoints: 1000 req/min per API key
- JWT verification: 500 req/min per IP

---

## Error Handling

All errors return JSON:

```json
{
  "error": "ErrorCode",
  "message": "Human-readable description",
  "details": { ...optional additional info }
}
```

Common errors:

- `rate_limited`: Too many requests, retry after `retry_after` seconds
- `invalid_signature`: JWT signature verification failed
- `narrative_too_short`: Minimum 200 characters required
- `similarity_service_down`: Try again later

---

## SDKs

We provide a TypeScript/JavaScript SDK:

```bash
npm install origin-defender-sdk
```

```typescript
import { OriginDefenderClient } from 'origin-defender-sdk';

const client = new OriginDefenderClient({
  apiKey: 'your_api_key',
  baseUrl: 'https://api.origin-defender.xyz/v1'
});

// Check derivative
const result = await client.checkDerivative({
  mission_statement: '...',
  lore: '...',
  // ...
});

console.log(result.is_derivative); // true/false
console.log(result.similarity);    // 0.92
```

SDK also includes Solana instruction builders for on-chain calls.

---

## Webhooks

You can configure webhooks to receive events (e.g., when a token you created gets flagged as derivative).

```
POST https://your-server.com/webhooks/origin-defender
Headers:
  X-OriginDefender-Signature: <hmac_sha256_of_body_using_secret>
Body:
{
  "type": "bond_slashed",
  "data": { ... }
}
```

Configure webhook URLs via admin dashboard or API:

```http
POST /admin/webhooks
Authorization: Bearer <admin_jwt>
{
  "url": "https://your-server.com/webhooks",
  "events": ["narrative_registered", "bond_slashed"],
  "secret": "your_webhook_secret"
}
```

---

## Health Checks

```
GET /health
```

Returns:

```json
{
  "status": "ok",
  "timestamp": 1742235600,
  "services": {
    "embedding": "healthy",
    "postgres": "healthy",
    "redis": "healthy",
    "solana_rpc": "healthy"
  }
}
```

---


