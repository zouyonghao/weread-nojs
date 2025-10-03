WeRead No-JS Proxy

A proxy service for WeRead that works with browsers without JavaScript support (e.g., DPT-S1).

Features

- Password-based authentication (first user sets the password)
- Puppeteer-powered browser automation
- Docker containerization

Quick Start

Local Development

1. Install dependencies:
   pnpm install

2. Build the project:
   pnpm build

3. Start the server:
   pnpm start

4. Open http://localhost:8080 in your browser.

Docker

Run the pre-built Docker image:

docker run -p 8080:8080 zouyonghao/weread-nojs:latest

Authentication

- On first access, you'll be prompted to set a password
- Subsequent visits require login via the password
- Sessions are maintained with cookies

API Endpoints

- GET / - Main interface
- GET /login - Login page
- POST /login - Authenticate
- GET /book - Book content
- POST /click - Click actions
- POST /refresh - Refresh page
- POST /close - Close browser