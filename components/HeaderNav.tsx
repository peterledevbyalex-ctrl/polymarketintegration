"use client"

import React, { useState } from 'react';
import Link from 'next/link'
import { usePathname } from 'next/navigation';
import { useAccountModal, useConnectModal } from '@rainbow-me/rainbowkit';
import { MenuIcon, XIcon } from 'lucide-react';

import { useApp } from '@/providers/AppProvider';
import { formatAddress } from '@/lib/ui_utils';
import { NavigationMenu, NavigationMenuItem, NavigationMenuList } from '@/components/ui/navigation-menu';
import { Button } from '@/components/ui/button';

import { PrismLogo } from './icons/PrismLogo';
import { WalletIcon } from './icons/WalletIcon';


const menuActiveLinkClass = 'bg-background-light text-foreground font-semibold';
const menuDefaultLinkClass = 'text-foreground-light cursor-pointer';
const menuDisabledLinkClass = 'text-foreground-light/50 cursor-not-allowed';


const refOnlyMode = process.env.NEXT_PUBLIC_REF_ONLY_MODE === 'true'

export const HeaderNav = React.memo(function HeaderNav() {
    const currentPath = usePathname();

    const { isConnected, userAddress } = useApp();

    const { openConnectModal } = useConnectModal()
    const { openAccountModal } = useAccountModal()

    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);

    const showComingSoon = (label: string) => label === 'Trade';

    const navLinks: Array<{
        label: string;
        href: string;
        basePaths: string[];
        disabled?: boolean;
        external?: boolean;
        subLinks?: Array<{ label: string; href: string; disabled?: boolean }>;
    }> = [
        { label: 'Swap', href: '/swap', basePaths: ['/swap'] },
        { label: 'Pools', href: '/pools', basePaths: ['/pools'] },
        { label: 'Launchpad', href: 'https://fasterz.fun', basePaths: [], external: true },
        {
            label: 'Earn',
            href: '/earn/vaults',
            basePaths: ['/earn', '/earn/vaults'],
            subLinks: [
                { label: 'Vaults', href: '/earn/vaults' },
                { label: 'Lending', href: '/earn/lending', disabled: true },
            ],
        },
        {
            label: 'Trade',
            href: '/trade',
            basePaths: ['/trade'],
            disabled: true,
            subLinks: [
                { label: 'Spot/Perps', href: '/trade' },
                { label: 'Basis Trade', href: '/trade/basis' },
            ],
        },
        {
            label: 'Predict',
            href: '/predict',
            basePaths: ['/predict'],
            subLinks: [
                { label: 'Markets', href: '/predict' },
                { label: 'My Positions', href: '/predict/profile' },
            ],
        },
        {
            label: 'Portfolio',
            href: '/portfolio',
            basePaths: ['/portfolio'],
            subLinks: [
                { label: 'Overview', href: '/portfolio' },
                { label: 'Points', href: '/portfolio/points', disabled: true },
                { label: 'Referral', href: '/portfolio/referral' },
            ],
        },
    ];

    const isActive = (paths: string[]) => {
        return paths.some((path) => currentPath.startsWith(path))
    }

    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-background/100 dark:bg-background/100 backdrop-blur-sm " style={{ height: '70px' }}>
            <div className="px-4 py-4">
                <div className="flex items-center justify-between">
                     <div className="flex">
                        {/* Logo */}
                        <div className="flex items-center mx-5">
                            <Link href={refOnlyMode ? '/portfolio/referral' : '/'} className="text-2xl font-bold font-sans">
                                <PrismLogo />
                            </Link>
                        </div>

                        {/* Desktop Navigation - hover dropdowns */}
                        <nav className="hidden md:flex items-center mx-5">
                            <NavigationMenu>
                                <NavigationMenuList className="flex gap-6">
                                    {navLinks.map((link) => (
                                        <NavigationMenuItem
                                            key={link.label}
                                            className="relative"
                                            onMouseEnter={() => setHoveredLabel(link.label)}
                                            onMouseLeave={() => setHoveredLabel(null)}
                                        >
                                            {refOnlyMode ? (
                                                <span
                                                    className={`px-2 py-2 rounded ${menuDisabledLinkClass}`}
                                                    title="Referral only"
                                                >
                                                    {link.label}
                                                </span>
                                            ) : link.disabled ? (
                                                <span
                                                    className={`px-2 py-2 rounded ${menuDisabledLinkClass}`}
                                                    title="Soon"
                                                >
                                                    {link.label}
                                                </span>
                                            ) : link.external ? (
                                                <a
                                                    href={link.href}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`transition-colors duration-150 ease-in hover:bg-background-light px-2 py-2 rounded ${menuDefaultLinkClass}`}
                                                >
                                                    {link.label}
                                                </a>
                                            ) : (
                                                <a
                                                    href={link.href}
                                                    className={`transition-colors duration-150 ease-in hover:bg-background-light px-2 py-2 rounded ${isActive(link.basePaths) ? menuActiveLinkClass : menuDefaultLinkClass}`}
                                                >
                                                    {link.label}
                                                </a>
                                            )}
                                            {/* Hover dropdown: COMING SOON for Trade/Predict, sublinks for others */}
                                            {hoveredLabel === link.label && (
                                                showComingSoon(link.label) ? (
                                                    <div className="absolute left-0 top-full pt-1 min-w-[120px]">
                                                        <div className="rounded-lg border border-background-light-2xl bg-background-light shadow-lg px-4 py-2">
                                                            <span className="text-xs text-foreground-light/60">COMING SOON</span>
                                                        </div>
                                                    </div>
                                                ) : link.subLinks && link.subLinks.length > 0 && (
                                                    <div className="absolute left-0 top-full pt-1 min-w-[160px]">
                                                        <div className="rounded-lg border border-background-light-2xl bg-background-light shadow-lg py-2">
                                                            {link.subLinks.map((sub) => (
                                                                refOnlyMode || sub.disabled ? (
                                                                    <span
                                                                        key={sub.label}
                                                                        className="block px-4 py-2 text-sm text-foreground-light/50 cursor-not-allowed"
                                                                    >
                                                                        {sub.label}
                                                                    </span>
                                                                ) : (
                                                                    <Link
                                                                        key={sub.label}
                                                                        href={sub.href}
                                                                        className="block px-4 py-2 text-sm text-foreground-light hover:bg-background-light-sm hover:text-foreground transition-colors"
                                                                    >
                                                                        {sub.label}
                                                                    </Link>
                                                                )
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                        </NavigationMenuItem>
                                    ))}
                                </NavigationMenuList>
                            </NavigationMenu>
                        </nav>
                    </div>

                    {/* Desktop Actions */}
                    <div className="hidden md:flex items-center gap-4">
                        <div
                            className='flex'
                            {...(!true && {
                                'aria-hidden': true,
                                style: {
                                    opacity: 0,
                                    pointerEvents: 'none',
                                    userSelect: 'none',
                                },
                            })}
                        >


                            {(() => {
                                if (!isConnected) {
                                    return (
                                        <Button variant='secondary'
                                            onClick={openConnectModal}
                                            className="cursor-pointer"
                                        >
                                            <span className="hidden sm:inline">Connect Wallet</span>
                                            <span className="sm:hidden">Connect</span>
                                        </Button>
                                    );
                                }

                                //if (chain.unsupported) {
                                //    return (
                                //        <Button
                                //            onClick={openChainModal}
                                //            className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:border-red-500"
                                //        >
                                //            Wrong network
                                //        </Button>
                                //    );
                                //}

                                return (
                                    <div className="flex items-center space-x-3">
                                        <Button
                                            variant='ghost'
                                            onClick={openAccountModal}
                                            className="bg-background-light cursor-pointer"
                                        >
                                            <span className="text-blue-500">
                                                <WalletIcon />
                                            </span>

                                            <span className="text-foreground">
                                                {formatAddress(userAddress as `0x${string}`)}
                                            </span>
                                        </Button>
                                    </div>
                                );
                            })()}
                        </div>

                    </div>

                    {/* Mobile MenuIcon Button */}
                    <button
                        className="md:hidden text-foreground"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        aria-label="Toggle mobile menu"
                    >
                        {mobileMenuOpen ? <XIcon size={32} strokeWidth={1.5} /> : <MenuIcon size={32} strokeWidth={1.5} />}
                    </button>
                </div>

                {/* Mobile Navigation */}
                {mobileMenuOpen && (
                    <div className="md:hidden mt-6 mb-6 pb-4 bg-background px-2 py-4 rounded-md border-2 border-background-light-3xl shadow-xl/20">
                        <nav className="flex items-center justify-center w-full">
                            <ul className="group flex-1 list-none items-center justify-center flex flex-col gap-2 w-full">
                                {navLinks.map((link) => (
                                    <li key={link.label} className="w-full">
                                        {refOnlyMode ? (
                                            <span
                                                className="w-full bg-background-light text-foreground/50 font-body font-normal text-lg block rounded-md text-center py-2 cursor-not-allowed"
                                                title="Referral only"
                                            >
                                                {link.label}
                                            </span>
                                        ) : link.disabled ? (
                                            <span
                                                className="w-full bg-background-light text-foreground/50 font-body font-normal text-lg block rounded-md text-center py-2"
                                                title="Soon"
                                            >
                                                {link.label}
                                                {showComingSoon(link.label) && (
                                                    <span className="block text-xs text-foreground-light/60 mt-0.5">COMING SOON</span>
                                                )}
                                            </span>
                                        ) : link.external ? (
                                            <a
                                                href={link.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="w-full bg-background-light text-foreground font-body font-normal text-lg hover:text-primary transition-colors duration-150 ease-in cursor-pointer block rounded-md text-center py-2"
                                                onClick={() => setMobileMenuOpen(false)}
                                            >
                                                {link.label}
                                            </a>
                                        ) : (
                                            <Link
                                                href={link.href}
                                                className="w-full bg-background-light text-foreground font-body font-normal text-lg hover:text-primary transition-colors duration-150 ease-in cursor-pointer block rounded-md text-center py-2"
                                                onClick={() => setMobileMenuOpen(false)}
                                            >
                                                {link.label}
                                            </Link>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </nav>

                        <div className="mt-8 flex flex-col gap-4">
                            {(() => {
                                if (isConnected) {
                                    return <>
                                            <Button
                                                variant='secondary'
                                                onClick={() => openAccountModal()}
                                                //className="bg-primary text-primary-foreground font-body font-normal text-base px-8 py-4 rounded-lg transition-colors duration-200 ease-in w-full"
                                            >
                                                {formatAddress(userAddress)}
                                            </Button>
                                        </>

                                } else {
                                    return <>
                                            <Button
                                                variant='secondary'
                                                onClick={() => openConnectModal()}
                                                //className="bg-primary text-primary-foreground font-body font-normal text-base px-8 py-4 rounded-lg transition-colors duration-200 ease-in w-full"
                                            >
                                                Connect Wallet
                                            </Button>
                                        </>
                                }
                            })()}

                        </div>
                    </div>
                )}
            </div>
        </header>
    );
});
