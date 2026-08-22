import hljs from "highlight.js/lib/common";

const samples: Record<string, string> = {
	python: "def greet(name):\n    return f'Hi {name}'",
	java: "class Main { public static void main(String[] args) {} }",
	javascript: "const value = items.map(item => item.name);",
	typescript:
		"interface User { name: string } const user: User = { name: 'A' };",
	sql: "SELECT id, name FROM users WHERE active = true;",
	json: '{"name":"Macro","count":42}',
	markdown: "# Title\n\n**content**",
	xml: '<user id="1">Macro</user>',
	css: ".button { color: red; }",
	shell: '#!/bin/sh\necho "hello"',
	yaml: "name: Macro\nactive: true",
};

const found = new Set<string>();
for (const [language, source] of Object.entries(samples)) {
	const result = hljs.highlight(source, { language });
	for (const match of result.value.matchAll(/class="([^"]+)"/g)) {
		for (const token of match[1]?.split(" ") ?? [])
			if (token.startsWith("hljs-")) found.add(token.slice(5));
	}
}
console.log(JSON.stringify([...found].sort(), null, 2));
