import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");

test("exposes authenticated encrypted personal-note CRUD for the Prism panel", () => {
  assert.match(server, /route\("GET", "\/api\/prism\/notes"/u);
  assert.match(server, /route\("POST", "\/api\/prism\/notes"/u);
  assert.match(server, /route\("PUT", "\/api\/prism\/notes\/:id"/u);
  assert.match(server, /route\("DELETE", "\/api\/prism\/notes\/:id"/u);
  assert.match(
    server,
    /listUserNotes\(db, userId, decryptUserKey\(userId\), 100\)/u,
  );
  assert.match(server, /saveUserNote\(db, userId, decryptUserKey\(userId\)/u);
  assert.match(server, /deleteUserNote\(db, userId, \{ id: ctx\.params\.id \}\)/u);
  assert.doesNotMatch(
    server,
    /function userNoteForClient[\s\S]{0,280}userId:/u,
  );
});
