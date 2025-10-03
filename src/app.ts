import { ConfigService } from './config/config.service';
import Fastify from 'fastify';
import getConfig from './config/main';
import { puppeteer } from './puppeteer';
import { Page } from 'puppeteer';
import crypto from 'crypto';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import { FastifyRequest, FastifyReply } from 'fastify';

class App {
  config: ConfigService;
  passwordHash: string | null = null;
  constructor() {
    this.config = getConfig();
  }
  async listen() {
    console.log('Starting browser launch...');

    const browser = await puppeteer.launch({
      headless: false,
      args: [`--no-sandbox`, `--window-size=700,900`, `--disable-dev-shm-usage`, `--disable-gpu`, `--no-first-run`, `--disable-extensions`],
      // set height and width
      defaultViewport: null,
      userDataDir: './user_data', // to save cookies
    });

    console.log('Browser launched successfully');

    let page = await browser.newPage();
    console.log('New page created');

    // set Kindle user agent
    page.setUserAgent("Mozilla/5.0 (X11; U; Linux armv7l like Android; en-us) AppleWebKit/531.2+ (KHTML, like Gecko) Version/5.0 Safari/533.2+ Kindle/3.0+");
    // page.setBypassCSP(true);

    // const cookie_string = this.config.cookie;
    // const cookies = cookie_string.split(";").map((cookie) => {
    //   const [name, value] = cookie.split("=");
    //   return { name: name.trim(), value: value.trim(), domain: "weread.qq.com" };
    // });
    // cookies.forEach(async (cookie) => {
    //   await page.setCookie(cookie);
    // }
    // );

    const fastify = Fastify({
      logger: {
        transport: {
          target: '@fastify/one-line-logger',
        },
      },
      trustProxy: this.config.reverse_proxy,
      connectionTimeout: this.config.timeout,
    });

    await fastify.register(cookie);
    await fastify.register(formbody);

    // Auth check function
    const checkAuth = async (request: FastifyRequest, reply: FastifyReply) => {
      const authCookie = request.cookies.auth;
      if (!authCookie || authCookie !== 'authenticated') {
        return reply.redirect('/login');
      }
    };

    // Login route
    fastify.get('/login', async (request, reply) => {
      const authCookie = request.cookies.auth;
      if (authCookie === 'authenticated') {
        return reply.redirect('/');
      }

      let form = '';
      if (this.passwordHash === null) {
        // Set password form
        form = `
          <h2>Set Password</h2>
          <form method="POST" action="/login">
            <input type="password" name="password" placeholder="Enter password" required>
            <input type="hidden" name="action" value="set">
            <button type="submit">Set Password</button>
          </form>
        `;
      } else {
        // Login form
        form = `
          <h2>Login</h2>
          <form method="POST" action="/login">
            <input type="password" name="password" placeholder="Enter password" required>
            <input type="hidden" name="action" value="login">
            <button type="submit">Login</button>
          </form>
        `;
      }

      reply.type('text/html');
      return `
        <html>
        <body>
          ${form}
        </body>
        </html>
      `;
    });

    fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
      const { password, action } = request.body as { password: string; action: string };

      if (action === 'set' && this.passwordHash === null) {
        this.passwordHash = crypto.createHash('sha256').update(password).digest('hex');
        reply.setCookie('auth', 'authenticated', { path: '/', httpOnly: true });
        return reply.redirect('/');
      } else if (action === 'login' && this.passwordHash) {
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        if (hash === this.passwordHash) {
          reply.setCookie('auth', 'authenticated', { path: '/', httpOnly: true });
          return reply.redirect('/');
        } else {
          return reply.send('Invalid password');
        }
      }
      return reply.send('Invalid action');
    });

    // go to the shelf page
    fastify.get('/', { preHandler: checkAuth }, async (_request, reply) => {
      if (page.isClosed()) {
        page = await browser.newPage();
        page.setUserAgent("Mozilla/5.0 (X11; U; Linux armv7l like Android; en-us) AppleWebKit/531.2+ (KHTML, like Gecko) Version/5.0 Safari/533.2+ Kindle/3.0+");
      }

      const shelf = "https://weread.qq.com/wrwebsimplenjlogic/shelf";
      await page.goto(shelf);
      try {
        await page.waitForNetworkIdle({
          timeout: this.config.wait_for_page_load_timeout,
          idleTime: 500,
        });
      } catch {
        reply.header('x-message', 'Page load timeout');
      }
      page.evaluate(() => {
        // delete style for id shelfToolBar
        const shelfToolBar = document.getElementById('shelfToolBar');
        shelfToolBar?.removeAttribute('style');
      }
      );
      let data = `<html>`;
      data += `<body>`;
      data += `<img src="data:image/png;base64,${await page.screenshot({ encoding: 'base64' })}" style="width:100%" />`;
      data += "<br/>";
      // four columns and four rows table, generate a list of links for each book
      for (let i = 1; i <= 16; i++) {
        data += `<a href="/book?id=${i}" style="float:left; margin-left: 10px; font-size: 30px;">Book ${i}</a>`;
      }
      data += `</body></html>`;
      reply.type('text/html');
      return data;
    }
    );

    // select a book in the shelf
    fastify.get<{ Querystring: { id: string } }>(
      '/book',
      {
        preHandler: checkAuth,
        schema: {
          querystring: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
            required: ['id'],
          },
        },
      },
      async (request, reply) => {
        // #shelfTable > tbody > tr:nth-child(id/4 + 1) > td.col id%4 - 1 > div
        page.click(`#shelfTable > tbody > tr:nth-child(${Math.floor(parseInt(request.query.id) / 4) + 1}) > td.col${parseInt(request.query.id) % 4 - 1} > div`);

        try {
          await page.waitForNetworkIdle({
            timeout: this.config.wait_for_page_load_timeout,
            idleTime: 1000,
          });
        } catch {
          reply.header('x-message', 'Page load timeout');
        }

        const data = await this.screenshotAndAddLinksForBook(page);

        reply.type('text/html');
        return data;
      }
    );

    // prev/next on page
    fastify.get<{ Querystring: { action: string } }>(
      '/click',
      {
        preHandler: checkAuth,
        schema: {
          querystring: {
            type: 'object',
            properties: {
              action: { type: 'string' },
            },
            required: ['action'],
          },
        },
      },
      async (request, reply) => {
        const action = request.query.action;
        console.log(action);
        if (action == 'prev') {
          // click id readerToolBar_prevPage
          await page.click('#readerToolBar_prevPage');
        }
        if (action == 'next') {
          // click id readerToolBar_nextPage
          await page.click('#readerToolBar_nextPage');
        }

        try {
          await page.waitForNetworkIdle({
            timeout: this.config.wait_for_page_load_timeout,
            idleTime: 500,
          });
        } catch {
          reply.header('x-message', 'Page load timeout');
        }
        const data = await this.screenshotAndAddLinksForBook(page);

        reply.type('text/html');

        return data;
      }
    );

    // refresh page
    fastify.get('/refresh', { preHandler: checkAuth }, async (_request, reply) => {
      await page.reload();
      try {
        await page.waitForNetworkIdle({
          timeout: this.config.wait_for_page_load_timeout,
          idleTime: 500,
        });
      } catch {
        reply.header('x-message', 'Page load timeout');
      }
      const data = await this.screenshotAndAddLinksForBook(page);

      reply.type('text/html');

      return data;
    });

    // close page
    fastify.get('/close', { preHandler: checkAuth }, async (_request, reply) => {
      await page.close();
      reply.type('text/html');
      let data = `<html><body>`
      data += `<h1>Page closed</h1>`;
      // reopen the shelf
      data += `<a href="/" style="float:left; margin-left: 10px; font-size: 30px;">Shelf</a>`;
      data += `</body></html>`;
      return data;
    });

    fastify.listen(
      { host: this.config.host, port: this.config.port },
      (err) => {
        if (err) {
          console.log(err);
        } else {
          console.log('Server listening on port', this.config.port);
        }
      }
    );
  }

  async screenshotAndAddLinksForBook(page: Page) {
    page.evaluate(() => {
      // delete style for id readerToolBar
      const readerToolBar = document.getElementById('readerToolBar');
      readerToolBar?.removeAttribute('style');
    }
    );
    let data = `<html>`;
    data += `<body>`;
    data += `<img src="data:image/png;base64,${await page.screenshot({ encoding: 'base64' })}" style="width:100%" />`;
    // set a click url
    data += "<br/>";
    // go to the shelf page
    data += `<a href="/" style="float:left; margin-left: 10px; font-size: 30px;">Shelf</a>`;
    // refresh
    data += `<a href="/refresh" style="float:left; margin-left: 10px; font-size: 30px;"/>Refresh</a>`;
    // close
    data += `<a href="/close" style="float:left; margin-left: 10px; font-size: 30px;"/>Close</a>`;

    // next page
    data += `<a href="/click?action=next" style="float:right; margin-right: 10px; font-size: 30px;">Next Page</a>`;
    // prev page
    data += `<a href="/click?action=prev" style="float:right; margin-right: 10px; font-size: 30px;">`;
    data += `Prev Page</a>`;
    data += `</body></html>`;
    return data;
  }
}

const app = new App();
app.listen();
