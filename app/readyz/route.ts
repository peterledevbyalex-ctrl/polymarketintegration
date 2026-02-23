import { NextResponse } from 'next/server'

import { CURRENT_CONFIG } from '@/../config/dex_config'
import * as goldsky from '@/server/lib/goldsky'

export const revalidate = 0

type ReadyzResponse = {
    ok: boolean
    timestamp: string
    chain: { id: number; name: string }
}

export async function GET(): Promise<NextResponse> {
    const bodyBase = {
        timestamp: new Date().toISOString(),
        chain: { id: CURRENT_CONFIG.chain.id, name: CURRENT_CONFIG.chain.name },
    } satisfies Omit<ReadyzResponse, 'ok'>

    try {
        const graphqlClient = goldsky.getGoldskyClient()
        await goldsky.getFactory(graphqlClient)

        const body: ReadyzResponse = { ok: true, ...bodyBase }

        return NextResponse.json(body, {
            headers: {
                'Cache-Control': 'no-store, max-age=0',
            },
        })
    } catch {
        const body: ReadyzResponse = { ok: false, ...bodyBase }

        return NextResponse.json(body, {
            status: 503,
            headers: {
                'Cache-Control': 'no-store, max-age=0',
            },
        })
    }
}
