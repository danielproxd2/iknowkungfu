// Minimal test runner with vitest-like failure output; accepts an optional file arg.
import { add } from "./src/calc.mjs";

const failures = [];
if (add(2, 3) !== 5) failures.push(["tests/calc.test.mjs", "expected add(2, 3) to be 5, got " + add(2, 3)]);
if (add(0, 0) !== 0) failures.push(["tests/calc.test.mjs", "expected add(0, 0) to be 0"]);

if (failures.length > 0) {
  for (const [file, msg] of failures) {
    console.log(`FAIL ${file} > add`);
    console.log(`AssertionError: ${msg}`);
  }
  process.exit(1);
}
console.log("2 passed");
