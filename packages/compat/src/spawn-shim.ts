import {
	spawn as nodeSpawn,
	spawnSync as nodeSpawnSync,
} from "node:child_process";
import { Readable, Writable } from "node:stream";

function wrapStream(stream: any): any {
	if (!stream) return stream;
	
	const readAll = async () => {
		const reader = stream.getReader();
		const chunks: Uint8Array[] = [];
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) chunks.push(value);
		}
		const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
		const combined = new Uint8Array(totalLength);
		let offset = 0;
		for (const chunk of chunks) {
			combined.set(chunk, offset);
			offset += chunk.length;
		}
		return combined;
	};

	stream.arrayBuffer = async () => {
		const bytes = await readAll();
		return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
	};
	stream.text = async () => {
		const bytes = await readAll();
		return new TextDecoder().decode(bytes);
	};
	stream.json = async () => {
		const text = await stream.text();
		return JSON.parse(text);
	};
	return stream;
}

export function spawn(cmd: string[], options: any = {}) {
	const stdio: any[] = [
		options.stdin === "pipe" ? "pipe" : "ignore",
		"pipe",
		"pipe",
	];

	const proc = nodeSpawn(cmd[0], cmd.slice(1), {
		env: options.env,
		cwd: options.cwd,
		stdio,
	});

	const stdoutStream = proc.stdout ? (Readable.toWeb(proc.stdout) as any) : null;
	const stderrStream = proc.stderr ? (Readable.toWeb(proc.stderr) as any) : null;

	return {
		pid: proc.pid,
		get exitCode() {
			return proc.exitCode;
		},
		get killed() {
			return proc.killed;
		},
		kill(signal?: number | string) {
			proc.kill(signal as any);
		},
		stdout: wrapStream(stdoutStream),
		stderr: wrapStream(stderrStream),
		stdin: proc.stdin ? (Writable.toWeb(proc.stdin) as any) : null,
		exited: new Promise<number>((resolve) => {
			if (proc.exitCode !== null) {
				resolve(proc.exitCode);
			} else {
				proc.on("exit", (code) => {
					resolve(code ?? 0);
				});
			}
		}),
	};
}

export function spawnSync(cmd: string[], options: any = {}) {
	const res = nodeSpawnSync(cmd[0], cmd.slice(1), {
		env: options.env,
		cwd: options.cwd,
		input: options.stdin,
	});

	return {
		pid: res.pid,
		exitCode: res.status,
		stdout: res.stdout,
		stderr: res.stderr,
		success: res.status === 0,
	};
}
