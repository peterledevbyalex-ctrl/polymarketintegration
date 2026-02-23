export type DocsNavItem = {
    href: string
    label: string
}

export type DocsNavSection = {
    title: string
    items: DocsNavItem[]
}

export const docsNav: DocsNavSection[] = [
    {
        title: 'Getting started',
        items: [
            { href: '/docs/overview', label: 'Overview' },
            { href: '/docs/api', label: 'HTTP API' },
            { href: '/docs/onchain', label: 'On-chain integration' },
            { href: '/docs/liquidity', label: 'Liquidity (LP)' },
        ],
    },
]

export const docsNavFlat: DocsNavItem[] = docsNav.flatMap((section) => section.items)
