# Stage 1: Build the frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the backend and serve
FROM node:20-alpine
WORKDIR /app/backend

# Install backend dependencies
COPY backend/package*.json ./
RUN npm install --production

# Copy backend source
COPY backend/ ./

# Copy the built frontend static files from Stage 1
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "server.js"]