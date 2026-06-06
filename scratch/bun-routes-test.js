const server = Bun.serve({
  port: 9876,
  routes: {
    "/test": {
      GET: () => new Response("GET ok"),
      POST: () => new Response("POST ok"),
    },
    "/test-simple": () => new Response("SIMPLE ok"),
  },
  fetch(req) {
    return new Response("fallback: " + req.method + " " + new URL(req.url).pathname);
  }
});

console.log("Server listening...");

// Test with fetch
const getRes = await fetch("http://127.0.0.1:9876/test");
console.log("GET /test:", await getRes.text());

const postRes = await fetch("http://127.0.0.1:9876/test", { method: "POST" });
console.log("POST /test:", await postRes.text());

const simpleRes = await fetch("http://127.0.0.1:9876/test-simple", { method: "POST" });
console.log("POST /test-simple:", await simpleRes.text());

server.stop();
