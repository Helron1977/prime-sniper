// ---------------------------------------------------------------------------
// PrimeCPP.cpp : Davepl's updated version of Dave's Garage Prime Sieve
//                solution_2, but with optimized mark multiples on ARM
//                Contest-compliant version (discovers all primes algorithmically)
//                Developed w/ assistance of ChatGPT-5 on Aug-31-2025
// ---------------------------------------------------------------------------

#include <chrono>
#include <ctime>
#include <iostream>
#include <sstream>
#include <bitset>
#include <map>
#include <unordered_map>
#include <stdexcept>
#include <cstring>
#include <cmath>
#include <vector>
#include <thread>
#include <memory>
#include <cstdlib>

// No platform-specific headers; keep this file portable

// Threshold in bit-domain step (factor) at/above which we prefer the simple scalar marking loop.
// Tune by defining -DBITSTEP_WORDWISE_THRESHOLD=<value> at compile time.  I tested all values and
// this was the best result on ARM M2 Mac

#ifndef BITSTEP_WORDWISE_THRESHOLD
   #define BITSTEP_WORDWISE_THRESHOLD 10
#endif

using namespace std;
using namespace std::chrono;

const uint64_t DEFAULT_UPPER_LIMIT = 10'000'000LLU;

#ifndef USE_BRANCH_HINTS
#define USE_BRANCH_HINTS 1
#endif
#ifndef USE_ALWAYS_INLINE
#define USE_ALWAYS_INLINE 1
#endif

#if USE_BRANCH_HINTS && (defined(__GNUC__) || defined(__clang__))
#  define LIKELY(x)   (__builtin_expect(!!(x), 1))
#  define UNLIKELY(x) (__builtin_expect(!!(x), 0))
#else
#  define LIKELY(x)   (x)
#  define UNLIKELY(x) (x)
#endif


#if USE_ALWAYS_INLINE && (defined(__GNUC__) || defined(__clang__))
#  define ATTR_ALWAYS_INLINE __attribute__((always_inline))
#else
#  define ATTR_ALWAYS_INLINE
#endif

class BitArray
{
    uint8_t *array;
    size_t logicalSize;
    size_t byteSize;
    bool allocatedWithMalloc {false};

    static constexpr size_t arraySize(size_t size)
    {
        return (size >> 3) + ((size & 7) > 0);
    }

    static constexpr size_t index(size_t n)
    {
        return (n >> 3);
    }

public:
    explicit BitArray(size_t size) : logicalSize(size)
    {
        auto arrBits = (size + 1) / 2; // Only store bits for odd numbers
        byteSize = arraySize(arrBits);
        // Align to 64 bytes to help wide loads/stores on ARM
        void* ptr = nullptr;
        if (posix_memalign(&ptr, 64, byteSize) != 0 || ptr == nullptr) {
            // Fallback to unaligned new if alignment fails
            array = new uint8_t[byteSize];
            allocatedWithMalloc = false;
        } else {
            array = reinterpret_cast<uint8_t*>(ptr);
            allocatedWithMalloc = true;
        }
        std::memset(array, 0x00, byteSize);
    }

    ~BitArray()
    {
        if (allocatedWithMalloc)
            free(array);
        else
            delete[] array;
    }

    constexpr bool get(size_t n) const ATTR_ALWAYS_INLINE
    {
        if (n % 2 == 0)
            return false; // Even numbers > 2 are not prime
        n = n / 2; // Map the actual number to the index in the array
        return !(array[index(n)] & (uint8_t(1) << (n % 8)));
    }

    void set(size_t n) ATTR_ALWAYS_INLINE
    {
        n = n / 2; // Map the actual number to the index in the array
        array[index(n)] |= (uint8_t(1) << (n % 8));
    }

    constexpr size_t size() const ATTR_ALWAYS_INLINE
    {
        return logicalSize;
    }

    // Fast get when n is known odd and already in bit-domain index (bi)
    inline bool getOddByBitIndex(size_t bi) const ATTR_ALWAYS_INLINE
    {
        return (array[bi >> 3] & (uint8_t(1) << (bi & 7))) == 0;
    }

    // Find next zero bit (prime) at or after startBi, up to and including maxBi; returns maxBi+1 if none
    size_t find_next_prime_bit(size_t startBi, size_t maxBi) const ATTR_ALWAYS_INLINE
    {
        if (startBi > maxBi)
            return maxBi + 1;

        const uint64_t* words = reinterpret_cast<const uint64_t*>(array);
        size_t wordIdx = startBi >> 6; // /64
        size_t bitOff = startBi & 63;
        const size_t lastWord = maxBi >> 6;

        uint64_t inv;
        if (wordIdx <= lastWord)
        {
            // Check for zero bits in the current word
            uint64_t w = words[wordIdx];
            inv = ~w;
            if (bitOff)
                inv &= ~((1ULL << bitOff) - 1ULL);

            // Find the next word with a zero bit
            while (inv == 0ULL)
            {
                if (++wordIdx > lastWord) 
                    return maxBi + 1;
                inv = ~words[wordIdx];
            }
            // Find the first zero bit in the current word
            unsigned tz = __builtin_ctzll(inv);

            size_t bi = (wordIdx << 6) + tz;

            // Check if the found bit index is within the allowed range
            if (bi <= maxBi)
                return bi;
        }
        return maxBi + 1;
    }

    // mark_multiples
    //
    // Efficiently marks bits starting at 'start' (number domain) and with step equal to 'factor' in the
    // bit domain (because only odd numbers are stored, successive odd multiples are factor*2 apart in the
    // number domain, which is +factor in the bit domain). This operates word-wise to reduce per-bit work.

    void mark_multiples(uint64_t start, uint64_t factor)
    {
        // Map to bit domain (only odds stored): bitIdx = n/2, bitStep = step
        if (start < 3)
            start = 3; // safety, though callers use factor*factor

        const uint64_t bitCount = (logicalSize + 1) / 2; // number of bits stored
        uint64_t b = start / 2;           // starting bit index
        const uint64_t bitStep = factor;  // step in bit domain
        if (bitStep == 0 || b >= bitCount)
            return;

        // For large steps, use optimized scalar loop with aggressive prefetching
        if (UNLIKELY(bitStep >= BITSTEP_WORDWISE_THRESHOLD))
        {
            // Unroll by 8 to reduce loop overhead and improve instruction-level parallelism
            uint64_t bi = b;
            const uint64_t step8 = bitStep * 8;
            const uint64_t end = (bitCount >= step8) ? (bitCount - step8) : 0;

            // Process 8 at a time with aggressive prefetching
            while (bi < end)
            {
                // Store 8 values
                array[bi >> 3] |= static_cast<uint8_t>(1) << (bi & 7);
                bi += bitStep;
                array[bi >> 3] |= static_cast<uint8_t>(1) << (bi & 7);
                bi += bitStep;
                array[bi >> 3] |= static_cast<uint8_t>(1) << (bi & 7);
                bi += bitStep;
                array[bi >> 3] |= static_cast<uint8_t>(1) << (bi & 7);
                bi += bitStep;
                array[bi >> 3] |= static_cast<uint8_t>(1) << (bi & 7);
                bi += bitStep;
                array[bi >> 3] |= static_cast<uint8_t>(1) << (bi & 7);
                bi += bitStep;
                array[bi >> 3] |= static_cast<uint8_t>(1) << (bi & 7);
                bi += bitStep;
                array[bi >> 3] |= static_cast<uint8_t>(1) << (bi & 7);
                bi += bitStep;
            }

            // Handle remaining values
            while (bi < bitCount)
            {
                array[bi >> 3] |= static_cast<uint8_t>(1) << (bi & 7);
                bi += bitStep;
            }
            return;
        }

        // Byte and word geometry
        const size_t totalBytes = byteSize;
        const size_t fullWordCount = totalBytes / sizeof(uint64_t); // number of complete 64-bit words
        const size_t tailBytes = totalBytes - fullWordCount * sizeof(uint64_t);

        // Process full 64-bit words starting from the word containing the first bit
        size_t wordIndex = b / 64;
        const size_t startWordIndex = wordIndex;
        const uint32_t startPosAbs = static_cast<uint32_t>(b % 64); // first position to mark within start word
        const uint64_t delta = 64 % bitStep;          // (pos + 64) % bitStep
        const uint32_t advance = static_cast<uint32_t>(delta == 0 ? 0 : (bitStep - delta));
        uint32_t firstMod = static_cast<uint32_t>(b % bitStep); // first position modulo bitStep (kept in [0,bitStep))

        // Enhanced mask precomputation with unrolled inner loops
        uint64_t stepMasks[64];
        for (uint64_t first = 0; first < bitStep && first < 64; ++first)
        {
            uint64_t m = 0ULL;
            // Unroll inner loop by 4 for better performance
            uint64_t pos = first;
            while (pos < 64 - bitStep * 3) {
                m |= (1ULL << pos);
                pos += bitStep;
                m |= (1ULL << pos);
                pos += bitStep;
                m |= (1ULL << pos);
                pos += bitStep;
                m |= (1ULL << pos);
                pos += bitStep;
            }
            // Handle remaining positions
            while (pos < 64) {
                m |= (1ULL << pos);
                pos += bitStep;
            }
            stepMasks[first] = m;
        }

        // Optimized word processing with bulk updates
        uint64_t* words = reinterpret_cast<uint64_t*>(array);

        // Process multiple words at once when possible
        while (wordIndex + 3 < fullWordCount) {
            // Process 4 words at a time for better memory throughput
            const uint32_t absPos = (wordIndex == startWordIndex) ? startPosAbs : 0u;

            uint64_t mask = stepMasks[firstMod];
            if (wordIndex == startWordIndex && absPos)
                mask &= ~((1ULL << absPos) - 1ULL);

            words[wordIndex] |= mask;

            // Compute masks for next 3 words
            uint32_t mod1 = firstMod + advance; 
            if (mod1 >= bitStep) 
                mod1 -= bitStep;
            uint32_t mod2 = mod1 + advance; if (mod2 >= bitStep) mod2 -= bitStep;
            uint32_t mod3 = mod2 + advance; if (mod3 >= bitStep) mod3 -= bitStep;

            words[wordIndex + 1] |= stepMasks[mod1];
            words[wordIndex + 2] |= stepMasks[mod2];
            words[wordIndex + 3] |= stepMasks[mod3];

            wordIndex += 4;
            firstMod = mod3 + advance;
            if (firstMod >= bitStep)
                firstMod -= bitStep;
        }

        // Handle remaining words one by one
        while (wordIndex < fullWordCount)
        {
            const uint32_t absPos = (wordIndex == startWordIndex) ? startPosAbs : 0u;

            uint64_t mask = stepMasks[firstMod];
            if (wordIndex == startWordIndex && absPos)
                mask &= ~((1ULL << absPos) - 1ULL);

            words[wordIndex] |= mask;

            wordIndex++;
            if (advance) 
            {
                firstMod += advance;
                if (firstMod >= bitStep) 
                    firstMod -= bitStep;
            }
        }

        // Process tail bytes (if any) with a compact scalar loop in bit domain
        if (tailBytes > 0)
        {
            const uint64_t tailBitStart = static_cast<uint64_t>(fullWordCount) * 64ULL; // first bit index of tail word
            const uint64_t lastWordBits = bitCount - tailBitStart; // number of valid bits in tail word (1..63)
            if (lastWordBits)
            {
                uint32_t tailFirstAbs = 0u;
                uint32_t tailFirstMod = 0u;
                if (b >= tailBitStart)
                {
                    // We start inside the tail word
                    tailFirstAbs = static_cast<uint32_t>(b - tailBitStart);
                    tailFirstMod = static_cast<uint32_t>(b % bitStep);
                }
                else
                {
                    // We progressed through full words; current firstMod targets the tail word
                    tailFirstAbs = 0u; // no need to clamp below 0
                    tailFirstMod = firstMod;
                }

                // Compute the mask for the tail word
                uint64_t mask = stepMasks[tailFirstMod];
                if (b >= tailBitStart && tailFirstAbs)
                    mask &= ~((1ULL << tailFirstAbs) - 1ULL);

                // Clamp to the actual number of valid bits in the final partial word
                if (lastWordBits < 64)
                    mask &= ((1ULL << lastWordBits) - 1ULL);

                // Byte-safe OR to make the mask for the tail bytes
                uint8_t* tailPtr = array + fullWordCount * sizeof(uint64_t);
                uint64_t m = mask;

                // Apply the mask to the tail bytes
                for (size_t j = 0; j < tailBytes; ++j)
                {
                    tailPtr[j] |= static_cast<uint8_t>(m & 0xFFu);
                    m >>= 8;
                }
            }
        }
    }
};


// prime_sieve
//
// Represents the data comprising the sieve (an array of bits representing odd numbers starting from 3)
// and includes the code needed to eliminate non-primes from its array by calling runSieve.

class prime_sieve
{
  private:

      BitArray Bits; // Sieve data, where 0==prime, 1==not

   public:

      prime_sieve(uint64_t n) : Bits(n) // Initialize bits to zero default
      {
      }

      ~prime_sieve()
      {
      }

      // runSieve
      //
      // Scan the array for the next factor (>2) that hasn't yet been eliminated from the array, and then
      // walk through the array crossing off every multiple of that factor.

      void runSieve()
      {
          const uint64_t limit = Bits.size();
          const uint64_t q = (uint64_t) sqrt((double)limit);
          const size_t qBi = q / 2;

          // Start with the first odd prime and discover all primes algorithmically
          uint64_t factor = 3;
          size_t bi = factor / 2;  // 3 -> 1

          while (factor <= q)
          {
              // Find the next prime by scanning for next zero bit
              size_t nextBi = Bits.find_next_prime_bit(bi, qBi);
              if (nextBi > qBi)
                  break;
              factor = (uint64_t)(nextBi * 2 + 1);

              // Mark multiples starting from factor^2
              uint64_t start = factor * factor;
              Bits.mark_multiples(start, factor);

              bi = nextBi + 1;
          }
      }

      // countPrimes
      //
      // Can be called after runSieve to determine how many primes were found in total

      size_t countPrimes() const
      {
          size_t count = (Bits.size() >= 2); // Count 2 as prime if within range
          for (uint64_t num = 3; num <= Bits.size(); num += 2)
              if (Bits.get(num))
                  count++;
          return count;
      }

      // isPrime
      //
      // Can be called after runSieve to determine whether a given number is prime.

      bool isPrime(uint64_t n) const
      {
          if (n == 2)
              return true;
          if (n < 2 || n % 2 == 0)
              return false;
          return Bits.get(n);
      }

      // validateResults
      //
      // Checks to see if the number of primes found matches what we should expect. This data isn't used in the
      // sieve processing at all, only to sanity check that the results are right when done.

      bool validateResults() const
      {
          const std::map<const uint64_t, const int> resultsDictionary =
          {
                {             10LLU, 4         }, // Historical data for validating our results - the number of primes
                {            100LLU, 25        }, // to be found under some limit, such as 168 primes under 1000
                {          1'000LLU, 168       },
                {         10'000LLU, 1229      },
                {        100'000LLU, 9592      },
                {      1'000'000LLU, 78498     },
                {     10'000'000LLU, 664579    },
                {    100'000'000LLU, 5761455   },
                {  1'000'000'000LLU, 50847534  },
                { 10'000'000'000LLU, 455052511 },
          };
          if (resultsDictionary.end() == resultsDictionary.find(Bits.size()))
              return false;
          return resultsDictionary.find(Bits.size())->second == countPrimes();
      }

      // printResults
      //
      // Displays stats about what was found as well as (optionally) the primes themselves

      void printResults(bool showResults, double duration, size_t passes, size_t threads) const
      {
          if (showResults)
              cout << "2, ";

          size_t count = (Bits.size() >= 2); // Count 2 as prime if in range
          for (uint64_t num = 3; num <= Bits.size(); num += 2)
          {
              if (Bits.get(num))
              {
                  if (showResults)
                      cout << num << ", ";
                  count++;
              }
          }

          if (showResults)
              cout << "\n";

          cout << "Passes: "  << passes << ", "
               << "Threads: " << threads << ", "
               << "Time: "    << duration << ", "
               << "Average: " << duration/passes << ", "
               << "Limit: "   << Bits.size() << ", "
               << "Counts: "  << count << "/" << countPrimes() << ", "
               << "Valid: "   << (validateResults() ? "Pass" : "FAIL!")
               << "\n";

          // Following 2 lines added by rbergen to conform to drag race output format
          cout << "\n";
          cout << "davepl_array;" << passes << ";" << duration << ";" << threads << ";algorithm=base,faithful=yes,bits=1\n";
      }

};

// custom_atoll
//
// Like atoll(), but accepts K, M, G, and T as magnitude suffixes.

long long custom_atoll(const std::string& value_str) {
    static const std::unordered_map<char, long long> suffixes = {
        {'K', 1000LL},
        {'M', 1000000LL},
        {'G', 1000000000LL},
        {'T', 1000000000000LL}
    };

    std::string input_str = value_str;
    for (char& c : input_str) {
        c = std::toupper(c);
    }

    char last_char = input_str.back();
    if (suffixes.find(last_char) != suffixes.end()) {
        long long multiplier = suffixes.at(last_char);
        std::string numeric_part = input_str.substr(0, input_str.size() - 1);
        std::istringstream iss(numeric_part);
        double numeric_value;
        if (!(iss >> numeric_value)) {
            throw std::invalid_argument("Invalid numeric part: " + numeric_part);
        }
        return static_cast<long long>(numeric_value * multiplier);
    }

    std::istringstream iss(input_str);
    long long result;
    if (!(iss >> result)) {
        throw std::invalid_argument("Invalid input format");
    }
    return result;
}

int main(int argc, char **argv)
{
    vector<string> args(argv + 1, argv + argc);         // From first to last argument in the argv array
    uint64_t ullLimitRequested = 0;
    auto cThreadsRequested = 0;
    auto cSecondsRequested = 0;
    auto bPrintPrimes      = false;
    auto bOneshot          = false;
    auto bQuiet            = false;

    // Process command-line args

    for (auto i = args.begin(); i != args.end(); ++i)
    {
        if (*i == "-h" || *i == "--help") {
              cout << "Syntax: " << argv[0] << " [-t,--threads threads] [-s,--seconds seconds] [-l,--limit limit] [-1,--oneshot] [-q,--quiet] [-h] " << endl;
            return 0;
        }
        else if (*i == "-t" || *i == "--threads")
        {
            i++;
            cThreadsRequested = (i == args.end()) ? 0 : max(1, atoi(i->c_str()));
        }
        else if (*i == "-s" || *i == "--seconds")
        {
            i++;
            cSecondsRequested = (i == args.end()) ? 0 : max(1, atoi(i->c_str()));
        }
        else if (*i == "-l" || *i == "--limit")
        {
            i++;
            ullLimitRequested = (i == args.end()) ? 0LL : max((long long)1, custom_atoll(i->c_str()));
        }
        else if (*i == "-1" || *i == "--oneshot")
        {
            bOneshot = true;
            cThreadsRequested = 1;
        }
        else if (*i == "-p" || *i == "--print")
        {
             bPrintPrimes = true;
        }
        else if (*i == "-q" || *i == "--quiet")
        {
             bQuiet = true;
        }
        else
        {
            fprintf(stderr, "Unknown argument: %s", i->c_str());
            return 0;
        }
    }

    if (!bQuiet)
    {
        cout << "Primes Benchmark (c) 2025 Dave's Garage - http://github.com/davepl/primes" << endl;
        cout << "-------------------------------------------------------------------------" << endl;
    }

    if (bOneshot)
        cout << "Oneshot is on. A single pass will be used to simulate a 5 second run." << endl;

    if (bOneshot && (cSecondsRequested > 0 || cThreadsRequested > 1))
    {
        cout << "Oneshot option cannot be mixed with second count or thread count." << endl;
        return 0;
    }

    auto cPasses      = 0;
    auto cSeconds     = (cSecondsRequested ? cSecondsRequested : 5);
    auto cThreads     = (cThreadsRequested ? cThreadsRequested : thread::hardware_concurrency());
    auto llUpperLimit = (ullLimitRequested ? ullLimitRequested : DEFAULT_UPPER_LIMIT);

    if (!bQuiet)
    {
        printf("Computing primes to %llu on %d thread%s for %d second%s.\n",
            (unsigned long long)llUpperLimit,
            cThreads,
            cThreads == 1 ? "" : "s",
            cSeconds,
            cSeconds == 1 ? "" : "s"
        );
    }
    double duration;

    if (bOneshot)
    {
        auto tStart       = steady_clock::now();
        prime_sieve(llUpperLimit).runSieve();
        auto tEnd = steady_clock::now() - tStart;
        duration = duration_cast<microseconds>(tEnd).count()/1000000.0;
    }
    else
    {
        auto tStart       = steady_clock::now();
        std::vector<std::thread> threads(cThreads);
        std::vector<uint64_t> l_passes(cThreads);
        for (unsigned int i = 0; i < cThreads; i++)
            threads[i] = std::thread([i, &l_passes, &tStart](size_t llUpperLimit)
            {
                l_passes[i] = 0;
                while (duration_cast<seconds>(steady_clock::now() - tStart).count() < 5) {
                    prime_sieve(llUpperLimit).runSieve();
                    ++l_passes[i];
                }
            }, llUpperLimit);
        for (auto i = 0; i < cThreads; i++) {
            threads[i].join();
            cPasses += l_passes[i];
        }
        auto tEnd = steady_clock::now() - tStart;
        duration = duration_cast<microseconds>(tEnd).count()/1000000.0;
    }


    if (bOneshot)
    {
        cPasses = 1.0 / duration * 5;
        duration = 5.0;
    }

    prime_sieve checkSieve(llUpperLimit);
    checkSieve.runSieve();
    auto result = checkSieve.validateResults() ? checkSieve.countPrimes() : 0;

    if (!bQuiet)
        checkSieve.printResults(bPrintPrimes, duration , cPasses, cThreads);
    else
        cout << cPasses << ", " << duration / cPasses << endl;

    // On success return the count of primes found; on failure, return 0

    return (int) result;
}
