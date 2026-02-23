import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: Request): Promise<Response> {
    const upstreamUrl = process.env.AA_PAYMASTER_URL
    if (!upstreamUrl) {
        return NextResponse.json({ ok: false, error: 'Missing env var: AA_PAYMASTER_URL' }, { status: 500 })
    }

    const body = await req.text()

    const upstreamResponse = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body,
        cache: 'no-store',
    })

    const upstreamText = await upstreamResponse.text()

    return new Response(upstreamText, {
        status: upstreamResponse.status,
        headers: {
            'content-type': upstreamResponse.headers.get('content-type') ?? 'application/json',
            'cache-control': 'no-store',
        },
    })
}
