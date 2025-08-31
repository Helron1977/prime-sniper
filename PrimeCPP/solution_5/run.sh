#!/bin/bash
set -euo pipefail

# Ensure we operate relative to this script's directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Build PrimeCPP_array.cpp and run the binary with no arguments.
SRC="PrimeCPP_array.cpp"
BIN="primes_array.exe"

echo "Compiling $SRC -> $BIN"
clang++ -march=native -mtune=native -pthread -O3 -ffast-math -fno-math-errno -fno-trapping-math -flto -std=c++17 "$SRC" -o "$BIN"

echo "Running $BIN"
"./$BIN"
