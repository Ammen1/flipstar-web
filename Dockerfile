# Multi-stage build: Vite/React -> static files -> nginx.
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./

# `npm ci` rather than `npm install`: it installs exactly what
# package-lock.json pins, so the same commit produces the same bundle. With
# `npm install` a transitive caret range can float between builds, which for a
# GitOps flow means the deployed artifact does not correspond to the SHA in
# the image tag. If this fails with EUSAGE the lockfile is out of sync with
# package.json -- run `npm install` locally and commit the updated lockfile
# rather than reverting this line.
RUN npm ci

COPY . .

RUN chmod -R +x node_modules/.bin/

# Vite inlines these into the bundle at BUILD time (see config.js), so they
# are baked into the image and cannot be changed by a Kubernetes ConfigMap.
# Pointing a deployment at a different backend means rebuilding.
ARG VITE_API_BASE_URL=https://api.uat.flipstar.et/api/v1
ARG VITE_ENVIRONMENT=staging
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_ENVIRONMENT=$VITE_ENVIRONMENT

RUN npm run build

# nginx-unprivileged, not the stock nginx image: it runs as uid 101 with no
# setuid binaries and no need to write outside /tmp, which is what lets the
# Kubernetes Deployment set runAsNonRoot + readOnlyRootFilesystem. It listens
# on 8080 because an unprivileged process cannot bind port 80 -- default.conf
# and k8s/base/web/deployment.yaml in the flip-star repo both depend on that
# number.
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Patch the OS packages the base image ships stale.
#
# nginx rebuilds these images on ITS release cadence, not Alpine's security
# cadence, so a freshly pulled 1.27-alpine carried 33 fixable CVEs (2 CRITICAL)
# on first scan -- openssl, libxml2, libpng, musl, zlib, c-ares, expat,
# nghttp2. None were nginx itself. `apk upgrade` against the Alpine security
# branch clears them at build time.
#
# Needs root: the base image ends on USER 101, so drop back to it afterwards or
# nginx runs as root and the Deployment's runAsNonRoot refuses to start the pod.
#
# The trade-off is deliberate: this makes the image non-reproducible over time,
# since the same commit picks up whatever is current in the Alpine repos. That
# is the correct direction for a security gate -- the alternative is pinning
# known-vulnerable packages to keep byte-identical rebuilds.
USER root
RUN apk upgrade --no-cache
USER 101

# Overwrites the image's own default.conf at the same path; no `rm` needed,
# and `rm` would fail anyway since this stage runs as uid 101.
COPY default.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /app/assets /usr/share/nginx/html/assets

EXPOSE 8080
