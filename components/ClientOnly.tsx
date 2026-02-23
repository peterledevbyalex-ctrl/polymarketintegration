"use client"

import { useEffect, useState } from 'react'


interface ClientOnlyProps {
    children: React.ReactNode
    fallback?: React.ReactNode
}


export const ClientOnly = ({ children, fallback = null }: ClientOnlyProps) => {
    const [hasMounted, setHasMounted] = useState(false)

    useEffect(() => {
        setHasMounted(true)
    }, [])

    if (!hasMounted) {
        return <>{fallback}</>
    }

    return <>{children}</>
}

