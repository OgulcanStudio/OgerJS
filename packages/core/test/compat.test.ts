import { afterEach, describe, expect, test } from "bun:test";
import {
	allowsBunOnlyFeature,
	getRuntimeMode,
	isBunOnlyFeature,
	setRuntimeMode,
	warnIfBunOnly,
} from "../src/compat";

describe("compat", () => {
	afterEach(() => setRuntimeMode("default"));

	test("edge mode blocks bun-only features", () => {
		setRuntimeMode("edge");
		expect(isBunOnlyFeature("bun.serve")).toBe(true);
		expect(allowsBunOnlyFeature("bun.serve")).toBe(false);
		expect(allowsBunOnlyFeature("fetch")).toBe(true);
	});

	test("warnIfBunOnly does not throw", () => {
		setRuntimeMode("edge");
		warnIfBunOnly("bun.gzip", "compress plugin");
		expect(getRuntimeMode()).toBe("edge");
	});
});
