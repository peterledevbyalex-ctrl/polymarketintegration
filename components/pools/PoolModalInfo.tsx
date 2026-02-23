"use client"

import { useState } from 'react'
import { formatUnits } from 'viem'
import Link from 'next/link'

import { POSITION_MANAGER_ADDRESS, EXPLORER_URL } from '@/config.app'
import { formatValue } from '@/lib/ui_utils'

import type { SubgraphPool, SubgraphPosition } from '@/types'


interface PoolModalInfoProps {
    selectedPool: SubgraphPool | null
    userPoolPositions: SubgraphPosition[]
    collectPoolFees: (tokenId: string) => Promise<void>
    loading?: boolean
}


// DEPRECATED


export const PoolModalInfo: React.FC<PoolModalInfoProps> = ({
    selectedPool,
    userPoolPositions,
    loading=false,
    collectPoolFees,
}) => {

    const [isCollecting, setIsCollecting] = useState(false)
    const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null)

    if (!selectedPool) return null

    // Filtrer les positions pour ce pool
    const poolPositions = userPoolPositions;
    //const poolPositions = userPoolPositions.filter(position =>
    //    position.pool.token0.id.toLowerCase() === selectedPool.token0.id.toLowerCase() &&
    //    position.pool.token1.id.toLowerCase() === selectedPool.token1.id.toLowerCase() &&
    //    position.pool.feeTier.toString() === selectedPool.feeTier
    //)

    const handleCollectFees = async (tokenId: string) => {
        setIsCollecting(true)
        setSelectedPositionId(tokenId)

        try {
            await collectPoolFees(tokenId)

        } catch (error) {
            //console.error('Error collecting fees:', error)

        } finally {
            setIsCollecting(false)
            setSelectedPositionId(null)
        }
    }

    const formatTick = (tick: number) => {
        return tick.toLocaleString()
    }

    const calculatePriceFromTick = (tick: number) => {
        return (1.0001 ** tick).toFixed(6)
    }


    return (
        <div className="bg-background flex items-center justify-center z-50 py-4">
            <div className="border rounded-lg p-6 w-full mx-4">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold">
                        Position Information
                    </h2>
                </div>

                {/* Pool Information */}
                <div className="mb-6 p-4 border rounded-lg">
                    <h3 className="text-lg font-semibold mb-3">Pool Details</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-gray-400">Pool:</span>
                            <span className="text-foreground ml-2">
                                {selectedPool.token0.symbol}/{selectedPool.token1.symbol}
                            </span>
                        </div>
                        <div>
                            <span className="text-gray-400">Fee Tier:</span>
                            <span className="text-foreground ml-2">{Number(selectedPool.feeTier) / 10_000}%</span>
                        </div>
                        <div>
                            <span className="text-gray-400">TVL:</span>
                            <span className="text-foreground ml-2">${formatValue(selectedPool.totalValueLockedUSD)}</span>
                        </div>
                        <div>
                            <span className="text-gray-400">24h Volume:</span>
                            <span className="text-foreground ml-2">${formatValue(selectedPool.volumeUSD)}</span>
                        </div>
                        <div>
                            <span className="text-gray-400">TVL {selectedPool.token0.symbol}:</span>
                            <span className="text-foreground ml-2">{formatValue(selectedPool.totalValueLockedToken0)}</span>
                        </div>
                        <div>
                            <span className="text-gray-400">TVL {selectedPool.token1.symbol}:</span>
                            <span className="text-foreground ml-2">{formatValue(selectedPool.totalValueLockedToken1)}</span>
                        </div>
                        <div>
                            <span className="text-gray-400">Current Price:</span>
                            <span className="text-foreground ml-2">{formatValue(selectedPool.token0Price)} {selectedPool.token1.symbol}</span>
                        </div>
                        <div>
                            <span className="text-gray-400">Total Liquidity:</span>
                            <span className="text-foreground ml-2">{formatValue(formatUnits(BigInt(selectedPool.liquidity), 18))}</span>
                        </div>
                    </div>
                </div>

                {/* User Positions */}
                <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3">Your Positions</h3>

                    {poolPositions.length === 0 ? (
                        <div className="text-center py-8">
                            <div>
                                <p className="">No positions</p>
                                <p className="text-sm text-foreground-light">
                                    You have no positions in this pool at the moment.
                                    <br />
                                    Create a new one and start earning 0% APY
                                </p>
                            </div>

                            <div className='py-4'>
                                <Link
                                    href={`/pools/${selectedPool.id}/add-liquidity`}
                                    className="text-sm text-foreground-light border rounded px-2 py-1 hover:bg-background-light"
                                >
                                    Add Liquidity
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {poolPositions.map((position) => (
                                <div key={position.id} className="p-4 border rounded-lg">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h4 className="text-foreground font-medium">
                                                Position #
                                                <a href={`${EXPLORER_URL}/token/${POSITION_MANAGER_ADDRESS}/instance/${position.id}`} target="_blank">{position.id}</a>
                                            </h4>
                                            <p className="text-sm text-gray-400">NFT Token ID: {position.id}</p>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-foreground font-medium">
                                                {formatValue(formatUnits(BigInt(position.liquidity), 18))} Liquidity
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                                        <div>
                                            <span className="text-gray-400">Price Range:</span>
                                            <div className="text-foreground">
                                                <div>Min: {calculatePriceFromTick(Number(position.tickLower))} {selectedPool.token1.symbol}</div>
                                                <div>Max: {calculatePriceFromTick(Number(position.tickUpper))} {selectedPool.token1.symbol}</div>
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-gray-400">Tick Range:</span>
                                            <div className="text-foreground">
                                                <div>Lower: {formatTick(Number(position.tickLower))}</div>
                                                <div>Upper: {formatTick(Number(position.tickUpper))}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Uncollected Fees */}
                                    <div className="mb-4 p-3 border rounded-lg">
                                        <h5 className="font-medium mb-2">Uncollected Fees</h5>
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <span className="text-gray-400">{selectedPool.token0.symbol}:</span>
                                                <span className="ml-2">
                                                    {/* formatValue(formatUnits(position.tokensOwed0, selectedPool.token0.decimals)) */}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-gray-400">{selectedPool.token1.symbol}:</span>
                                                <span className="ml-2">
                                                    {/* formatValue(formatUnits(position.tokensOwed1, selectedPool.token1.decimals)) */}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Collect Fees Button */}
                                    <div className="flex justify-between items-center">
                                        <div className="text-sm text-gray-400">
                                            Fee: {Number(selectedPool.feeTier) / 10_000}%
                                        </div>
                                        <button
                                            onClick={() => handleCollectFees(position.id)}
                                            disabled={isCollecting /* || (position.tokensOwed0 === 0n && position.tokensOwed1 === 0n) */}
                                            className={`px-4 py-2 rounded-lg font-medium transition-all ${isCollecting && selectedPositionId === position.id
                                                    ? 'border cursor-not-allowed'
                                                    : /* position.tokensOwed0 === 0n && position.tokensOwed1 === 0n */ true
                                                        ? 'text-gray-400 cursor-not-allowed'
                                                        : 'border'
                                                }`}
                                        >
                                            {isCollecting && selectedPositionId === position.id
                                                ? 'Collecting...'
                                                : /* position.tokensOwed0 === 0n && position.tokensOwed1 === 0n */ true
                                                    ? 'No Fees'
                                                    : 'Collect Fees'
                                            }
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>
        </div>
    )
}
