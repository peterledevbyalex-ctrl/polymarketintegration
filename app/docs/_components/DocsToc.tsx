'use client'

import { useEffect, useMemo, useState } from 'react'

type TocItem = {
    id: string
    label: string
    level: 2 | 3
}

const getHeadingLabel = (el: HTMLElement): string => {
    const label = el.getAttribute('data-toc-label')
    if (label) return label

    return el.textContent?.trim() ?? ''
}

export function DocsToc() {
    const [items, setItems] = useState<TocItem[]>([])

    useEffect(() => {
        const root = document.getElementById('docs-content')
        if (!root) return

        const headings = Array.from(root.querySelectorAll<HTMLElement>('h2[id], h3[id]'))

        const nextItems = headings
            .map((el) => {
                const tagName = el.tagName.toLowerCase()
                const level = tagName === 'h2' ? 2 : 3
                const id = el.id
                const label = getHeadingLabel(el)

                if (!id || !label) return null

                return { id, label, level } as TocItem
            })
            .filter((x): x is TocItem => x !== null)

        setItems(nextItems)
    }, [])

    const hasItems = items.length > 0

    const content = useMemo(() => {
        if (!hasItems) {
            return <div className="mt-3 text-sm text-foreground-light">No sections on this page.</div>
        }

        return (
            <div className="mt-3 grid grid-cols-1 gap-1">
                {items.map((item) => (
                    <a
                        key={item.id}
                        href={`#${item.id}`}
                        className={
                            item.level === 2
                                ? 'rounded-md px-2 py-1 text-sm text-foreground-light hover:text-foreground hover:bg-background/40'
                                : 'rounded-md px-2 py-1 pl-5 text-sm text-foreground-light hover:text-foreground hover:bg-background/40'
                        }
                    >
                        {item.label}
                    </a>
                ))}
            </div>
        )
    }, [hasItems, items])

    return (
        <div className="sticky top-[90px] rounded-lg border border-background-light bg-background-light/30 backdrop-blur-sm p-4">
            <div className="text-sm font-semibold text-foreground">On this page</div>
            {content}
        </div>
    )
}
