const req = new Request("http://localhost/", {
  headers: { "Authorization": "Bearer token" }
});

try {
  const originalGet = req.headers.get;
  req.headers.get = function(name) {
    console.log("Custom get called for name:", name);
    return originalGet.call(this, name);
  };
  console.log("Header authorization:", req.headers.get("authorization"));
} catch (e) {
  console.error("Failed to override:", e);
}
