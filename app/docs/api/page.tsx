import { CURRENT_CONFIG } from '@/../config/dex_config'

import { DocsPager } from '../_components/DocsPager'
import { ClientOnlyEndpointAccordion, type EndpointAccordionItem } from '../_components/EndpointAccordion'

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => {
    return (
        <section className="bg-background-light/50 backdrop-blur-sm rounded-lg border border-background-light p-6">
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            <div className="mt-3 text-sm text-foreground-light">{children}</div>
        </section>
    )
}

export default function DocsApiPage() {
    const systemTokensIds = CURRENT_CONFIG.systemTokensIds as Record<string, string> | undefined

    const sampleToken = (systemTokensIds?.USDC ?? systemTokensIds?.WETH) || null
    const sampleTokenLower = sampleToken?.toLowerCase() ?? '0x…'

    const samplePool = (CURRENT_CONFIG.usdcWethPool?.id as string | undefined) || null
    const samplePoolLower = samplePool?.toLowerCase() ?? '0x…'

    const endpoints: EndpointAccordionItem[] = [
        {
            id: 'health',
            title: 'Health (liveness)',
            method: 'GET',
            path: '/health',
            description: 'Cacheable liveness endpoint. Use for uptime monitoring (service responds).',
            requestExample: 'curl -s __BASE_URL__/health',
            responseExample: `{
  "ok": true,
  "timestamp": "2025-01-01T00:00:00.000Z",
  "chain": { "id": ${CURRENT_CONFIG.chain.id}, "name": "${CURRENT_CONFIG.chain.name}" }
}`,
        },
        {
            id: 'readyz',
            title: 'Readiness (dependency check)',
            method: 'GET',
            path: '/readyz',
            description: 'Non-cacheable readiness endpoint. Validates subgraph connectivity. Returns HTTP 503 when unhealthy.',
            requestExample: 'curl -i __BASE_URL__/readyz',
            responseExample: `{
  "ok": true,
  "timestamp": "2025-01-01T00:00:00.000Z",
  "chain": { "id": ${CURRENT_CONFIG.chain.id}, "name": "${CURRENT_CONFIG.chain.name}" }
}`,
        },
        {
            id: 'tokenlist',
            title: 'Token list (wallet compatible)',
            method: 'GET',
            path: '/tokenlist.json',
            description: 'Token discovery endpoint following the token list JSON schema.',
            requestExample: 'curl -s __BASE_URL__/tokenlist.json | head',
            responseExample: `{
  "name": "Prism DEX Token List",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "version": { "major": 1, "minor": 0, "patch": 0 },
  "tokens": [
    {
      "chainId": ${CURRENT_CONFIG.chain.id},
      "address": "${sampleToken ?? '0x…'}",
      "symbol": "...",
      "name": "...",
      "decimals": 18,
      "logoURI": "/api/tokens/logo?tokenAddress=${sampleTokenLower}"
    }
  ]
}`,
        },
        {
            id: 'stats-json',
            title: 'Protocol stats',
            method: 'GET',
            path: '/stats.json',
            description: 'Protocol-level stats for dashboards (TVL, 24h volume/fees/APR, counts).',
            requestExample: 'curl -s __BASE_URL__/stats.json',
            responseExample: `{
  "name": "Prism DEX Stats",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "ethPriceUSD": "0",
  "totalValueLockedUSD": "0",
  "volumeUSD24h": "0",
  "feesUSD24h": "0",
  "apr24h": "0"
}`,
        },
        {
            id: 'pools-json',
            title: 'Pools list (JSON feed)',
            method: 'GET',
            path: '/pools.json',
            description: 'Large pools feed for indexers and dashboards (cacheable).',
            requestExample: 'curl -s __BASE_URL__/pools.json | head',
            responseExample: `{
  "name": "Prism DEX Pools",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "pools": [
    {
      "id": "0x...",
      "feeTier": "3000",
      "token0": { "id": "0x...", "symbol": "..." },
      "token1": { "id": "0x...", "symbol": "..." }
    }
  ]
}`,
        },
        {
            id: 'token-by-address',
            title: 'Token metadata by address',
            method: 'GET',
            path: '/api/tokens/by-address?tokenAddress=0x…',
            description: 'Returns token metadata for a known token. Returns null if unknown. Cacheable (~5 min).',
            requestExample: `curl -s "__BASE_URL__/api/tokens/by-address?tokenAddress=${sampleTokenLower}"`,
            responseExample: `{
  "success": true,
  "data": {
    "id": "${sampleToken ?? '0x…'}",
    "name": "...",
    "symbol": "...",
    "decimals": 18,
    "logoUri": "/api/tokens/logo?tokenAddress=${sampleTokenLower}"
  }
}`,
        },
        {
            id: 'tokens-list',
            title: 'Tokens list (app-oriented)',
            method: 'GET',
            path: '/api/tokens/list',
            description: 'Tokens list used by the Prism UI (cacheable). Includes logoUri and derived fields when available.',
            requestExample: 'curl -s __BASE_URL__/api/tokens/list | head',
            responseExample: `{
  "success": true,
  "data": [
    {
      "id": "${sampleToken ?? '0x…'}",
      "symbol": "...",
      "name": "...",
      "decimals": 18,
      "logoUri": "/api/tokens/logo?tokenAddress=${sampleTokenLower}"
    }
  ]
}`,
        },
        {
            id: 'token-logo',
            title: 'Token logo (image bytes)',
            method: 'GET',
            path: '/api/tokens/logo?tokenAddress=0x…',
            description: 'Logo proxy that returns raw image bytes. Response is not JSON.',
            requestExample: `curl -L "__BASE_URL__/api/tokens/logo?tokenAddress=${sampleTokenLower}" -o logo.png`,
            responseExample: 'Binary response (image/*).',
        },
        {
            id: 'pools-by-token',
            title: 'Pools by token',
            method: 'GET',
            path: '/api/pools/by-token?tokenAddress=0x…',
            description: 'Returns pools where token is token0 or token1. Cacheable (~1 min).',
            requestExample: `curl -s "__BASE_URL__/api/pools/by-token?tokenAddress=${sampleTokenLower}" | head`,
            responseExample: `{
  "success": true,
  "data": [
    {
      "id": "0x...",
      "token0": { "id": "0x...", "symbol": "..." },
      "token1": { "id": "0x...", "symbol": "..." },
      "feeTier": "3000"
    }
  ]
}`,
        },
        {
            id: 'pools-list',
            title: 'Pools list (API)',
            method: 'GET',
            path: '/api/pools/list',
            description: 'Pool discovery endpoint (subgraph-backed, cacheable).',
            requestExample: 'curl -s __BASE_URL__/api/pools/list | head',
            responseExample: `{
  "success": true,
  "data": [
    { "id": "${samplePool ?? '0x…'}", "feeTier": "3000", "token0": { "id": "0x..." }, "token1": { "id": "0x..." } }
  ]
}`,
        },
        {
            id: 'pool-by-address',
            title: 'Pool by address',
            method: 'GET',
            path: '/api/pools/pool/<poolAddress>',
            description: 'Fetch full pool details by pool address.',
            requestExample: `curl -s __BASE_URL__/api/pools/pool/${samplePoolLower}`,
            responseExample: `{
  "success": true,
  "data": { "id": "${samplePool ?? '0x…'}", "feeTier": "3000" }
}`,
        },
        {
            id: 'pool-historical-day',
            title: 'Pool historical (day)',
            method: 'GET',
            path: '/api/pools/pool/<poolAddress>/historical/day',
            description: 'Daily historical datapoints for charting.',
            requestExample: `curl -s __BASE_URL__/api/pools/pool/${samplePoolLower}/historical/day | head`,
            responseExample: `{
  "success": true,
  "data": [
    { "timestamp": 0, "volumeUSD": "0", "tvlUSD": "0" }
  ]
}`,
        },
        {
            id: 'pool-historical-hour',
            title: 'Pool historical (hour)',
            method: 'GET',
            path: '/api/pools/pool/<poolAddress>/historical/hour',
            description: 'Hourly historical datapoints for charting.',
            requestExample: `curl -s __BASE_URL__/api/pools/pool/${samplePoolLower}/historical/hour | head`,
            responseExample: `{
  "success": true,
  "data": [
    { "timestamp": 0, "volumeUSD": "0", "tvlUSD": "0" }
  ]
}`,
        },
        {
            id: 'swap-pools-single',
            title: 'Swap route discovery (single hop)',
            method: 'GET',
            path: '/api/swaps/swap-pools-single?tokenIn=0x…&tokenOut=0x…',
            description: 'Returns candidate pools for a direct tokenIn/tokenOut swap (no quoting).',
            requestExample: 'curl -s "http://localhost:4200/api/swaps/swap-pools-single?tokenIn=0x...&tokenOut=0x..." | head',
            responseExample: `{
  "success": true,
  "data": [
    {
      "tokenIn": "0x...",
      "tokenOut": "0x...",
      "feeTier": "3000",
      "poolAddress": "0x..."
    }
  ]
}`,
        },
        {
            id: 'swap-pools',
            title: 'Swap route discovery (2-hop)',
            method: 'GET',
            path: '/api/swaps/swap-pools?tokenIn=0x…&tokenOut=0x…',
            description: 'Returns candidate 2-hop paths via common middle tokens (no quoting).',
            requestExample: 'curl -s "http://localhost:4200/api/swaps/swap-pools?tokenIn=0x...&tokenOut=0x..." | head',
            responseExample: `{
  "success": true,
  "data": [
    [
      { "tokenIn": "0x...", "tokenOut": "0x...", "feeTier": "3000", "poolAddress": "0x..." },
      { "tokenIn": "0x...", "tokenOut": "0x...", "feeTier": "3000", "poolAddress": "0x..." }
    ]
  ]
}`,
        },
        {
            id: 'user-tokens',
            title: 'User tokens (wallet token balances)',
            method: 'GET',
            path: '/api/user/tokens?userAddress=0x…',
            description: 'Returns token balances for a user (cacheable short TTL).',
            requestExample: 'curl -s "__BASE_URL__/api/user/tokens?userAddress=0x..." | head',
            responseExample: `{
  "success": true,
  "data": [
    { "id": "0x...", "symbol": "...", "userBalance": "0" }
  ]
}`,
        },
        {
            id: 'user-positions',
            title: 'User positions (LP NFTs)',
            method: 'GET',
            path: '/api/pools/user-positions?userAddress=0x…&poolAddress=0x…',
            description: 'Returns user LP positions. poolAddress is optional.',
            requestExample: `curl -s "__BASE_URL__/api/pools/user-positions?userAddress=0x...&poolAddress=${samplePoolLower}" | head`,
            responseExample: `{
  "success": true,
  "data": [
    { "id": "0", "liquidity": "0", "pool": { "id": "${samplePool ?? '0x…'}" } }
  ]
}`,
        },
    ]

    return (
        <div className="grid grid-cols-1 gap-6">
            <Card title="HTTP API">
                These are the public endpoints exposed by the Prism Next.js server.
            </Card>

            <section className="bg-background-light/50 backdrop-blur-sm rounded-lg border border-background-light p-6">
                <h2 id="endpoint-reference" className="text-xl font-bold text-foreground" data-toc-label="Endpoint reference">
                    Endpoint reference
                </h2>
                <div className="mt-3 text-sm text-foreground-light">
                    Expand an endpoint to see an example request and response.
                </div>
                <div className="mt-4">
                    <ClientOnlyEndpointAccordion items={endpoints} />
                </div>
            </section>

            <section className="bg-background-light/50 backdrop-blur-sm rounded-lg border border-background-light p-6">
                <h2 id="notes" className="text-xl font-bold text-foreground" data-toc-label="Notes">Notes</h2>
                <div className="mt-3 text-sm text-foreground-light">
                    Use the same base URL as the Prism web app.
                </div>
                <div className="mt-3 text-sm text-foreground-light">
                    API routes return <span className="font-mono text-foreground">{`{ success: true, data: ... }`}</span> on success and
                    <span className="font-mono text-foreground">{`{ success: false, error: "..." }`}</span> on errors.
                </div>
                <div className="mt-3 text-sm text-foreground-light">
                    Public endpoints are rate-limited. When exceeded, responses return HTTP 429 with
                    <span className="font-mono text-foreground">{`{ success: false, error: "rate limit exceeded" }`}</span> and
                    <span className="font-mono text-foreground">RateLimit-Limit</span>,
                    <span className="font-mono text-foreground">RateLimit-Remaining</span>,
                    <span className="font-mono text-foreground">RateLimit-Reset</span> headers.
                </div>
            </section>

            <DocsPager />
        </div>
    )
}
