import React from 'react'
import { PolymarketPageContent } from './_components/PolymarketPageContent'
import { SimplifiedPageContent } from './_components/SimplifiedPageContent'

type PredictPageProps = {
    params: Promise<{}>,
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>,
}

export const metadata = {
    title: 'Prism DEX - Predict',
    description: 'Prediction markets powered by Polymarket on Prism DEX',
    keywords: 'polymarket, prediction markets, betting, crypto markets',
}

const PredictPage: React.FC<PredictPageProps> = async ({ searchParams }) => {
    // Use simplified version with better filtering as default
    // Set USE_SIMPLIFIED_FILTERS=false in .env to use legacy system
    const useSimplified = process.env.USE_SIMPLIFIED_FILTERS !== 'false'
    
    return useSimplified ? <SimplifiedPageContent /> : <PolymarketPageContent />
}

export default PredictPage
