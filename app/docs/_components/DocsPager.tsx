'use client'

import { usePathname } from 'next/navigation'

import { docsNavFlat } from './docsNav'

export function DocsPager() {
    const pathname = usePathname()

    const index = docsNavFlat.findIndex((x) => x.href === pathname)

    const prev = index > 0 ? docsNavFlat[index - 1] : null
    const next = index >= 0 && index < docsNavFlat.length - 1 ? docsNavFlat[index + 1] : null

    if (!prev && !next) return null

    return (
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
                {prev ? (
                    <a
                        href={prev.href}
                        className="block rounded-lg border border-background-light bg-background-light/30 backdrop-blur-sm px-4 py-3 hover:bg-background/40"
                    >
                        <div className="text-xs uppercase tracking-wide text-foreground-light">Previous</div>
                        <div className="mt-1 text-sm font-semibold text-foreground">{prev.label}</div>
                    </a>
                ) : null}
            </div>
            <div className="sm:text-right">
                {next ? (
                    <a
                        href={next.href}
                        className="block rounded-lg border border-background-light bg-background-light/30 backdrop-blur-sm px-4 py-3 hover:bg-background/40"
                    >
                        <div className="text-xs uppercase tracking-wide text-foreground-light">Next</div>
                        <div className="mt-1 text-sm font-semibold text-foreground">{next.label}</div>
                    </a>
                ) : null}
            </div>
        </div>
    )
}
