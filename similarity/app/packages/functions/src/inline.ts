/**
 * Rayfin typegen emits bare names for types declared in `.d.ts` files (such as
 * the built `@rayfin-app/shared` contract), which the generated `types.ts`
 * cannot resolve. This mapped type is structurally identical but anonymous, so
 * typegen expands it inline.
 */
export type Inline<T> = { [K in keyof T]: Inline<T[K]> };
