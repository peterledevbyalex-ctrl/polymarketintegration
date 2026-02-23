import { NextResponse } from 'next/server'

import { CURRENT_CONFIG } from '@/../config/dex_config'

export const revalidate = 30

type HealthResponse = {
    ok: boolean
    timestamp: string
    chain: { id: number; name: string }
}

export async function GET(): Promise<NextResponse> {
    const body: HealthResponse = {
        ok: true,
        timestamp: new Date().toISOString(),
        chain: { id: CURRENT_CONFIG.chain.id, name: CURRENT_CONFIG.chain.name },
    }

    return NextResponse.json(body, {
        headers: {
            'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=30',
        },
    })
}
