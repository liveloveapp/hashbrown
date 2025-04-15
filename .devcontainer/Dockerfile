FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

COPY ./scripts /tmp/scripts
WORKDIR /tmp/scripts
RUN chmod +x *.sh

RUN ./install-nvm.sh
RUN ./install-nx.sh

WORKDIR /home/node