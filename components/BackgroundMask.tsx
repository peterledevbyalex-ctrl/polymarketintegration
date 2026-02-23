"use client";

import { useApp } from '@/providers/AppProvider';



export function BackgroundMask() {
    const { themeHook } = useApp();
    const { theme } = themeHook;

    const fill = theme === 'dark' ? '#18181B' : '#FFFFFF';
    const fillOpacity = theme === 'dark' ? '0.995' : '0.995';

    return (
        <div>
            <svg 
                className="fixed inset-0 w-full h-full pointer-events-none"
                width={"100%"}
                viewBox="0 0 1728 1117" 
                preserveAspectRatio="xMidYMid slice"
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
            >
                <g filter="url(#filter0_f_276_1262)">
                    <path 
                        d="M-595.5 -877.381L2322 -1064V-258L1182.5 1089.5L863.25 1149.5L544 1089.5L-595.5 -258V-877.381Z" 
                        fill={fill}
                        fillOpacity={fillOpacity}
                    />
                </g>
                <defs>
                    <filter 
                        id="filter0_f_276_1262" 
                        x="-815.5" 
                        y="-1284" 
                        width="3357.5" 
                        height="2653.5" 
                        filterUnits="userSpaceOnUse" 
                        colorInterpolationFilters="sRGB"
                    >
                        <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                        <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                        <feGaussianBlur stdDeviation="110" result="effect1_foregroundBlur_276_1262"/>
                    </filter>
                </defs>
            </svg>
        </div>
    );
}


