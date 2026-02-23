import fs from 'fs';
import os from 'os';
import path from 'path';


const cacheDir = path.join(os.tmpdir(), 'prism-cache');


export async function useCache<T>(cacheName: string, callback: (...args: any[]) => Promise<T>, args: any[], cacheDuration?: number): Promise<T> {
    const cacheFile = getCacheFile(cacheName, args);

    // vérifier si une version en cache existe pour ${dependencies}
    if (hasCache(cacheName, args, cacheDuration)) {
        // retourne le cache content

        //console.log('READ FROM CACHE')
        const cacheContent = fs.readFileSync(cacheFile).toString();
        const result = JSON.parse(cacheContent) as T;
        return result;
    }

    const result: T = await callback(...args);

    // write cache pour ${dependencies}

    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir);
    }

    fs.writeFileSync(cacheFile, JSON.stringify(result));
    //console.log('WRITING CACHE')

    return result;
}



export function getCacheKey(cacheName: string, args: any[]): number {
    const argsStrings = [cacheName, ...args].map(p => {
        return typeof p === 'object' ? JSON.stringify(p) : String(p);
    });

    const cacheKey = hashStringToInt(argsStrings.join(' -|- '));

    return cacheKey;
}


export function getCacheFile(cacheName: string, args: any[]): string {
    const cacheNameNormalized = slugify(cacheName);

    const cacheKey = getCacheKey(cacheNameNormalized, args);
    const cacheFile = `${cacheDir}/${cacheNameNormalized}_${cacheKey}.cache`;
    return cacheFile;
}


export function hasCache(cacheName: string, args: any[], cacheDuration?: number): boolean {
    const cacheFile = getCacheFile(cacheName, args);

    let hasValidCache = fs.existsSync(cacheFile);

    if (hasValidCache) {
        try {
            const stats = fs.statSync(cacheFile);
            const now = new Date().getTime();
            const fileAge = now - stats.mtime.getTime();

            // Si le fichier est plus vieux que la durée de cache spécifiée
            if (fileAge > cacheDuration) {
                hasValidCache = false;
                // Optionnel : supprimer le fichier de cache expiré
                //fs.unlinkSync(cacheFile);
            }

        } catch (error) {
            // En cas d'erreur de lecture du fichier, on considère que le cache n'est pas valide
            //console.warn(`Erreur lors de la vérification du cache ${cacheFile}:`, error);
            hasValidCache = false;
        }
    }

    return hasValidCache;
}


function hashStringToInt(str: string): number {
    let hash = 0;
    for (const char of str) {
        hash = (hash << 5) - hash + char.charCodeAt(0);
        hash |= 0; // Constrain to 32bit integer
    }
    return hash;
}


function slugify(str: string) {
    str = str.replace(/^\s+|\s+$/g, ''); // trim
    str = str.toLowerCase();

    // remove accents, swap ñ for n, etc
    var from = "àáäâèéëêìíïîòóöôùúüûñç·/_,:;";
    var to = "aaaaeeeeiiiioooouuuunc------";
    for (var i = 0, l = from.length; i < l; i++) {
        str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i));
    }

    str = str.replace(/[^a-z0-9 -]/g, '') // remove invalid chars
        .replace(/\s+/g, '-') // collapse whitespace and replace by -
        .replace(/-+/g, '-'); // collapse dashes

    return str;
}
