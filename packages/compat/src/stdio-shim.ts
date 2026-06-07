import { Readable, Writable } from "node:stream";

function wrapStdin(): ReadableStream {
	return Readable.toWeb(process.stdin) as ReadableStream;
}

function wrapStdout(): WritableStream {
	return Writable.toWeb(process.stdout) as WritableStream;
}

function wrapStderr(): WritableStream {
	return Writable.toWeb(process.stderr) as WritableStream;
}

export const stdin = wrapStdin();
export const stdout = wrapStdout();
export const stderr = wrapStderr();