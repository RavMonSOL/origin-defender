"""
OriginDefender Similarity API
Provides narrative fingerprinting and derivative detection.
"""

import os
import io
import json
import hashlib
import logging
from typing import Optional, List, Tuple
from dataclasses import dataclass

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import numpy as np
from sentence_transformers import SentenceTransformer
import faiss
import psycopg2
from psycopg2.extras import RealDictCursor
import redis

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="OriginDefender Similarity API", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for prod
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load environment
DATABASE_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL")
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
FAISS_INDEX_PATH = os.getenv("FAISS_INDEX_PATH", "/data/faiss.index")
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.85"))

# Global components (initialize at startup)
model: Optional[SentenceTransformer] = None
index: Optional[faiss.Index] = None
db_conn = None
redis_client = None

# --------------------- Data Models ---------------------

class NarrativeInput(BaseModel):
    mission_statement: str = Field(..., min_length=20)
    lore: str = Field(..., min_length=20)
    visual_theme: Optional[str] = None
    tokenomics: Optional[str] = None
    differentiators: Optional[str] = None

class DerivativeCheckResponse(BaseModel):
    is_derivative: bool
    origin_mint: Optional[str] = None
    origin_name: Optional[str] = None
    origin_creator: Optional[str] = None
    similarity: float
    suggested_lock_percentage: int
    warning: Optional[str] = None

class MetricsResponse(BaseModel):
    mint: str
    name: Optional[str]
    symbol: Optional[str]
    badge: str  # "origin", "derivative", "vamp"
    backer_count: int
    backer_density: float
    liquidity_ratio: float  # real_sol_reserves / initial_virtual_sol (capped at 2.0)
    narrative_bond_sol: float
    suspicion_index: float
    similar_tokens: List[dict]

# --------------------- Startup ---------------------

@app.on_event("startup")
async def startup_event():
    global model, index, db_conn, redis_client

    logger.info("Loading embedding model...")
    model = SentenceTransformer(EMBEDDING_MODEL_NAME)

    logger.info("Connecting to PostgreSQL...")
    db_conn = psycopg2.connect(DATABASE_URL)
    db_conn.autocommit = True

    logger.info("Connecting to Redis...")
    redis_client = redis.from_url(REDIS_URL)

    logger.info("Loading FAISS index...")
    if os.path.exists(FAISS_INDEX_PATH):
        index = faiss.read_index(FAISS_INDEX_PATH)
        logger.info(f"FAISS index loaded: {index.ntotal} vectors")
    else:
        logger.warning("FAISS index not found; creating empty index")
        # Create empty index with 384 dimensions (all-MiniLM-L6-v2)
        index = faiss.IndexFlatIP(384)

    logger.info("Similarity API ready.")

@app.on_event("shutdown")
async def shutdown_event():
    global db_conn, redis_client
    if db_conn:
        db_conn.close()
    if redis_client:
        redis_client.close()

# --------------------- Utility Functions ---------------------

def narrative_to_text(narrative: NarrativeInput) -> str:
    """Combine narrative fields into a single weighted text for embedding."""
    parts = [
        narrative.mission_statement,
        narrative.lore,
        narrative.visual_theme or "",
        narrative.tokenomics or "",
        narrative.differentiators or "",
    ]
    # Duplicate mission and differentiators to give them more weight (simple trick)
    weighted = " ".join([parts[0]] * 2 + parts[1:] + [parts[4]] * 2)
    return weighted.strip()

def compute_narrative_hash(narrative_text: str) -> str:
    """Compute SHA256 of the embedding vector."""
    embedding = model.encode(narrative_text, convert_to_numpy=True, normalize_embeddings=True)
    embedding_bytes = embedding.astype(np.float32).tobytes()
    return hashlib.sha256(embedding_bytes).hexdigest()

def store_embedding_in_db(mint: str, embedding: np.ndarray, narrative_hash: str):
    """Store embedding vector in PostgreSQL (pgvector) for future reference."""
    with db_conn.cursor() as cur:
        cur.execute("""
            INSERT INTO narrative_embeddings (mint, embedding, narrative_hash, created_at)
            VALUES (%s, %s, %s, NOW())
            ON CONFLICT (mint) DO UPDATE
            SET embedding = EXCLUDED.embedding, narrative_hash = EXCLUDED.narrative_hash;
        """, (mint, embedding.tolist(), narrative_hash))

def search_similar_narratives(embedding: np.ndarray, exclude_mint: Optional[str] = None, k: int = 5) -> List[Tuple[str, float]]:
    """Search FAISS index for nearest neighbor narratives."""
    if index.ntotal == 0:
        return []

    # Normalize embedding (cosine similarity)
    embedding = embedding / np.linalg.norm(embedding)
    embedding_np = embedding.astype(np.float32).reshape(1, -1)

    # Search
    D, I = index.search(embedding_np, k+1)  # +1 to possibly exclude self

    results = []
    for score, idx in zip(D[0], I[0]):
        if idx == -1:
            break
        # Retrieve mint from DB or index metadata (we'll store mint in index as external array)
        # For simplicity, we assume index has associated metadata in Redis or DB
        # Here we fetch from DB
        mint = get_mint_by_faiss_id(idx)
        if mint == exclude_mint:
            continue
        results.append((mint, float(score)))
        if len(results) >= k:
            break

    return results

def get_mint_by_faiss_id(faiss_id: int) -> str:
    """Map FAISS internal ID to mint address."""
    # Could use Redis hash: "faiss:meta:{id}" -> mint
    # Or store array in shared memory. For demo, fetch from DB:
    with db_conn.cursor() as cur:
        cur.execute("SELECT mint FROM narrative_embeddings WHERE faiss_id = %s", (faiss_id,))
        row = cur.fetchone()
        if row:
            return row[0]
    return ""

def get_lock_percentage_suggested(target_mcap_usd: float) -> int:
    """Calculate suggested lock percentage based on target market cap."""
    if target_mcap_usd < 100_000:
        return 20
    if target_mcap_usd < 500_000:
        return 30
    if target_mcap_usd < 2_000_000:
        return 40
    return 50

# --------------------- Endpoints ---------------------

@app.post("/api/v1/check_derivative", response_model=DerivativeCheckResponse)
async def check_derivative(
    payload: NarrativeInput,
    x_api_key: Optional[str] = Header(None)
):
    """
    Check if a proposed narrative is derivative of existing ones.
    Requires API key.
    """
    # API key check (simple)
    if x_api_key != os.getenv("API_KEY"):
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Combine into text
    narrative_text = narrative_to_text(payload)

    # Compute embedding
    embedding = model.encode(narrative_text, convert_to_numpy=True, normalize_embeddings=True)

    # Search for similar narratives
    similar = search_similar_narratives(embedding, k=5)

    if similar and similar[0][1] >= SIMILARITY_THRESHOLD:
        origin_mint, similarity = similar[0]
        # Fetch origin metadata
        origin_info = get_narrative_metrics(origin_mint)
        suggestion = get_lock_percentage_suggested(estimate_mcap(origin_info))

        return DerivativeCheckResponse(
            is_derivative=True,
            origin_mint=origin_mint,
            origin_name=origin_info.get("name"),
            origin_creator=origin_info.get("creator"),
            similarity=similarity,
            suggested_lock_percentage=suggestion,
            warning=f"Your narrative is {round(similarity*100)}% similar to {origin_info.get('name')}. Consider differentiating or accepting 'Derivative' badge."
        )
    else:
        return DerivativeCheckResponse(
            is_derivative=False,
            origin_mint=None,
            similarity=similar[0][1] if similar else 0.0,
            suggested_lock_percentage=30,
        )

@app.get("/api/v1/metrics/{mint}", response_model=MetricsResponse)
async def get_metrics(mint: str):
    """
    Get aggregated metrics for a token.
    Public endpoint.
    """
    metrics = get_narrative_metrics(mint)
    if not metrics:
        raise HTTPException(status_code=404, detail="Token not registered with OriginDefender")

    # Fetch similar tokens
    similar = get_similar_tokens(mint, limit=3)

    return MetricsResponse(
        mint=mint,
        name=metrics.get("name"),
        symbol=metrics.get("symbol"),
        badge=metrics["badge"],
        backer_count=metrics["backer_count"],
        backer_density=metrics["backer_density"],
        liquidity_ratio=metrics["liquidity_ratio"],
        narrative_bond_sol=metrics["narrative_bond_sol"],
        suspicion_index=metrics["suspicion_index"],
        similar_tokens=similar,
    )

@app.get("/health")
async def health():
    """Health check endpoint."""
    services = {
        "postgres": "healthy" if db_conn and db_conn.closed == 0 else "unhealthy",
        "redis": "healthy" if redis_client and redis_client.ping() else "unhealthy",
        "faiss_index": "healthy" if index and index.ntotal >= 0 else "unhealthy",
        "embedding_model": "loaded" if model is not None else "missing",
    }
    return {
        "status": "ok",
        "timestamp": np.datetime64('now').astype(int),
        "services": services,
    }

# --------------------- Database Helpers ---------------------

def get_narrative_metrics(mint: str) -> Optional[dict]:
    """Fetch narrative + bonding curve metrics from PostgreSQL."""
    with db_conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT
                nr.*,
                m.name,
                m.symbol,
                bc.real_sol_reserves,
                bc.complete
            FROM narrative_records nr
            LEFT JOIN metadata m ON nr.mint = m.mint
            LEFT JOIN bonding_curves bc ON nr.mint = bc.mint
            WHERE nr.mint = %s AND nr.is_active = true
        """, (mint,))
        row = cur.fetchone()
        if not row:
            return None
        result = dict(row)
        # Compute liquidity_ratio
        INITIAL_VIRTUAL_SOL = 30_000_000_000  # from Global account
        real_sol = row.get('real_sol_reserves') or 0
        liquidity_ratio = min(real_sol / INITIAL_VIRTUAL_SOL, 2.0) if INITIAL_VIRTUAL_SOL > 0 else 0.0
        result['liquidity_ratio'] = liquidity_ratio
        # Rename narrative_bond from lamports to SOL for frontend
        result['narrative_bond_sol'] = (row.get('narrative_bond') or 0) / 1e9
        return result

def get_similar_tokens(mint: str, limit: int = 3) -> List[dict]:
    """Get tokens flagged as similar to this one."""
    with db_conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT nr.mint, m.name, nr.suspicion_index
            FROM narrative_records nr
            JOIN metadata m ON nr.mint = m.mint
            WHERE nr.similar_to = %s AND nr.mint != %s
            ORDER BY nr.suspicion_index DESC
            LIMIT %s
        """, (mint, mint, limit))
        return [dict(row) for row in cur.fetchall()]

def estimate_mcap(metrics: dict) -> float:
    """Estimate market cap from on-chain or metadata (placeholder)."""
    # In production, fetch from Birdeye or Jupiter
    # For now, return a default that suggests 30% lock
    return 500_000  # $500k

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
