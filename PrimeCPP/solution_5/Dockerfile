FROM ubuntu:22.04 AS build

RUN apt-get update -qq \
    && apt-get install -y bash clang

WORKDIR /opt/app
COPY *.cpp .
RUN clang++ -march=native -mtune=native -pthread -Ofast -std=c++17 PrimeCPP_array.cpp -oprimes_array.exe

FROM ubuntu:22.04

COPY --from=build /opt/app/primes_array.exe /opt/app/

WORKDIR /opt/app
COPY benchmark.sh .

ENTRYPOINT [ "./benchmark.sh"]
CMD ["dummy", "-l", "1000000" ]