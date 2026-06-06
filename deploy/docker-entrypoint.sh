#!/bin/sh
set -e

node /app/api-proxy-server.mjs &
API_PROXY_SERVER_PID=$!
NGINX_ENTRYPOINT_PID=

cleanup() {
    if [ -n "$NGINX_ENTRYPOINT_PID" ]; then
        kill "$NGINX_ENTRYPOINT_PID" 2>/dev/null || true
        wait "$NGINX_ENTRYPOINT_PID" 2>/dev/null || true
    fi
    kill "$API_PROXY_SERVER_PID" 2>/dev/null || true
    wait "$API_PROXY_SERVER_PID" 2>/dev/null || true
}

terminate() {
    cleanup
    exit 143
}

trap terminate INT TERM
trap cleanup EXIT

/docker-entrypoint.sh "$@" &
NGINX_ENTRYPOINT_PID=$!

STATUS=0
wait "$NGINX_ENTRYPOINT_PID" || STATUS=$?
cleanup
exit "$STATUS"
