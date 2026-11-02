# Chess Review — production image (Round 2, Prompt 7).
#
# Multi-stage: deps (npm ci) → build (engine payload + next build) →
# runner (next start). The Node version matches .nvmrc (20). The runner
# serves on PORT (default 3000) and the app needs no environment variables
# beyond the documented optional ones (NEXT_PUBLIC_ENGINE_BASE_URL,
# CHESSCOM_CALLBACK_ENABLED — see README "Deployment").
#
# Build with a smaller engine payload, e.g.:
#   docker build --build-arg ENGINE_BUNDLE=lite-only .

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
ARG ENGINE_BUNDLE=all
ENV ENGINE_BUNDLE=$ENGINE_BUNDLE
# Optional CDN engine base (build-time inlined; pair with
# ENGINE_BUNDLE=external — see docker-compose.yml).
ARG NEXT_PUBLIC_ENGINE_BASE_URL=
ENV NEXT_PUBLIC_ENGINE_BASE_URL=$NEXT_PUBLIC_ENGINE_BASE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# postinstall does not re-run in this stage, so copy the engine payload
# explicitly (this is also where ENGINE_BUNDLE takes effect), then build.
RUN node scripts/copy-engine.mjs && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.js ./next.config.js
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["npm", "run", "start"]
