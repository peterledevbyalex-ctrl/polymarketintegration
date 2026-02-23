"use client"

import React from 'react'
import Link from 'next/link';

import { EXPLORER_URL } from '@/config.app';


interface PoolCreatePoolStep4Props {
    poolAddress: `0x${string}`,
}


export const PoolCreatePoolStep4: React.FC<PoolCreatePoolStep4Props> = ({ poolAddress }) => {
    return (
        <>
            <div className="font-semibold mb-4">
                Pool Created !
            </div>

            <div className="flex flex-col space-y-4">
                <div>
                    <Link
                        href={`/pools/${poolAddress}`}
                        className="text-sm text-foreground-light border rounded px-2 py-1 hover:bg-background-light"
                    >
                        View Pool {poolAddress}
                    </Link>
                </div>

                <div>
                    <a
                        href={`${EXPLORER_URL}/address/${poolAddress}`}
                        target='_blank'
                        className="text-sm text-foreground-light border rounded px-2 py-1 hover:bg-background-light"
                        >
                        View on explorer
                    </a>
                </div>
            </div>

        </>
    );
}

