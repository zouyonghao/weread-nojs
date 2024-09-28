A weread proxy for browser without JavaScript (e.g. DPT-S1).

Usage:

create .env file with cookie value, e.g.:
COOKIE="..."

pnpm install
pnpm build
pnpm start

Then open http://[hostname]:8080/ in your browser.

If you want to use it in Docker, try following commands:

curl -fsSL https://fnm.vercel.app/install | bash
apt install curl -y
curl -fsSL https://deb.nodesource.com/setup_20.x -o nodesource_setup.sh
bash nodesource_setup.sh
apt install -y sudo gnupg nodejs chromium libgtk-4-1 libnss3 xdg-utils wget libatk1.0-dev libatk-bridge2.0-dev libasound2-dev
npm install -g pnpm

wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
apt update
apt install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 xvfb --no-install-recommends
rm /etc/apt/sources.list.d/google-chrome.list 