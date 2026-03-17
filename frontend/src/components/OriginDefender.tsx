import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';

interface BackerVerificationButtonProps {
  tokenMint: string;
  onSuccess?: (wallet: string) => void;
  onError?: (error: string) => void;
}

/**
 * BackerVerificationButton
 *
 * A component for early buyers to verify their social accounts.
 * Only visible within first 100 verified backers.
 *
 * Usage:
 * <BackerVerificationButton tokenMint="Tokenmint..." />
 */
export const BackerVerificationButton: React.FC<BackerVerificationButtonProps> = ({
  tokenMint,
  onSuccess,
  onError,
}) => {
  const { publicKey, signTransaction } = useWallet();
  const [loading, setLoading] = useState(false);
  const [platform, setPlatform] = useState<'twitter' | 'discord'>('twitter');
  const [showQR, setShowQR] = useState(false);
  const [verificationUrl, setVerificationUrl] = useState<string>('');

  const handleVerify = async () => {
    if (!publicKey) {
      onError?.('Wallet not connected');
      return;
    }

    setLoading(true);

    try {
      // Step 1: Get OAuth URL from our backend
      const initRes = await fetch('/api/v1/backer/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token_mint: tokenMint,
          wallet: publicKey.toBase58(),
          platform,
        }),
      });

      if (!initRes.ok) throw new Error('Failed to initiate verification');

      const { auth_url, nonce } = await initRes.json();

      // Store nonce in sessionStorage for later JWT verification
      sessionStorage.setItem('origin_defender_nonce', nonce);
      sessionStorage.setItem('origin_defender_platform', platform);

      // Open OAuth popup
      const width = 500, height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        auth_url,
        'OriginDefender OAuth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // Poll for completion
      const poll = setInterval(async () => {
        if (!popup || popup.closed) {
          clearInterval(poll);
          return;
        }

        try {
          const statusRes = await fetch('/api/v1/backer/status?nonce=' + nonce);
          if (statusRes.status === 404) continue; // Not done yet

          const status = await statusRes.json();
          if (status.verified) {
            clearInterval(poll);
            popup.close();

            // Step 2: Submit JWT to on-chain program
            await submitToBlockchain(status.jwt, status.nonce);
          }
        } catch (e) {
          // ignore poll errors
        }
      }, 1000);

    } catch (err: any) {
      setLoading(false);
      onError?.(err.message);
    }
  };

  const submitToBlockchain = async (jwt: string, nonce: string) => {
    // Build transaction with record_verified_backer instruction
    // This requires using the OriginDefender program client
    // Simplified pseudo-code:

    /*
    const program = getOriginDefenderProgram();
    const backerPda = findPda(['backer', walletPubkey, tokenMint]);

    const tx = await program.methods
      .recordVerifiedBacker(
        platform === 'twitter' ? 0 : 1,
        socialHandle, // parsed from JWT off-chain or provided separately
        followerCount
      )
      .accounts({
        backerRecord: backerPda,
        backerWallet: publicKey,
        tokenMint: new PublicKey(tokenMint),
        jwtProof: /* Some account with JWT */,
        payer: publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await confirmTransaction(tx);
    */

    // For demo, we'll just call an API that does it server-side
    const res = await fetch('/api/v1/backer/onchain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jwt, nonce, wallet: publicKey?.toBase58() }),
    });

    if (res.ok) {
      onSuccess?.(publicKey.toBase58());
    } else {
      onError?.('On-chain submission failed');
    }

    setLoading(false);
  };

  // Simple UI
  return (
    <div className="backer-verification">
      <h4>✓ Verify as Early Backer</h4>
      <p>
        Connect your {platform} to prove you're a genuine early supporter.
        Only first 100 verified backers get this badge.
      </p>

      <div className="platform-selector">
        <button
          className={platform === 'twitter' ? 'active' : ''}
          onClick={() => setPlatform('twitter')}
        >
          Twitter / X
        </button>
        <button
          className={platform === 'discord' ? 'active' : ''}
          onClick={() => setPlatform('discord')}
        >
          Discord
        </button>
      </div>

      <button
        onClick={handleVerify}
        disabled={loading || !publicKey}
        className="verify-button"
      >
        {loading ? 'Verifying...' : `Verify via ${platform === 'twitter' ? 'X' : 'Discord'}`}
      </button>

      {showQR && (
        <div className="qr-modal">
          <img src={verificationUrl} alt="QR Code" />
        </div>
      )}
    </div>
  );
};

---

export const OriginBadge: React.FC<{ mint: string }> = ({ mint }) => {
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/v1/metrics/${mint}`)
      .then(r => r.json())
      .then(setMetrics);
  }, [mint]);

  if (!metrics) return null;

  let badgeClass = 'badge ';
  let badgeText = '';
  if (metrics.badge === 'origin') {
    badgeClass += 'origin';
    badgeText = '✓ Origin';
  } else if (metrics.badge === 'derivative') {
    badgeClass += 'derivative';
    badgeText = '⚠️ Derivative';
  } else if (metrics.badge === 'vamp') {
    badgeClass += 'vamp';
    badgeText = '❌ Suspected Vamp';
  }

  return (
    <div className="origin-metrics">
      <span className={badgeClass}>{badgeText}</span>

      <div className="metrics-grid">
        <div className="metric">
          <label>Backer Density</label>
          <value>{(metrics.backer_density * 100).toFixed(1)}%</value>
          {metrics.backer_count} verified
        </div>
        <div className="metric">
          <label>Liquidity Locked</label>
          <value>{(metrics.locked_ratio * 100).toFixed(0)}%</value>
          Founder commitment
        </div>
        <div className="metric">
          <label>Narrative Bond</label>
          <value>{metrics.narrative_bond_sol.toFixed(1)} SOL</value>
          Shared responsibility
        </div>
        <div className="metric">
          <label>Suspicion Index</label>
          <value>{(metrics.suspicion_index * 100).toFixed(0)}%</value>
          {metrics.suspicion_index > 0.8 ? 'High risk' : 'Low risk'}
        </div>
      </div>

      {metrics.similar_tokens && metrics.similar_tokens.length > 0 && (
        <div className="similar-tokens">
          <h5>Similar Narratives</h5>
          <ul>
            {metrics.similar_tokens.map((t: any) => (
              <li key={t.mint}>
                <a href={`/token/${t.mint}`}>{t.name}</a>
                <span className="similarity">{Math.round(t.similarity * 100)}% match</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

---

// Example: Narrative input form for token creation
export const NarrativeInputForm: React.FC = () => {
  const [mission, setMission] = useState('');
  const [lore, setLore] = useState('');
  const [tokenomics, setTokenomics] = useState('');
  const [differentiators, setDifferentiators] = useState('');
  const [result, setResult] = useState<any>(null);

  const checkNarrative = async () => {
    const narrative = { mission_statement: mission, lore, tokenomics, differentiators };
    const res = await fetch('/api/v1/check_derivative', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ narrative, creator_wallet: 'YOUR_WALLET' }),
    });
    setResult(await res.json());
  };

  return (
    <div className="narrative-form">
      <h3>Token Narrative</h3>
      <p>Describe what makes your token unique. This will be fingerprinted and compared against existing tokens.</p>

      <textarea
        placeholder="Mission statement (what problem are you solving?)"
        value={mission}
        onChange={e => setMission(e.target.value)}
      />
      <textarea
        placeholder="Lore (the story behind your token)"
        value={lore}
        onChange={e => setLore(e.target.value)}
      />
      <textarea
        placeholder="Tokenomics (tax, burns, utilities)"
        value={tokenomics}
        onChange={e => setTokenomics(e.target.value)}
      />
      <textarea
        placeholder="Differentiators (how is this NOT a copy?)"
        value={differentiators}
        onChange={e => setDifferentiators(e.target.value)}
      />

      <button onClick={checkNarrative}>Check Originality</button>

      {result && (
        <div className={`result ${result.is_derivative ? 'warning' : 'success'}`}>
          {result.is_derivative ? (
            <p>
              ⚠️ Your narrative is {Math.round(result.similarity * 100)}% similar to{' '}
              <a href={`/token/${result.origin_mint}`}>{result.origin_name}</a>.
              <br/>
              {result.warning}
            </p>
          ) : (
            <p>✅ Your narrative appears original. Suggested bonded liquidity: {result.suggested_lock_percentage}%</p>
          )}
        </div>
      )}
    </div>
  );
};
