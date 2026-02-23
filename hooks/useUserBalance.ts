
import { Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";

import * as apiBlockchainTokens from '@/lib/api_blockchain_tokens';



export interface UserBalanceHook {
    userBalance: string,
    userBalanceInitialized: boolean,
    userBalanceLoading: boolean,
    userBalanceError: string,
    fetchUserBalance: () => void,
    setUserBalance: Dispatch<SetStateAction<string>>,
    setUserBalanceLoading: Dispatch<SetStateAction<boolean>>,
    setUserBalanceError: Dispatch<SetStateAction<string>>,
}


export function useUserBalance(userAddress: `0x${string}`): UserBalanceHook {
    const [userBalance, setUserBalance] = useState<string>('')
    const [userBalanceInitialized, setUserBalanceInitialized] = useState(false)
    const [userBalanceLoading, setUserBalanceLoading] = useState(false)
    const [userBalanceError, setUserBalanceError] = useState<string | null>(null)

    useEffect(() => {
        if (!userAddress) return;

        const _run = () => {
            fetchUserBalance();
        }

        const timer = setTimeout(_run, 100);

        return () => clearTimeout(timer);
    }, [userAddress]);


    const fetchUserBalance = useCallback(async () => {
        try {
            setUserBalance('');
            setUserBalanceError(null);
            setUserBalanceLoading(true);

            if (userAddress) {
                const balance = await apiBlockchainTokens.getUserTokenBalance(null, userAddress)
                setUserBalance(balance);

                setUserBalanceInitialized(true);
            }

        } catch (err: any) {
            setUserBalanceError(err.message);
            //console.warn(`useUserBalance.fetchUserBalance ERROR. ${err.message}`)

        } finally {
            setUserBalanceLoading(false);
        }
    }, [userAddress])


    const userBalanceHook: UserBalanceHook = {
        userBalance,
        userBalanceInitialized,
        userBalanceLoading,
        userBalanceError,
        fetchUserBalance,
        setUserBalance,
        setUserBalanceLoading,
        setUserBalanceError,
    }

    return userBalanceHook
}



