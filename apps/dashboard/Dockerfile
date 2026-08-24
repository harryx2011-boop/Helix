# helix-dashboard — static Next.js export served on 3400.
#
# Built from the repo root so the workspace resolves.
#   docker build -f apps/dashboard/Dockerfile .

FROM node:22-slim AS build
WORKDIR /app

# The API URL is baked at build time: a static export has no server to read
# runtime env. This is why the compose file passes it as a build arg.
ARG NEXT_PUBLIC_HELIX_API_URL=http://localhost:7400
ENV NEXT_PUBLIC_HELIX_API_URL=$NEXT_PUBLIC_HELIX_API_URL

COPY apps/dashboard/package.json ./
RUN npm install --no-audit --no-fund

COPY apps/dashboard/ ./
RUN npm run build

# Serve the static `out/` with a tiny static server. No Node server is needed at
# runtime — the export is plain files.
FROM node:22-slim AS runtime
WORKDIR /app

RUN npm install -g serve@14

COPY --from=build /app/out ./out

EXPOSE 3400

RUN useradd --create-home helix && chown -R helix:helix /app
USER helix

# -s makes it a single-page-app fallback; -l pins the port.
CMD ["serve", "-s", "out", "-l", "3400"]
