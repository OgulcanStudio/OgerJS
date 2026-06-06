const server = Bun.serve({
  port: 9876,
  routes: {
    "/bench/item/:id": (req, arg1) => {
      console.log("Arg 1:", arg1);
      return new Response("ok");
    }
  },
  fetch(req) {
    return new Response("fallback");
  }
});

await fetch("http://127.0.0.1:9876/bench/item/42");
server.stop();
