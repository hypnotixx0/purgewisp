export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Handle proxy requests
    if (url.pathname.startsWith('/proxy/')) {
      const targetUrl = decodeURIComponent(url.pathname.slice(7));
      
      try {
        return await handleProxyRequest(request, targetUrl);
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
        </style>
      </head>
      <body>
        <h1>🚀 /Purge Full Web Proxy</h1>
        <div class="info">
          <p><strong>Full Web Proxy is running!</strong></p>
          <p>Use: <code>/proxy/URL</code> to access websites</p>
        </div>
      </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

async function handleProxyRequest(request, targetUrl) {
  const parsedUrl = new URL(targetUrl);
  
  // Better headers to avoid Cloudflare blocking
  const headers = new Headers({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity', // Don't accept compressed content for easier processing
    'Cache-Control': 'no-cache',
    'DNT': '1',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1'
  });

  // Add host header to avoid Cloudflare direct IP block
  headers.set('Host', parsedUrl.hostname);

  // Copy referer if present
  const referer = request.headers.get('Referer');
  if (referer) {
    headers.set('Referer', referer);
  }

  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: headers,
    body: request.body,
    redirect: 'manual' // Handle redirects manually
  });

  let response = await fetch(proxyRequest);
  
  // Handle redirects manually
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('Location');
    if (location) {
      const redirectUrl = new URL(location, targetUrl).toString();
      return handleProxyRequest(request, redirectUrl);
    }
  }

  const contentType = response.headers.get('content-type') || '';

  // Rewrite content based on type
  if (contentType.includes('text/html')) {
    let html = await response.text();
    html = rewriteAllUrls(html, targetUrl);
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

function rewriteAllUrls(content, baseUrl) {
  const base = new URL(baseUrl);
  const proxyBase = 'https://purgewisp.joshaburrjr.workers.dev/proxy/';
  
  // More comprehensive URL rewriting
  return content
    // Standard URLs in quotes
    .replace(/(href|src|action|data|cite|background|poster|srcset|data-src|data-href)=["']([^"']+)["']/gi, 
      (match, attr, url) => {
        if (shouldSkipUrl(url)) return match;
        const fullUrl = resolveUrl(url, base);
        return `${attr}="${proxyBase}${encodeURIComponent(fullUrl)}"`;
      })
    
    // CSS url() functions
    .replace(/url\(['"]?([^'")]+)['"]?\)/gi, (match, url) => {
      if (shouldSkipUrl(url)) return match;
      const fullUrl = resolveUrl(url, base);
      return `url("${proxyBase}${encodeURIComponent(fullUrl)}")`;
    })
    
    // JavaScript strings (basic)
    .replace(/(['"])(https?:\/\/[^'"]+)\1/gi, (match, quote, url) => {
      if (shouldSkipUrl(url)) return match;
      return `${quote}${proxyBase}${encodeURIComponent(url)}${quote}`;
    })
    
    // Meta refresh
    .replace(/(content|http-equiv)=["']([^"']*;\s*url=([^"']+))["']/gi, (match, attr, content, url) => {
      if (shouldSkipUrl(url)) return match;
      const fullUrl = resolveUrl(url, base);
      return `${attr}="${content.replace(url, proxyBase + encodeURIComponent(fullUrl))}"`;
    });
}

function rewriteCssUrls(css, baseUrl) {
  const base = new URL(baseUrl);
  const proxyBase = 'https://purgewisp.joshaburrjr.workers.dev/proxy/';
  
  return css.replace(/url\(['"]?([^'")]+)['"]?\)/gi, (match, url) => {
    if (shouldSkipUrl(url)) return match;
    const fullUrl = resolveUrl(url, base);
    return `url("${proxyBase}${encodeURIComponent(fullUrl)}")`;
  });
}

function rewriteJsUrls(js, baseUrl) {
  const base = new URL(baseUrl);
  const proxyBase = 'https://purgewisp.joshaburrjr.workers.dev/proxy/';
  
  // More comprehensive JS URL rewriting
  return js
    .replace(/(['"])(https?:\/\/[^'"]+)\1/gi, (match, quote, url) => {
      if (shouldSkipUrl(url)) return match;
      return `${quote}${proxyBase}${encodeURIComponent(url)}${quote}`;
    })
    .replace(/(['"])(\/\/[^'"]+)\1/gi, (match, quote, url) => {
      if (shouldSkipUrl(url)) return match;
      const fullUrl = `https:${url}`;
      return `${quote}${proxyBase}${encodeURIComponent(fullUrl)}${quote}`;
    });
}

function shouldSkipUrl(url) {
  return url.startsWith('javascript:') || 
         url.startsWith('mailto:') || 
         url.startsWith('tel:') || 
         url.startsWith('#') ||
         url.startsWith('data:') ||
         url.includes('purgewisp.joshaburrjr.workers.dev');
}

function resolveUrl(url, base) {
  if (!url || url.trim() === '') return base.toString();
  
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  } else if (url.startsWith('//')) {
    return `https:${url}`;
  } else if (url.startsWith('/')) {
    return `${base.origin}${url}`;
  } else {
    return new URL(url, base).toString();
  }
}
