# ---------------------------------------------------------------------------------------------
# Vexto Angular apps — one Dockerfile for all four, selected with APP.
#
# Build context is the frontend/ directory (the Angular workspace). All four apps share one
# package.json, one node_modules and the libs/ folder, so the only thing that differs between the
# images is which project `ng build` is given.
#
#   docker build -f Dockerfile --build-arg APP=operator  -t vexto-operator-web .   (from frontend/)
#   docker build -f Dockerfile --build-arg APP=driver    -t vexto-driver-web .
#   docker build -f Dockerfile --build-arg APP=passenger -t vexto-passenger-web .
#   docker build -f Dockerfile --build-arg APP=cms       -t vexto-cms-web .
#
# The API address is NOT baked into the bundle. The apps read public/config.json at start-up
# (libs/utilities/src/lib/runtime-config.ts), and docker/40-vexto-config.sh writes that file from
# environment variables each time the container starts — so the same image serves any environment,
# and changing the API hostname is an edit to .env and a restart, not a rebuild.
# ---------------------------------------------------------------------------------------------

# ------------------------------------------------------------------ build
FROM node:24-alpine AS build
ARG APP
ARG NG_CONFIGURATION=production

# `ng build` refuses to run without an APP; fail here, before npm ci spends two minutes.
RUN test -n "$APP" || (echo "Build argument APP is required (operator, driver, passenger or cms)." && exit 1)

WORKDIR /workspace

# Dependencies first, on their own layer, so a source change does not re-run npm ci.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# The workspace. .dockerignore keeps node_modules, dist, .angular, e2e output and screenshots out.
COPY . .

RUN npx ng build "$APP" --configuration "$NG_CONFIGURATION"

# ------------------------------------------------------------------ runtime
# nginx, serving static files. No Node, no node_modules, no source: only dist/<app>/browser.
FROM nginx:1.27-alpine AS final
ARG APP

# Single-page-app server block: every unknown path falls back to index.html so a refresh on
# /trips/123 is answered by the Angular router, not by a 404.
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Runs before nginx starts (the official image executes /docker-entrypoint.d/*.sh in order) and
# writes config.json from the VEXTO_* environment variables.
COPY docker/40-vexto-config.sh /docker-entrypoint.d/40-vexto-config.sh
RUN tr -d "\r" < /docker-entrypoint.d/40-vexto-config.sh > /tmp/40 \
    && mv /tmp/40 /docker-entrypoint.d/40-vexto-config.sh \
    && chmod +x /docker-entrypoint.d/40-vexto-config.sh

COPY --from=build /workspace/dist/${APP}/browser /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
