const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:5000',
      changeOrigin: true,
      // Rewrite cookie domain so the browser accepts them
      cookieDomainRewrite: { '*': 'localhost' },
      onProxyRes(proxyRes) {
        // Strip the Secure flag from cookies in development so they work over HTTP
        const setCookie = proxyRes.headers['set-cookie'];
        if (setCookie) {
          proxyRes.headers['set-cookie'] = setCookie.map((c) =>
            c.replace(/;\s*Secure/gi, '')
          );
        }
      },
    })
  );
};
