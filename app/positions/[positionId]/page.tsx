import { Metadata } from 'next'

import { PositionDetailsComponent } from './_components/PositionDetailsComponent'

type PageProps = {
    params: Promise<{ positionId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    return {
        title: 'Position Details - Prism DEX',
        description: 'View and manage your liquidity position on Prism DEX',
    }
}

export default async function PositionPage({ params }: PageProps) {
    const { positionId } = await params

    return <PositionDetailsComponent positionId={positionId} />
}
