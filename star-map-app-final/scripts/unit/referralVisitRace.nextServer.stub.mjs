/**
 * next/server stub for referralVisitRace.test.mjs: plain-Node ESM
 * loading of Next's bundled server entry yields undefined
 * constructors in this repo's local node_modules, so the test
 * process substitutes the two framework primitives the route uses.
 * NextRequest is a Request plus the cookie jar the route reads
 * (`req.cookies.get`); NextResponse.json mirrors the real helper's
 * status/body contract (tests assert on .status and .json()). No
 * route logic lives here.
 */
export class NextRequest extends Request {
  constructor(input, init) {
    super(input, init);
    const cookieHeader = this.headers.get("cookie") ?? "";
    const jar = new Map();
    for (const part of cookieHeader.split(";")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      jar.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
    }
    this.cookies = {
      get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    };
  }
}

export class NextResponse extends Response {
  static json(body, init = {}) {
    return new NextResponse(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }
}
