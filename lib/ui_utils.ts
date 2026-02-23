
const extractFirstMatch = (text: string, patterns: RegExp[]): string | null => {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) return match[1].trim();
    }
    return null;
};

const normalizeRpcErrorMessage = (message: string): string => {
    const fromShortMessage = extractFirstMatch(message, [
        /reverted with the following reason:\s*(.+)$/i,
        /execution reverted(?::\s*(.+))?$/i,
        /reverted:\s*(.+)$/i,
        /reason:\s*(.+)$/i,
    ]);
    if (fromShortMessage) return fromShortMessage;

    const userRejected = extractFirstMatch(message, [
        /(user rejected.+)$/i,
        /(user denied.+)$/i,
    ]);
    if (userRejected) return 'Transaction rejected';

    if (/insufficient funds/i.test(message)) return 'Insufficient funds';
    if (/nonce too low/i.test(message)) return 'Nonce too low';
    if (/replacement transaction underpriced/i.test(message)) return 'Replacement transaction underpriced';

    return message;
};

export function getErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) return 'Unknown error occurred';

    const maybeShortMessage = (error as unknown as { shortMessage?: unknown }).shortMessage;
    if (typeof maybeShortMessage === 'string' && maybeShortMessage.trim()) {
        return normalizeRpcErrorMessage(maybeShortMessage);
    }

    return normalizeRpcErrorMessage(error.message);
}


export function formatAddress(address: `0x${string}`) {
    if (!address) return '';
    return address.slice(0, 6) + '…' + address.slice(-4);
}


const formatBigIntScaled = (value: bigint, divisor: bigint, suffix: string, decimalPlaces: number): string => {
    const sign = value < 0n ? '-' : '';
    const abs = value < 0n ? -value : value;
    const whole = abs / divisor;
    const remainder = abs % divisor;
    const scale = 10n ** BigInt(decimalPlaces);
    const decimals = divisor === 0n ? 0n : (remainder * scale) / divisor;
    const decimalsStr = decimalPlaces > 0
        ? decimals.toString().padStart(decimalPlaces, '0').replace(/0+$/, '')
        : '';
    const dot = decimalsStr ? '.' : '';
    return `${sign}${whole.toString()}${dot}${decimalsStr}${suffix}`;
};

export function formatNumber(num: number | string | bigint, decimalPlaces: number = 2): string {
    if (typeof num === 'bigint') {
        const abs = num < 0n ? -num : num;
        if (abs >= 1_000_000_000_000n) return formatBigIntScaled(num, 1_000_000_000_000n, 'T', decimalPlaces);
        if (abs >= 1_000_000_000n) return formatBigIntScaled(num, 1_000_000_000n, 'B', decimalPlaces);
        if (abs >= 1_000_000n) return formatBigIntScaled(num, 1_000_000n, 'M', decimalPlaces);
        if (abs >= 1_000n) return formatBigIntScaled(num, 1_000n, 'K', decimalPlaces);
        return formatBigIntScaled(num, 1n, '', decimalPlaces);
    }

    const value = Number(num);
    if (!isFinite(value) || isNaN(value)) return '0';

    const abs = Math.abs(value);
    if (abs === 0) return '0';

    const tinyThreshold = Math.pow(10, -Math.min(Math.max(decimalPlaces, 0), 8));
    if (abs < tinyThreshold) {
        return `<${tinyThreshold.toFixed(Math.min(decimalPlaces, 8)).replace(/\.0+$/, '')}`;
    }

    if (abs >= 1_000) {
        try {
            return new Intl.NumberFormat('en-US', {
                notation: 'compact',
                maximumFractionDigits: decimalPlaces,
            }).format(value);
        } catch {
            return formatValue(value, decimalPlaces);
        }
    }

    return formatValue(value, decimalPlaces);
}


export function formatValue(value: number | string | bigint, precision = 3): string {
    const val = Number(value);

    if (!isFinite(val) || isNaN(val) || val === 0) {
        return '0';
    }

    if (val === Math.round(val)) {
        return val.toString();
    }

    const [integerStr, decimalsStr] = val.toFixed(18).split('.');

    if (!decimalsStr || !/[1-9]/.test(decimalsStr)) {
        return integerStr;
    }

    // Trouver le premier chiffre non-zéro avec regex
    const match = decimalsStr.match(/^(0*)([1-9]\d*)/);

    if (!match) {
        return integerStr;
    }

    const zeroPrefix = match[1];
    const significantDigits = match[2].slice(0, precision).replace(/0+$/, '');

    if (!significantDigits) {
        return integerStr;
    }

    if (val > 1 && zeroPrefix.length > 3) {
        return integerStr;
    }

    if (zeroPrefix.length > 6) {
        return integerStr;
    }

    return `${integerStr}.${zeroPrefix}${significantDigits}`;
}


export function formatUsd(value: number | string | bigint): string {
    const num = typeof value === 'bigint' ? Number(value) : Number(value);
    if (!isFinite(num) || isNaN(num) || num === 0) return '0';

    const abs = Math.abs(num);

    if (abs >= 1_000) {
        try {
            return new Intl.NumberFormat('en-US', {
                notation: 'compact',
                maximumFractionDigits: 2,
            }).format(num);
        } catch {
            return formatNumber(num, 2);
        }
    }

    if (abs >= 1) return formatNumber(num, 2);
    if (abs >= 0.01) return formatNumber(num, 2);
    if (abs >= 0.0001) return formatNumber(num, 4);

    return '<0.0001';
}


export function formatTokenAmount(value: number | string | bigint): string {
    const num = typeof value === 'bigint' ? Number(value) : Number(value);
    if (!isFinite(num) || isNaN(num) || num === 0) return '0';

    const abs = Math.abs(num);

    if (abs >= 1_000) return formatNumber(num, 2);
    if (abs >= 1) return formatNumber(num, 4);
    if (abs >= 0.01) return formatNumber(num, 6);
    if (abs >= 0.000001) return formatNumber(num, 8);

    return formatValue(num, 12);
}


export function isValidAddress(address: `0x${string}`): boolean {
    // Vérifier la longueur totale (0x + 40 caractères hexa)
    if (address.length !== 42) {
        return false;
    }

    // Vérifier le préfixe "0x"
    if (!address.startsWith('0x')) {
        return false;
    }

    // Vérifier que les 40 caractères restants sont bien hexadécimaux
    const hexPart = address.slice(2);
    return /^[0-9a-fA-F]{40}$/.test(hexPart);
}



export function bigIntReplacer(_: string, value: any) {
    if (typeof value === 'bigint') {
        return value.toString() + 'n';
    }

    return value;
}


export function bigIntReviver(key: string, value: any): any {
    if (typeof value === 'string' && /^[-]?\d+n$/.test(value)) {
        return BigInt(value.slice(0, -1));
    }
    return value;
}

