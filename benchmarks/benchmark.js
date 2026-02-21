const { performance } = require('perf_hooks');
const os = require('os');
const { getPrimesV2, getPrimesV3, getPrimesV4 } = require('../index');
const { getPrimesMulti } = require('../multi');

// Concurrents NPM
const primesAndFactors = require('primes-and-factors');
const sieveOfEratosthenes = require('sieve-of-eratosthenes');
const primesieve = require('primesieve');
const algTsSieve = require('@algorithm.ts/sieve-prime');

/**
 * Utilitaire pour formater les octets en format lisible (Mo, Go)
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Fonction pour mesurer la consommation de RAM isolée d'une exécution (Synchrone)
 */
function measureMemorySync(fn, limit) {
    if (global.gc) global.gc();

    const startMem = process.memoryUsage().heapUsed;
    const start = performance.now();

    const result = fn(limit);

    const end = performance.now();
    const endMem = process.memoryUsage().heapUsed;

    const memUsed = Math.max(0, endMem - startMem);
    const count = Array.isArray(result) ? result.length : (result.length || 0);

    if (global.gc) global.gc();

    return {
        timeMs: (end - start).toFixed(2),
        ramUsed: memUsed,
        ramStr: formatBytes(memUsed),
        primesFound: count,
        timeRaw: end - start
    };
}

/**
 * Fonction pour mesurer la consommation de RAM (Asynchrone V6)
 */
async function measureMemoryAsync(fn, limit) {
    if (global.gc) global.gc();

    const startMem = process.memoryUsage().heapUsed;
    const start = performance.now();

    const result = await fn(limit);

    const end = performance.now();
    const endMem = process.memoryUsage().heapUsed;

    const memUsed = Math.max(0, endMem - startMem);
    const count = result.length;

    if (global.gc) global.gc();

    return {
        timeMs: (end - start).toFixed(2),
        ramUsed: memUsed,
        ramStr: formatBytes(memUsed),
        primesFound: count,
        timeRaw: end - start
    };
}

/**
 * Lanceur de Benchmark
 */
async function runHonestBenchmark() {
    console.log("==================================================================");
    console.log("🔥 PRIME-SNIPER vs NPM : ULTIMATE BENCHMARK SUITE 🔥");
    console.log("CPU:", os.cpus()[0].model, `(${os.cpus().length} Cores)`);
    console.log("RAM Totale:", formatBytes(os.totalmem()));
    console.log("Node V8 Version:", process.versions.v8);
    console.log("==================================================================\n");

    const tests = [
        { limit: 1000000, name: "1 Million (Sprint Court)" },
        { limit: 10000000, name: "10 Millions (Demi-Fond)" },
        { limit: 50000000, name: "50 Millions (Crash Test Concurrentiel)" }
    ];

    const synchronousEngines = [
        { name: "V3 (Char Sniper)", fn: getPrimesV3, isOurs: true },
        { name: "V4 (Artillerie)", fn: (l) => getPrimesV4(l, 2000000), isOurs: true },
        { name: "Sieve Eratos. NPM", fn: sieveOfEratosthenes, isOurs: false },
        { name: "Primes&Factors NPM", fn: primesAndFactors.getPrimes, isOurs: false },
        { name: "primesieve (Bitfield)", fn: (l) => primesieve.primes(l), isOurs: false },
        { name: "@algorithm.ts/sieve", fn: algTsSieve.sievePrime, isOurs: false }
    ];

    for (const test of tests) {
        console.log(`\n▶ TEST CIBLE : ${test.name} (Recherche jusqu'à ${test.limit.toLocaleString()})`);
        console.log("----------------------------------------------------------------------------------------");
        console.log("| Moteur                     | Temps (ms) | RAM Max Estimée | Statut   | Ratio V4     |");
        console.log("----------------------------------------------------------------------------------------");

        let baselineTimeRaw = 0;

        for (const engine of synchronousEngines) {
            try {
                // Primes-and-factors crashe totalement à cause de Array[] sur 50M
                if (test.limit >= 50000000 && engine.name.includes("Primes&Factors")) {
                    console.log(`| ${engine.name.padEnd(26)} | Skipped    | > 300 MB        | ⚠️ Mem. C. | N/A          |`);
                    continue;
                }

                const stats = measureMemorySync(engine.fn, test.limit);

                if (engine.name.includes("V4")) {
                    baselineTimeRaw = stats.timeRaw;
                    console.log(`| 👑 ${engine.name.padEnd(23)} | ${stats.timeMs.padStart(10)} | ${stats.ramStr.padStart(15)} | ✅ OK    | BASELINE     |`);
                } else {
                    const ratio = baselineTimeRaw > 0 ? (stats.timeRaw / baselineTimeRaw).toFixed(1) + "x" : "N/A";
                    let icon = engine.isOurs ? "🚀" : "🐌";
                    if (ratio !== "N/A" && parseFloat(ratio) < 1) icon = "⚡"; // Au cas où ils nous battent...

                    console.log(`| ${icon} ${engine.name.padEnd(23)} | ${stats.timeMs.padStart(10)} | ${stats.ramStr.padStart(15)} | ✅ OK    | ${ratio.padStart(12)} |`);
                }

            } catch (error) {
                console.log(`| 💥 ${engine.name.padEnd(23)} | ERROR      | N/A             | ❌ FAIL  | N/A          |`);
            }
        }

        // Test V6 Asynchrone à part pour comparer
        if (test.limit >= 10000000) {
            try {
                const stats6 = await measureMemoryAsync(getPrimesMulti, test.limit);
                const ratio6 = baselineTimeRaw > 0 ? (baselineTimeRaw / stats6.timeRaw).toFixed(1) + "x PLUS RAPIDE" : "N/A";
                console.log(`| 👾 V6 (Multithread)        | ${stats6.timeMs.padStart(10)} | ${stats6.ramStr.padStart(15)} | ✅ OK    | ${ratio6} |`);
            } catch (e) { /* ignore en cas d'erreur de thread limit */ }
        }
    }

    console.log("\n==================================================================");
    console.log("📊 CONCLUSION ARCHITECTURALE :\n");
    console.log("Si V4 (BASELINE) = 1.0x, les concurrents affichent leur multiplicateur (2.0x = 2 fois plus lent que V4).");
    console.log("==================================================================\n");
}

runHonestBenchmark();
