import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { Database, Statement } from "../lib/repository.ts";
// Real SQLite executes the same prepared SQL used by D1; no network or production identity.
export function testDatabase(): Database & {
  raw: DatabaseSync;
  close: () => void;
} {
  const db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(
      new URL("../drizzle/0000_ordinary_zeigeist.sql", import.meta.url),
      "utf8",
    ),
  );
  function prepare(sql: string): Statement {
    let args: unknown[] = [];
    const s: Statement = {
      bind(...values) {
        args = values;
        return s;
      },
      async first<T>() {
        return (db.prepare(sql).get(...(args as never[])) || null) as T | null;
      },
      async all<T>() {
        return { results: db.prepare(sql).all(...(args as never[])) as T[] };
      },
      async run() {
        const r = db.prepare(sql).run(...(args as never[]));
        return { meta: { changes: Number(r.changes) } };
      },
    };
    return s;
  }
  return {
    raw: db,
    prepare,
    async batch(statements) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = [];
        for (const s of statements) result.push(await s.run());
        db.exec("COMMIT");
        return result;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    close: () => db.close(),
  };
}
