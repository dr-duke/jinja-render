# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# Use a clean, reproducible install when a lockfile is present.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build && test -f dist/index.html

# Serve stage
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Validate the nginx config at build time so a broken config fails the build
# rather than silently producing a container that exits on startup.
RUN nginx -t
# Serve on 8080 so the container can run as a non-root user without the
# NET_BIND_SERVICE capability (see nginx.conf `listen 8080`).
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
