"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Core = require("../app/app-core.js");
const State = require("../app/state-store.js");
const courseData = require("../app/data/course-data.json");

function runtimeDiagnosticBank() {
  const source = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
  const marker = "const DIAGNOSTIC_ITEMS = ";
  const start = source.indexOf(marker);
  const end = source.indexOf("\n\n  function materializeDiagnosticItem", start);
  assert.ok(start >= 0 && end > start, "runtime diagnostic bank must be discoverable");
  return vm.runInNewContext(source.slice(start + marker.length, end).replace(/;\s*$/, ""));
}

const bank = runtimeDiagnosticBank();

test("runtime diagnostic forms keep the exact 12 item, 3 by 4 blueprint in every profile and relevant condition combination", () => {
  const toggles = ["airBrakes", "cargo", "cargoSecurement", "cdlRequired", "eld"];
  for (const profile of Core.EQUIPMENT_PROFILES) {
    for (let mask = 0; mask < 2 ** toggles.length; mask += 1) {
      const conditions = {};
      const equipment = {};
      toggles.forEach((key, index) => {
        const enabled = Boolean(mask & (1 << index));
        if (key === "airBrakes") equipment[key] = enabled;
        else conditions[key] = enabled;
      });
      const context = { profile, applicability: { equipment, conditions } };
      for (const form of ["A", "B"]) {
        const items = Core.materializeDiagnosticForm(bank, { form, seed: 314159, formVersion: "cycle3-12x4-v1", context });
        const blueprint = Core.diagnosticBlueprint(items, 3);
        assert.equal(items.length, 12, `${profile} form ${form} mask ${mask}`);
        assert.equal(blueprint.valid, true, `${profile} form ${form} mask ${mask}`);
        assert.deepEqual(blueprint.counts, { vocabulary: 3, listening: 3, elp: 3, inspection: 3 });
      }
    }
  }
});

test("parallel forms use distinct listening stimuli and expose scenario facts for productive ELP items", () => {
  const listeningA = new Set(bank.filter(item => item.form === "A" && item.category === "listening").map(item => item.stimulusVersion));
  const listeningB = new Set(bank.filter(item => item.form === "B" && item.category === "listening").map(item => item.stimulusVersion));
  assert.equal([...listeningA].some(value => listeningB.has(value)), false);
  for (const item of bank.filter(entry => entry.category === "elp" && entry.kind === "productive" && entry.scenarioKey !== "profile-cargo")) {
    assert.ok(item.scenarioFactsRu);
    assert.match(item.prompt, new RegExp(item.scenarioFactsRu.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("diagnostic bank is larger than either materialized form and contains no self-score items", () => {
  assert.ok(bank.length > 24);
  assert.equal(bank.some(item => item.selfScore === true || item.kind === "self-score"), false);
});

test("all 40 runtime items share the generated semantic recovery contract with state storage", () => {
  const inventory = courseData.diagnosticItemInventory;
  const targets = courseData.diagnosticRecoveryTargets;
  const aliases = courseData.diagnosticRecoveryAliases;
  assert.equal(bank.length, 40);
  assert.equal(inventory.length, 40);
  assert.equal(targets.length, 31);
  assert.deepEqual(new Set(inventory.map(item => item.id)), new Set(bank.map(item => item.id)));
  const inventoryById = new Map(inventory.map(item => [item.id, item]));
  const targetIds = new Set(targets.map(item => item.id));
  const store = State.createStateStore({
    storage: new State.MemoryStorage(),
    storageKey: "diagnostic-contract-test",
    courseData,
    now: Date.parse("2026-08-22T12:00:00.000Z"),
  });
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  for (const runtimeItem of bank) {
    const item = inventoryById.get(runtimeItem.id);
    assert.ok(item, runtimeItem.id);
    assert.equal(item.form, runtimeItem.form, runtimeItem.id);
    assert.equal(item.category, runtimeItem.category, runtimeItem.id);
    assert.ok(item.stimulusVersion, runtimeItem.id);
    assert.ok(targetIds.has(item.recoveryTargetId), runtimeItem.id);
    assert.equal(aliases[item.id], item.recoveryTargetId, runtimeItem.id);
    const added = store.addError(state, {
      type: "diagnostic",
      id: `diagnostic-${runtimeItem.id}`,
      text: runtimeItem.prompt,
      reason: "Regression contract probe",
    });
    assert.equal(added.ok, true, runtimeItem.id);
    assert.equal(added.record.id, `diagnostic-${item.recoveryTargetId}`, runtimeItem.id);
    state = added.state;
  }
  assert.equal(state.errorJournal.length, 31);
});
