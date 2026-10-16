/**
 * Node ESM resolve hook: append .ts/.tsx for extensionless relative imports
 * so unit tests can load src/*.ts modules that use bundler-style paths.
 */
export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.[cm]?[jt]sx?$/.test(specifier)
  ) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      return nextResolve(`${specifier}.tsx`, context);
    }
  }
  return nextResolve(specifier, context);
}
