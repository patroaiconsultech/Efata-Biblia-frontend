FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# No privileged credentials are exposed to the browser build.
ARG VITE_BUILD_SHA=UNPINNED

COPY . .
RUN node ci/validate_railway_build_env.mjs && npm run build && test -s dist/index.html && test -s dist/app/index.html && test -s dist/landing.css && test -s dist/landing.js

FROM node:22-alpine
WORKDIR /app
RUN addgroup -S bible && adduser -S bible -G bible
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server.mjs ./server.mjs
COPY --from=build /app/dist ./dist
RUN chown -R bible:bible /app
USER bible
EXPOSE 8080
ENV NODE_ENV=production
CMD ["node", "server.mjs"]
