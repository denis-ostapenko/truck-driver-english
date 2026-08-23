"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const State = require("../app/state-store.js");
const Core = require("../app/app-core.js");
const Eval = require("../app/learning-evaluator.js");

const NOW = Date.parse("2026-08-21T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = milliseconds => new Date(milliseconds).toISOString();

const DIAGNOSTIC_RECOVERY_TARGETS = Object.freeze([
  ...["lane", "seal", "reweigh", "shoulder", "merge", "oos", "overage", "securement", "clearance", "detour"].map(id => ({ id: `vocabulary-${id}`, category: "vocabulary" })),
  ...["lane", "time", "route", "weight", "duration", "oos-condition", "stop-b", "pressure-a", "pressure-b"].map(id => ({ id: `listening-${id}`, category: "listening" })),
  ...["origin", "cargo", "clarify", "destination", "carrier", "duty"].map(id => ({ id: `elp-${id}`, category: "elp" })),
  ...["oos", "document", "command", "repeat", "paper", "stop"].map(id => ({ id: `inspection-${id}`, category: "inspection" })),
]);
const DIAGNOSTIC_ITEM_INVENTORY = Object.freeze([
  { id: "a-vocabulary-lane", form: "A", category: "vocabulary", recoveryTargetId: "vocabulary-lane", stimulusVersion: "a-vocabulary-lane-v1" },
  { id: "b-vocabulary-detour", form: "B", category: "vocabulary", recoveryTargetId: "vocabulary-detour", stimulusVersion: "b-vocabulary-detour-v1" },
  { id: "a-listening-lane", form: "A", category: "listening", recoveryTargetId: "listening-lane", stimulusVersion: "a-pull-inspection-lane-v1" },
  { id: "b-listening-route", form: "B", category: "listening", recoveryTargetId: "listening-route", stimulusVersion: "b-final-destination-v1" },
  { id: "a-elp-origin", form: "A", category: "elp", recoveryTargetId: "elp-origin", stimulusVersion: "a-elp-origin-v1" },
  { id: "b-elp-destination", form: "B", category: "elp", recoveryTargetId: "elp-destination", stimulusVersion: "b-elp-destination-v1" },
  { id: "a-inspection-oos", form: "A", category: "inspection", recoveryTargetId: "inspection-oos", stimulusVersion: "a-inspection-oos-v1" },
  { id: "b-inspection-repeat", form: "B", category: "inspection", recoveryTargetId: "inspection-repeat", stimulusVersion: "b-inspection-repeat-v1" },
  { id: "a-inspection-insurance", form: "A", category: "inspection", recoveryTargetId: "inspection-document", stimulusVersion: "a-inspection-insurance-v1" },
  { id: "b-inspection-registration", form: "B", category: "inspection", recoveryTargetId: "inspection-document", stimulusVersion: "b-inspection-registration-v1" },
]);
const DIAGNOSTIC_RECOVERY_ALIASES = Object.freeze({
  "a-vocabulary-lane": "vocabulary-lane",
  "b-vocabulary-detour": "vocabulary-detour",
  "vocabulary-lane": "vocabulary-lane",
  "vocabulary-oos": "vocabulary-oos",
  "a-listening-lane": "listening-lane",
  "b-listening-route": "listening-route",
  "listening-lane": "listening-lane",
  "listening-time": "listening-time",
  "a-elp-origin": "elp-origin",
  "b-elp-destination": "elp-destination",
  "elp-origin": "elp-origin",
  "a-inspection-oos": "inspection-oos",
  "b-inspection-repeat": "inspection-repeat",
  "inspection-oos": "inspection-oos",
  "a-inspection-insurance": "inspection-document",
  "b-inspection-registration": "inspection-document",
  "inspection-insurance": "inspection-document",
  "inspection-registration": "inspection-document",
});

const COURSE = {
  contentVersion: 7,
  core: [{ id: "c:make" }, { id: "c:go" }],
  truck: [{ id: "t:brake" }],
  hotshot: [{ id: "h:winch" }],
  inspectionQuestions: [
    { id: "q:stop" },
    { id: "q:unit" },
    { id: "q:origin" },
    { id: "q:destination" },
    { id: "q:cargo" },
    { id: "q:carrier" },
    { id: "q:duty" },
    { id: "q:documents" },
    { id: "q:weight" },
    { id: "q:eld" },
    { id: "q:defect" },
    { id: "q:result" },
    { id: "q:repeat" },
    { id: "q:ninth" },
  ],
  regulatoryScoredQuestions: [{ id: "q:reinspection" }],
  elpStepOneIds: ["q:stop", "q:unit", "q:origin", "q:destination", "q:cargo", "q:carrier", "q:duty"],
  elpStepOneBlueprint: {
    version: "seven-functions-v1",
    requiredResponses: 7,
    functions: [
      { id: "safe-command", questionId: "q:stop" },
      { id: "unit-identification", questionId: "q:unit" },
      { id: "origin", questionId: "q:origin" },
      { id: "destination", questionId: "q:destination" },
      { id: "cargo", questionId: "q:cargo" },
      { id: "carrier", questionId: "q:carrier" },
      { id: "duty-status", questionId: "q:duty" },
    ],
    officialAssessment: false,
  },
  signs: [{ id: "sign:stop" }],
  situations: [{ id: "situation:roadside" }],
  documents: [{ id: "doc:cdl" }],
  lessons: [{ id: "lesson:intro" }],
  diagnosticItemInventory: DIAGNOSTIC_ITEM_INVENTORY,
  diagnosticRecoveryTargets: DIAGNOSTIC_RECOVERY_TARGETS,
  diagnosticRecoveryAliases: DIAGNOSTIC_RECOVERY_ALIASES,
  idMigrations: {
    version: 1,
    migrations: {
      "truck-001": { id: "t:brake", targetCollection: "truck" },
      "truck-brake-old": { id: "t:brake", targetCollection: "words" },
      "sign-action-old": { id: "sign:stop", sourceCollection: "words", targetCollection: "signs" },
      "question-01": { id: "q:stop", targetCollection: "questions" },
      "sign-01": { id: "sign:stop", targetCollection: "signs" },
      "situation-01": { id: "situation:roadside", targetCollection: "situations" },
      "doc-01": { id: "doc:cdl", targetCollection: "documents" },
      "lesson-01": { id: "lesson:intro", targetCollection: "lessons" },
    },
  },
};

function storeWith(storage = new State.MemoryStorage(), clock = () => NOW) {
  return State.createStateStore({
    storage,
    courseData: COURSE,
    storageKey: "test-state",
    now: clock,
  });
}

function legacyState(extra = {}) {
  return {
    version: 2,
    updatedAt: iso(NOW - DAY),
    ...extra,
  };
}

function demonstrated({
  at,
  outcome = "success",
  independent = outcome === "success",
  mode = "typed-retrieval",
  variant = "variant-a",
  evaluator = "exact",
  response = "answer",
  responseHash = "",
  grade = null,
} = {}) {
  return {
    at,
    outcome,
    independent,
    support: "none",
    mode,
    variant,
    kind: "demonstrated",
    objective: true,
    blind: true,
    productive: true,
    preReveal: true,
    evaluator,
    responseMode: "typed",
    response,
    responseHash,
    grade,
    legacy: false,
  };
}

function gateResult(index, extra = {}) {
  return {
    pass: true,
    evaluator: "semantic-slots",
    feedback: "Correct task-specific slots.",
    responseHash: `response-hash-${String(index).padStart(3, "0")}`,
    variant: `gate-variant-${index}`,
    typed: true,
    preReveal: true,
    blind: true,
    productive: true,
    stimulusExposed: true,
    at: iso(NOW - 10_000 + index),
    ...extra,
  };
}

function evidenceHeavyFixture(itemCount) {
  const course = {
    ...COURSE,
    core: Array.from({ length: itemCount }, (_, index) => ({ id: `heavy:${index}` })),
    truck: [],
    hotshot: [],
  };
  let record = null;
  for (let index = 0; index < 20; index += 1) {
    record = State.recordEvidence(record, demonstrated({
      at: iso(NOW - (20 - index) * 1_000),
      outcome: "failed",
      independent: false,
      variant: `heavy-variant-${index}`,
      response: String(index).padEnd(400, "x"),
    }), { now: NOW }).record;
  }
  const state = State.createDefaultState(course, { now: NOW });
  state.profile = "tractor";
  state.onboardingComplete = true;
  for (const item of course.core) state.words[item.id] = record;
  return { course, state };
}

const SIX_BUCKET_ITEMS = Object.freeze([
  ["words", "c:make"],
  ["questions", "q:stop"],
  ["signs", "sign:stop"],
  ["situations", "situation:roadside"],
  ["documents", "doc:cdl"],
  ["lessons", "lesson:intro"],
]);

function stateWithSixMastered(store, firstAt = NOW - 3 * DAY, secondAt = NOW - 2 * DAY) {
  let state = store.defaultState();
  for (const [bucket, id] of SIX_BUCKET_ITEMS) {
    state = store.recordAttempt(state, bucket, id, demonstrated({
      at: iso(firstAt),
      variant: `${bucket}-import-a`,
    })).state;
    state = store.recordAttempt(state, bucket, id, demonstrated({
      at: iso(secondAt),
      variant: `${bucket}-import-b`,
    })).state;
  }
  return state;
}

function qualificationFields(state) {
  return {
    profile: state.profile,
    contextKey: State.qualificationContextKey(state.profile, state.applicability),
  };
}

function elpQualificationFields(state, sessionDate = "2026-08-21") {
  return {
    ...qualificationFields(state),
    sessionDate,
  };
}

function verifiedDiagnostic(completedAt = iso(NOW - DAY), binding = {}) {
  const categories = ["vocabulary", "listening", "elp", "inspection"];
  const formVersion = "cycle3-12x4-v1";
  return {
    completedAt,
    ...binding,
    verified: true,
    selfScored: false,
    form: "A",
    formVersion,
    blueprint: Object.fromEntries(categories.map(category => [category, 3])),
    scores: Object.fromEntries(categories.map(category => [category, 100])),
    weakest: "vocabulary",
    recommendation: "Начните со смешанного маршрута: повторение, профессиональная фраза и одна рабочая ситуация.",
    items: categories.flatMap(category => Array.from({ length: 3 }, (_, index) => ({
      itemId: `a-${category}-${index + 1}`,
      category,
      form: "A",
      formVersion,
      stimulusVersion: `a-${category}-${index + 1}@1`,
      response: `response ${category} ${index + 1}`,
      responseHash: `hash-${category}-${index + 1}`,
      score: 1,
      evaluator: "choice-key",
      scoreEvidence: { pass: true, score: 1, matched: [category], missing: [] },
      stimulusExposed: true,
    }))),
  };
}

test("exports a CommonJS API and creates a complete v5 state", () => {
  assert.equal(State.STATE_VERSION, 5);
  assert.equal(typeof State.createStateStore, "function");
  assert.equal(typeof State.recordEvidence, "function");
  assert.equal(typeof State.isMastered, "function");
  const state = storeWith().defaultState();
  assert.equal(state.version, 5);
  assert.equal(state.contentVersion, 7);
  assert.equal(Object.getPrototypeOf(state.words), null);
  assert.deepEqual(state.dailyAttempts, []);
  assert.equal(state.elpGate, null);
  assert.equal(state.elpStepTwo, null);
  assert.equal(state.diagnosticFormCursor, 0);
  assert.equal(State.INITIAL_SESSION_ORDINAL, 1);
  assert.equal(state.sessionOrdinal, 1);
  assert.equal(state.importTrust, null);
  assert.deepEqual(state.applicability.equipment, { airBrakes: false, dryVan: false, loadBars: false });
  assert.equal(Object.values(state.applicability.conditions).every(value => value === false), true);
});

test("UMD build exposes the same API in a browser-like global", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/state-store.js"), "utf8");
  const context = vm.createContext({});
  vm.runInContext(source, context);
  assert.equal(typeof context.TruckDriverStateStore.createStateStore, "function");
  assert.equal(typeof context.TruckDriverStateStore.recordEvidence, "function");
  assert.equal(context.TruckDriverStateStore.STATE_VERSION, 5);
});

test("normalization removes stored diagnostic XSS paths", () => {
  const payload = legacyState({
    profile: "<img src=x onerror=alert(1)>",
    words: {
      "c:make": { completedAt: iso(NOW - DAY) },
    },
    diagnostic: {
      completedAt: iso(NOW - DAY),
      scores: {
        vocabulary: "<img src=x onerror=alert(1)>",
        listening: 87,
        "<svg onload=alert(1)>": 100,
      },
      weakest: "<script>alert(1)</script>",
      recommendation: "<img src=x onerror=alert(1)>",
    },
  });
  const prepared = storeWith().prepareImport(JSON.stringify(payload));
  assert.equal(prepared.ok, true);
  assert.equal(prepared.candidate.state.diagnostic, null);
  assert.equal(prepared.candidate.state.importTrust.history.diagnostic.scores.vocabulary, 0);
  assert.equal(prepared.candidate.state.importTrust.history.diagnostic.scores.listening, 87);
  assert.equal(prepared.candidate.state.importTrust.history.diagnostic.weakest, "mixed");
  assert.match(prepared.candidate.state.importTrust.history.diagnostic.recommendation, /смешанного маршрута/i);
  assert.equal(prepared.candidate.state.profile, null);
  assert.deepEqual(Object.keys(prepared.candidate.state.words), ["c:make"]);
  const serialized = JSON.stringify(prepared.candidate.state);
  assert.doesNotMatch(serialized, /onerror|<script|<svg/i);
});

test("diagnostic recommendation is derived from bounded scores", () => {
  const strong = State.normalizeState(legacyState({
    diagnostic: {
      completedAt: iso(NOW - DAY),
      scores: { vocabulary: 100, listening: 75, elp: 100, inspection: 100 },
      weakest: "vocabulary",
      recommendation: "untrusted recommendation",
    },
  }), COURSE, { now: NOW });
  assert.equal(strong.ok, true);
  assert.equal(strong.state.diagnostic.weakest, "listening");
  assert.match(strong.state.diagnostic.recommendation, /смешанного маршрута/i);

  const weak = State.normalizeState(legacyState({
    diagnostic: {
      completedAt: iso(NOW - DAY),
      scores: { vocabulary: 80, listening: 30, elp: 60, inspection: 70 },
      weakest: "inspection",
      recommendation: "untrusted recommendation",
    },
  }), COURSE, { now: NOW });
  assert.equal(weak.ok, true);
  assert.equal(weak.state.diagnostic.weakest, "listening");
  assert.match(weak.state.diagnostic.recommendation, /доступных записей/i);
});

test("trusted local diagnostic stores exactly 12 bounded item-level evidence records", () => {
  const storage = new State.MemoryStorage();
  const store = storeWith(storage);
  const state = store.defaultState();
  state.profile = "tractor";
  state.diagnostic = verifiedDiagnostic(iso(NOW - DAY), qualificationFields(state));
  const saved = store.save(state);
  assert.equal(saved.ok, true);
  assert.equal(saved.state.diagnostic.verified, true);
  assert.equal(saved.state.diagnostic.selfScored, false);
  assert.equal(saved.state.diagnostic.items.length, 12);
  assert.deepEqual({ ...saved.state.diagnostic.blueprint }, { vocabulary: 3, listening: 3, elp: 3, inspection: 3 });
  assert.equal(saved.state.diagnostic.items.every(item => item.formVersion === "cycle3-12x4-v1"), true);
  assert.equal(store.load().state.diagnostic.items.length, 12);

  const fractional = JSON.parse(JSON.stringify(state));
  fractional.diagnostic.items[0].score = 0.5;
  fractional.diagnostic.items[0].scoreEvidence = { pass: false, score: 0.5, matched: [], missing: ["lane"] };
  fractional.diagnostic.scores.vocabulary = 83;
  fractional.diagnostic.weakest = "vocabulary";
  fractional.diagnostic.recommendation = "Начните со смешанного маршрута: повторение, профессиональная фраза и одна рабочая ситуация.";
  const fractionalSaved = store.save(fractional);
  assert.equal(fractionalSaved.ok, true, fractionalSaved.error);
  assert.equal(fractionalSaved.state.diagnostic.items[0].score, 0.5);

  const oversizedResponse = JSON.parse(JSON.stringify(state));
  oversizedResponse.diagnostic.items[0].response = "x".repeat(401);
  assert.equal(store.save(oversizedResponse).ok, false);

  const incomplete = JSON.parse(JSON.stringify(state));
  incomplete.diagnostic.items.pop();
  assert.equal(store.save(incomplete).ok, false);

  const unexposed = JSON.parse(JSON.stringify(state));
  unexposed.diagnostic.items[0].stimulusExposed = false;
  assert.equal(store.save(unexposed).ok, false);

  const inconsistentScore = JSON.parse(JSON.stringify(state));
  inconsistentScore.diagnostic.scores.vocabulary = 0;
  assert.equal(store.save(inconsistentScore).ok, false);
});

test("null and malformed nested records fall back without throwing", () => {
  const result = State.normalizeState({
    version: 3,
    words: null,
    questions: [],
    signs: { "sign:stop": null },
    situations: "bad",
    documents: { "doc:cdl": [] },
    lessons: 7,
    questionAttempts: { "q:stop": null },
    errorJournal: [null, [], { type: "word", id: "__proto__", text: "bad" }],
    diagnostic: { completedAt: iso(NOW - DAY), scores: [] },
    branchingProgress: [],
    elpGate: [],
    dailyAttempts: {},
    dailyPlan: "bad",
    profile: 3,
    onboardingComplete: true,
  }, COURSE, { now: NOW });
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.state.words), []);
  assert.deepEqual(Object.keys(result.state.signs), []);
  assert.deepEqual(result.state.errorJournal, []);
  assert.deepEqual(result.state.dailyAttempts, []);
  assert.equal(result.state.elpGate, null);
  assert.equal(result.state.dailyPlan, null);
  assert.equal(result.state.profile, "both");
  assert.ok(result.issues.length >= 8);
});

test("corrupt main recovers from backup without overwriting the good backup", () => {
  const backupRaw = JSON.stringify(legacyState({
    words: { "truck-001": { completedAt: iso(NOW - 2 * DAY) } },
  }));
  const storage = new State.MemoryStorage({
    "test-state": "{broken",
    "test-state-backup": backupRaw,
  });
  const loaded = storeWith(storage).load();
  assert.equal(loaded.source, "backup");
  assert.equal(loaded.recovered, true);
  assert.ok(loaded.state.words["t:brake"]);
  assert.equal(storage.getItem("test-state-backup"), backupRaw);
  assert.equal(JSON.parse(storage.getItem("test-state")).version, 5);
  const quarantine = JSON.parse(storage.getItem("test-state-quarantine"));
  assert.equal(quarantine.entries.at(-1).source, "main");
});

test("parseable malformed main and nested evidence cannot replace a good backup", () => {
  for (const mutation of [
    current => { current.words = null; },
    current => { current.words["c:make"].evidence.push({}); },
  ]) {
    const backupState = storeWith().defaultState();
    backupState.words["c:make"] = State.recordEvidence(null, {
      at: iso(NOW - 2 * DAY), outcome: "success", independent: true, support: "none", mode: "retrieval",
    }, { now: NOW }).record;
    backupState.updatedAt = iso(NOW - DAY);
    const badMain = JSON.parse(JSON.stringify(backupState));
    badMain.updatedAt = iso(NOW - 1000);
    mutation(badMain);
    const backupRaw = JSON.stringify(backupState);
    const storage = new State.MemoryStorage({
      "test-state": JSON.stringify(badMain),
      "test-state-backup": backupRaw,
    });
    const store = storeWith(storage);
    const loaded = store.load();
    assert.equal(loaded.source, "backup");
    assert.ok(loaded.state.words["c:make"]);
    assert.equal(storage.getItem("test-state-backup"), backupRaw);
    assert.equal(store.save(loaded.state).ok, true);
    assert.ok(JSON.parse(storage.getItem("test-state-backup")).words["c:make"]);
    assert.equal(JSON.parse(storage.getItem("test-state-quarantine")).entries.at(-1).source, "main");
  }
});

test("explicit malformed legacy fields lose to a healthy current backup", () => {
  const backupState = storeWith().defaultState();
  backupState.words["c:make"] = State.recordEvidence(null, {
    at: iso(NOW - 2 * DAY), outcome: "success", independent: true, support: "none", mode: "retrieval",
  }, { now: NOW }).record;
  backupState.updatedAt = iso(NOW - DAY);
  const storage = new State.MemoryStorage({
    "test-state": JSON.stringify({ version: 2, updatedAt: iso(NOW - 1000), words: null }),
    "test-state-backup": JSON.stringify(backupState),
  });
  const loaded = storeWith(storage).load();
  assert.equal(loaded.source, "backup");
  assert.ok(loaded.state.words["c:make"]);
});

test("malformed legacy nested state never wins recovery or import", () => {
  const malformed = [
    { questionAttempts: { "q:stop": { independent: "bad" } } },
    { errorJournal: [{ type: "word", id: "unknown", text: "lost", reason: "bad" }] },
    { dailyAttempts: [{}] },
    { dailyPlan: { date: "bad", profile: "tractor", refresh: 0, coreIds: [], dueIds: [], truckIds: [], hotshotIds: [], signIds: [] } },
  ];
  for (const fields of malformed) {
    const backupState = storeWith().defaultState();
    backupState.words["c:make"] = State.recordEvidence(null, {
      at: iso(NOW - 2 * DAY), outcome: "success", independent: true, support: "none", mode: "retrieval",
    }, { now: NOW }).record;
    backupState.updatedAt = iso(NOW - DAY);
    const badLegacy = { version: 2, updatedAt: iso(NOW - 1000), ...fields };
    const storage = new State.MemoryStorage({
      "test-state": JSON.stringify(badLegacy),
      "test-state-backup": JSON.stringify(backupState),
    });
    const store = storeWith(storage);
    const loaded = store.load();
    assert.equal(loaded.source, "backup");
    assert.ok(loaded.state.words["c:make"]);
    const before = storage.snapshot();
    assert.equal(store.prepareImport(JSON.stringify(badLegacy)).ok, false);
    assert.deepEqual(storage.snapshot(), before);
  }
});

test("forged current ELP terminal state cannot outrank a healthy backup", () => {
  const backupState = storeWith().defaultState();
  backupState.words["c:make"] = State.recordEvidence(null, {
    at: iso(NOW - 2 * DAY), outcome: "success", independent: true, support: "none", mode: "retrieval",
  }, { now: NOW }).record;
  backupState.updatedAt = iso(NOW - DAY);
  const forged = JSON.parse(JSON.stringify(backupState));
  forged.updatedAt = iso(NOW - 1000);
  forged.elpGate = {
    sessionIds: COURSE.elpStepOneIds,
    results: Object.fromEntries(COURSE.elpStepOneIds.map(id => [id, "independent"])),
    startedAt: iso(NOW - 20_000),
    completedAt: iso(NOW - 1_000),
    status: "passed",
    attempts: 1,
  };
  const storage = new State.MemoryStorage({
    "test-state": JSON.stringify(forged),
    "test-state-backup": JSON.stringify(backupState),
  });
  const store = storeWith(storage);
  const loaded = store.load();
  assert.equal(loaded.source, "backup");
  assert.ok(loaded.state.words["c:make"]);
  assert.equal(store.prepareImport(JSON.stringify(forged)).ok, false);
});

test("pending ELP results require matching timestamps during recovery", () => {
  const backupState = storeWith().defaultState();
  backupState.words["c:make"] = State.recordEvidence(null, {
    at: iso(NOW - 2 * DAY), outcome: "success", independent: true, support: "none", mode: "retrieval",
  }, { now: NOW }).record;
  backupState.updatedAt = iso(NOW - DAY);
  const malformed = JSON.parse(JSON.stringify(backupState));
  malformed.updatedAt = iso(NOW - 1000);
  malformed.elpGate = {
    sessionIds: COURSE.elpStepOneIds,
    results: { [COURSE.elpStepOneIds[0]]: "independent" },
    resultTimes: {},
    startedAt: iso(NOW - 20_000),
    completedAt: null,
    status: "pending",
    attempts: 1,
  };
  const storage = new State.MemoryStorage({
    "test-state": JSON.stringify(malformed),
    "test-state-backup": JSON.stringify(backupState),
  });
  const loaded = storeWith(storage).load();
  assert.equal(loaded.source, "backup");
  assert.ok(loaded.state.words["c:make"]);
});

test("a healthy backup beats a newer or equal-timestamp semantically inconsistent v4 main", () => {
  for (const mainOffset of [0, 1_000]) {
    const baseStore = storeWith();
    const healthy = stateWithSixMastered(baseStore);
    healthy.version = 4;
    delete healthy.importTrust;
    healthy.updatedAt = iso(NOW - DAY);
    const inconsistent = JSON.parse(JSON.stringify(healthy));
    inconsistent.updatedAt = iso(NOW - DAY + mainOffset);
    inconsistent.words["c:make"].evidence = inconsistent.words["c:make"].evidence.map(item => ({
      ...item,
      objective: false,
    }));
    inconsistent.words["c:make"].masteryProof = [];
    inconsistent.words["c:make"].masteredAt = null;
    inconsistent.words["c:make"].completedAt = null;
    inconsistent.words["c:make"].successCount = 2;
    inconsistent.words["c:make"].demonstratedSuccessCount = 2;
    const backupRaw = JSON.stringify(healthy);
    const storage = new State.MemoryStorage({
      "test-state": JSON.stringify(inconsistent),
      "test-state-backup": backupRaw,
    });
    const loaded = storeWith(storage).load();
    assert.equal(loaded.source, "backup");
    assert.equal(loaded.recovered, true);
    assert.equal(State.isMastered(loaded.state.words["c:make"], { now: NOW }), true);
    assert.equal(storage.getItem("test-state-backup"), backupRaw);
    assert.match(loaded.issues.join(" "), /evidence is not canonical|conflicts with evidence/);
    const quarantine = JSON.parse(storage.getItem("test-state-quarantine"));
    assert.equal(quarantine.entries.at(-1).source, "main");
    assert.match(quarantine.entries.at(-1).reason, /semantic inconsistency/);
  }
});

test("an inconsistent sole main is recomputed instead of trusting stale derived counts", () => {
  const store = storeWith();
  const state = stateWithSixMastered(store);
  state.version = 4;
  delete state.importTrust;
  state.words["c:make"].evidence = state.words["c:make"].evidence.map(item => ({ ...item, objective: false }));
  state.words["c:make"].masteryProof = [];
  state.words["c:make"].masteredAt = null;
  state.words["c:make"].completedAt = null;
  state.words["c:make"].successCount = 2;
  state.words["c:make"].demonstratedSuccessCount = 2;
  const storage = new State.MemoryStorage({ "test-state": JSON.stringify(state) });
  const loaded = storeWith(storage).load();
  assert.equal(loaded.source, "main");
  assert.equal(loaded.recovered, true);
  assert.equal(State.isMastered(loaded.state.words["c:make"], { now: NOW }), false);
  assert.equal(loaded.state.words["c:make"].demonstratedSuccessCount, 0);
  assert.equal(loaded.state.words["c:make"].selfReportedSuccessCount, 2);
  assert.equal(JSON.parse(storage.getItem("test-state")).version, 5);
});

test("newer backup wins over stale valid staging when main is corrupt", () => {
  const backupState = legacyState({
    updatedAt: iso(NOW - DAY),
    profile: "hotshot-open",
    words: { "truck-001": { completedAt: iso(NOW - 2 * DAY) } },
  });
  const stagingState = legacyState({
    updatedAt: iso(NOW - 2 * DAY),
    profile: "tractor",
  });
  const backupRaw = JSON.stringify(backupState);
  const storage = new State.MemoryStorage({
    "test-state": "{broken",
    "test-state-backup": backupRaw,
    "test-state-staging": JSON.stringify({
      kind: "truck-state-transaction-v1",
      createdAt: iso(NOW - 2 * DAY),
      state: stagingState,
    }),
  });
  const loaded = storeWith(storage).load();
  assert.equal(loaded.source, "backup");
  assert.equal(loaded.state.profile, "hotshot-open");
  assert.equal(storage.getItem("test-state-backup"), backupRaw);
  assert.equal(JSON.parse(storage.getItem("test-state")).profile, "hotshot-open");
  assert.equal(storage.getItem("test-state-staging"), JSON.stringify({
    kind: "truck-state-transaction-v1",
    createdAt: iso(NOW - 2 * DAY),
    state: stagingState,
  }));
});

test("good main repairs a corrupt backup after quarantining it", () => {
  const mainRaw = JSON.stringify(legacyState({
    words: { "truck-001": { completedAt: iso(NOW - 2 * DAY) } },
  }));
  const storage = new State.MemoryStorage({
    "test-state": mainRaw,
    "test-state-backup": "not-json",
  });
  const loaded = storeWith(storage).load();
  assert.equal(loaded.source, "main");
  assert.equal(loaded.recovered, false);
  const repaired = JSON.parse(storage.getItem("test-state-backup"));
  assert.equal(repaired.version, 5);
  assert.ok(repaired.words["t:brake"]);
  const quarantine = JSON.parse(storage.getItem("test-state-quarantine"));
  assert.equal(quarantine.entries.at(-1).source, "backup");
});

test("two corrupt copies are quarantined and produce a safe default", () => {
  const storage = new State.MemoryStorage({
    "test-state": "{",
    "test-state-backup": "null",
  });
  const loaded = storeWith(storage).load();
  assert.equal(loaded.source, "default");
  assert.equal(loaded.state.version, 5);
  assert.deepEqual(Object.keys(loaded.state.words), []);
  const quarantine = JSON.parse(storage.getItem("test-state-quarantine"));
  assert.deepEqual(quarantine.entries.map(item => item.source), ["main", "backup"]);
});

test("import preparation is non-mutating and failed candidates leave storage unchanged", () => {
  const storage = new State.MemoryStorage();
  const store = storeWith(storage);
  assert.equal(store.save(store.defaultState()).ok, true);
  const before = storage.snapshot();
  const invalid = store.prepareImport(JSON.stringify({ version: 99, words: {} }));
  assert.equal(invalid.ok, false);
  assert.deepEqual(storage.snapshot(), before);
  const foreign = store.commitImport({ state: legacyState() });
  assert.equal(foreign.ok, false);
  assert.deepEqual(storage.snapshot(), before);

  const malformedCurrent = JSON.parse(JSON.stringify(store.defaultState()));
  malformedCurrent.words = [];
  assert.equal(store.prepareImport(JSON.stringify(malformedCurrent)).ok, false);
  assert.deepEqual(storage.snapshot(), before);

  const prepared = store.prepareImport(JSON.stringify(legacyState({
    words: { "truck-001": { completedAt: iso(NOW - 2 * DAY) } },
  })));
  assert.equal(prepared.ok, true);
  assert.deepEqual(storage.snapshot(), before);
  assert.equal(store.commitImport(prepared.candidate).ok, true);
  assert.ok(JSON.parse(storage.getItem("test-state")).words["t:brake"]);
});

test("external import quarantines every readiness-bearing field, including a genuine v5 export", () => {
  const sourceStore = storeWith();
  let exported = stateWithSixMastered(sourceStore);
  exported.profile = "tractor";
  exported.onboardingComplete = true;
  exported.sessionOrdinal = 73;
  exported.diagnostic = verifiedDiagnostic(iso(NOW - DAY), qualificationFields(exported));
  exported.dailyPlan = {
    date: "2026-08-21",
    refresh: 0,
    profile: "tractor",
    applicabilityKey: "tractor",
    coreIds: ["c:make"],
    dueIds: [],
    dueQuestionIds: [],
    dueSignIds: [],
    dueSituationIds: [],
    dueDocumentIds: [],
    dueLessonIds: [],
    truckIds: ["t:brake"],
    hotshotIds: [],
    signIds: ["sign:stop"],
    lessonId: "lesson:intro",
    situationId: "situation:roadside",
    documentId: "doc:cdl",
  };
  exported = sourceStore.recordDailyAttempt(exported, {
    date: "2026-08-21",
    at: iso(NOW - 1_000),
    contextKey: qualificationFields(exported).contextKey,
    taskType: "words",
    bucket: "words",
    id: "c:make",
    completed: true,
    result: "independent",
  }).state;
  exported = sourceStore.addError(exported, {
    type: "word",
    id: "c:make",
    text: "make context",
    reason: "Earlier error context",
  }).state;
  exported = sourceStore.recordErrorAttempt(exported, "word", "c:make", demonstrated({
    at: iso(NOW - 2 * DAY),
    variant: "journal-a",
  })).state;
  exported = sourceStore.recordErrorAttempt(exported, "word", "c:make", demonstrated({
    at: iso(NOW - DAY),
    variant: "journal-b",
  })).state;
  assert.equal(exported.errorJournal[0].stage, "closed");

  const storage = new State.MemoryStorage();
  const destination = storeWith(storage);
  const prepared = destination.prepareImport(JSON.stringify({
    kind: "truck-driver-english-export",
    exportedAt: iso(NOW),
    state: exported,
  }));
  assert.equal(prepared.ok, true);
  const imported = prepared.candidate.state;
  for (const [bucket, id] of SIX_BUCKET_ITEMS) {
    assert.ok(imported[bucket][id], `${bucket} history should be retained`);
    assert.equal(State.isMastered(imported[bucket][id], { now: NOW }), false);
    assert.equal(imported[bucket][id].masteryProof.length, 0);
    assert.equal(imported[bucket][id].masteredAt, null);
    assert.equal(imported[bucket][id].evidence.every(item => item.kind === "imported-unverified"), true);
    assert.equal(imported[bucket][id].evidence.every(item => State.isQualifyingEvidence(item) === false), true);
  }
  assert.equal(imported.diagnostic, null);
  assert.equal(imported.dailyPlan, null);
  assert.equal(imported.sessionOrdinal, 1);
  assert.equal(imported.dailyAttempts.length, 1);
  assert.equal(imported.dailyAttempts[0].completed, false);
  assert.equal(imported.dailyAttempts[0].contextKey, qualificationFields(imported).contextKey);
  assert.equal(imported.errorJournal[0].stage, "open");
  assert.equal(imported.errorJournal[0].contextKey, null);
  assert.equal(imported.errorJournal[0].semanticBranch, "shared:words:c:make");
  assert.equal(imported.errorJournal[0].resolutionProof.length, 0);
  assert.equal(imported.errorJournal[0].text, "make context");
  assert.equal(imported.elpGate, null);
  assert.equal(imported.elpStepTwo, null);
  assert.equal(imported.importTrust.status, "imported-unverified");
  assert.equal(imported.importTrust.qualificationReset, true);
  assert.equal(imported.importTrust.history.claimedMasteryRecords, 6);
  assert.equal(imported.importTrust.history.completedDailyAttempts, 1);
  assert.equal(imported.importTrust.history.closedErrorItems, 1);
  assert.equal(imported.importTrust.history.diagnostic.scores.elp, 100);
  assert.deepEqual(Object.keys(imported.importTrust.history).sort(), [
    "branchingCompletions",
    "claimedMasteryRecords",
    "closedErrorItems",
    "completedDailyAttempts",
    "dailyAttempts",
    "diagnostic",
    "elpStepOneClaimed",
    "elpStepTwoClaimed",
    "errorItems",
    "evidenceItems",
    "progressRecords",
  ]);

  const committed = destination.commitImport(prepared.candidate);
  assert.equal(committed.ok, true);
  const loaded = destination.load();
  assert.equal(loaded.source, "main");
  assert.equal(State.isMastered(loaded.state.words["c:make"], { now: NOW }), false);
  assert.equal(loaded.state.dailyAttempts[0].completed, false);
  assert.equal(loaded.state.diagnostic, null);
  assert.equal(loaded.state.errorJournal[0].stage, "open");
  assert.equal(loaded.state.importTrust.status, "imported-unverified");
});

test("external imports from legacy v1 through v4 retain only unverified history", () => {
  const currentStore = storeWith();
  const mastered = stateWithSixMastered(currentStore);
  const legacyInputs = [
    { version: 1, updatedAt: iso(NOW - DAY), words: { "truck-001": { completedAt: iso(NOW - 2 * DAY) } } },
    { version: 2, updatedAt: iso(NOW - DAY), words: { "truck-001": { completedAt: iso(NOW - 2 * DAY) } } },
    { version: 3, updatedAt: iso(NOW - DAY), words: { "truck-001": { completedAt: iso(NOW - 2 * DAY) } } },
    { ...JSON.parse(JSON.stringify(mastered)), version: 4 },
  ];
  delete legacyInputs[3].importTrust;
  for (const [index, payload] of legacyInputs.entries()) {
    const prepared = storeWith().prepareImport(JSON.stringify(payload));
    assert.equal(prepared.ok, true, `legacy v${index + 1} should import`);
    assert.equal(prepared.candidate.state.version, 5);
    assert.equal(prepared.candidate.state.importTrust.sourceVersion, index + 1);
    for (const bucket of SIX_BUCKET_ITEMS.map(item => item[0])) {
      for (const record of Object.values(prepared.candidate.state[bucket])) {
        assert.equal(State.isMastered(record, { now: NOW }), false);
        assert.equal(record.evidence.every(item => item.kind === "imported-unverified"), true);
      }
    }
  }
});

test("external legacy v1 through v4 imports recover only exact allowlisted shared generic errors", () => {
  const contextualCourse = {
    ...COURSE,
    inspectionQuestions: [
      ...COURSE.inspectionQuestions,
      {
        id: "q:contextual",
        profileMaterializations: {
          tractor: { answer: "Tractor answer" },
          "hotshot-open": { answer: "Hotshot answer" },
        },
      },
    ],
  };
  const genericEvidence = [
    demonstrated({ at: iso(NOW - 3 * DAY), variant: "legacy-a" }),
    demonstrated({ at: iso(NOW - 2 * DAY), variant: "legacy-b" }),
  ];
  for (const version of [1, 2, 3, 4]) {
    const store = State.createStateStore({
      storage: new State.MemoryStorage(),
      courseData: contextualCourse,
      storageKey: `legacy-error-v${version}`,
      now: () => NOW,
    });
    const prepared = store.prepareImport(JSON.stringify({
      version,
      updatedAt: iso(NOW - DAY),
      profile: "tractor",
      errorJournal: [
        {
          type: "word",
          id: "c:make",
          text: `Generic history v${version}`,
          reason: "Recover this unchanged-content error",
          semanticBranch: "shared:words:c:go",
          updatedAt: iso(NOW - DAY),
          evidence: genericEvidence,
          resolutionProof: genericEvidence,
        },
        {
          type: "question",
          id: "q:contextual",
          text: `Contextual history v${version}`,
          reason: "Do not share this materialized error",
          semanticBranch: "shared:questions:q:contextual",
          updatedAt: iso(NOW - DAY),
          evidence: genericEvidence,
          resolutionProof: genericEvidence,
        },
      ],
    }));
    assert.equal(prepared.ok, true, `legacy v${version} should import`);
    const imported = prepared.candidate.state;
    const generic = imported.errorJournal.find(item => item.id === "c:make");
    const contextual = imported.errorJournal.find(item => item.id === "q:contextual");
    assert.ok(generic, `legacy v${version} generic error should remain visible`);
    assert.equal(generic.contextKey, null);
    assert.equal(generic.semanticBranch, "shared:words:c:make");
    assert.equal(generic.text, `Generic history v${version}`);
    assert.equal(generic.stage, "open");
    assert.equal(generic.resolutionProof.length, 0);
    assert.equal(generic.evidence.length, 2);
    assert.equal(generic.evidence.every(item => item.kind === "imported-unverified"), true);
    assert.ok(contextual, `legacy v${version} contextual history should remain quarantined`);
    assert.equal(contextual.contextKey, null);
    assert.equal(contextual.semanticBranch, null);
    assert.equal(contextual.stage, "open");
    assert.equal(imported.importTrust.status, "imported-unverified");
    assert.equal(imported.importTrust.sourceVersion, version);
    assert.equal(imported.importTrust.history.errorItems, 2);
  }
});

test("legacy error import binding cannot use prototype ids or forge a contextual shared branch", () => {
  const contextualCourse = {
    ...COURSE,
    inspectionQuestions: [
      ...COURSE.inspectionQuestions,
      { id: "q:contextual", conditionMaterializations: { cargo: { answer: "Cargo answer" } } },
    ],
  };
  for (const version of [1, 2, 3, 4]) {
    const store = State.createStateStore({
      storage: new State.MemoryStorage(),
      courseData: contextualCourse,
      storageKey: `legacy-error-security-v${version}`,
      now: () => NOW,
    });
    const forged = store.prepareImport(JSON.stringify({
      version,
      updatedAt: iso(NOW - DAY),
      errorJournal: [{
        type: "question",
        id: "q:contextual",
        text: "Forged contextual binding",
        reason: "Must stay isolated",
        semanticBranch: "shared:questions:q:contextual",
        updatedAt: iso(NOW - DAY),
      }],
    }));
    assert.equal(forged.ok, true);
    assert.equal(forged.candidate.state.errorJournal[0].semanticBranch, null);
    assert.equal(forged.candidate.state.errorJournal[0].contextKey, null);

    const prototypeId = store.prepareImport(JSON.stringify({
      version,
      updatedAt: iso(NOW - DAY),
      errorJournal: [{ type: "word", id: "__proto__", text: "bad", reason: "bad" }],
    }));
    assert.equal(prototypeId.ok, false);
    assert.equal({}.polluted, undefined);
  }
});

test("forged import metadata, prototype keys, XSS fields and unknown ids cannot create trusted state", () => {
  const payload = stateWithSixMastered(storeWith());
  payload.importTrust = {
    status: "trusted-local",
    importedAt: iso(NOW),
    sourceVersion: 5,
    history: {},
  };
  const forgedTrust = storeWith().prepareImport(JSON.stringify(payload));
  assert.equal(forgedTrust.ok, false, "a malformed current envelope is rejected before trust is assigned");

  const xssLegacy = {
    version: 2,
    updatedAt: iso(NOW - 1_000),
    profile: "<img src=x onerror=alert(1)>",
    diagnostic: {
      completedAt: iso(NOW - DAY),
      scores: { vocabulary: 100, listening: 100, elp: 100, inspection: 100 },
      weakest: "<script>alert(1)</script>",
      recommendation: "<svg onload=alert(1)>",
    },
  };
  const safe = storeWith().prepareImport(JSON.stringify(xssLegacy));
  assert.equal(safe.ok, true);
  assert.equal(safe.candidate.state.profile, null);
  assert.equal(safe.candidate.state.diagnostic, null);
  assert.match(safe.candidate.state.importTrust.history.diagnostic.recommendation, /смешанного маршрута/i);

  const pollutedJson = `{"version":2,"updatedAt":"${iso(NOW - 1_000)}","__proto__":{"polluted":true},"words":{"__proto__":{"completedAt":"${iso(NOW - DAY)}"}}}`;
  assert.equal({}.polluted, undefined);
  assert.equal(storeWith().prepareImport(pollutedJson).ok, false);
  assert.equal({}.polluted, undefined);

  const unknown = {
    version: 2,
    updatedAt: iso(NOW - 1_000),
    words: { "unknown:unit": { completedAt: iso(NOW - DAY) } },
  };
  assert.equal(storeWith().prepareImport(JSON.stringify(unknown)).ok, false);
});

test("migration is idempotent, merges collisions and supports cross-collection targets", () => {
  const input = legacyState({
    words: {
      "truck-brake-old": { completedAt: iso(NOW - 3 * DAY) },
      "t:brake": { completedAt: iso(NOW - DAY) },
      "sign-action-old": { completedAt: iso(NOW - 2 * DAY) },
    },
    questions: {
      "question-01": { completedAt: iso(NOW - 3 * DAY) },
    },
    questionAttempts: {
      "question-01": { independent: 1, prompted: 0, failed: 0, lastResult: "independent", lastAttemptAt: iso(NOW - DAY) },
    },
    signs: { "sign-01": { completedAt: iso(NOW - 3 * DAY) } },
    situations: { "situation-01": { completedAt: iso(NOW - 3 * DAY) } },
    documents: { "doc-01": { completedAt: iso(NOW - 3 * DAY) } },
    lessons: { "lesson-01": { completedAt: iso(NOW - 3 * DAY) } },
    errorJournal: [{ type: "word", id: "sign-action-old", text: "Old sign action", reason: "retry", updatedAt: iso(NOW - DAY) }],
  });
  const first = State.normalizeState(input, COURSE, { now: NOW });
  assert.equal(first.ok, true);
  assert.deepEqual(Object.keys(first.state.words), ["t:brake"]);
  assert.deepEqual(Object.keys(first.state.signs), ["sign:stop"]);
  assert.equal(first.state.words["t:brake"].evidence.length, 2);
  assert.equal(first.state.words["t:brake"].successCount, 0);
  assert.equal(first.state.words["t:brake"].evidence.every(item => item.kind === "legacy"), true);
  assert.equal(first.state.words["t:brake"].masteredAt, null);
  assert.equal(first.state.signs["sign:stop"].evidence.length, 2);
  assert.equal(first.state.signs["sign:stop"].masteredAt, null);
  assert.ok(first.state.questions["q:stop"]);
  assert.ok(first.state.situations["situation:roadside"]);
  assert.ok(first.state.documents["doc:cdl"]);
  assert.ok(first.state.lessons["lesson:intro"]);
  assert.deepEqual(first.state.errorJournal.map(item => [item.type, item.id]), [["sign", "sign:stop"]]);
  const second = State.normalizeState(first.state, COURSE, { now: NOW });
  assert.equal(second.ok, true);
  assert.equal(JSON.stringify(second.state), JSON.stringify(first.state));
});

test("mastery requires two objective blind productive variants separated by at least 24 hours", () => {
  assert.equal(State.isMastered({ masteredAt: iso(NOW - DAY) }, { now: NOW }), false);
  let clock = NOW - 3 * DAY;
  const store = storeWith(new State.MemoryStorage(), () => clock);
  let state = store.defaultState();
  let recorded = store.recordEvidence(state, "words", "c:make", demonstrated({ variant: "definition-a" }));
  assert.equal(recorded.ok, true);
  state = recorded.state;
  assert.equal(State.isMastered(recorded.record), false);
  assert.equal(State.masteryStatus(recorded.record, { now: clock }), "learning");

  clock += DAY - 1;
  recorded = store.recordEvidence(state, "words", "c:make", demonstrated({ variant: "definition-b" }));
  state = recorded.state;
  assert.equal(State.isMastered(recorded.record), false);

  clock += 1;
  recorded = store.recordEvidence(state, "words", "c:make", demonstrated({ variant: "definition-b" }));
  assert.equal(State.isMastered(recorded.record), true);
  assert.equal(recorded.record.masteredAt, iso(NOW - 2 * DAY));

  let repeatedDriverAnswer = null;
  repeatedDriverAnswer = State.recordEvidence(repeatedDriverAnswer, demonstrated({
    at: iso(NOW - 2 * DAY),
    variant: "driver-answer-listening",
  }), { now: NOW - 2 * DAY }).record;
  repeatedDriverAnswer = State.recordEvidence(repeatedDriverAnswer, demonstrated({
    at: iso(NOW),
    variant: "driver-answer-listening",
  }), { now: NOW }).record;
  assert.equal(State.isMastered(repeatedDriverAnswer), false, "repeating the same driver-answer task cannot create a mastery pair");

  let mixedConstructs = State.recordEvidence(null, demonstrated({
    at: iso(NOW - DAY),
    variant: "direct-response",
  }), { now: NOW - DAY }).record;
  const driverModelEcho = {
    ...Eval.evidenceForEvaluation(
      { pass: true, evaluator: "semantic-slots" },
      { mode: "question-typed-pre-reveal", variant: "driver-answer-listening", response: "model answer", productive: false },
    ),
    at: iso(NOW),
  };
  const appendedEcho = State.recordEvidence(mixedConstructs, driverModelEcho, { now: NOW });
  mixedConstructs = appendedEcho.record;
  assert.equal(appendedEcho.evidence.productive, false);
  assert.equal(appendedEcho.evidence.kind, "self-reported");
  assert.equal(State.isMastered(mixedConstructs), false, "a heard driver model cannot confirm productive mastery");
  assert.equal(mixedConstructs.masteryProof.length, 0);

  const nonQualifying = [
    { ...demonstrated({ at: iso(NOW - 2 * DAY), variant: "hint-a" }), support: "hint" },
    { ...demonstrated({ at: iso(NOW), variant: "reveal-b" }), support: "reveal", mode: "reveal" },
    { ...demonstrated({ at: iso(NOW), variant: "read-c" }), mode: "situation-read" },
    { at: iso(NOW), outcome: "success", independent: true, support: "none", mode: "self-click", variant: "self-d" },
  ];
  let nonQualifyingRecord = null;
  for (const evidence of nonQualifying) nonQualifyingRecord = State.recordEvidence(nonQualifyingRecord, evidence, { now: NOW }).record;
  assert.equal(State.isMastered(nonQualifyingRecord), false);
  assert.equal(nonQualifyingRecord.demonstratedSuccessCount, 0);
  assert.ok(nonQualifyingRecord.viewedCount >= 2);
});

test("viewed attempts are stored separately and daily demonstrated results survive normalization", () => {
  const store = storeWith();
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  const viewed = store.recordAttempt(state, "words", "c:make", {
    kind: "viewed",
    outcome: "viewed",
    independent: false,
    objective: false,
    blind: false,
    productive: false,
    support: "reveal",
    evaluator: "none",
    mode: "card-reveal",
    variant: "translation-to-english",
  });
  assert.equal(viewed.ok, true);
  assert.equal(viewed.record.evidence[0].kind, "viewed");
  assert.equal(viewed.record.evidence[0].outcome, "partial");
  assert.equal(viewed.record.viewedCount, 1);
  assert.equal(State.isMastered(viewed.record), false);
  assert.equal(State.masteryStatus(viewed.record, { now: NOW }), "needs-review");
  state = viewed.state;

  const failed = store.recordAttempt(state, "words", "c:go", demonstrated({
    at: iso(NOW),
    outcome: "failed",
    independent: false,
    variant: "failed-a",
  }));
  assert.equal(failed.ok, true);
  assert.equal(State.masteryStatus(failed.record, { now: NOW }), "needs-review");

  const daily = store.recordDailyAttempt(state, {
    date: "2026-08-21",
    at: iso(NOW),
    contextKey: qualificationFields(state).contextKey,
    taskType: "words",
    bucket: "words",
    id: "c:make",
    completed: true,
    result: "demonstrated",
  });
  assert.equal(daily.ok, true);
  assert.equal(daily.attempt.result, "demonstrated");
  assert.equal(store.save(daily.state).ok, true);
});

test("daily attempts retain only canonical qualification contexts", () => {
  const store = storeWith();
  const state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  const tractorContext = qualificationFields(state).contextKey;
  const hotshotContext = State.qualificationContextKey("hotshot-open", state.applicability);
  const baseAttempt = {
    date: "2026-08-21",
    at: iso(NOW),
    taskType: "words",
    bucket: "words",
    id: "c:make",
    completed: true,
    result: "independent",
  };

  assert.equal(store.recordDailyAttempt(state, baseAttempt).ok, false);
  assert.equal(store.recordDailyAttempt(state, { ...baseAttempt, contextKey: hotshotContext }).ok, false);
  const recorded = store.recordDailyAttempt(state, { ...baseAttempt, contextKey: tractorContext });
  assert.equal(recorded.ok, true);
  assert.equal(recorded.attempt.contextKey, tractorContext);
  assert.equal(recorded.attempt.completed, true);

  const contextless = JSON.parse(JSON.stringify(state));
  contextless.dailyAttempts = [baseAttempt];
  const downgraded = store.normalize(contextless);
  assert.equal(downgraded.ok, true);
  assert.equal(downgraded.state.dailyAttempts[0].contextKey, tractorContext);
  assert.equal(downgraded.state.dailyAttempts[0].completed, false);
  assert.match(downgraded.issues.join(" "), /contextless.*reset/i);

  const oldContext = JSON.parse(JSON.stringify(state));
  oldContext.dailyAttempts = [{ ...baseAttempt, contextKey: hotshotContext }];
  const preserved = store.normalize(oldContext);
  assert.equal(preserved.state.dailyAttempts[0].contextKey, hotshotContext);
  assert.equal(preserved.state.dailyAttempts[0].completed, true);

  const malformed = JSON.parse(JSON.stringify(state));
  malformed.dailyAttempts = [{ ...baseAttempt, contextKey: "{not-canonical}" }];
  assert.equal(store.save(malformed).ok, false);
});

test("progress evidence is compacted per materialized profile binding", () => {
  const tractorPrefix = "profile:tractor|";
  const hotshotPrefix = "profile:hotshot-open|";
  const append = (record, evidence, now) => {
    const result = State.recordEvidence(record, evidence, { now });
    assert.equal(result.ok, true);
    return result.record;
  };
  const scoped = (record, prefix, now) => (record.evidence || [])
    .filter(item => String(item.variant || "").startsWith(prefix))
    .reduce((current, item) => append(current, item, now), null);

  let record = null;
  record = append(record, demonstrated({ at: iso(NOW - 4 * DAY), variant: `${tractorPrefix}translation-to-english` }), NOW);
  record = append(record, demonstrated({ at: iso(NOW - 3 * DAY), variant: `${tractorPrefix}example-gap` }), NOW);
  for (let index = 0; index < 20; index += 1) {
    record = append(record, demonstrated({
      at: iso(NOW - 2 * DAY + index * 1000),
      outcome: "failed",
      independent: false,
      variant: `${hotshotPrefix}attempt-${index}`,
    }), NOW);
  }
  assert.equal(record.evidence.length, 22);
  assert.equal(State.isMastered(scoped(record, tractorPrefix, NOW), { now: NOW }), true);

  record = append(record, demonstrated({
    at: iso(NOW),
    outcome: "failed",
    independent: false,
    variant: `${tractorPrefix}relapse`,
  }), NOW);
  assert.equal(State.isMastered(scoped(record, tractorPrefix, NOW), { now: NOW }), false);
  record = append(record, demonstrated({ at: iso(NOW + 60 * 60 * 1000), variant: `${tractorPrefix}corrected` }), NOW + 60 * 60 * 1000);
  record = append(record, demonstrated({ at: iso(NOW + 25 * 60 * 60 * 1000), variant: `${tractorPrefix}confirmed` }), NOW + 25 * 60 * 60 * 1000);
  const remastered = scoped(record, tractorPrefix, NOW + 25 * 60 * 60 * 1000);
  assert.equal(State.isMastered(remastered, { now: NOW + 25 * 60 * 60 * 1000 }), true);
  assert.deepEqual(remastered.masteryProof.map(item => item.variant), [`${tractorPrefix}corrected`, `${tractorPrefix}confirmed`]);
});

test("listening daily evidence retains its construct variant across save and reload", () => {
  const storage = new State.MemoryStorage();
  const store = storeWith(storage);
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  const contextKey = qualificationFields(state).contextKey;
  const recorded = store.recordDailyAttempt(state, {
    date: "2026-08-21",
    at: iso(NOW),
    contextKey,
    taskType: "listening",
    bucket: "questions",
    id: "q:stop",
    completed: true,
    result: "independent",
    evidence: { variant: "driver-answer-listening" },
  });
  assert.equal(recorded.ok, true);
  assert.equal(recorded.attempt.variant, "driver-answer-listening");
  assert.equal(store.save(recorded.state).ok, true);
  const loaded = store.load();
  assert.equal(loaded.state.dailyAttempts[0].variant, "driver-answer-listening");
  assert.equal(Core.dailyTaskCompleted(
    { key: "listening", ids: ["q:stop"], date: "2026-08-21" },
    loaded.state.dailyAttempts,
    { contextKey },
  ), true);
});

test("daily compaction preserves a qualifying completion anchor through quota churn", () => {
  const storage = new State.MemoryStorage();
  const store = storeWith(storage);
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  const contextKey = qualificationFields(state).contextKey;
  const task = { key: "core", ids: ["c:make"], date: "2026-08-21" };
  let recorded = store.recordDailyAttempt(state, {
    date: task.date,
    at: iso(NOW - 121_000),
    contextKey,
    taskType: "core",
    bucket: "words",
    id: "c:make",
    completed: true,
    result: "independent",
    variant: "translation-to-english",
  });
  assert.equal(recorded.ok, true);
  state = recorded.state;
  assert.equal(Core.dailyTaskCompleted(task, state.dailyAttempts, { contextKey }), true);
  for (let index = 0; index < 120; index += 1) {
    recorded = store.recordDailyAttempt(state, {
      date: task.date,
      at: iso(NOW - 120_000 + index * 1000),
      contextKey,
      taskType: "core",
      bucket: "words",
      id: "c:make",
      completed: false,
      result: "failed",
      variant: `failed-${index}`,
    });
    assert.equal(recorded.ok, true);
    state = recorded.state;
  }
  assert.equal(state.dailyAttempts.length, 120);
  assert.equal(Core.dailyTaskCompleted(task, state.dailyAttempts, { contextKey }), true);
  assert.equal(store.save(state).ok, true);
  const loaded = store.load().state;
  assert.equal(loaded.dailyAttempts.length, 120);
  assert.equal(Core.dailyTaskCompleted(task, loaded.dailyAttempts, { contextKey }), true);
  const otherContext = State.qualificationContextKey("hotshot-open", loaded.applicability);
  assert.equal(Core.dailyTaskCompleted(task, loaded.dailyAttempts, { contextKey: otherContext }), false);
});

test("daily compaction stays bounded and prioritizes the active route anchor", () => {
  const storage = new State.MemoryStorage();
  const manyCourse = {
    ...COURSE,
    core: Array.from({ length: 122 }, (_, index) => ({ id: `many:${index}` })),
    truck: [],
    hotshot: [],
  };
  const store = State.createStateStore({ storage, courseData: manyCourse, storageKey: "many-state", now: () => NOW });
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  state.dailyPlan = {
    date: "2026-08-21",
    refresh: 0,
    profile: "tractor",
    routeKeys: ["core"],
    routeSnapshot: [{ key: "core", bucket: "words", ids: ["many:0"] }],
    dueCursor: 0,
  };
  state = store.normalize(state).state;
  const contextKey = State.qualificationContextKey(state.profile, state.applicability);
  const record = (id, index, completed = true) => {
    const result = store.recordDailyAttempt(state, {
      date: "2026-08-21",
      at: iso(NOW - 122_000 + index * 1000),
      contextKey,
      taskType: "core",
      bucket: "words",
      id,
      completed,
      result: completed ? "independent" : "failed",
      variant: "translation-to-english",
    });
    assert.equal(result.ok, true);
    state = result.state;
  };
  record("many:0", 0);
  for (let index = 1; index <= 120; index += 1) record(`many:${index}`, index);
  assert.equal(state.dailyAttempts.length, 120);
  assert.equal(Core.dailyTaskCompleted(
    { key: "core", ids: ["many:0"], date: "2026-08-21" },
    state.dailyAttempts,
    { contextKey },
  ), true);
  record("many:121", 121, false);
  assert.equal(state.dailyAttempts.length, 120);
  assert.equal(store.save(state).ok, true);
  const loaded = store.load().state;
  assert.equal(loaded.dailyAttempts.length, 120);
  assert.equal(Core.dailyTaskCompleted(
    { key: "core", ids: ["many:0"], date: "2026-08-21" },
    loaded.dailyAttempts,
    { contextKey },
  ), true);
});

test("active route aliases retain due-question and diagnostic anchors", () => {
  const manyCourse = {
    ...COURSE,
    core: [...COURSE.core, ...Array.from({ length: 120 }, (_, index) => ({ id: `alias:${index}` }))],
    truck: [],
    hotshot: [],
  };
  const scenarios = [
    {
      name: "due-question",
      descriptor: { key: "due-questions", bucket: "questions", ids: ["q:stop"] },
      attempt: { taskType: "questions", bucket: "questions", id: "q:stop", variant: "direct-response" },
      task: { key: "due-questions", ids: ["q:stop"], date: "2026-08-21" },
    },
    {
      name: "diagnostic-inspection",
      descriptor: { key: "diagnostic", bucket: "questions", ids: ["q:stop"] },
      attempt: { taskType: "questions", bucket: "questions", id: "q:stop", variant: "direct-response" },
      task: { key: "diagnostic", ids: ["q:stop"], date: "2026-08-21" },
    },
  ];
  for (const [scenarioIndex, scenario] of scenarios.entries()) {
    const storage = new State.MemoryStorage();
    const store = State.createStateStore({ storage, courseData: manyCourse, storageKey: `alias-state-${scenarioIndex}`, now: () => NOW });
    let state = store.defaultState();
    state.profile = "tractor";
    state.onboardingComplete = true;
    state.dailyPlan = {
      date: "2026-08-21",
      refresh: 0,
      profile: "tractor",
      routeKeys: [scenario.descriptor.key],
      routeSnapshot: [scenario.descriptor],
      dueCursor: 0,
    };
    state = store.normalize(state).state;
    const contextKey = State.qualificationContextKey(state.profile, state.applicability);
    let result = store.recordDailyAttempt(state, {
      date: "2026-08-21",
      at: iso(NOW - 121_000),
      contextKey,
      completed: true,
      result: "independent",
      ...scenario.attempt,
    });
    assert.equal(result.ok, true, scenario.name);
    state = result.state;
    for (let index = 0; index < 120; index += 1) {
      result = store.recordDailyAttempt(state, {
        date: "2026-08-21",
        at: iso(NOW - 120_000 + index * 1000),
        contextKey,
        taskType: "core",
        bucket: "words",
        id: `alias:${index}`,
        completed: true,
        result: "independent",
        variant: "translation-to-english",
      });
      assert.equal(result.ok, true, `${scenario.name}:${index}`);
      state = result.state;
    }
    assert.equal(state.dailyAttempts.length, 120, scenario.name);
    assert.equal(Core.dailyTaskCompleted(scenario.task, state.dailyAttempts, { contextKey }), true, scenario.name);
    assert.equal(store.save(state).ok, true, scenario.name);
    assert.equal(Core.dailyTaskCompleted(scenario.task, store.load().state.dailyAttempts, { contextKey }), true, `${scenario.name}:reload`);
  }
});

test("Today error route binds one exact journal target through churn and reload", () => {
  const manyCourse = {
    ...COURSE,
    core: [...COURSE.core, ...Array.from({ length: 120 }, (_, index) => ({ id: `error-churn:${index}` }))],
  };
  const storage = new State.MemoryStorage();
  const store = State.createStateStore({ storage, courseData: manyCourse, storageKey: "exact-error-route", now: () => NOW });
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  let result = store.addError(state, {
    type: "word",
    id: "c:make",
    text: "make",
    reason: "Recall failed",
  });
  assert.equal(result.ok, true);
  state = result.state;
  const contextKey = qualificationFields(state).contextKey;
  const errorTarget = {
    type: result.record.type,
    id: result.record.id,
    contextKey: result.record.contextKey,
    semanticBranch: result.record.semanticBranch,
  };
  state.dailyPlan = {
    date: "2026-08-21",
    refresh: 0,
    profile: "tractor",
    routeKeys: ["errors"],
    routeSnapshot: [{ key: "errors", bucket: null, errorTarget }],
    dueCursor: 0,
  };
  state = store.normalize(state).state;

  const unrelated = store.recordAttempt(state, "questions", "q:stop", demonstrated({
    at: iso(NOW - 122_000),
    variant: "direct-response",
  }));
  assert.equal(unrelated.ok, true);
  state = unrelated.state;
  const bypass = store.recordDailyAttempt(state, {
    date: "2026-08-21",
    at: unrelated.evidence.at,
    contextKey,
    taskType: "errors",
    bucket: "questions",
    id: "q:stop",
    completed: true,
    result: "independent",
    variant: "direct-response",
    errorTarget,
    errorEvidenceAt: unrelated.evidence.at,
  });
  assert.equal(bypass.ok, false);
  assert.match(bypass.error, /frozen recovery target/);

  result = store.recordAttempt(state, "words", "c:make", demonstrated({
    at: iso(NOW - 121_000),
    variant: "translation-to-english",
  }));
  assert.equal(result.ok, true);
  state = result.state;
  result = store.recordDailyAttempt(state, {
    date: "2026-08-21",
    at: result.evidence.at,
    contextKey,
    taskType: "errors",
    bucket: "words",
    id: "c:make",
    completed: true,
    result: "independent",
    variant: "translation-to-english",
    errorTarget,
    errorEvidenceAt: result.evidence.at,
  });
  assert.equal(result.ok, true);
  state = result.state;
  const task = { key: "errors", date: "2026-08-21", errorTarget };
  assert.equal(Core.dailyTaskCompleted(task, state.dailyAttempts, { contextKey }), true);

  for (let index = 0; index < 120; index += 1) {
    result = store.recordDailyAttempt(state, {
      date: "2026-08-21",
      at: iso(NOW - 120_000 + index * 1000),
      contextKey,
      taskType: "core",
      bucket: "words",
      id: `error-churn:${index}`,
      completed: true,
      result: "independent",
      variant: "translation-to-english",
    });
    assert.equal(result.ok, true, index);
    state = result.state;
  }
  assert.equal(state.dailyAttempts.length, 120);
  assert.equal(Core.dailyTaskCompleted(task, state.dailyAttempts, { contextKey }), true);
  assert.equal(store.save(state).ok, true);
  const loaded = store.load().state;
  assert.deepEqual(loaded.dailyPlan.routeSnapshot[0].errorTarget, errorTarget);
  assert.equal(Core.dailyTaskCompleted(task, loaded.dailyAttempts, { contextKey }), true);

  const forged = JSON.parse(JSON.stringify(loaded));
  forged.dailyPlan.routeSnapshot[0].errorTarget = {
    ...errorTarget,
    contextKey,
    semanticBranch: null,
  };
  const downgraded = store.normalize(forged);
  assert.deepEqual(downgraded.state.dailyPlan.routeKeys, []);
  assert.equal(Object.hasOwn(downgraded.state.dailyPlan, "routeSnapshot"), false);
  assert.ok(downgraded.issues.some(issue => issue.includes("qualification binding")));

  result = store.recordAttempt(loaded, "words", "c:make", demonstrated({
    at: iso(NOW),
    outcome: "failed",
    variant: "relapse",
  }));
  assert.equal(result.ok, true);
  result = store.recordDailyAttempt(result.state, {
    date: "2026-08-21",
    at: result.evidence.at,
    contextKey,
    taskType: "errors",
    bucket: "words",
    id: "c:make",
    completed: false,
    result: "failed",
    variant: "relapse",
    errorTarget,
  });
  assert.equal(result.ok, true);
  assert.equal(Core.dailyTaskCompleted(task, result.state.dailyAttempts, { contextKey }), false);
});

test("diagnostic and branching Today errors cannot complete each other's frozen target", () => {
  const store = storeWith();
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  let result = store.addError(state, {
    type: "diagnostic",
    id: "diagnostic-vocabulary-oos",
    text: "Out-of-service",
    reason: "Wrong diagnostic answer",
  });
  assert.equal(result.ok, true);
  state = result.state;
  const diagnosticTarget = {
    type: result.record.type,
    id: result.record.id,
    contextKey: result.record.contextKey,
    semanticBranch: result.record.semanticBranch,
  };
  result = store.addError(state, {
    type: "branching",
    id: "branch-0",
    text: "Safe stop",
    reason: "Unsafe branch",
  });
  assert.equal(result.ok, true);
  state = result.state;
  const branchTarget = {
    type: result.record.type,
    id: result.record.id,
    contextKey: result.record.contextKey,
    semanticBranch: result.record.semanticBranch,
  };
  const contextKey = qualificationFields(state).contextKey;
  state.dailyPlan = {
    date: "2026-08-21",
    refresh: 0,
    profile: "tractor",
    routeKeys: ["errors"],
    routeSnapshot: [{ key: "errors", bucket: null, errorTarget: diagnosticTarget }],
  };
  state = store.normalize(state).state;
  result = store.recordErrorAttempt(state, "branching", "branch-0", demonstrated({
    at: iso(NOW - 1_000),
    variant: "branch-primary",
  }));
  assert.equal(result.ok, true);
  state = result.state;
  const mismatch = store.recordDailyAttempt(state, {
    date: "2026-08-21",
    at: result.evidence.at,
    contextKey,
    taskType: "errors",
    completed: true,
    result: "independent",
    variant: "branch-primary",
    errorTarget: diagnosticTarget,
    errorEvidenceAt: result.evidence.at,
  });
  assert.equal(mismatch.ok, false);

  result = store.recordErrorAttempt(state, "diagnostic", "diagnostic-vocabulary-oos", demonstrated({
    at: iso(NOW),
    variant: "diagnostic-primary",
  }));
  assert.equal(result.ok, true);
  state = result.state;
  const matched = store.recordDailyAttempt(state, {
    date: "2026-08-21",
    at: result.evidence.at,
    contextKey,
    taskType: "errors",
    completed: true,
    result: "independent",
    variant: "diagnostic-primary",
    errorTarget: diagnosticTarget,
    errorEvidenceAt: result.evidence.at,
  });
  assert.equal(matched.ok, true);
  assert.equal(Core.dailyTaskCompleted(
    { key: "errors", date: "2026-08-21", errorTarget: branchTarget },
    matched.state.dailyAttempts,
    { contextKey },
  ), false);
  assert.equal(Core.dailyTaskCompleted(
    { key: "errors", date: "2026-08-21", errorTarget: diagnosticTarget },
    matched.state.dailyAttempts,
    { contextKey },
  ), true);
});

test("legacy completion is due now but never counts as objective mastery evidence", () => {
  const store = storeWith();
  const normalized = store.normalize(legacyState({
    words: { "truck-001": { completedAt: iso(NOW - 2 * DAY), repetitions: 5000000 } },
  }));
  const legacy = normalized.state.words["t:brake"];
  assert.equal(legacy.successCount, 0);
  assert.equal(legacy.repetitions, 100000);
  assert.equal(State.isMastered(legacy), false);
  assert.equal(State.isDue(legacy, { now: NOW }), true);
  let verified = store.recordAttempt(normalized.state, "words", "t:brake", demonstrated({ variant: "new-a" }));
  assert.equal(verified.ok, true);
  assert.equal(State.isMastered(verified.record), false);
  verified = store.recordAttempt(verified.state, "words", "t:brake", demonstrated({ at: iso(NOW), variant: "new-b" }));
  assert.equal(State.isMastered(verified.record), false);
});

test("v1 state migrates through v5 defaults without losing progress", () => {
  const result = State.normalizeState({
    version: 1,
    profile: "hotshot",
    words: { "truck-001": { completedAt: iso(NOW - DAY) } },
    signs: { "sign-01": { completedAt: iso(NOW - DAY) } },
  }, COURSE, { now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.sourceVersion, 1);
  assert.equal(result.state.version, 5);
  assert.equal(result.state.profile, "hotshot-open");
  assert.equal(result.state.onboardingComplete, true);
  assert.ok(result.state.words["t:brake"]);
  assert.ok(result.state.signs["sign:stop"]);
});

test("questions and all simple buckets use the same evidence contract", () => {
  let clock = NOW - 2 * DAY;
  const store = storeWith(new State.MemoryStorage(), () => clock);
  let state = store.defaultState();
  const items = [
    ["questions", "q:stop"],
    ["signs", "sign:stop"],
    ["situations", "situation:roadside"],
    ["documents", "doc:cdl"],
    ["lessons", "lesson:intro"],
  ];
  for (const [bucket, id] of items) {
    const result = store.recordAttempt(state, bucket, id, demonstrated({ variant: `${bucket}-a` }));
    assert.equal(result.ok, true);
    assert.equal(State.isMastered(result.record), false);
    state = result.state;
  }
  clock += DAY;
  for (const [bucket, id] of items) {
    const result = store.recordAttempt(state, bucket, id, demonstrated({ variant: `${bucket}-b` }));
    assert.equal(result.ok, true);
    assert.equal(State.isMastered(result.record), true);
    state = result.state;
  }
  assert.equal(state.questionAttempts["q:stop"].independent, 2);
});

test("the two lesson blueprint constructs remain objective and form a spaced mastery pair", () => {
  const store = storeWith(new State.MemoryStorage(), () => NOW);
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  const contextKey = qualificationFields(state).contextKey;
  const reception = demonstrated({
    at: iso(NOW - DAY),
    mode: "lesson-reception-blueprint",
    variant: "reception-only",
    evaluator: "lesson-reception-blueprint",
    response: "Понял все локальные записи",
  });
  const first = store.recordAttempt(state, "lessons", "lesson:intro", reception);
  assert.equal(first.ok, true);
  assert.equal(first.evidence.kind, "demonstrated");
  assert.equal(first.evidence.objective, true);
  assert.equal(State.isQualifyingEvidence(first.evidence), true);
  assert.equal(State.isMastered(first.record), false);

  const daily = store.recordDailyAttempt(first.state, {
    date: "2026-08-20",
    at: iso(NOW - DAY),
    contextKey,
    taskType: "lesson",
    bucket: "lessons",
    id: "lesson:intro",
    completed: true,
    result: "independent",
  });
  assert.equal(daily.ok, true);
  assert.equal(Core.dailyTaskCompleted(
    { key: "lesson", id: "lesson:intro", date: "2026-08-20" },
    daily.state.dailyAttempts,
    { contextKey },
  ), true);

  const production = at => demonstrated({
    at,
    mode: "lesson-production-interaction-blueprint",
    variant: "production-interaction",
    evaluator: "lesson-production-interaction-blueprint",
    response: "Complete written production and workplace interaction",
  });
  const tooSoon = store.recordAttempt(first.state, "lessons", "lesson:intro", production(iso(NOW - 1)));
  assert.equal(tooSoon.ok, true);
  assert.equal(State.isQualifyingEvidence(tooSoon.evidence), true);
  assert.equal(State.isMastered(tooSoon.record), false);

  const confirmed = store.recordAttempt(first.state, "lessons", "lesson:intro", production(iso(NOW)));
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.evidence.kind, "demonstrated");
  assert.equal(State.isMastered(confirmed.record), true);
});

test("every successful runtime completion evaluator survives the persistence allowlist", () => {
  const cases = [
    ["situations", "situation:roadside", "situation", "situation-completion-blueprint"],
    ["questions", "q:stop", "questions", "semantic-alternative"],
    ["documents", "doc:cdl", "document", "structured-exact"],
  ];
  const store = storeWith(new State.MemoryStorage(), () => NOW);
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  const contextKey = qualificationFields(state).contextKey;

  for (const [bucket, id, taskType, evaluator] of cases) {
    const makeEvidence = (at, variant) => Eval.evidenceForEvaluation(
      { pass: true, score: 1, evaluator, feedback: "Objective keyed completion." },
      { mode: `${taskType}-typed-pre-reveal`, variant, response: `${evaluator} response` },
    );
    const first = store.recordAttempt(state, bucket, id, { ...makeEvidence(iso(NOW - DAY), `${evaluator}-a`), at: iso(NOW - DAY) });
    assert.equal(first.ok, true, evaluator);
    assert.equal(first.evidence.kind, "demonstrated", evaluator);
    assert.equal(first.evidence.objective, true, evaluator);
    assert.equal(State.isQualifyingEvidence(first.evidence), true, evaluator);
    assert.equal(State.isMastered(first.record), false, evaluator);

    const daily = store.recordDailyAttempt(first.state, {
      date: "2026-08-20",
      at: iso(NOW - DAY),
      contextKey,
      taskType,
      bucket,
      id,
      completed: true,
      result: "independent",
    });
    assert.equal(daily.ok, true, evaluator);
    assert.equal(Core.dailyTaskCompleted(
      { key: taskType, id, date: "2026-08-20" },
      daily.state.dailyAttempts,
      { contextKey },
    ), true, evaluator);

    const confirmed = store.recordAttempt(first.state, bucket, id, { ...makeEvidence(iso(NOW), `${evaluator}-b`), at: iso(NOW) });
    assert.equal(confirmed.ok, true, evaluator);
    assert.equal(State.isMastered(confirmed.record), true, evaluator);
    state = confirmed.state;
  }
});

test("a relapse resets the 24-hour anchor in all six mastery buckets", () => {
  const finalNow = NOW + 4 * DAY;
  const store = storeWith(new State.MemoryStorage(), () => finalNow);
  let state = store.defaultState();
  const firstAt = NOW;
  const relapseAt = NOW + 23 * 60 * 60 * 1_000;
  const tooSoonAt = NOW + DAY;
  const confirmationAt = tooSoonAt + DAY;
  for (const [bucket, id] of SIX_BUCKET_ITEMS) {
    state = store.recordAttempt(state, bucket, id, demonstrated({
      at: iso(firstAt),
      variant: `${bucket}-anchor-a`,
    })).state;
    state = store.recordAttempt(state, bucket, id, demonstrated({
      at: iso(relapseAt),
      outcome: "failed",
      independent: false,
      variant: `${bucket}-relapse`,
    })).state;
    let result = store.recordAttempt(state, bucket, id, demonstrated({
      at: iso(tooSoonAt),
      variant: `${bucket}-correction-b`,
    }));
    state = result.state;
    assert.equal(State.isMastered(result.record, { now: finalNow }), false, `${bucket} must not reuse its pre-relapse anchor`);
    assert.equal(result.record.masteryProof.length, 0);
    result = store.recordAttempt(state, bucket, id, demonstrated({
      at: iso(confirmationAt),
      variant: `${bucket}-transfer-c`,
    }));
    state = result.state;
    assert.equal(State.isMastered(result.record, { now: finalNow }), true, `${bucket} should master after a new spaced pair`);
  }
});

test("failure, prompted support and reveal each invalidate an existing mastery anchor", () => {
  const invalidators = [
    demonstrated({ at: iso(NOW - DAY + 1_000), outcome: "failed", independent: false, variant: "failure" }),
    { ...demonstrated({ at: iso(NOW - DAY + 1_000), variant: "prompted" }), independent: false, support: "hint" },
    {
      at: iso(NOW - DAY + 1_000),
      outcome: "viewed",
      independent: false,
      support: "reveal",
      mode: "reveal",
      variant: "revealed-model",
      kind: "viewed",
      objective: false,
      blind: false,
      productive: false,
      preReveal: false,
      evaluator: "",
      responseMode: "none",
      response: "",
      responseHash: "",
      grade: null,
      legacy: false,
    },
  ];
  for (const invalidator of invalidators) {
    let record = null;
    record = State.recordEvidence(record, demonstrated({ at: iso(NOW - 3 * DAY), variant: "master-a" }), { now: NOW }).record;
    record = State.recordEvidence(record, demonstrated({ at: iso(NOW - 2 * DAY), variant: "master-b" }), { now: NOW }).record;
    assert.equal(State.isMastered(record, { now: NOW }), true);
    record = State.recordEvidence(record, invalidator, { now: NOW }).record;
    assert.equal(State.isMastered(record, { now: NOW }), false);
    assert.equal(record.masteryProof.length, 0);
    assert.equal(record.historicalMasteredAt, iso(NOW - 2 * DAY));
    assert.equal(State.masteryStatus(record, { now: NOW }), "needs-reconfirmation");
  }
});

test("ELP gate, due IDs and daily completion records are deeply bounded", () => {
  const sessionIds = COURSE.elpStepOneIds;
  const dailyAttempts = Array.from({ length: 140 }, (_, index) => ({
    date: "2026-08-21",
    at: iso(NOW - 1000 + index),
    taskType: "words",
    bucket: "words",
    id: "c:make",
    completed: true,
    result: "independent",
    ignored: "<img onerror=alert(1)>",
  }));
  const result = State.normalizeState({
    version: 4,
    profile: "tractor",
    onboardingComplete: true,
    elpGate: {
      sessionIds,
      results: Object.fromEntries(sessionIds.map((id, index) => [id, gateResult(index, index === 0 ? { evaluator: "<script>" } : {})])),
      startedAt: iso(NOW - 10_000),
      completedAt: iso(NOW - 1_000),
      status: "passed",
      attempts: 999999,
      extra: "untrusted",
    },
    dailyPlan: {
      date: "2026-08-21",
      refresh: 0,
      profile: "tractor",
      dueIds: ["truck-001", "unknown", "truck-001"],
      dueQuestionIds: ["question-01"],
      dueSignIds: ["sign-01"],
      dueSituationIds: ["situation-01"],
      dueDocumentIds: ["doc-01"],
      dueLessonIds: ["lesson-01"],
      coreIds: ["c:make"],
      truckIds: ["truck-001"],
      hotshotIds: [],
      signIds: ["sign-01"],
      lessonId: "lesson-01",
      situationId: "situation-01",
      documentId: "doc-01",
    },
    dailyAttempts,
  }, COURSE, { now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.state.elpGate.sessionIds.length, 7);
  assert.equal(result.state.elpGate.attempts, 32);
  assert.equal(result.state.elpGate.results["q:stop"], undefined);
  assert.equal(result.state.elpGate.results["q:destination"].pass, true);
  assert.equal(result.state.elpGate.status, "failed");
  assert.deepEqual(result.state.dailyPlan.dueIds, ["t:brake"]);
  assert.deepEqual(result.state.dailyPlan.dueQuestionIds, ["q:stop"]);
  assert.deepEqual(result.state.dailyPlan.dueSignIds, ["sign:stop"]);
  assert.deepEqual(result.state.dailyPlan.dueSituationIds, ["situation:roadside"]);
  assert.deepEqual(result.state.dailyPlan.dueDocumentIds, ["doc:cdl"]);
  assert.deepEqual(result.state.dailyPlan.dueLessonIds, ["lesson:intro"]);
  assert.equal(result.state.dailyAttempts.length, 120);
  assert.equal(result.state.dailyAttempts.every(item => item.completed === false), true);
  assert.equal(result.state.dailyAttempts.every(item => item.contextKey === State.qualificationContextKey("tractor", result.state.applicability)), true);
  assert.equal(Object.hasOwn(result.state.dailyAttempts[0], "ignored"), false);
});

test("legacy contextless ELP evidence is retained but readiness is downgraded", () => {
  const sessionIds = COURSE.elpStepOneIds;
  const full = State.normalizeState({
    version: 4,
    elpGate: {
      sessionIds,
      results: Object.fromEntries(sessionIds.map((id, index) => [id, gateResult(index)])),
      startedAt: iso(NOW - 20_000),
      completedAt: iso(NOW - 1_000),
      status: "failed",
      attempts: 1,
    },
    updatedAt: iso(NOW - 1_000),
  }, COURSE, { now: NOW });
  assert.equal(full.state.elpGate.status, "failed");
  assert.equal(full.state.elpGate.completedAt, iso(NOW - 10_000 + sessionIds.length - 1));

  const forged = State.normalizeState({
    version: 2,
    elpGate: {
      sessionIds: [sessionIds[0]],
      results: { [sessionIds[0]]: gateResult(0) },
      startedAt: iso(NOW - 20_000),
      completedAt: iso(NOW - 1_000),
      status: "passed",
      attempts: 1,
    },
    updatedAt: iso(NOW - 1_000),
  }, COURSE, { now: NOW });
  assert.equal(forged.state.elpGate, null);
});

test("storage write failures are caught and an interrupted save rolls back", () => {
  class OneShotFailureStorage extends State.MemoryStorage {
    constructor(initial, failureKey) {
      super(initial);
      this.failureKey = failureKey;
      this.failed = false;
    }

    setItem(key, value) {
      if (key === this.failureKey && !this.failed) {
        this.failed = true;
        throw new Error("quota blocked");
      }
      super.setItem(key, value);
    }
  }

  const originalPrimary = JSON.stringify(legacyState({ words: { "truck-001": { completedAt: iso(NOW - 3 * DAY) } } }));
  const originalBackup = JSON.stringify(legacyState({ words: { "c:go": { completedAt: iso(NOW - 4 * DAY) } } }));
  const storage = new OneShotFailureStorage({
    "test-state": originalPrimary,
    "test-state-backup": originalBackup,
  }, "test-state");
  const store = storeWith(storage);
  const result = store.save(store.defaultState());
  assert.equal(result.ok, false);
  assert.equal(result.errorType, "persistence");
  assert.equal(result.staged, true);
  assert.equal(storage.getItem("test-state"), originalPrimary);
  assert.equal(storage.getItem("test-state-backup"), originalBackup);
  assert.equal(JSON.parse(storage.getItem("test-state-staging")).state.version, 5);

  const initialBackupFailure = new OneShotFailureStorage({}, "test-state-backup");
  const initialStore = storeWith(initialBackupFailure);
  const initialFailure = initialStore.save(initialStore.defaultState());
  assert.equal(initialFailure.ok, false);
  assert.equal(initialFailure.errorType, "persistence");
  assert.equal(initialBackupFailure.getItem("test-state"), null);
  assert.equal(initialBackupFailure.getItem("test-state-backup"), null);
  assert.equal(JSON.parse(initialBackupFailure.getItem("test-state-staging")).state.version, 5);

  const unavailable = {
    getItem() { throw new Error("disabled"); },
    setItem() { throw new Error("disabled"); },
    removeItem() { throw new Error("disabled"); },
  };
  const loaded = storeWith(unavailable).load();
  assert.equal(loaded.source, "default");
  assert.equal(loaded.state.version, 5);
});

test("save rejects an undecodable oversized state before touching healthy storage", () => {
  const storage = new State.MemoryStorage();
  const smallFixture = evidenceHeavyFixture(138);
  const store = State.createStateStore({
    storage,
    courseData: smallFixture.course,
    storageKey: "size-state",
    now: () => NOW,
  });
  const saved = store.save(smallFixture.state);
  assert.equal(saved.ok, true);
  assert.equal(store.load().source, "main");
  assert.equal(Object.keys(store.load().state.words).length, 138);
  const healthyPrimary = storage.getItem("size-state");
  const healthyBackup = storage.getItem("size-state-backup");

  const largeFixture = evidenceHeavyFixture(145);
  assert.ok(JSON.stringify(largeFixture.state).length > 2 * 1024 * 1024);
  const oversizedStore = State.createStateStore({
    storage,
    courseData: largeFixture.course,
    storageKey: "size-state",
    now: () => NOW,
  });
  const rejected = oversizedStore.save(largeFixture.state);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.errorType, "persistence");
  assert.match(rejected.error, /safe storage size/);
  assert.equal(storage.getItem("size-state"), healthyPrimary);
  assert.equal(storage.getItem("size-state-backup"), healthyBackup);
  assert.equal(storage.getItem("size-state-staging"), null);

  const recovered = store.load();
  assert.equal(recovered.source, "main");
  assert.equal(Object.keys(recovered.state.words).length, 138);
});

test("load reports failed backup repair and failed backup promotion writes", () => {
  class BlockedKeyStorage extends State.MemoryStorage {
    constructor(initial, blockedKey) {
      super(initial);
      this.blockedKey = blockedKey;
    }

    setItem(key, value) {
      if (key === this.blockedKey) throw new Error("recovery write blocked");
      super.setItem(key, value);
    }
  }

  const valid = storeWith().defaultState();
  const validRaw = JSON.stringify(valid);
  const repairStorage = new BlockedKeyStorage({
    "test-state": validRaw,
    "test-state-backup": "{broken",
  }, "test-state-backup");
  const repair = storeWith(repairStorage).load();
  assert.equal(repair.source, "main");
  assert.equal(repair.persistenceError, true);
  assert.match(repair.issues.join(" "), /setItem failed/);

  const promotionStorage = new BlockedKeyStorage({
    "test-state": "{broken",
    "test-state-backup": validRaw,
  }, "test-state");
  const promotion = storeWith(promotionStorage).load();
  assert.equal(promotion.source, "backup");
  assert.equal(promotion.persistenceError, true);
  assert.equal(promotionStorage.getItem("test-state-backup"), validRaw);
  assert.match(promotion.issues.join(" "), /setItem failed/);
});

test("failed staging promotion returns the newest state and preserves the transaction", () => {
  class PromotionFailureStorage extends State.MemoryStorage {
    constructor(initial) {
      super(initial);
      this.blockPrimary = true;
    }

    setItem(key, value) {
      if (key === "test-state" && this.blockPrimary) throw new Error("quota blocked");
      super.setItem(key, value);
    }
  }

  const primary = storeWith().defaultState();
  primary.profile = "tractor";
  primary.updatedAt = iso(NOW - 1_000);
  const staging = JSON.parse(JSON.stringify(primary));
  staging.profile = "hotshot-open";
  staging.updatedAt = iso(NOW);
  const envelope = JSON.stringify({
    kind: "truck-state-transaction-v1",
    createdAt: staging.updatedAt,
    state: staging,
  });
  const storage = new PromotionFailureStorage({
    "test-state": JSON.stringify(primary),
    "test-state-backup": JSON.stringify(primary),
    "test-state-staging": envelope,
  });
  const store = storeWith(storage);
  const failed = store.load();
  assert.equal(failed.source, "staging");
  assert.equal(failed.state.profile, "hotshot-open");
  assert.equal(failed.persistenceError, true);
  assert.equal(failed.stagingPreserved, true);
  assert.equal(storage.getItem("test-state-staging"), envelope);

  storage.blockPrimary = false;
  const recovered = store.load();
  assert.equal(recovered.source, "staging");
  assert.equal(JSON.parse(storage.getItem("test-state")).profile, "hotshot-open");
  assert.equal(storage.getItem("test-state-staging"), null);
});

test("equal-timestamp staging is promoted unless it fully matches primary", () => {
  const primary = storeWith().defaultState();
  primary.profile = "tractor";
  primary.updatedAt = iso(NOW);
  const staged = JSON.parse(JSON.stringify(primary));
  staged.profile = "hotshot-enclosed";
  const storage = new State.MemoryStorage({
    "test-state": JSON.stringify(primary),
    "test-state-backup": JSON.stringify(primary),
    "test-state-staging": JSON.stringify({ kind: "truck-state-transaction-v1", createdAt: iso(NOW), state: staged }),
  });
  const loaded = storeWith(storage).load();
  assert.equal(loaded.source, "staging");
  assert.equal(loaded.state.profile, "hotshot-enclosed");
  assert.equal(storage.getItem("test-state-staging"), null);

  const canonical = JSON.parse(storage.getItem("test-state"));
  storage.setItem("test-state-staging", JSON.stringify({ kind: "truck-state-transaction-v1", createdAt: iso(NOW), state: canonical }));
  const matched = storeWith(storage).load();
  assert.equal(matched.source, "main");
  assert.equal(storage.getItem("test-state-staging"), null);
});

test("a later failure invalidates mastery even after the failure rotates out", () => {
  let record = null;
  record = State.recordEvidence(record, demonstrated({ at: iso(NOW - 4 * DAY), variant: "proof-a" }), { now: NOW }).record;
  record = State.recordEvidence(record, demonstrated({ at: iso(NOW - 3 * DAY), variant: "proof-b" }), { now: NOW }).record;
  const masteredAt = record.masteredAt;
  assert.equal(State.isMastered(record, { now: NOW }), true);
  for (let index = 0; index < 25; index += 1) {
    record = State.recordEvidence(record, demonstrated({
      at: iso(NOW - DAY + index * 1_000),
      outcome: "failed",
      independent: false,
      variant: `failure-${index}`,
    }), { now: NOW }).record;
  }
  assert.equal(record.evidence.length, 20);
  assert.equal(record.evidence.some(item => item.variant === "proof-a"), false);
  assert.equal(record.masteryProof.length, 0);
  assert.equal(record.masteredAt, null);
  assert.equal(record.historicalMasteredAt, masteredAt);
  assert.equal(State.isMastered(record, { now: NOW }), false);
  assert.equal(State.masteryStatus(record, { now: NOW }), "needs-reconfirmation");
  const lastAttemptAt = Date.parse(record.lastAttemptAt);
  assert.equal(record.nextDueAt, iso(lastAttemptAt + 10 * 60 * 1_000));

  record = State.recordEvidence(record, demonstrated({
    at: iso(NOW - 30_000),
    variant: "correction-c",
  }), { now: NOW }).record;
  assert.equal(State.isMastered(record, { now: NOW }), false);
  record = State.recordEvidence(record, demonstrated({
    at: iso(NOW - 30_000 + DAY),
    variant: "transfer-d",
  }), { now: NOW + DAY }).record;
  assert.equal(State.isMastered(record, { now: NOW + DAY }), true);
});

test("scheduler labels and exact dueAt intervals share one source", () => {
  const cases = [
    ["again", "failed", false, 10 * 60 * 1_000, "Снова · 10 минут"],
    ["hard", "partial", false, DAY, "Трудно · 1 день"],
    ["good", "success", true, 3 * DAY, "Хорошо · 3 дня"],
    ["easy", "success", true, 7 * DAY, "Легко · 7 дней"],
  ];
  const state = storeWith().defaultState();
  for (const [grade, outcome, independent, intervalMs, label] of cases) {
    const result = State.recordEvidence(null, demonstrated({
      at: iso(NOW),
      outcome,
      independent,
      grade,
      variant: `grade-${grade}`,
    }), { now: NOW });
    assert.equal(result.record.nextDueAt, iso(NOW + intervalMs));
    assert.equal(State.SRS_GRADES[grade].intervalMs, intervalMs);
    assert.equal(State.SRS_GRADES[grade].label, label);
    assert.equal(State.SRS_GRADES[grade].intervalMs, Core.SRS_OPTIONS[grade].intervalMs);
    assert.equal(State.SRS_GRADES[grade].label, Core.SRS_OPTIONS[grade].label);
    state.words[grade === "again" ? "c:make" : "c:go"] = result.record;
  }
  assert.equal(State.nextDueDeadline(state, { now: NOW }), iso(NOW + 10 * 60 * 1_000));

  const store = storeWith();
  let appState = store.defaultState();
  appState = store.recordAttempt(appState, "words", "c:make", demonstrated({ at: iso(NOW), variant: "card-a" })).state;
  appState.words["c:make"] = Core.applyCardSchedule(appState.words["c:make"], "easy", NOW);
  const saved = store.save(appState);
  assert.equal(saved.ok, true);
  assert.equal(saved.state.words["c:make"].lastGrade, "easy");
  assert.equal(saved.state.words["c:make"].intervalDays, 7);
  assert.equal(saved.state.words["c:make"].dueAt, iso(NOW + 7 * DAY));
});

test("a failed learning attempt cannot be postponed by a longer SRS grade", () => {
  for (const grade of ["hard", "good", "easy"]) {
    let record = State.recordEvidence(null, demonstrated({
      at: iso(NOW),
      outcome: "failed",
      independent: false,
      grade,
      variant: `failed-${grade}`,
    }), { now: NOW }).record;
    assert.equal(record.nextDueAt, iso(NOW + 10 * 60 * 1_000));
    assert.equal(record.lastGrade, undefined);

    record = {
      ...record,
      lastGrade: grade,
      lastReviewed: iso(NOW),
      nextDueAt: iso(NOW + 7 * DAY),
      dueAt: iso(NOW + 7 * DAY),
      intervalDays: 7,
    };
    const state = storeWith().defaultState();
    state.words["c:make"] = record;
    const normalized = storeWith().normalize(state);
    assert.equal(normalized.ok, true);
    assert.equal(normalized.state.words["c:make"].nextDueAt, iso(NOW + 10 * 60 * 1_000));
    assert.equal(normalized.state.words["c:make"].lastGrade, undefined);
  }
});

test("error journal closes only after blind correction and spaced transfer confirmation", () => {
  let clock = NOW - 2 * DAY;
  const store = storeWith(new State.MemoryStorage(), () => clock);
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  let result = store.addError(state, {
    type: "word",
    id: "c:make",
    text: "make",
    reason: "Wrong meaning",
    errorType: "meaning",
    drill: "typed-translation-retrieval",
  });
  assert.equal(result.ok, true);
  assert.equal(result.record.stage, "open");
  state = result.state;

  result = store.recordErrorAttempt(state, "word", "c:make", {
    outcome: "success",
    independent: true,
    support: "none",
    mode: "self-click",
    variant: "self",
  });
  assert.equal(result.record.stage, "open");
  state = result.state;

  result = store.recordErrorAttempt(state, "word", "c:make", demonstrated({ variant: "correction-a" }));
  assert.equal(result.record.stage, "corrected-awaiting-confirmation");
  assert.equal(result.record.correctedAt, iso(clock));
  assert.equal(result.record.confirmationDueAt, iso(clock + DAY));
  assert.equal(result.record.resolutionProof.length, 1);
  assert.equal(store.save(result.state).ok, true);
  state = result.state;

  for (let index = 0; index < 25; index += 1) {
    clock += 1_000;
    result = store.recordErrorAttempt(state, "word", "c:make", demonstrated({
      outcome: "failed",
      independent: false,
      variant: `failure-${index}`,
    }));
    state = result.state;
  }
  assert.equal(result.record.evidence.length, 20);
  assert.equal(result.record.evidence.some(item => item.variant === "correction-a"), false);
  assert.equal(result.record.resolutionProof.length, 0);
  assert.equal(result.record.stage, "open");

  clock += DAY;
  result = store.recordErrorAttempt(state, "word", "c:make", demonstrated({ variant: "correction-a" }));
  assert.equal(result.record.stage, "corrected-awaiting-confirmation");
  assert.equal(result.closed, false);
  state = result.state;

  clock += DAY;
  result = store.recordErrorAttempt(state, "word", "c:make", demonstrated({ variant: "transfer-b" }));
  assert.equal(result.record.stage, "closed");
  assert.equal(result.closed, true);
  assert.equal(result.record.resolutionProof.length, 2);
});

test("error correction is isolated by profile context and regulatory branch", () => {
  let clock = NOW - 3 * DAY;
  const store = storeWith(new State.MemoryStorage(), () => clock);
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  state.applicability.conditions.cargo = true;
  state.applicability.conditions.cargoSecurement = true;
  state.applicability.conditions.vehicleTransport = true;
  state.applicability.conditions.transportedVehicleAtMost10000Lb = true;
  const tractorApplicability = JSON.parse(JSON.stringify(state.applicability));
  const tractorContext = qualificationFields(state).contextKey;

  let result = store.addError(state, {
    type: "question",
    id: "q:reinspection",
    text: "Vehicle securement branch",
    reason: "Used the wrong vehicle-weight rule",
    semanticBranch: "securement:393.128",
  });
  assert.equal(result.ok, true);
  assert.equal(result.record.contextKey, tractorContext);
  assert.equal(result.record.semanticBranch, "securement:393.128");
  state = result.state;

  const wrongBranchLearning = store.recordAttempt(state, "questions", "q:reinspection", {
    ...demonstrated({ variant: "same-profile-wrong-branch" }),
    semanticBranch: "securement:393.130",
  });
  assert.equal(wrongBranchLearning.ok, true);
  assert.equal(wrongBranchLearning.state.errorJournal[0].stage, "open");
  assert.equal(wrongBranchLearning.state.errorJournal[0].evidence.length, 0);
  state = wrongBranchLearning.state;

  state.profile = "hotshot-open";
  state.applicability.conditions.transportedVehicleAtMost10000Lb = false;
  state.applicability.conditions.transportedVehicleOver10000Lb = true;
  const hotshotContext = qualificationFields(state).contextKey;
  result = store.recordErrorAttempt(state, "question", "q:reinspection", {
    ...demonstrated({ variant: "hotshot-wrong-branch" }),
    semanticBranch: "securement:393.130",
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /not open/i);
  state = result.state;

  result = store.addError(state, {
    type: "question",
    id: "q:reinspection",
    text: "Heavy vehicle securement branch",
    reason: "Used the wrong over-10,000-lb rule",
    semanticBranch: "securement:393.130",
  });
  assert.equal(result.ok, true);
  assert.equal(result.record.contextKey, hotshotContext);
  assert.equal(result.state.errorJournal.length, 2);
  state = result.state;

  state.profile = "tractor";
  state.applicability = tractorApplicability;
  result = store.recordErrorAttempt(state, "question", "q:reinspection", {
    ...demonstrated({ variant: "tractor-correction" }),
    semanticBranch: "securement:393.128",
  });
  assert.equal(result.ok, true);
  assert.equal(result.record.stage, "corrected-awaiting-confirmation");
  state = result.state;

  clock += DAY;
  result = store.recordErrorAttempt(state, "question", "q:reinspection", {
    ...demonstrated({ variant: "tractor-transfer" }),
    semanticBranch: "securement:393.128",
  });
  assert.equal(result.ok, true);
  assert.equal(result.record.stage, "closed");
  const hotshotError = result.state.errorJournal.find(item => item.contextKey === hotshotContext);
  assert.equal(hotshotError.stage, "open");
  assert.equal(hotshotError.resolutionProof.length, 0);

  const contextless = JSON.parse(JSON.stringify(result.state));
  const closed = contextless.errorJournal.find(item => item.contextKey === tractorContext);
  delete closed.contextKey;
  delete closed.semanticBranch;
  const downgraded = store.normalize(contextless);
  const downgradedRecord = downgraded.state.errorJournal.find(item => item.id === "q:reinspection" && item.contextKey === null);
  assert.equal(downgradedRecord.stage, "open");
  assert.equal(downgradedRecord.resolutionProof.length, 0);

  const malformed = JSON.parse(JSON.stringify(result.state));
  malformed.errorJournal[0].contextKey = "{not-canonical}";
  assert.equal(store.save(malformed).ok, false);
});

test("profile-materialized errors ignore unrelated toggles but remain profile-isolated", () => {
  const course = {
    ...COURSE,
    inspectionQuestions: [
      ...COURSE.inspectionQuestions,
      {
        id: "q:hauling-context",
        profileMaterializations: {
          tractor: { answer: "I am hauling packaged food." },
          "hotshot-open": { answer: "I am hauling vehicles." },
          "hotshot-enclosed": { answer: "I am hauling a passenger vehicle." },
        },
      },
    ],
  };
  let clock = NOW - DAY;
  const store = State.createStateStore({
    storage: new State.MemoryStorage(),
    courseData: course,
    storageKey: "profile-materialized-error",
    now: () => clock,
  });
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  let result = store.addError(state, {
    type: "question",
    id: "q:hauling-context",
    text: "What are you hauling?",
    reason: "Wrong commodity",
  });
  assert.equal(result.ok, true);
  assert.equal(result.record.contextKey, null);
  assert.equal(result.record.semanticBranch, "scope:profile:tractor");
  state = result.state;

  result = store.recordAttempt(state, "questions", "q:hauling-context", demonstrated({
    at: iso(clock),
    variant: "profile:tractor|cargo-primary",
  }));
  assert.equal(result.ok, true);
  assert.equal(result.evidence.semanticBranch, "scope:profile:tractor");
  assert.equal(result.state.errorJournal[0].stage, "corrected-awaiting-confirmation");
  state = result.state;

  state.applicability.conditions.hazmat = true;
  state.applicability.conditions.eld = true;
  clock = NOW;
  result = store.recordAttempt(state, "questions", "q:hauling-context", demonstrated({
    at: iso(clock),
    variant: "profile:tractor|cargo-transfer",
  }));
  assert.equal(result.ok, true);
  assert.equal(State.isMastered(result.record, { now: clock }), true);
  assert.equal(result.state.errorJournal.length, 1);
  assert.equal(result.state.errorJournal[0].stage, "closed");
  state = result.state;

  state.applicability.conditions.hazmat = false;
  state.applicability.conditions.eld = false;
  const returned = store.normalize(state);
  assert.equal(returned.ok, true);
  assert.equal(returned.state.errorJournal[0].stage, "closed");
  assert.equal(returned.state.errorJournal[0].semanticBranch, "scope:profile:tractor");

  state = returned.state;
  state.profile = "hotshot-open";
  result = store.addError(state, {
    type: "question",
    id: "q:hauling-context",
    text: "What are you hauling?",
    reason: "Wrong Hotshot commodity",
  });
  assert.equal(result.ok, true);
  assert.equal(result.record.semanticBranch, "scope:profile:hotshot-open");
  assert.equal(result.state.errorJournal.length, 2);
  assert.equal(result.state.errorJournal.find(item => item.semanticBranch === "scope:profile:tractor").stage, "closed");
  assert.equal(result.state.errorJournal.find(item => item.semanticBranch === "scope:profile:hotshot-open").stage, "open");
});

test("condition-materialized error scope isolates the actual securement branch", () => {
  const atMost = "transported-automobile-or-light-truck-at-most-10000-lb";
  const over = "transported-automobile-or-light-truck-over-10000-lb";
  const course = {
    ...COURSE,
    inspectionQuestions: [
      ...COURSE.inspectionQuestions,
      {
        id: "q:securement-context",
        profileMaterializations: {
          tractor: { answer: "Load bars." },
          "hotshot-open": { answer: "Vehicle tiedowns." },
          "hotshot-enclosed": { answer: "Vehicle tiedowns." },
        },
        conditionMaterializations: {
          [atMost]: {
            branchId: "vehicle-at-most-10000-lb",
            profiles: ["hotshot-open", "hotshot-enclosed"],
            conditions: ["vehicle-transport", "cargo-securement", atMost],
          },
          [over]: {
            branchId: "vehicle-over-10000-lb",
            profiles: ["hotshot-open", "hotshot-enclosed"],
            conditions: ["vehicle-transport", "cargo-securement", over],
          },
        },
      },
    ],
  };
  let clock = NOW - DAY;
  const store = State.createStateStore({
    storage: new State.MemoryStorage(),
    courseData: course,
    storageKey: "condition-materialized-error",
    now: () => clock,
  });
  let state = store.defaultState();
  state.profile = "hotshot-open";
  state.onboardingComplete = true;
  Object.assign(state.applicability.conditions, {
    cargo: true,
    cargoSecurement: true,
    vehicleTransport: true,
    transportedVehicleAtMost10000Lb: true,
  });
  const atMostScope = `scope:profile:hotshot-open|condition:${atMost}`;
  const overScope = `scope:profile:hotshot-open|condition:${over}`;
  let result = store.addError(state, {
    type: "question",
    id: "q:securement-context",
    text: "Securement rule",
    reason: "Wrong branch",
  });
  assert.equal(result.ok, true);
  assert.equal(result.record.contextKey, null);
  assert.equal(result.record.semanticBranch, atMostScope);
  state = result.state;

  result = store.recordAttempt(state, "questions", "q:securement-context", demonstrated({
    at: iso(clock),
    variant: `profile:hotshot-open|condition:${atMost}|primary`,
  }));
  assert.equal(result.ok, true);
  state = result.state;
  state.applicability.conditions.hazmat = true;
  clock = NOW;
  result = store.recordAttempt(state, "questions", "q:securement-context", demonstrated({
    at: iso(clock),
    variant: `profile:hotshot-open|condition:${atMost}|transfer`,
  }));
  assert.equal(result.ok, true);
  assert.equal(result.state.errorJournal.find(item => item.semanticBranch === atMostScope).stage, "closed");
  state = result.state;

  state.applicability.conditions.transportedVehicleAtMost10000Lb = false;
  state.applicability.conditions.transportedVehicleOver10000Lb = true;
  result = store.addError(state, {
    type: "question",
    id: "q:securement-context",
    text: "Heavy securement rule",
    reason: "Wrong heavy branch",
  });
  assert.equal(result.ok, true);
  assert.equal(result.record.semanticBranch, overScope);
  assert.equal(result.state.errorJournal.find(item => item.semanticBranch === atMostScope).stage, "closed");
  assert.equal(result.state.errorJournal.find(item => item.semanticBranch === overScope).stage, "open");

  const wrongBranch = store.recordErrorAttempt(result.state, "question", "q:securement-context", {
    ...demonstrated({ at: iso(clock), variant: "wrong-branch" }),
    semanticBranch: atMostScope,
  });
  assert.equal(wrongBranch.ok, false);
  assert.match(wrongBranch.error, /materialization scope/i);
});

test("current v5 full-context errors migrate and merge into their semantic materialization scope", () => {
  const course = {
    ...COURSE,
    inspectionQuestions: [
      ...COURSE.inspectionQuestions,
      {
        id: "q:hauling-v5-migration",
        profileMaterializations: {
          tractor: { answer: "Packaged food." },
          "hotshot-open": { answer: "Vehicles." },
          "hotshot-enclosed": { answer: "A passenger vehicle." },
        },
      },
    ],
  };
  const store = State.createStateStore({
    storage: new State.MemoryStorage(),
    courseData: course,
    storageKey: "contextual-v5-migration",
    now: () => NOW,
  });
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  const added = store.addError(state, {
    type: "question",
    id: "q:hauling-v5-migration",
    text: "What are you hauling?",
    reason: "Wrong commodity",
  });
  assert.equal(added.ok, true);
  const template = JSON.parse(JSON.stringify(added.record));
  const oldRecord = (hazmat, evidence) => {
    const contextualState = JSON.parse(JSON.stringify(added.state));
    contextualState.applicability.conditions.hazmat = hazmat;
    const contextKey = qualificationFields(contextualState).contextKey;
    const record = JSON.parse(JSON.stringify(template));
    record.contextKey = contextKey;
    record.semanticBranch = null;
    record.evidence = [{ ...evidence, contextKey }];
    record.resolutionProof = [];
    record.stage = "open";
    record.updatedAt = evidence.at;
    return record;
  };
  const first = demonstrated({ at: iso(NOW - DAY), variant: "profile:tractor|legacy-primary" });
  const second = demonstrated({ at: iso(NOW), variant: "profile:tractor|legacy-transfer" });
  const raw = JSON.parse(JSON.stringify(added.state));
  raw.applicability.conditions.hazmat = true;
  raw.errorJournal = [oldRecord(false, first), oldRecord(true, second)];

  const migrated = store.normalize(raw);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.state.errorJournal.length, 1);
  assert.equal(migrated.state.errorJournal[0].contextKey, null);
  assert.equal(migrated.state.errorJournal[0].semanticBranch, "scope:profile:tractor");
  assert.equal(migrated.state.errorJournal[0].stage, "closed");
  assert.equal(migrated.state.errorJournal[0].resolutionProof.length, 2);
  assert.equal(migrated.state.errorJournal[0].evidence.every(item => (
    item.contextKey === undefined && item.semanticBranch === "scope:profile:tractor"
  )), true);
  assert.equal(store.save(migrated.state).ok, true);
  assert.equal(store.load().state.errorJournal[0].semanticBranch, "scope:profile:tractor");
});

test("unchanged content shares one error recovery binding across profiles", () => {
  const store = storeWith(new State.MemoryStorage(), () => NOW);
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  let result = store.addError(state, {
    type: "word",
    id: "c:make",
    text: "make",
    reason: "Generic recall failed",
    contextKey: null,
    semanticBranch: "shared:words:c:make",
  });
  assert.equal(result.ok, true);
  assert.equal(result.record.contextKey, null);
  state = result.state;
  result = store.recordAttempt(state, "words", "c:make", demonstrated({ at: iso(NOW - DAY), variant: "translation-to-english" }));
  assert.equal(result.ok, true);
  const prePatch = JSON.parse(JSON.stringify(result.state));
  const oldContext = qualificationFields(prePatch).contextKey;
  for (const evidence of prePatch.words["c:make"].evidence) delete evidence.semanticBranch;
  for (const evidence of prePatch.words["c:make"].masteryProof) delete evidence.semanticBranch;
  prePatch.errorJournal[0].contextKey = oldContext;
  prePatch.errorJournal[0].semanticBranch = null;
  for (const evidence of prePatch.errorJournal[0].evidence) {
    evidence.contextKey = oldContext;
    delete evidence.semanticBranch;
  }
  for (const evidence of prePatch.errorJournal[0].resolutionProof) {
    evidence.contextKey = oldContext;
    delete evidence.semanticBranch;
  }
  const migrated = store.normalize(prePatch);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.state.words["c:make"].evidence[0].semanticBranch, undefined);
  assert.equal(migrated.state.errorJournal[0].contextKey, null);
  assert.equal(migrated.state.errorJournal[0].semanticBranch, "shared:words:c:make");
  assert.equal(store.save(migrated.state).ok, true);
  state = store.load().state;
  assert.equal(state.errorJournal[0].semanticBranch, "shared:words:c:make");
  state.profile = "hotshot-open";

  result = store.recordAttempt(state, "words", "c:make", demonstrated({
    at: iso(NOW),
    variant: "example-gap",
  }));
  assert.equal(result.ok, true);
  assert.equal(State.isMastered(result.record), true);
  assert.equal(result.state.errorJournal[0].stage, "closed");
  assert.equal(result.state.errorJournal[0].resolutionProof.length, 2);
});

test("contextual content rejects a forged shared error binding", () => {
  const contextualCourse = {
    ...COURSE,
    inspectionQuestions: [
      ...COURSE.inspectionQuestions,
      { id: "q:contextual", profileMaterializations: { tractor: { answer: "Tractor" }, "hotshot-open": { answer: "Hotshot" } } },
    ],
  };
  const store = State.createStateStore({ storage: new State.MemoryStorage(), courseData: contextualCourse, storageKey: "contextual-shared", now: () => NOW });
  const state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  const added = store.addError(state, {
    type: "question",
    id: "q:contextual",
    text: "Profile answer",
    reason: "Wrong profile answer",
    contextKey: null,
    semanticBranch: "shared:questions:q:contextual",
  });
  assert.equal(added.ok, false);
  assert.match(added.error, /shared error binding/i);
});

test("shared error migration keeps the latest invalidation across profile records", () => {
  const store = storeWith(new State.MemoryStorage(), () => NOW);
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  let result = store.addError(state, { type: "word", id: "c:make", text: "make", reason: "miss" });
  state = result.state;
  result = store.recordErrorAttempt(state, "word", "c:make", demonstrated({ at: iso(NOW - 3 * DAY), variant: "first" }));
  state = result.state;
  result = store.recordErrorAttempt(state, "word", "c:make", demonstrated({ at: iso(NOW - 2 * DAY), variant: "second" }));
  const closed = JSON.parse(JSON.stringify(result.state.errorJournal[0]));
  const tractorContext = qualificationFields(state).contextKey;
  const hotshotState = { ...state, profile: "hotshot-open" };
  const hotshotContext = qualificationFields(hotshotState).contextKey;
  const rebind = (record, contextKey) => {
    record.contextKey = contextKey;
    record.semanticBranch = null;
    for (const evidence of [...record.evidence, ...record.resolutionProof]) {
      evidence.contextKey = contextKey;
      delete evidence.semanticBranch;
    }
    return record;
  };
  const older = rebind(JSON.parse(JSON.stringify(closed)), tractorContext);
  older.resolutionInvalidatedAt = iso(NOW - 4 * DAY);
  const newer = rebind(JSON.parse(JSON.stringify(closed)), hotshotContext);
  newer.evidence = [demonstrated({ at: iso(NOW - DAY), outcome: "failed", variant: "relapse" })];
  newer.resolutionProof = [];
  newer.resolutionInvalidatedAt = iso(NOW - DAY);
  newer.stage = "open";
  newer.correctedAt = null;
  newer.confirmationDueAt = null;
  newer.confirmedAt = null;
  const raw = { ...result.state, errorJournal: [older, newer] };
  const migrated = store.normalize(raw);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.issues.some(issue => issue.includes("invalid errorJournal contextKey")), false);
  assert.equal(migrated.state.errorJournal.length, 1);
  assert.equal(migrated.state.errorJournal[0].semanticBranch, "shared:words:c:make");
  assert.equal(migrated.state.errorJournal[0].resolutionInvalidatedAt, iso(NOW - DAY));
  assert.equal(migrated.state.errorJournal[0].stage, "open");
  assert.equal(store.save(migrated.state).ok, true);
  assert.equal(store.load().state.errorJournal[0].stage, "open");
});

test("deep allowlists reject unknown diagnostic, branch and daily IDs", () => {
  assert.equal(storeWith().prepareImport(JSON.stringify({
    version: 2,
    updatedAt: iso(NOW - 1_000),
    words: { "word:does-not-exist": { completedAt: iso(NOW - DAY) } },
  })).ok, false);

  const state = storeWith().defaultState();
  state.branchingProgress["branch-999999"] = { correct: true, completedAt: iso(NOW - 1_000) };
  assert.equal(storeWith().prepareImport(JSON.stringify(state)).ok, false);

  const errorState = storeWith().defaultState();
  errorState.errorJournal.push({
    type: "diagnostic",
    id: "diagnostic-does-not-exist",
    text: "bad",
    reason: "bad",
    errorType: "unknown",
    drill: "unknown",
    openedAt: iso(NOW - 1_000),
    updatedAt: iso(NOW - 1_000),
    evidence: [],
    resolutionProof: [],
    correctedAt: null,
    confirmationDueAt: null,
    confirmedAt: null,
    stage: "open",
  });
  assert.equal(storeWith().prepareImport(JSON.stringify(errorState)).ok, false);

  const normalized = State.normalizeState({
    version: 4,
    branchingProgress: { "branch-999999": { correct: true, completedAt: iso(NOW - 1_000) } },
    dailyAttempts: [{ date: "2026-08-21", at: iso(NOW - 1_000), taskType: "diagnostic", bucket: null, id: "diagnostic-does-not-exist", completed: true, result: "failed" }],
  }, COURSE, { now: NOW });
  assert.deepEqual(Object.keys(normalized.state.branchingProgress), []);
  assert.deepEqual(normalized.state.dailyAttempts, []);
  assert.ok(normalized.issues.some(issue => issue.includes("unknown branching id")));

  const gateState = storeWith().defaultState();
  gateState.elpGate = {
    sessionIds: COURSE.elpStepOneIds,
    results: {},
    resultTimes: { "question:does-not-exist": iso(NOW - 1_000) },
    startedAt: iso(NOW - 2_000),
    completedAt: null,
    status: "pending",
    attempts: 1,
  };
  assert.equal(storeWith().save(gateState).ok, false);
});

test("regulatory scored questions share learning state without entering the diagnostic bank", () => {
  const allowlists = State.buildAllowlists(COURSE);
  assert.equal(allowlists.questions.has("q:stop"), true);
  assert.equal(allowlists.questions.has("q:reinspection"), true);
  assert.equal(allowlists.diagnostic.has("q:reinspection"), false);
  const store = storeWith();
  const recorded = store.recordAttempt(store.defaultState(), "questions", "q:reinspection", demonstrated({ variant: "regulatory-a" }));
  assert.equal(recorded.ok, true);
  assert.equal(recorded.id, "q:reinspection");
  assert.equal(store.save(recorded.state).ok, true);
  const unknown = store.recordAttempt(recorded.state, "questions", "q:regulatory-unknown", demonstrated({ variant: "unknown" }));
  assert.equal(unknown.ok, false);
});

test("current diagnostic IDs are canonicalized while the form cursor and applicability key persist", () => {
  const store = storeWith();
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  const added = store.addError(state, {
    type: "diagnostic",
    id: "diagnostic-vocabulary-oos",
    text: "Out-of-service order",
    reason: "Wrong meaning",
  });
  assert.equal(added.ok, true);
  assert.equal(added.record.id, "diagnostic-vocabulary-oos");
  state = added.state;
  const daily = store.recordDailyAttempt(state, {
    date: "2026-08-21",
    at: iso(NOW),
    contextKey: qualificationFields(state).contextKey,
    taskType: "diagnostic",
    id: "diagnostic-listening-time",
    completed: false,
    result: "failed",
  });
  assert.equal(daily.ok, true);
  assert.equal(daily.attempt.id, "diagnostic-listening-time");
  state = daily.state;
  state.diagnosticFormCursor = 7;
  state.dailyPlan = {
    date: "2026-08-21",
    refresh: 0,
    profile: "tractor",
    applicabilityKey: '{"profile":"tractor","applicability":{"equipment":{"airBrakes":false}}}',
    coreIds: ["c:make"],
    dueIds: [],
    dueQuestionIds: [],
    dueSignIds: [],
    dueSituationIds: [],
    dueDocumentIds: [],
    dueLessonIds: [],
    truckIds: ["t:brake"],
    hotshotIds: [],
    signIds: [],
    lessonId: "lesson:intro",
    situationId: "situation:roadside",
    documentId: "doc:cdl",
  };
  const saved = store.save(state);
  assert.equal(saved.ok, true);
  assert.equal(saved.state.diagnosticFormCursor, 7);
  assert.equal(saved.state.dailyPlan.applicabilityKey, state.dailyPlan.applicabilityKey);
});

test("diagnostic forms merge into one semantic recovery target and require alternate spaced confirmation", () => {
  let clock = NOW - 2 * DAY;
  const store = storeWith(new State.MemoryStorage(), () => clock);
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;

  let result = store.addError(state, {
    type: "diagnostic",
    id: "diagnostic-a-inspection-insurance",
    text: "Proof of insurance",
    reason: "Wrong document",
  });
  assert.equal(result.ok, true);
  assert.equal(result.record.id, "diagnostic-inspection-document");
  assert.equal(result.record.stage, "open");
  state = result.state;

  clock += 1_000;
  result = store.addError(state, {
    type: "diagnostic",
    id: "diagnostic-b-inspection-registration",
    text: "Vehicle registration",
    reason: "Wrong document again",
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.errorJournal.length, 1);
  assert.equal(result.record.id, "diagnostic-inspection-document");
  assert.equal(result.record.reason, "Wrong document again");
  state = result.state;

  result = store.recordErrorAttempt(state, "diagnostic", "diagnostic-a-inspection-insurance", demonstrated({
    outcome: "failed",
    independent: false,
    variant: "diagnostic-A-a-inspection-insurance-a-inspection-insurance-v1",
  }));
  assert.equal(result.ok, true);
  assert.equal(result.record.stage, "open");
  state = result.state;

  clock += 1_000;
  result = store.recordErrorAttempt(state, "diagnostic", "diagnostic-inspection-document", demonstrated({
    variant: "diagnostic-B-b-inspection-registration-b-inspection-registration-v1",
  }));
  assert.equal(result.ok, true);
  assert.equal(result.record.stage, "corrected-awaiting-confirmation");
  assert.equal(result.record.resolutionProof.length, 1);
  state = result.state;

  clock += DAY;
  result = store.recordErrorAttempt(state, "diagnostic", "diagnostic-b-inspection-registration", demonstrated({
    variant: "diagnostic-B-b-inspection-registration-b-inspection-registration-v1",
  }));
  assert.equal(result.ok, true);
  assert.equal(result.record.stage, "confirmation-due");
  assert.equal(result.record.resolutionProof.length, 1);
  state = result.state;

  clock += 1_000;
  result = store.recordErrorAttempt(state, "diagnostic", "diagnostic-a-inspection-insurance", demonstrated({
    variant: "diagnostic-A-a-inspection-insurance-a-inspection-insurance-v1",
  }));
  assert.equal(result.ok, true);
  assert.equal(result.closed, true);
  assert.equal(result.record.stage, "closed");
  assert.equal(result.record.resolutionProof.length, 2);
  state = result.state;

  clock += 1_000;
  result = store.addError(state, {
    type: "diagnostic",
    id: "diagnostic-b-inspection-registration",
    text: "Vehicle registration",
    reason: "New failure after confirmation",
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.errorJournal.length, 1);
  assert.equal(result.record.stage, "open");
  assert.equal(result.record.resolutionProof.length, 0);
});

test("daily route snapshots round-trip with bounded allowlisted keys and cursor", () => {
  const storage = new State.MemoryStorage();
  const store = storeWith(storage);
  const state = store.defaultState();
  state.profile = "tractor";
  const routeErrorTarget = { type: "word", id: "c:make", contextKey: null, semanticBranch: "shared:words:c:make" };
  state.dailyPlan = {
    date: "2026-08-21",
    refresh: 0,
    profile: "tractor",
    applicabilityKey: "tractor-route",
    coreIds: ["c:make"],
    dueIds: ["t:brake"],
    dueQuestionIds: ["q:stop"],
    dueSignIds: ["sign:stop"],
    dueSituationIds: ["situation:roadside"],
    dueDocumentIds: ["doc:cdl"],
    dueLessonIds: ["lesson:intro"],
    questionIds: ["q:stop", "q:destination", "q:reinspection"],
    truckIds: ["t:brake"],
    hotshotIds: [],
    signIds: ["sign:stop"],
    lessonId: "lesson:intro",
    situationId: "situation:roadside",
    documentId: "doc:cdl",
    routeKeys: ["errors", "due-signs", "truck"],
    routeSnapshot: [
      { key: "errors", bucket: null, errorTarget: routeErrorTarget },
      { key: "due-signs", bucket: "signs", ids: ["sign:stop"] },
      { key: "truck", bucket: "words", ids: ["t:brake"] },
    ],
    dueCursor: 5,
  };
  const saved = store.save(state);
  assert.equal(saved.ok, true);
  assert.deepEqual(saved.state.dailyPlan.routeKeys, ["errors", "due-signs", "truck"]);
  assert.deepEqual(saved.state.dailyPlan.questionIds, ["q:stop", "q:destination", "q:reinspection"]);
  assert.deepEqual(saved.state.dailyPlan.routeSnapshot, state.dailyPlan.routeSnapshot);
  assert.equal(saved.state.dailyPlan.dueCursor, 5);
  const loaded = store.load();
  assert.deepEqual(loaded.state.dailyPlan.routeKeys, saved.state.dailyPlan.routeKeys);
  assert.deepEqual(loaded.state.dailyPlan.questionIds, saved.state.dailyPlan.questionIds);
  assert.deepEqual(loaded.state.dailyPlan.routeSnapshot, saved.state.dailyPlan.routeSnapshot);
  assert.equal(loaded.state.dailyPlan.dueCursor, 5);
  const imported = store.prepareImport(JSON.stringify(saved.state));
  assert.equal(imported.ok, true);
  assert.equal(imported.candidate.state.dailyPlan, null);
  assert.equal(imported.candidate.state.importTrust.status, "imported-unverified");

  for (const invalid of [
    { routeKeys: ["errors", "not-a-task"] },
    { routeKeys: ["errors", "errors"] },
    { routeKeys: ["core", "truck", "signs", "lesson"] },
    { dueCursor: 6 },
    { questionIds: ["q:unknown"] },
    { questionIds: Array.from({ length: 17 }, () => "q:stop") },
  ]) {
    const candidate = JSON.parse(JSON.stringify(saved.state));
    Object.assign(candidate.dailyPlan, invalid);
    assert.equal(store.save(candidate).ok, false);
    assert.equal(store.prepareImport(JSON.stringify(candidate)).ok, false);
  }

  const invalidSnapshots = [
    {
      routeKeys: ["due-signs"],
      routeSnapshot: [{ key: "due-signs", bucket: "signs", ids: ["sign:unknown"] }],
    },
    {
      routeKeys: ["listening"],
      routeSnapshot: [{ key: "listening", bucket: "questions", ids: COURSE.inspectionQuestions.slice(0, 6).map(item => item.id) }],
    },
    {
      routeKeys: ["errors", "truck"],
      routeSnapshot: [{ key: "errors", bucket: null }, { key: "errors", bucket: null }],
    },
    {
      routeKeys: ["due-signs"],
      routeSnapshot: [{ key: "due-signs", bucket: "signs", ids: ["sign:stop", "sign:stop"] }],
    },
    {
      routeKeys: ["due-signs"],
      routeSnapshot: [{ key: "due-signs", bucket: "words", ids: ["c:make"], markup: "<img onerror=alert(1)>" }],
    },
    {
      routeKeys: ["errors", "truck", "signs"],
      routeSnapshot: [
        { key: "errors", bucket: null },
        { key: "truck", bucket: "words", ids: ["t:brake"] },
        { key: "signs", bucket: "signs", ids: ["sign:stop"] },
        { key: "core", bucket: "words", ids: ["c:make"] },
      ],
    },
  ];
  for (const invalid of invalidSnapshots) {
    const candidate = JSON.parse(JSON.stringify(saved.state));
    candidate.dailyPlan.routeKeys = invalid.routeKeys;
    candidate.dailyPlan.routeSnapshot = invalid.routeSnapshot;
    assert.equal(store.save(candidate).ok, false);
    assert.equal(store.prepareImport(JSON.stringify(candidate)).ok, false);
  }

  const normalized = State.normalizeState({
    ...saved.state,
    dailyPlan: {
      ...saved.state.dailyPlan,
      routeKeys: ["errors", "not-a-task", "errors", "truck", "signs"],
      dueCursor: 99,
    },
  }, COURSE, { now: NOW });
  assert.deepEqual(normalized.state.dailyPlan.routeKeys, []);
  assert.equal(Object.hasOwn(normalized.state.dailyPlan, "routeSnapshot"), false);
  assert.equal(Object.hasOwn(normalized.state.dailyPlan, "dueCursor"), false);
  assert.ok(normalized.issues.some(issue => issue.includes("unknown dailyPlan route key")));
  assert.ok(normalized.issues.some(issue => issue.includes("routeSnapshot keys must exactly match")));

  const legacyRoute = State.normalizeState({
    ...saved.state,
    version: 4,
    dailyPlan: { ...saved.state.dailyPlan, routeSnapshot: undefined },
  }, COURSE, { now: NOW });
  assert.deepEqual(legacyRoute.state.dailyPlan.routeKeys, []);
  assert.equal(Object.hasOwn(legacyRoute.state.dailyPlan, "routeSnapshot"), false);
  assert.ok(legacyRoute.issues.some(issue => issue.includes("legacy route reset")));
});

test("a frozen seven-response ELP Today route survives save and reload intact", () => {
  const storage = new State.MemoryStorage();
  const store = storeWith(storage);
  const state = store.defaultState();
  state.profile = "tractor";
  state.dailyPlan = {
    date: "2026-08-21",
    refresh: 0,
    profile: "tractor",
    applicabilityKey: "tractor-elp-route",
    coreIds: ["c:make"],
    dueIds: [],
    dueQuestionIds: [],
    dueSignIds: [],
    dueSituationIds: [],
    dueDocumentIds: [],
    dueLessonIds: [],
    questionIds: COURSE.elpStepOneIds,
    truckIds: ["t:brake"],
    hotshotIds: [],
    signIds: [],
    lessonId: "lesson:intro",
    situationId: "situation:roadside",
    documentId: "doc:cdl",
    routeKeys: ["elp"],
    routeSnapshot: [{ key: "elp", bucket: "questions", ids: COURSE.elpStepOneIds }],
    dueCursor: 0,
  };
  const saved = store.save(state);
  assert.equal(saved.ok, true, saved.error);
  assert.deepEqual(saved.state.dailyPlan.routeSnapshot[0].ids, COURSE.elpStepOneIds);
  const loaded = store.load();
  assert.equal(loaded.source, "main");
  assert.deepEqual(loaded.state.dailyPlan.routeKeys, ["elp"]);
  assert.deepEqual(loaded.state.dailyPlan.routeSnapshot[0].ids, COURSE.elpStepOneIds);
});

test("the former five-function ELP gate restarts without losing unrelated v5 progress", () => {
  const legacyIds = [
    "question:pull-into-the-inspection-lane",
    "question:where-are-you-coming-from",
    "question:what-are-you-hauling",
    "question:who-do-you-drive-for",
    "question:what-is-your-current-duty-status",
  ];
  const currentIds = [
    legacyIds[0],
    "question:what-is-your-truck-and-trailer-number",
    legacyIds[1],
    "question:where-are-you-going",
    ...legacyIds.slice(2),
  ];
  const stepTwoSigns = Array.from({ length: 12 }, (_, index) => ({
    id: `step-one-restart:${index}`,
    provenance: index < 8 ? "fhwa-mutcd-shs" : "training-dms",
    englishBearing: true,
  }));
  const course = {
    ...COURSE,
    inspectionQuestions: [
      ...COURSE.inspectionQuestions,
      ...currentIds.map(id => ({ id })),
    ],
    elpStepOneIds: currentIds,
    elpStepOneBlueprint: {
      version: "seven-functions-v1",
      requiredResponses: 7,
      functions: currentIds.map((questionId, index) => ({ id: `function-${index}`, questionId })),
      officialAssessment: false,
    },
    signs: stepTwoSigns,
    elpStepTwoEnglishBearingIds: stepTwoSigns.map(item => item.id),
    elpStepTwoCompletionBlueprint: {
      version: "step-one-restart-v1",
      requiredScoredAttempts: 12,
      requiredOfficialSvgAttempts: 8,
      requiredTrainingDmsAttempts: 4,
    },
  };
  const storage = new State.MemoryStorage();
  const store = State.createStateStore({ storage, courseData: course, storageKey: "step-one-restart", now: () => NOW });
  let state = store.defaultState();
  state.profile = "tractor";
  state.dailyMinutes = 15;
  state.words["c:make"] = State.recordEvidence(null, demonstrated({
    at: iso(NOW - DAY),
    variant: "retained-word",
  }), { now: NOW }).record;
  state.elpGate = {
    ...elpQualificationFields(state),
    sessionIds: legacyIds,
    results: {},
    resultTimes: {},
    startedAt: iso(NOW - 20_000),
    completedAt: null,
    status: "pending",
    attempts: 1,
  };
  state.elpStepTwo = {
    ...qualificationFields(state),
    blueprintVersion: "step-one-restart-v1",
    referenceCounts: { officialSvg: 8, trainingDms: 4 },
    sessionIds: stepTwoSigns.map(item => item.id),
    results: {},
    resultTimes: {},
    startedAt: iso(NOW - 10_000),
    completedAt: null,
    status: "pending",
    attempts: 1,
  };
  state.dailyPlan = {
    date: "2026-08-21",
    refresh: 0,
    profile: "tractor",
    applicabilityKey: State.qualificationContextKey(state.profile, state.applicability),
    coreIds: ["c:make"],
    dueIds: [],
    dueQuestionIds: [],
    dueSignIds: [],
    dueSituationIds: [],
    dueDocumentIds: [],
    dueLessonIds: [],
    questionIds: legacyIds,
    truckIds: ["t:brake"],
    hotshotIds: [],
    signIds: [],
    lessonId: "lesson:intro",
    situationId: "situation:roadside",
    documentId: "doc:cdl",
    routeKeys: ["elp"],
    routeSnapshot: [{ key: "elp", bucket: "questions", ids: legacyIds }],
    dueCursor: 0,
  };

  const saved = store.save(state);
  assert.equal(saved.ok, true, saved.error);
  assert.equal(saved.state.elpGate, null);
  assert.equal(saved.state.elpStepTwo, null);
  assert.equal(saved.state.dailyPlan.routeKeys, undefined);
  assert.equal(saved.state.dailyPlan.routeSnapshot, undefined);
  assert.equal(saved.state.dailyMinutes, 15);
  assert.ok(saved.state.words["c:make"]);
  assert.ok(saved.issues.some(issue => issue.startsWith("elpStepOne restart required:")));

  const loaded = store.load();
  assert.equal(loaded.state.elpGate, null);
  assert.equal(loaded.state.elpStepTwo, null);
  assert.ok(loaded.state.words["c:make"]);
});

test("sessionOrdinal starts at one, persists across dates and is never derived from dailyRefresh", () => {
  const storage = new State.MemoryStorage();
  const store = storeWith(storage);
  const state = store.defaultState();
  state.sessionOrdinal = 7;
  state.dailyRefresh = 42;
  const saved = store.save(state);
  assert.equal(saved.ok, true, saved.error);
  assert.equal(saved.state.sessionOrdinal, 7);

  const tomorrowStore = State.createStateStore({
    storage,
    courseData: COURSE,
    storageKey: "test-state",
    now: () => NOW + 2 * DAY,
  });
  assert.equal(tomorrowStore.load().state.sessionOrdinal, 7);

  const rolledDate = State.normalizeState({
    ...saved.state,
    dailyRefresh: 999999,
    dailyPlan: null,
  }, COURSE, { now: NOW });
  assert.equal(rolledDate.state.sessionOrdinal, 7);

  const legacy = State.normalizeState({ version: 4, dailyRefresh: 999 }, COURSE, { now: NOW });
  assert.equal(legacy.state.sessionOrdinal, 1);
  const priorV5 = JSON.parse(JSON.stringify(saved.state));
  delete priorV5.sessionOrdinal;
  assert.equal(State.normalizeState(priorV5, COURSE, { now: NOW }).state.sessionOrdinal, 1);

  for (const forged of [0, -1, State.MAX_SESSION_ORDINAL + 1, 1.5, "2"]) {
    const candidate = JSON.parse(JSON.stringify(saved.state));
    candidate.sessionOrdinal = forged;
    assert.equal(store.save(candidate).ok, false);
    assert.equal(store.prepareImport(JSON.stringify(candidate)).ok, false);
  }
});

test("applicability is allowlisted, defaults false and drops unknown keys", () => {
  const state = storeWith().defaultState();
  state.applicability = {
    equipment: { dryVan: false, loadBars: true, teleport: true },
    conditions: { eld: true, hazmat: false, transportedVehicleOver10000Lb: true, secretCondition: true },
    unknownGroup: { enabled: true },
  };
  const prepared = storeWith().prepareImport(JSON.stringify(state));
  assert.equal(prepared.ok, true);
  const applicability = prepared.candidate.state.applicability;
  assert.equal(applicability.equipment.dryVan, false);
  assert.equal(applicability.equipment.loadBars, false);
  assert.equal(Object.hasOwn(applicability.equipment, "teleport"), false);
  assert.equal(applicability.conditions.eld, true);
  assert.equal(applicability.conditions.hazmat, false);
  assert.equal(applicability.conditions.transportedVehicleOver10000Lb, true);
  assert.equal(Object.hasOwn(applicability.conditions, "secretCondition"), false);
  assert.equal(Object.values(applicability.conditions).filter(Boolean).length, 2);

  const contradictory = State.normalizeState({
    ...storeWith().defaultState(),
    applicability: {
      equipment: {},
      conditions: {
        transportedVehicleAtMost10000Lb: true,
        transportedVehicleOver10000Lb: true,
      },
    },
  }, COURSE, { now: NOW });
  assert.equal(contradictory.state.applicability.conditions.transportedVehicleAtMost10000Lb, false);
  assert.equal(contradictory.state.applicability.conditions.transportedVehicleOver10000Lb, false);
  assert.ok(contradictory.issues.some(issue => issue.includes("mutually exclusive")));
});

test("valid ELP qualification is derived, saturated and reset on import", () => {
  const state = storeWith().defaultState();
  state.profile = "tractor";
  state.elpGate = {
    ...elpQualificationFields(state),
    sessionIds: COURSE.elpStepOneIds,
    results: Object.fromEntries(COURSE.elpStepOneIds.map((id, index) => [id, gateResult(index)])),
    startedAt: iso(NOW - 20_000),
    completedAt: null,
    status: "failed",
    attempts: 33,
  };
  const normalized = State.normalizeState(state, COURSE, { now: NOW });
  assert.equal(normalized.state.elpGate.status, "passed");
  assert.equal(normalized.state.elpGate.attempts, 32);
  assert.equal(storeWith().save(state).ok, true);
  const prepared = storeWith().prepareImport(JSON.stringify(normalized.state));
  assert.equal(prepared.ok, true);
  assert.equal(prepared.candidate.state.elpGate, null);
  assert.match(prepared.issues.join(" "), /qualification require local revalidation/i);
});

test("ELP Step 1 sessionDate round-trips and invalid or contextless dates cannot qualify", () => {
  const makeState = sessionDate => {
    const state = storeWith().defaultState();
    state.profile = "tractor";
    state.elpGate = {
      ...qualificationFields(state),
      ...(sessionDate === undefined ? {} : { sessionDate }),
      sessionIds: COURSE.elpStepOneIds,
      results: Object.fromEntries(COURSE.elpStepOneIds.map((id, index) => [id, gateResult(index)])),
      startedAt: iso(NOW - 20_000),
      completedAt: null,
      status: "passed",
      attempts: 1,
    };
    return state;
  };
  const storage = new State.MemoryStorage();
  const store = storeWith(storage);
  const saved = store.save(makeState("2026-08-20"));
  assert.equal(saved.ok, true);
  assert.equal(saved.state.elpGate.status, "passed");
  assert.equal(saved.state.elpGate.sessionDate, "2026-08-20");
  const loaded = store.load();
  assert.equal(loaded.state.elpGate.status, "passed");
  assert.equal(loaded.state.elpGate.sessionDate, "2026-08-20");

  for (const invalid of ["2026-02-30", "2026-8-20", "x".repeat(80)]) {
    const result = storeWith().save(makeState(invalid));
    assert.equal(result.ok, false, invalid);
    assert.match(result.error, /sessionDate/);
  }
  const missing = State.normalizeState(makeState(undefined), COURSE, { now: NOW });
  assert.equal(missing.state.elpGate.status, "failed");
  assert.equal(missing.state.elpGate.sessionDate, null);
});

test("ELP gates accept app-shaped structured results with separate resultTimes", () => {
  const store = storeWith();
  const state = store.defaultState();
  state.profile = "tractor";
  const results = Object.fromEntries(COURSE.elpStepOneIds.map((id, index) => {
    const { at, ...result } = gateResult(index);
    return [id, result];
  }));
  state.elpGate = {
    ...elpQualificationFields(state),
    sessionIds: COURSE.elpStepOneIds,
    results,
    resultTimes: Object.fromEntries(COURSE.elpStepOneIds.map((id, index) => [id, iso(NOW - 10_000 + index)])),
    startedAt: iso(NOW - 20_000),
    completedAt: iso(NOW - 1_000),
    status: "failed",
    attempts: 1,
  };
  const saved = store.save(state);
  assert.equal(saved.ok, true);
  assert.equal(saved.state.elpGate.status, "passed");
  assert.equal(saved.state.elpGate.results[COURSE.elpStepOneIds[0]].at, iso(NOW - 10_000));
  assert.equal(saved.state.elpGate.resultTimes[COURSE.elpStepOneIds[0]], iso(NOW - 10_000));

  delete state.elpGate.resultTimes[COURSE.elpStepOneIds[0]];
  assert.equal(store.save(state).ok, false);
});

test("a failed Step 1 result survives save and reload without becoming editable evidence", () => {
  const storage = new State.MemoryStorage();
  const store = storeWith(storage);
  const state = store.defaultState();
  state.profile = "tractor";
  const id = COURSE.elpStepOneIds[0];
  const evaluatedAt = iso(NOW - 10_000);
  state.elpGate = {
    ...elpQualificationFields(state),
    sessionIds: COURSE.elpStepOneIds,
    results: {
      [id]: gateResult(0, {
        pass: false,
        feedback: "The response does not satisfy the keyed relation.",
      }),
    },
    resultTimes: { [id]: evaluatedAt },
    startedAt: iso(NOW - 20_000),
    completedAt: null,
    status: "pending",
    attempts: 1,
  };

  const saved = store.save(state);
  assert.equal(saved.ok, true);
  assert.equal(saved.state.elpGate.status, "pending");
  assert.equal(saved.state.elpGate.results[id].pass, false);
  assert.equal(saved.state.elpGate.results[id].at, evaluatedAt);

  const reloaded = store.load();
  assert.equal(reloaded.source, "main");
  assert.equal(reloaded.state.elpGate.status, "pending");
  assert.equal(reloaded.state.elpGate.results[id].pass, false);
  assert.equal(Object.keys(reloaded.state.elpGate.results).length, 1);
});

test("ELP Step 2 accepts exactly 12 immutable English-bearing stimuli from the 47-item pool", () => {
  const signs = Array.from({ length: 47 }, (_, index) => ({
    id: `step2:${String(index).padStart(2, "0")}`,
    provenance: index < 31 ? "fhwa-mutcd-shs" : "training-dms",
    englishBearing: true,
  }));
  const familiarization = { id: "step2:symbol-only", provenance: "fhwa-mutcd-shs", englishBearing: false };
  const eligibleIds = signs.map(item => item.id);
  const course = {
    ...COURSE,
    signs: [...COURSE.signs, ...signs, familiarization],
    elpStepTwoEnglishBearingIds: eligibleIds,
    elpStepTwoCompletionBlueprint: {
      version: "test-step2-v1",
      requiredScoredAttempts: 12,
      requiredOfficialSvgAttempts: 8,
      requiredTrainingDmsAttempts: 4,
    },
  };
  const ids = [...eligibleIds.slice(5, 13), ...eligibleIds.slice(31, 35)];
  assert.equal(State.buildAllowlists(course).elpStepTwoSigns.size, 47);
  assert.equal(State.buildAllowlists(course).elpStepTwoSigns.has(familiarization.id), false);
  const state = State.createDefaultState(course, { now: NOW });
  state.profile = "tractor";
  state.elpStepTwo = {
    ...qualificationFields(state),
    blueprintVersion: "test-step2-v1",
    referenceCounts: { officialSvg: 32, trainingDms: 16 },
    sessionIds: ids,
    results: Object.fromEntries(ids.map((id, index) => {
      const { at, ...result } = gateResult(index, { variant: "elp-reading-meaning-and-action" });
      return [id, result];
    })),
    resultTimes: Object.fromEntries(ids.map((id, index) => [id, iso(NOW - 10_000 + index)])),
    startedAt: iso(NOW - 20_000),
    completedAt: null,
    status: "failed",
    attempts: 33,
  };
  const complete = State.normalizeState(state, course, { now: NOW });
  assert.equal(complete.state.elpStepTwo.status, "passed");
  assert.equal(complete.state.elpStepTwo.attempts, 32);
  assert.deepEqual(complete.state.elpStepTwo.sessionIds, ids);
  assert.equal(complete.state.elpStepTwo.blueprintVersion, "test-step2-v1");
  assert.deepEqual(complete.state.elpStepTwo.referenceCounts, { officialSvg: 32, trainingDms: 16 });
  assert.equal(Object.keys(complete.state.elpStepTwo.results).length, 12);

  const storage = new State.MemoryStorage();
  const store = State.createStateStore({ storage, courseData: course, storageKey: "step-two-state", now: () => NOW });
  const saved = store.save(complete.state);
  assert.equal(saved.ok, true, saved.error);
  assert.equal(saved.state.elpStepTwo.blueprintVersion, "test-step2-v1");
  assert.deepEqual(saved.state.elpStepTwo.referenceCounts, { officialSvg: 32, trainingDms: 16 });
  assert.deepEqual(store.load().state.elpStepTwo.sessionIds, ids);

  state.elpStepTwo.results[ids[0]].stimulusExposed = false;
  state.elpStepTwo.status = "passed";
  const incomplete = State.normalizeState(state, course, { now: NOW });
  assert.equal(incomplete.state.elpStepTwo.status, "pending");
  assert.equal(incomplete.state.elpStepTwo.results[ids[0]], undefined);
  state.elpStepTwo.sessionIds[0] = familiarization.id;
  assert.equal(State.normalizeState(state, course, { now: NOW }).state.elpStepTwo, null);
  assert.equal(State.parseImportPayload(JSON.stringify(complete.state), course, { now: NOW }).state.elpStepTwo, null);
});

test("old or mismatched pending ELP Step 2 blueprints restart without qualifying", () => {
  const signs = Array.from({ length: 47 }, (_, index) => ({
    id: `restart-step2:${String(index).padStart(2, "0")}`,
    provenance: index < 31 ? "fhwa-mutcd-shs" : "training-dms",
    englishBearing: true,
  }));
  const course = {
    ...COURSE,
    signs: [...COURSE.signs, ...signs],
    elpStepTwoEnglishBearingIds: signs.map(item => item.id),
    elpStepTwoCompletionBlueprint: {
      version: "restart-step2-v2",
      requiredScoredAttempts: 12,
      requiredOfficialSvgAttempts: 8,
      requiredTrainingDmsAttempts: 4,
    },
  };
  const ids = [...signs.slice(0, 8), ...signs.slice(31, 35)].map(item => item.id);
  const base = State.createDefaultState(course, { now: NOW });
  base.profile = "tractor";
  base.elpStepTwo = {
    ...qualificationFields(base),
    blueprintVersion: "restart-step2-v2",
    referenceCounts: { officialSvg: 31, trainingDms: 16 },
    sessionIds: ids,
    results: {},
    resultTimes: {},
    startedAt: iso(NOW - 20_000),
    completedAt: null,
    status: "pending",
    attempts: 1,
  };
  assert.equal(State.normalizeState(base, course, { now: NOW }).state.elpStepTwo.status, "pending");

  const mutations = [
    gate => { delete gate.blueprintVersion; },
    gate => { gate.blueprintVersion = "restart-step2-v1"; },
    gate => { gate.blueprintVersion = "x".repeat(81); },
    gate => { gate.referenceCounts.officialSvg = 30; },
    gate => { gate.referenceCounts.extra = 1; },
    gate => { gate.sessionIds = [...signs.slice(0, 9), ...signs.slice(31, 34)].map(item => item.id); },
    gate => { gate.sessionIds = [...gate.sessionIds, signs[8].id]; },
    gate => { gate.sessionIds[0] = "restart-step2:unknown"; },
  ];
  for (const mutate of mutations) {
    const candidate = JSON.parse(JSON.stringify(base));
    mutate(candidate.elpStepTwo);
    const normalized = State.normalizeState(candidate, course, { now: NOW });
    assert.equal(normalized.state.elpStepTwo, null);
    assert.ok(normalized.issues.some(issue => issue.startsWith("elpStepTwo restart required:")));
    const store = State.createStateStore({ storage: new State.MemoryStorage(), courseData: course, storageKey: "restart-step-two", now: () => NOW });
    const saved = store.save(candidate);
    assert.equal(saved.ok, true, saved.error);
    assert.equal(saved.state.elpStepTwo, null);
  }
});

test("diagnostic and ELP readiness are bound to the exact profile and applicability context", () => {
  const store = storeWith();
  const state = store.defaultState();
  state.profile = "tractor";
  const binding = qualificationFields(state);
  state.diagnostic = verifiedDiagnostic(iso(NOW - DAY), binding);
  state.elpGate = {
    ...binding,
    sessionDate: "2026-08-21",
    sessionIds: COURSE.elpStepOneIds,
    results: Object.fromEntries(COURSE.elpStepOneIds.map((id, index) => [id, gateResult(index)])),
    startedAt: iso(NOW - 20_000),
    completedAt: null,
    status: "passed",
    attempts: 1,
  };

  const qualified = State.normalizeState(state, COURSE, { now: NOW }).state;
  assert.equal(qualified.diagnostic.verified, true);
  assert.equal(qualified.elpGate.status, "passed");

  const profileMismatch = JSON.parse(JSON.stringify(qualified));
  profileMismatch.profile = "hotshot-open";
  const profileResult = store.save(profileMismatch);
  assert.equal(profileResult.ok, true);
  assert.equal(profileResult.state.diagnostic.verified, false);
  assert.equal(profileResult.state.elpGate.status, "failed");
  assert.equal(profileResult.state.diagnostic.profile, "tractor");

  const applicabilityMismatch = JSON.parse(JSON.stringify(qualified));
  applicabilityMismatch.applicability.conditions.eld = true;
  const applicabilityResult = store.save(applicabilityMismatch);
  assert.equal(applicabilityResult.ok, true);
  assert.equal(applicabilityResult.state.diagnostic.verified, false);
  assert.equal(applicabilityResult.state.elpGate.status, "failed");

  const legacyContextless = JSON.parse(JSON.stringify(qualified));
  legacyContextless.version = 4;
  delete legacyContextless.diagnostic.profile;
  delete legacyContextless.diagnostic.contextKey;
  delete legacyContextless.elpGate.profile;
  delete legacyContextless.elpGate.contextKey;
  const legacyResult = State.normalizeState(legacyContextless, COURSE, { now: NOW }).state;
  assert.equal(legacyResult.diagnostic.verified, false);
  assert.equal(legacyResult.elpGate.status, "failed");

  for (const forged of [
    { profile: "tractor-trailer", contextKey: binding.contextKey },
    { profile: "tractor", contextKey: `${binding.contextKey}\u0000` },
    { profile: "tractor", contextKey: "x".repeat(4097) },
  ]) {
    const candidate = JSON.parse(JSON.stringify(qualified));
    Object.assign(candidate.diagnostic, forged);
    assert.equal(store.save(candidate).ok, false);
  }
});

test("ELP Step 2 readiness is downgraded after profile, applicability or legacy-context mismatch", () => {
  const signs = Array.from({ length: 47 }, (_, index) => ({
    id: `binding-step2:${String(index).padStart(2, "0")}`,
    provenance: index < 31 ? "fhwa-mutcd-shs" : "training-dms",
    englishBearing: true,
  }));
  const ids = [...signs.slice(0, 8), ...signs.slice(31, 35)].map(item => item.id);
  const course = {
    ...COURSE,
    signs: [...COURSE.signs, ...signs],
    elpStepTwoEnglishBearingIds: signs.map(item => item.id),
    elpStepTwoCompletionBlueprint: {
      version: "binding-step2-v1",
      requiredScoredAttempts: 12,
      requiredOfficialSvgAttempts: 8,
      requiredTrainingDmsAttempts: 4,
    },
  };
  const state = State.createDefaultState(course, { now: NOW });
  state.profile = "tractor";
  state.elpStepTwo = {
    ...qualificationFields(state),
    blueprintVersion: "binding-step2-v1",
    referenceCounts: { officialSvg: 31, trainingDms: 16 },
    sessionIds: ids,
    results: Object.fromEntries(ids.map((id, index) => [id, gateResult(index, { variant: "elp-reading-meaning-and-action" })])),
    startedAt: iso(NOW - 20_000),
    completedAt: null,
    status: "passed",
    attempts: 1,
  };
  const qualified = State.normalizeState(state, course, { now: NOW }).state;
  assert.equal(qualified.elpStepTwo.status, "passed");

  const wrongConstruct = JSON.parse(JSON.stringify(state));
  wrongConstruct.elpStepTwo.results[ids[0]].variant = "action-from-stimulus";
  const wrongConstructState = State.normalizeState(wrongConstruct, course, { now: NOW }).state;
  assert.equal(wrongConstructState.elpStepTwo.status, "pending");
  assert.equal(wrongConstructState.elpStepTwo.results[ids[0]], undefined);

  const profileMismatch = JSON.parse(JSON.stringify(qualified));
  profileMismatch.profile = "hotshot-enclosed";
  assert.equal(State.normalizeState(profileMismatch, course, { now: NOW }).state.elpStepTwo.status, "failed");

  const applicabilityMismatch = JSON.parse(JSON.stringify(qualified));
  applicabilityMismatch.applicability.conditions.hazmat = true;
  assert.equal(State.normalizeState(applicabilityMismatch, course, { now: NOW }).state.elpStepTwo.status, "failed");

  const legacyContextless = JSON.parse(JSON.stringify(qualified));
  legacyContextless.version = 4;
  delete legacyContextless.elpStepTwo.profile;
  delete legacyContextless.elpStepTwo.contextKey;
  assert.equal(State.normalizeState(legacyContextless, course, { now: NOW }).state.elpStepTwo.status, "failed");
});

test("save distinguishes validation failures from persistence failures", () => {
  const store = storeWith();
  const invalid = store.defaultState();
  invalid.words = [];
  const result = store.save(invalid);
  assert.equal(result.ok, false);
  assert.equal(result.errorType, "validation");
});

test("a prepared import remains retryable after a persistence failure", () => {
  class RetryStorage extends State.MemoryStorage {
    constructor() {
      super();
      this.failPrimaryOnce = false;
    }

    setItem(key, value) {
      if (key === "test-state" && this.failPrimaryOnce) {
        this.failPrimaryOnce = false;
        throw new Error("quota blocked");
      }
      super.setItem(key, value);
    }
  }

  const storage = new RetryStorage();
  const store = storeWith(storage);
  assert.equal(store.save(store.defaultState()).ok, true);
  const prepared = store.prepareImport(JSON.stringify(legacyState({
    words: { "truck-001": { completedAt: iso(NOW - DAY) } },
  })));
  assert.equal(prepared.ok, true);
  storage.failPrimaryOnce = true;
  const failed = store.commitImport(prepared.candidate);
  assert.equal(failed.ok, false);
  assert.equal(failed.errorType, "persistence");
  assert.equal(storage.getItem("test-state-staging") !== null, true);
  const retried = store.commitImport(prepared.candidate);
  assert.equal(retried.ok, true);
  assert.ok(retried.state.words["t:brake"]);
});

test("reset replaces both copies with a clean state and clears quarantine", () => {
  const storage = new State.MemoryStorage({
    "test-state": JSON.stringify(legacyState({ words: { "truck-001": { completedAt: iso(NOW - DAY) } } })),
    "test-state-backup": "bad",
    "test-state-quarantine": JSON.stringify({ version: 1, entries: [{ source: "main" }] }),
  });
  const result = storeWith(storage).reset();
  assert.equal(result.ok, true);
  assert.equal(storage.getItem("test-state"), storage.getItem("test-state-backup"));
  assert.equal(storage.getItem("test-state-quarantine"), null);
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem("test-state")).words), []);
});
