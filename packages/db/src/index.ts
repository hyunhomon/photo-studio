import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export { sql, eq, and, desc, isNull, gt } from "drizzle-orm";
export * from "./schema";

export const createDb = (binding: D1Database) => drizzle(binding, { schema });
