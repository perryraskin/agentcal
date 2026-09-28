FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

RUN mkdir -p /data && chown -R node:node /app /data
USER node

EXPOSE 8080
CMD ["node", "src/server.js"]
