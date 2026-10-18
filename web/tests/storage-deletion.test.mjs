import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveStorageDeletions } from "../src/domain.ts";

const source = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const functions = source
  .slice(
    source.indexOf("  async function deletePermanently("),
    source.indexOf("  const isTrashView ="),
  )
  .replace("(id: string)", "(id)")
  .replace("(p): p is string =>", "(p) =>");

function fixture(mode) {
  if (globalThis.__storageClearedIds) {
    globalThis.__storageClearedIds.clear();
  }
  const row = {
    id: "r1",
    audio_path: "owner/sample.m4a",
    deleted_at: "2026-10-17T00:00:00Z",
    purging_at: null,
  };
  let ui = [{ ...row }],
    dbCalls = 0,
    storageCalls = 0,
    audioExists = true;
  const errors = [];
  const supabase = {
    storage: {
      from: () => ({
        remove: async () => {
          storageCalls++;
          if (mode === "empty") return { data: [], error: null };
          audioExists = false;
          return {
            data: mode === "retry" && storageCalls > 1
              ? []
              : [{ name: "sample.m4a" }],
            error: null,
          };
        },
      }),
    },
    from: () => ({
      update: (patch) => {
        let matched = true;
        const q = {
          eq: (col, val) => {
            if (row[col] !== val) matched = false;
            return q;
          },
          in: (col, vals) => {
            if (!vals.includes(row[col])) matched = false;
            return q;
          },
          not: (col, op, val) => {
            if (op === "is" && val === null && row[col] === null) matched = false;
            return q;
          },
          is: (col, val) => {
            if (row[col] !== val) matched = false;
            return q;
          },
          select: async () => {
            if (mode === "restore") {
              row.deleted_at = null;
              matched = false;
            }
            if (matched) {
              Object.assign(row, patch);
              return { data: [row], error: null };
            }
            return { data: [], error: null };
          },
        };
        return q;
      },
      delete: () => {
        dbCalls++;
        const q = {
          eq: () => q,
          in: () => q,
          not: () => q,
          select: async () => ({
            error: mode === "retry" && dbCalls === 1
              ? new Error("DB unavailable")
              : null,
            data: row.deleted_at ? [row] : [],
          }),
        };
        return q;
      },
    }),
  };
  const run = new Function(
    "supabase",
    "window",
    "t",
    "records",
    "selected",
    "setRecords",
    "setSelected",
    "setError",
    "load",
    "resolveStorageDeletions",
    functions + ";return {deletePermanently,emptyTrash};",
  );
  const ops = run(
    supabase,
    { confirm: () => true },
    {
      confirm_delete: "delete?",
      confirm_empty_trash: () => "empty?",
      save_error: "failed",
    },
    ui,
    "r1",
    (f) => {
      ui = f(ui);
    },
    () => {},
    (e) => errors.push(e),
    async () => {
      ui = [{ ...row }];
    },
    resolveStorageDeletions,
  );
  return {
    ...ops,
    row,
    get dbCalls() {
      return dbCalls;
    },
    get ui() {
      return ui;
    },
    get audioExists() {
      return audioExists;
    },
    errors,
  };
}

test("single: empty Storage result must not authorize DB deletion", async () => {
  const f = fixture("empty");
  await f.deletePermanently("r1");
  assert.equal(f.dbCalls, 0);
});

test("bulk: retry after Storage success and DB failure must retry DB completion", async () => {
  const f = fixture("retry");
  await f.emptyTrash();
  globalThis.__storageClearedIds = undefined;
  await f.emptyTrash();
  assert.equal(f.dbCalls, 2);
});

test("restore racing Storage deletion: zero-row DB result must not report UI success", async () => {
  const f = fixture("restore");
  await f.deletePermanently("r1");
  assert.equal(f.row.deleted_at, null);
  assert.equal(f.ui.length, 1);
  assert.ok(f.row.deleted_at !== null || f.audioExists);
});
