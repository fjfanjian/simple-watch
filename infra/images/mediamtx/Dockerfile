FROM scratch
ARG MEDIAMTX_ARCHIVE_SHA256
LABEL org.opencontainers.image.title="MediaMTX" \
      org.opencontainers.image.version="1.18.2" \
      org.opencontainers.image.source="https://github.com/bluenviron/mediamtx" \
      org.opencontainers.image.revision.sha256="${MEDIAMTX_ARCHIVE_SHA256}"
COPY .server/vendor/mediamtx /mediamtx
ENTRYPOINT ["/mediamtx"]
