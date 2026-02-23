import type { ReactNode } from 'react'

import { DocsSidebar } from './_components/DocsSidebar'
import { DocsToc } from './_components/DocsToc'


// TODO: add metadata ?

export default function DocsLayout({ children }: { children: ReactNode }) {
    return (
        <div className="max-w-7xl mx-auto w-full px-4 pt-8 pb-20">
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_260px] gap-6">
                <aside className="hidden lg:block">
                    <DocsSidebar />
                </aside>

                <main id="docs-content" className="min-w-0">{children}</main>

                <aside className="hidden lg:block">
                    <DocsToc />
                </aside>
            </div>
        </div>
    )
}
