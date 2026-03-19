import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, BackpackWalletAdapter } from '@solana/wallet-adapter-wallets';
import { OriginBadge, NarrativeInputForm } from './components/OriginDefender';
import './App.css';

// Default styles for wallet adapter
import '@solana/wallet-adapter-react-ui/styles.css';

function App() {
  // Can be set to 'devnet', 'testnet', or 'mainnet-beta'
  const network = WalletAdapterNetwork.Mainnet;

  // You can provide your own RPC endpoint
  const endpoint = useMemo(() => 'https://api.mainnet-beta.solana.com', []);

  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new BackpackWalletAdapter(),
  ], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div className="app">
            <header className="app-header">
              <h1>OriginDefender</h1>
              <p>Solving Pump.fun Token Vampirism</p>
            </header>

            <main>
              <section className="hero">
                <h2>Stop the Copycats</h2>
                <p>
                  Narrative fingerprinting, bonded liquidity, and early backer verification
                  make token vamping economically irrational.
                </p>
                <a href="/docs" className="cta-button">Read the Docs</a>
              </section>

              <section className="demo">
                <h3>Demo: Check Your Narrative</h3>
                <NarrativeInputForm />
              </section>

              <section className="metrics-demo">
                <h3>Example: Token Metrics</h3>
                <p>(Insert a real token mint to see badges)</p>
                <div style={{ padding: '1rem', background: '#f0f0f0', borderRadius: '8px' }}>
                  <OriginBadge mint="TokenmintHere..." />
                </div>
              </section>
            </main>

            <footer>
              <p>© 2026 OriginDefender — Open Source under MIT License</p>
            </footer>
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;
