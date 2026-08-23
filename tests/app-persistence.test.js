"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Persistence = require("../app/app.js");

test("a failed assessment save rolls back before a later setting save", () => {
  const initial = {
    dailyMinutes: 10,
    words: {},
    dailyAttempts: [],
  };
  const boundary = Persistence.createPersistenceBoundary(initial);
  const storage = {
    fail: true,
    value: JSON.stringify(initial),
    setItem(_key, value) {
      if (this.fail) throw new Error("QuotaExceededError");
      this.value = value;
    },
  };
  const persist = candidate => {
    try {
      storage.setItem("state", JSON.stringify(candidate));
      return { ok: true, state: JSON.parse(storage.value) };
    } catch (error) {
      return { ok: false, errorType: "persistence", error };
    }
  };

  const assessment = boundary.rollback();
  assessment.words["t:brake"] = {
    masteredAt: "2026-08-21T12:00:00.000Z",
    evidence: [{ outcome: "success", variant: "blind-a" }],
  };
  assessment.dailyAttempts.push({ id: "t:brake", result: "independent" });

  const failed = boundary.commit(assessment, persist);
  assert.equal(failed.ok, false);
  assert.equal(failed.errorType, "persistence");
  assert.deepEqual(failed.state.words, {});
  assert.deepEqual(failed.state.dailyAttempts, []);

  storage.fail = false;
  const setting = failed.state;
  setting.dailyMinutes = 15;
  const saved = boundary.commit(setting, persist);
  const persisted = JSON.parse(storage.value);

  assert.equal(saved.ok, true);
  assert.equal(persisted.dailyMinutes, 15);
  assert.deepEqual(persisted.words, {});
  assert.deepEqual(persisted.dailyAttempts, []);
});

test("attempt evidence, daily completion and journal mutation commit as one transaction", () => {
  const initial = { words: {}, dailyAttempts: [], errorJournal: [] };
  const boundary = Persistence.createPersistenceBoundary(initial);
  const candidate = boundary.rollback();
  candidate.words["t:brake"] = { evidence: [{ outcome: "failed" }] };
  candidate.dailyAttempts.push({ id: "t:brake", completed: false });
  candidate.errorJournal.push({ type: "word", id: "t:brake", stage: "open" });
  let writes = 0;
  const failed = boundary.commit(candidate, () => {
    writes += 1;
    throw new Error("QuotaExceededError");
  });
  assert.equal(writes, 1);
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.state, initial);
});

test("a one-shot diagnostic save failure removes the item lock and requires a fresh persisted answer", () => {
  const initial = { errorJournal: [] };
  const boundary = Persistence.createPersistenceBoundary(initial);
  const answers = [];
  const exposure = new Set(["listening-time"]);
  let candidate = boundary.rollback();
  let failOnce = true;
  let writes = 0;
  const persist = next => {
    writes += 1;
    if (failOnce) {
      failOnce = false;
      return { ok: false, errorType: "persistence", error: new Error("QuotaExceededError") };
    }
    return { ok: true, state: next };
  };
  const commit = () => {
    const result = boundary.commit(candidate, persist);
    candidate = result.state;
    return result;
  };

  candidate.errorJournal.push({ type: "diagnostic", id: "diagnostic-listening-time", stage: "open" });
  const failed = Persistence.commitDiagnosticAttempt({
    answers,
    index: 0,
    answerRecord: { itemId: "listening-time", response: "nine thirty" },
    feedback: { response: "nine thirty", evaluation: { pass: true, feedback: "ok" } },
    stimulusExposure: exposure,
    itemId: "listening-time",
    commit,
  });

  assert.equal(failed.result.ok, false);
  assert.equal(failed.retryRequired, true);
  assert.equal(failed.feedback, null);
  assert.deepEqual(answers, []);
  assert.equal(exposure.has("listening-time"), false);
  assert.deepEqual(candidate.errorJournal, []);

  exposure.add("listening-time");
  candidate.errorJournal.push({ type: "diagnostic", id: "diagnostic-listening-time", stage: "open" });
  const saved = Persistence.commitDiagnosticAttempt({
    answers,
    index: 0,
    answerRecord: { itemId: "listening-time", response: "nine thirty after replay" },
    feedback: { response: "nine thirty after replay", evaluation: { pass: true, feedback: "ok" } },
    stimulusExposure: exposure,
    itemId: "listening-time",
    commit,
  });

  assert.equal(saved.result.ok, true);
  assert.equal(saved.retryRequired, false);
  assert.equal(saved.feedback.response, "nine thirty after replay");
  assert.equal(answers[0].response, "nine thirty after replay");
  assert.equal(exposure.has("listening-time"), true);
  assert.equal(candidate.errorJournal.length, 1);
  assert.equal(writes, 2);
});

test("diagnostic journal mutation is checked before the answer transaction and has an atomic rollback path", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
  assert.match(source, /function finishDiagnosticItem\(item, answer, evaluation\)[\s\S]{0,2200}journalMutationOk = journalMutationOk && addErrorItem\("diagnostic"/);
  assert.match(source, /function finishDiagnosticItem\(item, answer, evaluation\)[\s\S]{0,2600}journalMutationOk = recovery\.matched;[\s\S]{0,300}if \(!journalMutationOk\) \{[\s\S]{0,120}rollbackDiagnosticItemMutation\(item\);/);
  assert.match(source, /function rollbackDiagnosticItemMutation\(item\) \{[\s\S]{0,120}state = persistenceBoundary\.rollback\(\);[\s\S]{0,500}diagnosticPersistenceRetry = \{ itemId: item\.id \};/);
});

test("question reveal locks retain an exact keyed practice instance until explicitly cleared", () => {
  const locks = Persistence.createQuestionRevealLocks();
  const descriptor = {
    id: "question:cargo-reinspection:first-50-miles",
    practiceMode: "regulatory-transfer",
    instance: {
      id: "question:cargo-reinspection:first-50-miles:transfer-fingerprint",
      practiceVariantId: "transfer",
      prompt: "Trip began at odometer 184,275.",
      answer: "Inspect by odometer 184,325.",
      visibleStimulus: { tripStartOdometerMiles: 184275 },
    },
  };

  const remembered = locks.remember(descriptor);
  descriptor.instance.answer = "mutated caller value";
  remembered.instance.prompt = "mutated returned value";

  assert.equal(locks.has(descriptor.id), true);
  assert.deepEqual(locks.get(descriptor.id), {
    id: descriptor.id,
    practiceMode: "regulatory-transfer",
    instance: {
      id: "question:cargo-reinspection:first-50-miles:transfer-fingerprint",
      practiceVariantId: "transfer",
      prompt: "Trip began at odometer 184,275.",
      answer: "Inspect by odometer 184,325.",
      visibleStimulus: { tripStartOdometerMiles: 184275 },
    },
  });

  locks.delete(descriptor.id);
  assert.equal(locks.has(descriptor.id), false);
  locks.remember({ ...descriptor, instance: { ...descriptor.instance, id: "new-attempt" } });
  locks.clear();
  assert.equal(locks.get(descriptor.id), null);
});

test("the app save path assigns only the boundary result", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
  assert.match(source, /persistenceBoundary\.commit\(state, candidate => stateStore\.save\(candidate\)\)/);
  assert.match(source, /state = result\.state;/);
  assert.match(source, /result\.errorType === "validation"/);
  assert.match(source, /persistenceBoundary\.accept\(committed\.state\)/);
  assert.match(source, /persistenceBoundary\.accept\(reset\.state\)/);
  assert.match(source, /state\.diagnostic = \{[\s\S]{0,900}formVersion: DIAGNOSTIC_FORM_VERSION[\s\S]{0,900}if \(!saveState\(\)\.ok\)/);
  assert.match(source, /commitDiagnosticAttempt\(\{[\s\S]{0,500}commit: \(\) => saveState\(\)/);
  assert.match(source, /state\.dailyRefresh \+= 1; state\.sessionOrdinal = [^;]+; state\.dailyPlan = null;[\s\S]{0,180}if \(!saveState\(\)\.ok\) return;/);
  assert.match(source, /state\.dailyMinutes = Number\(button\.dataset\.onboardingTime\);[\s\S]{0,180}if \(!saveState\(\)\.ok\)/);
  for (const bucket of ["words", "questions", "situations", "signs", "documents", "lessons"]) {
    assert.match(source, new RegExp(`recordLearningAttempt\\([\\s\\S]{0,80}"${bucket}"[\\s\\S]{0,420}deferSave: true`), bucket);
  }
});

test("an oversized external import is rejected before file.text is called", async () => {
  let textCalls = 0;
  const file = {
    size: Persistence.MAX_EXTERNAL_IMPORT_BYTES + 1,
    async text() {
      textCalls += 1;
      return "{}";
    },
  };
  await assert.rejects(
    Persistence.readExternalImportFile(file),
    error => error.code === "IMPORT_FILE_OVERSIZED",
  );
  assert.equal(textCalls, 0);
});

test("a bounded external import is read exactly once", async () => {
  let textCalls = 0;
  const file = {
    size: 2,
    async text() {
      textCalls += 1;
      return "{}";
    },
  };
  assert.equal(await Persistence.readExternalImportFile(file), "{}");
  assert.equal(textCalls, 1);
});
