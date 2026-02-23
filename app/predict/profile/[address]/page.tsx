import React from 'react'
import { UserProfileContent } from '../../_components/UserProfileContent'

type UserProfilePageProps = {
    params: Promise<{ address: string }>,
}

export const metadata = {
    title: 'Prism DEX - Trader Profile',
    description: 'View trader profile and trading history',
}

const UserProfilePage: React.FC<UserProfilePageProps> = async ({ params }) => {
    const { address } = await params
    return <UserProfileContent address={address} />
}

export default UserProfilePage
