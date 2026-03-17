import { useState } from 'react'
import { CheckCircle, AlertTriangle, ExternalLink, Shield, Lock, Users } from 'lucide-react'

interface DerivativeResult {
  is_derivative: boolean
  origin_mint: string | null
  similarity: number
  suggested_lock_percentage: number
  warning?: string
}

interface TokenMetrics {
  mint: string
  name?: string
  symbol?: string
  badge: string
  backer_count: number
  backer_density: number
  liquidity_ratio: number
  narrative_bond_sol: number
  suspicion_index: number
  similar_tokens: Array<{mint: string; name: string; similarity: number}>
}

function App() {
  const [narrative, setNarrative] = useState('')
  const [result, setResult] = useState<DerivativeResult | null>(null)
  const [mintInput, setMintInput] = useState('')
  const [metrics, setMetrics] = useState<TokenMetrics | null>(null)
  const [loading, setLoading] = useState(false)

  const checkDerivative = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/check_derivative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          narrative: {
            mission_statement: narrative,
            lore: narrative,
            tokenomics: narrative,
            differentiators: narrative
          }
        })
      })
      const data = await res.json()
      setResult(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const fetchMetrics = async () => {
    if (!mintInput.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/metrics/${mintInput.trim()}`)
      if (res.ok) {
        const data = await res.json()
        setMetrics(data)
      } else {
        alert('Token not found')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative">
      {/* Video background */}
      <video className="video-background" autoPlay muted loop playsInline>
        <source src="/background.mp4" type="video/mp4" />
      </video>
      <div className="overlay" />

      {/* Nav */}
      <nav className="relative z-10 px-6 py-4 flex justify-between items-center bg-white border-b-4 border-black">
        <div className="text-4xl font-black brain-title">ORIGINDEFENDER</div>
        <div className="space-x-6">
          <a href="#how-it-works" className="font-bold text-black hover:underline">HOW IT WORKS</a>
          <a href="#demo" className="font-bold text-black hover:underline">DEMO</a>
          <a href="https://github.com/RavMonSOL/origin-defender" target="_blank" className="inline-flex items-center gap-2 font-bold text-black hover:underline">
            GITHUB <ExternalLink size={20} />
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 px-6 py-24 text-center">
        <h1 className="text-6xl md:text-9xl font-black brain-title mb-8 glitch-hover" style={{ lineHeight: '0.9' }}>
          STOP TOKEN<br/>VAMPIRES
        </h1>
        <p className="text-xl md:text-2xl max-w-4xl mx-auto mb-10 leading-relaxed" style={{ color: '#000', textShadow: '1px 1px 0 #fff' }}>
          bags.fm memecoins get cloned instantly. We fingerprint narratives, require bonds, and verify backers to protect original creators.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <a href="#demo" className="brain-btn text-xl">
            TRY IT NOW
          </a>
          <a href="https://github.com/RavMonSOL/origin-defender" className="brain-btn text-xl" style={{ background: '#00f0ff', color: '#000' }}>
            VIEW DOCS
          </a>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="relative z-10 px-6 py-24 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-5xl md:text-6xl font-black brain-title mb-16 text-center" style={{ color: '#000', textShadow: '2px 2px 0 #fff' }}>
            HOW IT WORKS
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: <Shield size={64} className="text-black" />, title: 'Narrative Fingerprinting', desc: 'Founders commit to a unique story fingerprint at launch. Derivative tokens are automatically flagged.' },
              { icon: <Lock size={64} className="text-black" />, title: 'Narrative Bond', desc: '1 SOL bond that gets slashed if your token spawns harmful derivatives. Vamp groups won’t post it.' },
              { icon: <Users size={64} className="text-black" />, title: 'Early Backer Verification', desc: 'First 100 buyers verify Twitter/Discord. Fake communities can’t pass.' },
            ].map((feature, i) => (
              <div key={i} className="card-brain text-center">
                <div className="mb-6 flex justify-center text-5xl">{feature.icon}</div>
                <h3 className="text-2xl font-black mb-4 uppercase" style={{ textShadow: '1px 1px 0 #000' }}>{feature.title}</h3>
                <p className="text-lg leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo section */}
      <section id="demo" className="relative z-10 px-6 py-24">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-5xl font-black brain-title mb-10 text-center" style={{ color: '#000', textShadow: '2px 2px 0 #fff' }}>
            DEMO: CHECK YOUR TOKEN
          </h2>

          {/* Narrative check */}
          <div className="card-brain mb-8">
            <label className="block text-2xl font-black mb-4" style={{ color: '#000' }}>ENTER TOKEN NARRATIVE</label>
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="Describe what makes your token unique..."
              className="w-full h-40 p-4 bg-white border-4 border-black text-black font-mono text-sm focus:border-pink-500 focus:outline-none"
              style={{ boxShadow: '4px 4px 0 #000' }}
            />
            <button
              onClick={checkDerivative}
              disabled={loading || !narrative.trim()}
              className="mt-6 px-8 py-4 bg-pink-500 text-black font-black text-xl uppercase border-4 border-black hover:bg-yellow-300 disabled:opacity-50 transition-all"
              style={{ boxShadow: '4px 4px 0 #000' }}
            >
              {loading ? 'CHECKING...' : 'CHECK ORIGINALITY'}
            </button>
            {result && (
              <div className={`mt-6 p-6 border-4 ${result.is_derivative ? 'border-yellow-300 bg-yellow-100' : 'border-green-500 bg-green-100'}`}>
                {result.is_derivative ? (
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="text-yellow-600 mt-1" size={32} />
                    <div>
                      <h4 className="font-black text-2xl mb-2" style={{ color: '#000' }}>⚠️ THIS NARRATIVE IS {Math.round(result.similarity * 100)}% SIMILAR TO AN EXISTING TOKEN</h4>
                      <p className="mb-2" style={{ color: '#000' }}>{result.warning}</p>
                      <p className="text-sm" style={{ color: '#000' }}>You can still proceed, but your token will receive a "Derivative" badge and lower visibility.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <CheckCircle className="text-green-600 mt-1" size={32} />
                    <div>
                      <h4 className="font-black text-2xl mb-2" style={{ color: '#000' }}>✅ YOUR NARRATIVE APPEARS ORIGINAL!</h4>
                      <p className="font-bold" style={{ color: '#000' }}>Recommended narrative bond: {result.suggested_lock_percentage} SOL</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Token metrics lookup */}
          <div className="card-brain">
            <label className="block text-2xl font-black mb-4" style={{ color: '#000' }}>LOOK UP TOKEN METRICS</label>
            <div className="flex gap-4 mb-6">
              <input
                type="text"
                value={mintInput}
                onChange={(e) => setMintInput(e.target.value)}
                placeholder="Enter token mint address..."
                className="flex-1 p-4 bg-white border-4 border-black text-black font-mono text-sm focus:border-cyan-500 focus:outline-none"
                style={{ boxShadow: '4px 4px 0 #000' }}
              />
              <button
                onClick={fetchMetrics}
                disabled={loading || !mintInput.trim()}
                className="px-8 py-4 bg-cyan-500 text-black font-black text-xl uppercase border-4 border-black hover:bg-blue-500 disabled:opacity-50 transition-all"
                style={{ boxShadow: '4px 4px 0 #000' }}
              >
                FETCH
              </button>
            </div>
            {metrics && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-4xl font-black" style={{ color: '#000', textShadow: '1px 1px 0 #fff' }}>{metrics.name || 'Unknown Token'}</h3>
                  <span className={`px-4 py-2 text-sm font-black uppercase ${
                    metrics.badge === 'origin' ? 'bg-green-500 text-white' :
                    metrics.badge === 'derivative' ? 'bg-yellow-400 text-black' :
                    'bg-red-500 text-white'
                  }`} style={{ border: '2px solid #000', boxShadow: '2px 2px 0 #000' }}>
                    {metrics.badge.toUpperCase()}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white border-4 border-black p-4" style={{ boxShadow: '6px 6px 0 #000' }}>
                    <div className="text-3xl font-black" style={{ color: '#000' }}>{metrics.backer_count}</div>
                    <div className="text-sm font-bold uppercase" style={{ color: '#000' }}>Verified Backers</div>
                  </div>
                  <div className="bg-white border-4 border-black p-4" style={{ boxShadow: '6px 6px 0 #000' }}>
                    <div className="text-3xl font-black" style={{ color: '#000' }}>{(metrics.backer_density * 100).toFixed(1)}%</div>
                    <div className="text-sm font-bold uppercase" style={{ color: '#000' }}>Backer Density</div>
                  </div>
                  <div className="bg-white border-4 border-black p-4" style={{ boxShadow: '6px 6px 0 #000' }}>
                    <div className="text-3xl font-black" style={{ color: '#000' }}>{(metrics.liquidity_ratio * 100).toFixed(0)}%</div>
                    <div className="text-sm font-bold uppercase" style={{ color: '#000' }}>Liquidity Depth</div>
                  </div>
                  <div className="bg-white border-4 border-black p-4" style={{ boxShadow: '6px 6px 0 #000' }}>
                    <div className="text-3xl font-black" style={{ color: '#000' }}>{metrics.narrative_bond_sol.toFixed(1)} SOL</div>
                    <div className="text-sm font-bold uppercase" style={{ color: '#000' }}>Narrative Bond</div>
                  </div>
                </div>
                {metrics.similar_tokens.length > 0 && (
                  <div className="bg-white border-4 border-black p-6" style={{ boxShadow: '6px 6px 0 #000' }}>
                    <h4 className="font-black text-2xl mb-4" style={{ color: '#000' }}>SIMILAR TOKENS</h4>
                    <ul className="space-y-3">
                      {metrics.similar_tokens.map((t, i) => (
                        <li key={i} className="flex justify-between items-center p-3 bg-gray-100 border-2 border-black">
                          <span className="font-bold text-lg" style={{ color: '#000' }}>{t.name}</span>
                          <span className="font-black text-yellow-600">{Math.round(t.similarity * 100)}% MATCH</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-12 border-t-4 border-black text-center" style={{ backgroundColor: '#fff' }}>
        <p className="font-bold text-lg" style={{ color: '#000' }}>© 2026 ORIGINDEFENDER — MIT LICENSE</p>
        <p className="mt-2">
          <a href="https://github.com/RavMonSOL/origin-defender" className="text-cyan-500 font-bold hover:underline">GITHUB REPOSITORY</a>
        </p>
      </footer>
    </div>
  )
}

export default App
