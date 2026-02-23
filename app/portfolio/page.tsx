
import React from 'react'

import { BackgroundMask } from '@/components/BackgroundMask';
import { PortfolioComponent } from './_components/PortfolioComponent';


export const metadata /* Metadata */ = {
    title: 'Prism DEX - Portfolio',
    description: 'Track your crypto portfolio in real-time. Monitor your token balances, liquidity positions, transaction history, and overall performance on MegaETH.',
    keywords: 'crypto portfolio, wallet tracker, token balance, DeFi dashboard, portfolio management',

}


const PortfolioPage: React.FC = () => {
    return (
        <>
            <div className="fixed inset-0 gradient-bg" />
            <BackgroundMask />

            <PortfolioComponent />
        </>
    )
}



export default PortfolioPage
