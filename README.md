# 🎯 Prime-Sniper

**Prime-Sniper** est l'un des générateurs de nombres premiers natifs (JS pur) les plus rapides, économes en RAM et multithreadés de l'écosystème NodeJS (NPM).

Bâti sur une approche architecturale audacieuse baptisée **"Le Tir Direct"** (Segmented Wheel Factorization + Direct Product Impact), il s'affranchit des boucles conditionnelles coûteuses, évite tous les modulo/divisions, et maintient l'empreinte mémoire à un plafond strict de 2 Mo même lorsqu'il traite des centaines de millions de candidats.

> 🚀 **V6 Multithread :** Exploite nativement tous les cœurs de votre machine via Node `Worker Threads` et le transfert *Zero-Copy* en ArrayBuffers.

## 📊 Benchmark Compétitif (Node.js V8)

*Mesures honnêtes forcées avec le Garbage Collector (`--expose-gc`), sur un processeur Intel i7 8-Cores.*

### Cible : Générer 50 Millions de Nombres Premiers
| Librairie | Temps d'exécution | Mémoire Cible (Max) | Bilan RAM/CPU | Conclusion |
| :--- | :--- | :--- | :--- | :--- |
| **Prime-Sniper V6 (Multithread)** | **180 ms** | **~80 Mo** (distribué) | 🏆 **L'état de l'Art** | Le plus rapide |
| **Prime-Sniper V4 (Monothread)** | **228 ms** | **~81 Mo** (fixe) | 👑 **BASELINE** | Référence pure |
| `@algorithm.ts/sieve-prime` | 399 ms | ~100 Mo | ⚡ +70% plus lent | Bon concurrent (O(N)) |
| `sieve-of-eratosthenes` (NPM Standard) | 1946 ms | ~495 Mo | 🐌 +850% plus lent | Mémoire saturée |
| `primes-and-factors` | ERROR | CRASH | 💥 Hors Somme | V8 _Out of Memory_ |

---

## 💻 Installation

```bash
npm install prime-sniper
```

## 🛠️ Exemples d'Utilisation

### 1. La V6 Absolue : Multithreading (Asynchrone)
Si vous cherchez des nombres premiers au-delà de 10 Millions, libérez la puissance de votre processeur entier. La réponse vous est rendue sous forme de `Uint32Array` (tableau typé binaire, le plus rapide existant en JS).

```javascript
const { getPrimesMulti } = require('prime-sniper');

async function main() {
    console.time("Chasse");
    // Libérez l'armada sur un DEMI-MILLIARD de candidats
    const primes = await getPrimesMulti(500000000); 
    console.timeEnd("Chasse"); // ~ 500ms sur un CPU récent
    
    console.log(`Nombre de nombres premiers trouvés : ${primes.length}`);
}
main();
```

### 2. Le Moteur Standard Segmenté (Synchrone)
Recommandé pour tous les travaux et criblages standards (< 10 Millions) de processus classiques. Retourne un tableau Javascript normal `Array[Numbers]`.

```javascript
const { getPrimes } = require('prime-sniper');

// Demande instantanée
const primesArr = getPrimes(1000000); 
console.log(primesArr[0]); // 2
```

### 3. Trouver dans un Intervalle (Range)
Trouve et extrait très rapidement les nombres premiers dans une fenêtre délimitée (ex: entre 50 000 et 60 000).

```javascript
const { getPrimesRange } = require('prime-sniper');

const myPrimes = getPrimesRange(50000, 60000);
```

### 4. Tests de Primalité : Standard et Cryptographique (BigInt)

```javascript
const { isPrime, isBigPrime } = require('prime-sniper');

// Nombre Javascript Classique (< 9e15) : Factorisation Wheel P=5
console.log(isPrime(9999991)); // true

// Nombres Extra-Larges / Cryptographie (Miller-Rabin Déterministe puis Probabiliste)
console.log(isBigPrime(170141183460469231731687303715884105727n)); // true
```

---

## ⚙️ Comment ça marche ? (L'Architecture sous le capot)

Contrairement aux approches basiques du Crible d'Ératosthène implémentées en JS qui noient la RAM du moteur V8 en allouant des variables colossales :

1. **La Base ("Tir Direct")** : Prime-Sniper ne cherche pas les multiples par itérations séquentielles lourdes (`for(i=x;... i+=x)`). Il pré-calcule des motifs cycliques de "survivants non-triviaux" (`Wheel P=11, 2310 largeur`) et multiplie mathématiquement le reste : `impact = premier * candidat_survivant`.
2. **La Segmentation V4** : Pour que la mémoire RAM reste figée (pas de crashe d'application NodeJS), Prime-Sniper découpe le travail en fenêtres d'adresses (par exemple: tranches de 2 Mégabytes). Il nettoie un block, stocke les résultats, et écrase la même mémoire pour passer au suivant.
3. **Le Multi-Thread V6** : Puisque les segments sont indépendants, le Node `Master` envoie les équations aux Cœurs de votre Processeur (`Worker_Threads`). Chaque coeur nettoie ses segments en local et transmet le signal binaire à la vitesse de l'éclair sans copie mémoire lourde (`zero-copy transfer`).

## 🧪 Contribuer / Lancer les Benchmarks
Le package inclut notre suite de Benchmark impitoyable.

```bash
# Compare Prime-Sniper vs Sieve vs algorithm.ts
npm run bench

# Compare Prime-Sniper Monothread vs Prime-Sniper Multithread
npm run bench:multi
```