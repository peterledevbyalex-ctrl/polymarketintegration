
import { bigIntReplacer, bigIntReviver } from "@/lib/ui_utils";


type CachedResult<T> = {
    data: T;
    timestamp: number;
}

type UseCacheCallback<T> = (...args: any[]) => Promise<T>;


const cachePrefix = '_cache_';

const memoryCache: Map<string, CachedResult<any>> = new Map;


export async function useMemoryCache<T>(cacheName: string, callback: UseCacheCallback<T>, args: any[], cacheDuration?: number, debug=false): Promise<T> {
    const cacheKey = getCacheKey(cacheName, args);

    const hasCache = memoryCache.has(cacheKey)

    if (hasCache) {
        // return the cached content (if valid)

        if (debug) console.log('READ FROM CACHE', cacheName)

        const cachedResult = memoryCache.get(cacheKey);

        if (cachedResult && isValidCache(cachedResult, cacheDuration)) {
            // return the cached content
            return cachedResult.data;
        }

        // Cache too old => delete it
        memoryCache.delete(cacheKey);
    }

    // read/compute non-cached value
    const result: T = await callback(...args);

    // write cache for ${dependencies}

    const cachedResult: CachedResult<T> = {
        data: result,
        timestamp: Date.now(),
    };

    memoryCache.set(cacheKey, cachedResult)

    if (debug) console.log('WRITING CACHE', cacheName)

    return result;
}


export async function useLocalStorageCache<T>(cacheName: string, callback: UseCacheCallback<T>, args: any[], cacheDuration?: number, debug=false): Promise<T> {
    const cacheKey = getCacheKey(cacheName, args);

    const cacheContent = localStorage.getItem(cacheKey);

    if (cacheContent !== null) {
        // return the cached content (if valid)

        if (debug) console.log('READ FROM CACHE', cacheName)

        if (cacheContent) {
            const cachedResult = JSON.parse(cacheContent, bigIntReviver) as CachedResult<T>;

            if (isValidCache(cachedResult, cacheDuration)) {
                // return the cached content
                return cachedResult.data;
            }

            // Cache too old => delete it
            localStorage.removeItem(cacheKey);
        }
    }

    // read/compute non-cached value
    const result: T = await callback(...args);

    // write cache for ${dependencies}

    const cachedResult: CachedResult<T> = {
        data: result,
        timestamp: Date.now(),
    };

    localStorage.setItem(cacheKey, JSON.stringify(cachedResult, bigIntReplacer))

    if (debug) console.log('WRITING CACHE', cacheName)

    return result;
}


export async function useSessionStorageCache<T>(cacheName: string, callback: UseCacheCallback<T>, args: any[], cacheDuration?: number, debug=false): Promise<T> {
    const cacheKey = getCacheKey(cacheName, args);

    const cacheContent = sessionStorage.getItem(cacheKey);

    if (cacheContent !== null) {
        // return the cached content (if valid)

        if (debug) console.log('READ FROM CACHE', cacheName)

        const cachedResult = JSON.parse(cacheContent, bigIntReviver) as CachedResult<T>;

        if (isValidCache(cachedResult, cacheDuration)) {
            // return the cached content
            return cachedResult.data;
        }

        // Cache too old => delete it
        sessionStorage.removeItem(cacheKey)
    }

    // read/compute non-cached value
    const result: T = await callback(...args);

    // write cache for ${dependencies}

    const cachedResult: CachedResult<T> = {
        data: result,
        timestamp: Date.now(),
    };

    sessionStorage.setItem(cacheKey, JSON.stringify(cachedResult, bigIntReplacer))

    if (debug) console.log('WRITING CACHE', cacheName)

    return result;
}



export function getCacheKey(cacheName: string, args: any[]): string {
    const argsStrings = [cacheName, ...args].map(p =>
        (typeof p === 'object')
            ? JSON.stringify(p, bigIntReplacer)
            : String(p)
    );

    const cacheKey = cachePrefix + cacheName + '_' + hashStringToInt(argsStrings.join(' -|- ')).toString();

    return cacheKey;
}


export function isValidCache<T>(cachedResult: CachedResult<T>, cacheDuration?: number): boolean {
    const fileAge = Date.now() - cachedResult.timestamp;

    // Si le fichier est plus vieux que la durée de cache spécifiée
    if (cacheDuration && fileAge > cacheDuration) {
        return false;
    }

    return true;
}


function hashStringToInt(str: string): number {
    let hash = 0;
    for (const char of str) {
        hash = (hash << 5) - hash + char.charCodeAt(0);
        hash |= 0; // Constrain to 32bit integer
    }
    return hash;
}



