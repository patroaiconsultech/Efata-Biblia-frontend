FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# The browser uses relative /api, so NO API/OIDC secrets or URLs are built in.
ARG VITE_BUILD_SHA=UNPINNED

COPY . .
RUN node ci/validate_railway_build_env.mjs && npm run build

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
