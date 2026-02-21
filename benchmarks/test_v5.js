const { performance } = require('perf_hooks');
const { getPrimesV4 } = require('../index');

// Test TypedArray out-of-bounds behavior
const t = new Uint8Array(5);
t[10] = 99; // Should be ignored
t[-1] = 99; // Should be ignored
if (t[10] === undefined && t[-1] === undefined) {
    console.log("-> TypedArray out-of-bounds is silently ignored. Perfect for branchless inner loop.");
}

function getPrimesV5(limit, segmentSize = 262144) {
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

    const maxP = Math.floor(Math.sqrt(limit));
    const smallPrimes = getPrimesV4(Math.max(maxP, 11), 32768);
    const sniperPrimes = smallPrimes.filter(p => p > 11);

    const finalPrimes = [...BASE_PRIMES];

    // Precalculate sniper arrays to avoid inner multiplication
    const snipersLen = sniperPrimes.length;
    // We use a flat 1D array for all precalculated multiples to keep it fast
    // Actually, arrays of Int32Array are fast enough because V8 loves flat TypedArrays.
    const pBase = new Array(snipersLen);
    for (let i = 0; i < snipersLen; i++) {
        const p = sniperPrimes[i];
        pBase[i] = new Int32Array(baseLen);
        for (let k = 0; k < baseLen; k++) {
            pBase[i][k] = p * baseSurvivors[k]; // pre-impact modulo
        }
    }

    for (let low = 0; low <= limit; low += segmentSize) {
        let high = low + segmentSize - 1;
        if (high > limit) high = limit;

        const S = high - low + 1;
        const isPrimeSeg = new Uint8Array(S);
        isPrimeSeg.fill(1);
        if (low === 0) { isPrimeSeg[0] = 0; isPrimeSeg[1] = 0; }

        for (let i = 0; i < snipersLen; i++) {
            const p = sniperPrimes[i];
            const pBase_i = pBase[i];

            const minSurvivor = Math.max(Math.ceil(low / p), p);
            const maxSurvivor = Math.floor(high / p);
            if (minSurvivor > maxSurvivor) continue;

            // To ensure we completely cover the required bounds and rely on branchless OOB writes:
            // We expand the cycle range slightly to cover maxSurvivor and minSurvivor without if-checks inside
            const startCycle = Math.floor(minSurvivor / baseWidth) * baseWidth;
            const endCycle = Math.floor(maxSurvivor / baseWidth) * baseWidth;

            for (let cycle = startCycle; cycle <= endCycle; cycle += baseWidth) {
                const offset = (p * cycle) - low;
                // THIS IS THE CŒUR DU MOTEUR (BRANCHLESS)
                for (let k = 0; k < baseLen; k++) {
                    isPrimeSeg[offset + pBase_i[k]] = 0;
                }
            }
        }

        // --- RESTORE BUG FIX ---
        // Since we removed 'survivor >= minSurvivor', we also processed survivor = 1 for the snipers themselves!
        // This incorrectly marked 'p * 1 = p' as composite (0) if p fell within the current segment.
        // We simply restore all sniper primes that belong to this segment to 1 !
        for (let i = 0; i < snipersLen; i++) {
            const p = sniperPrimes[i];
            if (p >= low && p <= high) {
                isPrimeSeg[p - low] = 1;
            }
        }
        // ------------------------

        const startCycleSeg = Math.floor(low / baseWidth) * baseWidth;
        const endCycleSeg = Math.floor(high / baseWidth) * baseWidth;

        for (let cycle = startCycleSeg; cycle <= endCycleSeg; cycle += baseWidth) {
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

    // Since we used out-of-bounds writes to simplify bounds checking, 
    // `c <= limit` is naturally enforced by the loops except potentially the very last candidate.
    // We filter just in case out-of-bounds generated an edge case at the very end
    let validCount = 0;
    while (validCount < finalPrimes.length && finalPrimes[validCount] <= limit) {
        validCount++;
    }
    finalPrimes.length = validCount; // Truncate cleanly

    return finalPrimes;
}

// Verification against V4
console.log("Verification Limit 1,000,000...");
const v4 = getPrimesV4(1000000);
const v5 = getPrimesV5(1000000);
console.log(`V4 Length: ${v4.length}, V5 Length: ${v5.length}`);
if (v4.length !== v5.length || v4[v4.length - 1] !== v5[v5.length - 1]) {
    console.log("❌ ERROR! V5 logic is flawed.");
    process.exit(1);
}

console.log("\nBenchmarking...");
global.gc();
const t1 = performance.now();
const res4 = getPrimesV4(100000000);
const t2 = performance.now();

global.gc();
const t3 = performance.now();
// 262144 fits in 256KB L2 cache
const res5 = getPrimesV5(100000000, 262144);
const t4 = performance.now();

global.gc();
const t5 = performance.now();
// 32768 fits in 32KB L1 cache
const res5L1 = getPrimesV5(100000000, 32768);
const t6 = performance.now();

console.log(`V4 (2MB Segment)  : ${(t2 - t1).toFixed(2)} ms`);
console.log(`V5 (256KB Segment): ${(t4 - t3).toFixed(2)} ms (Branchless)`);
console.log(`V5 (32KB Segment) : ${(t6 - t5).toFixed(2)} ms (Branchless)`);
