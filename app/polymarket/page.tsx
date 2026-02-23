import { redirect } from 'next/navigation'

type PolymarketPageProps = {
    params: Promise<{}>,
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>,
}

export const metadata = {
    title: 'Prism DEX - Predict',
    description: 'Prediction markets powered by Polymarket on Prism DEX',
    keywords: 'polymarket, prediction markets, betting, crypto markets',
}

const PolymarketPage: React.FC<PolymarketPageProps> = async ({ searchParams }) => {
    redirect('/predict')
}

export default PolymarketPage
