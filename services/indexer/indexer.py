#!/usr/bin/env python3
"""
OriginDefender + bags.fm Indexer

Listens to on-chain events and maintains a PostgreSQL cache of:
- NarrativeRecords (origin_defender program)
- Bonding curve state (bags.fm program)
- Combined metrics for API serving

Usage:
    python indexer.py

Environment variables:
    DATABASE_URL – PostgreSQL connection string
    SOLANA_RPC_URL – RPC endpoint (mainnet-beta)
    ORIGIN_DEFENDER_PROGRAM_ID – OriginDefender program ID
    BAGS_PROGRAM_ID – bags.fm program ID (default: BAGSW19DgadF4px3znCzHg8bXVVF4Dr17omvRS3VCkn)
    COMMITMENT – 'confirmed' or 'finalized' (default: confirmed)
"""

import os
import asyncio
import json
import logging
from typing import Optional, Any
from dataclasses import dataclass

import psycopg2
from solana.rpc.async_api import AsyncClient
from solana.rpc.websocket_api import connect
from solana.publickey import PublicKey

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
DATABASE_URL = os.getenv("DATABASE_URL")
SOLANA_RPC_URL = os.getenv("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")
ORIGIN_DEFENDER_PROGRAM_ID = PublicKey(os.getenv("ORIGIN_DEFENDER_PROGRAM_ID"))
BAGS_PROGRAM_ID = PublicKey(
    os.getenv(
        "BAGS_PROGRAM_ID",
        "BAGSW19DgadF4px3znCzHg8bXVVF4Dr17omvRS3VCkn"
    )
)
COMMITMENT = os.getenv("COMMITMENT", "confirmed")

# PDA seeds (matching the programs)
GLOBAL_SEED = b"global"
NARRATIVE_SEED = b"narrative"
BOND_SEED = b"bond"

@dataclass
class NarrativeRecord:
    mint: str
    creator: str
    narrative_hash: str
    registered_at: int
    bond_amount: int
    origin_badge: bool
    similar_to: Optional[str]
    backer_count: int = 0
    backer_density: float = 0.0
    suspicion_index: float = 0.0
    is_active: bool = False

@dataclass
class BondingCurveState:
    mint: str
    real_sol_reserves: int
    real_token_reserves: int
    token_total_supply: int
    complete: bool
    creator: str

class Indexer:
    def __init__(self):
        self.conn = psycopg2.connect(DATABASE_URL)
        self.conn.autocommit = True
        self.rpc: Optional[AsyncClient] = None
        self.ws: Optional[Any] = None  # websocket connection

    async def start(self):
        self.rpc = AsyncClient(SOLANA_RPC_URL)
        await self.subscribe_program_logs(ORIGIN_DEFENDER_PROGRAM_ID, self.handle_origin_defender_log)
        await self.subscribe_program_logs(BAGS_PROGRAM_ID, self.handle_bagsfm_log)
        # Keep running
        while True:
            await asyncio.sleep(3600)

    async def subscribe_program_logs(self, program_id: PublicKey, callback):
        """Subscribe to program logs via WebSocket."""
        try:
            logger.info(f"Subscribing to program logs: {program_id}")
            async with connect(SOLANA_RPC_URL.replace("https://", "wss://").replace("http://", "ws://")) as ws:
                await ws.logs_subscribe(commitment=COMMITMENT)
                first_resp = await ws.recv()
                subscription_id = first_resp[0].result
                logger.info(f"Subscription ID: {subscription_id}")

                async for msg in ws:
                    try:
                        result = msg[0].result
                        if result.value.err:
                            continue
                        log_messages = result.value.logs
                        # Check if program ID appears in the transaction
                        # The logs include "Program <pubkey> invoke [x]"
                        # We'll also need to parse transaction meta to get accounts
                        # For simplicity, we fetch the transaction details via RPC if needed.
                        await callback(log_messages, result.value.signature)
                    except Exception as e:
                        logger.error(f"Error processing log: {e}")
        except Exception as e:
            logger.error(f"Subscription failed: {e}")
            await asyncio.sleep(5)
            # retry
            await self.subscribe_program_logs(program_id, callback)

    async def handle_origin_defender_log(self, logs, signature):
        """Parse OriginDefender events and update DB."""
        # Events are emitted via emit! macro; they appear in logs as "Program log: <event_json>"
        for line in logs:
            if line.startswith("Program log: "):
                try:
                    payload = json.loads(line[len("Program log: "):])
                    event_name = payload.get("event")
                    data = payload.get("data", {})
                    if event_name == "NarrativeRegistered":
                        await self.upsert_narrative(data)
                    elif event_name == "BackerVerified":
                        await self.upsert_backer(data)
                    elif event_name == "BondSlashed":
                        await self.update_bond_slashed(data)
                    elif event_name == "LiquidityLocked":
                        # optional
                        pass
                except json.JSONDecodeError:
                    logger.debug(f"Ignoring non-JSON log: {line}")

    async def handle_bagsfm_log(self, logs, signature):
        """Parse bags.fm Create events and update bonding curve state."""
        for line in logs:
            if line.startswith("Program log: "):
                try:
                    payload = json.loads(line[len("Program log: "):])
                    # bags.fm may emit structured logs; however the format is not standard JSON.
                    # Instead, we might need to decode the instruction data via IDL.
                    # For demo, we'll rely on transaction parsing: fetch transaction by signature
                    # and inspect inner instructions.
                    # Simplifying: we'll treat any Create as a signal to fetch bonding curve.
                    # We can detect via instruction discriminator from create.rs (already known).
                    pass
                except json.JSONDecodeError:
                    pass
        # Fallback: fetch transaction and parse inner instructions
        try:
            tx = await self.rpc.get_transaction(signature, encoding="jsonParsed", max_supported_transaction_version=0)
            if tx and tx.value:
                # Look for instruction where program_id = BAGS_PROGRAM_ID (bags.fm) and data discriminator matches CreateBag.
                # The jsonParsed format may show instruction type if the IDL is known; not guaranteed.
                # For robust solution, use bags.fm IDL or a decoder; but for now we'll assume we can identify.
                await self.maybe_fetch_bonding_curve(tx.value)
        except Exception as e:
            logger.error(f"Error fetching tx {signature}: {e}")

    async def maybe_fetch_bonding_curve(self, tx):
        """Given a bags.fm transaction, attempt to extract the mint and bonding curve."""
        # Not implemented fully; this would inspect transaction accounts and instruction data
        # In production, use a proper decoder.
        pass

    async def upsert_narrative(self, data: dict):
        """Insert or update NarrativeRecord in PostgreSQL."""
        with self.conn.cursor() as cur:
            cur.execute("""
                INSERT INTO narrative_records
                (mint, creator, narrative_hash, registered_at, lock_amount, lock_duration,
                 narrative_bond, origin_badge, similar_to, is_active, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (mint) DO UPDATE SET
                    creator = EXCLUDED.creator,
                    narrative_hash = EXCLUDED.narrative_hash,
                    registered_at = EXCLUDED.registered_at,
                    lock_amount = EXCLUDED.lock_amount,
                    lock_duration = EXCLUDED.lock_duration,
                    narrative_bond = EXCLUDED.narrative_bond,
                    origin_badge = EXCLUDED.origin_badge,
                    similar_to = EXCLUDED.similar_to,
                    is_active = EXCLUDED.is_active,
                    updated_at = NOW();
            """, (
                data["mint"],
                data["creator"],
                data["narrative_hash"],
                data["registered_at"],
                data.get("lock_amount", 0),
                data.get("lock_duration", 0),
                data["narrative_bond"],
                data["origin_badge"],
                data.get("similar_to"),
                data.get("is_active", False),
            ))
            logger.info(f"Upserted NarrativeRecord for mint {data['mint']}")

    async def upsert_backer(self, data: dict):
        """Insert or update BackerRecord."""
        with self.conn.cursor() as cur:
            cur.execute("""
                INSERT INTO backer_records
                (wallet, token_mint, social_platform, social_handle, follower_count, verified_at, is_early_backer)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (wallet, token_mint) DO UPDATE SET
                    social_platform = EXCLUDED.social_platform,
                    social_handle = EXCLUDED.social_handle,
                    follower_count = EXCLUDED.follower_count,
                    verified_at = EXCLUDED.verified_at,
                    is_early_backer = EXCLUDED.is_early_backer;
            """, (
                data["wallet"],
                data["token_mint"],
                data["social_platform"],
                data["social_handle"],
                data["follower_count"],
                data["verified_at"],
                data.get("is_early_backer", False),
            ))

    async def update_bond_slashed(self, data: dict):
        """Update narrative bond status."""
        with self.conn.cursor() as cur:
            cur.execute("""
                UPDATE narrative_bonds
                SET is_slashed = true, slash_percentage = %s
                WHERE mint = %s;
            """, (data.get("slash_percentage", 100), data["mint"]))

    async def fetch_and_store_bonding_curve(self, mint: str):
        """Fetch bonding curve account data and store (bags.fm compatible)."""
        try:
            # For bags.fm: derive Bag PDA first: seeds = ["bag", mint]
            mint_pubkey = PublicKey(mint)
            bag_pda = PublicKey.find_program_address(
                [b"bag", bytes(mint_pubkey)],
                BAGS_PROGRAM_ID
            )[0]
            # Then derive Bonding Curve PDA: seeds = ["bonding-curve", bag]
            bonding_curve_pda = PublicKey.find_program_address(
                [b"bonding-curve", bytes(bag_pda)],
                BAGS_PROGRAM_ID
            )[0]
            account_info = await self.rpc.get_account_info(bonding_curve_pda)
            if not account_info.value:
                logger.warning(f"No bonding curve account for {mint}")
                return
            data = account_info.value.data
            # Deserialize BondingCurveAccount according to official bags.fm docs
            # Layout (all u64 le, then bool):
            # discriminator (8), virtual_token_reserves (8), virtual_sol_reserves (8),
            # real_token_reserves (8), real_sol_reserves (8), token_total_supply (8),
            # complete (1)
            import struct
            offset = 0
            discriminator = struct.unpack_from("<Q", data, offset)[0]; offset += 8
            virtual_token_reserves = struct.unpack_from("<Q", data, offset)[0]; offset += 8
            virtual_sol_reserves = struct.unpack_from("<Q", data, offset)[0]; offset += 8
            real_token_reserves = struct.unpack_from("<Q", data, offset)[0]; offset += 8
            real_sol_reserves = struct.unpack_from("<Q", data, offset)[0]; offset += 8
            token_total_supply = struct.unpack_from("<Q", data, offset)[0]; offset += 8
            complete = struct.unpack_from("<B", data, offset)[0]; offset += 1
            # No creator field stored; we will get creator from narrative_records.creator
            # via join in DB or from the NarrativeRecord we already stored.

            with self.conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO bonding_curves
                    (mint, bonding_curve, real_token_reserves, real_sol_reserves, token_total_supply, complete, creator, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (mint) DO UPDATE SET
                        real_token_reserves = EXCLUDED.real_token_reserves,
                        real_sol_reserves = EXCLUDED.real_sol_reserves,
                        token_total_supply = EXCLUDED.token_total_supply,
                        complete = EXCLUDED.complete,
                        updated_at = NOW();
                """, (
                    mint,
                    bonding_curve_pda.to_base58(),
                    real_token_reserves,
                    real_sol_reserves,
                    token_total_supply,
                    complete,
                    creator,
                ))
            logger.info(f"Updated bonding curve for {mint}")
        except Exception as e:
            logger.error(f"Error fetching bonding curve {mint}: {e}")

async def main():
    indexer = Indexer()
    await indexer.start()

if __name__ == "__main__":
    asyncio.run(main())
