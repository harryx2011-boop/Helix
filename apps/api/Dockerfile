# helix-api — TypeScript core.
#
# Built from the repo root so workspace packages resolve.
#   docker build -f apps/api/Dockerfile .

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/schema/package.json ./packages/schema/
COPY packages/sdk-ts/package.json ./packages/sdk-ts/
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS build
WORKDIR /app
COPY . .
RUN pnpm --filter @helix/api build

FROM base AS runtime
WORKDIR /app

# Playwright's Chromium dependencies. The browser tiers run in-process, so the
# runtime image needs them even though the fetch tiers do not.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
      libatspi2.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 \
      libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 \
      libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/apps/api/migrations ./migrations

RUN npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium

ENV NODE_ENV=production
EXPOSE 7400

# Run unprivileged. A browser pool is a large attack surface to hand root.
RUN useradd --create-home --shell /bin/bash helix && chown -R helix:helix /app
USER helix

CMD ["node", "dist/index.js"]
