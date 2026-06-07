import v8 from "node:v8";

export function callerSourceOrigin(): string {
	return "unknown";
}

export function deserialize(value: any): any {
	return v8.deserialize(value);
}

export function drainMicrotasks(): void {
	// no-op on Node.js
}

export function edenGC(): number {
	if (typeof (globalThis as any).gc === "function") {
		(globalThis as any).gc();
	}
	return 0;
}

export function fullGC(): number {
	if (typeof (globalThis as any).gc === "function") {
		(globalThis as any).gc();
	}
	return 0;
}

export function gcAndSweep(): void {
	if (typeof (globalThis as any).gc === "function") {
		(globalThis as any).gc();
	}
}

export function estimateShallowMemoryUsageOf(value: any): number {
	return 0;
}

export function getProtectedObjects(): any[] {
	return [];
}

export function getRandomSeed(): number {
	return Math.floor(Math.random() * 1000000);
}

export function heapSize(): number {
	return v8.getHeapStatistics().used_heap_size;
}

export function heapStats(): any {
	return v8.getHeapStatistics();
}

export function isRope(input: any): boolean {
	return false;
}

export function jscDescribe(value: any): string {
	return typeof value;
}

export function jscDescribeArray(args: any): string {
	return "Array";
}

export function memoryUsage(): any {
	return process.memoryUsage();
}

export function serialize(value: any): Buffer {
	return v8.serialize(value);
}

export function stats(): any {
	return {
		objectCount: 0,
		...v8.getHeapStatistics()
	};
}

export function numberOfLinkedCodeBlocks(): number {
	return 0;
}

export function constructorName(value: any): string {
	if (value === null) return "Null";
	if (value === undefined) return "Undefined";
	return value.constructor?.name || typeof value;
}

export function writeHeapSnapshot(filename?: string): string {
	return v8.writeHeapSnapshot(filename);
}


