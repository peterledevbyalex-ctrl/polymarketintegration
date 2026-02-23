"use client"

import React, { ReactNode } from 'react'
import toast, { Toaster } from 'react-hot-toast';
import { GeistSans } from 'geist/font/sans';

import { AppProvider } from '@/providers/AppProvider';
import { WalletProvider } from '@/providers/WalletProvider';
import { LaunchpadTokensProvider } from '@/providers/LaunchpadTokensProvider';

import { HeaderNav } from '../components/HeaderNav';
import { FooterLinks } from '../components/FooterLinks';


export function ClientLayout({ children, theme, footerIsOpen }) {

    return (
        <WalletProvider>
            <AppProvider>
                <LaunchpadTokensProvider>
                    <AppLayout footerIsOpen={footerIsOpen}>
                        {children}
                    </AppLayout>
                </LaunchpadTokensProvider>
            </AppProvider>
        </WalletProvider>
    )
}


interface LayoutProps {
    children: ReactNode
    footerIsOpen: boolean
}


const AppLayout = ({ children, footerIsOpen }: LayoutProps) => {

    return (
        <>
            <div className={`flex flex-col relative h-full content-between text-foreground ${GeistSans.className}`}>

                {/* NavBar | fixed top | height=70px | zIndex=50 */}
                <HeaderNav />

                <main className="px-4 py-4 h-full flex flex-col content-between" style={{ marginTop: '110px' }}>
                    {/* Main Content | height=auto */}
                    {children}
                </main>

                {/* Footer Links | fixed bottom-right | height=auto | zIndex=10 */}
                <FooterLinks menuIsOpen={footerIsOpen} />

                {/* Toaster (notifications) */}
                <Toaster
                    toastOptions={{
                        style: {
                            background: 'hsl(var(--color-background))',
                            color: 'hsl(var(--color-foreground))',
                            border: '1px solid hsl(var(--border))',
                        },
                        position: 'bottom-right',
                    }}
                    containerStyle={{
                        marginBottom: '80px',
                    }}
                />
            </div>
        </>
    );
}
