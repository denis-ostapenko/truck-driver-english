"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const App = require("../app/app.js");

const source = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");

test("a new ELP Step 1 attempt removes stale locks only for its seven questions", () => {
  const ids = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"];
  const evaluations = new Map([["q1", { pass: false }], ["ordinary-question", { pass: true }]]);
  const drafts = new Map([["q1", "no no"], ["ordinary-question", "kept"]]);
  const locks = new Map([["q1", true], ["ordinary-question", true]]);

  assert.equal(App.clearAttemptStateForIds(ids, evaluations, drafts, locks), 7);
  assert.equal(evaluations.has("q1"), false);
  assert.equal(drafts.has("q1"), false);
  assert.equal(locks.has("q1"), false);
  assert.deepEqual(evaluations.get("ordinary-question"), { pass: true });
  assert.equal(drafts.get("ordinary-question"), "kept");
  assert.equal(locks.get("ordinary-question"), true);
});

test("a new ELP Step 2 attempt removes stale sign evaluation and reveal locks", () => {
  const ids = ["sign-1", "sign-2"];
  const evaluations = new Map([["sign-1", { pass: false }], ["ordinary-sign", { pass: true }]]);
  const revealed = new Set(["sign-1", "ordinary-sign"]);

  App.clearAttemptStateForIds(ids, evaluations, revealed);
  assert.equal(evaluations.has("sign-1"), false);
  assert.equal(revealed.has("sign-1"), false);
  assert.deepEqual(evaluations.get("ordinary-sign"), { pass: true });
  assert.equal(revealed.has("ordinary-sign"), true);
});

test("ELP retry paths use the scoped reset before rendering a new attempt", () => {
  assert.match(source, /function resetElpStepOneAttemptUi\(ids\)[\s\S]*questionEvaluations,[\s\S]*elpResponseDrafts,[\s\S]*elpResponseLocks/);
  assert.match(source, /const previousGate = state\.elpGate;\s+resetElpStepOneAttemptUi\(expectedIds\);/);
  assert.match(source, /function resetElpStepTwoAttemptUi\(ids\)[\s\S]*signEvaluations, revealedSignIds/);
  assert.match(source, /state\.elpStepTwo = \{[\s\S]*resetElpStepTwoAttemptUi\(expectedIds\);/);
});

test("ELP Step 1 and Step 2 persistence failures remove transient locks and restore editable controls", () => {
  assert.match(source, /if \(!saveState\(\)\.ok\) \{\s+questionEvaluations\.delete\(id\);\s+elpResponseLocks\.delete\(id\);[\s\S]{0,700}\$\("#elp-response"\)\.focus\(\)/);
  assert.match(source, /if \(!saveState\(\)\.ok\) \{\s+signEvaluations\.delete\(item\.id\);\s+revealedSignIds\.delete\(item\.id\);[\s\S]{0,500}\.sign-response/);
  assert.match(source, /recordLearningAttempt\("questions"[\s\S]{0,300}deferSave: true/);
  assert.match(source, /recordLearningAttempt\("signs"[\s\S]{0,300}deferSave: true/);
});
