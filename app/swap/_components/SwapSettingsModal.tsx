"use client"

import { useState, useEffect, MouseEvent } from 'react'

import { Button } from '@/components/ui/button'


interface SwapSettingsModalProps {
    isOpen: boolean
    slippage: number | null
    useMulticallSwap: boolean,
    useUniversalRouter: boolean,
    useSmartWalletFeature: boolean,
    closeModal: () => void
    onSlippageChange: (slippage: number | null) => void
    setUseMulticallSwap: React.Dispatch<React.SetStateAction<boolean>>
    setUseUniversalRouter: React.Dispatch<React.SetStateAction<boolean>>
    setUseSmartWalletFeature: React.Dispatch<React.SetStateAction<boolean>>
}


export const SwapSettingsModal: React.FC<SwapSettingsModalProps> = ({
    isOpen,
    slippage,
    useMulticallSwap,
    useUniversalRouter,
    useSmartWalletFeature,
    closeModal,
    onSlippageChange,
    setUseMulticallSwap,
    setUseUniversalRouter,
    setUseSmartWalletFeature,
}) => {
    const presetSlippages = [0.3, 0.5]

    const [customSlippage, setCustomSlippage] = useState('')
    const [selectedSlippage, setSelectedSlippage] = useState<number | null>(slippage)
    const [selectedSlippageMode, setSelectedSlippageMode] = useState<'auto' | 'custom' | 'preset'>(slippage === null ? 'auto' : ((slippage && presetSlippages.includes(Number(slippage))) ? 'preset' : 'custom'))


    const handleAutoClick = () => {
        setCustomSlippage('');
        setSelectedSlippage(null);
        setSelectedSlippageMode('auto');
        onSlippageChange(null)
    }

    const handleCustomClick = () => {
        setSelectedSlippageMode('custom')

        const value = presetSlippages.at(-1)?.toString() ?? '0.5'
        setCustomSlippage(value)
        onSlippageChange(Number(value))
    }

    const handlePresetClick = (value: number) => {
        setSelectedSlippageMode('preset')
        setSelectedSlippage(value)
        setCustomSlippage(value.toString())
        onSlippageChange(value)
    }

    const handleCustomSlippageChange = (value: string) => {
        setSelectedSlippageMode('custom')
        setCustomSlippage(value)

        const numValue = parseFloat(value)

        if (!isNaN(numValue) && numValue > 0 && numValue <= 50) {
            setSelectedSlippage(numValue)
            onSlippageChange(numValue)
        }
    }

    const handleClose = () => {
        closeModal()
    }


    const clicModal = (event: MouseEvent) => {
        // @ts-ignore
        if (event.target.classList.contains('modal-container')) {
            closeModal()
        }
    }


    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 modal-container" onClick={(e) => clicModal(e)}>

            <div className="bg-background-light-sm border border-background-light rounded-2xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden p-4">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">Settings</h2>

                    <button
                        onClick={handleClose}
                        className="text-2xl p-2 rounded-lg hover:bg-background-light transition-colors duration-200 cursor-pointer"
                    >
                        ✕
                    </button>
                </div>

                {/* Slippage Settings */}
                <div className="mb-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Trade Slippage</h3>

                    {/* Preset Slippage Buttons */}
                    <div className="grid grid-cols-4 space-x-1 mb-4 text-foreground">
                        <button
                            key={"auto"}
                            onClick={() => handleAutoClick()}
                            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${selectedSlippageMode === 'auto'
                                ? 'bg-background-light-xl text-background-btn'
                                : 'text-foreground-light cursor-pointer hover:bg-background-light-xl'
                                }`}
                        >
                            Auto
                        </button>

                        {presetSlippages.map((preset) => (
                            <button
                                key={preset}
                                onClick={() => handlePresetClick(preset)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${selectedSlippageMode === 'preset' && selectedSlippage === preset
                                    ? 'bg-background-light-xl text-background-btn'
                                    : 'text-foreground-light cursor-pointer hover:bg-background-light-xl'
                                    }`}
                            >
                                {preset}%
                            </button>
                        ))}

                        <button
                            key={"custom"}
                            onClick={() => handleCustomClick()}
                            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${selectedSlippageMode === 'custom'
                                ? 'bg-background-light-xl text-background-btn'
                                : 'text-foreground-light cursor-pointer hover:bg-background-light-xl'
                                }`}
                        >
                            Custom
                        </button>
                    </div>

                    {selectedSlippageMode === 'custom' && (
                        <>
                            {/* Custom Slippage Input */}
                            <div className="mb-4 relative">
                                <input
                                    type="text"
                                    placeholder="Custom"
                                    value={customSlippage}
                                    onChange={(e) => handleCustomSlippageChange(e.target.value)}
                                    min="0"
                                    max="50"
                                    step="0.1"
                                    className={`w-full px-4 py-2 rounded-lg bg-cyber-slate-30 border text-foreground placeholder-gray-400 outline-none transition-all focus:bg-background-light-xl hover:bg-background-light ${customSlippage !== ''
                                        ? ''
                                        : ''
                                        }`}
                                />
                                <span className="absolute right-3 top-2 text-gray-400">%</span>
                            </div>
                        </>
                    )}

                    <p className="mt-3 text-sm text-foreground-light mb-4">
                        Set the allowed percentage difference between the quoted price and actual execution price of your trade.
                    </p>

                    {/* Warning for high slippage */}
                    {selectedSlippage > 5 && (
                        <div className="mt-3 p-3 border rounded-lg">
                            <p className="text-sm">
                                ⚠️ High slippage tolerance! Your transaction may be frontrun.
                            </p>
                        </div>
                    )}

                    {/* Warning for very low slippage */}
                    {selectedSlippage < 0.1 && selectedSlippage > 0 && (
                        <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                            <p className="text-sm text-yellow-400">
                                ⚠️ Very low slippage tolerance! Your transaction may fail.
                            </p>
                        </div>
                    )}
                </div>

                {/* Current Settings Display */}
                <div className="bg-cyber-slate-30 border rounded-lg p-2 mb-6">
                    <div className="flex justify-between items-center">
                        <span className="text-foreground-light">Current Slippage:</span>
                        <span className="font-medium">
                            {selectedSlippageMode === 'auto' && (
                                <>
                                    Auto
                                </>
                            )}

                            {selectedSlippageMode !== 'auto' && (
                                <>
                                    {selectedSlippage}%
                                </>
                            )}
                        </span>
                    </div>
                </div>


                <div className="grid grid-cols-3 mb-4 p-1 bg-background-light rounded-md gap-2">
                    <div className="flex flex-col items-center">
                        <div className="text-sm mb-1">Smart Wallet</div>
                        <button
                            className={`w-full p-2 cursor-pointer rounded transition-colors ${useSmartWalletFeature ? 'bg-primary text-white' : 'bg-background-light-xs hover:bg-background-light-xl'}`}
                            onClick={() => setUseSmartWalletFeature(v => !v)}
                        >
                            {useSmartWalletFeature ? "✓ Active" : "Select"}
                        </button>
                    </div>

                </div>

                <div className="grid grid-cols-3 mb-4 p-1 bg-background-light rounded-md gap-2">
                    {/* Option 1: No optimization */}
                    <div className="flex flex-col items-center">
                        <div className="text-sm mb-1">No optimization</div>
                        <button
                            className={`w-full p-2 cursor-pointer rounded transition-colors ${!useMulticallSwap && !useUniversalRouter ? 'bg-primary text-white' : 'bg-background-light-xs hover:bg-background-light-xl'}`}
                            onClick={() => {
                                setUseMulticallSwap(false);
                                setUseUniversalRouter(false);
                            }}
                        >
                            {!useMulticallSwap && !useUniversalRouter ? "✓ Active" : "Select"}
                        </button>
                    </div>

                    {/* Option 2: Use multicall */}
                    <div className="flex flex-col items-center">
                        <div className="text-sm mb-1">Multi call</div>
                        <button
                            className={`w-full p-2 cursor-pointer rounded transition-colors ${useMulticallSwap && !useUniversalRouter ? 'bg-primary text-white' : 'bg-background-light-xs hover:bg-background-light-xl'}`}
                            onClick={() => {
                                setUseMulticallSwap(true);
                                setUseUniversalRouter(false);
                            }}
                        >
                            {useMulticallSwap && !useUniversalRouter ? "✓ Active" : "Select"}
                        </button>
                    </div>

                    {/* Option 3: Use universal router */}
                    <div className="flex flex-col items-center">
                        <div className="text-sm mb-1">Universal router</div>
                        <button
                            className={`w-full p-2 cursor-pointer rounded transition-colors ${useUniversalRouter ? 'bg-primary text-white' : 'bg-background-light-xs hover:bg-background-light-xl'}`}
                            onClick={() => {
                                setUseMulticallSwap(false);
                                setUseUniversalRouter(true);
                            }}
                        >
                            {useUniversalRouter ? "✓ Active" : "Select"}
                        </button>
                    </div>
                </div>


                {/* Action Buttons */}
                <div className="flex space-x-3">
                    <Button
                        //className="flex-1 py-3 rounded-lg bg-cyber-slate-50 border border-gray-600 text-foreground-light hover:bg-cyber-slate-70 hover:text-foreground transition-all"
                        variant='outline'
                        className="w-full cursor-pointer text-background-btn"
                        onClick={handleClose}
                    >
                        Close
                    </Button>
                </div>
            </div>
        </div>
    )
}
