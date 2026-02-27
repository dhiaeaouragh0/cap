FROM node:20-alpine

# App directory inside container
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose backend port
EXPOSE 5000

# Optional: fix file watching issues
ENV CHOKIDAR_USEPOLLING=true

# Start backend with node (production)
CMD ["node", "src/server.js"]