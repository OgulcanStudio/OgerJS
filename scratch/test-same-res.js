const res = new Response("ok", { headers: { "content-type": "text/plain" } });
Bun.serve({
	port: 8089,
	fetch(req) {
		return res;
	}
});
console.log("Server running on port 8089");
