service cloudflared start
service dbus start

Xvfb :99 -screen 0 1920x1080x24 > /dev/null 2>&1 &
export DISPLAY=:99
x11vnc -display :99 &

cd /root/weread-nojs

pnpm build > /dev/null 2>&1
pnpm start > /dev/null 2>&1 &

bash