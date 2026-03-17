-- PostgreSQL schema for OriginDefender

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Narrative records (on-chain data mirrored for query)
CREATE TABLE narrative_records (
    mint VARCHAR(66) PRIMARY KEY,
    creator VARCHAR(44) NOT NULL,
    narrative_hash CHAR(64) NOT NULL,
    registered_at BIGINT NOT NULL,
    lock_amount BIGINT, -- lamports
    lock_duration INT, -- days
    narrative_bond BIGINT, -- lamports
    origin_badge BOOLEAN NOT NULL DEFAULT true,
    similar_to VARCHAR(66) NULL,
    backer_count INT NOT NULL DEFAULT 0,
    backer_density FLOAT NOT NULL DEFAULT 0.0,
    suspicion_index FLOAT NOT NULL DEFAULT 0.0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Narrative embeddings for similarity search
CREATE TABLE narrative_embeddings (
    mint VARCHAR(66) PRIMARY KEY,
    faiss_id INT UNIQUE, -- maps to FAISS index ID
    embedding VECTOR(384), -- all-MiniLM-L6-v2 dimension
    narrative_hash CHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Backer records (mirrored from chain)
CREATE TABLE backer_records (
    wallet VARCHAR(44) NOT NULL,
    token_mint VARCHAR(66) NOT NULL,
    social_platform INT NOT NULL, -- 0=Twitter, 1=Discord
    social_handle VARCHAR(50) NOT NULL,
    follower_count INT NOT NULL,
    verified_at BIGINT NOT NULL,
    is_early_backer BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (wallet, token_mint)
);

-- Oracle records (mirrored)
CREATE TABLE oracle_records (
    wallet VARCHAR(44) PRIMARY KEY,
    origin_token VARCHAR(66) NOT NULL,
    added_at BIGINT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    total_fees_earned BIGINT NOT NULL DEFAULT 0
);

-- Narrative bond records (mirrored)
CREATE TABLE narrative_bonds (
    mint VARCHAR(66) PRIMARY KEY,
    creator VARCHAR(44) NOT NULL,
    amount BIGINT NOT NULL,
    posted_at BIGINT NOT NULL,
    slash_percentage INT NOT NULL DEFAULT 0,
    is_slashed BOOLEAN NOT NULL DEFAULT false
);

-- Indexes for fast queries
CREATE INDEX idx_narrative_records_creator ON narrative_records(creator);
CREATE INDEX idx_narrative_records_similar_to ON narrative_records(similar_to) WHERE similar_to IS NOT NULL;
CREATE INDEX idx_backer_records_token_mint ON backer_records(token_mint);
CREATE INDEX idx_backer_records_early ON backer_records(token_mint, is_early_backer) WHERE is_early_backer = true;

-- Token metadata cache (from Metaplex or simple scraping)
CREATE TABLE token_metadata (
    mint VARCHAR(66) PRIMARY KEY,
    name VARCHAR(100),
    symbol VARCHAR(20),
    image_url TEXT,
    decimals INT DEFAULT 9,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Event logs (for debugging/audit)
CREATE TABLE event_logs (
    id BIGSERIAL PRIMARY KEY,
    event_name VARCHAR(100) NOT NULL,
    data JSONB NOT NULL,
    signature VARCHAR(88),
    slot BIGINT,
    block_time BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for narrative_records
CREATE TRIGGER update_narrative_records_updated_at
    BEFORE UPDATE ON narrative_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for token_metadata
CREATE TRIGGER update_token_metadata_updated_at
    BEFORE UPDATE ON token_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Bonding curve state from Pump.fun (cached)
-- Note: creator is denormalized from narrative_records; may be NULL if not yet registered
CREATE TABLE bonding_curves (
    mint VARCHAR(66) PRIMARY KEY,
    bonding_curve VARCHAR(66) NOT NULL,
    real_token_reserves BIGINT NOT NULL,
    real_sol_reserves BIGINT NOT NULL,
    token_total_supply BIGINT NOT NULL,
    complete BOOLEAN NOT NULL,
    creator VARCHAR(44) NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_bonding_curves_sol ON bonding_curves(real_sol_reserves DESC);

-- Combined metrics view for API (materialized view can be refreshed periodically)
-- Not creating now; the API will join tables directly or use a denormalized query.
