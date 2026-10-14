# OpenVault frontend image: build the React app, then serve it with nginx.

# ---- Stage 1: build ---------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Stage 2: serve ---------------------------------------------------------
# Only the built static files are copied; Node and node_modules are left behind,
# so the final image is small (~50 MB).
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
