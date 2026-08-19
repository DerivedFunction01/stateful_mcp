import { mkdir, open, rename } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function atomicWriteFile(
	path: string,
	content: string,
): Promise<void> {
	const directory = dirname(path);
	await mkdir(directory, { recursive: true });
	const temporary = join(
		directory,
		`.${path.split("/").at(-1) ?? "history"}.${process.pid}.${Date.now()}.tmp`,
	);
	const handle = await open(temporary, "w");
	try {
		await handle.writeFile(content, "utf8");
		await handle.sync();
	} finally {
		await handle.close();
	}
	await rename(temporary, path);
}
