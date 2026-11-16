FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production TZ=America/Bogota
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server/index.js"]
