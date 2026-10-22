ARG NODE_IMAGE=node:24.22.1-alpine3.24
ARG NGINX_IMAGE=nginx:1.30.6-alpine3.24

FROM ${NODE_IMAGE} AS builder
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci --no-fund
COPY . .
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=${VITE_BASE_PATH}
RUN npm run build

FROM ${NGINX_IMAGE} AS runtime
RUN apk add --no-cache jq \
    && rm -f /etc/nginx/conf.d/default.conf \
    && chown -R nginx:nginx /etc/nginx /usr/share/nginx/html

ENV FRONTEND_CONTAINER_PORT=8080 \
    FRONTEND_BACKEND_ORIGIN=http://backend:8080 \
    FRONTEND_BACKEND_API_PATH=/api \
    FRONTEND_PROXY_CONNECT_TIMEOUT=5s \
    FRONTEND_PROXY_READ_TIMEOUT=60s \
    FRONTEND_DNS_RESOLVER=127.0.0.11 \
    NGINX_WORKER_CONNECTIONS=1024 \
    VITE_BASE_PATH=/ \
    VITE_API_BASE_URL=/api \
    NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx \
    NGINX_ENVSUBST_FILTER="^(FRONTEND_.*|VITE_BASE_PATH|VITE_API_BASE_URL|NGINX_WORKER_CONNECTIONS)$"

COPY docker/templates/ /etc/nginx/templates/
COPY docker/entrypoint/ /docker-entrypoint.d/
COPY --from=builder --chown=nginx:nginx /workspace/dist/ /usr/share/nginx/html/
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

USER nginx
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
    CMD wget -q --spider "http://127.0.0.1:${FRONTEND_CONTAINER_PORT}/healthz" || exit 1
