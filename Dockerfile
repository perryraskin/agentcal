FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && curl -fsSL https://composio.dev/install -o /tmp/install-composio.sh \
    && env COMPOSIO_INSTALL_DIR=/home/node/.composio \
       COMPOSIO_BIN_DIR=/usr/local/bin \
       COMPOSIO_INSTALL_SHELL=none \
       COMPOSIO_INSTALL_PLUGINS=0 \
       COMPOSIO_INSTALL_HELP=0 \
       sh /tmp/install-composio.sh --no-plugins 0.4.1 \
    && rm /tmp/install-composio.sh \
    && apt-get purge -y --auto-remove curl unzip \
    && rm -rf /var/lib/apt/lists/*

COPY src ./src

RUN mkdir -p /data && chown -R node:node /app /data /home/node/.composio
USER node

EXPOSE 8080
CMD ["node", "src/server.js"]
