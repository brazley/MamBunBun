# ================================
# MamBunBun - Bun Server Template
# ================================
FROM oven/bun:1.3.11-slim AS build

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and local packages
COPY src/ ./src/
COPY packages/ ./packages/
COPY tsconfig.json ./

# ================================
# Run image (same base - no compile step needed)
# ================================
FROM oven/bun:1.3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything from build stage
COPY --from=build /app .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["bun", "run", "src/api/server.ts"]
