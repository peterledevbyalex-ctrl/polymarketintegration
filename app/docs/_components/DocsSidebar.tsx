'use client'

import { usePathname } from 'next/navigation'

import { docsNav } from './docsNav'

export function DocsSidebar() {
    const pathname = usePathname()

    return (
        <div className="sticky top-[90px] rounded-lg border border-background-light bg-background-light/30 backdrop-blur-sm p-4">
            <div className="text-sm font-semibold text-foreground">Docs</div>
            <div className="mt-4 grid grid-cols-1 gap-4">
                {docsNav.map((section) => (
                    <div key={section.title}>
                        <div className="text-xs uppercase tracking-wide text-foreground-light">{section.title}</div>
                        <div className="mt-2 grid grid-cols-1 gap-1">
                            {section.items.map((item) => {
                                const isActive = pathname === item.href

                                return (
                                    <a
                                        key={item.href}
                                        href={item.href}
                                        aria-current={isActive ? 'page' : undefined}
                                        className={
                                            isActive
                                                ? 'rounded-md px-2 py-1 text-sm bg-background/60 text-foreground'
                                                : 'rounded-md px-2 py-1 text-sm text-foreground-light hover:text-foreground hover:bg-background/40'
                                        }
                                    >
                                        {item.label}
                                    </a>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
