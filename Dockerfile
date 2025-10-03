# Use Ubuntu base image for X11 support
FROM ubuntu:22.04

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    software-properties-common \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable xvfb dbus \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files and config
COPY package.json pnpm-lock.yaml .eslintrc.json .prettierrc ./

# Install dependencies
RUN pnpm install

# Install Chrome for Puppeteer (skip download, use system Chrome)
# RUN npx puppeteer browsers install chrome

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Copy env example as .env
COPY .env.example .env

# Build the application
RUN pnpm build

# Expose port
EXPOSE 8080

# Set environment variables
ENV DISPLAY=:99

RUN apt-get update && apt-get install -y fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    && rm -rf /var/lib/apt/lists/*

# Start Xvfb and the application
CMD ["sh", "-c", "Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 & sleep 2 && pnpm start"]