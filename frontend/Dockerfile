# Web image: builds the React app and serves it with nginx, which also
# forwards API calls to the backend container. Build from the repository root:
#   docker build -f frontend/Dockerfile .
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# The page CSP (deploy/nginx.conf) allows no inline script: ship CRA's
# runtime chunk as a file instead of inlining it into index.html.
ENV INLINE_RUNTIME_CHUNK=false
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
