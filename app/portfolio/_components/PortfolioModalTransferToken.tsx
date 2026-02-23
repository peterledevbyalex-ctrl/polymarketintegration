
import React, { Dispatch, MouseEvent, SetStateAction, useEffect, useState } from 'react'
import { Address } from 'viem';
import toast from 'react-hot-toast';

import { formatValue } from '@/lib/ui_utils';

import { TokenLogo } from '@/components/TokenLogo';

import { Token, TransactionResult } from '@/types';


interface PortfolioModalTransferTokenProps {
    isOpen: boolean
    tokens: Token[]
    selectedToken: Token
    loading: boolean
    isTransferingToken: boolean
    transferTokenError: string
    transferTokenInfo: string
    closeModal: () => void
    transferToken: (tokenId: string, recipient: Address, userAmount: string) => Promise<TransactionResult>
    setTransferTokenError: Dispatch<SetStateAction<string>>
    setTransferTokenInfo: Dispatch<SetStateAction<string>>
}


interface TransferTokenFormProps {
    selectedToken: Token | null
    transferToken: (tokenId: string, recipient: Address, userAmount: string) => Promise<TransactionResult>
    transferTokenError: string | null
    transferTokenInfo: string | null
    isTransferingToken: boolean
    closeModal: () => void
    setTransferTokenError: Dispatch<SetStateAction<string | null>>
    setTransferTokenInfo: Dispatch<SetStateAction<string | null>>
}



export const PortfolioModalTransferToken: React.FC<PortfolioModalTransferTokenProps> = ({ isOpen, tokens, selectedToken, loading, isTransferingToken, transferTokenError, transferTokenInfo, closeModal, transferToken, setTransferTokenError, setTransferTokenInfo }) => {

    const clicModal = (event: MouseEvent) => {
        // @ts-ignore
        if (event.target.classList.contains('modal-container')) {
            closeModal()
        }
    }


    useEffect(() => {
        if (!isOpen || !selectedToken) {
            // reset values on modal open/close
            setTransferTokenError('')
            setTransferTokenInfo('')
            return;
        }

    }, [isOpen, selectedToken])


    if (!selectedToken || !isOpen) return null


    return (
        <div className="fixed inset-0 bg-background/90 flex items-center justify-center z-50 modal-container" onClick={(e) => clicModal(e)}>
            <div className="bg-background-light-sm border border-background-light rounded-2xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden p-4">

                {/* Header */}
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-background-light">
                    <h2 className="flex gap-3 text-xl font-bold">
                        <span className="">
                            Token Transfer
                        </span>

                        <span className="text-sm text-foreground-light">
                            {selectedToken.symbol}
                        </span>
                    </h2>

                    <button
                        onClick={closeModal}
                        className="text-2xl p-2 rounded-lg hover:bg-background-light transition-colors duration-200 cursor-pointer"
                    >
                        ✕
                    </button>
                </div>


                {/* Content */}
                <div className="p-2">
                    <div className="space-y-4">
                        <TransferTokenForm
                            selectedToken={selectedToken}
                            transferToken={transferToken}
                            transferTokenError={transferTokenError}
                            transferTokenInfo={transferTokenInfo}
                            isTransferingToken={isTransferingToken}
                            closeModal={closeModal}
                            setTransferTokenError={setTransferTokenError}
                            setTransferTokenInfo={setTransferTokenInfo}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}



const TransferTokenForm: React.FC<TransferTokenFormProps> = ({
    selectedToken,
    transferToken,
    transferTokenError,
    transferTokenInfo,
    isTransferingToken,
    closeModal,
    setTransferTokenError,
    setTransferTokenInfo
}) => {
    const [recipient, setRecipient] = useState('')
    const [amount, setAmount] = useState('')
    const [isValidAddress, setIsValidAddress] = useState(false)


    const handleTransferToken = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!selectedToken) return
        if (!isValidAddress) {
            setTransferTokenError('Please enter a valid Ethereum address')
            return
        }
        if (!amount || Number(amount) <= 0) {
            setTransferTokenError('Please enter a valid amount')
            return
        }
        //console.log('selectedToken:', selectedToken)

        const result = await transferToken(selectedToken.id, recipient as Address, amount)

        if (result.success) {
            toast.success('Transfer completed successfully!')

            setTimeout(() => {
                closeModal()
            }, 2000)

        } else {
            toast.error('Transfer failed!')
        }
    }


    useEffect(() => {
        // Validate Ethereum address
        const isValid = /^0x[a-fA-F0-9]{40}$/.test(recipient)
        setIsValidAddress(isValid)
    }, [recipient])


    if (!selectedToken) return null


    return (
        <form onSubmit={handleTransferToken} className="space-y-4">
            {/* Token Info */}
            <div className="flex items-center space-x-3 p-3 bg-background-light rounded-md">
                <TokenLogo token={selectedToken} />
                <div>
                    <div className="font-medium">{selectedToken.symbol}</div>
                    <div className="text-sm text-foreground-light">
                        Balance: {formatValue(selectedToken.userBalance || '0')}
                    </div>
                </div>
            </div>

            {/* Recipient Address */}
            <div className="space-y-2">
                <label className="block text-sm font-medium">
                    Recipient Address
                </label>
                <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="0x..."
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${recipient && !isValidAddress ? 'border-red-500' : ''
                        }`}
                    disabled={isTransferingToken}
                />
                {recipient && !isValidAddress && (
                    <p className="text-sm text-red-500">Please enter a valid Ethereum address</p>
                )}
            </div>

            {/* Amount */}
            <div className="space-y-2">
                <label className="block text-sm font-medium">
                    Amount
                </label>
                <div className="relative">
                    <input
                        type="text"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.0"
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={isTransferingToken}
                    />
                    <button
                        type="button"
                        onClick={() => setAmount(selectedToken.userBalance || '0')}
                        className="absolute right-2 top-2 px-2 py-1 text-xs bg-background-light rounded hover:bg-background-light-xl"
                        disabled={isTransferingToken}
                    >
                        Max
                    </button>
                </div>
            </div>

            {/* Error/Info Messages */}
            {transferTokenError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-700">{transferTokenError}</p>
                </div>
            )}

            {transferTokenInfo && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                    <p className="text-sm text-green-700">{transferTokenInfo}</p>
                </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end space-x-3 pt-4">
                <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm border rounded-md hover:bg-background-light cursor-pointer"
                    disabled={isTransferingToken}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-background-btn text-background rounded-md hover:opacity-90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                    disabled={isTransferingToken || !isValidAddress || !amount}
                >
                    {isTransferingToken ? 'Transferring...' : 'Transfer'}
                </button>
            </div>
        </form>
    )
}

