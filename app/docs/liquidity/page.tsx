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

export default function DocsLiquidityPage() {
    const contracts = CURRENT_CONFIG.contracts

    return (
        <div className="grid grid-cols-1 gap-6">
            <Section title="Liquidity (LP)">
                Liquidity positions are represented as NFTs via NonfungiblePositionManager.
            </Section>

            <section className="bg-background-light/50 backdrop-blur-sm rounded-lg border border-background-light p-6">
                <h2 id="key-contracts" className="text-xl font-bold text-foreground" data-toc-label="Key contracts (live)">Key contracts (live)</h2>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                    <div className="rounded-md border border-background-light bg-background/40 px-4 py-3">
                        <div className="text-foreground-light">UniswapV3Factory</div>
                        <div className="font-mono text-foreground break-all">{contracts.UniswapV3Factory}</div>
                    </div>
                    <div className="rounded-md border border-background-light bg-background/40 px-4 py-3">
                        <div className="text-foreground-light">NonfungiblePositionManager</div>
                        <div className="font-mono text-foreground break-all">{contracts.NonfungiblePositionManager}</div>
                    </div>
                </div>
            </section>

            <section className="bg-background-light/50 backdrop-blur-sm rounded-lg border border-background-light p-6">
                <h2 id="reference-implementation" className="text-xl font-bold text-foreground" data-toc-label="Reference implementation">Reference implementation</h2>
                <div className="mt-3 text-sm text-foreground-light">
                    Prism uses standard Uniswap V3 liquidity positions.
                    <div className="mt-2 grid grid-cols-1 gap-2">
                        <div>
                            - Pools are created via the <span className="font-mono text-foreground">UniswapV3Factory</span>.
                        </div>
                        <div>
                            - Liquidity positions are minted/managed as NFTs via <span className="font-mono text-foreground">NonfungiblePositionManager</span>.
                        </div>
                        <div>
                            - To add liquidity you typically: create pool (if needed) → initialize price → approve tokens → mint position.
                        </div>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-1">
                        <a className="text-primary hover:underline" href="https://docs.uniswap.org/contracts/v3" target="_blank" rel="noreferrer">
                            Uniswap V3 contracts documentation
                        </a>
                        <a className="text-primary hover:underline" href="https://docs.uniswap.org/sdk/v3/guides/liquidity/01-position-data" target="_blank" rel="noreferrer">
                            Uniswap V3 SDK: liquidity positions guide
                        </a>
                    </div>
                </div>
            </section>

            <DocsPager />
        </div>
    )
}
