import type { Config } from "drizzle-kit";

const dbType = process.env.DB_TYPE;

const configs: Record<string, Config> = {
  pg: {
    dialect: "postgresql",
    schema: "./tests/schema/pg.ts",
    out: "./tests/migrations/pg/",
  },
  mysql: {
    dialect: "mysql",
    schema: "./tests/schema/mysql.ts",
    out: "./tests/migrations/mysql/",
  },
  sqlite: {
    dialect: "sqlite",
    schema: "./tests/schema/sqlite.ts",
    out: "./tests/migrations/sqlite/",
  },
} as const;

const config = configs[dbType || ""];
if (!config) {
  throw new Error(`Unsupported database type: ${dbType}. Supported types: ${Object.keys(configs).join(", ")}`);
}

export default config;
