"use client"

import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import { useCookies } from 'react-cookie';



export type Theme = 'light' | 'dark';


export interface ThemeHook {
    theme: Theme;
    setTheme: Dispatch<SetStateAction<Theme>>;
    toggleTheme: () => void;
}


export function useTheme(): ThemeHook {
    const [cookies, setCookie, removeCookie] = useCookies()

    const [theme, setTheme] = useState<Theme>(cookies['theme'] as Theme ?? 'dark');


    const toggleTheme = useCallback(() => {
        setTheme((prev) => (prev !== 'dark' ? 'dark' : 'light'));
    }, []);


    useEffect(() => {
        const root = document.documentElement;

        if (theme === 'dark') {
            root.classList.add('dark');

        } else {
            root.classList.remove('dark');
        }

        setCookie('theme', theme, { path: '/' })
    }, [theme, setCookie]);


    return useMemo(() => ({
        theme,
        setTheme,
        toggleTheme,
    }), [theme, setTheme, toggleTheme])
}



