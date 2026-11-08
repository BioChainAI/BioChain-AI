// Module hooks for the unit tests: every Firebase SDK module the app imports
// from the CDN (https://www.gstatic.com/firebasejs/<version>/...) resolves to the
// in-memory stand-in firebase-sdk-stub.mjs, so src/ modules load in Node offline.
const SDK = /^https:\/\/www\.gstatic\.com\/firebasejs\/[0-9.]+\/firebase-[a-z-]+\.js$/;
const STUB = new URL("./firebase-sdk-stub.mjs", import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (SDK.test(specifier)) return { url: STUB, shortCircuit: true };
  return next(specifier, context);
}
