FROM scratch
ARG LIVEKIT_ARCHIVE_SHA256
LABEL org.opencontainers.image.title="LiveKit Server" \
      org.opencontainers.image.version="1.13.1" \
      org.opencontainers.image.source="https://github.com/livekit/livekit" \
      org.opencontainers.image.revision.sha256="${LIVEKIT_ARCHIVE_SHA256}"
COPY .server/vendor/livekit-server /livekit-server
ENTRYPOINT ["/livekit-server"]
