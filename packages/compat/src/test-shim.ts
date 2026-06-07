import { useBunNative } from "./runtime";
import { createRequire } from "node:module";
import { deepEquals } from "./bun-shim";

const requireModule = createRequire(import.meta.url);

let describeFn: any;
let itFn: any;
let testFn: any;
let expectFn: any;
let beforeAllFn: any;
let afterAllFn: any;
let beforeEachFn: any;
let afterEachFn: any;
let beforeFn: any;
let afterFn: any;
let mockFn: any;
let spyOnFn: any;
let jestFn: any;

if (useBunNative()) {
	const bunTest = requireModule("bun:test");
	describeFn = bunTest.describe;
	itFn = bunTest.it;
	testFn = bunTest.test;
	expectFn = bunTest.expect;
	beforeAllFn = bunTest.beforeAll;
	afterAllFn = bunTest.afterAll;
	beforeEachFn = bunTest.beforeEach;
	afterEachFn = bunTest.afterEach;
	beforeFn = bunTest.before;
	afterFn = bunTest.after;
	mockFn = bunTest.mock;
	spyOnFn = bunTest.spyOn;
	jestFn = bunTest.jest;
} else {
	const testRunner = requireModule("node:test");
	const assert = requireModule("node:assert/strict");

	describeFn = testRunner.describe;
	itFn = testRunner.it;
	testFn = testRunner.test;
	beforeAllFn = testRunner.before;
	afterAllFn = testRunner.after;
	beforeFn = testRunner.before;
	afterFn = testRunner.after;
	beforeEachFn = testRunner.beforeEach;
	afterEachFn = testRunner.afterEach;

	class Expectation {
		private _val: any;
		private _isNot: boolean;

		constructor(val: any, isNot = false) {
			this._val = val;
			this._isNot = isNot;
		}

		get not(): Expectation {
			return new Expectation(this._val, !this._isNot);
		}

		private _assert(cond: boolean, message?: string) {
			if (this._isNot) {
				assert.ok(!cond, message || "Expected condition to be false");
			} else {
				assert.ok(cond, message || "Expected condition to be true");
			}
		}

		toBe(expected: any) {
			if (this._isNot) {
				assert.notEqual(this._val, expected);
			} else {
				assert.equal(this._val, expected);
			}
		}

		toEqual(expected: any) {
			const cond = deepEquals(this._val, expected);
			this._assert(cond, `Expected ${JSON.stringify(this._val)} to equal ${JSON.stringify(expected)}`);
		}

		toStrictEqual(expected: any) {
			const cond = deepEquals(this._val, expected);
			this._assert(cond, `Expected ${JSON.stringify(this._val)} to strictly equal ${JSON.stringify(expected)}`);
		}

		toBeNull() {
			this._assert(this._val === null, `Expected ${this._val} to be null`);
		}

		toBeUndefined() {
			this._assert(this._val === undefined, `Expected ${this._val} to be undefined`);
		}

		toBeDefined() {
			this._assert(this._val !== undefined, `Expected ${this._val} to be defined`);
		}

		toBeTruthy() {
			this._assert(!!this._val, `Expected ${this._val} to be truthy`);
		}

		toBeFalsy() {
			this._assert(!this._val, `Expected ${this._val} to be falsy`);
		}

		toBeNaN() {
			this._assert(Number.isNaN(this._val), `Expected ${this._val} to be NaN`);
		}

		toBeCloseTo(expected: number, numDigits = 2) {
			const limit = Math.pow(10, -numDigits) / 2;
			const diff = Math.abs(this._val - expected);
			this._assert(diff < limit, `Expected ${this._val} to be close to ${expected} (within ${numDigits} digits)`);
		}

		toContain(item: any) {
			if (Array.isArray(this._val) || typeof this._val === "string") {
				this._assert(this._val.includes(item), `Expected collection to contain ${item}`);
			} else if (this._val instanceof Set || this._val instanceof Map) {
				this._assert(this._val.has(item), `Expected Set/Map to contain ${item}`);
			} else {
				throw new Error("toContain expects an array, string, Set, or Map");
			}
		}

		toContainEqual(item: any) {
			if (Array.isArray(this._val)) {
				this._assert(this._val.some(x => deepEquals(x, item)));
			} else if (this._val instanceof Set) {
				this._assert([...this._val].some(x => deepEquals(x, item)));
			} else {
				throw new Error("toContainEqual expects an array or Set");
			}
		}

		toThrow(expected?: string | RegExp | Error | Function) {
			if (typeof this._val !== "function") {
				throw new Error("toThrow expects a function to be passed to expect()");
			}
			if (this._isNot) {
				assert.doesNotThrow(this._val);
			} else {
				if (expected) {
					assert.throws(this._val, expected as any);
				} else {
					assert.throws(this._val);
				}
			}
		}

		toThrowError(expected?: string | RegExp | Error | Function) {
			this.toThrow(expected);
		}

		toHaveLength(len: number) {
			this._assert(this._val && typeof this._val.length === "number" && this._val.length === len, `Expected length to be ${len}`);
		}

		toHaveProperty(prop: string, value?: any) {
			const hasProp = this._val !== null && this._val !== undefined && prop in this._val;
			if (value !== undefined) {
				this._assert(hasProp && this._val[prop] === value);
			} else {
				this._assert(hasProp);
			}
		}

		toBeGreaterThan(num: number | bigint) {
			this._assert(this._val > num);
		}

		toBeGreaterThanOrEqual(num: number | bigint) {
			this._assert(this._val >= num);
		}

		toBeLessThan(num: number | bigint) {
			this._assert(this._val < num);
		}

		toBeLessThanOrEqual(num: number | bigint) {
			this._assert(this._val <= num);
		}

		toBeInstanceOf(cls: any) {
			this._assert(this._val instanceof cls);
		}

		toHaveBeenCalled() {
			const calls = this._val?.mock?.calls;
			this._assert(Array.isArray(calls) && calls.length > 0, "Expected mock function to have been called");
		}

		toBeCalled() {
			this.toHaveBeenCalled();
		}

		toHaveBeenCalledTimes(times: number) {
			const calls = this._val?.mock?.calls;
			this._assert(Array.isArray(calls) && calls.length === times, `Expected mock function to have been called ${times} times, but was called ${calls ? calls.length : 0} times`);
		}

		toBeCalledTimes(times: number) {
			this.toHaveBeenCalledTimes(times);
		}

		toHaveBeenCalledWith(...args: any[]) {
			const calls = this._val?.mock?.calls;
			const matched = Array.isArray(calls) && calls.some(c => {
				const callArgs = c.arguments || [];
				if (callArgs.length !== args.length) return false;
				for (let i = 0; i < args.length; i++) {
					if (!deepEquals(callArgs[i], args[i])) return false;
				}
				return true;
			});
			this._assert(matched, "Expected mock function to have been called with " + JSON.stringify(args));
		}

		toBeCalledWith(...args: any[]) {
			this.toHaveBeenCalledWith(...args);
		}
	}

	expectFn = function(val: any) {
		return new Expectation(val);
	};

	expectFn.any = (cls: any) => ({
		$$typeof: Symbol.for("jest.asymmetricMatcher"),
		asymmetricMatch(other: any) {
			if (cls === String) return typeof other === "string";
			if (cls === Number) return typeof other === "number";
			if (cls === Boolean) return typeof other === "boolean";
			if (cls === BigInt) return typeof other === "bigint";
			if (cls === Symbol) return typeof other === "symbol";
			if (cls === Function) return typeof other === "function";
			if (cls === Object) return typeof other === "object" && other !== null;
			return other instanceof cls;
		}
	});

	expectFn.anything = () => ({
		$$typeof: Symbol.for("jest.asymmetricMatcher"),
		asymmetricMatch(other: any) {
			return other !== null && other !== undefined;
		}
	});

	expectFn.objectContaining = (expected: any) => ({
		$$typeof: Symbol.for("jest.asymmetricMatcher"),
		asymmetricMatch(other: any) {
			if (!other || typeof other !== "object") return false;
			for (const key of Object.keys(expected)) {
				if (!(key in other) || !deepEquals(expected[key], other[key])) return false;
			}
			return true;
		}
	});

	expectFn.stringContaining = (expected: string) => ({
		$$typeof: Symbol.for("jest.asymmetricMatcher"),
		asymmetricMatch(other: any) {
			return typeof other === "string" && other.includes(expected);
		}
	});

	expectFn.stringMatching = (expected: string | RegExp) => ({
		$$typeof: Symbol.for("jest.asymmetricMatcher"),
		asymmetricMatch(other: any) {
			if (typeof other !== "string") return false;
			if (expected instanceof RegExp) return expected.test(other);
			return other.includes(expected);
		}
	});

	expectFn.arrayContaining = (expected: any[]) => ({
		$$typeof: Symbol.for("jest.asymmetricMatcher"),
		asymmetricMatch(other: any) {
			if (!Array.isArray(other)) return false;
			return expected.every(item => other.some(x => deepEquals(x, item)));
		}
	});

	mockFn = {
		fn(implementation?: (...args: any[]) => any) {
			return testRunner.mock.fn(implementation);
		},
		module(moduleName: string, factory: () => any) {
			console.warn(`[ogerjs] bun:test mock.module("${moduleName}") is a stub on Node.js`);
			return {
				mock: () => {}
			};
		}
	};

	spyOnFn = function(object: any, method: string) {
		return testRunner.mock.method(object, method as any);
	};

	jestFn = {
		fn(implementation?: (...args: any[]) => any) {
			return testRunner.mock.fn(implementation);
		},
		spyOn(object: any, method: string) {
			return testRunner.mock.method(object, method as any);
		}
	};
}

export {
	describeFn as describe,
	itFn as it,
	testFn as test,
	expectFn as expect,
	beforeAllFn as beforeAll,
	afterAllFn as afterAll,
	beforeEachFn as beforeEach,
	afterEachFn as afterEach,
	beforeFn as before,
	afterFn as after,
	mockFn as mock,
	spyOnFn as spyOn,
	jestFn as jest
};

