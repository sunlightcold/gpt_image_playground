# ---- Build stage ----
FROM --platform=$BUILDPLATFORM node:22-alpine AS build

WORKDIR /app

ENV VITE_DEFAULT_API_URL=__VITE_DEFAULT_API_URL_PLACEHOLDER__
ENV VITE_API_PROXY_AVAILABLE=__VITE_API_PROXY_AVAILABLE_PLACEHOLDER__
ENV VITE_API_PROXY_LOCKED=__VITE_API_PROXY_LOCKED_PLACEHOLDER__
ENV VITE_DOCKER_DEPLOYMENT=__VITE_DOCKER_DEPLOYMENT_PLACEHOLDER__
ENV VITE_DOCKER_LEGACY_API_URL_USED=__VITE_DOCKER_LEGACY_API_URL_USED_PLACEHOLDER__

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime Node stage ----
FROM --platform=$TARGETPLATFORM node:22-alpine AS node-runtime

# ---- Production stage ----
FROM nginx:alpine

ENV HOST=0.0.0.0
ENV PORT=80
ENV API_PROXY_SERVER_HOST=127.0.0.1
ENV API_PROXY_SERVER_PORT=8787
ENV API_PROXY_HEARTBEAT_MS=15000
ENV API_PROXY_READ_TIMEOUT=600s
ENV API_PROXY_SEND_TIMEOUT=600s
ENV DEFAULT_API_URL=
ENV API_PROXY_URL=
ENV ENABLE_API_PROXY=true
ENV LOCK_API_PROXY=false
ENV PROMPT_CASE_DATASET_URL=https://raw.githubusercontent.com/sunlightcold/gpt_image_playground/main/public/data/gpt-image-2/cases.json
ENV PROMPT_CASE_DATASET_CACHE_SECONDS=600
ENV PROMPT_CASE_DATASET_FALLBACK_FILE=/usr/share/nginx/html/data/gpt-image-2/cases.json

RUN apk add --no-cache libstdc++

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN node --version | grep -E '^v22\.'

COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/templates/default.conf.template
COPY deploy/api-proxy-server.mjs /app/api-proxy-server.mjs
COPY --chmod=755 deploy/migrate-api-env.envsh /docker-entrypoint.d/05-migrate-api-env.envsh
COPY --chmod=755 deploy/inject-api-url.sh /docker-entrypoint.d/40-inject-api-url.sh
COPY --chmod=755 deploy/docker-entrypoint.sh /app/docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
