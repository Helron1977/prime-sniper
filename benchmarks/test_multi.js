const { performance } = require('perf_hooks');
const os = require('os');
const { getPrimesV4 } = require('../index');
const { getPrimesMulti } = require('../multi');

async function run() {
    console.log("==================================================");
    console.log(`🔥 PRIME-SNIPER : MULTI-THREADING (V6) 🔥`);
    console.log(`CPU: ${os.cpus()[0].model} (${os.cpus().length} Cores)`);
    console.log("==================================================\n");

    const limits = [10000000, 50000000, 100000000, 500000000]; // Test jusqu'à 500 Millions !

    for (const limit of limits) {
        console.log(`\n▶ TEST CIBLE : ${limit.toLocaleString()}`);

        // V4 Classique
        if (global.gc) global.gc();
        const t1 = performance.now();
        const v4 = getPrimesV4(limit);
        const t2 = performance.now();
        console.log(`| V4 (Mono-Thread) | Temps: ${(t2 - t1).toFixed(2).padStart(8)} ms | Primes: ${v4.length}`);

        // V6 Multithreadées
        if (global.gc) global.gc();
        const t3 = performance.now();
        const v6 = await getPrimesMulti(limit);
        const t4 = performance.now();
        const acceleration = ((t2 - t1) / (t4 - t3)).toFixed(2);

        console.log(`| V6 (Multi-Thread)| Temps: ${(t4 - t3).toFixed(2).padStart(8)} ms | Primes: ${v6.length} | Accélération: ${acceleration}x`);

        // Vérification d'intégrité
        if (v4.length !== v6.length) {
            console.error(`❌ ÉCHEC D'INTÉGRITÉ ! Les longueurs diffèrent (V4: ${v4.length}, V6: ${v6.length})`);
            process.exit(1);
        } else {
            // Vérifier le dernier élément
            if (v4[v4.length - 1] !== v6[v6.length - 1]) {
                console.error(`❌ ÉCHEC D'INTÉGRITÉ ! Le dernier nombre diffère (V4: ${v4[v4.length - 1]}, V6: ${v6[v6.length - 1]})`);
                process.exit(1);
            }
        }
    }
    console.log("\n✅ Tous les tests sont validés.");
}

run();
