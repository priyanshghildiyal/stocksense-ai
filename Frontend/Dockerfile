FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY Frontend/package.json Frontend/package.json
COPY backend/package.json backend/package.json
RUN npm ci
COPY Frontend ./Frontend
RUN npm run build -w Frontend

FROM nginx:1.27-alpine
COPY Frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/Frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1
