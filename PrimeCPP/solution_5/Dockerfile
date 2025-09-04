# ---- build stage ----
FROM ubuntu:22.04 AS build

RUN apt-get update -qq \
 && apt-get install -y bash clang

WORKDIR /opt/app
COPY *.cpp .

# Optional: arch-aware flags using BuildKit's TARGETARCH
ARG TARGETARCH
RUN set -eux; \
    CXXFLAGS="-O3 -ffast-math -std=c++17 -pthread"; \
    case "$TARGETARCH" in \
      amd64) CXXFLAGS="$CXXFLAGS -march=native -mtune=native" ;; \
      arm64) CXXFLAGS="$CXXFLAGS -mcpu=native" ;; \
      *) : ;; \
    esac; \
    clang++ $CXXFLAGS PrimeCPP_array.cpp -o primes_array.exe

# ---- runtime stage ----
FROM ubuntu:22.04

WORKDIR /opt/app
COPY --from=build /opt/app/primes_array.exe /opt/app/
COPY benchmark.sh .
RUN chmod +x benchmark.sh

ENTRYPOINT ["./benchmark.sh"]
CMD ["dummy", "-l", "1000000"]
