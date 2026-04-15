FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

RUN mkdir -p data/media/images data/media/videos

EXPOSE 3800

CMD ["node", "server.js"]
