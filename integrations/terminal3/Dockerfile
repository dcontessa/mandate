FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY client.mjs server.mjs ./
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
