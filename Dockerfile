# syntax=docker/dockerfile:1
# Playwright's image ships the headless Chromium (and its system libraries) that export needs.
# Keep the tag in step with the "playwright" version in package-lock.json.
FROM mcr.microsoft.com/playwright:v1.64.0-noble

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Includes vendor/fluent-emoji for stickers: run `npm run setup:emoji` before building.
COPY . .
RUN npm run build && npm prune --omit=dev && npm cache clean --force

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4317 \
    APPSHOT_DATA=/data

# pwuser comes with the Playwright image.
RUN mkdir -p /data && chown pwuser:pwuser /data
USER pwuser
EXPOSE 4317
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4317/api/health || exit 1

CMD ["node", "--import", "tsx", "server/index.ts"]
