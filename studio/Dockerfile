# syntax=docker/dockerfile:1
# OpenConnect's screenshot studio. Playwright's image ships the headless Chromium (and its system
# libraries) that rendering needs. Keep the tag in step with "playwright" in package-lock.json.
FROM mcr.microsoft.com/playwright:v1.64.0-noble

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
# Served under OpenConnect at /studio (the editor's asset URLs are fixed at build time).
ARG BASE_PATH=/studio
ENV BASE_PATH=${BASE_PATH}
# Sticker emoji (Microsoft Fluent Emoji, MIT): fetched here unless vendor/ was provided.
RUN if [ ! -f vendor/fluent-emoji/index.json ]; then \
      apt-get update -qq && apt-get install -y -qq --no-install-recommends git >/dev/null && \
      bash scripts/fetch-emoji.sh && rm -rf /var/lib/apt/lists/*; \
    fi
RUN npm run build && npm prune --omit=dev && npm cache clean --force

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4317 \
    APPSHOT_DATA=/data

# Runs as the same user as the dashboard (uid 1001), so both can share the data folder.
RUN mkdir -p /data && chown 1001:1001 /data
USER 1001:1001
ENV HOME=/tmp
EXPOSE 4317
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:4317${BASE_PATH}/api/health" || exit 1

CMD ["node", "--import", "tsx", "server/index.ts"]
