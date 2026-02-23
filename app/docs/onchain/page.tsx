import { CURRENT_CONFIG } from '@/../config/dex_config'

import { DocsPager } from '../_components/DocsPager'

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => {
    return (
        <section className="bg-background-light/50 backdrop-blur-sm rounded-lg border border-background-light p-6">
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            <div className="mt-3 text-sm text-foreground-light">{children}</div>
        </section>
    )
}

export default function DocsOnchainPage() {
    const contracts = CURRENT_CONFIG.contracts

    return (
        <div className="grid grid-cols-1 gap-6">
            <Section title="On-chain integration">
                Prism uses Uniswap V3 contracts. This section documents the primary contracts and the typical flow for quoting + swapping.
            </Section>

            <section className="bg-background-light/50 backdrop-blur-sm rounded-lg border border-background-light p-6">
                <h2 id="contracts" className="text-xl font-bold text-foreground" data-toc-label="Contracts (live)">Contracts (live)</h2>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                    <div className="rounded-md border border-background-light bg-background/40 px-4 py-3">
                        <div className="text-foreground-light">QuoterV2</div>
                        <div className="font-mono text-foreground break-all">{contracts.QuoterV2}</div>
                    </div>
                    <div className="rounded-md border border-background-light bg-background/40 px-4 py-3">
                        <div className="text-foreground-light">UniversalRouter</div>
                        <div className="font-mono text-foreground break-all">{contracts.UniversalRouter}</div>
                    </div>
                    <div className="rounded-md border border-background-light bg-background/40 px-4 py-3">
                        <div className="text-foreground-light">SwapRouter02</div>
                        <div className="font-mono text-foreground break-all">{contracts.SwapRouter02}</div>
                    </div>
                    <div className="rounded-md border border-background-light bg-background/40 px-4 py-3">
                        <div className="text-foreground-light">Permit2</div>
                        <div className="font-mono text-foreground break-all">{contracts.Permit2}</div>
                    </div>
                    {contracts.SelectiveTaxRouter ? (
                        <div className="rounded-md border border-background-light bg-background/40 px-4 py-3">
                            <div className="text-foreground-light">SelectiveTaxRouter</div>
                            <div className="font-mono text-foreground break-all">{contracts.SelectiveTaxRouter}</div>
                        </div>
                    ) : null}
                    {contracts.SelectiveTaxRouterPermit2 ? (
                        <div className="rounded-md border border-background-light bg-background/40 px-4 py-3">
                            <div className="text-foreground-light">SelectiveTaxRouterPermit2</div>
                            <div className="font-mono text-foreground break-all">{contracts.SelectiveTaxRouterPermit2}</div>
                        </div>
                    ) : null}
                </div>
            </section>

            {contracts.SelectiveTaxRouter ? (
                <section className="bg-background-light/50 backdrop-blur-sm rounded-lg border border-background-light p-6">
                    <h2 id="taxable-tokens" className="text-xl font-bold text-foreground" data-toc-label="Taxable tokens (SelectiveTaxRouter)">
                        Taxable tokens (SelectiveTaxRouter)
                    </h2>
                    <div className="mt-3 text-sm text-foreground-light">
                        Prism supports an optional protocol tax for specific tokens. Tax is only enforced when swapping through
                        <span className="font-mono text-foreground"> SelectiveTaxRouter</span> (or its Permit2 wrapper). Swaps submitted via
                        <span className="font-mono text-foreground"> UniversalRouter</span> / <span className="font-mono text-foreground">SwapRouter02</span>
                        will not apply this protocol tax.
                        <div className="mt-3 grid grid-cols-1 gap-2">
                            <div>
                                - <span className="font-mono text-foreground">SelectiveTaxRouter</span>: direct router calls (requires prior token approval).
                            </div>
                            <div>
                                - <span className="font-mono text-foreground">SelectiveTaxRouterPermit2</span>: wrapper that supports Permit2 signatures for single-step swaps.
                            </div>
                            <div>
                                - Detect taxability: call <span className="font-mono text-foreground">getTokenTaxConfig(token)</span> or <span className="font-mono text-foreground">willBeTaxed(tokenIn, tokenOut, user)</span>.
                            </div>
                        </div>
                    </div>
                </section>
            ) : null}

            <section className="bg-background-light/50 backdrop-blur-sm rounded-lg border border-background-light p-6">
                <h2 id="reference-implementation" className="text-xl font-bold text-foreground" data-toc-label="Reference implementation">Reference implementation</h2>
                <div className="mt-3 text-sm text-foreground-light">
                    Prism is compatible with standard Uniswap V3 tooling.
                    <div className="mt-2 grid grid-cols-1 gap-2">
                        <div>
                            - Quote: call <span className="font-mono text-foreground">QuoterV2</span> with your desired route.
                        </div>
                        <div>
                            - Approve: use <span className="font-mono text-foreground">Permit2</span> (recommended) or ERC20 approvals.
                        </div>
                        <div>
                            - Swap: submit via <span className="font-mono text-foreground">UniversalRouter</span> (recommended) or <span className="font-mono text-foreground">SwapRouter02</span>.
                        </div>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-1">
                        <a className="text-primary hover:underline" href="https://docs.uniswap.org/contracts/v3" target="_blank" rel="noreferrer">
                            Uniswap V3 contracts documentation
                        </a>
                        <a className="text-primary hover:underline" href="https://docs.uniswap.org/contracts/universal-router" target="_blank" rel="noreferrer">
                            Universal Router documentation
                        </a>
                        <a className="text-primary hover:underline" href="https://docs.uniswap.org/contracts/permit2/overview" target="_blank" rel="noreferrer">
                            Permit2 documentation
                        </a>
                    </div>
                </div>
            </section>

            <DocsPager />
        </div>
    )
}
