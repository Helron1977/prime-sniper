FROM node:18-bullseye-slim

WORKDIR /opt/app

COPY run.sh \
     PrimeJavaScript_sniper.js \
    ./

# Make run.sh executable
RUN chmod +x run.sh

ENTRYPOINT [ "./run.sh" ]
