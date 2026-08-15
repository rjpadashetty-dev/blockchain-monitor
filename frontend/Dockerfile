# Frontend Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy server file
COPY server.js .
COPY index.html .
COPY package*.json ./

# Install dependencies
RUN npm install

EXPOSE 3000

CMD ["node", "server.js"]
