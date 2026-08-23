const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'",
  "Permissions-Policy": "microphone=(self), camera=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function cacheControl(pathname) {
  if (/^\/(audio|images|assets)\//.test(pathname)) {
    return "public, max-age=31536000, immutable";
  }
  return "no-cache";
}

function publicHeaders(headers, pathname) {
  const result = new Headers(headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    result.set(name, value);
  }
  result.set("Cache-Control", cacheControl(pathname));
  return result;
}

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: publicHeaders(response.headers, new URL(request.url).pathname),
    });
  },
};
