const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const { getPrimesV3, getPrimesV4 } = require('./index');

if (isMainThread) {
    /**
     * MOTEUR V6 (Multi) : L'Armée de Snipers (Multithreading)
     * Découpe la recherche totale en parts égales pour chaque coeur du processeur.
     * Le maître calcule les Snipers initiaux, distribue les fenêtres de tir aux Workers,
     * puis fusionne le résultat en un seul Uint32Array ultra-optimisé en RAM.
     *
     * @param {number} limit La limite supérieure
     * @param {number} numThreads Le nombre de coeurs (par défaut tous les CPUs)
     * @returns {Promise<Uint32Array>} Résumé binaire ultra-rapide des nombres
     */
    async function getPrimesMulti(limit, numThreads = os.cpus().length) {
        if (limit < 2) return new Uint32Array(0);

        // Fallback rapide pour les petites limites en monothread
        if (limit <= 10000000) {
            const arr = getPrimesV3(limit);
            return new Uint32Array(arr);
        }

        // --- PHASE 1 : LE GENERAL (Master Thread) ---
        // Le général compile la liste des Snipers nécessaires (jusqu'à sqrt(limit))
        const maxP = Math.floor(Math.sqrt(limit));
        const smallLimit = Math.max(maxP, 11);

        // V4 est rapide pour générer les petits snipers
        const smallPrimes = getPrimesV4(smallLimit, 65536);
        const snipers = smallPrimes.filter(p => p > 11);

        const searchLow = smallLimit + 1;
        const searchHigh = limit;

        if (searchLow > searchHigh) {
            return new Uint32Array(smallPrimes.filter(p => p <= limit));
        }

        const searchRange = searchHigh - searchLow + 1;
        // Si la plage est trop petite, un seul thread suffit
        const cpus = Math.min(numThreads, searchRange < 1000000 ? 1 : numThreads);

        const chunkSize = Math.ceil(searchRange / cpus);
        const promises = [];

        // Déploiement des troupes (Workers)
        for (let i = 0; i < cpus; i++) {
            const cLow = searchLow + i * chunkSize;
            let cHigh = cLow + chunkSize - 1;
            if (cHigh > searchHigh) cHigh = searchHigh;

            if (cLow > cHigh) break;

            promises.push(new Promise((resolve, reject) => {
                const worker = new Worker(__filename, {
                    workerData: {
                        low: cLow,
                        high: cHigh,
                        snipersArray: new Uint32Array(snipers) // Copie RAM partagée facile
                    }
                });
                worker.on('message', (msg) => {
                    resolve(new Uint32Array(msg.buffer));
                });
                worker.on('error', reject);
                worker.on('exit', (code) => {
                    if (code !== 0) reject(new Error(`Worker exit code ${code}`));
                });
            }));
        }

        const results = await Promise.all(promises);

        // --- PHASE 3 : LE RAPPORT ---
        // Fusion (Zero-Copy Transfer) de tous les Uint32Array
        let totalLen = smallPrimes.length;
        for (const res of results) totalLen += res.length;

        const finalPrimes = new Uint32Array(totalLen);
        finalPrimes.set(smallPrimes, 0); // Les snipers d'abord
        let offset = smallPrimes.length;

        for (const res of results) {
            finalPrimes.set(res, offset);
            offset += res.length;
        }

        return finalPrimes;
    }

    module.exports = { getPrimesMulti };

} else {
    // --- PHASE 2 : LES SOLDATS (Worker Thread) ---
    // Chaque worker exécute un Tir Direct sur sa zone assignée.
    const { low, high, snipersArray } = workerData;
    const sniperPrimes = new Uint32Array(snipersArray);

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

    const snipersLen = sniperPrimes.length;
    const segmentSize = 2000000; // Maintien strict du plafond RAM à 2Mo
    const localPrimes = [];

    for (let segLow = low; segLow <= high; segLow += segmentSize) {
        let segHigh = segLow + segmentSize - 1;
        if (segHigh > high) segHigh = high;

        const S = segHigh - segLow + 1;
        const isPrimeSeg = new Uint8Array(S);
        isPrimeSeg.fill(1);
        if (segLow === 0) { isPrimeSeg[0] = 0; isPrimeSeg[1] = 0; }

        for (let i = 0; i < snipersLen; i++) {
            const p = sniperPrimes[i];

            const minSurvivor = Math.max(Math.ceil(segLow / p), p);
            const maxSurvivor = Math.floor(segHigh / p);
            if (minSurvivor > maxSurvivor) continue;

            const startCycle = Math.floor(minSurvivor / baseWidth) * baseWidth;

            // Tir Direct Massif
            for (let cycle = startCycle; cycle <= maxSurvivor; cycle += baseWidth) {
                for (let k = 0; k < baseLen; k++) {
                    const survivor = cycle + baseSurvivors[k];
                    if (survivor >= minSurvivor && survivor <= maxSurvivor) {
                        isPrimeSeg[(p * survivor) - segLow] = 0;
                    }
                }
            }
        }

        // Ramassage
        const startCycleSeg = Math.floor(segLow / baseWidth) * baseWidth;
        for (let cycle = startCycleSeg; cycle <= segHigh; cycle += baseWidth) {
            for (let k = 0; k < baseLen; k++) {
                const c = cycle + baseSurvivors[k];
                if (c >= segLow && c <= segHigh) {
                    if (c > 11 && isPrimeSeg[c - segLow]) {
                        localPrimes.push(c);
                    }
                }
            }
        }
    }

    // Transfert Zero-Copy au thread maître : le tampon ArrayBuffer de la V8
    const resultBuffer = new Uint32Array(localPrimes).buffer;
    parentPort.postMessage({ buffer: resultBuffer }, [resultBuffer]);
}
