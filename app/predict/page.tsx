import React from 'react'
import { PolymarketPageContent } from './_components/PolymarketPageContent'

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
    return <PolymarketPageContent />
}

export default PredictPage
