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
COPY --from=backend-build /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=backend-build /app/node_modules/@prisma /app/node_modules/@prisma
COPY --from=backend-build /app/node_modules/bcryptjs /app/node_modules/bcryptjs
COPY --from=backend-build /app/node_modules/cookie-parser /app/node_modules/cookie-parser
COPY --from=backend-build /app/node_modules/cors /app/node_modules/cors
COPY --from=backend-build /app/node_modules/dotenv /app/node_modules/dotenv
COPY --from=backend-build /app/node_modules/express /app/node_modules/express
COPY --from=backend-build /app/node_modules/express-rate-limit /app/node_modules/express-rate-limit
COPY --from=backend-build /app/node_modules/helmet /app/node_modules/helmet
COPY --from=backend-build /app/node_modules/jsonwebtoken /app/node_modules/jsonwebtoken
COPY --from=backend-build /app/node_modules/node-cron /app/node_modules/node-cron
COPY --from=backend-build /app/node_modules/openai /app/node_modules/openai
COPY --from=backend-build /app/node_modules/pino /app/node_modules/pino
COPY --from=backend-build /app/node_modules/pino-http /app/node_modules/pino-http
COPY --from=backend-build /app/node_modules/yahoo-finance2 /app/node_modules/yahoo-finance2
COPY --from=backend-build /app/node_modules/zod /app/node_modules/zod
USER stocksense
EXPOSE 4000
CMD ["node", "backend/dist/index.js"]
