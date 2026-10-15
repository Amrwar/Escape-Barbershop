const http = require("http");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

/**
 * The app reads the web app's own translations (../messages) and the few rules
 * written to be shared (../src/lib, plain functions only) rather than keeping
 * copies that would drift. Metro only sees files under the project by default,
 * so those folders are added to what it watches.
 */
const config = getDefaultConfig(__dirname);
config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.resolve(__dirname, "../messages"),
  path.resolve(__dirname, "../src/lib"),
];

/**
 * Development only: with DEV_API_PROXY set (say, http://localhost:3100), the dev
 * server passes /api/* through to that web app. The browser preview then calls
 * its own origin, so the API needs no CORS rules for a page that only exists
 * while somebody is developing. A phone never comes through here.
 */
const target = process.env.DEV_API_PROXY;
if (target) {
  const upstream = new URL(target);
  config.server = {
    ...config.server,
    enhanceMiddleware: (middleware) => (req, res, next) => {
      if (!req.url.startsWith("/api/")) return middleware(req, res, next);
      const proxied = http.request(
        {
          hostname: upstream.hostname,
          port: upstream.port,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: upstream.host },
        },
        (answer) => {
          res.writeHead(answer.statusCode ?? 502, answer.headers);
          answer.pipe(res);
        }
      );
      proxied.on("error", () => {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Nothing answering at ${target}` }));
      });
      req.pipe(proxied);
    },
  };
}

module.exports = config;
