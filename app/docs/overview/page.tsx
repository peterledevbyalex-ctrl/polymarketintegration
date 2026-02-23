import { CURRENT_CONFIG } from '@/../config/dex_config'

import { DocsPager } from '../_components/DocsPager'

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => {
    return (
        <section className="bg-background-light/50 backdrop-blur-sm rounded-lg border border-background-light p-6">
            <h2 id={title.toLowerCase().replace(/\s+/g, '-')} className="text-xl font-bold text-foreground" data-toc-label={title}>
                {title}
            </h2>
            <div className="mt-3 text-sm text-foreground-light">{children}</div>
        </section>
    )
}

export default function DocsOverviewPage() {
    return (
        <div className="grid grid-cols-1 gap-6">
            <section className="bg-background-light/50 backdrop-blur-sm rounded-lg border border-background-light p-6">
                <h1 className="text-3xl font-bold text-foreground">Prism DEX Developer Docs</h1>
                <div className="mt-3 text-sm text-foreground-light">
                    Integrate Prism at three layers:
                    <div className="mt-2 grid grid-cols-1 gap-1">
                        <div>
                            - HTTP endpoints for discovery and dashboards
                        </div>
                        <div>
                            - RPC reads for quoting (QuoterV2)
                        </div>
                        <div>
                            - RPC writes for swaps (UniversalRouter / SwapRouter02) and LP (NonfungiblePositionManager)
                        </div>
                    </div>
                </div>
            </section>

            <Card title="Network">
                Active chain: <span className="font-mono text-foreground">{CURRENT_CONFIG.chain.name}</span> (
                <span className="font-mono text-foreground">{String(CURRENT_CONFIG.chain.id)}</span>)
                <div className="mt-2">
                    Explorer:{' '}
                    <a className="font-mono text-foreground hover:underline" href={CURRENT_CONFIG.explorerUrl} target="_blank" rel="noreferrer">
                        {CURRENT_CONFIG.explorerUrl}
                    </a>
                </div>
            </Card>

            <Card title="Quickstart">
                <div>
                    - Fetch tokens via <span className="font-mono text-foreground">/tokenlist.json</span>
                </div>
                <div>
                    - Discover pools via <span className="font-mono text-foreground">/api/pools/list</span>
                </div>
                <div>
                    - Find candidate paths via <span className="font-mono text-foreground">/api/swaps/swap-pools</span>
                </div>
                <div>
                    - Quote via <span className="font-mono text-foreground">QuoterV2</span> over RPC
                </div>
                <div>
                    - Execute swaps via <span className="font-mono text-foreground">UniversalRouter</span> (or SwapRouter02)
                </div>
            </Card>

            <Card title="Swap routing behavior">
                <div>
                    Prism swaps are routed in this order:
                </div>
                <div className="mt-2 grid grid-cols-1 gap-1">
                    <div>
                        - <span className="font-semibold text-foreground">SelectiveTaxRouter</span> (when configured and relevant): optional protocol tax path.
                    </div>
                    <div>
                        - <span className="font-semibold text-foreground">UniversalRouter</span>: standard Uniswap V3 execution for same-chain swaps.
                    </div>
                    <div>
                        - <a className="font-semibold text-foreground hover:underline" href="https://li.fi/" target="_blank" rel="noreferrer">Li.FI</a>: fallback when there is no suitable local route and for cross-chain swaps.
                    </div>
                </div>
            </Card>

            <Card title="Scope & non-goals">
                <div>
                    - These docs describe Prism’s curated HTTP endpoints and on-chain contract flow.
                </div>
                <div>
                    - Prism does not expose a public subgraph URL.
                </div>
                <div>
                    - Prism does not provide a hosted quote API; quotes are done via RPC reads (QuoterV2).
                </div>
                <div>
                    - Cross-chain and certain fallback routes use <a className="font-mono text-foreground hover:underline" href="https://li.fi/" target="_blank" rel="noreferrer">Li.FI</a> (third-party aggregator).
                </div>
            </Card>

            <Card title="Contact">
                Questions or integration requests: <a className="font-mono text-foreground hover:underline" href="mailto:badbunnzcorporation@gmail.com">badbunnzcorporation@gmail.com</a>
            </Card>

            <Card title="What these docs cover">
                <div>
                    - Public endpoints (what they return, and what they are not)
                </div>
                <div>
                    - On-chain contracts and integration flow
                </div>
                <div>
                    - Liquidity mint/increase and common pitfalls
                </div>
            </Card>

            <DocsPager />
        </div>
    )
}
