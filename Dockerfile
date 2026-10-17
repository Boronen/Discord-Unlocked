FROM caddy:2-alpine AS proxy
RUN chown -R 1000:1000 /data /config
USER 1000:1000

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig*.json ./
COPY packages ./packages
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim AS netguard
RUN apt-get update && apt-get install -y --no-install-recommends iptables && rm -rf /var/lib/apt/lists/*
COPY deploy/netguard.mjs /netguard.mjs
RUN chmod 0444 /netguard.mjs
CMD ["node","/netguard.mjs"]

FROM node:24-bookworm-slim AS app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY deploy/grants.sql ./deploy/grants.sql
COPY deploy/launch-check.mjs ./deploy/launch-check.mjs
COPY deploy/image-runtime-check.mjs ./deploy/image-runtime-check.mjs
# Host-side private umasks must not make root-owned application code unreadable
# to the runtime user. This tree contains application code only, never secrets.
RUN chmod -R u=rwX,go=rX /app && mkdir -p /data/media/quarantine /data/media/staging /data/media/processed /data/security && chown -R node:node /data
USER node
RUN node deploy/image-runtime-check.mjs
ENV HOST=0.0.0.0 MEDIA_ROOT=/data/media FFMPEG_PATH=/usr/bin/ffmpeg FFPROBE_PATH=/usr/bin/ffprobe
EXPOSE 3100
CMD ["node", "dist/server/main.js"]
