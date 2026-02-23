/**
 * Proxy API route for launchpad tokens
 * Avoids mixed content issues when fetching from HTTPS in local HTTP dev
 */

import { NextResponse } from 'next/server';

const LAUNCHPAD_API_URL = 'https://www.fasterz.fun/api/tokens';

export async function GET() {
    try {
        const response = await fetch(LAUNCHPAD_API_URL, {
            headers: { 'Accept': 'application/json' },
            next: { revalidate: 60 }, // Cache for 60 seconds
        });

        if (!response.ok) {
            return NextResponse.json(
                { success: false, error: 'Failed to fetch tokens' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('[launchpad-tokens] Error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal error' },
            { status: 500 }
        );
    }
}
