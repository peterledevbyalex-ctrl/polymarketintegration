"use client"

import Link from 'next/link';

import { PrismLogoSmall } from "./icons/PrismLogo";


export const FooterLarge: React.FC = () => {
    return (
        <footer id="footer-large" className="mt-10 flex w-full bg-zinc-50 dark:bg-zinc-950 text-foreground justify-center items-center rounded-md px-10 py-5">
            <div className="w-full flex justify-between gap-5">
                <div>
                    <Link href="/">
                        <PrismLogoSmall />
                    </Link>
                </div>
                <div>
                    © {(new Date).getFullYear()}
                </div>
                <div className="ms-auto">
                    <a
                            href={`#`}
                            className="text-sm font-body font-normal hover:text-primary transition-colors duration-150 ease-in cursor-pointer"
                        >
                        Privacy<span className="hidden md:block"> Policy</span>
                    </a>
                </div>
                <div>
                    <a
                            href={`#`}
                            className="text-sm font-body font-normal hover:text-primary transition-colors duration-150 ease-in cursor-pointer"
                        >
                        Terms<span className="hidden md:block"> of Use</span>
                    </a>
                </div>
            </div>
        </footer>
    );
}

