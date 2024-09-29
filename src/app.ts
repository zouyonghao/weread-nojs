import { ConfigService } from './config/config.service';
import Fastify from 'fastify';
import getConfig from './config/main';
import { puppeteer } from './puppeteer';
import { Page } from 'puppeteer';

class App {
  config: ConfigService;
  constructor() {
    this.config = getConfig();
  }
  async listen() {

    const browser = await puppeteer.launch({
      headless: false,
      args: [`--no-sandbox`, `--window-size=700,900`],
      // set height and width
      defaultViewport: null,
      userDataDir: './user_data', // to save cookies
    });

    let page = await browser.newPage();
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

    // go to the shelf page
    fastify.get('/', async (_request, reply) => {
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
    fastify.get('/refresh', async (_request, reply) => {
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
    fastify.get('/close', async (_request, reply) => {
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
        err && console.log(err);
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
