import { NextRequest, NextResponse } from 'next/server';

// Redstone ETH/USD Price Feed on MegaETH
const REDSTONE_ETH_USD_FEED = '0xe5867B1d421f0b52697F16e2ac437e87d66D5fbF';

// Cache for 30 seconds (Redstone Bolt updates frequently anyway)
let cachedPrice: { value: string; timestamp: number } | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds

// latestAnswer() selector = keccak256("latestAnswer()")[:4]
const LATEST_ANSWER_SELECTOR = '0x50d25bcd';
// decimals() selector
const DECIMALS_SELECTOR = '0x313ce567';

async function callContract(rpcUrl: string, data: string): Promise<string> {
  console.log(`[ETH Price] Calling contract with selector: ${data}`);
  
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: REDSTONE_ETH_USD_FEED, data }, 'latest'],
    }),
  });
  
  const json = await response.json();
  console.log(`[ETH Price] RPC response for ${data}:`, JSON.stringify(json));
  
  // Check for RPC error
  if (json.error) {
    throw new Error(`RPC error: ${json.error.message || JSON.stringify(json.error)}`);
  }
  
  // Check for empty/invalid result
  if (!json.result || json.result === '0x' || json.result === '0x0') {
    throw new Error(`Empty result from contract call: ${data}`);
  }
  
  return json.result;
}

export async function GET(request: NextRequest) {
  const rpcUrl = process.env.RPC_HTTP_URL;
  
  console.log(`[ETH Price] Starting fetch, RPC URL: ${rpcUrl ? 'configured' : 'MISSING!'}`);
  
  if (!rpcUrl) {
    console.error('[ETH Price] RPC_HTTP_URL not configured');
    return NextResponse.json({ ethPriceUSD: '3000' }); // Fallback
  }

  try {
    // Check cache first
    if (cachedPrice && Date.now() - cachedPrice.timestamp < CACHE_TTL_MS) {
      console.log(`[ETH Price] Returning cached: $${cachedPrice.value}`);
      return NextResponse.json({ ethPriceUSD: cachedPrice.value });
    }

    console.log(`[ETH Price] Cache miss, fetching from Redstone at ${REDSTONE_ETH_USD_FEED}`);

    // Fetch price and decimals in parallel
    const [answerHex, decimalsHex] = await Promise.all([
      callContract(rpcUrl, LATEST_ANSWER_SELECTOR),
      callContract(rpcUrl, DECIMALS_SELECTOR),
    ]);

    console.log(`[ETH Price] Raw response - answer: ${answerHex}, decimals: ${decimalsHex}`);

    // Parse results
    const answer = BigInt(answerHex);
    const decimals = parseInt(decimalsHex, 16);

    // Convert to human-readable (typically 8 decimals for Chainlink feeds)
    const ethPriceUSD = (Number(answer) / Math.pow(10, decimals)).toString();

    console.log(`[ETH Price] Parsed - answer: ${answer}, decimals: ${decimals}, price: $${ethPriceUSD}`);

    // Update cache
    cachedPrice = { value: ethPriceUSD, timestamp: Date.now() };

    return NextResponse.json({ ethPriceUSD });
  } catch (error) {
    console.error('[ETH Price] Error fetching from Redstone:', error);
    
    // Return cached value if available, even if stale
    if (cachedPrice) {
      console.log(`[ETH Price] Returning stale cache: $${cachedPrice.value}`);
      return NextResponse.json({ ethPriceUSD: cachedPrice.value });
    }

    // Fallback to a reasonable default
    console.log('[ETH Price] No cache, returning fallback: $3000');
    return NextResponse.json({ ethPriceUSD: '3000' });
  }
}
