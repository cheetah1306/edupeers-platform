# Use Node.js LTS as the base image
FROM node:18-slim

# Set working directory to /app
WORKDIR /app

# Copy the entire project into the container
COPY . .

# Move into the backend folder and install dependencies
WORKDIR /app/backend
RUN npm install --production

# Expose the port the app runs on
EXPOSE 4000

# Start the server
CMD ["node", "server.js"]
