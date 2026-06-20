# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# Use a clean, reproducible install when a lockfile is present.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build && test -f dist/index.html

# Serve stage.
# Use the unprivileged nginx image: it runs as a non-root user (uid 101) out of
# the box, listens on 8080 by default, ships no top-level `user` directive (so no
# "user directive ignored" warning), and writes its cache/pid under paths the
# non-root user owns. This is what makes the pod start cleanly under a non-root
# Kubernetes securityContext — the stock `nginx` image's entrypoint and
# /var/cache, /var/run, and :80 bind all assume root.
FROM nginxinc/nginx-unprivileged:1.27-alpine
# Drop back to root only to copy files, then the image's default USER (101)
# takes over for runtime.
USER root
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Validate the nginx config at build time so a broken config fails the build
# rather than silently producing a container that exits on startup.
RUN nginx -t
USER 101
# Serve on 8080 so the container can run as a non-root user without the
# NET_BIND_SERVICE capability (see nginx.conf `listen 8080`).
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
