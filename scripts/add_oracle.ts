#!/usr/bin/env ts-node
/**
 * Add Oracle (Admin Only)
 *
 * Adds a new oracle member to the DAO.
 *
 * Usage:
 *   npx ts-node scripts/add_oracle.ts <oracle_wallet_pubkey>
 */

import * as anchor from "@coral-xyz/anchor";
import { OriginDefender } from "../target/types/origin_defender";
import fs from "fs";

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: add_oracle.ts <oracle_wallet_pubkey> [programId]");
    process.exit(1);
  }

  const oracleWallet = new anchor.web3.PublicKey(args[0]);
  const programIdStr = args[1] || process.env.PROGRAM_ID;
  if (!programIdStr) {
    console.error("PROGRAM_ID environment variable required");
    process.exit(1);
  }
  const programId = new anchor.web3.PublicKey(programIdStr);

  // Load wallet
  const keypairData = JSON.parse(
    fs.readFileSync(
      process.env.ANCHOR_WALLET || path.resolve("~/.config/solana/id.json"),
      "utf-8"
    )
  );
  const secretKey = Uint8Array.from(keypairData);
  const payer = anchor.web3.Keypair.fromSecretKey(secretKey);
  const wallet = new anchor.Wallet(payer);

  const provider = new anchor.AnchorProvider(
    anchor.web3.clusterApiUrl("mainnet-beta"),
    wallet,
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const program = new anchor.Program(
    {} as any,
    { address: programId, provider }
  ) as OriginDefender;

  // Derive global state PDA to get next_oracle_index
  const [globalStatePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    programId
  );

  // Derive oracle record PDA
  const global = await program.account.globalState.fetch(globalStatePda);
  const oracleIndex = global.nextOracleIndex; // will be used in PDA seed
  const [oracleRecordPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("oracle"), oracleWallet.toBuffer(), Buffer.from(new Uint8Array([oracleIndex]))],
    programId
  );

  try {
    const tx = await program.methods
      .updateOracle(0) // 0 = add
      .accounts({
        admin: wallet.publicKey,
        globalState: globalStatePda,
        oracleWallet: oracleWallet,
        oracleRecord: oracleRecordPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Oracle added!");
    console.log("Transaction:", tx);
    console.log("Oracle wallet:", oracleWallet.toBase58());
    console.log("Oracle record PDA:", oracleRecordPda.toBase58());
  } catch (err) {
    console.error("❌ Failed to add oracle:", err);
    process.exit(1);
  }
}

main().catch(console.error);
