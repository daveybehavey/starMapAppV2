import { NextRequest, NextResponse } from 'next/server';

// Inject a conversion-focused internal link into HTML responses for blog posts.
// This middleware targets common blog path prefixes and inserts a link
// before the closing </body> tag so that blog pages include a visible
// navigation path to the high-conversion page /star-map-generator.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only act on likely blog post pages. Adjust prefixes if your site uses a different path.
  const isBlogPath =
    pathname.startsWith('/blog') || pathname.startsWith('/posts') || pathname.startsWith('/articles');

  if (!isBlogPath) {
    return NextResponse.next();
  }

  // Fetch the original response for this request.
  // We forward the original headers so that SSR/rendering behaves the same.
  const originalRes = await fetch(req.url, {
    headers: req.headers as unknown as Record<string, string>,
    method: req.method,
  });

  const contentType = originalRes.headers.get('content-type') || '';
  // Only modify HTML responses.
  if (!contentType.includes('text/html')) {
    return originalRes;
  }

  const originalText = await originalRes.text();

  // The conversion-focused link to inject.
  const injectedLink = `
    <div class="injected-conversion-link" style="padding:12px 0; text-align:center;">
      <a href="/star-map-generator" rel="noopener" style="display:inline-block;padding:10px 16px;background:#0b74de;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
        Try the Star Map Generator
      </a>
    </div>
  `;

  let modified = originalText;

  if (originalText.includes('</body>')) {
    // Insert link just before </body>
    modified = originalText.replace('</body>', `${injectedLink}</body>`);
  } else if (originalText.includes('</html>')) {
    // Fallback: insert before </html>
    modified = originalText.replace('</html>', `${injectedLink}</html>`);
  } else {
    // As a last resort, append
    modified = originalText + injectedLink;
  }

  // Return the modified HTML. Keep status code from original response.
  const res = new NextResponse(modified, {
    status: originalRes.status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  });

  return res;
