import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = readFileSync(join(root, "src/app/(app)/tasks/tasks-client.tsx"), "utf8");

test("creating a follow-up surfaces API failures instead of clearing busy silently", () => {
  const createFn = client.slice(client.indexOf("async function createTask"), client.indexOf("return (", client.indexOf("async function createTask")));
  assert.match(createFn, /setCreateError\(""\)/);
  assert.match(createFn, /catch \(err\) \{/);
  assert.match(createFn, /setCreateError\(\s*err instanceof ApiHttpError && err\.status < 500\s*\? err\.message\s*:\s*"Could not confirm whether the task was created\. Your draft is still here\. Check the task list before trying again\."\s*\)/);
  assert.match(createFn, /finally \{\s*setBusy\(false\);/);
  assert.match(client, /\{createError \? <p role="alert"/);
  assert.doesNotMatch(createFn, /router\.refresh\(\);\s*\} finally/);
});

// Execute the real component and its event handlers with an in-memory hook
// store. No browser, database, provider, or additional test dependency needed.
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(client, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
const tick = () => new Promise((resolve) => setImmediate(resolve));

function formHarness(overrides = {}) {
  const state = [];
  let cursor = 0;
  let tree;
  let refreshes = 0;
  let response = () => Promise.resolve({ id: "created-task" });
  const requests = [];
  class ApiHttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  const module = { exports: {} };
  runInNewContext(compiled, {
    exports: module.exports,
    Error,
    require(name) {
      if (name === "react") return {
        useState(initial) {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [state[index], (value) => { state[index] = value; }];
        },
        useMemo: (fn) => fn()
      };
      if (name === "next/navigation") return { useRouter: () => ({ refresh() { refreshes++; } }) };
      if (name === "@/lib/api") return {
        ApiHttpError,
        apiFetch(path, init) { requests.push({ path, ...init }); return response(); }
      };
      if (name === "@storyboard/ui") return { SurfaceCard: "section", EmptyState: "aside" };
      if (name === "@storyboard/shared") return { describeTaskDueDate: () => null };
      if (name === "./my-tasks") return { MyTasks: "aside" };
      return require(name);
    }
  });
  const props = {
    initialTasks: [], opportunities: [{ id: "opportunity-1", title: "Summer show" }],
    members: [{ id: "member-1", name: "Sam", active: true }],
    artistId: "artist-1", currentOperatorId: null, canManage: true, ...overrides
  };
  function render() { cursor = 0; tree = module.exports.TasksClient(props); }
  function nodes(node = tree) {
    if (Array.isArray(node)) return node.flatMap((child) => nodes(child));
    if (!node || typeof node !== "object") return [];
    return [node, ...nodes(node.props?.children ?? null)];
  }
  function text(node) {
    if (Array.isArray(node)) return node.map(text).join("");
    return node && typeof node === "object" ? text(node.props?.children) : String(node ?? "");
  }
  function field(label) {
    const wrapper = nodes().find((node) => node.type === "label" && text(node).startsWith(label));
    return nodes(wrapper).find((node) => node.type === "input" || node.type === "select");
  }
  render();
  return {
    ApiHttpError, requests,
    get refreshes() { return refreshes; },
    get alert() { return nodes().filter((node) => node.props?.role === "alert").map(text).join(" "); },
    get busy() { return nodes().find((node) => node.props?.type === "submit").props.disabled; },
    value(label) { return field(label).props.value; },
    fill(label, value) { field(label).props.onChange({ target: { value } }); render(); },
    respond(fn) { response = fn; },
    async submit() {
      nodes().find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
      await tick();
      render();
    },
    async settle() { await tick(); render(); }
  };
}

const draft = { Title: "  Confirm soundcheck  ", "Due date": "2030-06-15", Owner: "member-1", Opportunity: "opportunity-1" };
function fillDraft(form) {
  for (const [label, value] of Object.entries(draft)) form.fill(label, value);
}
function assertDraft(form) {
  for (const [label, value] of Object.entries(draft)) assert.equal(form.value(label), value, label);
}

for (const status of [400, 403, 500]) {
  test(`HTTP ${status} shows an alert, retains every field, and releases submission`, async () => {
    const form = formHarness();
    fillDraft(form);
    form.respond(() => Promise.reject(new form.ApiHttpError(status, "Task request rejected")));
    await form.submit();
    assert.ok(form.alert);
    if (status < 500) assert.match(form.alert, /Task request rejected/);
    else assert.match(form.alert, /Could not confirm whether the task was created/);
    assertDraft(form);
    assert.equal(form.busy, false);
    assert.equal(form.refreshes, 0);
    await form.settle();
    assert.equal(form.requests.length, 1, "failures are never automatically retried");
  });
}

for (const failure of [new TypeError("Failed to fetch"), new SyntaxError("Invalid JSON"), "unknown rejection"]) {
  test(`uncertain outcome (${String(failure)}) keeps the draft and explains checking before retry`, async () => {
    const form = formHarness();
    fillDraft(form);
    form.respond(() => Promise.reject(failure));
    await form.submit();
    assert.match(form.alert, /Could not confirm whether the task was created/);
    assert.match(form.alert, /Check the task list before trying again/);
    assertDraft(form);
    assert.equal(form.refreshes, 0);
    assert.equal(form.busy, false);
    await form.settle();
    assert.equal(form.requests.length, 1);
  });
}

test("whitespace-only title is rejected locally without losing the due date", async () => {
  const form = formHarness();
  fillDraft(form);
  form.fill("Title", "   ");
  await form.submit();
  assert.match(form.alert, /Enter a task title/);
  assert.equal(form.requests.length, 0);
  assert.equal(form.value("Title"), "   ");
  assert.equal(form.value("Due date"), draft["Due date"]);
  assert.equal(form.busy, false);
  assert.equal(form.refreshes, 0);
});

test("explicit retry clears the error, keeps the draft while pending, and resets only on success", async () => {
  const form = formHarness();
  fillDraft(form);
  form.respond(() => Promise.reject(new form.ApiHttpError(400, "Task request rejected")));
  await form.submit();
  assert.ok(form.alert);
  let resolve;
  form.respond(() => new Promise((done) => { resolve = done; }));
  await form.submit();
  assert.equal(form.alert, "");
  assert.equal(form.busy, true);
  assertDraft(form);
  assert.equal(form.refreshes, 0);
  assert.equal(form.requests[1].path, "/tasks");
  assert.equal(form.requests[1].method, "POST");
  assert.equal(form.requests[1].artistId, "artist-1");
  assert.deepEqual(JSON.parse(JSON.stringify(form.requests[1].json)), {
    title: "Confirm soundcheck", dueAt: "2030-06-15", bandMemberId: "member-1", opportunityId: "opportunity-1"
  });
  await form.submit();
  assert.equal(form.requests.length, 2, "pending submission cannot send another request");
  resolve({ id: "created-task" });
  await form.settle();
  for (const label of Object.keys(draft)) assert.equal(form.value(label), "");
  assert.equal(form.refreshes, 1);
  assert.equal(form.busy, false);
  assert.equal(form.alert, "");
});

for (const props of [{ canManage: false }, { artistId: null }]) {
  test(`creation stays guarded with ${JSON.stringify(props)}`, async () => {
    const form = formHarness(props);
    fillDraft(form);
    await form.submit();
    assert.equal(form.requests.length, 0);
    assertDraft(form);
  });
}
