FROM node:20-alpine
WORKDIR /app
# Bundled CLI (no node_modules needed at runtime).
COPY dist-cli/ ./dist-cli/
ENTRYPOINT ["node", "/app/dist-cli/index.js"]
