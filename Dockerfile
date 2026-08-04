# Pinned to the major version in .nvmrc and package.json engines. Alpine keeps the
# image small; the app is pure JS with no native dependencies to build.
FROM node:22-alpine AS deps

WORKDIR /app

# Copy only the manifests first, so a source-only change reuses the cached
# dependency layer instead of reinstalling on every build.
COPY package.json package-lock.json ./

# `npm ci` installs exactly the lockfile; `--omit=dev` leaves out eslint and the
# test tooling, which have no business in a production image.
RUN npm ci --omit=dev


FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server.js app.js ./
COPY lib ./lib
COPY routes ./routes
COPY views ./views
COPY public ./public
# The headline corpus is baked into the image: the container needs no network
# access to serve the game. Refreshing it means committing a new corpus and
# rebuilding, which keeps the image a reproducible artifact.
COPY data ./data

# The node image ships an unprivileged `node` user; nothing here needs root, and
# the app never writes to disk.
USER node

EXPOSE 3000

# Uses the same readiness signal as the load balancer would. Node's built-in
# fetch avoids installing curl just to answer this.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
