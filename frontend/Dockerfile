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
# Create the writable runtime dir for nginx's pid and temp files, owned by the
# runtime user (uid 101). In Kubernetes this path is overlaid by a writable
# emptyDir; for plain `docker run` it exists and is writable out of the box so
# nginx starts without a mounted volume. The image's default main config points
# `pid` at /tmp/nginx.pid; we relocate it to /tmp/nginx/nginx.pid via the CMD
# `-g` global directive so pid and temp files share one writable mount.
RUN mkdir -p \
      /tmp/nginx \
      /tmp/nginx/client_temp \
      /tmp/nginx/proxy_temp \
      /tmp/nginx/fastcgi_temp \
      /tmp/nginx/uwsgi_temp \
      /tmp/nginx/scgi_temp \
    && chown -R 101:101 /tmp/nginx
USER 101
# Validate the nginx config at build time so a broken config fails the build
# rather than silently producing a container that exits on startup. Run as the
# runtime user (101) with the same pid override used at runtime so the temp/pid
# paths are exercised exactly as in production.
RUN nginx -t -g 'pid /tmp/nginx/nginx.pid;'
# Serve on 8080 so the container can run as a non-root user without the
# NET_BIND_SERVICE capability (see nginx.conf `listen 8080`).
EXPOSE 8080
# Relocate the pid file (main-context directive, so it cannot live in the
# conf.d/default.conf server block) into the writable /tmp/nginx mount.
CMD ["nginx", "-g", "daemon off; pid /tmp/nginx/nginx.pid;"]
