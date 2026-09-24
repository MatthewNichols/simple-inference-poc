# syntax=docker/dockerfile:1

# --- builder: produces the OpenAPI-generated TS client + bundled web UI ---
# Needs a JRE because `openapi-generator-cli` (invoked via npx) wraps a JAR.
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run generate-client:npx \
    && npm run build-web

# --- runtime: only what the API server needs to serve requests ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY web/index.html ./web/index.html
COPY --from=builder /app/web/dist ./web/dist

# tesseract.js looks for <lang>.traineddata in the process CWD before trying
# to download it - baking it in avoids a network fetch (and its latency) on
# first OCR call in an environment that may have no/restricted egress.
COPY eng.traineddata ./eng.traineddata

EXPOSE 3000
CMD ["node", "src/api/server.js"]
