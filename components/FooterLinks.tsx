"use client"

import { useCallback, useEffect, useState } from 'react';
import { useCookies } from 'react-cookie';
import { usePathname } from 'next/navigation';

import { useApp } from '@/providers/AppProvider';

import { TelegramLogo } from './icons/TelegramLogo';
import { TwitterLogo } from './icons/TwitterLogo';


export function FooterLinks({ menuIsOpen: menuIsOpenInitial }: { menuIsOpen: boolean }) {
    const [cookies, setCookie, removeCookie] = useCookies()
    const { themeHook } = useApp();
    const { theme } = themeHook;
    const pathname = usePathname();

    const [menuIsOpen, setMenuIsOpen] = useState(menuIsOpenInitial);
    const [marginBottom, setMarginBottom] = useState(0);

    const links = [
        { label: 'Terms of Service', href: '#terms' },
        { label: 'Privacy Policy', href: '#privacy' },
        { label: 'Docs', href: '/docs' },
        { label: 'BrandKit', href: '#brandkit' },
    ];


    const updateMarginBottom = useCallback(() => {
        if (!document.getElementById('footer-large')) return;

        const documentHeight = document.documentElement.scrollHeight;
        const windowHeight = window.innerHeight;
        const scrollTop = window.pageYOffset ||
            document.documentElement.scrollTop ||
            document.body.scrollTop || 0;

        const tolerance = 80;
        const isBottom = scrollTop + windowHeight >= documentHeight - tolerance;

        if (isBottom) {
            const marginValue = Math.min(100, 100 - Math.min(100, documentHeight - (scrollTop + windowHeight)));
            setMarginBottom(marginValue);
        } else {
            setMarginBottom(0);
        }
    }, []);

    useEffect(() => {
        let rafId: number | null = null;
        let timeoutId: NodeJS.Timeout | null = null;

        const throttledUpdate = () => {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                updateMarginBottom();
                rafId = null;
            });
        };

        const debouncedUpdate = () => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(updateMarginBottom, 150);
        };

        updateMarginBottom();

        window.addEventListener('scroll', throttledUpdate, { passive: true });
        window.addEventListener('resize', debouncedUpdate);

        return () => {
            if (rafId) cancelAnimationFrame(rafId);
            if (timeoutId) clearTimeout(timeoutId);
            window.removeEventListener('scroll', throttledUpdate);
            window.removeEventListener('resize', debouncedUpdate);
        };
    }, [updateMarginBottom, pathname])


    useEffect(() => {
        setCookie('footerIsOpen', menuIsOpen ? 1 : 0, { path: '/' });
    }, [menuIsOpen])


    return (
        <footer className="fixed bottom-0 right-0 bg-background/80 hover:bg-background-light z-10 px-4 py-3 m-6 rounded-2xl" style={{ marginBottom: `${marginBottom ? `${marginBottom}px` : ''}` }}>
            <nav className="flex items-center gap-4">

                {!menuIsOpen && (
                    <>
                        <button
                            className="px-3 py-1 text-sm rounded transition-all cursor-pointer"
                            onClick={() => setMenuIsOpen(true)}
                        >
                            ✚
                        </button>
                    </>
                )}

                {menuIsOpen && (
                    <>
                        <button
                            className="px-3 py-1 text-sm rounded transition-all cursor-pointer"
                            onClick={() => setMenuIsOpen(false)}
                        >
                            ›
                        </button>

                        <span className="text-foreground-light-xl">|</span>

                        {links.map((link, index) => (
                            <div key={link.label} className="flex items-center gap-6">
                                <a
                                    href={link.href}
                                    className="text-sm font-body font-normal hover:text-primary transition-colors duration-150 ease-in cursor-pointer"
                                    {...(link.href === '/docs' && {
                                        target: '_blank',
                                        rel: 'noopener noreferrer',
                                    })}
                                >
                                    {link.label}
                                </a>
                            </div>
                        ))}

                        <span className="text-foreground-light-xl">|</span>

                        <a
                            href={`https://x.com/PrismFi_`}
                            className="text-sm font-body font-normal hover:text-primary transition-colors duration-150 ease-in cursor-pointer"
                            target='_blank'
                            rel="noopener noreferrer"
                        >
                            <TwitterLogo />
                        </a>

                        <a
                            href={`#`}
                            className="text-sm font-body font-normal hover:text-primary transition-colors duration-150 ease-in cursor-pointer"
                        >
                            <TelegramLogo />
                        </a>
                    </>
                )}
            </nav>
        </footer>
    );
}

