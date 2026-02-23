import React from 'react'
import { PolymarketProfileContent } from '../_components/PolymarketProfileContent'

type ProfilePageProps = {
    params: Promise<{}>,
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>,
}

export const metadata = {
    title: 'Prism DEX - My Positions',
    description: 'View your Polymarket positions and trading history',
    keywords: 'polymarket, positions, portfolio, trading history',
}

const ProfilePage: React.FC<ProfilePageProps> = async ({ searchParams }) => {
    return <PolymarketProfileContent />
}

export default ProfilePage
