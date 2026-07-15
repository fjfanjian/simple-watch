ARG APP_IMAGE
FROM ${APP_IMAGE}

COPY apps/worker/src/sftp-scanner.ts /opt/simplewatch/apps/worker/src/sftp-scanner.ts
COPY apps/worker/src/process-media.ts /opt/simplewatch/apps/worker/src/process-media.ts
COPY apps/worker/src/main.ts /opt/simplewatch/apps/worker/src/main.ts
COPY apps/api/src/services/media-service.ts /opt/simplewatch/apps/api/src/services/media-service.ts
