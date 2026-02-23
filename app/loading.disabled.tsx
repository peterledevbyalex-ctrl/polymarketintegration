"use client";

import { useEffect, useState } from "react";


const quotes = [
    //"Loading page...",
    "Swapping tokens at light speed...",
    "Connecting to liquidity pools...",
    "Calculating best routes...",
    "Optimizing your trade...",
    "Fetching prices from the blockchain...",
    "Preparing your swap...",
    "Finding the deepest liquidity...",
    "Crunching the numbers...",
    "Querying smart contracts...",
    "Almost there, validating rates...",
    "Summoning liquidity providers...",
    "Convincing the AMM...",
    "Bribing the slippage gods...",
    "Teaching robots to trade...",
];


export default function Loading() {
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        setMessage(randomQuote);
    }, []);

    // Ne rien afficher en SSR
    if (!message) return null;

    return (
        <>{message}</>
    );
}

