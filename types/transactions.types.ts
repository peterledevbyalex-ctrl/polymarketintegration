
import { Hex } from "viem"


export interface TransactionResult {
    success: boolean
    transactionHash?: Hex
    error?: string
}


export type SimpleResult = {
    success: boolean
    error?: string
} & Record<string, any>



