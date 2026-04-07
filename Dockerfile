# --- Build ---
FROM node:24 AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable
RUN pnpm install
COPY . .
RUN pnpm run build

# --- Final image ---
FROM node:24
WORKDIR /app

COPY --from=build /app/.output .output/

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
