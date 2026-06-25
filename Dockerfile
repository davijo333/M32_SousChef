# Next.js web app — build from monorepo root (apps/web imports backend/api).
FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY package.json package-lock.json ./
COPY apps/web ./apps/web
COPY backend/api ./backend/api
ENV NEXT_TELEMETRY_DISABLED=1
ENV MONGODB_URI=mongodb://build-placeholder:27017/sous_chef
ENV OPENAI_API_KEY=sk-build-placeholder
ENV NEXTAUTH_SECRET=build-placeholder-secret
WORKDIR /app/apps/web
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/web ./apps/web
COPY --from=builder /app/backend/api ./backend/api
COPY test/inventory ./test/inventory
COPY test/storage/r2 ./test/storage/r2
WORKDIR /app/apps/web
ENV REPO_ROOT=/app
EXPOSE 3000
CMD ["npm", "start"]
