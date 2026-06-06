const server = Bun.serve({
  port: 9876,
  routes: {
    "/bench/item/:id": (req) => {
      return new Response("MATCHED " + req.params.id);
    }
  },
  fetch(req) {
    return new Response("fallback: " + new URL(req.url).pathname);
  }
});

const res = await fetch("http://127.0.0.1:9876/bench/item/42");
console.log("Response text:", await res.text());

server.stop();
