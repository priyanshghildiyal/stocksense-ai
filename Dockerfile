# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY Frontend/package.json Frontend/package.json
RUN npm ci

FROM node:20-alpine AS backend-build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY backend ./backend
RUN npm run prisma:generate -w backend && npm run build -w backend

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S stocksense && adduser -S stocksense -G stocksense
COPY --from=backend-build /app/package.json /app/package-lock.json ./
COPY --from=backend-build /app/backend/package.json /app/backend/package.json
COPY --from=backend-build /app/backend/dist /app/backend/dist
COPY --from=backend-build /app/backend/prisma /app/backend/prisma
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
RUN npm ci --omit=dev --ignore-scripts
COPY --from=backend-build /app/backend/dist /app/backend/dist
COPY --from=backend-build /app/backend/prisma /app/backend/prisma
USER stocksense
EXPOSE 4000
CMD ["node", "backend/dist/index.js"]
