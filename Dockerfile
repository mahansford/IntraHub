FROM node:20-alpine

WORKDIR /app

COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev

COPY server ./server
COPY public ./public
COPY config ./config

ENV PORT=8080
EXPOSE 8080

WORKDIR /app/server
CMD ["node", "index.js"]
