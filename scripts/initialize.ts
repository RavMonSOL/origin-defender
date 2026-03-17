#!/usr/bin/env ts-node
/**
 * OriginDefender Initialize Script
 *
 * Run after deployment to set up GlobalState.
 *
 * Usage:
 *   npx ts-node scripts/initialize.ts [programId] [authorityKeypairPath?]
 *
 * Example:
 *   npx ts-node scripts/initialize.ts FIXME1234 ~/.config/solana/id.json
 */

import * as anchor from "@coral-xyz/anchor";
import { OriginDefender } from "../target/types/origin_defender";
import fs from "fs";
import path from "path";

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: initialize.ts <programId> [keypairPath]");
    process.exit(1);
  }

  const programId = new anchor.web3.PublicKey(args[0]);

  let wallet: anchor.Wallet;
  if (args[1]) {
    // Load keypair from file
    const keypairData = JSON.parse(fs.readFileSync(path.resolve(args[1]), "utf-8"));
    const secretKey = Uint8Array.from(keypairData);
    const payer = anchor.web3.Keypair.fromSecretKey(secretKey);
    wallet = new anchor.Wallet(payer);
  } else {
    // Use default wallet (env: ANCHOR_WALLET)
    const payer = anchor.web3.Keypair.fromSecretKey(
      Uint8Array.from(
        JSON.parse(
          fs.readFileSync(
            process.env.ANCHOR_WALLET || path.resolve("~/.config/solana/id.json"),
            "utf-8"
          )
        )
      )
    );
    wallet = new anchor.Wallet(payer);
  }

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

  // Derive PDA for global state
  const [globalStatePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    programId
  );

  try {
    const tx = await program.methods
      .initialize()
      .accounts({
        globalState: globalStatePda,
        authority: wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Global state initialized!");
    console.log("Transaction signature:", tx);
    console.log("Global State PDA:", globalStatePda.toBase58());
  } catch (err) {
    console.error("❌ Initialization failed:", err);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
