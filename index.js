/**
 * prime-sniper
 * Un générateur ultra-rapide de nombres premiers basé sur la factorisation
 * géométrique par roue (Wheel Factorization) et le Tir Absolu.Optimisation JS, pas d'inverse modulaire.
 */

const BASE_PRIMES_V2 = [2, 3, 5, 7]; // P=7 (Optimisé pour V2)
const BASE_PRIMES_V3 = [2, 3, 5, 7, 11]; // P=11 (Largeur 2310, optimisé pour V3)

/**
 * MOTEUR V2 : Le Dragster
 * Extrêmement rapide mais gourmand en RAM. Idéal pour limit < 10 000 000.
 */
function getPrimesV2(limit) {
    if (limit < 2) return [];

    const candidates = [];
    for (let i = 1; i <= limit; i++) {
        let isSurvivor = true;
        for (let p of BASE_PRIMES_V2) {
            if (i % p === 0) { isSurvivor = false; break; }
        }
        if (isSurvivor) candidates.push(i);
    }

    const isPrime = new Uint8Array(limit + 1);
    const len = candidates.length;
    for (let i = 0; i < len; i++) {
        isPrime[candidates[i]] = 1;
    }

    const maxP = Math.floor(Math.sqrt(limit));
    for (let i = 0; i < len; i++) {
        const p = candidates[i];
        if (p === 1) continue;
        if (p > maxP) break;

        if (isPrime[p]) {
            for (let j = i; j < len; j++) {
                const impact = p * candidates[j];
                if (impact > limit) break;
                isPrime[impact] = 0;
            }
        }
    }

    const finalPrimes = [...BASE_PRIMES_V2];
    for (let i = 0; i < len; i++) {
        const c = candidates[i];
        if (c > 1 && isPrime[c]) finalPrimes.push(c);
    }

    return finalPrimes.filter(x => x <= limit);
}

/**
 * MOTEUR V3 : Le Char d'Assaut (Production)
 * Utilise le "Wheel Unrolling". Parfait pour les grandes limites.
 */
function getPrimesV3(limit) {
    if (limit < 2) return [];

    const baseWidth = 2310;
    const baseSurvivors = [];
    for (let i = 1; i <= baseWidth; i++) {
        let isSurvivor = true;
        for (let p of BASE_PRIMES_V3) {
            if (i % p === 0) { isSurvivor = false; break; }
        }
        if (isSurvivor) baseSurvivors.push(i);
    }

    const candidates = [];
    const baseLen = baseSurvivors.length;
    for (let cycle = 0; cycle <= limit; cycle += baseWidth) {
        for (let i = 0; i < baseLen; i++) {
            const c = cycle + baseSurvivors[i];
            if (c <= limit) candidates.push(c);
        }
    }

    const isPrime = new Uint8Array(limit + 1);
    const totalCandidates = candidates.length;
    for (let i = 0; i < totalCandidates; i++) {
        isPrime[candidates[i]] = 1;
    }

    const maxP = Math.floor(Math.sqrt(limit));
    for (let i = 0; i < totalCandidates; i++) {
        const p = candidates[i];
        if (p === 1) continue;
        if (p > maxP) break;

        if (isPrime[p]) {
            for (let j = i; j < totalCandidates; j++) {
                const impact = p * candidates[j];
                if (impact > limit) break;
                isPrime[impact] = 0;
            }
        }
    }

    const finalPrimes = [...BASE_PRIMES_V3];
    for (let i = 0; i < totalCandidates; i++) {
        const c = candidates[i];
        if (c > 1 && isPrime[c]) finalPrimes.push(c);
    }

    return finalPrimes.filter(x => x <= limit);
}

/**
 * MOTEUR V4 : L'Artillerie Lourde Segmentée
 * Permet de chercher sur des milliards de nombres sans exploser la RAM,
 * tout en utilisant le "Tir Direct" (impact = p * candidat).
 * L'empreinte RAM est bornée à la taille du segment.
 */
function getPrimesV4(limit, segmentSize = 2000000) {
    if (limit < 2) return [];

    const BASE_PRIMES = [2, 3, 5, 7, 11];
    const baseWidth = 2310;
    const baseSurvivors = [];
    for (let i = 1; i <= baseWidth; i++) {
        let isSurvivor = true;
        for (let p of BASE_PRIMES) {
            if (i % p === 0) { isSurvivor = false; break; }
        }
        if (isSurvivor) baseSurvivors.push(i);
    }
    const baseLen = baseSurvivors.length;

    // Calcul des snipers de base (petits premiers)
    const maxP = Math.floor(Math.sqrt(limit));
    const smallPrimes = getPrimesV3(Math.max(maxP, 11)); // On garantit jusqu'à 11 minimum
    const sniperPrimes = smallPrimes.filter(p => p > 11);

    const finalPrimes = [...BASE_PRIMES];

    const wheel_gaps = new Int32Array(baseLen);
    for (let i = 0; i < baseLen - 1; i++) wheel_gaps[i] = baseSurvivors[i + 1] - baseSurvivors[i];
    wheel_gaps[baseLen - 1] = baseWidth + baseSurvivors[0] - baseSurvivors[baseLen - 1];

    // Traitement Segments par Segments
    for (let low = 0; low <= limit; low += segmentSize) {
        let high = low + segmentSize - 1;
        if (high > limit) high = limit;

        const S = high - low + 1;
        const isPrimeSeg = new Uint8Array(S);
        isPrimeSeg.fill(1); // 1 = potentiel premier

        if (low === 0) {
            isPrimeSeg[0] = 0;
            isPrimeSeg[1] = 0;
        }

        // Le Tir Direct : segmenté
        const snipersLen = sniperPrimes.length;
        for (let i = 0; i < snipersLen; i++) {
            const p = sniperPrimes[i];

            // Calculer l'intervalle des "survivants" (candidats) nécessaires pour atteindre [low, high]
            const minSurvivor = Math.max(Math.ceil(low / p), p);
            const maxSurvivor = Math.floor(high / p);

            if (minSurvivor > maxSurvivor) continue;

            const minCycle = Math.floor(minSurvivor / baseWidth) * baseWidth;
            const rem = minSurvivor - minCycle;

            let w = 0;
            while (w < baseLen && baseSurvivors[w] < rem) w++;

            let first_survivor;
            if (w === baseLen) {
                first_survivor = minCycle + baseWidth + baseSurvivors[0];
                w = 0;
            } else {
                first_survivor = minCycle + baseSurvivors[w];
            }

            let currentImpact = first_survivor * p - low;
            const endImpact = high - low;
            while (currentImpact <= endImpact) {
                isPrimeSeg[currentImpact] = 0; // Bim! Tir dans la fenêtre
                currentImpact += p * wheel_gaps[w];
                w++;
                if (w === baseLen) w = 0;
            }
        }

        // Récolte
        const startCycleSeg = Math.floor(low / baseWidth) * baseWidth;
        for (let cycle = startCycleSeg; cycle <= high; cycle += baseWidth) {
            for (let k = 0; k < baseLen; k++) {
                const c = cycle + baseSurvivors[k];
                if (c >= low && c <= high) {
                    if (c > 11 && isPrimeSeg[c - low]) {
                        finalPrimes.push(c);
                    }
                }
            }
        }
    }

    return finalPrimes.filter(x => x <= limit);
}

/**
 * MOTEUR V4 (Direct Hit) : L'Artillerie Lourde Originale
 * C'est l'implémentation algorithmique "pure" du Sniper. 
 * Au lieu de parcourir les écarts de proche en proche (wheel gaps), 
 * ce moteur calcule mathématiquement chaque cible (p * survivor) pour tirer dessus.
 * Ce concept est plus élégant et demande moins d'instructions de préparation, 
 * mais les processeurs modernes l'exécutent environ 15% plus lentement 
 * qu'un parcours par addition continue (V4 standard).
 * Conservé pour sa valeur académique et la pureté du concept originel.
 */
function getPrimesV4_Direct(limit, segmentSize = 2000000) {
    if (limit < 2) return [];

    const BASE_PRIMES = [2, 3, 5, 7, 11];
    const baseWidth = 2310;
    const baseSurvivors = [];
    for (let i = 1; i <= baseWidth; i++) {
        let isSurvivor = true;
        for (let p of BASE_PRIMES) {
            if (i % p === 0) { isSurvivor = false; break; }
        }
        if (isSurvivor) baseSurvivors.push(i);
    }
    const baseLen = baseSurvivors.length;

    // Calcul des snipers de base (petits premiers)
    const maxP = Math.floor(Math.sqrt(limit));
    const smallPrimes = getPrimesV3(Math.max(maxP, 11)); // On garantit jusqu'à 11 minimum
    const sniperPrimes = smallPrimes.filter(p => p > 11);

    const finalPrimes = [...BASE_PRIMES];

    // Traitement Segments par Segments
    for (let low = 0; low <= limit; low += segmentSize) {
        let high = low + segmentSize - 1;
        if (high > limit) high = limit;

        const S = high - low + 1;
        const isPrimeSeg = new Uint8Array(S);
        isPrimeSeg.fill(1); // 1 = potentiel premier

        if (low === 0) {
            isPrimeSeg[0] = 0;
            isPrimeSeg[1] = 0;
        }

        // Le Tir Direct : segmenté
        const snipersLen = sniperPrimes.length;
        for (let i = 0; i < snipersLen; i++) {
            const p = sniperPrimes[i];

            // Calculer l'intervalle des "survivants" (candidats) nécessaires pour atteindre [low, high]
            const minSurvivor = Math.max(Math.ceil(low / p), p);
            const maxSurvivor = Math.floor(high / p);

            if (minSurvivor > maxSurvivor) continue;

            // Aligner sur un multiple de la roue
            const startCycle = Math.floor(minSurvivor / baseWidth) * baseWidth;

            // Régénération cyclique des candidats "à la volée" (Économie massive de RAM)
            for (let cycle = startCycle; cycle <= maxSurvivor; cycle += baseWidth) {
                for (let k = 0; k < baseLen; k++) {
                    const survivor = cycle + baseSurvivors[k];
                    if (survivor >= minSurvivor && survivor <= maxSurvivor) {
                        const impact = p * survivor;
                        isPrimeSeg[impact - low] = 0; // Bim! Tir dans la fenêtre
                    }
                }
            }
        }

        // Récolte
        const startCycleSeg = Math.floor(low / baseWidth) * baseWidth;
        for (let cycle = startCycleSeg; cycle <= high; cycle += baseWidth) {
            for (let k = 0; k < baseLen; k++) {
                const c = cycle + baseSurvivors[k];
                if (c >= low && c <= high) {
                    if (c > 11 && isPrimeSeg[c - low]) {
                        finalPrimes.push(c);
                    }
                }
            }
        }
    }

    return finalPrimes.filter(x => x <= limit);
}

function getPrimes(limit) {
    if (limit <= 10000000) return getPrimesV2(limit);
    // V3 reste très véloce sur de la RAM disponible en dessous de 50 Millions
    if (limit <= 50000000) return getPrimesV3(limit);
    return getPrimesV4(limit);
}

function getPrimesRange(min, max) {
    if (min > max) return [];
    const primes = getPrimes(max);

    let left = 0, right = primes.length - 1, startIndex = primes.length;
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (primes[mid] >= min) {
            startIndex = mid;
            right = mid - 1;
        } else {
            left = mid + 1;
        }
    }
    return primes.slice(startIndex);
}

/**
 * TEST RAPIDE (Nombres standards JS < 9e15)
 * Utilise la Factorisation par Roue P=5 (Largeur 30).
 * Parfait pour des tests unitaires ultra-rapides sans charger de lourdes tables.
 */
function isPrime(n) {
    if (n < 2) return false;
    if (n % 2 === 0) return n === 2;
    if (n % 3 === 0) return n === 3;
    if (n % 5 === 0) return n === 5;

    const gaps = [4, 2, 4, 2, 4, 6, 2, 6];
    let p = 7;
    let g = 0;

    while (p * p <= n) {
        if (n % p === 0) return false;
        p += gaps[g];
        g = (g + 1) % 8;
    }
    return true;
}

/**
 * =========================================================================
 * TEST POUR LES VRAIS GRANDS NOMBRES (Cryptographie / BigInt)
 * =========================================================================
 * Algorithme de Miller-Rabin. Ne divise pas. Il utilise l'exponentiation
 * modulaire pour vérifier les propriétés structurelles du nombre.
 * @param {bigint|number|string} n - Le très grand nombre à tester
 * @returns {boolean} Vrai si le nombre est (très probablement) premier
 */
function isBigPrime(n) {
    // Conversion sécurisée en BigInt
    let bn;
    try { bn = BigInt(n); } catch (e) { return false; }

    if (bn <= 1n) return false;
    if (bn <= 3n) return true;
    if (bn % 2n === 0n || bn % 3n === 0n || bn % 5n === 0n) return false;

    // Écrire n - 1 sous la forme d * 2^r
    let d = bn - 1n;
    let r = 0n;
    while (d % 2n === 0n) {
        d /= 2n;
        r += 1n;
    }

    // Exponentiation modulaire rapide : (base^exp) % mod
    const modPow = (base, exp, mod) => {
        let res = 1n;
        base = base % mod;
        while (exp > 0n) {
            if (exp % 2n === 1n) res = (res * base) % mod;
            exp /= 2n;
            base = (base * base) % mod;
        }
        return res;
    };

    // Bases de test déterministes.
    // Tester ces bases garantit la primalité absolue jusqu'à 3.3 × 10^24.
    // Au-delà, c'est une preuve "probabiliste" à 99.99999...%
    const bases = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];

    for (let i = 0; i < bases.length; i++) {
        let a = bases[i];
        if (a >= bn) break; // Si le nombre est plus petit que la base

        let x = modPow(a, d, bn);
        if (x === 1n || x === bn - 1n) continue;

        let isComposite = true;
        for (let j = 1n; j < r; j++) {
            x = modPow(x, 2n, bn);
            if (x === bn - 1n) {
                isComposite = false;
                break;
            }
        }
        if (isComposite) return false;
    }

    return true;
}

const { getPrimesMulti } = require('./multi');

module.exports = {
    getPrimes,
    getPrimesRange,
    isPrime,
    isBigPrime, // <-- Le testeur pour cryptographie
    getPrimesV2,
    getPrimesV3,
    getPrimesV4,
    getPrimesV4_Direct, // L'implémentation originale "Sniper"
    getPrimesMulti
};