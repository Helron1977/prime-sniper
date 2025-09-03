@ECHO OFF

ECHO Building and running the array approach...
ECHO:
g++ -Ofast PrimeCPP_array.cpp -std=c++17 -lstdc++ -oPrimes_array.exe
.\Primes_array.exe
ECHO:
