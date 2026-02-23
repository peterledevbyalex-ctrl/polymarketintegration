"use client"

import React from 'react'
import Link from 'next/link';


interface PoolCreatePositionStep3Props {
    poolAddress: `0x${string}`,
}


export const PoolCreatePositionStep3: React.FC<PoolCreatePositionStep3Props> = ({ poolAddress }) => {
    return (
        <>
            <div className="font-semibold mb-4">
                Position Created !
            </div>

            <Link
                href={`/pools/${poolAddress}`}
                className="text-sm text-foreground-light border rounded px-2 py-1 hover:bg-background-light"
            >
                Back to Pool
            </Link>
        </>
    );
}

