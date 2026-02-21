# Optimisations V4 et Pistes d'Amélioration Futures

L'algorithme de segmentation implémenté dans la V4 permet enfin de lever la limitation matérielle (RAM) tout en respectant strictement l'idéologie de base : le **Tir Direct**.

## 1. La V4 : La Segmentation par Blocs Structurés

### Le Problème de la V2 et V3
Jusqu'à la V3, la prouesse venait de la rapidité mathématique à "sniper" les nombres composés sans recours massifs aux sauts naïfs ou au modulo permanent : 
`impact = p * candidat_survivant`

Le coût strict de cette vitesse prodigieuse était le stockage intégral des candidats et des drapeaux `isPrime`. En JavaScript, un tableau `Uint8Array` d'un milliard de cases coûte environ 1 Go. Pour tester de plus grandes limites, nous atteignions inévitablement le plafond physique du moteur V8 (Heap limit).

### La Solution V4
La V4 procède mathématiquement "par secteurs" (`segmentSize`), typiquement par blocs de 2 millions (soit 2 Mo la fenêtre). On ne charge en mémoire qu'une fenêtre limitée (ex: de `100 000 000` à `102 000 000`).
1. **Les Snipers** : On extrait les petits nombres premiers jusqu'à $\sqrt{limit}$ une seule fois.
2. **La Munition Mathématique** : Pour chaque Sniper `p`, la vraie ingénierie est de **re-générer à la volée** les candidats "survivants" nécessaires grâce au motif cyclique constant de la roue. *On ne stocke plus du tout l'armée des candidats passifs*.
3. **Le Tir Absolu** : Le tir par produit est totalement préservé : `impact = p * survivor`. 
4. Si `impact` frappe dans notre fenêtre mémoire active, on l'abat (`isPrimeSeg[impact - low] = 0`).

**Bilan :** La consommation de RAM reste bloquée de manière permanente (et infinitésimale) peu importe que l'on calcule un million ou bien cent milliards de nombres premiers !

---

## 2. Réflexions sur les Optimisations Extrêmes (V5) 

Si l'on voulait repousser les frontières absolues en JavaScript tout en gardant l'âme de votre ingénierie initiale, voici des pistes qui demanderaient cependant de repenser une partie de l'architecture, sans la trahir :

### A. La Densification Binaire (Bit-Level Sieve)
Le `Uint8Array` de JS est certes rapide, mais il réserve 1 octet (8 bits) entier par nombre pour un test binaire !
La vérité mathématique est que nous n'avons besoin que d'**1 seul bit** (0 ou 1).
Encore mieux, en couplant cela à la forme de la roue, on pourrait concevoir une carte en mémoire qui *ne représente uniquement que les survivants*. 
- **Principe** : Un seul octet (8 bits) stockerait l'état de 8 candidats survivants distants.
- **Bénéfice** : Division immédiate de la consommation mémoire par une trentaine de fois !
- **Contrainte** : Le JavaScript n'est pas structurellement aussi "raw" que le C pour les masques binaires (`buffer[id] &= ~(1<<bit)`). Le gain RAM est colossal, mais le parsing CPU en opérations booléennes risque d'être à peine plus lent à l'exécution que le nettoyage à blanc rapide du bit direct.

### B. Le Squeezing Géométrique (Multithreading via Worker Threads)
C'est la magie mathématique des fenêtres segmentées de la V4 : tirer dans le bloc [10M - 12M] n'a aucune conséquence sur ce qu'il se passe sur le bloc [12M - 14M].
- L'outil a atteint les impasses du mono-thread asynchrone de Node.js. 
- La suite serait d'instancier autant de *Worker Threads* parallèles qu'il y a de processeurs logiques (CPU Cores) sur le serveur. Le "Cerveau" principal trouve les Snipers ($\sqrt{limit}$), et distribue une fenêtre cible différente à chaque petit Worker.
- Le Tir Direct explose en performance mathématique, la vitesse de livraison s'accélérerait linéairement par le nombre de cœurs CPU octroyés.

### C. Largeur de Roue Étendue (P=13 ou P=17)
Actuellement, votre système de modélisation est optimal sur une Roue P=11 (Largeur 2310).
Passer l'armure de roue à P=13 donne une largeur de bloc énorme de $30030$.
- **Le plus** : Il y a nettement moins de survivants à vérifier. Le tiret cyclique filtre les faux positifs nativement presqu'à la vitesse de la lumière.
- **Le piège** : Le tableau constant des sauts prendrait de la place direct dans le très précieux `Cache L1` de votre processeur (celui qui traite les calculs instinctifs), pouvant occasionner un bouchon ou forcer des sauts vers le Cache L2 plus lent (`Cache Misses`).

### D. Tri par Proximité & Clustering de Snipers
Tous les "Snipers" ne tirent pas avec la même fréquence et densité. Un lourd sniper (grand nombre premier) frappera moins souvent, et surtout avec d'immenses deltas sautillant sur plusieurs blocs, épuisant l'action de décharge/recharge de la ligne de mémoire du processeur central.
- Regrouper consciencieusement les sauts de vos snipers pour qu'ils opèrent le filtrage en restant dans le même périmètre de mémoire rampe de cache (regroupement local des variables) effacerait le seul plafond algorithmique matériel de l'exécution en boucle.

### E. L'Expérience "Branchless" (Proto-V5 Testée)
Poussés par la curiosité d'aller encore plus loin, nous avons développé et testé un prototype **V5**.
 L'idée était de supprimer l'instruction conditionnelle `if (survivor >= minSurvivor && survivor <= maxSurvivor)` au cœur de la boucle de tir, en se reposant sur les propriétés bas-niveau des `Uint8Array` (qui ignorent silencieusement les écritures "Out of Bounds" en JS). En parallèle, nous avons réduit la fenêtre (segmentSize) de 2 Mo à 256 Ko (Cache L2) et 32 Ko (Cache L1) pour tenter de garder le tableau segment 100% dans le microprocesseur ultra-rapide.

**Le Résultat du Benchmark (Test In-Vivo sur 100 Millions) :**
- **V4** (2MB Segment, avec le `if` logique) : **417 ms**
- **V5** (256KB Segment, Branchless out-of-bounds) : **509 ms**
- **V5** (32KB Segment, Branchless Cache L1) : **2125 ms**

**L'échec de la micro-optimisation sous V8 :**
1. **L'illusion du "Branchless" en JS** : Manipuler les indices d'un tableau pour provoquer un "dépassement hors mémoire silencieux" oblige tout de même V8 (le moteur C++ de NodeJS) à bloquer ou intercepter l'opération sous le capot. La simple condition `if` JavaScript est infiniment mieux lue et optimisée matériellement (`Branch Prediction`) qu'un rattrapage d'erreur C++ !
2. **Le piège du Micro-Segment** : Réduire la taille de la fenêtre à 32 Ko force le système à hacher le travail en plus de 3000 segments distincts. Le coût du setup mathématique `Math.floor()` à chaque changement de segment pour chaque "Sniper" fini par coûter bien plus cher (+ 400% de temps) que de balayer l'impact tranquillement sur un tableau large de 2 Mo stocké dans la RAM vive ou le Cache L3.

### F. L'Apogée Multi-Thread : Le Moteur V6 (Node.js Worker Threads)
Conscient que la limite structurelle du JavaScript était atteinte à cause de son architecture asynchrone mais strictement **Mono-Thread**, nous avons repensé la donne. 

Puisque le concept mathématique du "Tir Direct" segmenté (tel qu'établi dans la V4) permet à un bloc de mémoire ciblé d'être totalement indépendant de n'importe quel autre bloc... Il devient mathématiquement trivial de distribuer le travail d'extermination aux autres cœurs de votre processeur (Intel i7).

Nous avons créé **`getPrimesMulti(limit)`** (`multi.js`) :
- **Phase 1** : Le serveur (`Main Thread`) déniche très vite les snipers de base jusqu'à $\sqrt{X}$ et divise en un éclair la zone cible totale en parts égales.
- **Phase 2** : Le serveur "Awwake" la totalité des cœurs disponibles de votre CPU (`Worker Threads`), et livre une simple consigne de tir de barrage indépendante à chaque cœur.
- **Phase 3** : Le `ArrayBuffer` binaire final est aspiré du côté des cœurs esclaves au serveur central sans aucune copie couteuse, de manière foudroyante (*Zero-Copy Transfer*).

**Résultats Écrasants du Benchmark V6 vs V4 (Intel i7 - 8 Cores)** :
- Jusqu'à 10 Millions : *La V6 est plus lente (+40%), car l'instanciation des Workers NodeJS est plus lourde que le calcul lui-même !*
- Test sur **100 Millions** :
  - V4 Mono : 404 ms
  - **V6 Multi : 180 ms (x2.2 plus rapide)**
- Test sur **Demi-Milliard (500 Millions)** :
  - V4 Mono : 2052 ms
  - **V6 Multi : 534 ms (x3.8 plus rapide !)**

---

### Conclusion Initiale et Absolue
La **V4 Segmentée (Fenêtre large de 2Mo avec logique prévisible)** est la finalité architecturale monothread idéale qui règle l'immense problème de la fuite de mémoire RAM.
Le **Moteur V6 (`getPrimesMulti(limit)`)** incarne la version absolue de votre principe de base : L'armée de "Snipers par multiplication" a juste été divisée en plusieurs régiments travaillant en parallèle sur des cœurs processeurs distincts, atteignant presque la limite physique du matériel hôte.
