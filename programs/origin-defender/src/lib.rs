use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock::Clock;

declare_id!("FIXME_REPLACE_WITH_YOUR_PROGRAM_ID");

#[program]
pub mod origin_defender {
    use super::*;

    /// Initialize global state (admin only)
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let global = &mut ctx.accounts.global_state;
        global.authority = ctx.accounts.authority.key();
        global.initialized = true;
        global.narrative_count = 0;
        global.oracle_count = 0;
        global.fee_basis_points = 10; // 0.1%
        global.next_oracle_index = 0;
        Ok(())
    }

    /// Register a new token narrative
    pub fn register_narrative(
        ctx: Context<RegisterNarrative>,
        lock_amount: u64,
        lock_duration: i64,
        narrative_bond: Option<u64>,
        similar_to: Option<Pubkey>,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let record = &mut ctx.accounts.narrative_record;

        record.mint = ctx.accounts.mint.key();
        record.creator = ctx.accounts.creator.key();
        record.narrative_hash = ctx.accounts.narrative_hash;
        record.registered_at = clock.unix_timestamp;
        record.lock_amount = lock_amount;
        record.lock_duration = lock_duration;
        record.narrative_bond = narrative_bond.unwrap_or(0);
        record.origin_badge = similar_to.is_none(); // Origin if no similar origin provided
        record.similar_to = similar_to;
        record.backer_count = 0;
        record.backer_density = 0.0;
        record.suspicion_index = 0.0;
        record.is_active = true;

        // If similar_to is set, we're a derivative; origin_badge false already set
        // (similarity verification must be done off-chain; this just records the claim)

        // Create vesting account if lock_amount > 0
        if lock_amount > 0 {
            // Vesting account will be created separately with proper seeds
            // We just record intent here
        }

        // Create narrative bond account if narrative_bond > 0
        if narrative_bond.unwrap_or(0) > 0 {
            // Bond transfer must happen via CPI before calling this,
            // or we could do it here with a transfer from creator
            // For simplicity, we assume transfer happened before instruction
        }

        emit!(NarrativeRegistered {
            mint: record.mint,
            creator: record.creator,
            timestamp: record.registered_at,
            lock_amount,
            bond_amount: record.narrative_bond,
            similar_to: record.similar_to,
        });

        Ok(())
    }

    /// Record a verified early backer for a token
    pub fn record_verified_backer(
        ctx: Context<RecordVerifiedBacker>,
        social_platform: u8,
        social_handle: String,
        follower_count: u32,
    ) -> Result<()> {
        // Check that wallet hasn't already recorded for this token
        // (PDA seeds guarantee uniqueness, but we may want to prevent multiple socials)
        let record = &mut ctx.accounts.backer_record;
        record.wallet = ctx.accounts.backer_wallet.key();
        record.token_mint = ctx.accounts.token_mint.key();
        record.social_platform = social_platform;
        record.social_handle = social_handle.clone();
        record.follower_count = follower_count;
        record.verified_at = Clock::get()?.unix_timestamp;
        record.is_early_backer = false; // Will be set later by admin/market maker

        emit!(BackerVerified {
            wallet: record.wallet,
            token_mint: record.token_mint,
            social_handle,
            follower_count,
        });

        Ok(())
    }

    /// Mark the first N backers as "early" (called by admin bot after 100 reached)
    pub fn mark_early_backers(
        ctx: Context<MarkEarlyBackers>,
        backer_wallets: Vec<Pubkey>,
    ) -> Result<()> {
        // In production, we'd iterate through backer records and set flag
        // But anchor constraints make this tricky; we might need a separate instruction per backer
        // or use a vector of PDAs that are all passed as accounts
        
        // Simplified: we assume caller (oracle bot) correctly identifies first 100
        // and calls a separate instruction per wallet or uses a map
        // This is a placeholder - actual implementation needs account iteration
        
        for wallet in backer_wallets.iter() {
            // Would need to load backer_record PDA with seeds [b"backer", wallet, token_mint]
            // and set is_early_backer = true
            // This requires existential txs or passing all accounts
            // For brevity, details omitted
        }
        
        Ok(())
    }

    /// Lock bonded liquidity in vesting contract
    pub fn lock_bonded_liquidity(
        ctx: Context<LockBondedLiquidity>,
        amount: u64,
        cliff_days: i64,
        total_duration_days: i64,
    ) -> Result<()> {
        let vesting = &mut ctx.accounts.vesting_account;
        let clock = Clock::get()?;

        vesting.mint = ctx.accounts.mint.key();
        vesting.beneficiary = ctx.accounts.founder.key();
        vesting.authority = ctx.accounts.vesting_authority.key();
        vesting.start_timestamp = clock.unix_timestamp;
        vesting.cliff = cliff_days;
        vesting.duration = total_duration_days;
        vesting.total_amount = amount;
        vesting.released_amount = 0;

        // Transfer tokens from founder_token_account to vesting PDA
        // Token transfer CPI would go here; omitted for brevity

        emit!(LiquidityLocked {
            mint: vesting.mint,
            founder: vesting.beneficiary,
            amount,
            cliff: cliff_days,
            duration: total_duration_days,
        });

        Ok(())
    }

    /// Release vested tokens after cliff
    pub fn release_vested(ctx: Context<ReleaseVested>) -> Result<()> {
        let vesting = &ctx.accounts.vesting_account;
        let now = Clock::get()?.unix_timestamp;
        let elapsed = now - vesting.start_timestamp;

        let cliff_seconds = vesting.cliff * 86400;
        let duration_seconds = vesting.duration * 86400;

        require!(elapsed >= cliff_seconds, ErrorCode::CliffNotReached);

        let vested = if elapsed >= cliff_seconds + duration_seconds {
            vesting.total_amount
        } else {
            let vested_fraction = (elapsed - cliff_seconds) as f64
                / duration_seconds as f64;
            (vesting.total_amount as f64 * vested_fraction).floor() as u64
        };

        let releasable = vested - vesting.released_amount;
        require!(releasable > 0, ErrorCode::NothingToRelease);

        // Transfer tokens from vesting PDA to destination token account
        // Token transfer CPI would go here

        // In a real instruction we'd mutate vesting.released_amount += releasable
        // but we can't because vesting is not mutable in this signature
        // (would need to change to Context<ReleaseVested<'info>>)
        // This is a simplified sketch

        emit!(VestedTokensReleased {
            mint: vesting.mint,
            amount: releasable,
        });

        Ok(())
    }

    /// Oracle slashes narrative bond if derivatives proliferate
    pub fn slash_bond(
        ctx: Context<SlashBond>,
        slash_percentage: u8,
        reason: String,
    ) -> Result<()> {
        let bond = &mut ctx.accounts.bond_account;
        let record = &mut ctx.accounts.narrative_record;

        require!(bond.amount > 0, ErrorCode::NoBondPosted);
        require!(!bond.is_slashed, ErrorCode::AlreadySlashed);
        require!(slash_percentage <= 100, ErrorCode::InvalidSlashPercentage);

        let slash_amount = ((bond.amount as u128) * (slash_percentage as u128) / 100) as u64;

        // Transfer lamports from bond PDA to DAO treasury
        // Would need to do CPI to system program transfer
        // For now, conceptually:
        // **Bond Lamports:** from bond_account to dao_treasury

        bond.is_slashed = true;
        bond.slash_percentage = slash_percentage;

        record.narrative_bond = record.narrative_bond.saturating_sub(slash_amount);

        emit!(BondSlashed {
            mint: record.mint,
            slasher: ctx.accounts.slasher.key(),
            amount: slash_amount,
            reason,
        });

        Ok(())
    }

    /// Admin updates oracle membership
    pub fn update_oracle(
        ctx: Context<UpdateOracle>,
        action: u8,
        oracle_wallet: Pubkey,
        origin_token: Pubkey,
    ) -> Result<()> {
        let global = &mut ctx.accounts.global_state;
        match action {
            0 => {
                // Add oracle
                // create OracleRecord PDA with seeds = [b"oracle", oracle_wallet.as_ref()]
                global.oracle_count = global.oracle_count.checked_add(1).unwrap();
                global.next_oracle_index = global.next_oracle_index.checked_add(1).unwrap();
            }
            1 => {
                // Remove oracle
                // close OracleRecord PDA
                global.oracle_count = global.oracle_count.checked_sub(1).unwrap();
            }
            _ => return Err(ErrorCode::InvalidAction.into()),
        }
        Ok(())
    }

    /// Admin updates narrative record suspicion index (after investigation)
    pub fn update_narrative_metrics(
        ctx: Context<UpdateNarrativeMetrics>,
        backer_count: u32,
        backer_density: f32,
        suspicion_index: f32,
    ) -> Result<()> {
        let record = &mut ctx.accounts.narrative_record;
        record.backer_count = backer_count;
        record.backer_density = backer_density;
        record.suspicion_index = suspicion_index;
        Ok(())
    }
}

/// Accounts for initialize
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

/// Accounts for register_narrative
#[derive(Accounts)]
#[instruction(lock_amount: u64, lock_duration: i64, narrative_bond: Option<u64>)]
pub struct RegisterNarrative<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + std::mem::size_of::<NarrativeRecord>()
    )]
    pub narrative_record: Account<'info, NarrativeRecord>,
    #[account(mut)]
    pub creator: Signer<'info>,
    /// CHECK: mint is validated by token metadata or passed in; not used for CPI
    pub mint: UncheckedAccount<'info>,
    /// Narrative hash provided off-chain
    pub narrative_hash: UncheckedAccount<'info>,
    /// Optional: bond account PDA if posting bond
    /// CHECK: PDA holding bonded SOL
    #[account(mut)]
    pub bond_account: Option<Account<'info, System>>,
    pub system_program: Program<'info, System>,
}

/// Accounts for record_verified_backer
#[derive(Accounts)]
pub struct RecordVerifiedBacker<'info> {
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + std::mem::size_of::<BackerRecord>() + 52,
        seeds = [b"backer", backer_wallet.key().as_ref(), token_mint.key().as_ref()],
        bump
    )]
    pub backer_record: Account<'info, BackerRecord>,
    #[account(mut)]
    pub backer_wallet: Signer<'info>,
    /// CHECK: token mint
    pub token_mint: UncheckedAccount<'info>,
    /// Optional: JWT proof account (unchecked)
    /// CHECK: signature from verification server
    #[account()]
    pub jwt_proof: Option<UncheckedAccount<'info>>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Accounts for mark_early_backers (admin)
#[derive(Accounts)]
pub struct MarkEarlyBackers<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: token mint
    pub token_mint: UncheckedAccount<'info>,
    /// Multiple backer record accounts passed (variable)
    /// In reality, we'd need to use account loading loop or separate instruction
    /// For now, conceptually we pass all backer records as a vector
    /// This is not directly supported in anchor; you'd need to use a Vec<UncheckedAccount>
    /// and manually read/write each account's data.
    /// Simplified here.
    /// CHECK: backer records
    #[account(mut)]
    pub backer_records: Vec<UncheckedAccount<'info>>,
}

/// Accounts for lock_bonded_liquidity
#[derive(Accounts)]
#[instruction(amount: u64, cliff_days: i64, total_duration_days: i64)]
pub struct LockBondedLiquidity<'info> {
    #[account(
        init,
        payer = founder,
        space = 8 + std::mem::size_of::<VestingAccount>() + 100,
        seeds = [b"vesting", mint.key().as_ref()],
        bump
    )]
    pub vesting_account: Account<'info, VestingAccount>,
    #[account(mut)]
    pub founder: Signer<'info>,
    /// CHECK: mint
    pub mint: UncheckedAccount<'info>,
    /// CHECK: founder's token account holding the locked tokens
    #[account(mut)]
    pub founder_token_account: UncheckedAccount<'info>,
    /// The vesting authority is the vesting_account PDA itself
    /// CHECK: ok
    pub vesting_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Accounts for release_vested
#[derive(Accounts)]
pub struct ReleaseVested<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,
    #[account(mut)]
    pub vesting_account: Account<'info, VestingAccount>,
    /// CHECK: mint
    pub mint: UncheckedAccount<'info>,
    /// CHECK: destination token account
    #[account(mut)]
    pub destination_token_account: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

/// Accounts for slash_bond
#[derive(Accounts)]
pub struct SlashBond<'info> {
    #[account(mut)]
    pub slasher: Signer<'info>,
    #[account(mut)]
    pub narrative_record: Account<'info, NarrativeRecord>,
    #[account(
        mut,
        seeds = [b"bond", narrative_record.mint.as_ref()],
        bump
    )]
    pub bond_account: Account<'info, NarrativeBond>,
    /// CHECK: DAO treasury
    #[account(mut)]
    pub dao_treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Accounts for update_oracle
#[derive(Accounts)]
pub struct UpdateOracle<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub global_state: Account<'info, GlobalState>,
    /// CHECK: oracle wallet
    pub oracle_wallet: UncheckedAccount<'info>,
    /// Oracle record PDA (created/closed)
    /// CHECK: ok
    #[account(mut)]
    pub oracle_record: Option<Account<'info, OracleRecord>>,
    pub system_program: Program<'info, System>,
}

/// Accounts for update_narrative_metrics (admin/bot)
#[derive(Accounts)]
pub struct UpdateNarrativeMetrics<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub narrative_record: Account<'info, NarrativeRecord>,
}

/// Global state stored in a PDA
#[account]
pub struct GlobalState {
    pub authority: Pubkey,
    pub initialized: bool,
    pub narrative_count: u32,
    pub oracle_count: u32,
    pub fee_basis_points: u16, // Basis points (10 = 0.1%)
    pub next_oracle_index: u32,
}

/// Narrative record (PDA seeds: [b"narrative", mint.as_ref()])
#[account]
pub struct NarrativeRecord {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub narrative_hash: [u8; 32], // SHA256 of embedding vector
    pub registered_at: i64,
    pub lock_amount: u64,        // Lamports value of locked tokens (for reference)
    pub lock_duration: i64,      // Days
    pub narrative_bond: u64,     // Lamports bonded, slashable
    pub origin_badge: bool,      // True if first of this narrative cluster
    pub similar_to: Option<Pubkey>, // If derivative, points to origin mint
    pub backer_count: u32,
    pub backer_density: f32,     // 0.0-1.0
    pub suspicion_index: f32,    // 0.0 (clean) to 1.0 (vamp)
    pub is_active: bool,
}

/// Vesting account (PDA seeds: [b"vesting", mint.as_ref()])
#[account]
pub struct VestingAccount {
    pub mint: Pubkey,
    pub beneficiary: Pubkey,
    pub authority: Pubkey,       // PDA self
    pub start_timestamp: i64,
    pub cliff: i64,              // Days
    pub duration: i64,           // Days
    pub total_amount: u64,       // Raw token amount
    pub released_amount: u64,
}

/// Backer record (PDA seeds: [b"backer", wallet.as_ref(), token_mint.as_ref()])
#[account]
pub struct BackerRecord {
    pub wallet: Pubkey,
    pub token_mint: Pubkey,
    pub social_platform: u8,     // 0=Twitter, 1=Discord
    pub social_handle: String,   // up to 50 bytes
    pub follower_count: u32,
    pub verified_at: i64,
    pub is_early_backer: bool,
}

/// Oracle record (PDA seeds: [b"oracle", wallet.as_ref(), index])
#[account]
pub struct OracleRecord {
    pub wallet: Pubkey,
    pub origin_token: Pubkey,
    pub added_at: i64,
    pub is_active: bool,
    pub total_fees_earned: u64,
}

/// Narrative bond account (PDA seeds: [b"bond", mint.as_ref()])
#[account]
pub struct NarrativeBond {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub amount: u64,             // Lamports
    pub posted_at: i64,
    pub slash_percentage: u8,    // 0-100 if slashed
    pub is_slashed: bool,
}

/// Events
#[event]
pub struct NarrativeRegistered {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub timestamp: i64,
    pub lock_amount: u64,
    pub bond_amount: u64,
    pub similar_to: Option<Pubkey>,
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

/// Error codes
#[error_code]
pub enum ErrorCode {
    #[msg("Not a derivative (similarity below threshold)")]
    NotDerivative,

    #[msg("Cliff period not yet reached")]
    CliffNotReached,

    #[msg("Nothing to release (already released)")]
    NothingToRelease,

    #[msg("No bond posted")]
    NoBondPosted,

    #[msg("Bond already slashed")]
    AlreadySlashed,

    #[msg("Invalid slash percentage")]
    InvalidSlashPercentage,

    #[msg("Invalid action")]
    InvalidAction,

    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Oracle inactive")]
    OracleInactive,
}
