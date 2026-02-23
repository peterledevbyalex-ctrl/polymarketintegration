'use client'

import * as Accordion from '@radix-ui/react-accordion'
import { useEffect, useMemo, useState } from 'react'

export type EndpointAccordionItem = {
    id: string
    title: string
    method: 'GET' | 'POST'
    path: string
    description: string
    requestExample: string
    responseExample: string
}

const CodeBlock = ({ code }: { code: string }) => {
    return (
        <pre className="mt-2 overflow-x-auto rounded-md border border-background-light bg-background/60 p-3 text-xs md:text-sm">
            <code className="font-mono text-foreground whitespace-pre">{code}</code>
        </pre>
    )
}

export function EndpointAccordion({ items }: { items: EndpointAccordionItem[] }) {
    return (
        <Accordion.Root type="multiple" className="grid grid-cols-1 gap-2">
            {items.map((item) => (
                <Accordion.Item
                    key={item.id}
                    value={item.id}
                    className="rounded-lg border border-background-light bg-background-light/30 backdrop-blur-sm"
                >
                    <Accordion.Header className="px-4 py-3">
                        <Accordion.Trigger className="w-full text-left">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-foreground">{item.title}</div>
                                    <div className="mt-1 font-mono text-xs text-foreground break-all">
                                        {item.method} {item.path}
                                    </div>
                                </div>
                                <div className="shrink-0 text-xs text-foreground-light">Expand</div>
                            </div>
                        </Accordion.Trigger>
                    </Accordion.Header>

                    <Accordion.Content className="px-4 pb-4">
                        <div className="text-sm text-foreground-light">{item.description}</div>

                        <div className="mt-4">
                            <div className="text-xs uppercase tracking-wide text-foreground-light">Example request</div>
                            <CodeBlock code={item.requestExample} />
                        </div>

                        <div className="mt-4">
                            <div className="text-xs uppercase tracking-wide text-foreground-light">Example response</div>
                            <CodeBlock code={item.responseExample} />
                        </div>
                    </Accordion.Content>
                </Accordion.Item>
            ))}
        </Accordion.Root>
    )
}

export function ClientOnlyEndpointAccordion({ items }: { items: EndpointAccordionItem[] }) {
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    const hydratedItems = useMemo(() => {
        if (!isMounted) return items
        const origin = window.location.origin

        return items.map((item) => ({
            ...item,
            requestExample: item.requestExample.replaceAll('__BASE_URL__', origin),
            responseExample: item.responseExample.replaceAll('__BASE_URL__', origin),
        }))
    }, [isMounted, items])

    if (!isMounted) return null

    return <EndpointAccordion items={hydratedItems} />
}
