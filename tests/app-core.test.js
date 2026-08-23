"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../app/app-core.js");
const courseData = require("../app/data/course-data.json");
const DAILY_CONTEXT = "qualification-context-tractor";

test("New York date remains local across UTC midnight and DST transitions", () => {
  assert.equal(Core.localDateKey("2026-08-22T03:30:00Z"), "2026-08-21");
  assert.equal(Core.localDateKey("2026-03-08T06:59:59Z"), "2026-03-08");
  assert.equal(Core.localDateKey("2026-03-08T07:00:00Z"), "2026-03-08");
  assert.equal(Core.localDateKey("2026-11-01T05:59:59Z"), "2026-11-01");
  assert.equal(Core.localDateKey("2026-11-01T06:00:00Z"), "2026-11-01");
});

test("next New York date boundary follows 23 and 25 hour DST days", () => {
  assert.equal(new Date(Core.nextLocalDateBoundary("2026-03-08T05:00:00.000Z")).toISOString(), "2026-03-09T04:00:00.000Z");
  assert.equal(new Date(Core.nextLocalDateBoundary("2026-11-01T04:00:00.000Z")).toISOString(), "2026-11-02T05:00:00.000Z");
});

test("listening situations omit prompts and driver models from pre-result data", () => {
  const prompt = "Pull into the inspection lane.";
  const inspector = { speaker: "inspector", english: prompt, translation: "Заезжайте на полосу проверки." };
  const driver = { speaker: "driver", english: "I will enter the inspection lane.", translation: "Я заеду на полосу проверки." };
  for (const mode of ["listen", "phone", "elp"]) {
    assert.equal(Core.situationStageRequiresExposure("critical-turn", mode), true, `${mode}:critical`);
    assert.equal(Core.situationStageRequiresExposure("workplace-outcome", mode), false, `${mode}:outcome`);
    assert.equal(Core.situationPromptForMode(prompt, { mode, evaluated: false }), "", mode);
    for (const line of [inspector, driver]) {
      const hidden = Core.situationDialogueDisplay(line, { mode, evaluated: false });
      assert.equal(hidden.hidden, true, `${mode}:${line.speaker}`);
      assert.equal(hidden.english, "", `${mode}:${line.speaker}`);
      assert.equal(hidden.translation, "", `${mode}:${line.speaker}`);
      const completed = Core.situationDialogueDisplay(line, { mode, evaluated: true });
      assert.equal(completed.english, line.english, `${mode}:${line.speaker}:completed`);
    }
  }
  assert.equal(Core.situationPromptForMode(prompt, { mode: "say", evaluated: false }), prompt);
  assert.equal(Core.situationDialogueDisplay(inspector, { mode: "say", evaluated: false }).english, prompt);
  assert.equal(Core.situationDialogueDisplay(driver, { mode: "say", evaluated: false }).english, "");
  assert.equal(Core.situationDialogueDisplay(driver, { mode: "read", evaluated: false }).english, driver.english);
});

test("a split lesson is selectable only when its next construct is due", () => {
  const receptionAt = Date.parse("2026-08-21T21:00:00.000Z");
  const waiting = { construct: "production-interaction", waitUntil: new Date(receptionAt + 24 * 60 * 60 * 1000).toISOString() };
  assert.equal(Core.lessonConstructAvailable(waiting, receptionAt + 11 * 60 * 60 * 1000), false);
  assert.equal(Core.lessonConstructAvailable(waiting, receptionAt + 24 * 60 * 60 * 1000 - 1), false);
  assert.equal(Core.lessonConstructAvailable(waiting, receptionAt + 24 * 60 * 60 * 1000), true);
  assert.equal(Core.lessonConstructAvailable({ construct: "reception", waitUntil: null }, receptionAt), true);
});

test("curriculum blocks advanced material for a fresh learner and honors prerequisites", () => {
  const plan = {
    advancedIds: ["advanced-rods", "advanced-scale"],
    requiredBeforeAdvanced: ["identity", "clarification", "safe-stop", "oos"],
    firstSessionMaximumAdvancedItems: 0,
  };
  const items = [
    { id: "advanced-rods", curriculum: { phase: "advanced", sequence: 50, firstSessionEligible: false } },
    { id: "identity", curriculum: { phase: "foundation", sequence: 1, firstSessionEligible: true } },
    { id: "clarification", curriculum: { phase: "foundation", sequence: 2, firstSessionEligible: true } },
  ];
  assert.deepEqual(Core.curriculumSequence(items, [], plan, { sessionNumber: 1 }).map(item => item.id), ["identity", "clarification"]);
  assert.equal(Core.curriculumEligible(items[0], new Set(["identity", "clarification", "safe-stop"]), plan, { sessionNumber: 3 }), false);
  assert.equal(Core.curriculumEligible(items[0], new Set(plan.requiredBeforeAdvanced), plan, { sessionNumber: 3 }), true);
});

test("curriculum order is stable by sequence then priority", () => {
  const items = [
    { id: "later", curriculum: { sequence: 3, priority: 1 } },
    { id: "second-low", curriculum: { sequence: 2, priority: 4 } },
    { id: "second-high", curriculum: { sequence: 2, priority: 1 } },
  ];
  assert.deepEqual(Core.orderCurriculum(items).map(item => item.id), ["second-high", "second-low", "later"]);
});

test("applicability keeps the three equipment profiles distinct", () => {
  const openOnly = { profiles: ["hotshot-open"] };
  assert.equal(Core.appliesTo(openOnly, "hotshot-open"), true);
  assert.equal(Core.appliesTo(openOnly, "hotshot-enclosed"), false);
  assert.equal(Core.appliesTo(openOnly, "tractor"), false);
  assert.equal(Core.appliesTo(openOnly, "both"), true);
});

test("applicability rejects unknown metadata and unselected conditions", () => {
  assert.equal(Core.appliesTo({ profiles: ["unknown-profile"], conditions: [] }, "tractor"), false);
  assert.equal(Core.appliesTo({ profiles: ["tractor"], conditions: ["unknown-condition"] }, "tractor"), false);
  const hazmat = { profiles: ["tractor", "hotshot-open"], conditions: ["trip-specific", "hazmat"] };
  assert.equal(Core.appliesTo(hazmat, { profile: "tractor", applicability: { conditions: {} } }), false);
  assert.equal(Core.appliesTo(hazmat, { profile: "tractor", applicability: { conditions: { hazmat: true } } }), true);
});

test("canonical condition settings cover ELD, IFTA, permit, cargo and securement", () => {
  const context = Core.normalizeApplicabilityContext({
    profile: "tractor",
    applicability: {
      equipment: { airBrakes: true, dryVan: true, loadBars: true },
      conditions: {
        eld: true,
        eldMalfunction: true,
        ifta: true,
        oversizePermit: true,
        cargo: true,
        cargoSecurement: true,
      },
    },
  });
  assert.ok(context.equipment.includes("air-brakes"));
  assert.ok(context.equipment.includes("dry-van"));
  assert.ok(context.equipment.includes("load-bars"));
  for (const condition of [
    "eld-required",
    "eld-or-rods-applicable",
    "eld-malfunction",
    "ifta-applicable",
    "oversize-or-overweight",
    "permit-applicable",
    "dimension-or-weight-applicable",
    "trip-specific",
    "cargo-securement",
  ]) assert.ok(context.conditions.includes(condition), condition);
});

test("cargo securement alone implies cargo and a trip-specific context", () => {
  for (const conditions of [{ cargoSecurement: true }, ["cargo-securement"]]) {
    const context = Core.normalizeApplicabilityContext({
      profile: "hotshot-open",
      applicability: { conditions },
    });
    assert.ok(context.conditions.includes("cargo-securement"));
    assert.ok(context.conditions.includes("cargo"));
    assert.ok(context.conditions.includes("trip-specific"));
  }
});

test("delivery implies a trip-specific context for nested and flat settings", () => {
  const contexts = [
    Core.normalizeApplicabilityContext({
      profile: "tractor",
      applicability: { conditions: { delivery: true } },
    }),
    Core.normalizeApplicabilityContext({ profile: "tractor", delivery: true }),
  ];
  for (const context of contexts) {
    assert.ok(context.conditions.includes("delivery"));
    assert.ok(context.conditions.includes("trip-specific"));
  }
});

test("current tractor-only equipment cannot leak into either Hotshot profile", () => {
  const units = courseData.truck;
  const questions = courseData.inspectionQuestions;
  const byId = new Map([...units, ...questions].map(item => [item.id, item]));
  const tractorContext = {
    profile: "tractor",
    applicability: { equipment: { airBrakes: true, loadBars: true }, conditions: { cargo: true, cargoSecurement: true } },
  };
  const hotshotContexts = [
    { profile: "hotshot-open", applicability: { equipment: {}, conditions: { cargo: true } } },
    { profile: "hotshot-enclosed", applicability: { equipment: {}, conditions: { cargo: true } } },
  ];
  const tractorOnlyIds = [
    "t:question:tell-me-when-the-low-air-warning-activates:prompt",
    "t:professional:the-landing-gear-is-fully-raised",
    "t:professional:the-air-lines-are-connected-and-secure",
    "t:required:here-is-the-tractor-registration",
    "t:term:load-bar",
  ];
  for (const id of tractorOnlyIds) {
    const item = byId.get(id);
    assert.ok(item, id);
    assert.equal(Core.appliesTo(item, tractorContext), true, `${id} must remain in the configured tractor course`);
    hotshotContexts.forEach(context => assert.equal(Core.appliesTo(item, context), false, `${id} leaked to ${context.profile}`));
  }
  for (const id of ["t:term:drive-axle", "t:term:tandem", "question:how-is-the-cargo-secured"]) {
    const item = byId.get(id);
    assert.ok(item, id);
    const hotshot = { profile: "hotshot-open", applicability: { conditions: { cargo: true, cargoSecurement: true } } };
    assert.equal(Core.appliesTo(item, hotshot), true, `${id} is shared equipment or cargo language and must remain available when applicable`);
  }
});

test("explicit diagnostic and situation metadata cannot leak tractor equipment into Hotshot", () => {
  const lowAirDiagnostic = {
    id: "listening-pressure",
    audio: "The low-air warning activates at sixty P S I.",
    model: "It activates at 60 psi.",
    profiles: ["tractor"],
    equipment: ["tractor-trailer", "air-brakes"],
  };
  const tandemSituation = {
    id: "situation:scale",
    dialogue: [{ english: "Do I need to reweigh after moving the tandems?" }],
    profiles: ["tractor"],
    equipment: ["tractor-trailer"],
  };
  const hotshotContext = { profile: "hotshot-open", applicability: {} };
  const tractorContext = { profile: "tractor", applicability: { equipment: { airBrakes: true } } };
  assert.equal(Core.appliesTo(lowAirDiagnostic, hotshotContext), false);
  assert.equal(Core.appliesTo(lowAirDiagnostic, tractorContext), true);
  assert.equal(Core.appliesTo(tandemSituation, hotshotContext), false);
  assert.equal(Core.appliesTo(tandemSituation, tractorContext), true);
  assert.equal(Core.appliesTo({ id: "h:tandem-dual", word: "tandem dual trailer", profiles: ["hotshot-open"] }, hotshotContext), true);
});

test("applicability never guesses equipment from words or nested text", () => {
  const undeclared = {
    id: "looks-like-air-brakes",
    profiles: ["hotshot-open"],
    audio: "The low-air warning activates and the landing gear is raised.",
    dialogue: [{ english: "Move the tandems and check the fifth wheel." }],
  };
  assert.equal(Core.appliesTo(undeclared, { profile: "hotshot-open", applicability: {} }), true);
  const declared = { ...undeclared, equipment: ["tractor-trailer", "air-brakes"] };
  assert.equal(Core.appliesTo(declared, { profile: "hotshot-open", applicability: {} }), false);
});

test("open and enclosed equipment stay separated", () => {
  const openOnly = { profiles: ["hotshot-open"], conditions: [] };
  const enclosedOnly = { profiles: ["hotshot-enclosed"], conditions: ["enclosed-trailer"] };
  assert.equal(Core.appliesTo(openOnly, { profile: "hotshot-open", applicability: {} }), true);
  assert.equal(Core.appliesTo(openOnly, { profile: "hotshot-enclosed", applicability: {} }), false);
  assert.equal(Core.appliesTo(enclosedOnly, { profile: "hotshot-enclosed", applicability: {} }), true);
  assert.equal(Core.appliesTo(enclosedOnly, { profile: "hotshot-open", applicability: {} }), false);
});

test("diagnostic answer positions change while correct identity remains intact", () => {
  const source = [{ category: "vocabulary", options: [
    { text: "correct", correct: true },
    { text: "wrong one", correct: false },
    { text: "wrong two", correct: false },
  ] }];
  const positions = new Set();
  for (let seed = 1; seed <= 20; seed += 1) {
    const item = Core.prepareDiagnostic(source, seed)[0];
    positions.add(item.options.findIndex(option => option.correct));
    assert.equal(item.options.filter(option => option.correct).length, 1);
  }
  assert.ok(positions.size > 1);
});

test("diagnostic forms materialize exactly three items in each of four constructs", () => {
  const bank = ["A", "B"].flatMap(form => Core.DIAGNOSTIC_CATEGORIES.flatMap(category => (
    [1, 2, 3, 4].map(slot => ({
      id: `${form}-${category}-${slot}`,
      form,
      category,
      profiles: ["tractor", "hotshot-open", "hotshot-enclosed"],
      stimulusVersion: `${form}-${category}-${slot}@1`,
      options: [
        { text: "correct", correct: true },
        { text: "wrong", correct: false },
      ],
    }))
  )));
  for (const profile of Core.EQUIPMENT_PROFILES) {
    for (const form of ["A", "B"]) {
      const items = Core.materializeDiagnosticForm(bank, {
        form,
        seed: 91,
        formVersion: "cycle3-v1",
        context: { profile, applicability: {} },
      });
      assert.equal(items.length, 12);
      assert.equal(items.every(item => item.form === form && item.formVersion === "cycle3-v1"), true);
      assert.deepEqual(Core.diagnosticBlueprint(items).counts, {
        vocabulary: 3,
        listening: 3,
        elp: 3,
        inspection: 3,
      });
    }
  }
});

test("diagnostic correction form always contains the requested applicable item", () => {
  const bank = ["vocabulary", "listening", "elp", "inspection"].flatMap((category, categoryIndex) => (
    Array.from({ length: 5 }, (_, index) => ({
      id: `${category}-${index}`,
      category,
      form: "A",
      stimulusVersion: category === "listening" ? `audio-${index}` : `${category}-${index}`,
      options: [{ text: "right", correct: true }, { text: "wrong" }],
      profiles: categoryIndex === 0 && index === 4 ? ["tractor"] : ["tractor", "hotshot-open", "hotshot-enclosed"],
    }))
  ));
  for (let seed = 0; seed < 40; seed += 1) {
    const form = Core.materializeDiagnosticForm(bank, { form: "A", seed, requiredItemId: "elp-4", context: { profile: "hotshot-open" } });
    assert.ok(form.some(item => item.id === "elp-4"), `seed ${seed}`);
  }
  assert.throws(
    () => Core.materializeDiagnosticForm(bank, { form: "A", requiredItemId: "vocabulary-4", context: { profile: "hotshot-open" } }),
    error => error?.code === "DIAGNOSTIC_REQUIRED_ITEM_INAPPLICABLE",
  );
});

test("diagnostic blueprint rejects duplicated listening stimuli and incomplete forms", () => {
  const items = Core.DIAGNOSTIC_CATEGORIES.flatMap(category => [1, 2, 3].map(slot => ({
    id: `${category}-${slot}`,
    category,
    stimulusVersion: category === "listening" ? "duplicate" : `${category}-${slot}`,
  })));
  const report = Core.diagnosticBlueprint(items);
  assert.equal(report.valid, false);
  assert.equal(report.duplicateListeningStimuli.length, 2);
  assert.throws(() => Core.materializeDiagnosticForm(items.slice(0, 11), { form: "A" }), error => error.code === "DIAGNOSTIC_BLUEPRINT_INVALID");
});

test("diagnostic scores require multiple answered items per construct", () => {
  const items = [
    { category: "vocabulary" }, { category: "vocabulary" },
    { category: "listening" }, { category: "listening" },
    { category: "elp" }, { category: "elp" },
    { category: "inspection" }, { category: "inspection" },
  ];
  const incomplete = Core.diagnosticScores(items, [{ score: 1 }]);
  assert.match(Core.diagnosticRecommendation(incomplete).recommendation, /не завершена/i);
  const complete = Core.diagnosticScores(items, items.map(() => ({ score: 1 })));
  assert.match(Core.diagnosticRecommendation(complete).recommendation, /смешанного маршрута/i);
});

for (const minutes of [5, 10, 15]) {
  test(`${minutes} minute route retains a professional task`, () => {
    const tasks = [
      { key: "due", priority: true, professional: true },
      { key: "errors", priority: true, professional: true },
      { key: "core" },
      { key: "profile", professional: true },
      { key: "signs" },
    ];
    const selected = Core.chooseSessionTasks(tasks, { minutes });
    assert.equal(selected.length, minutes / 5);
    assert.ok(selected.some(task => task.professional));
  });
}

test("due checks are live and expose the next wake time", () => {
  const now = "2026-08-21T12:00:00.000Z";
  const records = [
    { id: "past", dueAt: "2026-08-21T11:59:59.000Z" },
    { id: "soon", nextDueAt: "2026-08-21T12:05:00.000Z" },
    { id: "later", dueAt: "2026-08-21T13:00:00.000Z" },
  ];
  assert.equal(Core.isDueRecord(records[0], now), true);
  assert.equal(Core.isDueRecord(records[1], now), false);
  assert.equal(Core.isDueRecord(records[1], "2026-08-21T12:05:00.000Z"), true);
  assert.equal(Core.nextDueAt(records, now), "2026-08-21T12:05:00.000Z");
});

test("due queue round-robins every content type before repeating a type", () => {
  const dueAt = "2026-08-21T11:00:00.000Z";
  const groups = Object.fromEntries(Core.DUE_TYPES.map(type => [type, [
    { id: `${type}-1`, bucket: type, dueAt },
    { id: `${type}-2`, bucket: type, dueAt },
  ]]));
  const snapshot = Core.dueQueueSnapshot(groups, { now: "2026-08-21T12:00:00.000Z", limit: 8 });
  assert.deepEqual(snapshot.items.slice(0, 6).map(item => item.bucket), Core.DUE_TYPES);
  assert.deepEqual(snapshot.items.slice(6).map(item => item.bucket), ["words", "questions"]);
  const shifted = Core.roundRobinDueItems(groups, { now: "2026-08-21T12:00:00.000Z", limit: 2, cursor: "signs" });
  assert.deepEqual(shifted.map(item => item.bucket), ["signs", "situations"]);
});

test("future due items stay out of the live queue until dueAt", () => {
  const items = [
    { id: "ready", bucket: "words", dueAt: "2026-08-21T12:00:00.000Z" },
    { id: "later", bucket: "questions", dueAt: "2026-08-21T12:05:00.000Z" },
  ];
  assert.deepEqual(Core.roundRobinDueItems(items, { now: "2026-08-21T12:00:00.000Z" }).map(item => item.id), ["ready"]);
  assert.deepEqual(Core.roundRobinDueItems(items, { now: "2026-08-21T12:05:00.000Z" }).map(item => item.id), ["ready", "later"]);
});

test("errors precede new content and workloads stay bounded", () => {
  const tasks = [
    { key: "core", ids: ["c1", "c2", "c3", "c4", "c5"] },
    { key: "errors", kind: "error", professional: true },
    { key: "due-signs", kind: "due", dueType: "signs", ids: ["s1", "s2", "s3", "s4", "s5", "s6"], professional: true },
    { key: "profile", professional: true, progression: 1, ids: ["p1", "p2", "p3", "p4", "p5"] },
  ];
  const selected = Core.chooseSessionTasks(tasks, { minutes: 15 });
  assert.equal(selected[0].key, "errors");
  assert.equal(selected[1].key, "due-signs");
  assert.ok(selected[1].ids.length <= Core.SESSION_WORKLOADS[15].reviewItemsPerTask);
  assert.ok(selected[2].ids.length <= Core.SESSION_WORKLOADS[15].newItemsPerTask);
});

test("a 5 minute route never replaces an error with new content", () => {
  const chosen = Core.chooseSessionTasks([
    { key: "errors", kind: "error", professional: true },
    { key: "truck", professional: true },
    { key: "core" },
  ], { minutes: 5 });
  assert.deepEqual(chosen.map(item => item.key), ["errors"]);
});

test("a 5 minute due route retains one declared professional item after workload trimming", () => {
  const chosen = Core.chooseSessionTasks([
    {
      key: "due",
      kind: "due",
      professional: true,
      ids: ["c:one", "c:two", "c:three", "c:four", "t:professional"],
      professionalIds: ["t:professional"],
    },
    { key: "truck", professional: true, ids: ["t:new"] },
  ], { minutes: 5 });
  assert.equal(chosen.length, 1);
  assert.equal(chosen[0].key, "due");
  assert.equal(chosen[0].ids.length, Core.SESSION_WORKLOADS[5].reviewItemsPerTask);
  assert.ok(chosen[0].ids.includes("t:professional"));
});

test("the current due task shape retains its appended professional track item", () => {
  const chosen = Core.chooseSessionTasks([{
    key: "due",
    professional: true,
    ids: ["c:one", "c:two", "c:three", "c:four", "c:five", "c:six", "h:winch"],
  }], { minutes: 5 });
  assert.deepEqual(chosen[0].ids, ["c:one", "c:two", "h:winch"]);
});

test("Today selection keeps fixed 5, 10 and 15 minute workloads with professional progression", () => {
  const tasks = [
    { key: "core", ids: ["c:one"] },
    { key: "truck", ids: ["t:one"], professional: true },
    { key: "signs", ids: ["sign-1"] },
    { key: "situation", id: "situation-1", professional: true },
  ];
  for (const minutes of [5, 10, 15]) {
    const snapshot = Core.selectTodayTasks(tasks, [], { minutes, date: "2026-08-21" });
    assert.equal(snapshot.tasks.length, minutes / 5);
    assert.equal(snapshot.routeKeys.length, minutes / 5);
    assert.ok(snapshot.tasks.some(task => task.professional));
  }
});

test("an atomic seven-item ELP gate is never trimmed at any Today duration", () => {
  const ids = [...courseData.elpStepOneIds];
  assert.equal(ids.length, 7);
  const elp = { key: "elp", ids, atomic: true, priority: true, professional: true };
  for (const minutes of [5, 10, 15]) {
    const snapshot = Core.selectTodayTasks([elp], [], { minutes, date: "2026-08-21" });
    assert.deepEqual(snapshot.routeTasks[0].ids, ids);
    const results = Object.fromEntries(ids.map(id => [id, { pass: true, at: "2026-08-21T12:00:00.000Z" }]));
    const attempts = ids.map(id => ({ date: "2026-08-21", contextKey: DAILY_CONTEXT, taskType: "elp", id, completed: true, result: "independent", preReveal: true }));
    assert.equal(Core.dailyTaskCompleted(snapshot.routeTasks[0], attempts, {
      date: "2026-08-21",
      contextKey: DAILY_CONTEXT,
      elpGate: { status: "passed", contextKey: DAILY_CONTEXT, sessionDate: "2026-08-21", sessionIds: ids, results },
    }), true);
  }
});

test("a frozen ELP route can finish after New York midnight using its immutable attempt date", () => {
  const ids = [...courseData.elpStepOneIds];
  assert.equal(ids.length, 7);
  const date = "2026-11-01";
  const results = Object.fromEntries(ids.map((id, index) => [id, {
    pass: true,
    at: index ? "2026-11-02T05:01:00.000Z" : "2026-11-02T03:59:00.000Z",
  }]));
  const attempts = ids.map(id => ({ date, contextKey: DAILY_CONTEXT, taskType: "elp", id, completed: true, result: "independent", preReveal: true }));
  assert.equal(Core.dailyTaskCompleted({ key: "elp", ids, atomic: true, date }, attempts, {
    date,
    contextKey: DAILY_CONTEXT,
    elpGate: { status: "passed", contextKey: DAILY_CONTEXT, sessionDate: date, sessionIds: ids, results },
  }), true);
  assert.equal(Core.dailyTaskCompleted({ key: "elp", ids, atomic: true, date: "2026-11-02" }, attempts, {
    date: "2026-11-02",
    contextKey: DAILY_CONTEXT,
    elpGate: { status: "passed", contextKey: DAILY_CONTEXT, sessionDate: date, sessionIds: ids, results },
  }), false);
});

test("Today excludes current-date completion but never treats a prior-day attempt as complete", () => {
  const tasks = [
    { key: "truck", ids: ["t:one"], professional: true },
    { key: "core", ids: ["c:one"] },
    { key: "signs", ids: ["sign-1"] },
  ];
  const success = { contextKey: DAILY_CONTEXT, taskType: "truck", id: "t:one", completed: true, result: "independent", preReveal: true };
  const prior = Core.selectTodayTasks(tasks, [{ ...success, date: "2026-08-20" }], { minutes: 10, date: "2026-08-21", contextKey: DAILY_CONTEXT });
  assert.ok(prior.routeKeys.includes("truck"));
  const current = Core.selectTodayTasks(tasks, [{ ...success, date: "2026-08-21" }], { minutes: 10, date: "2026-08-21", contextKey: DAILY_CONTEXT });
  assert.ok(!current.routeKeys.includes("truck"));
  assert.equal(current.tasks.length, 2);
});

test("fixed Today route keys remove completed work without backfilling new tasks", () => {
  const tasks = [
    { key: "truck", ids: ["t:one"], professional: true },
    { key: "situation", id: "situation-1", professional: true },
    { key: "core", ids: ["c:one"] },
  ];
  const first = Core.selectTodayTasks(tasks, [], { minutes: 10, date: "2026-08-21" });
  assert.deepEqual(first.routeKeys, ["truck", "situation"]);
  const truckDone = { date: "2026-08-21", contextKey: DAILY_CONTEXT, taskType: "truck", id: "t:one", completed: true, result: "independent", preReveal: true };
  const resumed = Core.selectTodayTasks(tasks, [truckDone], {
    minutes: 10,
    date: "2026-08-21",
    contextKey: DAILY_CONTEXT,
    routeKeys: first.routeKeys,
    dueCursor: first.dueCursor,
  });
  assert.deepEqual(resumed.routeKeys, first.routeKeys);
  assert.deepEqual(resumed.routeTasks.map(task => task.key), first.routeKeys);
  assert.deepEqual(resumed.tasks.map(task => task.key), ["situation"]);
  assert.deepEqual(resumed.completedKeys, ["truck"]);
  assert.ok(!resumed.tasks.some(task => task.key === "core"));
  const situationDone = { date: "2026-08-21", contextKey: DAILY_CONTEXT, taskType: "situation", id: "situation-1", completed: true, result: "independent", preReveal: true };
  const complete = Core.selectTodayTasks(tasks, [truckDone, situationDone], {
    minutes: 10,
    date: "2026-08-21",
    contextKey: DAILY_CONTEXT,
    routeKeys: first.routeKeys,
    dueCursor: first.dueCursor,
  });
  assert.equal(complete.complete, true);
  assert.deepEqual(complete.tasks, []);
});

test("a newly appearing error remains in backlog until an explicit new session", () => {
  const tasks = [
    { key: "errors", kind: "error" },
    { key: "due-questions", kind: "due", dueType: "questions", ids: ["question-1"] },
    { key: "core", ids: ["c:one"] },
  ];
  const snapshot = Core.selectTodayTasks(tasks, [], {
    minutes: 5,
    date: "2026-08-21",
    routeKeys: ["core"],
    dueCursor: 1,
  });
  assert.deepEqual(snapshot.routeKeys, ["core"]);
  assert.deepEqual(snapshot.tasks.map(task => task.key), ["core"]);
  assert.equal(snapshot.routeKeys.length, 1);
  assert.equal(snapshot.dueCursor, 1);
  assert.deepEqual(snapshot.backlogKeys, ["errors", "due-questions"]);
});

test("a newly due task does not mutate an active route", () => {
  const tasks = [
    { key: "due-signs", kind: "due", dueType: "signs", ids: ["sign-1"] },
    { key: "core", ids: ["c:one"] },
  ];
  const first = Core.selectTodayTasks(tasks, [], {
    minutes: 5,
    date: "2026-08-21",
    routeKeys: ["core"],
    dueCursor: 2,
  });
  assert.deepEqual(first.routeKeys, ["core"]);
  assert.deepEqual(first.tasks.map(task => task.key), ["core"]);
  assert.equal(first.routeKeys.length, 1);
  assert.equal(first.dueCursor, 2);
  assert.deepEqual(first.backlogKeys, ["due-signs"]);

  const stable = Core.selectTodayTasks(tasks, [], {
    minutes: 5,
    date: "2026-08-21",
    routeKeys: first.routeKeys,
    dueCursor: first.dueCursor,
  });
  assert.deepEqual(stable.routeKeys, first.routeKeys);
  assert.equal(stable.dueCursor, first.dueCursor);
});

test("a future due question updates backlog without expanding or replacing an active route", () => {
  const date = "2026-08-21";
  const diagnostic = {
    key: "diagnostic",
    ids: ["t:diagnostic"],
    priority: true,
    professional: true,
  };
  const beforeDue = Core.selectTodayTasks([diagnostic], [], {
    minutes: 5,
    date,
    routeKeys: ["diagnostic"],
    dueCursor: 1,
    now: "2026-08-21T11:59:59.999Z",
  });
  assert.deepEqual(beforeDue.routeKeys, ["diagnostic"]);

  const dueQuestion = {
    key: "due-questions",
    kind: "due",
    dueType: "questions",
    dueAt: "2026-08-21T12:00:00.000Z",
    ids: ["question-1"],
    priority: true,
    professional: true,
  };
  const atDue = Core.selectTodayTasks([dueQuestion, diagnostic], [], {
    minutes: 5,
    date,
    routeKeys: beforeDue.routeKeys,
    dueCursor: beforeDue.dueCursor,
    now: dueQuestion.dueAt,
  });
  assert.deepEqual(atDue.routeKeys, ["diagnostic"]);
  assert.deepEqual(atDue.tasks.map(task => task.key), ["diagnostic"]);
  assert.equal(atDue.dueCursor, 1);
  assert.deepEqual(atDue.backlogKeys, ["due-questions"]);

  const stable = Core.selectTodayTasks([dueQuestion, diagnostic], [], {
    minutes: 5,
    date,
    routeKeys: atDue.routeKeys,
    dueCursor: atDue.dueCursor,
    now: dueQuestion.dueAt,
  });
  assert.deepEqual(stable.routeKeys, atDue.routeKeys);
  assert.equal(stable.dueCursor, atDue.dueCursor);
});

test("successive Today sessions round-robin due types without starvation", () => {
  const tasks = [
    { key: "due", dueType: "words", kind: "due", ids: ["c:one", "t:one"], professional: true, professionalIds: ["t:one"] },
    { key: "due-questions", dueType: "questions", kind: "due", ids: ["question-1"], professional: true },
    { key: "due-signs", dueType: "signs", kind: "due", ids: ["sign-1"], professional: true },
    { key: "truck", ids: ["t:new"], professional: true },
  ];
  const date = "2026-08-21";
  const first = Core.selectTodayTasks(tasks, [], { minutes: 5, date, dueCursor: 0 });
  assert.deepEqual(first.routeKeys, ["due"]);
  assert.equal(first.dueCursor, 1);
  const attempts = ["c:one", "t:one"].map(id => ({ date, taskType: "due", id, completed: true, result: "independent", preReveal: true }));
  const second = Core.selectTodayTasks(tasks, attempts, { minutes: 5, date, dueCursor: first.dueCursor });
  assert.deepEqual(second.routeKeys, ["due-questions"]);
  assert.equal(second.dueCursor, 2);
  attempts.push({ date, taskType: "due-questions", id: "question-1", completed: true, result: "independent", preReveal: true });
  const third = Core.selectTodayTasks(tasks, attempts, { minutes: 5, date, dueCursor: second.dueCursor });
  assert.deepEqual(third.routeKeys, ["due-signs"]);
  assert.equal(third.dueCursor, 3);
});

test("Today keeps errors first and does not advance the due cursor when errors fill the route", () => {
  const tasks = [
    { key: "errors", kind: "error" },
    { key: "due", dueType: "words", kind: "due", ids: ["c:one", "t:one"], professional: true },
    { key: "truck", ids: ["t:new"], professional: true },
  ];
  const snapshot = Core.selectTodayTasks(tasks, [], { minutes: 5, date: "2026-08-21", dueCursor: 4 });
  assert.deepEqual(snapshot.routeKeys, ["errors"]);
  assert.equal(snapshot.dueCursor, 4);
});

test("a failed attempt never completes a daily step", () => {
  const task = { key: "due-signs", ids: ["sign-1"], date: "2026-08-21" };
  assert.equal(Core.dailyTaskCompleted(task, [
    { date: "2026-08-21", contextKey: DAILY_CONTEXT, taskType: "due-signs", id: "sign-1", completed: true, result: "failed" },
  ], { contextKey: DAILY_CONTEXT }), false);
  assert.equal(Core.dailyTaskCompleted(task, [
    { date: "2026-08-21", contextKey: DAILY_CONTEXT, taskType: "due-signs", id: "sign-1", completed: true, result: "prompted" },
  ], { contextKey: DAILY_CONTEXT }), false);
  assert.equal(Core.dailyTaskCompleted(task, [
    { date: "2026-08-21", contextKey: DAILY_CONTEXT, taskType: "due-signs", id: "sign-1", completed: true, result: "independent", preReveal: true },
  ], { contextKey: DAILY_CONTEXT }), true);
  assert.equal(Core.dailyTaskCompleted(task, [
    { date: "2026-08-21", contextKey: DAILY_CONTEXT, taskType: "due-signs", id: "sign-1", completed: true, result: "independent", revealed: true },
  ], { contextKey: DAILY_CONTEXT }), false);
});

test("a prior-day success never completes today's task", () => {
  const task = { key: "core", ids: ["c:one"], date: "2026-08-21" };
  const prior = { date: "2026-08-20", contextKey: DAILY_CONTEXT, taskType: "core", id: "c:one", completed: true, result: "independent", preReveal: true };
  const current = { ...prior, date: "2026-08-21" };
  assert.equal(Core.dailyTaskCompleted(task, [prior], { contextKey: DAILY_CONTEXT }), false);
  assert.equal(Core.dailyTaskCompleted(task, [prior, current], { contextKey: DAILY_CONTEXT }), true);
});

test("daily completion requires an exact qualification context", () => {
  const task = { key: "core", ids: ["c:one"], date: "2026-08-21" };
  const attempt = {
    date: "2026-08-21",
    contextKey: DAILY_CONTEXT,
    taskType: "core",
    id: "c:one",
    completed: true,
    result: "independent",
    preReveal: true,
  };
  assert.equal(Core.dailyTaskCompleted(task, [attempt]), false);
  assert.equal(Core.dailyTaskCompleted(task, [attempt], { contextKey: "qualification-context-hotshot" }), false);
  assert.equal(Core.dailyTaskCompleted(task, [{ ...attempt, contextKey: null }], { contextKey: DAILY_CONTEXT }), false);
  assert.equal(Core.dailyTaskCompleted(task, [attempt], { contextKey: DAILY_CONTEXT }), true);
});

test("a focused task accepts same-day qualifying evidence for its IDs from an ordinary words route", () => {
  const focused = { key: "focused-core", ids: ["c:one"], date: "2026-08-21" };
  const ordinary = {
    date: "2026-08-21",
    contextKey: DAILY_CONTEXT,
    taskType: "words",
    id: "c:one",
    completed: true,
    result: "independent",
    preReveal: true,
  };
  assert.equal(Core.dailyTaskCompleted(focused, [ordinary], { contextKey: DAILY_CONTEXT }), true);
  assert.equal(Core.dailyTaskCompleted({ key: "focused-core", date: "2026-08-21" }, [ordinary], { contextKey: DAILY_CONTEXT }), false);
});

test("listening and ELP routes require their own construct evidence", () => {
  const ordinary = {
    date: "2026-08-21",
    contextKey: DAILY_CONTEXT,
    taskType: "questions",
    id: "question-1",
    completed: true,
    result: "independent",
    preReveal: true,
    evidence: { outcome: "success", independent: true, preReveal: true, variant: "direct-response" },
  };
  const listeningTask = { key: "listening", ids: ["question-1"], date: "2026-08-21" };
  assert.equal(Core.dailyTaskCompleted(listeningTask, [ordinary], { contextKey: DAILY_CONTEXT }), false);
  assert.equal(Core.dailyTaskCompleted(listeningTask, [{
    ...ordinary,
    taskType: "listening",
    evidence: { ...ordinary.evidence, variant: "direct-response" },
  }], { contextKey: DAILY_CONTEXT }), false);
  assert.equal(Core.dailyTaskCompleted(listeningTask, [{
    ...ordinary,
    taskType: "listening",
    evidence: undefined,
    variant: "driver-answer-listening",
  }], { contextKey: DAILY_CONTEXT }), true);
  assert.equal(Core.dailyTaskCompleted(listeningTask, [{
    ...ordinary,
    taskType: "listening",
    evidence: undefined,
    variant: "profile:tractor|condition:hazmat|listening-response",
  }], { contextKey: DAILY_CONTEXT }), true);

  const elpTask = { key: "elp", ids: ["question-1"], date: "2026-08-21" };
  assert.equal(Core.dailyTaskCompleted(elpTask, [ordinary], { contextKey: DAILY_CONTEXT }), false);
  const elpSuccess = { ...ordinary, taskType: "elp" };
  assert.equal(Core.dailyTaskCompleted(elpTask, [elpSuccess], { contextKey: DAILY_CONTEXT, elpGate: null }), false);
  assert.equal(Core.dailyTaskCompleted(elpTask, [elpSuccess], {
    contextKey: DAILY_CONTEXT,
    elpGate: {
      status: "passed",
      contextKey: DAILY_CONTEXT,
      sessionDate: "2026-08-21",
      sessionIds: ["question-1"],
      results: { "question-1": { pass: true, at: "2026-08-21T12:00:00.000Z" } },
    },
  }), true);
  assert.equal(Core.dailyTaskCompleted(elpTask, [elpSuccess], {
    contextKey: DAILY_CONTEXT,
    elpGate: {
      status: "passed",
      contextKey: "qualification-context-hotshot",
      sessionDate: "2026-08-21",
      sessionIds: ["question-1"],
      results: { "question-1": { pass: true, at: "2026-08-21T12:00:00.000Z" } },
    },
  }), false);
  assert.equal(Core.dailyTaskCompleted(elpTask, [elpSuccess], {
    contextKey: DAILY_CONTEXT,
    elpGate: {
      status: "passed",
      contextKey: DAILY_CONTEXT,
      sessionDate: "2026-08-20",
      sessionIds: ["question-1"],
      results: { "question-1": { pass: true, at: "2026-08-20T12:00:00.000Z" } },
    },
  }), false);
  assert.equal(Core.dailyTaskCompleted(elpTask, [elpSuccess], {
    contextKey: DAILY_CONTEXT,
    elpGate: {
      status: "passed",
      contextKey: DAILY_CONTEXT,
      sessionDate: "2026-08-21",
      sessionIds: ["question-1"],
      results: { "question-1": { pass: true, at: "2026-08-22T04:10:00.000Z" } },
    },
  }), true);
});

test("Today isolates overlapping listening and productive question constructs", () => {
  const date = "2026-08-21";
  const id = "question-1";
  const tasks = [
    { key: "listening", ids: [id], date, professional: true },
    { key: "due-questions", kind: "due", dueType: "questions", ids: [id], date, professional: true },
  ];
  const questionsTask = { key: "questions", ids: [id], date };
  const diagnosticTask = { key: "diagnostic", bucket: "questions", ids: [id], date };
  const questionErrorTarget = { type: "question", id, contextKey: DAILY_CONTEXT, semanticBranch: null };
  const errorsTask = { key: "errors", date, errorTarget: questionErrorTarget };
  const asError = attempt => ({
    ...attempt,
    taskType: "errors",
    errorTarget: questionErrorTarget,
    errorEvidenceAt: "2026-08-21T12:00:00.000Z",
  });
  const listening = {
    date,
    contextKey: DAILY_CONTEXT,
    taskType: "listening",
    bucket: "questions",
    id,
    completed: true,
    evidence: {
      outcome: "success",
      independent: true,
      preReveal: true,
      productive: false,
      variant: "profile:tractor|condition:hazmat|driver-answer-listening",
    },
    variant: "profile:tractor|condition:hazmat|driver-answer-listening",
  };
  const productive = {
    date,
    contextKey: DAILY_CONTEXT,
    taskType: "questions",
    bucket: "questions",
    id,
    completed: true,
    evidence: {
      outcome: "success",
      independent: true,
      preReveal: true,
      productive: true,
      variant: "profile:tractor|condition:hazmat|direct-response",
    },
    variant: "profile:tractor|condition:hazmat|direct-response",
  };
  const productiveListening = {
    ...productive,
    evidence: {
      ...productive.evidence,
      variant: "profile:tractor|condition:hazmat|listening-response",
    },
    variant: "profile:tractor|condition:hazmat|listening-response",
  };
  const productiveRegulatory = {
    ...productive,
    evidence: { ...productive.evidence, variant: "regulatory-primary" },
    variant: "regulatory-primary",
  };

  assert.equal(Core.dailyTaskCompleted(tasks[0], [productive], { contextKey: DAILY_CONTEXT }), false);
  assert.equal(Core.dailyTaskCompleted(tasks[0], [listening], { contextKey: DAILY_CONTEXT }), true);
  assert.equal(Core.dailyTaskCompleted(tasks[1], [listening], { contextKey: DAILY_CONTEXT }), false);
  assert.equal(Core.dailyTaskCompleted(questionsTask, [listening], { contextKey: DAILY_CONTEXT }), false);
  assert.equal(Core.dailyTaskCompleted(diagnosticTask, [listening], { contextKey: DAILY_CONTEXT }), false);
  assert.equal(Core.dailyTaskCompleted(errorsTask, [asError(listening)], { contextKey: DAILY_CONTEXT }), false);
  assert.equal(Core.dailyTaskCompleted(errorsTask, [asError({
    ...listening,
    evidence: { ...listening.evidence, productive: true, variant: "profile:tractor|condition:hazmat|listening-response" },
    variant: "profile:tractor|condition:hazmat|listening-response",
  })], { contextKey: DAILY_CONTEXT }), true);
  assert.equal(Core.dailyTaskCompleted(tasks[1], [{
    ...listening,
    evidence: { ...listening.evidence, variant: "profile:tractor|condition:hazmat|listening-response" },
    variant: "profile:tractor|condition:hazmat|listening-response",
  }], { contextKey: DAILY_CONTEXT }), false);
  assert.equal(Core.dailyTaskCompleted(tasks[1], [productive], { contextKey: DAILY_CONTEXT }), true);
  assert.equal(Core.dailyTaskCompleted(questionsTask, [productive], { contextKey: DAILY_CONTEXT }), true);
  assert.equal(Core.dailyTaskCompleted(tasks[1], [productiveListening], { contextKey: DAILY_CONTEXT }), true);
  assert.equal(Core.dailyTaskCompleted(diagnosticTask, [productiveListening], { contextKey: DAILY_CONTEXT }), true);
  assert.equal(Core.dailyTaskCompleted(tasks[1], [productiveRegulatory], { contextKey: DAILY_CONTEXT }), true);
  assert.equal(Core.dailyTaskCompleted(diagnosticTask, [productive], { contextKey: DAILY_CONTEXT }), true);
  assert.equal(Core.dailyTaskCompleted(errorsTask, [asError(productive)], { contextKey: DAILY_CONTEXT }), true);
  assert.equal(Core.dailyTaskCompleted(tasks[1], [{
    ...productive,
    evidence: { ...productive.evidence, productive: false },
  }], { contextKey: DAILY_CONTEXT }), false);

  const afterListening = Core.selectTodayTasks(tasks, [listening], {
    minutes: 10,
    date,
    contextKey: DAILY_CONTEXT,
    routeKeys: tasks.map(task => task.key),
  });
  assert.deepEqual(afterListening.completedKeys, ["listening"]);
  assert.deepEqual(afterListening.tasks.map(task => task.key), ["due-questions"]);
  assert.equal(afterListening.complete, false);

  const complete = Core.selectTodayTasks(tasks, [listening, productive], {
    minutes: 10,
    date,
    contextKey: DAILY_CONTEXT,
    routeKeys: tasks.map(task => task.key),
  });
  assert.deepEqual(complete.completedKeys, ["listening", "due-questions"]);
  assert.deepEqual(complete.tasks, []);
  assert.equal(complete.complete, true);
});

test("Today errors complete only from the frozen exact recovery target", () => {
  const date = "2026-08-21";
  const wordTarget = { type: "word", id: "c:make", contextKey: null, semanticBranch: "shared:words:c:make" };
  const questionTarget = { type: "question", id: "q:stop", contextKey: DAILY_CONTEXT, semanticBranch: null };
  const diagnosticTarget = { type: "diagnostic", id: "diagnostic-a", contextKey: DAILY_CONTEXT, semanticBranch: null };
  const branchTarget = { type: "branching", id: "branch-0", contextKey: DAILY_CONTEXT, semanticBranch: null };
  const success = (target, overrides = {}) => ({
    date,
    contextKey: DAILY_CONTEXT,
    taskType: "errors",
    bucket: target.type === "word" ? "words" : target.type === "question" ? "questions" : null,
    id: target.type === "word" || target.type === "question" ? target.id : null,
    completed: true,
    result: "independent",
    variant: "direct-response",
    errorTarget: target,
    errorEvidenceAt: "2026-08-21T12:00:00.000Z",
    ...overrides,
  });

  const wordTask = { key: "errors", date, errorTarget: wordTarget };
  assert.equal(Core.dailyTaskCompleted(wordTask, [success(wordTarget, { bucket: "questions", id: "q:stop" })], { contextKey: DAILY_CONTEXT }), false);
  assert.equal(Core.dailyTaskCompleted(wordTask, [success(questionTarget)], { contextKey: DAILY_CONTEXT }), false);
  assert.equal(Core.dailyTaskCompleted(wordTask, [success(wordTarget)], { contextKey: DAILY_CONTEXT }), true);
  assert.equal(Core.dailyTaskCompleted(wordTask, [success(wordTarget, { variant: "driver-answer-listening" })], { contextKey: DAILY_CONTEXT }), false);
  assert.equal(Core.dailyTaskCompleted(wordTask, [success(wordTarget, { variant: "listening-response" })], { contextKey: DAILY_CONTEXT }), true);

  assert.equal(Core.dailyTaskCompleted({ key: "errors", date, errorTarget: diagnosticTarget }, [success(branchTarget)], { contextKey: DAILY_CONTEXT }), false);
  assert.equal(Core.dailyTaskCompleted({ key: "errors", date, errorTarget: branchTarget }, [success(diagnosticTarget)], { contextKey: DAILY_CONTEXT }), false);
  assert.equal(Core.dailyTaskCompleted({ key: "errors", date, errorTarget: diagnosticTarget }, [success(diagnosticTarget)], { contextKey: DAILY_CONTEXT }), true);
  assert.equal(Core.dailyTaskCompleted({ key: "errors", date, errorTarget: branchTarget }, [success(branchTarget)], { contextKey: DAILY_CONTEXT }), true);
});

test("nextPendingIndex wraps to earlier failed cards and stops when all cards are complete", () => {
  const queue = [{ id: "one" }, { id: "two" }, { id: "three" }];
  assert.equal(Core.nextPendingIndex(queue, 2, ["two", "three"]), 0);
  assert.equal(Core.nextPendingIndex(queue, 0, new Set(["one", "three"])), 1);
  assert.equal(Core.nextPendingIndex(queue, 1, ["one", "two", "three"]), -1);
  assert.equal(Core.nextPendingIndex([], 0, []), -1);
});

test("SRS labels and exact dueAt use the same immutable metadata", () => {
  const now = "2026-08-21T12:00:00.000Z";
  const expected = {
    again: ["Снова · 10 минут", "2026-08-21T12:10:00.000Z"],
    hard: ["Трудно · 1 день", "2026-08-22T12:00:00.000Z"],
    good: ["Хорошо · 3 дня", "2026-08-24T12:00:00.000Z"],
    easy: ["Легко · 7 дней", "2026-08-28T12:00:00.000Z"],
  };
  for (const [grade, [label, dueAt]] of Object.entries(expected)) {
    const schedule = Core.scheduleReview(grade, now);
    assert.equal(schedule.label, label);
    assert.equal(schedule.dueAt, dueAt);
    const record = Core.applyCardSchedule({ evidence: [{ at: now }] }, grade, now);
    assert.equal(record.nextDueAt, dueAt);
    assert.equal(record.dueAt, dueAt);
    assert.deepEqual(record.evidence, [{ at: now }]);
  }
});

test("a failed demonstrated retrieval can only schedule Again", () => {
  const now = "2026-08-21T12:00:00.000Z";
  const record = {
    evidence: [
      { at: "2026-08-20T12:00:00.000Z", kind: "demonstrated", outcome: "success" },
      { at: now, kind: "demonstrated", outcome: "failed" },
    ],
  };
  for (const grade of ["hard", "good", "easy"]) {
    const scheduled = Core.applyCardSchedule(record, grade, now);
    assert.equal(scheduled.lastGrade, "again");
    assert.equal(scheduled.dueAt, "2026-08-21T12:10:00.000Z");
    assert.deepEqual(scheduled.evidence, record.evidence);
  }
});

test("profile materialization replaces only declared semantic fields", () => {
  const source = {
    id: "question:cargo",
    profiles: ["tractor", "hotshot-open", "hotshot-enclosed"],
    conditions: ["cargo"],
    equipment: [],
    answer: "I am hauling packaged food.",
    profileMaterializations: {
      tractor: { answer: "I am hauling packaged food." },
      "hotshot-open": { answer: "I am hauling two vehicles.", slots: [{ type: "cargo-description", display: "two vehicles" }] },
    },
  };
  const hotshot = Core.materializeForProfile(source, { profile: "hotshot-open" });
  assert.equal(hotshot.id, source.id);
  assert.equal(hotshot.answer, "I am hauling two vehicles.");
  assert.equal(hotshot.materializedProfile, "hotshot-open");
  assert.deepEqual(hotshot.conditions, ["cargo"]);
  assert.equal(Core.materializeForProfile(source, "both").answer, "I am hauling packaged food.");
  assert.equal(Core.materializeForProfile(source, "hotshot-enclosed"), source);
});

test("active vehicle-weight conditions materialize q66 and the securement lesson without cross-branch leakage", () => {
  const question = courseData.inspectionQuestions.find(item => item.id === "question:how-is-the-cargo-secured");
  const lesson = courseData.lessons.find(item => item.id === "lesson:securing-transported-vehicles");
  assert.ok(question?.conditionMaterializations);
  assert.ok(lesson?.conditionMaterializations);
  const lowContext = {
    profile: "hotshot-open",
    conditions: {
      cargoSecurement: true,
      vehicleTransport: true,
      transportedVehicleAtMost10000Lb: true,
    },
  };
  const highContext = {
    profile: "hotshot-open",
    conditions: {
      cargoSecurement: true,
      vehicleTransport: true,
      transportedVehicleOver10000Lb: true,
    },
  };

  const lowQuestion = Core.materializeForProfile(question, lowContext);
  assert.equal(lowQuestion.materializedCondition, "transported-automobile-or-light-truck-at-most-10000-lb");
  assert.equal(lowQuestion.materializedConditionBranch, "vehicle-at-most-10000-lb");
  assert.equal(lowQuestion.visibleStimulus.individualVehicleWeightLb, 8600);
  assert.match(lowQuestion.promptDisplay, /8,600 pounds/);
  assert.match(lowQuestion.answerDisplay, /393\.128 branch/);
  assert.equal(lowQuestion.responseRubric.branchConflictPolicy.forbiddenRegulation, "393.130");
  assert.deepEqual(lowQuestion.answerSlots.map(slot => slot.display), ["8,600 pounds", "2 tiedowns", "393.128"]);
  assert.deepEqual(lowQuestion.conditions, question.conditions);

  const highQuestion = Core.materializeForProfile(question, highContext);
  assert.equal(highQuestion.materializedCondition, "transported-automobile-or-light-truck-over-10000-lb");
  assert.equal(highQuestion.visibleStimulus.individualVehicleWeightLb, 12400);
  assert.match(highQuestion.answerDisplay, /four tiedowns/);
  assert.equal(highQuestion.responseRubric.branchConflictPolicy.forbiddenRegulation, "393.128");

  const lowLesson = Core.materializeForProfile(lesson, lowContext);
  const highLesson = Core.materializeForProfile(lesson, highContext);
  assert.equal(lowLesson.materializedConditionBranch, "vehicle-at-most-10000-lb");
  assert.match(lowLesson.interaction.modelResponse, /minimum is two tiedowns/);
  assert.match(highLesson.interaction.modelResponse, /at least four tiedowns/);
  assert.equal(highLesson.interaction.semanticRubric.branchConflictPolicy.requiredRegulation, "393.130");

  const generic = Core.materializeForProfile(question, { profile: "hotshot-open", conditions: { cargoSecurement: true } });
  assert.equal(generic.materializedCondition, undefined);
  assert.match(generic.answer, /front and rear/);
  const conflict = Core.materializeForProfile(question, {
    profile: "hotshot-open",
    conditions: {
      cargoSecurement: true,
      transportedVehicleAtMost10000Lb: true,
      transportedVehicleOver10000Lb: true,
    },
  });
  assert.deepEqual(conflict.materializationConflict, [
    "transported-automobile-or-light-truck-at-most-10000-lb",
    "transported-automobile-or-light-truck-over-10000-lb",
  ]);
  assert.equal(conflict.materializedCondition, undefined);
});

test("turn slots use explicit ownership and do not leak a location into a cargo turn", () => {
  const slots = [
    { name: "origin", type: "location", display: "Columbus, Ohio", turnIds: ["turn-1"] },
    { name: "cargo", type: "cargo-description", display: "two vehicles", turnId: "turn-2" },
    { name: "fallback", type: "location", display: "Nashville, Tennessee" },
  ];
  assert.deepEqual(
    Core.slotsForTurn(slots, { id: "turn-1", prompt: "Where are you coming from?", expected: "I left Columbus, Ohio for Nashville, Tennessee." }).map(slot => slot.name),
    ["origin", "fallback"],
  );
  assert.deepEqual(
    Core.slotsForTurn(slots, { id: "turn-2", prompt: "What are you hauling?", expected: "I am hauling two vehicles." }).map(slot => slot.name),
    ["cargo"],
  );
});

test("turn group materialization never removes a concept owned by another turn", () => {
  const variants = [{
    id: "transfer",
    slotValues: [
      { display: "reweigh lane", turnIds: ["turn-1"] },
      { display: "Door 27", turnIds: ["turn-2"] },
    ],
  }];
  const turnTwoGroups = Core.scopedTurnRequiredGroups([["reweigh"], ["check"], ["door"]], variants, "turn-2", [
    { display: "Door 27", turnIds: ["turn-2"] },
  ]);
  assert.ok(turnTwoGroups.some(group => group.includes("reweigh")), "another turn's reweigh slot cannot erase this required action");
  assert.ok(turnTwoGroups.some(group => group.includes("check")));
  assert.ok(turnTwoGroups.some(group => group.includes("door")));
  assert.ok(turnTwoGroups.some(group => group.includes("27")));
});
