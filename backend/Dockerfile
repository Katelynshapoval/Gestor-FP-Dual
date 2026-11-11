# API image. Build from the repository root (it needs db/ for the migration
# runner and docs/ for the in-app manual served by /ayuda):
#   docker build -f backend/Dockerfile .
FROM node:24-bookworm-slim

# Chromium for Puppeteer (DOCX -> PDF in documentGenerationService.js), plus
# the fonts the generated documents use. Puppeteer's own download is skipped.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-dejavu-core tini \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3001 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY backend/src ./src
COPY backend/scripts ./scripts
COPY backend/required_documents ./required_documents
COPY db /app/db
COPY docs /app/docs

USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/especialidades').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/index.js"]
