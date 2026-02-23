
import { cookies } from 'next/headers'

import { ClientLayout } from './ClientLayout';
import { CookiesProvider } from '@/providers/CookiesProvider';

import '@/styles/index.css'


export const metadata /* Metadata */ = {
    title: 'Prism DEX - Decentralized Exchange on MegaETH',
    description: 'Swaps at light-speed. Trade tokens instantly with the best rates. Fast, secure, and decentralized trading on MegaETH.',
    keywords: 'DEX, swap, tokens, DeFi, MegaETH, decentralized exchange',
    icons: {
        icon: ['/favicon.ico'],
    },
    openGraph: {
        title: 'Prism DEX',
        description: 'Trade tokens instantly with the best rates',
        images: ['/og-image.png'],
    },
    twitter: {
        card: 'summary_large_image',
        images: ['/og-image.png'],
    },
}


export default async function ServerLayout({ children }) {
    const cookiesStore = await cookies();
    const theme = cookiesStore.get('theme')?.value ?? 'dark';

    const footerIsOpen = !!Number(cookiesStore.get('footerIsOpen')?.value ?? '0');

    return (
        <html lang="en" className={`h-full ${theme}`}>
            <body className="h-full">
                <CookiesProvider>
                    <ClientLayout theme={theme} footerIsOpen={footerIsOpen}>
                        {children}
                    </ClientLayout>
                </CookiesProvider>
            </body>
        </html>
    )
}

