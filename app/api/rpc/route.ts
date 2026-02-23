
import { NextResponse } from 'next/server'
import { getDebugHeaders } from './rpc_debug'

export const runtime = 'nodejs'


export async function POST(req: Request): Promise<Response> {
    const upstreamUrl = process.env.RPC_HTTP_URL
    if (!upstreamUrl) {
        return NextResponse.json({ ok: false, error: 'Missing env var: RPC_HTTP_URL' }, { status: 500 })
    }

    const body = await req.text()
    let requestBody = body
    let isRealtimeAPI = false
    let originalMethod = ''

    // Use MegaETH Realtime API for instant receipts
    try {
        const jsonBody = JSON.parse(body)
        originalMethod = jsonBody.method
        console.log(`📡 [RPC] Received request: ${originalMethod}`)
        
        // Intercept both eth_sendTransaction and eth_sendRawTransaction
        if (jsonBody.method === 'eth_sendRawTransaction' || jsonBody.method === 'eth_sendTransaction') {
            const targetMethod = jsonBody.method === 'eth_sendRawTransaction' 
                ? 'realtime_sendRawTransaction' 
                : 'realtime_sendTransaction'
            jsonBody.method = targetMethod
            requestBody = JSON.stringify(jsonBody)
            isRealtimeAPI = true
            console.log(`🚀 [RPC] Converting ${originalMethod} → ${targetMethod} for instant receipt`)
        }
    } catch (e) {
        // Invalid JSON, pass through as-is
    }

    const startTime = Date.now()
    const upstreamResponse = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: requestBody,
        cache: 'no-store',
    })

    const upstreamText = await upstreamResponse.text()
    const duration = Date.now() - startTime

    if (isRealtimeAPI) {
        console.log(`⚡ [RPC] Realtime API response in ${duration}ms (instant receipt)`)
        try {
            const response = JSON.parse(upstreamText)
            if (response.result?.transactionHash) {
                console.log(`✅ [RPC] Transaction hash: ${response.result.transactionHash}`)
            }
        } catch (e) {
            // Ignore parse errors
        }
    } else if (originalMethod === 'eth_sendRawTransaction') {
        console.log(`⏱️  [RPC] Standard eth_sendRawTransaction in ${duration}ms`)
    }

    const debugHeaders = {
        ...getDebugHeaders(body, upstreamText), // uncomment to add RPC debug headers
    };

    return new Response(upstreamText, {
        status: upstreamResponse.status,
        headers: {
            'content-type': upstreamResponse.headers.get('content-type') ?? 'application/json',
            'cache-control': 'no-store',
            ...debugHeaders,
        },
    })
}

