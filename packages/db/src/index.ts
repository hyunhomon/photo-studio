import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export { sql } from "drizzle-orm";

export const createDb = (binding: D1Database) => drizzle(binding, { schema });
