# JavaScript solution by Helron1977
![Algorithm](https://img.shields.io/badge/Algorithm-base-green)
![Faithfulness](https://img.shields.io/badge/Faithful-yes-green)
![Parallelism](https://img.shields.io/badge/Parallel-no-green)
![Bit count](https://img.shields.io/badge/Bits-1-green)

A pure JavaScript implementation relying on NodeJS `ArrayBuffer` and `Uint32Array` mapped memory to match CPU architecture speeds.

## Approach
This implementation "Prime-Sniper" achieves high throughput by:
1. Reusing an external memory pool (ArrayBuffer) to sidestep the V8 Garbage Collector overhead.
2. Applying aggressive Loop Unrolling (unrolled 8-steps loop) to optimize the branch prediction buffer of the CPU.
3. Using strict bit shifting (`>>>` and `&`) everywhere to eliminate all divisions/modulo operations, remaining fully faithful to the sieve's nature without `copyMem` block pasting tricks.

## Run instructions
To run individually:
```bash
node PrimeJavaScript_sniper.js
```
