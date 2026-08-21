const root = `${import.meta.dir}/dist`;
const port = Number(Bun.env.PORT ?? 8080);

const server = Bun.serve({
	port,
	async fetch(request) {
		const url = new URL(request.url);
		const relativePath = url.pathname === "/" ? "/index.html" : url.pathname;
		const file = Bun.file(`${root}${relativePath}`);
		if (!(await file.exists()))
			return new Response("Not found", { status: 404 });
		return new Response(file, {
			headers: {
				"Cross-Origin-Opener-Policy": "same-origin",
				"Cross-Origin-Embedder-Policy": "require-corp",
			},
		});
	},
});

console.log(`Core manual test: http://localhost:${server.port}`);
