/**
 * next/server stub for printWebhookResolveRace.test.mjs: plain-Node
 * ESM loading of Next's bundled server entry yields undefined
 * constructors in this repo's local node_modules, so the test process
 * substitutes the two framework primitives the routes use.
 * NextRequest is a Request (the routes only read headers/json);
 * NextResponse.json mirrors the real helper's status/body contract
 * (tests assert on .status and .json()). No route logic lives here.
 */
export class NextRequest extends Request {
  constructor(input, init) {
    super(input, init);
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
