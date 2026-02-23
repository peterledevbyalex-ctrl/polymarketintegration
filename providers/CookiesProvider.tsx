"use client"

import { ReactNode } from "react";
import { CookiesProvider as ReactCookiesProvider } from 'react-cookie';


interface CookiesProviderProps {
    children: ReactNode
}


export const CookiesProvider = ({ children }: CookiesProviderProps) => {
    return (
        <ReactCookiesProvider>
            {children}
        </ReactCookiesProvider>
    );
}


