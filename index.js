export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Handle proxy requests
    if (url.pathname.startsWith('/proxy/')) {
      const targetUrl = decodeURIComponent(url.pathname.slice(7));
      
      try {
        const parsedUrl = new URL(targetUrl);
        return await handleProxyRequest(request, targetUrl, parsedUrl);
      } catch (error) {
        return new Response(`Error: ${error.message}`, { 
          status: 400,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    }

    // Handle root request
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>/Purge Wisp Proxy</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #8B5CF6; }
          .info { background: #f5f5f5; padding: 15px; border-radius: 5px; }
          .tip { background: #e8f4fd; padding: 10px; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <h1>🚀 /Purge Full Web Proxy</h1>
        <div class="info">
          <p><strong>Full Web Proxy is running!</strong></p>
          <p>This proxy rewrites HTML, CSS, and JavaScript to fix all asset links</p>
          <p>Use: <code>/proxy/URL</code> to access websites</p>
          <p>Example: <code>https://purge-proxy.joshaburrjr.workers.dev/proxy/https://orteil.dashnet.org/cookieclicker/</code></p>
        </div>
        <div class="tip">
          <p><strong>Features:</strong></p>
          <ul>
            <li>✅ Rewrites HTML URLs</li>
            <li>✅ Handles JavaScript and CSS</li>
            <li>✅ Processes images and assets</li>
            <li>✅ Fixes relative paths</li>
          </ul>
        </div>
      </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

async function handleProxyRequest(request, targetUrl, parsedUrl) {
  const headers = new Headers({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'DNT': '1',
    'Upgrade-Insecure-Requests': '1'
  });

  // Copy referer if present
  const referer = request.headers.get('Referer');
  if (referer) headers.set('Referer', referer);

  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: headers,
    body: request.body,
    redirect: 'follow'
  });

  let response = await fetch(proxyRequest);
  const contentType = response.headers.get('content-type') || '';

  // Rewrite content based on type
  if (contentType.includes('text/html')) {
    let html = await response.text();
    html = rewriteHtmlUrls(html, targetUrl);
    response = new Response(html, response);
    response.headers.set('Content-Type', 'text/html');
    
  } else if (contentType.includes('text/css')) {
    let css = await response.text();
    css = rewriteCssUrls(css, targetUrl);
    response = new Response(css, response);
    response.headers.set('Content-Type', 'text/css');
    
  } else if (contentType.includes('javascript') || contentType.includes('application/javascript')) {
    let js = await response.text();
    js = rewriteJsUrls(js, targetUrl);
    response = new Response(js, response);
    response.headers.set('Content-Type', 'application/javascript');
  }

  // Add CORS headers
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', '*');
  response.headers.set('X-Proxy-Server', '/Purge Full Proxy');
  
  // Remove security headers that block embedding
  response.headers.delete('Content-Security-Policy');
  response.headers.delete('X-Frame-Options');
  response.headers.delete('X-Content-Type-Options');
  
  return response;
}

function rewriteHtmlUrls(html, baseUrl) {
  const base = new URL(baseUrl);
  const proxyBase = 'https://purge-proxy.joshaburrjr.workers.dev/proxy/';
  
  return html
    // href attributes
    .replace(/href="([^"]*)"/gi, (match, url) => {
      if (url.startsWith('javascript:') || url.startsWith('mailto:') || url.startsWith('#')) {
        return match;
      }
      const fullUrl = resolveUrl(url, base);
      return `href="${proxyBase}${encodeURIComponent(fullUrl)}"`;
    })
    // src attributes
    .replace(/src="([^"]*)"/gi, (match, url) => {
      const fullUrl = resolveUrl(url, base);
      return `src="${proxyBase}${encodeURIComponent(fullUrl)}"`;
    })
    // action attributes (forms)
    .replace(/action="([^"]*)"/gi, (match, url) => {
      const fullUrl = resolveUrl(url, base);
      return `action="${proxyBase}${encodeURIComponent(fullUrl)}"`;
    })
    // CSS url() functions in style attributes
    .replace(/style="([^"]*)"/gi, (match, style) => {
      const newStyle = style.replace(/url\(['"]?([^'")]*)['"]?\)/gi, (urlMatch, url) => {
        const fullUrl = resolveUrl(url, base);
        return `url("${proxyBase}${encodeURIComponent(fullUrl)}")`;
      });
      return `style="${newStyle}"`;
    })
    // srcset attributes
    .replace(/srcset="([^"]*)"/gi, (match, srcset) => {
      const newSrcset = srcset.split(',').map(part => {
        const [url, descriptor] = part.trim().split(/\s+/);
        if (url) {
          const fullUrl = resolveUrl(url, base);
          return `${proxyBase}${encodeURIComponent(fullUrl)}${descriptor ? ' ' + descriptor : ''}`;
        }
        return part;
      }).join(', ');
      return `srcset="${newSrcset}"`;
    })
    // meta refresh URLs
    .replace(/content="(\d+);\s*url=([^"]*)"/gi, (match, delay, url) => {
      const fullUrl = resolveUrl(url, base);
      return `content="${delay}; url=${proxyBase}${encodeURIComponent(fullUrl)}"`;
    })
    // link[rel="icon"] etc.
    .replace(/<link[^>]*href="([^"]*)"[^>]*>/gi, (match, url) => {
      const fullUrl = resolveUrl(url, base);
      return match.replace(`href="${url}"`, `href="${proxyBase}${encodeURIComponent(fullUrl)}"`);
    });
}

function rewriteCssUrls(css, baseUrl) {
  const base = new URL(baseUrl);
  const proxyBase = 'https://purge-proxy.joshaburrjr.workers.dev/proxy/';
  
  return css.replace(/url\(['"]?([^'")]*)['"]?\)/gi, (match, url) => {
    if (url.startsWith('data:')) return match;
    const fullUrl = resolveUrl(url, base);
    return `url("${proxyBase}${encodeURIComponent(fullUrl)}")`;
  });
}

function rewriteJsUrls(js, baseUrl) {
  const base = new URL(baseUrl);
  const proxyBase = 'https://purge-proxy.joshaburrjr.workers.dev/proxy/';
  
  // Basic URL rewriting in JavaScript (this is simplified)
  return js.replace(/['"](https?:\/\/[^'"]*)['"]/g, (match, url) => {
    if (url.includes('purge-proxy.joshaburrjr.workers.dev')) return match;
    return `"${proxyBase}${encodeURIComponent(url)}"`;
  });
}

function resolveUrl(url, base) {
  if (!url || url.trim() === '') return base.toString();
  
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
    return new URL(url, base).toString();
  } else if (url.startsWith('/')) {
    return `${base.origin}${url}`;
  } else {
    return new URL(url, base).toString();
  }
}
