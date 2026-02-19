declare module "drizzle-orm/pg-core/index.js" {
  export const boolean: (...args: unknown[]) => any;
  export const date: (...args: unknown[]) => any;
  export const decimal: (...args: unknown[]) => any;
  export const index: (...args: unknown[]) => any;
  export const integer: (...args: unknown[]) => any;
  export const jsonb: (...args: unknown[]) => any;
  export const pgTable: (...args: unknown[]) => any;
  export const text: (...args: unknown[]) => any;
  export const timestamp: (...args: unknown[]) => any;
  export const uniqueIndex: (...args: unknown[]) => any;
  export const varchar: (...args: unknown[]) => any;
}

declare module "drizzle-orm/postgres-js/index.js" {
  export const drizzle: (...args: unknown[]) => any;
}
