"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Core = require("../app/app-core.js");
const Eval = require("../app/learning-evaluator.js");
const State = require("../app/state-store.js");

const ROOT = path.resolve(__dirname, "..");
const data = require(path.join(ROOT, "app", "data", "course-data.json"));
const app = fs.readFileSync(path.join(ROOT, "app", "app.js"), "utf8");

test("all 40 situations require every critical turn, a randomized safe choice and a typed outcome", () => {
  assert.equal(data.situations.length, 40);
  for (const item of data.situations) {
    const contract = item.practiceContract;
    assert.equal(contract.branchingPractice, true, item.id);
    assert.ok(contract.criticalTurns.length >= 2, item.id);
    assert.deepEqual(contract.completionBlueprint.requiredCriticalTurnIds, contract.criticalTurns.map(turn => turn.id), item.id);
    assert.equal(contract.completionBlueprint.requireSafeChoice, true, item.id);
    assert.equal(contract.completionBlueprint.requireTypedWorkplaceOutcome, true, item.id);
    assert.equal(contract.completionBlueprint.failIfAnyCriticalTurnMissing, true, item.id);
    assert.equal(contract.safetyDecision.randomizeOptions, true, item.id);
    assert.equal(contract.choiceCheck.shufflePolicy, "seeded-per-attempt", item.id);
    assert.equal(contract.choiceCheck.options.filter(option => option.safe === true).length, 1, item.id);
    assert.equal(contract.variants.length, 2, item.id);
    for (const variant of contract.variants) {
      assert.equal(variant.dialogue.filter(line => line.semanticRole === "driver").length, contract.criticalTurns.length, `${item.id}:${variant.id}`);
    }
  }
  assert.match(app, /requiredIds\.find\(id => !completedIds\.has\(id\)\)/);
  assert.match(app, /task\.choiceSafe !== true/);
  assert.match(app, /"situation-completion-blueprint"/);
});

test("situation safety choices are scene-specific and do not expose a longest-answer key", () => {
  const distractors = [];
  let correctLongest = 0;
  for (const item of data.situations) {
    const options = item.practiceContract.choiceCheck.options;
    const safe = options.find(option => option.safe === true);
    const unsafe = options.filter(option => option.safe !== true);
    assert.equal(unsafe.length, 2, item.id);
    assert.equal(new Set(unsafe.map(option => option.text)).size, 2, item.id);
    assert.ok(unsafe.every(option => option.text.length >= safe.text.length * 0.65), `${item.id}: plausible option length`);
    distractors.push(...unsafe.map(option => option.text));
    if (safe.text.length === Math.max(...options.map(option => option.text.length))) correctLongest += 1;
  }
  assert.equal(new Set(distractors).size, 80);
  assert.ok(correctLongest <= 13, `longest-answer heuristic selected ${correctLongest}/40`);
});

test("listening situation selector admits only exact local prompt files", () => {
  let eligibleTurns = 0;
  let excludedTurns = 0;
  for (const item of data.situations) {
    const contract = item.practiceContract;
    assert.equal(contract.listeningBlueprint.qualificationAudioPolicy, "exact-local-file-only", item.id);
    assert.equal(contract.listeningBlueprint.webSpeechQualifying, false, item.id);
    assert.equal(contract.listeningBlueprint.excludeUnsupportedFromSelector, true, item.id);
    for (const variant of contract.variants) {
      for (const turn of variant.criticalTurns) {
        const audio = turn.promptAudio;
        assert.equal(audio.qualificationPolicy, "exact-local-file-only", `${item.id}:${variant.id}:${turn.id}`);
        if (audio.eligible) {
          eligibleTurns += 1;
          const sources = Object.values(audio.sources || {});
          assert.equal(sources.length, 1, `${item.id}:${variant.id}:${turn.id}: one exact profile`);
          assert.ok(fs.existsSync(path.join(ROOT, "app", sources[0])), `${item.id}:${variant.id}:${turn.id}: ${sources[0]}`);
        } else {
          excludedTurns += 1;
          assert.equal(Object.keys(audio.sources || {}).length, 0, `${item.id}:${variant.id}:${turn.id}: excluded has no source`);
          assert.ok(audio.exclusionReason, `${item.id}:${variant.id}:${turn.id}: exclusion reason`);
        }
      }
    }
  }
  assert.equal(eligibleTurns, 160);
  assert.equal(excludedTurns, 0);
  assert.match(app, /function situationVariantSupportsMode\(item, variantId, mode = situationMode\)/);
  assert.match(app, /situationRequiresExposure\(\) && eligibleSituationVariants\(item\)\.length === 0/);
  assert.match(app, /chooseContextualMode\("situations", item, selectableVariants\)/);
  assert.match(app, /promptAudio: turn\.promptAudio \|\| null/);
  assert.match(app, /Core\.situationPromptForMode\(currentTurn\?\.prompt \|\| currentSituationPractice\.prompt/);
  assert.match(app, /const display = Core\.situationDialogueDisplay\(line, \{ mode: situationMode, evaluated \}\)/);
  assert.match(app, /Core\.situationStageRequiresExposure\(task\.stage, situationMode\)/);
  assert.match(app, /\$\{hiddenEnglish \? "" : `<div class="dialogue-content"/);
  assert.doesNotMatch(app, /dialogue-content[^\n]*hidden[^\n]*line\.english/);
  assert.match(app, /if \(!entries\.length\)[\s\S]{0,900}#situation-dialogue[\s\S]{0,300}#play-situation/);
});

test("every canonical situation has exactly one local visual assignment", () => {
  const visualCounts = new Map(data.situations.map(item => [item.id, 0]));
  for (const asset of data.visualAssets) {
    assert.ok(fs.existsSync(path.join(ROOT, "app", asset.path)), asset.path);
    for (const ref of asset.contentRefs || []) {
      if (visualCounts.has(ref)) visualCounts.set(ref, visualCounts.get(ref) + 1);
    }
  }
  assert.equal(visualCounts.size, 40);
  for (const [id, count] of visualCounts) assert.equal(count, 1, id);
});

test("all situation semantic roles render as Russian professions while voice ids remain separate", () => {
  const roles = new Set(data.situations.flatMap(item => item.practiceContract.variants.flatMap(variant => variant.dialogue.map(line => line.semanticRole || line.speaker))));
  for (const role of roles) {
    const normalized = String(role).toLowerCase().replaceAll("-", " ").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(app, new RegExp(`(?:"${normalized}"|${normalized})\\s*:`), role);
  }
  assert.match(app, /const key = String\(value\)\.toLowerCase\(\)\.replaceAll\("-", " "\)/);
  assert.match(app, /function voiceId\(line, fallback = "driver"\)[\s\S]{0,180}line\?\.voiceId/);
});

test("all 24 documents assess a visible full sample using two keyed instances", () => {
  assert.equal(data.documents.length, 24);
  for (const item of data.documents) {
    assert.equal(item.trainingInstances.length, 2, item.id);
    assert.equal(item.assessmentBlueprint.visibleFullStimulusRequired, true, item.id);
    assert.equal(item.assessmentBlueprint.minimumDistinctInstances, 2, item.id);
    assert.equal(item.assessmentBlueprint.differentInstanceForMasteryConfirmation, true, item.id);
    assert.equal(new Set(item.trainingInstances.map(instance => instance.id)).size, 2, item.id);
    assert.equal(new Set(item.trainingInstances.map(instance => instance.answerKey)).size, 2, item.id);
    for (const instance of item.trainingInstances) {
      assert.equal(instance.watermark, "TRAINING SAMPLE, NOT VALID", instance.id);
      assert.ok(Array.isArray(instance.visibleStimulus.fields), instance.id);
      assert.ok(instance.distractors.length >= 2, instance.id);
      assert.equal(item.assessmentBlueprint.answerKeyByInstanceId[instance.id], instance.answerKey, instance.id);
    }
  }
  assert.match(app, /function renderVisibleDocument\(instance\)/);
  assert.match(app, /currentDocumentVariant = currentDocumentInstance\.id/);
  assert.match(app, /Правильный ответ скрыт до фиксации результата/);
});

test("all 21 lessons require reception, every phrase, production and interaction", () => {
  const audioContext = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "app", "data", "audio-data.js"), "utf8"), audioContext);
  const audio = audioContext.window.TRUCK_AUDIO_DATA;
  assert.equal(data.lessons.length, 21);
  for (const item of data.lessons) {
    const blueprint = item.assessmentBlueprint;
    const phrases = item.phrases;
    assert.equal(item.phraseMeaningsRu.length, phrases.length, item.id);
    assert.equal(blueprint.reception.requiredPhraseIds.length, phrases.length, item.id);
    assert.equal(blueprint.production.requiredPhraseIds.length, phrases.length, item.id);
    assert.equal(blueprint.reception.localAudioExposureRequired, true, item.id);
    assert.equal(blueprint.production.allPhrasesAssessed, true, item.id);
    assert.equal(blueprint.interaction.required, true, item.id);
    assert.equal(blueprint.completion.interactionRequired, true, item.id);
    for (const [profile, profilePhrases] of Object.entries(item.profilePhrases || { default: phrases })) {
      for (const [phraseIndex, phrase] of profilePhrases.entries()) {
        const exactSource = (audio.bySource[`lesson\0${item.id}\0phrase-${phraseIndex + 1}`] || []).some(clip => clip.text === phrase && clip.path);
        const exactLookup = Boolean(audio.lookup[`driver\0${phrase}`]?.[item.audioProfile || "clean"]);
        assert.ok(exactSource || exactLookup, `${item.id}:${profile}:phrase-${phraseIndex + 1} needs exact local audio`);
      }
    }
  }
  assert.match(app, /heardLessonStimuli\.has\(lessonStimulusKey/);
  assert.match(app, /construct === "reception" \? "reception-only" : "production-interaction"/);
  assert.match(app, /stage: constructState\.waitUntil \? "waiting" : construct === "reception" \? "reception" : "production"/);
  assert.match(app, /attempt\.productionIndex >= attempt\.order\.length \? "interaction"/);
  assert.match(app, /"lesson-reception-blueprint"/);
  assert.match(app, /"lesson-production-interaction-blueprint"/);
});

test("lesson listening and productive constructs qualify in separate spaced attempts", () => {
  for (const item of data.lessons) {
    const completion = item.assessmentBlueprint.completion;
    assert.deepEqual(completion.requiredSpacedConstructVariants, ["reception-only", "production-interaction"], item.id);
    assert.equal(completion.minimumHoursBetweenConstructs, 24, item.id);
  }
  assert.match(app, /construct === "reception" \? "lesson-reception-blueprint" : "lesson-production-interaction-blueprint"/);
  assert.match(app, /function lessonConstructState\(item\)[\s\S]*24 \* 60 \* 60 \* 1000/);
  assert.match(app, /lessonSource\.find\(item => !isDone\("lessons", item\.id\)\s*&& Core\.lessonConstructAvailable\(lessonConstructState\(item\), Date\.now\(\)\)\)/);
  assert.match(app, /stage === "waiting"[\s\S]{0,700}не раньше чем через 24 часа/);
  assert.match(app, /reception-before-production-cues/);
  assert.match(app, /Понимание на слух проверяется отдельной попыткой/);
  assert.doesNotMatch(app, /attempt\.stage = "reception";\s+attempt\.feedback = "Рабочее взаимодействие/);
});

test("ELP Step 2 scores a 12 item English reading route from the declared 47 item pool", () => {
  assert.equal(data.elpStepTwoEnglishBearingIds.length, 47);
  assert.equal(data.elpStepTwoCompletionBlueprint.requiredScoredAttempts, 12);
  assert.equal(data.elpStepTwoCompletionBlueprint.requiredOfficialSvgAttempts, 8);
  assert.equal(data.elpStepTwoCompletionBlueprint.requiredTrainingDmsAttempts, 4);
  assert.equal(data.signs.filter(item => item.provenance === "fhwa-mutcd-shs").length, 49);
  assert.equal(data.signs.filter(item => item.provenance === "training-dms").length, 16);
  assert.equal(data.signs.filter(item => item.provenance === "fhwa-mutcd-shs" && item.englishBearing).length, 31);
  assert.equal(data.signs.filter(item => item.provenance === "fhwa-mutcd-shs" && !item.englishBearing).length, 18);
  for (const id of data.elpStepTwoEnglishBearingIds) {
    const item = data.signs.find(sign => sign.id === id);
    assert.ok(item, id);
    assert.equal(Eval.evaluateSignMeaningAndAction(item, item.actionEn).pass, false, `${id}: action alone cannot prove reading`);
  }
  assert.match(app, /function materializeElpStepTwoSession\(items\)/);
  assert.match(app, /expectedIds\.length !== requiredScoredAttempts/);
  assert.match(app, /stepTwoReadinessCard[\s\S]{0,100}\? "elp-reading-meaning-and-action"/);
  assert.match(app, /variant\.includes\("meaning-and-action"\)/);
});

test("profile cargo diagnostics use a semantic commodity slot", () => {
  const contract = data.diagnosticProfileCargoMaterializations;
  assert.equal(contract.responseTarget, "commodity-only");
  assert.equal(contract.visibleTrailerTypeIsContextOnly, true);
  assert.equal(contract.trailerTypeResponseRequired, false);
  const score = (profile, response) => {
    const cargo = contract.profiles[profile];
    return Eval.scoreDiagnosticAnswer({
      kind: "productive",
      prompt: "What are you hauling?",
      model: cargo.model,
      slots: cargo.slots,
      rubric: cargo.rubric,
    }, response).pass;
  };
  assert.equal(score("tractor", "I am hauling packaged food."), true);
  assert.equal(score("tractor", "I am hauling cars."), false);
  assert.equal(score("hotshot-open", "I am hauling cars."), true);
  assert.equal(score("hotshot-open", "I am hauling two vehicles."), true);
  assert.equal(score("hotshot-open", "I am hauling packaged food."), false);
  assert.equal(score("hotshot-enclosed", "I am hauling a passenger vehicle."), true);
  assert.equal(score("hotshot-enclosed", "I am hauling one car."), true);
  assert.equal(score("hotshot-enclosed", "I am hauling two vehicles."), false);
  assert.match(app, /const contract = DATA\.diagnosticProfileCargoMaterializations \|\| \{\}/);
  assert.match(app, /const cargo = contract\.profiles\?\.\[profile\]/);
  assert.match(app, /rubric: \{ \.\.\.\(item\.rubric \|\| \{\}\), \.\.\.\(cargo\.rubric \|\| \{\}\) \}/);
});

test("all seven ELP Step 1 functions materialize and score for every equipment profile", () => {
  assert.equal(data.elpStepOneBlueprint.version, "seven-functions-v1");
  assert.equal(data.elpStepOneBlueprint.requiredResponses, 7);
  assert.equal(data.elpStepOneBlueprint.officialAssessment, false);
  assert.deepEqual(data.elpStepOneBlueprint.functions.map(item => item.questionId), data.elpStepOneIds);
  assert.equal(data.elpStepOneIds.length, 7);
  const questions = new Map(data.inspectionQuestions.map(item => [item.id, item]));
  for (const profile of ["tractor", "hotshot-open", "hotshot-enclosed"]) {
    for (const id of data.elpStepOneIds) {
      const materialized = Core.materializeForProfile(questions.get(id), { profile });
      assert.ok(materialized.answerDisplay, `${id}:${profile}:display`);
      assert.ok(materialized.answerSpoken || materialized.answer, `${id}:${profile}:spoken`);
      if (materialized.profileMaterializations) {
        assert.deepEqual(materialized.answerSlots, materialized.slots, `${id}:${profile}:slots`);
      }
      const evaluated = Eval.evaluateQuestion(materialized, materialized.answerDisplay, { elpStepOne: true });
      assert.equal(evaluated.pass, true, `${id}:${profile}:${evaluated.feedback}`);
    }
  }

  const rows = data.inspectionQuestions.filter(item => item.profileMaterializations);
  assert.ok(rows.length >= 4);
  for (const item of rows) {
    for (const profile of ["tractor", "hotshot-open", "hotshot-enclosed"]) {
      const materialized = Core.materializeForProfile(item, { profile });
      assert.ok(materialized.answerDisplay, `${item.id}:${profile}:display`);
      assert.ok(materialized.answerSpoken, `${item.id}:${profile}:spoken`);
      assert.deepEqual(materialized.answerSlots, materialized.slots, `${item.id}:${profile}:slots`);
      const evaluated = Eval.evaluateQuestion(materialized, materialized.answerDisplay, { elpStepOne: data.elpStepOneIds.includes(item.id) });
      assert.equal(evaluated.pass, true, `${item.id}:${profile}:${evaluated.feedback}`);
    }
  }
  const cargo = rows.find(item => item.id === "question:what-are-you-hauling");
  const open = Core.materializeForProfile(cargo, { profile: "hotshot-open" });
  assert.equal(Eval.evaluateQuestion(open, "I am hauling packaged food.", { elpStepOne: true }).pass, false);
  assert.equal(Eval.evaluateQuestion(open, "I am hauling cars.", { elpStepOne: true }).pass, true);
  assert.equal(Eval.evaluateQuestion(open, "I am hauling two vehicles.", { elpStepOne: true }).pass, true);

  const unitSource = questions.get("question:what-is-your-truck-and-trailer-number");
  const expectedUnits = {
    tractor: ["T-204", "TR-518"],
    "hotshot-open": ["P-204", "HS-518"],
    "hotshot-enclosed": ["P-204", "HE-518"],
  };
  for (const [profile, expected] of Object.entries(expectedUnits)) {
    const unit = Core.materializeForProfile(unitSource, { profile });
    assert.deepEqual(unit.slots.map(slot => slot.display), expected, profile);
  }
});

test("profile cargo units materialize before card rendering and evaluation", () => {
  const unit = [...data.core, ...data.truck, ...data.hotshot].find(item => item.id === "t:required:i-am-hauling-commodity");
  assert.ok(unit?.profileMaterializations);
  const expected = {
    tractor: "packaged food",
    "hotshot-open": "two vehicles",
    "hotshot-enclosed": "a passenger vehicle",
  };
  for (const [profile, cargo] of Object.entries(expected)) {
    const materialized = Core.materializeForProfile(unit, { profile });
    assert.match(materialized.word.toLowerCase(), new RegExp(cargo));
    assert.equal(Eval.evaluateExactRecall({ response: materialized.word, expected: materialized.word, prompt: materialized.translation }).pass, true, profile);
  }
  assert.match(app, /function unitForCurrentProfile\(id\)/);
  assert.match(app, /cardQueue = focusedCardIds\.map\(unitForCurrentProfile\)/);
  assert.match(app, /function wordMastered\(id\) \{\s*return StateApi\.isMastered\(recordForCurrentContext\("words", id\)\)/);
  assert.match(app, /function dueContent\(bucket, source\)[\s\S]{0,260}StateApi\.isDue\(recordForCurrentContext\(bucket, item\.id\)/);
  assert.match(app, /const newCore = coreSource\.filter\(item => !wordMastered\(item\.id\)\)/);
  assert.match(app, /const pending = source\.filter\(item => !wordMastered\(item\.id\)\)/);
});

test("lesson interaction contracts expose and assess a real interlocutor prompt", () => {
  for (const item of data.lessons) {
    const interaction = item.assessmentBlueprint.interaction;
    assert.ok(interaction.promptEn.trim(), item.id);
    assert.ok(interaction.promptRu.trim(), item.id);
    assert.ok(interaction.requiredResponsePhraseIds.length >= 1, item.id);
    assert.equal(interaction.responseKeySource, "materialized-lesson-phrases", item.id);
    assert.equal(interaction.promptAndResponseBothAssessed, true, item.id);
  }
  assert.match(app, /function lessonInteractionContract\(item, phrases\)/);
  assert.match(app, /const profileContract = item\.profileInteractionMaterializations\?\.\[state\.profile \|\| "tractor"\]/);
  assert.match(app, /Eval\.evaluateLessonAssertionSet\(item, response, interaction\.requiredResponses/);
});

test("lesson interaction requires every declared response assertion", () => {
  for (const item of data.lessons) {
    const profiles = Object.keys(item.profilePhrases || { default: item.phrases });
    for (const profile of profiles) {
      const phrases = item.profilePhrases?.[profile] || item.phrases;
      const phraseById = new Map(phrases.map((phrase, index) => [`phrase-${index + 1}`, phrase]));
      const contract = item.profileInteractionMaterializations?.[profile] || item.assessmentBlueprint.interaction;
      const required = contract.requiredResponsePhraseIds.map(id => phraseById.get(id)).filter(Boolean);
      const semantic = contract.semanticRubric || {};
      const rubric = {
        ...semantic,
        minTokens: Number(semantic.minimumEnglishWords || semantic.minTokens || 3),
        requiredRatio: Number.isFinite(Number(semantic.requiredResponseCoverage)) ? Number(semantic.requiredResponseCoverage) : Number(semantic.requiredRatio || 1),
      };
      const evaluateAll = response => Eval.evaluateLessonAssertionSet(item, response, required, { prompt: contract.promptEn, rubric }).pass;
      const canonical = required.join(" ");
      assert.equal(evaluateAll(canonical), true, `${item.id}:${profile}:canonical`);
      assert.equal(evaluateAll(`I refuse to answer, but ${canonical}`), false, `${item.id}:${profile}:refusal`);
      assert.equal(evaluateAll(`${canonical} That is not correct.`), false, `${item.id}:${profile}:repudiation`);
      for (let omitted = 0; omitted < required.length; omitted += 1) {
        assert.equal(evaluateAll(required.filter((_, index) => index !== omitted).join(" ")), false, `${item.id}:${profile}:omitted-${omitted + 1}`);
      }
    }
  }
  assert.match(app, /Eval\.evaluateLessonAssertionSet/);
  assert.match(app, /return Eval\.evaluateMeaningRecall\(response, expected\)/);
});

test("profile lesson interaction prompts and required responses stay semantically aligned", () => {
  const byId = new Map(data.lessons.map(item => [item.id, item]));
  const identity = byId.get("lesson:identity-and-unit-numbers");
  const cargo = byId.get("lesson:cargo-pieces-weight-and-seal");
  const documents = byId.get("lesson:driver-and-vehicle-documents");
  for (const profile of ["hotshot-open", "hotshot-enclosed"]) {
    const identityContract = identity.profileInteractionMaterializations[profile];
    assert.deepEqual(identityContract.requiredResponsePhraseIds, ["phrase-1", "phrase-2", "phrase-3", "phrase-4"]);
    assert.match(identityContract.promptEn, /equipment type/i);
    assert.match(identityContract.promptEn, /trailer number/i);

    const cargoContract = cargo.profileInteractionMaterializations[profile];
    assert.deepEqual(cargoContract.requiredResponsePhraseIds, ["phrase-1", "phrase-2", "phrase-3", "phrase-4"]);
    assert.doesNotMatch(cargoContract.promptEn, /seal/i);
    assert.match(cargoContract.promptEn, /VIN/i);

    const documentContract = documents.profileInteractionMaterializations[profile];
    assert.match(documentContract.promptEn, /proof of insurance/i);
    assert.doesNotMatch(documentContract.promptEn, /driver document|CDL/i);
    assert.deepEqual(documentContract.requiredResponsePhraseIds, ["phrase-1", "phrase-2", "phrase-3"]);
  }
});

test("Russian compliance rendering consumes translated steps and date context", () => {
  const requiredIds = new Set([
    "document:medical-examiner-certificate",
    "document:periodic-inspection-package",
    "document:eld-user-manual-locator",
    "document:eld-transfer-instructions",
    "document:eld-malfunction-instructions",
    "document:blank-paper-rods",
    "document:eld-roadside-screen",
    "document:hazmat-shipping-paper",
    "document:roadside-inspection-report",
  ]);
  const compliance = data.documents.filter(item => requiredIds.has(item.id));
  assert.equal(compliance.length, requiredIds.size);
  for (const item of compliance) {
    assert.ok(typeof item.applicabilityRu === "string" && item.applicabilityRu.trim(), item.id);
    assert.ok(typeof item.dateContextRu === "string" && item.dateContextRu.trim(), item.id);
    assert.ok(typeof item.safeActionRu === "string" && item.safeActionRu.trim(), item.id);
    for (const step of Array.isArray(item.instructions) ? item.instructions.filter(value => value && typeof value === "object") : []) {
      assert.ok(typeof step.textRu === "string" && step.textRu.trim(), `${item.id}:translated-instruction`);
    }
  }
  assert.match(app, /item\.dateContextRu/);
  assert.match(app, /value\.textRu \|\| value\.ru \|\| value\.instructionRu/);
});

test("seven cargo reinspection tasks are visible scored questions without changing the 75 prompt corpus", () => {
  assert.equal(data.inspectionQuestions.length, 75);
  assert.equal(data.regulatoryScoredQuestions.length, 7);
  assert.deepEqual(data.cargoReinspectionProgram.scoredQuestionIds, data.regulatoryScoredQuestions.map(item => item.id));
  let evaluatedVariantCount = 0;
  for (const item of data.regulatoryScoredQuestions) {
    assert.ok(item.visibleStimulus && Object.keys(item.visibleStimulus).length >= 3, item.id);
    assert.ok(item.promptDisplay && item.answerDisplay, item.id);
    assert.equal(Eval.evaluateQuestion(item, item.answerDisplay).pass, true, item.id);
    assert.equal(item.practiceContract.schemaVersion, "cycle3-regulatory-typed-v1", item.id);
    assert.deepEqual(item.practiceContract.variantIds, ["primary", "transfer"], item.id);
    assert.equal(item.practiceContract.responseMode, "typed-pre-reveal", item.id);
    assert.equal(item.practiceContract.requireDifferentVariantForConfirmation, true, item.id);
    assert.deepEqual(Object.keys(item.practiceVariants), ["primary", "transfer"], item.id);
    const primary = item.practiceVariants.primary;
    const transfer = item.practiceVariants.transfer;
    for (const [variantId, variant] of Object.entries(item.practiceVariants)) {
      evaluatedVariantCount += 1;
      assert.equal(variant.variantId, variantId, `${item.id}:${variantId}:key`);
      assert.equal(variant.responseMode, "typed-pre-reveal", `${item.id}:${variantId}:typed`);
      assert.equal(variant.visibleStimulus.trainingSample, true, `${item.id}:${variantId}:training`);
      assert.equal(Eval.evaluateQuestion({ ...item, ...variant }, variant.answerDisplay).pass, true, `${item.id}:${variantId}:canonical`);
    }
    assert.notDeepEqual(primary.visibleStimulus, transfer.visibleStimulus, `${item.id}:stimulus`);
    assert.notEqual(primary.promptDisplay, transfer.promptDisplay, `${item.id}:prompt`);
    assert.notEqual(primary.answerDisplay, transfer.answerDisplay, `${item.id}:answer`);
    assert.notDeepEqual(primary.slots, transfer.slots, `${item.id}:slots`);
    assert.notDeepEqual(primary.responseRubric, transfer.responseRubric, `${item.id}:rubric`);
    assert.notEqual(primary.semanticFingerprint, transfer.semanticFingerprint, `${item.id}:fingerprint`);
    assert.equal(Eval.evaluateQuestion({ ...item, ...primary }, transfer.answerDisplay).pass, false, `${item.id}:transfer-answer-on-primary`);
    assert.equal(Eval.evaluateQuestion({ ...item, ...transfer }, primary.answerDisplay).pass, false, `${item.id}:primary-answer-on-transfer`);
  }
  assert.equal(evaluatedVariantCount, 14);
  assert.match(app, /\.\.\.\(Array\.isArray\(DATA\.regulatoryScoredQuestions\)/);
  assert.match(app, /function visibleQuestionStimulus\(item\)/);
  assert.match(app, /function materializeQuestionPractice\(item, mode = questionVariant\)/);
  assert.match(app, /practiceModes\.length/);
  assert.match(app, /TRAINING SAMPLE, NOT VALID/);
});

test("all seven regulatory corrections can close with a spaced fresh transfer instance", () => {
  let now = Date.parse("2026-08-21T12:00:00.000Z");
  const store = State.createStateStore({ storage: new State.MemoryStorage(), courseData: data, storageKey: "regulatory-transfer", now: () => now });
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  for (const [index, item] of data.regulatoryScoredQuestions.entries()) {
    const primary = { ...item, ...item.practiceVariants.primary, id: item.id };
    const transfer = { ...item, ...item.practiceVariants.transfer, id: item.id };
    let result = store.addError(state, { type: "question", id: item.id, text: item.promptDisplay, reason: "Initial miss" });
    assert.equal(result.ok, true, `${item.id}:error`);
    state = result.state;
    const firstAt = now + index * 2 * 24 * 60 * 60 * 1000;
    const makeEvidence = (row, response, variant, at) => ({
      ...Eval.evidenceForEvaluation(Eval.evaluateQuestion(row, response), {
        mode: "question-typed-pre-reveal",
        variant,
        response,
      }),
      at: new Date(at).toISOString(),
    });
    now = firstAt;
    result = store.recordAttempt(state, "questions", item.id, makeEvidence(primary, primary.answerDisplay, "regulatory-primary", firstAt));
    assert.equal(result.ok, true, `${item.id}:primary`);
    assert.notEqual(result.state.errorJournal.find(entry => entry.id === item.id)?.stage, "closed", `${item.id}:not-early`);
    state = result.state;
    now = firstAt + 24 * 60 * 60 * 1000;
    result = store.recordAttempt(state, "questions", item.id, makeEvidence(transfer, transfer.answerDisplay, "regulatory-transfer", now));
    assert.equal(result.ok, true, `${item.id}:transfer`);
    assert.equal(State.isMastered(result.record, { now }), true, `${item.id}:mastery`);
    assert.equal(result.state.errorJournal.find(entry => entry.id === item.id)?.stage, "closed", `${item.id}:closed`);
    state = result.state;
  }
});

test("runtime consumes condition-specific securement question and lesson contracts", () => {
  assert.match(app, /item\.conditionMaterializations/);
  assert.match(app, /const contract = item\.interaction \|\| profileContract \|\| item\.assessmentBlueprint\?\.interaction/);
  assert.match(app, /interaction\.conditionSpecific/);
  assert.match(app, /materializationConflict/);
});

test("condition evidence scope follows the actual materialized branch", () => {
  const source = data.inspectionQuestions.find(item => item.id === "question:how-is-the-cargo-secured");
  const tractorBase = Core.materializeForProfile(source, { profile: "tractor", conditions: { cargoSecurement: true } });
  const tractorWithHotshotWeight = Core.materializeForProfile(source, {
    profile: "tractor",
    conditions: { cargoSecurement: true, vehicleTransport: true, transportedVehicleAtMost10000Lb: true },
  });
  assert.equal(tractorBase.materializedCondition, undefined);
  assert.equal(tractorWithHotshotWeight.materializedCondition, undefined);
  assert.equal(tractorWithHotshotWeight.answerDisplay, tractorBase.answerDisplay);
  const hotshotLow = Core.materializeForProfile(source, {
    profile: "hotshot-open",
    conditions: { cargoSecurement: true, vehicleTransport: true, transportedVehicleAtMost10000Lb: true },
  });
  const hotshotHigh = Core.materializeForProfile(source, {
    profile: "hotshot-open",
    conditions: { cargoSecurement: true, vehicleTransport: true, transportedVehicleOver10000Lb: true },
  });
  assert.notEqual(hotshotLow.materializedCondition, hotshotHigh.materializedCondition);
  assert.notEqual(hotshotLow.answerDisplay, hotshotHigh.answerDisplay);
  assert.match(app, /return typeof materialized\?\.materializedCondition === "string"/);
  assert.match(app, /\? materialized\.materializedCondition\s*:\s*"base"/);
});

test("runtime error binding follows actual cargo profile and securement materialization", () => {
  const day = 24 * 60 * 60 * 1000;
  let now = Date.parse("2026-08-21T12:00:00.000Z") - day;
  const store = State.createStateStore({
    storage: new State.MemoryStorage(),
    courseData: data,
    storageKey: "runtime-materialization-scope",
    now: () => now,
  });
  let state = store.defaultState();
  state.profile = "tractor";
  state.onboardingComplete = true;
  const hauling = data.inspectionQuestions.find(item => item.id === "question:what-are-you-hauling");
  const tractorItem = Core.materializeForProfile(hauling, { profile: "tractor", applicability: state.applicability });
  let result = store.addError(state, {
    type: "question",
    id: hauling.id,
    text: hauling.promptDisplay,
    reason: "Wrong commodity",
  });
  assert.equal(result.ok, true);
  assert.equal(result.record.contextKey, null);
  assert.equal(result.record.semanticBranch, "scope:profile:tractor");
  state = result.state;
  const evidence = (item, variant, at) => ({
    ...Eval.evidenceForEvaluation(Eval.evaluateQuestion(item, item.answerDisplay), {
      mode: "question-typed-pre-reveal",
      variant,
      response: item.answerDisplay,
    }),
    at: new Date(at).toISOString(),
  });
  result = store.recordAttempt(state, "questions", hauling.id, evidence(tractorItem, "profile:tractor|cargo-primary", now));
  assert.equal(result.ok, true);
  state = result.state;
  state.applicability.conditions.hazmat = true;
  now += day;
  result = store.recordAttempt(state, "questions", hauling.id, evidence(tractorItem, "profile:tractor|cargo-transfer", now));
  assert.equal(result.ok, true);
  assert.equal(State.isMastered(result.record, { now }), true);
  assert.equal(result.state.errorJournal.find(item => item.semanticBranch === "scope:profile:tractor").stage, "closed");

  state = result.state;
  state.profile = "hotshot-open";
  result = store.addError(state, {
    type: "question",
    id: hauling.id,
    text: hauling.promptDisplay,
    reason: "Wrong Hotshot commodity",
  });
  assert.equal(result.ok, true);
  assert.equal(result.record.semanticBranch, "scope:profile:hotshot-open");
  assert.equal(result.state.errorJournal.find(item => item.semanticBranch === "scope:profile:tractor").stage, "closed");

  state = result.state;
  Object.assign(state.applicability.conditions, {
    cargo: true,
    cargoSecurement: true,
    vehicleTransport: true,
    transportedVehicleAtMost10000Lb: true,
  });
  const securementId = "question:how-is-the-cargo-secured";
  const lowBinding = store.errorBindingForContent(state, "questions", securementId);
  state.applicability.conditions.transportedVehicleAtMost10000Lb = false;
  state.applicability.conditions.transportedVehicleOver10000Lb = true;
  const highBinding = store.errorBindingForContent(state, "questions", securementId);
  assert.match(lowBinding.semanticBranch, /condition:transported-automobile-or-light-truck-at-most-10000-lb$/);
  assert.match(highBinding.semanticBranch, /condition:transported-automobile-or-light-truck-over-10000-lb$/);
  assert.notEqual(lowBinding.semanticBranch, highBinding.semanticBranch);
});

test("fresh Today metadata is nullable and lesson rollback clears stale audio exposure", () => {
  assert.match(app, /lessonId: lesson\?\.id \?\? null/);
  assert.match(app, /situationId: .*\?\.id \?\? null/);
  assert.match(app, /documentId: .*\?\.id \?\? null/);
  assert.match(app, /if \(key\.startsWith\(`\$\{item\.id\}:`\)\) heardLessonStimuli\.delete\(key\)/);
});

test("a frozen card route keeps its immutable date across New York midnight", () => {
  assert.match(app, /const attemptDate = activeDailyTaskKey && activeDailySessionDate \? activeDailySessionDate : todayKey\(\)/);
  assert.match(app, /attempt\.date === attemptDate/);
  assert.match(app, /date: activeDailyTaskKey \? activeDailySessionDate \|\| todayKey\(\) : todayKey\(\)/);
  assert.match(app, /const allReviewed = focusedCardIds\.every\(reviewedToday\)/);
});

test("Today and lesson restart clear only transient attempt state in a long-lived session", () => {
  assert.match(app, /function clearLessonTransientState\(id\)[\s\S]*lessonEvaluations\.delete\(id\)[\s\S]*heardLessonStimuli/);
  assert.match(app, /function clearDailyTaskTransientState\(task\)[\s\S]*questionEvaluations\.delete\(id\)[\s\S]*signEvaluations\.delete\(id\)[\s\S]*situationEvaluation = null[\s\S]*documentEvaluation = null[\s\S]*clearLessonTransientState\(id\)/);
  assert.match(app, /function openDailyTask\(task\) \{[\s\S]{0,140}clearDailyTaskTransientState\(task\)/);
  assert.match(app, /class="button primary lesson-restart"[^>]*>Начать новую самостоятельную попытку/);
  assert.match(app, /const lessonRestart = event\.target\.closest\("\.lesson-restart"\)[\s\S]{0,500}clearLessonTransientState\(lessonId\)[\s\S]{0,300}\.lesson-response/);
});

test("Today errors freeze and advance only one exact journal target", () => {
  assert.match(app, /function routeDescriptorForTask\(task\)[\s\S]{0,220}task\?\.key === "errors"[\s\S]{0,220}errorTarget/);
  assert.match(app, /errors\.length\)[\s\S]{0,400}errorTarget: errorTargetForRecord\(errors\[0\]\)/);
  assert.match(app, /function openDailyTask\(task\)[\s\S]{0,700}sameErrorTarget\(errorTargetForRecord\(item\), frozenTarget\)[\s\S]{0,100}openErrorItem\(target\)/);
  assert.match(app, /const recoveryAdvanced = Boolean\(evaluation\?\.pass\)[\s\S]{0,220}errorRecoveryAdvanced\(errorBefore, errorAfter, recorded\.evidence\)/);
  assert.match(app, /completed: dailyCompleted/);
  assert.match(app, /recoveryAdvanced \? \{ errorEvidenceAt: recorded\.evidence\.at \} : \{\}/);
  assert.match(app, /function recordErrorDailyCompletion\(recovery, variant\)[\s\S]{0,260}!recovery\?\.matched[\s\S]{0,100}!recovery\.advanced/);
  assert.match(app, /advanceErrorRecovery\("diagnostic"[\s\S]{0,420}recordErrorDailyCompletion\(recovery, evidenceVariant\)/);
  assert.match(app, /const recovery = advanceErrorRecovery\("branching"[\s\S]{0,400}recordErrorDailyCompletion\(recovery, `branch-/);
  assert.doesNotMatch(app, /activeDailyTaskKey === "errors"\) recordStandaloneDailyCompletion/);
});

test("runtime uses distinct factual workplace outcomes and rejects critical-turn replay", () => {
  let checked = 0;
  for (const item of data.situations) {
    for (const variant of item.practiceContract.variants) {
      const outcome = item.practiceContract.workplaceOutcome.expectedByVariant[variant.id];
      const driverLines = variant.dialogue.filter(line => line.semanticRole === "driver").map(line => Eval.normalizeText(line.english));
      assert.ok(outcome.modelAnswer, `${item.id}:${variant.id}`);
      assert.ok(!driverLines.includes(Eval.normalizeText(outcome.modelAnswer)), `${item.id}:${variant.id}: distinct outcome`);
      checked += 1;
    }
  }
  assert.equal(checked, 80);
  assert.match(app, /replayedTurn/);
  assert.match(app, /"distinct-workplace-outcome"/);
});
