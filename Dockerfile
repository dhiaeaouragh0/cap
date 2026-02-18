FROM node:20-alpine

# App directory inside container
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies (nodemon included)
RUN npm install

# Copy source code
COPY . .

# Expose backend port
EXPOSE 5000

ENV CHOKIDAR_USEPOLLING=true

# Start backend
CMD ["npm", "run", "dev"]
