const test = require("node:test");
const assert = require("node:assert/strict");

const Eval = require("../app/learning-evaluator.js");
const Core = require("../app/app-core.js");
const courseData = require("../app/data/course-data.json");

const stepOne = {
  id: "question:where-are-you-coming-from",
  promptDisplay: "Where are you coming from?",
  answerDisplay: "I picked up in Columbus, Ohio.",
  slots: [{ name: "origin-city-state", type: "location", display: "Columbus, Ohio", spoken: "Columbus, Ohio" }],
};

test("ELP Step 1 rejects no-no, yes-yes, prompt echo and irrelevant text", () => {
  for (const response of ["no no", "yes yes", "Where are you coming from?", "The weather is nice today."]) {
    assert.equal(Eval.evaluateQuestion(stepOne, response, { elpStepOne: true }).pass, false, response);
  }
});

test("ELP Step 1 accepts a keyed English-bearing response", () => {
  const result = Eval.evaluateQuestion(stepOne, "I picked up in Columbus, Ohio.", { elpStepOne: true });
  assert.equal(result.pass, true);
  assert.equal(result.evaluator, "semantic-slots");
});

test("ELP Step 1 rejects repudiation and refusal while accepting curated natural equivalents", () => {
  const questions = new Map(courseData.inspectionQuestions.map(item => [item.id, item]));
  const origin = questions.get("question:where-are-you-coming-from");
  const lane = questions.get("question:pull-into-the-inspection-lane");
  const cargo = questions.get("question:what-are-you-hauling");
  const carrier = questions.get("question:who-do-you-drive-for");
  for (const id of courseData.elpStepOneIds) {
    const item = questions.get(id);
    assert.equal(Eval.evaluateQuestion(item, `It is false that ${item.answerDisplay}`, { elpStepOne: true }).pass, false, `${id}: false-that`);
    assert.equal(Eval.evaluateQuestion(item, `${item.answerDisplay} That is not correct.`, { elpStepOne: true }).pass, false, `${id}: anaphoric repudiation`);
    assert.equal(Eval.evaluateQuestion(item, `${item.answerDisplay} Actually, that's wrong.`, { elpStepOne: true }).pass, false, `${id}: contracted repudiation`);
    assert.equal(Eval.evaluateQuestion(item, `I refuse to answer, but ${item.answerDisplay}`, { elpStepOne: true }).pass, false, `${id}: refusal stuffing`);
    assert.equal(Eval.evaluateQuestion(item, `I refuse. ${item.answerDisplay}`, { elpStepOne: true }).pass, false, `${id}: bare refusal stuffing`);
  }
  assert.equal(Eval.evaluateQuestion(origin, "I am coming from Columbus, Ohio. No.", { elpStepOne: true }).pass, false);
  assert.equal(Eval.evaluateQuestion(cargo, "I refuse to answer, but I am hauling packaged food.", { elpStepOne: true }).pass, false);
  assert.equal(Eval.evaluateQuestion(origin, "I left Columbus, Ohio.", { elpStepOne: true }).pass, true);
  assert.equal(Eval.evaluateQuestion(lane, "I'll enter the inspection lane.", { elpStepOne: true }).pass, true);
  assert.equal(Eval.evaluateQuestion(cargo, "Packaged food.", { elpStepOne: true }).pass, true);
  assert.equal(Eval.evaluateQuestion(cargo, "I am hauling packaged food. The load is secure.", { elpStepOne: true }).pass, true);
  assert.equal(Eval.evaluateQuestion(carrier, "Training Carrier is my employer.", { elpStepOne: true }).pass, true);
});

test("current assertions may supersede explicit history but unresolved competing assertions fail", () => {
  const origin = courseData.inspectionQuestions.find(item => item.id === "question:where-are-you-coming-from");
  assert.equal(Eval.evaluateQuestion(
    origin,
    "I came from Miami earlier, but now I am coming from Columbus, Ohio.",
    { elpStepOne: true },
  ).pass, true);
  assert.equal(Eval.evaluateQuestion(
    origin,
    "I picked up in Columbus, Ohio earlier today, and now I am headed to Nashville, Tennessee.",
    { elpStepOne: true },
  ).pass, true);
  assert.equal(Eval.evaluateQuestion(
    origin,
    "I came from Columbus, Ohio, but I am coming from Miami, Florida.",
    { elpStepOne: true },
  ).pass, false);
  const time = { name: "time", type: "time", display: "9:30 a.m.", spoken: "nine thirty A.M." };
  assert.equal(Eval.slotMatches("It was 10:30 a.m. earlier, but now the appointment is 9:30 a.m.", time), true);
  assert.equal(Eval.slotMatches("The appointment is 10:30 a.m. The appointment is 9:30 a.m.", time), false);
});

test("all seven ELP Step 1 tasks require the keyed relation, not a global token bag", () => {
  const questions = new Map(courseData.inspectionQuestions.map(item => [item.id, item]));
  const contrasts = new Map([
    ["question:pull-into-the-inspection-lane", "I will drive past the inspection lane."],
    ["question:what-is-your-truck-and-trailer-number", "The truck is TR-518 and the trailer is T-204."],
    ["question:where-are-you-coming-from", "I left Columbus, Ohio, but I am coming from Miami."],
    ["question:where-are-you-going", "I picked up in Nashville, Tennessee."],
    ["question:what-are-you-hauling", "I unloaded packaged food and I am hauling cars."],
    ["question:who-do-you-drive-for", "I drive away from Training Carrier."],
    ["question:what-is-your-current-duty-status", "I am on vacation duty and not driving."],
  ]);
  assert.equal(courseData.elpStepOneIds.length, 7);
  for (const id of courseData.elpStepOneIds) {
    const item = questions.get(id);
    assert.ok(item, id);
    assert.equal(Eval.evaluateQuestion(item, item.answerDisplay, { elpStepOne: true }).pass, true, `${id}: valid`);
    assert.equal(Eval.evaluateQuestion(item, contrasts.get(id), { elpStepOne: true }).pass, false, `${id}: contrast`);
  }
  const mixed = Object.fromEntries(courseData.elpStepOneIds.map((id, index) => {
    const item = questions.get(id);
    const response = index === 0 ? contrasts.get(id) : item.answerDisplay;
    return [id, Eval.evaluateQuestion(item, response, { elpStepOne: true })];
  }));
  assert.equal(Eval.deriveGateStatus(mixed, courseData.elpStepOneIds), "failed");
});

test("ELP unit identification binds both profile-specific IDs to their roles", () => {
  const source = courseData.inspectionQuestions.find(item => item.id === "question:what-is-your-truck-and-trailer-number");
  const profiles = ["tractor", "hotshot-open", "hotshot-enclosed"];
  for (const [index, profile] of profiles.entries()) {
    const item = Core.materializeForProfile(source, { profile });
    const [powerUnit, trailer] = item.slots.map(slot => slot.display);
    const other = Core.materializeForProfile(source, { profile: profiles[(index + 1) % profiles.length] });
    assert.equal(Eval.evaluateQuestion(item, item.answerDisplay, { elpStepOne: true }).pass, true, `${profile}: canonical`);
    assert.equal(Eval.evaluateQuestion(item, `The power unit is ${trailer} and the trailer is ${powerUnit}.`, { elpStepOne: true }).pass, false, `${profile}: swapped roles`);
    assert.equal(Eval.evaluateQuestion(item, `The power unit is ${powerUnit}.`, { elpStepOne: true }).pass, false, `${profile}: one ID`);
    assert.equal(Eval.evaluateQuestion(item, other.answerDisplay, { elpStepOne: true }).pass, false, `${profile}: wrong profile`);
  }
});

test("ELP origin and destination remain distinct relations", () => {
  const questions = new Map(courseData.inspectionQuestions.map(item => [item.id, item]));
  const origin = questions.get("question:where-are-you-coming-from");
  const destination = questions.get("question:where-are-you-going");
  assert.equal(Eval.evaluateQuestion(origin, origin.answerDisplay, { elpStepOne: true }).pass, true);
  assert.equal(Eval.evaluateQuestion(destination, destination.answerDisplay, { elpStepOne: true }).pass, true);
  assert.equal(Eval.evaluateQuestion(origin, destination.answerDisplay, { elpStepOne: true }).pass, false);
  assert.equal(Eval.evaluateQuestion(destination, origin.answerDisplay, { elpStepOne: true }).pass, false);
  assert.equal(Eval.evaluateQuestion(origin, "I am headed to Columbus, Ohio.", { elpStepOne: true }).pass, false);
  assert.equal(Eval.evaluateQuestion(destination, "I picked up in Nashville, Tennessee.", { elpStepOne: true }).pass, false);
});

test("ELP and branching reject polarity reversals", () => {
  const cases = [
    [{ id: "question:pull-into-the-inspection-lane", prompt: "Pull into the inspection lane.", answer: "I will pull into the inspection lane." }, "I will not pull into the inspection lane.", true],
    [{ id: "question:what-are-you-hauling", prompt: "What are you hauling?", answer: "I am hauling packaged food." }, "I am not hauling packaged food.", true],
    [{ id: "question:who-do-you-drive-for", prompt: "Who do you drive for?", answer: "I work for Training Carrier." }, "I do not work for Training Carrier.", true],
    [{ id: "question:what-is-your-current-duty-status", prompt: "What is your current duty status?", answer: "I am on duty, not driving." }, "I am not on duty. I am driving.", true],
  ];
  for (const [item, response] of cases) assert.equal(Eval.evaluateQuestion(item, response, { elpStepOne: true }).pass, false, response);
  assert.equal(Eval.evaluateSemanticResponse({ response: "I will not pull over safely and wait.", expected: "I will pull over safely and wait.", rubric: { requiredGroups: [["pull"], ["safely"], ["wait"]] } }).pass, false);
  assert.equal(Eval.evaluateSemanticResponse({ response: "I will not move until authorized.", expected: "I will not move until authorized.", rubric: { requiredGroups: [["move"], ["authorized"]] } }).pass, true);
});

test("branching requires every observable success group", () => {
  const rubric = { minTokens: 5, requiredRatio: 1, requiredGroups: [["pull"], ["safely"], ["wait"]] };
  assert.equal(Eval.evaluateSemanticResponse({
    response: "I will pull over now.",
    expected: "I will pull over safely and wait for your instructions.",
    rubric,
  }).pass, false);
  assert.equal(Eval.evaluateSemanticResponse({
    response: "I will pull over safely and wait for your instructions.",
    expected: "I will pull over safely and wait for your instructions.",
    rubric,
  }).pass, true);
});

test("typed slots distinguish time, weight, duration and pressure", () => {
  const cases = [
    [{ name: "time", display: "9:30 a.m.", spoken: "nine thirty A.M." }, "My appointment is at 9:30 a.m.", true],
    [{ name: "weight", display: "38,200", spoken: "thirty-eight thousand two hundred" }, "The weight is 38200 pounds.", true],
    [{ name: "duration", display: "4", spoken: "four" }, "I have four hours left.", true],
    [{ name: "pressure", display: "60 psi", spoken: "sixty P S I" }, "It activated at 60 psi.", true],
    [{ name: "pressure", display: "60 psi", spoken: "sixty P S I" }, "It activated at 90 psi.", false],
  ];
  for (const [slot, response, expected] of cases) assert.equal(Eval.slotMatches(response, slot), expected, `${slot.name}: ${response}`);
});

test("typed numeric slots preserve order and require the correct unit", () => {
  const time = { name: "time", type: "time", display: "9:30 a.m.", spoken: "nine thirty A.M." };
  assert.equal(Eval.slotMatches("The appointment is at nine thirty A.M.", time), true);
  assert.equal(Eval.slotMatches("The appointment is at thirty nine A.M.", time), false);
  assert.equal(Eval.slotMatches("The appointment is at 39 a.m.", time), false);
  const weight = { name: "weight", type: "weight-cardinal", display: "38,200", spoken: "thirty-eight thousand two hundred" };
  assert.equal(Eval.slotMatches("The weight is 38,200 pounds.", weight), true);
  assert.equal(Eval.slotMatches("The weight is 38,200 psi.", weight), false);
  assert.equal(Eval.slotMatches("The weight is 38,200 or 40,000 pounds.", weight), false);
  const pressure = { name: "pressure", type: "pressure", display: "60 psi", spoken: "sixty P S I" };
  assert.equal(Eval.slotMatches("It activates at 60 psi.", pressure), true);
  assert.equal(Eval.slotMatches("It activates at 60 pounds.", pressure), false);
  assert.equal(Eval.slotMatches("It activates at 60 or 90 psi.", pressure), false);
  const hours = { name: "hours", type: "duration-hours", display: "4", spoken: "four" };
  const minutes = { name: "minutes", type: "duration-minutes", display: "18", spoken: "eighteen" };
  assert.equal(Eval.slotMatches("I have four hours and eighteen minutes left.", hours), true);
  assert.equal(Eval.slotMatches("I have four hours and eighteen minutes left.", minutes), true);
  assert.equal(Eval.slotMatches("I have four pounds and eighteen psi left.", hours), false);
  assert.equal(Eval.slotMatches("I have four pounds and eighteen psi left.", minutes), false);
  assert.equal(Eval.slotMatches("I have four or five hours left.", hours), false);
});

test("q15 listening response requires both the keyed date and time", () => {
  const input = {
    prompt: "Enter the appointment date and time.",
    expected: "My appointment is at 9:30 a.m. on August 20.",
    slots: [
      { name: "appointment-time", type: "time", display: "9:30 a.m.", spoken: "nine thirty A.M." },
      { name: "appointment-date", type: "date", display: "August 20", spoken: "August twentieth" },
    ],
    rubric: { minTokens: 4, requiredRatio: 1 },
  };
  assert.equal(Eval.evaluateSemanticResponse({ ...input, response: "My appointment is at 9:30 a.m." }).pass, false);
  assert.equal(Eval.evaluateSemanticResponse({ ...input, response: "My appointment is at 39 a.m. on August twentieth." }).pass, false);
  assert.equal(Eval.evaluateSemanticResponse({ ...input, response: "My appointment is at 9:30 a.m. on August twentieth." }).pass, true);
  assert.equal(Eval.evaluateSemanticResponse({ ...input, response: "My appointment is at nine thirty or ten thirty A.M. on August twentieth." }).pass, false);
  assert.equal(Eval.evaluateSemanticResponse({ ...input, response: "My appointment is at nine thirty A.M. on August twentieth or twenty-first." }).pass, false);
});

test("typed date slots accept equivalent numeric and spoken American dates", () => {
  const slot = { name: "inspection-date", type: "date", display: "August 1, 2026", spoken: "August first, twenty twenty-six" };
  assert.equal(Eval.slotMatches("It was inspected on August 1, 2026.", slot), true);
  assert.equal(Eval.slotMatches("It was inspected on August first, twenty twenty-six.", slot), true);
  assert.equal(Eval.slotMatches("It was inspected on August first, twenty twenty-five.", slot), false);
});

test("typed numeric assertions reject repudiation and accept only unambiguous current corrections", () => {
  const cases = [
    [{ name: "time", type: "time", display: "9:30 a.m.", spoken: "nine thirty A.M." }, "The appointment is at 9:30 a.m. That is not correct."],
    [{ name: "date", type: "date", display: "August 20", spoken: "August twentieth" }, "The date is August twentieth. That is not correct."],
    [{ name: "weight", type: "weight-cardinal", display: "38,200", spoken: "thirty-eight thousand two hundred" }, "The weight is 38,200 pounds. That is not correct."],
    [{ name: "pressure", type: "pressure", display: "60 psi", spoken: "sixty P S I" }, "The pressure is 60 psi. That is not correct."],
  ];
  for (const [slot, response] of cases) assert.equal(Eval.slotMatches(response, slot), false, `${slot.type}: ${response}`);
  assert.equal(Eval.slotMatches(
    "It was 90 psi earlier, but the pressure is now 60 psi.",
    { name: "pressure", type: "pressure", display: "60 psi", spoken: "sixty P S I" },
  ), true);
  assert.equal(Eval.slotMatches(
    "The pressure is 90 psi or 60 psi.",
    { name: "pressure", type: "pressure", display: "60 psi", spoken: "sixty P S I" },
  ), false);
});

test("listening diagnostics reject rejected and conflicting typed values", () => {
  const cases = [
    {
      item: { kind: "productive", audio: "Appointment.", model: "My appointment is at 9:30 a.m.", slots: [{ name: "time", type: "time", display: "9:30 a.m.", spoken: "nine thirty A.M." }], rubric: { minTokens: 4, requiredGroups: [["appointment"]] } },
      valid: "My appointment is at 9:30 a.m.",
      invalid: "9:30 a.m. is incorrect. My appointment is at 10:30 a.m.",
      conflicting: "My appointment is at 9:30 a.m. or 10:30 a.m.",
    },
    {
      item: { kind: "productive", audio: "Weight.", model: "The listed weight is 38,200 pounds.", slots: [{ name: "weight", type: "weight-cardinal", display: "38,200", spoken: "thirty-eight thousand two hundred" }], rubric: { minTokens: 4, requiredGroups: [["weight"], ["pounds"]] } },
      valid: "The listed weight is 38,200 pounds.",
      invalid: "38,200 pounds is wrong. The listed weight is 40,000 pounds.",
      conflicting: "The listed weight is 38,200 pounds or 40,000 pounds.",
    },
    {
      item: { kind: "productive", audio: "Duration.", model: "I have 4 hours and 18 minutes left.", slots: [{ name: "hours", type: "duration-hours", display: "4", spoken: "four" }, { name: "minutes", type: "duration-minutes", display: "18", spoken: "eighteen" }], rubric: { minTokens: 5, requiredGroups: [["hours"], ["minutes"]] } },
      valid: "I have 4 hours and 18 minutes left.",
      invalid: "4 hours and 18 minutes are rejected. I have 5 hours and 20 minutes left.",
      conflicting: "I have 4 hours or 5 hours and 18 minutes or 20 minutes left.",
    },
    {
      item: { kind: "productive", audio: "Pressure.", model: "The warning activates at 60 psi.", slots: [{ name: "pressure", type: "pressure", display: "60 psi", spoken: "sixty P S I" }], rubric: { minTokens: 4, requiredGroups: [["warning"], ["psi"]] } },
      valid: "The warning activates at 60 psi.",
      invalid: "60 psi is incorrect. The warning activates at 90 psi.",
      conflicting: "The warning activates at 60 psi or 90 psi.",
    },
  ];
  for (const { item, valid, invalid, conflicting } of cases) {
    assert.equal(Eval.scoreDiagnosticAnswer(item, valid, { stimulusExposed: true }).pass, true, valid);
    assert.equal(Eval.scoreDiagnosticAnswer(item, invalid, { stimulusExposed: true }).pass, false, invalid);
    assert.equal(Eval.scoreDiagnosticAnswer(item, conflicting, { stimulusExposed: true }).pass, false, conflicting);
  }
});

test("ordinary q15 q37 q42 q64 and q71 reject leaked expected values", () => {
  const invalidByLegacy = new Map([
    ["question-15", "9:30 a.m. on August 20 is incorrect. My appointment is at 10:30 a.m. on August 21."],
    ["question-37", "38,200 pounds is incorrect. The listed weight is 40,000 pounds."],
    ["question-42", "4 hours and 18 minutes are incorrect. I have 5 hours and 20 minutes left."],
    ["question-64", "60 psi is incorrect. The low-air warning activates at 90 psi."],
    ["question-71", "The required rest period is complete is wrong. I can return before it is complete."],
  ]);
  for (const [legacyId, response] of invalidByLegacy) {
    const item = courseData.inspectionQuestions.find(candidate => candidate.legacyId === legacyId);
    assert.ok(item, legacyId);
    assert.equal(Eval.evaluateQuestion(item, item.answerDisplay).pass, true, `${legacyId}: canonical`);
    assert.equal(Eval.evaluateQuestion(item, response).pass, false, `${legacyId}: ${response}`);
  }
});

test("all single-branch official answers pass while repudiation and refusal stuffing fail", () => {
  const items = courseData.inspectionQuestions.filter(item => !item.answerDisplay?.includes(" / "));
  assert.equal(items.length, 62);
  for (const item of items) {
    assert.equal(Eval.evaluateQuestion(item, item.answerDisplay).pass, true, `${item.id}: canonical`);
    assert.equal(Eval.evaluateQuestion(item, `It is false that ${item.answerDisplay}`).pass, false, `${item.id}: false-that`);
    assert.equal(Eval.evaluateQuestion(item, `${item.answerDisplay} That is not correct.`).pass, false, `${item.id}: repudiated`);
    assert.equal(Eval.evaluateQuestion(item, `I refuse to answer, but ${item.answerDisplay}`).pass, false, `${item.id}: refusal`);
  }
});

test("all 26 displayed alternative answer branches pass independently and mixed branches fail", () => {
  const items = courseData.inspectionQuestions.filter(item => item.answerDisplay?.includes(" / "));
  let checked = 0;
  for (const item of items) {
    const branches = item.answerDisplay.split(" / ");
    assert.equal(branches.length, 2, item.id);
    for (const branch of branches) {
      const result = Eval.evaluateQuestion(item, branch);
      assert.equal(result.pass, true, `${item.id}: ${branch}: ${result.feedback}`);
      checked += 1;
    }
    assert.equal(Eval.evaluateQuestion(item, item.answerDisplay).pass, false, `${item.id}: slash-combined`);
    assert.equal(Eval.evaluateQuestion(item, `${branches[0]} However, ${branches[1]}`).pass, false, `${item.id}: mixed opposites`);
  }
  assert.equal(checked, 26);
});

test("cargo slots are materialized by profile instead of treating packaged food as universal", () => {
  const base = courseData.inspectionQuestions.find(item => item.id === "question:what-are-you-hauling");
  const itemFor = profile => ({ ...base, ...base.profileMaterializations[profile] });
  const tractor = itemFor("tractor");
  const hotshotOpen = itemFor("hotshot-open");
  const hotshotEnclosed = itemFor("hotshot-enclosed");
  assert.equal(hotshotOpen.slots[0].display, "vehicles");
  assert.equal(hotshotOpen.slots[0].countRequired, false);
  assert.equal(hotshotOpen.responseRubric.cargoCategory, "transported-vehicles");
  assert.equal(hotshotOpen.answerDisplay, "I am hauling vehicles.");
  assert.equal(Eval.evaluateQuestion(tractor, "Packaged food.", { elpStepOne: true }).pass, true);
  assert.equal(Eval.evaluateQuestion(tractor, "I am hauling cars.", { elpStepOne: true }).pass, false);
  assert.equal(Eval.evaluateQuestion(hotshotOpen, "I am hauling cars.", { elpStepOne: true }).pass, true);
  assert.equal(Eval.evaluateQuestion(hotshotEnclosed, "I am hauling two vehicles.", { elpStepOne: true }).pass, false);
  assert.equal(Eval.evaluateQuestion(hotshotOpen, "I hauled packaged food earlier, but now I am hauling two vehicles.", { elpStepOne: true }).pass, true);
  assert.equal(Eval.evaluateQuestion(hotshotOpen, "I hauled packaged food, but I am hauling two vehicles.", { elpStepOne: true }).pass, false);
  assert.equal(Eval.evaluateQuestion(hotshotOpen, "I am hauling three vehicles.", { elpStepOne: true }).pass, true);
  assert.equal(Eval.evaluateQuestion(hotshotOpen, "I am hauling packaged food.", { elpStepOne: true }).pass, false);
  assert.equal(Eval.evaluateQuestion(hotshotEnclosed, "I am hauling packaged food.", { elpStepOne: true }).pass, false);
  assert.equal(Eval.evaluateQuestion(hotshotOpen, "I am hauling cars.").pass, true, "ordinary open cargo accepts category without count");
  assert.equal(Eval.evaluateQuestion(hotshotOpen, "I am hauling two vehicles.").pass, true, "ordinary open cargo accepts an optional count");
  assert.equal(Eval.evaluateQuestion(hotshotOpen, "I am hauling packaged food.").pass, false, "ordinary open cargo rejects Tractor cargo");
  assert.equal(Eval.evaluateQuestion(hotshotOpen, "I am hauling cars and packaged food.").pass, false, "ordinary open cargo rejects mixed categories");
  assert.equal(Eval.evaluateSemanticResponse({
    response: "I am hauling two vehicles and packaged food on an open trailer.",
    expected: "I am hauling two vehicles on an open trailer.",
    rubric: { requiredGroups: [["hauling"], ["two"], ["vehicles", "cars"], ["open"], ["trailer"]] },
  }).pass, false);
});

test("diagnostic profile cargo scores the commodity without requiring visible trailer context", () => {
  const contract = courseData.diagnosticProfileCargoMaterializations;
  assert.equal(contract.responseTarget, "commodity-only");
  assert.equal(contract.visibleTrailerTypeIsContextOnly, true);
  assert.equal(contract.trailerTypeResponseRequired, false);
  const itemFor = profile => ({
    id: `diagnostic-cargo-${profile}`,
    kind: "productive",
    prompt: `${contract.profiles[profile].visibleContextRu} Officer: What are you hauling?`,
    ...contract.profiles[profile],
  });
  const open = itemFor("hotshot-open");
  for (const response of ["I am hauling cars.", "I am hauling two vehicles.", "I am carrying automobiles."]) {
    assert.equal(Eval.scoreDiagnosticAnswer(open, response).pass, true, response);
  }
  for (const response of ["I am hauling packaged food.", "I am hauling cars and packaged food."]) {
    assert.equal(Eval.scoreDiagnosticAnswer(open, response).pass, false, response);
  }
  const enclosed = itemFor("hotshot-enclosed");
  for (const response of ["I am hauling a passenger vehicle.", "I am carrying one car.", "I am transporting a car."]) {
    assert.equal(Eval.scoreDiagnosticAnswer(enclosed, response).pass, true, response);
  }
  assert.equal(Eval.scoreDiagnosticAnswer(enclosed, "I am hauling two vehicles.").pass, false);
  assert.equal(Eval.scoreDiagnosticAnswer(enclosed, "I am hauling packaged food.").pass, false);
  const tractor = itemFor("tractor");
  assert.equal(Eval.scoreDiagnosticAnswer(tractor, "I am hauling packaged food.").pass, true);
  assert.equal(Eval.scoreDiagnosticAnswer(tractor, "I am hauling cars.").pass, false);
});

test("semantic consumers reject rejected names and critical opposite relations", () => {
  for (const lesson of courseData.lessons) {
    for (const phrase of lesson.phrases) assert.equal(Eval.evaluateLesson(lesson, phrase, phrase).pass, true, `${lesson.id}: ${phrase}`);
  }
  const identity = courseData.lessons.find(item => item.id === "lesson:identity-and-unit-numbers");
  assert.equal(Eval.evaluateLesson(identity, "Alex Example is wrong. My name is John Smith.", "My name is Alex Example.").pass, false);
  const lessonNegatives = [
    ["I drive for Training Carrier.", "I drive away from Training Carrier."],
    ["Proceed to gate two.", "Proceed away from gate two."],
    ["Park in row C.", "Park away from row C."],
    ["The headlights are on.", "The headlights are off."],
  ];
  for (const [expected, response] of lessonNegatives) {
    const lesson = courseData.lessons.find(item => item.phrases.includes(expected));
    assert.ok(lesson, expected);
    assert.equal(Eval.evaluateLesson(lesson, expected, expected).pass, true, `${expected}: canonical`);
    assert.equal(Eval.evaluateLesson(lesson, response, expected).pass, false, response);
  }
  const origin = {
    id: "question:where-are-you-coming-from",
    prompt: "Where are you coming from?",
    answer: "I am coming from Columbus, Ohio.",
    slots: [{ name: "origin", type: "location", display: "Columbus, Ohio", spoken: "Columbus, Ohio" }],
    responseRubric: { minTokens: 4, requiredGroups: [["coming"], ["columbus"], ["ohio"]] },
  };
  assert.equal(Eval.evaluateQuestion(origin, "I am coming away from Columbus, Ohio.").pass, false);
});

test("assertion-level opposite repudiation fails across scored surfaces", () => {
  const origin = {
    id: "question:where-are-you-coming-from",
    prompt: "Where are you coming from?",
    answer: "I picked up in Columbus, Ohio.",
    slots: [{ name: "origin", type: "location", display: "Columbus, Ohio", spoken: "Columbus, Ohio" }],
    responseRubric: { minTokens: 4, requiredGroups: [["picked"], ["columbus"], ["ohio"]], taskRelation: "origin-from-expected" },
  };
  assert.equal(Eval.evaluateQuestion(origin, `${origin.answer} But the opposite is true.`, { elpStepOne: true }).pass, false);

  const scene = courseData.situations.find(item => item.id === "situation:roadside-stop");
  const variant = scene.practiceContract.variants.find(item => item.id === "primary");
  const turn = variant.criticalTurns[0];
  const turnItem = { informationGap: turn.prompt, typedSlots: turn.slotValues || [], responseRubric: turn.semanticRubric };
  assert.equal(Eval.evaluateSituation(turnItem, `${turn.modelAnswer} Actually, the opposite is true.`, turn.modelAnswer).pass, false);

  const sign = courseData.signs.find(item => item.id === "sign:mutcd:r1-1");
  assert.equal(Eval.evaluateSignMeaningAndAction(sign, `This sign means ${sign.display}. ${sign.actionEn} However, the opposite is true.`).pass, false);

  const lesson = courseData.lessons.find(item => item.id === "lesson:identity-and-unit-numbers");
  const phrase = lesson.phrases[0];
  assert.equal(Eval.evaluateLesson(lesson, `${phrase} But the opposite applies.`, phrase).pass, false);

  const legitimate = Eval.evaluateSemanticResponse({
    response: "I will use the opposite lane.",
    expected: "I will use the opposite lane.",
    rubric: { minTokens: 4, requiredGroups: [["use"], ["opposite"], ["lane"]] },
  });
  assert.equal(legitimate.pass, true, "ordinary opposite-lane content must remain valid");
});

test("ELP keyed relations reject competing or alternatives", () => {
  const origin = {
    id: "question:where-are-you-coming-from",
    prompt: "Where are you coming from?",
    answer: "I left Columbus, Ohio.",
    slots: [{ name: "origin", type: "location", display: "Columbus, Ohio", spoken: "Columbus, Ohio" }],
    responseRubric: { minTokens: 4, requiredGroups: [["left"], ["columbus"], ["ohio"]], taskRelation: "origin-from-expected" },
  };
  const carrier = {
    id: "question:who-do-you-drive-for",
    prompt: "Who do you drive for?",
    answer: "I drive for Training Carrier.",
    slots: [{ name: "carrier", type: "organization", display: "Training Carrier", spoken: "Training Carrier" }],
    responseRubric: { minTokens: 4, requiredGroups: [["drive"], ["training"], ["carrier"]], taskRelation: "carrier-from-expected" },
  };
  assert.equal(Eval.evaluateQuestion(origin, origin.answer, { elpStepOne: true }).pass, true);
  assert.equal(Eval.evaluateQuestion(origin, "I left Columbus, Ohio, or Dallas, Texas.", { elpStepOne: true }).pass, false);
  assert.equal(Eval.evaluateQuestion(carrier, carrier.answer, { elpStepOne: true }).pass, true);
  assert.equal(Eval.evaluateQuestion(carrier, "I drive for Training Carrier or Other Carrier.", { elpStepOne: true }).pass, false);
});

test("all 21 lesson reception key maps use deterministic Russian meaning recall", () => {
  assert.equal(courseData.lessons.length, 21);
  let keyCount = 0;
  for (const lesson of courseData.lessons) {
    const keys = lesson.assessmentBlueprint?.reception?.meaningKeyByPhraseId;
    assert.ok(keys && Object.keys(keys).length >= 3, lesson.id);
    for (const [phraseId, expected] of Object.entries(keys)) {
      keyCount += 1;
      assert.equal(Eval.evaluateMeaningRecall(expected, expected).pass, true, `${lesson.id}/${phraseId}: canonical`);
      assert.equal(Eval.evaluateMeaningRecall(`${expected} Это неверно.`, expected).pass, false, `${lesson.id}/${phraseId}: suffix repudiation`);
      assert.equal(Eval.evaluateMeaningRecall(`Это неправильно: ${expected}`, expected).pass, false, `${lesson.id}/${phraseId}: prefix repudiation`);
      assert.equal(Eval.evaluateMeaningRecall(`${expected} Это ложно.`, expected).pass, false, `${lesson.id}/${phraseId}: false suffix`);
      assert.equal(Eval.evaluateMeaningRecall(`${expected} Это ошибка.`, expected).pass, false, `${lesson.id}/${phraseId}: error suffix`);
      assert.equal(Eval.evaluateMeaningRecall(`${expected} На самом деле смысл противоположный.`, expected).pass, false, `${lesson.id}/${phraseId}: opposite meaning`);
      assert.equal(Eval.evaluateMeaningRecall(`${expected} Но смысл обратный.`, expected).pass, false, `${lesson.id}/${phraseId}: reverse meaning`);
      assert.equal(Eval.evaluateMeaningRecall(`${expected} Но на самом деле это означает другое.`, expected).pass, false, `${lesson.id}/${phraseId}: superseding meaning`);
      const reversed = expected.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).reverse().join(" ");
      assert.equal(Eval.evaluateMeaningRecall(reversed, expected).pass, false, `${lesson.id}/${phraseId}: unordered key stuffing`);
    }
  }
  assert.equal(keyCount, 69);
  for (const [response, expected] of [
    ["Мое имя Алекс Экзампл.", "Меня зовут Алекс Экзампл."],
    ["Я водитель компании Training Carrier.", "Я работаю водителем в Training Carrier."],
    ["Я приехал в 8:55.", "Я прибыл в 8:55."],
    ["Свет фар включен.", "Фары включены."],
  ]) {
    assert.equal(Eval.evaluateMeaningRecall(response, expected).pass, true, `${response}: natural equivalent`);
  }
});

test("Russian meaning recall preserves legitimate negation and rejects polarity mismatch or refusal", () => {
  const allKeys = courseData.lessons.flatMap(lesson => Object.values(lesson.assessmentBlueprint?.reception?.meaningKeyByPhraseId || {}));
  const negativeKeys = allKeys.filter(value => String(value).toLowerCase().split(/[^\p{L}\p{N}]+/u).includes("не"));
  assert.equal(negativeKeys.length, 5);
  for (const expected of negativeKeys) {
    assert.equal(Eval.evaluateMeaningRecall(expected, expected).pass, true, expected);
    const polarityReversed = expected.replace(/(^|[^\p{L}\p{N}])не(?=$|[^\p{L}\p{N}])/iu, "$1");
    assert.equal(Eval.evaluateMeaningRecall(polarityReversed, expected).pass, false, `${expected}: removed negation`);
  }
  const positive = allKeys.find(value => !String(value).toLowerCase().split(/[^\p{L}\p{N}]+/u).includes("не"));
  assert.ok(positive);
  assert.equal(Eval.evaluateMeaningRecall(`Я не утверждаю это. ${positive}`, positive).pass, false, "added negation");
  assert.equal(Eval.evaluateMeaningRecall(`Я не знаю, но ${positive}`, positive).pass, false, "refusal stuffing");
  assert.equal(Eval.evaluateMeaningRecall(`Отказываюсь отвечать. ${positive}`, positive).pass, false, "explicit refusal");
});

test("Russian meaning recall distinguishes a coherent wrong meaning from key stuffing", () => {
  const coherentWrong = Eval.evaluateMeaningRecall("Он остановил машину.", "Меня зовут Алекс Экзампл.");
  assert.equal(coherentWrong.pass, false);
  assert.equal(coherentWrong.feedback, "Ответ связный, но передает другой смысл. Сверьте действие и объект.");

  const reversed = Eval.evaluateMeaningRecall("экзампл алекс зовут меня", "Меня зовут Алекс Экзампл.");
  assert.equal(reversed.pass, false);
  assert.equal(reversed.feedback, "Передайте смысл связным утверждением, а не набором ключевых слов.");
});

test("question commands reject off, away and paired brake-state inversions", () => {
  const invalidById = new Map([
    ["question:turn-on-your-headlights", "The headlights are off."],
    ["question:turn-on-the-high-beams", "The high beams are off."],
    ["question:activate-the-left-turn-signal", "The left turn signal is off."],
    ["question:turn-on-the-four-way-flashers", "The four-way flashers are off."],
    ["question:stay-in-the-cab-until-i-tell-you-to-exit", "Understood. I will stay away from the cab."],
    ["question:what-is-your-current-duty-status", "I am off duty, not driving."],
    ["question:release-the-tractor-brakes-and-keep-the-trailer-brakes-set", "Tractor brakes released, trailer brakes released."],
  ]);
  for (const [id, response] of invalidById) {
    const item = courseData.inspectionQuestions.find(candidate => candidate.id === id);
    assert.ok(item, id);
    assert.equal(Eval.evaluateQuestion(item, item.answerDisplay).pass, true, `${id}: canonical`);
    assert.equal(Eval.evaluateQuestion(item, response).pass, false, `${id}: ${response}`);
  }
  const duty = courseData.inspectionQuestions.find(item => item.id === "question:what-is-your-current-duty-status");
  assert.equal(Eval.evaluateQuestion(duty, "I am off duty. The phrase on duty does not apply. I am not driving.", { elpStepOne: true }).pass, false);
});

test("all six learning consumers have objective keyed evaluators", () => {
  assert.equal(Eval.evaluateExactRecall({ response: "inspection lane", expected: "inspection lane", prompt: "полоса инспекции" }).pass, true);
  assert.equal(Eval.evaluateQuestion({ prompt: "What are you hauling?", answer: "I am hauling packaged food." }, "I am hauling packaged food.").pass, true);
  assert.equal(Eval.evaluateSign({ display: "STOP", actionEn: "Come to a complete stop." }, "I will come to a complete stop.").pass, true);
  assert.equal(Eval.evaluateDocumentField({ label: "Gross weight", value: "79,300 pounds" }, "79,300 pounds").pass, true);
  assert.equal(Eval.evaluateSituation({ goal: "Give the destination", dialogue: [{ speaker: "Driver", english: "I am headed to Cincinnati, Ohio." }] }, "I am headed to Cincinnati, Ohio.").pass, true);
  assert.equal(Eval.evaluateLesson({ goal: "Ask for a repeat" }, "Could you repeat that more slowly, please?", "Could you repeat that more slowly, please?").pass, true);
});

test("repudiation, refusal, key stuffing and explicit contradiction fail across semantic consumers", () => {
  const question = { prompt: "Where are you going?", answer: "I am going to Nashville, Tennessee." };
  assert.equal(Eval.evaluateQuestion(question, "I refuse to answer, but I am going to Nashville, Tennessee.").pass, false);
  assert.equal(Eval.evaluateQuestion(question, "Going is a word. Nashville is a word. Tennessee is a word.").pass, false);
  assert.equal(Eval.evaluateSituation(
    { goal: "Stop safely", expectedDriverTurn: "I will stop at the white line." },
    "I will stop at the white line. That is not correct.",
  ).pass, false);
  assert.equal(Eval.evaluateSituation(
    { goal: "Stop safely", expectedDriverTurn: "I will stop at the white line." },
    "I see stop. The truck is white. A line is visible.",
  ).pass, false);
  assert.equal(Eval.evaluateLesson(
    { goal: "Report the light state" },
    "The headlights are on. However, the headlights are off.",
    "The headlights are on.",
  ).pass, false);
  assert.equal(Eval.evaluateLesson(
    { goal: "Report the light state" },
    "The headlights aren't on.",
    "The headlights are on.",
  ).pass, false);
  assert.equal(Eval.evaluateLesson(
    { goal: "Report the light state" },
    "Headlights is a word. On is another word.",
    "The headlights are on.",
  ).pass, false);
  assert.equal(Eval.evaluateSign(
    { display: "STOP", actionEn: "Come to a complete stop." },
    "I will come to a complete stop, but I will not come to a complete stop.",
  ).pass, false);
  assert.equal(Eval.evaluateSign(
    { display: "STOP", actionEn: "Come to a complete stop." },
    "I will not under any circumstances come to a complete stop.",
  ).pass, false);
  assert.equal(Eval.evaluateSign(
    { display: "STOP", actionEn: "Come to a complete stop." },
    "Come is a word. Complete is a word. Stop is a word.",
  ).pass, false);
  const diagnostic = {
    kind: "productive",
    prompt: "Enter the pressure.",
    model: "The pressure is 60 psi.",
    slots: [{ name: "pressure", type: "pressure", display: "60 psi", spoken: "sixty P S I" }],
    rubric: { minTokens: 4, requiredGroups: [["pressure"], ["psi"]] },
  };
  assert.equal(Eval.scoreDiagnosticAnswer(diagnostic, "The pressure is 60 psi. That is not correct.").pass, false);
  assert.equal(Eval.scoreDiagnosticAnswer(diagnostic, "Pressure is a word. 60 psi is a value.").pass, false);
});

test("a sign meaning task requires the action, not an echo of the visible display", () => {
  const item = {
    display: "NO TURN ON RED",
    actionEn: "Wait for a green signal before turning.",
  };
  assert.equal(Eval.evaluateSignMeaningAndAction(item, "This sign says NO TURN ON RED.").pass, false);
  assert.equal(
    Eval.evaluateSignMeaningAndAction(item, "This sign prohibits a turn on red, so I must wait for a green signal before turning.").pass,
    true,
  );
});

test("all 65 Step 2 signs accept a canonical meaning plus action and reject action omission", () => {
  const signs = courseData.signs.filter(item => ["fhwa-mutcd-shs", "training-dms"].includes(item.provenance));
  assert.equal(signs.length, 65);
  for (const item of signs) {
    const canonical = `This sign means ${item.display}. ${item.actionEn}`;
    assert.equal(Eval.evaluateSignMeaningAndAction(item, canonical).pass, true, `${item.id}: ${canonical}`);
    assert.equal(Eval.evaluateSignMeaningAndAction(item, item.display).pass, false, `${item.id}: visible display only`);
    assert.equal(Eval.evaluateSignMeaningAndAction(item, `This sign means ${item.display}.`).pass, false, `${item.id}: action omitted`);
  }
});

test("Step 2 rejects meaning repudiation and a canonical action followed by its negation", () => {
  const stop = courseData.signs.find(item => item.id === "sign:mutcd:r1-1");
  assert.equal(Eval.evaluateSignMeaningAndAction(
    stop,
    `This sign means ${stop.display}. However, it does not mean ${stop.display}. ${stop.actionEn}`,
  ).pass, false);
  assert.equal(Eval.evaluateSignMeaningAndAction(
    stop,
    `This sign means ${stop.display}. However, it doesn't mean ${stop.display}. ${stop.actionEn}`,
  ).pass, false);
  assert.equal(Eval.evaluateSignMeaningAndAction(
    stop,
    `This sign means ${stop.display}. ${stop.actionEn} I will not come to a complete stop.`,
  ).pass, false);
});

test("clause-level OR sign actions accept either complete branch independently", () => {
  const moveOver = courseData.signs.find(item => item.id === "sign:mutcd:r16-3");
  const closure = courseData.signs.find(item => item.id === "sign:dms:all-lanes-closed");
  const signal = courseData.signs.find(item => item.id === "sign:mutcd:d8-1a");
  assert.equal(Eval.evaluateSign(moveOver, "Move over when safe.").pass, true);
  assert.equal(Eval.evaluateSign(moveOver, "Reduce speed.").pass, true);
  assert.equal(Eval.evaluateSign(moveOver, "Move over.").pass, false);
  assert.equal(Eval.evaluateSign(closure, "Exit.").pass, true);
  assert.equal(Eval.evaluateSign(closure, "Follow the official detour.").pass, true);
  assert.equal(Eval.evaluateSign(signal, "Watch for the open signal.").pass, false);
  assert.equal(Eval.evaluateSign(signal, signal.actionEn).pass, true);
});

test("OR sign safety rejects an additional speed-increase assertion", () => {
  const item = courseData.signs.find(candidate => candidate.id === "sign:mutcd:r16-3");
  const unsafeResponses = [
    "Move over when safe and increase speed.",
    "Reduce speed and increase speed.",
    "The sign means move over or reduce speed. I will reduce speed and increase speed.",
  ];
  for (const response of unsafeResponses) {
    const result = Eval.evaluateSign(item, response);
    assert.equal(result.pass, false, response);
    assert.ok(result.missing.includes("constraint:reduce speed:increase speed"), response);
  }

  assert.equal(Eval.evaluateSignMeaningAndAction(
    item,
    "This sign means MOVE OVER OR REDUCE SPEED. I will reduce speed and increase speed.",
  ).pass, false);
  assert.equal(Eval.evaluateSignMeaningAndAction(
    item,
    "This sign means MOVE OVER OR REDUCE SPEED. I will move over when safe. I will increase speed.",
  ).pass, false);
  assert.equal(Eval.evaluateSignMeaningAndAction(
    item,
    "This sign means MOVE OVER OR REDUCE SPEED. I will move over when safe.",
  ).pass, true);
  assert.equal(Eval.evaluateSignMeaningAndAction(
    item,
    "This sign means MOVE OVER OR REDUCE SPEED. I will reduce speed.",
  ).pass, true);
});

test("central semantic consumers apply OR safety without merging the safe branches", () => {
  const item = courseData.signs.find(candidate => candidate.id === "sign:mutcd:r16-3");
  const alternatives = ["Move over when safe.", "Reduce speed."];
  const expected = alternatives.join(" / ");
  const evaluateCentral = response => Eval.evaluateSemanticResponse({
    response,
    prompt: item.display,
    expected: item.actionEn,
    alternatives,
    alternativesExclusive: false,
    completeAlternatives: true,
    rubric: { minTokens: 2, requiredRatio: 1 },
  });
  const consumers = [
    evaluateCentral,
    response => Eval.evaluateQuestion({ promptDisplay: item.display, answerDisplay: expected }, response),
    response => Eval.evaluateSituation({ goal: item.display, expectedDriverTurn: expected }, response),
    response => Eval.evaluateLesson({ goal: item.display }, response, expected),
    response => Eval.scoreDiagnosticAnswer({ kind: "productive", prompt: item.display, model: expected }, response),
  ];

  for (const evaluate of consumers) {
    assert.equal(evaluate(alternatives[0]).pass, true);
    assert.equal(evaluate(alternatives[1]).pass, true);
    assert.equal(evaluate("Move over when safe and increase speed.").pass, false);
    assert.equal(evaluate("Reduce speed and increase speed.").pass, false);
    assert.equal(evaluate("The sign means move over or reduce speed. I will reduce speed and increase speed.").pass, false);
  }
});

test("sign evaluation rejects no-no and unsafe polarity reversals", () => {
  const stop = courseData.signs.find(item => item.id === "sign:mutcd:r1-1");
  const shoulder = courseData.signs.find(item => item.id === "sign:mutcd:w21-5br");
  assert.equal(Eval.evaluateSignMeaningAndAction(stop, "no no").pass, false);
  assert.equal(Eval.evaluateSignMeaningAndAction(stop, "This sign means STOP. I will not come to a complete stop.").pass, false);
  assert.equal(Eval.evaluateSignMeaningAndAction(
    shoulder,
    "This sign means RIGHT SHOULDER CLOSED AHEAD. I will use the right shoulder.",
  ).pass, false);
  assert.equal(Eval.evaluateSignMeaningAndAction(
    shoulder,
    "This sign means RIGHT SHOULDER CLOSED AHEAD. I will not use the right shoulder.",
  ).pass, true);
});

test("every card has a materially different contextual transfer cue", () => {
  const units = [...courseData.core, ...courseData.truck, ...courseData.hotshot];
  assert.equal(units.length, 1200);
  for (const item of units) {
    const cue = Eval.exampleGapCue(item);
    assert.notEqual(cue, item.translation, item.id);
    if (!cue.includes("____")) {
      assert.match(cue, /^Дайте целевую английскую реплику или единицу для этого контекста: .+$/, item.id);
      assert.ok(cue.includes(String(item.example).trim()), item.id);
    }
    const localizedCue = cue.toLocaleLowerCase("ru-RU");
    const primaryCue = String(item.translation || "").trim().toLocaleLowerCase("ru-RU");
    assert.ok(!primaryCue || !localizedCue.includes(primaryCue), `${item.id} repeats the primary translation cue`);
    const targetTokens = Eval.textTokens(item.word).filter(token => token.length >= 3 && !["and", "the", "to"].includes(token));
    const prefix = targetTokens.slice(0, -1).join(" ");
    const inflectedTargets = targetTokens.length === 1
      ? Eval.targetMorphologicalForms(targetTokens[0])
      : Eval.targetMorphologicalForms(targetTokens.at(-1)).map(form => `${prefix} ${form}`);
    for (const form of inflectedTargets) {
      const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      assert.doesNotMatch(cue, new RegExp(`\\b${escaped}\\b`, "i"), `${item.id} exposes ${form}`);
    }
  }
  const injury = units.find(item => item.id === "t:term:injury");
  assert.ok(injury);
  assert.doesNotMatch(Eval.exampleGapCue(injury), /\binjur(?:y|ies)\b/i);
});

test("all 1200 keyed card answers pass both blind cue variants", () => {
  const units = [...courseData.core, ...courseData.truck, ...courseData.hotshot];
  assert.equal(units.length, 1200);
  for (const item of units) {
    for (const prompt of [item.translation, Eval.exampleGapCue(item)]) {
      const result = Eval.evaluateExactRecall({ response: item.word, expected: item.word, prompt });
      assert.equal(result.pass, true, `${item.id}: ${prompt}: ${result.feedback}`);
    }
  }
  const eTrack = units.find(item => item.id === "h:e-track");
  assert.ok(eTrack);
  assert.equal(Eval.evaluateExactRecall({ response: "E-track", expected: "E-track", prompt: eTrack.translation }).pass, true);
  for (const prompt of ["E-track", "E track", "Please say E-track"]) {
    const response = prompt;
    assert.equal(Eval.isDegenerateResponse(response, prompt, 1).invalid, true, prompt);
  }
});

test("exact recall preserves professional phrase order with limited typo tolerance", () => {
  const professional = [...courseData.truck, ...courseData.hotshot];
  for (const item of professional) {
    assert.equal(Eval.evaluateExactRecall({ response: item.word, expected: item.word, prompt: item.translation }).pass, true, item.id);
    const tokens = Eval.textTokens(item.word);
    if (tokens.length < 2) continue;
    const reversed = [...tokens].reverse().join(" ");
    assert.notEqual(reversed, Eval.normalizeText(item.word), item.id);
    assert.equal(Eval.evaluateExactRecall({ response: reversed, expected: item.word, prompt: item.translation }).pass, false, item.id);
  }
  assert.equal(Eval.evaluateExactRecall({ response: "inspection laen", expected: "inspection lane", prompt: "полоса инспекции" }).pass, true);
  assert.equal(Eval.evaluateExactRecall({ response: "lane inspection", expected: "inspection lane", prompt: "полоса инспекции" }).pass, false);
});

test("document field recall preserves ordered dates, identifiers, weights and shipping descriptions", () => {
  const fields = [
    { label: "Expiration date", value: "08/20/2026" },
    { label: "Permit number", value: "PERMIT-NOT-VALID-001" },
    { label: "Gross weight", value: "79,260 lb" },
    { label: "Shipping description", value: "UN1263, Paint, 3, PG II" },
  ];
  for (const field of fields) {
    assert.equal(Eval.evaluateDocumentField(field, field.value).pass, true, field.label);
    const reversed = Eval.textTokens(field.value).reverse().join(" ");
    assert.equal(Eval.evaluateDocumentField(field, reversed).pass, false, `${field.label}: ${reversed}`);
  }
  assert.equal(Eval.evaluateDocumentField(fields[0], "August 20, 2026").pass, true);
  assert.equal(Eval.evaluateDocumentField(fields[2], "seventy-nine thousand two hundred sixty pounds").pass, true);
  assert.equal(Eval.evaluateDocumentField(
    { label: "Date and time", value: "08/20/2026 14:10 ET" },
    "August 20, 2026 2:10 p.m. ET",
  ).pass, true);
});

test("document identifiers reject one-character value changes while phrase typos remain bounded", () => {
  const cases = [
    [{ label: "License number", value: "TRAINING-A0001" }, "TRAINING-A0002"],
    [{ label: "VIN", value: "TRAININGTRACTOR001" }, "TRAININGTRACTOR002"],
    [{ label: "BOL number", value: "TRAINING-BOL-2048" }, "TRAINING-BOL-2049"],
    [{ label: "Seal", value: "SEAL-000845" }, "SEAL-000846"],
  ];
  for (const [field, changed] of cases) {
    assert.equal(Eval.evaluateDocumentField(field, field.value).pass, true, field.label);
    assert.equal(Eval.evaluateDocumentField(field, changed).pass, false, `${field.label}: ${changed}`);
  }
  assert.equal(Eval.evaluateDocumentField(
    { label: "Defect reported", value: "Right rear marker light inoperative" },
    "Right rear marker light inoperativf",
  ).pass, true);
});

test("all 80 situation model answers pass the runtime semantic evaluator", () => {
  let checked = 0;
  for (const item of courseData.situations) {
    const contract = item.practiceContract;
    const semantic = contract.typedDriverTurn.semanticRubric;
    for (const variant of contract.variants) {
      const modelAnswer = variant.modelAnswer
        || variant.dialogue?.find(turn => String(turn.speaker || "").toLowerCase().includes("driver"))?.english
        || contract.typedDriverTurn.modelAnswer;
      const result = Eval.evaluateSituation({
        ...item,
        informationGap: variant.prompt,
        typedSlots: variant.slotValues,
        responseRubric: {
          minTokens: Number(semantic.minimumEnglishWords || 3),
          requiredGroups: semantic.requiredConceptGroups,
          requiredRatio: 1,
        },
      }, modelAnswer, modelAnswer);
      assert.equal(result.pass, true, `${item.id}/${variant.id}: ${result.feedback}`);
      checked += 1;
    }
  }
  assert.equal(checked, 80);
});

test("all 160 variant-specific critical turns pass with only their owned slots", () => {
  let checked = 0;
  for (const item of courseData.situations) {
    for (const row of item.practiceContract.semanticCorpus) {
      const result = Eval.evaluateSituation({
        ...item,
        informationGap: row.informationGap,
        typedSlots: row.typedSlots,
        responseRubric: row.responseRubric,
      }, row.expected, row.expected);
      assert.equal(result.pass, true, `${item.id}/${row.id}: ${result.feedback}`);
      assert.ok(row.typedSlots.every(slot => slot.turnIds.length === 1 && slot.turnIds[0] === row.turnId), `${item.id}/${row.id}: slot ownership`);
      checked += 1;
    }
  }
  assert.equal(checked, 160);
});

test("every declared critical-turn concept remains mandatory after variant slot materialization", () => {
  let checked = 0;
  for (const item of courseData.situations) {
    for (const row of item.practiceContract.semanticCorpus) {
      const evaluate = response => Eval.evaluateSituation({
        ...item,
        informationGap: row.informationGap,
        typedSlots: row.typedSlots,
        responseRubric: row.responseRubric,
      }, response, row.expected);
      for (const [groupIndex, group] of (row.responseRubric.requiredGroups || []).entries()) {
        let omission = row.expected;
        for (const alternative of group) {
          const escaped = String(alternative).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          omission = omission.replace(new RegExp(`\\b${escaped}\\b`, "ig"), "");
        }
        assert.equal(evaluate(omission).pass, false, `${item.id}/${row.id}: omitted group ${groupIndex + 1}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 400, `checked ${checked} required concept groups`);
});

test("all 80 workplace outcomes use factual natural keys and fail a factual omission", () => {
  let checked = 0;
  let omissionChecks = 0;
  for (const item of courseData.situations) {
    for (const variant of item.practiceContract.variants) {
      const row = item.practiceContract.workplaceOutcome.expectedByVariant[variant.id];
      assert.equal(row.canonicalNaturalAnswer, row.modelAnswer, `${item.id}/${variant.id}: natural model`);
      assert.doesNotMatch(row.modelAnswer, /this confirms the completed workplace result/i, `${item.id}/${variant.id}: boilerplate`);
      const evaluate = response => Eval.evaluateSituation({
        ...item,
        informationGap: item.practiceContract.workplaceOutcome.promptEn,
        typedSlots: row.slotValues,
        responseRubric: row.responseRubric,
      }, response, row.modelAnswer);
      assert.equal(evaluate(row.modelAnswer).pass, true, `${item.id}/${variant.id}: canonical natural outcome`);
      for (const [groupIndex, group] of row.responseRubric.requiredGroups.entries()) {
        let omission = row.modelAnswer;
        const canonical = row.semanticContent[groupIndex].canonical;
        for (const alternative of new Set([canonical, ...group])) {
          const escaped = String(alternative).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          omission = omission.replace(new RegExp(`\\b${escaped}\\b`, "ig"), "");
        }
        assert.equal(evaluate(omission).pass, false, `${item.id}/${variant.id}: omitted outcome group ${groupIndex + 1}`);
        omissionChecks += 1;
      }
      checked += 1;
    }
  }
  assert.equal(checked, 80);
  assert.ok(omissionChecks >= 500, `checked ${omissionChecks} factual outcome groups`);

  const roadside = courseData.situations.find(item => item.id === "situation:roadside-stop");
  const row = roadside.practiceContract.workplaceOutcome.expectedByVariant.primary;
  const evaluateOutcome = (item, outcome, response) => Eval.evaluateSituation({
    ...item,
    informationGap: item.practiceContract.workplaceOutcome.promptEn,
    typedSlots: outcome.slotValues,
    responseRubric: outcome.responseRubric,
  }, response, outcome.modelAnswer);
  const natural = "The truck pulled over safely, the parking brake is engaged, and the motor is shut off. The assigned location is the white line.";
  assert.equal(evaluateOutcome(roadside, row, natural).pass, true, "natural roadside-stop outcome without completion boilerplate");
  assert.equal(evaluateOutcome(
    roadside,
    row,
    "The vehicle is safely stopped with the parking brake set. The assigned location is the white line.",
  ).pass, false, "roadside stop cannot omit engine off");
  assert.equal(evaluateOutcome(
    roadside,
    row,
    "The vehicle is safely parked with the parking brake set and the engine off. The assigned location is the white line.",
  ).pass, false, "parking cannot substitute for the context-bound stopped state");

  const hours = courseData.situations.find(item => item.id === "situation:hours-and-eld-inspection");
  const hoursOutcome = hours.practiceContract.workplaceOutcome.expectedByVariant.primary;
  assert.equal(evaluateOutcome(
    hours,
    hoursOutcome,
    "The duty status and required records were presented. The duty status is on duty, not driving.",
  ).pass, false, "presented cannot substitute for current duty status");

  const trafficStop = courseData.situations.find(item => item.id === "situation:traffic-stop-by-state-trooper");
  const trafficOutcome = trafficStop.practiceContract.workplaceOutcome.expectedByVariant.primary;
  assert.equal(evaluateOutcome(
    trafficStop,
    trafficOutcome,
    "The required paperwork is available, and I stayed safely inside the truck. The requested document set is License, registration and insurance.",
  ).pass, true, "natural traffic-stop outcome");
  assert.equal(evaluateOutcome(
    trafficStop,
    trafficOutcome,
    "The requested documents are ready. The requested document set is License, registration and insurance.",
  ).pass, false, "traffic stop cannot omit remaining in the vehicle");

  const breakdown = courseData.situations.find(item => item.id === "situation:roadside-breakdown");
  const breakdownOutcome = breakdown.practiceContract.workplaceOutcome.expectedByVariant.primary;
  assert.equal(evaluateOutcome(
    breakdown,
    breakdownOutcome,
    "At the vehicle location I-71 southbound near mile marker 42, unit T-204, I switched on the hazard flashers right away and deployed the warning triangles within ten minutes for the divided roadway layout.",
  ).pass, true, "natural roadside-breakdown safety outcome");
  assert.equal(evaluateOutcome(
    breakdown,
    breakdownOutcome,
    "A warning was reported. The vehicle location is I-71 southbound near mile marker 42. The equipment identifier is T-204.",
  ).pass, false, "breakdown cannot replace placement, timing and road type with a generic warning");
});

test("roadside breakdown requires timing and the exclusive road-specific placement branch", () => {
  const item = courseData.situations.find(candidate => candidate.id === "situation:roadside-breakdown");
  const rows = Object.fromEntries(item.practiceContract.semanticCorpus
    .filter(row => row.turnId === "turn-2")
    .map(row => [row.variantId, row]));
  const evaluate = (row, response) => Eval.evaluateSituation({
    ...item,
    informationGap: row.informationGap,
    typedSlots: row.typedSlots,
    responseRubric: row.responseRubric,
  }, response, row.expected);

  assert.equal(evaluate(rows.primary, "The hazard warning flashers are on immediately.").pass, false, "hazards-only");
  assert.equal(evaluate(rows.primary, "Within ten minutes I will place warning devices.").pass, false, "timing-only");
  assert.equal(evaluate(rows.primary, rows.primary.expected).pass, true, "divided-road canonical");
  assert.equal(evaluate(rows.transfer, rows.transfer.expected).pass, true, "hill-or-curve canonical");
  assert.equal(evaluate(rows.primary, rows.transfer.expected).pass, false, "wrong branch");
  assert.equal(evaluate(rows.transfer, rows.primary.expected).pass, false, "opposite wrong branch");
  assert.equal(evaluate(
    rows.primary,
    `${rows.primary.expected} I will also put a device 500 feet toward the blind curve.`,
  ).pass, false, "mixed branches");
});

test("situations reject wrong qualifiers, states, sequence and rejected slot values", () => {
  const evaluate = (item, variant, response) => {
    const semantic = item.practiceContract.typedDriverTurn.semanticRubric;
    const modelAnswer = variant.modelAnswer
      || variant.dialogue?.find(turn => String(turn.speaker || "").toLowerCase().includes("driver"))?.english
      || item.practiceContract.typedDriverTurn.modelAnswer;
    return Eval.evaluateSituation({
      ...item,
      informationGap: variant.prompt,
      typedSlots: variant.slotValues,
      responseRubric: { minTokens: semantic.minimumEnglishWords, requiredGroups: semantic.requiredConceptGroups, requiredRatio: 1 },
    }, response, modelAnswer);
  };
  const cases = [
    ["situation:roadside-stop", "primary", "The white line is wrong. I will stop at the exit."],
    ["situation:vehicle-inspection-directions", "primary", "The hood is open, and the left signal is off."],
    ["situation:weather-closure-fatigue-or-no-hours", "primary", "The road is open, and I have 40 minutes left."],
    ["situation:customer-delivery-and-condition-report", "primary", "Please inspect the vehicle after you sign the delivery report. The reported condition is left rear door."],
    ["situation:level-i-full-inspection", "primary", "Tractor brakes set, trailer brakes set."],
    ["situation:level-i-full-inspection", "transfer", "Tractor brakes set, trailer brakes set. The requested equipment action is parking brakes."],
    ["situation:pre-trip-defect-report", "transfer", "I found a cut on the right rear trailer tire."],
    ["situation:highway-and-dynamic-signs", "transfer", "The right lane is closed ahead. The sign message is LEFT LANE CLOSED AHEAD."],
  ];
  for (const [id, variantId, response] of cases) {
    const item = courseData.situations.find(candidate => candidate.id === id);
    const variant = item?.practiceContract.variants.find(candidate => candidate.id === variantId);
    assert.ok(variant, `${id}/${variantId}`);
    const modelAnswer = variant.modelAnswer
      || variant.dialogue?.find(turn => String(turn.speaker || "").toLowerCase().includes("driver"))?.english
      || item.practiceContract.typedDriverTurn.modelAnswer;
    assert.equal(evaluate(item, variant, modelAnswer).pass, true, `${id}/${variantId}: canonical`);
    assert.equal(evaluate(item, variant, response).pass, false, `${id}/${variantId}: ${response}`);
  }
});

test("critical sign actions reject opposite shoulder, movement and parking relations", () => {
  const cases = [
    ["sign:mutcd:w8-4", "I will keep the heavy wheels on the shoulder."],
    ["sign:dms:stopped-traffic-ahead", "I will slow down and prepare to go."],
    ["sign:dms:stopped-traffic-ahead", "Slow down and prepare carefully."],
    ["sign:mutcd:w3-4", "I will reduce speed and prepare to go."],
    ["sign:mutcd:w8-14", "I will watch the roadway and do not go unnecessarily."],
    ["sign:mutcd:w8-14", "Watch the roadway and do not proceed."],
    ["sign:mutcd:r7-1", "I will park away from this area."],
    ["sign:mutcd:r7-1", "Do not leave this parking area."],
    ["sign:mutcd:r12-2", "Check axle weights carefully."],
    ["sign:dms:crash-ahead-use-caution", "Slow down and watch carefully."],
  ];
  for (const [id, unsafeAction] of cases) {
    const item = courseData.signs.find(candidate => candidate.id === id);
    assert.ok(item, id);
    assert.equal(Eval.evaluateSignMeaningAndAction(item, `This sign means ${item.display}. ${item.actionEn}`).pass, true, `${id}: canonical`);
    assert.equal(Eval.evaluateSignMeaningAndAction(item, `This sign means ${item.display}. ${unsafeAction}`).pass, false, `${id}: ${unsafeAction}`);
  }
});

test("vehicle securement evaluation enforces the active 393.128 or 393.130 branch", () => {
  const source = courseData.inspectionQuestions.find(item => item.id === "question:how-is-the-cargo-secured");
  const contexts = {
    low: {
      profile: "hotshot-open",
      conditions: { cargoSecurement: true, vehicleTransport: true, transportedVehicleAtMost10000Lb: true },
    },
    high: {
      profile: "hotshot-open",
      conditions: { cargoSecurement: true, vehicleTransport: true, transportedVehicleOver10000Lb: true },
    },
  };
  const low = Core.materializeForProfile(source, contexts.low);
  const high = Core.materializeForProfile(source, contexts.high);
  const evaluate = (item, response) => Eval.evaluateSemanticResponse({
    response,
    prompt: item.promptDisplay,
    expected: item.answerDisplay,
    slots: item.answerSlots,
    rubric: item.responseRubric,
  });

  assert.equal(evaluate(low, low.answerDisplay).pass, true);
  assert.equal(evaluate(high, high.answerDisplay).pass, true);
  const lowMixed = evaluate(low, `${low.answerDisplay} The 393.130 branch also requires a minimum of four tiedowns.`);
  assert.equal(lowMixed.pass, false);
  assert.ok(lowMixed.missing.includes("branch:forbidden-regulation"));
  assert.ok(lowMixed.missing.includes("branch:forbidden-minimum-tiedowns"));
  const highMixed = evaluate(high, `${high.answerDisplay} The 393.128 branch also permits a minimum of two tiedowns.`);
  assert.equal(highMixed.pass, false);
  assert.ok(highMixed.missing.includes("branch:forbidden-regulation"));
  assert.ok(highMixed.missing.includes("branch:forbidden-minimum-tiedowns"));
  assert.equal(evaluate(low, high.answerDisplay).pass, false);
  assert.equal(evaluate(high, low.answerDisplay).pass, false);

  const lesson = courseData.lessons.find(item => item.id === "lesson:securing-transported-vehicles");
  const lowInteraction = Core.materializeForProfile(lesson, contexts.low).interaction;
  const highInteraction = Core.materializeForProfile(lesson, contexts.high).interaction;
  const evaluateInteraction = (interaction, response) => Eval.evaluateSemanticResponse({
    response,
    prompt: interaction.promptEn,
    expected: interaction.modelResponse,
    slots: interaction.responseSlots,
    rubric: interaction.semanticRubric,
  });
  assert.equal(evaluateInteraction(lowInteraction, lowInteraction.modelResponse).pass, true);
  assert.equal(evaluateInteraction(highInteraction, highInteraction.modelResponse).pass, true);
  assert.equal(evaluateInteraction(lowInteraction, highInteraction.modelResponse).pass, false);
  assert.equal(evaluateInteraction(highInteraction, lowInteraction.modelResponse).pass, false);
});

test("cargo initial reinspection requires the computed deadline odometer", () => {
  const task = courseData.cargoReinspectionProgram.scoredTasks.find(item => item.id === "first-50-miles");
  const evaluate = response => Eval.evaluateSemanticResponse({
    response,
    prompt: task.promptEn,
    expected: task.modelAnswer,
    slots: task.slots,
    rubric: task.responseRubric,
  });
  assert.equal(evaluate(task.modelAnswer).pass, true);
  const generic = evaluate("I must inspect the cargo and securement within the first 50 miles after beginning the trip.");
  assert.equal(generic.pass, false);
  assert.ok(generic.missing.includes("branch:missing-computed-odometer"));
  assert.ok(generic.missing.includes("branch:generic-rule-without-computation"));
  const wrong = evaluate("I must inspect by odometer 120,049, within the first 50 miles after beginning the trip.");
  assert.equal(wrong.pass, false);
  assert.ok(wrong.missing.includes("branch:conflicting-computed-odometer"));
  const conflicting = evaluate(`${task.modelAnswer} Another possible deadline is odometer 120,049.`);
  assert.equal(conflicting.pass, false);
  assert.ok(conflicting.missing.includes("branch:conflicting-computed-odometer"));
});

test("cargo reinspection chooses exactly the earliest visible event", () => {
  const tasks = courseData.cargoReinspectionProgram.scoredTasks.filter(item => item.responseRubric?.earliestEventPolicy);
  assert.equal(tasks.length, 3);
  const evaluate = (task, response) => Eval.evaluateSemanticResponse({
    response,
    prompt: task.promptEn,
    expected: task.modelAnswer,
    slots: task.slots,
    rubric: task.responseRubric,
  });
  for (const task of tasks) assert.equal(evaluate(task, task.modelAnswer).pass, true, task.id);

  const duty = tasks.find(item => item.id === "next-due-duty-status-change");
  const hours = tasks.find(item => item.id === "next-due-three-hours");
  const miles = tasks.find(item => item.id === "next-due-150-miles");
  assert.equal(evaluate(duty, "The next inspection is due after three hours at 10:10 a.m. because that event occurs first.").pass, false);
  assert.equal(evaluate(hours, "The next inspection is due at 150 miles at 11:00 a.m. because that event occurs first.").pass, false);
  assert.equal(evaluate(miles, "The next inspection is due at the duty status change at 11:20 a.m. because that event occurs first.").pass, false);
  const combined = evaluate(duty, "The next inspection is due at the duty status change, three hours, and 150 miles at 10:10 a.m.");
  assert.equal(combined.pass, false);
  assert.ok(combined.missing.includes("branch:single-earliest-event-required"));
  assert.ok(combined.missing.includes("branch:combined-deadline-events"));
});

test("cargo reinspection exceptions require the scenario-specific decision and basis", () => {
  const tasks = courseData.cargoReinspectionProgram.scoredTasks.filter(item => item.responseRubric?.exceptionDecisionPolicy);
  assert.equal(tasks.length, 3);
  const evaluate = (task, response) => Eval.evaluateSemanticResponse({
    response,
    prompt: task.promptEn,
    expected: task.modelAnswer,
    slots: task.slots,
    rubric: task.responseRubric,
  });
  for (const task of tasks) assert.equal(evaluate(task, task.modelAnswer).pass, true, task.id);

  const ordered = tasks.find(item => item.id === "exception-sealed-and-ordered-not-to-open");
  const impracticable = tasks.find(item => item.id === "exception-inspection-impracticable");
  const sealAlone = tasks.find(item => item.id === "seal-alone-is-not-universal-exception");
  const sealedOnly = evaluate(ordered, "The exception applies because the CMV is sealed.");
  assert.equal(sealedOnly.pass, false);
  assert.ok(sealedOnly.missing.includes("branch:sealed-without-order"));
  assert.equal(evaluate(impracticable, "The exception applies.").pass, false);
  const universal = evaluate(sealAlone, "The exception applies because the CMV is sealed.");
  assert.equal(universal.pass, false);
  assert.ok(universal.missing.includes("branch:wrong-exception-decision"));
  assert.ok(universal.missing.includes("branch:universal-sealed-exception"));
});

test("every Step 2 sign requires its complete critical action tail", () => {
  const generic = new Set(["a", "an", "and", "are", "as", "at", "be", "do", "for", "from", "have", "here", "i", "in", "is", "it", "me", "my", "of", "on", "or", "please", "the", "this", "to", "was", "will", "with", "you", "your"]);
  const independentlyTestedAlternatives = new Set(["sign:mutcd:r16-3", "sign:dms:all-lanes-closed"]);
  const signs = courseData.signs.filter(item => ["fhwa-mutcd-shs", "training-dms"].includes(item.provenance));
  assert.equal(signs.length, 65);
  for (const item of signs) {
    if (independentlyTestedAlternatives.has(item.id)) continue;
    const contentTokens = Eval.textTokens(item.actionEn).filter(token => !generic.has(token));
    const omitted = [...new Set(contentTokens)].at(-1);
    const incomplete = Eval.textTokens(item.actionEn).filter(token => token !== omitted).join(" ");
    assert.equal(Eval.evaluateSign(item, item.actionEn).pass, true, `${item.id}: canonical action`);
    assert.equal(Eval.evaluateSign(item, incomplete).pass, false, `${item.id}: omitted ${omitted}`);
  }
});

test("question variant identity follows the actual retrieval objective", () => {
  assert.equal(Eval.questionAttemptVariant({ baseVariant: "direct-response", listeningTarget: "prompt" }), "direct-response");
  assert.equal(Eval.questionAttemptVariant({ baseVariant: "listening-response", listeningTarget: "prompt", listeningRequired: true }), "listening-response");
  assert.equal(Eval.questionAttemptVariant({ baseVariant: "direct-response", listeningTarget: "answer", listeningRequired: true }), "driver-answer-listening");
  assert.equal(Eval.questionAttemptVariant({ baseVariant: "listening-response", listeningTarget: "answer", listeningRequired: true }), "driver-answer-listening");
});

test("revealed or self-reported outcomes cannot create qualifying evidence", () => {
  const failed = Eval.evidenceForEvaluation({ pass: false }, { variant: "v1", support: "reveal", selfReported: true });
  assert.equal(failed.kind, "self-reported");
  assert.equal(failed.objective, false);
  assert.equal(failed.independent, false);

  const passed = Eval.evidenceForEvaluation({ pass: true, evaluator: "semantic-slots" }, { variant: "v2" });
  assert.equal(passed.kind, "demonstrated");
  assert.equal(passed.objective, true);
  assert.equal(passed.blind, true);
  assert.equal(passed.productive, true);
  assert.equal(passed.support, "none");
});

test("listening diagnostic requires actual stimulus exposure", () => {
  const item = { audio: "Stop at the white line.", options: [{ text: "stop", correct: true }, { text: "continue" }] };
  assert.equal(Eval.diagnosticAnswerAllowed(item, false), false);
  assert.equal(Eval.scoreDiagnosticAnswer(item, 0, { stimulusExposed: false }).pass, false);
  assert.equal(Eval.scoreDiagnosticAnswer(item, 0, { stimulusExposed: true }).pass, true);
  assert.match(Eval.scoreDiagnosticAnswer(item, 1, { stimulusExposed: true }).feedback, /stop/);
});

test("productive diagnostic is blind and rejects irrelevant response", () => {
  const item = {
    kind: "productive",
    prompt: "Inspector: What is the listed weight?",
    model: "The listed weight is 38,200 pounds.",
    slots: [{ name: "cargo-weight", display: "38,200", spoken: "thirty-eight thousand two hundred" }],
    rubric: { minTokens: 4, requiredGroups: [["weight"], ["pounds"]] },
  };
  assert.equal(Eval.scoreDiagnosticAnswer(item, "yes yes").pass, false);
  assert.equal(Eval.scoreDiagnosticAnswer(item, "The trailer is ready.").pass, false);
  assert.equal(Eval.scoreDiagnosticAnswer(item, "The weight is 38,200 pounds.").pass, true);
});

test("gate status is derived from complete keyed evidence", () => {
  const ids = ["a", "b"];
  assert.equal(Eval.deriveGateStatus({}, ids), "not-started");
  assert.equal(Eval.deriveGateStatus({ a: { pass: true } }, ids), "pending");
  assert.equal(Eval.deriveGateStatus({ a: { pass: true }, b: { pass: false } }, ids), "failed");
  assert.equal(Eval.deriveGateStatus({ a: { pass: true }, b: { pass: true } }, ids), "passed");
});

test("branch options use stable varied positions instead of an always-first key", () => {
  const options = ["correct", "unsafe-a", "unsafe-b"];
  const positions = new Set();
  for (const seed of ["day-1-0", "day-2-1", "day-3-2", "day-4-3", "day-5-4"]) {
    const first = Eval.deterministicOptionOrder(options, seed);
    const second = Eval.deterministicOptionOrder(options, seed);
    assert.deepEqual(first, second);
    positions.add(first.findIndex(row => row.originalIndex === 0));
  }
  assert.ok(positions.size > 1, `expected varied correct positions, got ${[...positions]}`);
});
