(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TruckDriverStateStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STATE_VERSION = 5;
  const SUPPORTED_STATE_VERSIONS = new Set([1, 2, 3, 4, STATE_VERSION]);
  const MASTERY_GAP_MS = 24 * 60 * 60 * 1000;
  const FAILURE_RETRY_MS = 10 * 60 * 1000;
  const MASTERED_REVIEW_MS = 3 * 24 * 60 * 60 * 1000;
  const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
  const MAX_QUARANTINE_RAW = 64 * 1024;
  const MAX_EVIDENCE_PER_BINDING = 20;
  const MAX_EVIDENCE_BINDINGS = 12;
  const MAX_PROGRESS_EVIDENCE = MAX_EVIDENCE_PER_BINDING * MAX_EVIDENCE_BINDINGS;
  const MAX_ERROR_ITEMS = 100;
  const MAX_BRANCH_ITEMS = 32;
  const MAX_ELP_SESSION_IDS = 8;
  const MAX_ELP_ATTEMPTS = 32;
  const MAX_ELP_STEP_TWO_BLUEPRINT_VERSION = 80;
  const MAX_ELP_STEP_TWO_REFERENCE_COUNT = 1000;
  const MAX_DAILY_ATTEMPTS = 120;
  const MAX_SESSION_ORDINAL = 1000000;
  const INITIAL_SESSION_ORDINAL = 1;
  const MAX_QUALIFICATION_CONTEXT_KEY = 4096;
  const MAX_SEMANTIC_BRANCH_KEY = 160;
  const CLOCK_SKEW_MS = 5 * 60 * 1000;
  const SRS_GRADES = Object.freeze({
    again: Object.freeze({ id: "again", grade: "again", label: "Снова · 10 минут", shortLabel: "10 минут", intervalMs: 10 * 60 * 1000, intervalDays: 0, outcome: "failed" }),
    hard: Object.freeze({ id: "hard", grade: "hard", label: "Трудно · 1 день", shortLabel: "1 день", intervalMs: 24 * 60 * 60 * 1000, intervalDays: 1, outcome: "partial" }),
    good: Object.freeze({ id: "good", grade: "good", label: "Хорошо · 3 дня", shortLabel: "3 дня", intervalMs: 3 * 24 * 60 * 60 * 1000, intervalDays: 3, outcome: "success" }),
    easy: Object.freeze({ id: "easy", grade: "easy", label: "Легко · 7 дней", shortLabel: "7 дней", intervalMs: 7 * 24 * 60 * 60 * 1000, intervalDays: 7, outcome: "success" }),
  });

  const PROGRESS_BUCKETS = Object.freeze([
    "words",
    "questions",
    "signs",
    "situations",
    "documents",
    "lessons",
  ]);
  const PROFILE_VALUES = new Set(["tractor", "hotshot-open", "hotshot-enclosed", "both"]);
  const PROFILE_MIGRATIONS = Object.freeze({
    truck: "tractor",
    "tractor-trailer": "tractor",
    hotshot: "hotshot-open",
  });
  const OUTCOMES = new Set(["success", "partial", "failed"]);
  const SUPPORT_VALUES = new Set(["none", "hint", "reveal", "model", "unknown"]);
  const EVIDENCE_KINDS = new Set(["demonstrated", "self-reported", "viewed", "legacy", "imported-unverified"]);
  const RESPONSE_MODES = new Set(["typed", "choice", "keyed", "none"]);
  const OBJECTIVE_EVALUATORS = Object.freeze([
    "exact",
    "normalized-exact",
    "choice-key",
    "semantic-slots",
    "semantic-alternative",
    "numeric-slots",
    "structured-exact",
    "productive-rubric",
    "task-rubric",
    "branch-key",
    "document-field-key",
    "sign-meaning-action",
    "situation-goal",
    "situation-completion-blueprint",
    "lesson-production",
    "lesson-reception-blueprint",
    "lesson-production-interaction-blueprint",
    "card-recall",
  ]);
  const OBJECTIVE_EVALUATOR_VALUES = new Set(OBJECTIVE_EVALUATORS);
  const NON_QUALIFYING_MODES = new Set([
    "situation-read",
    "read",
    "reveal",
    "model",
    "study",
    "listening-exposure",
  ]);
  const QUESTION_RESULTS = new Set(["independent", "prompted", "failed", "viewed", "self-reported"]);
  const DAILY_RESULTS = new Set([...QUESTION_RESULTS, "demonstrated"]);
  const ELP_STATUSES = new Set(["pending", "passed", "failed"]);
  const ELP_STEP_TWO_RESULTS = new Set(["passed", "failed"]);
  const ELP_STEP_ONE_RESET_PREFIX = "elpStepOne restart required:";
  const ELP_STEP_TWO_RESET_PREFIX = "elpStepTwo restart required:";
  const LEGACY_ELP_STEP_ONE_IDS = Object.freeze([
    "question:pull-into-the-inspection-lane",
    "question:where-are-you-coming-from",
    "question:what-are-you-hauling",
    "question:who-do-you-drive-for",
    "question:what-is-your-current-duty-status",
  ]);
  const ERROR_STATUSES = new Set(["open", "corrected-awaiting-confirmation", "confirmation-due", "closed"]);
  const EQUIPMENT_DEFAULTS = Object.freeze({
    airBrakes: false,
    dryVan: false,
    loadBars: false,
  });
  const CONDITION_DEFAULTS = Object.freeze({
    eld: false,
    eldMalfunction: false,
    hazmat: false,
    ifta: false,
    oversizePermit: false,
    cargo: false,
    cargoSecurement: false,
    vehicleTransport: false,
    transportedVehicleAtMost10000Lb: false,
    transportedVehicleOver10000Lb: false,
    tripSpecific: false,
    cdlRequired: false,
    medicalStatusProof: false,
    speVariance: false,
    periodicInspectionProof: false,
    dvir: false,
    scaleTicket: false,
    postInspection: false,
    delivery: false,
    chainsRequired: false,
    registrationRequired: false,
  });
  const MATERIALIZATION_CONDITION_IDS = Object.freeze({
    eld: Object.freeze(["eld-required", "eld-or-rods-applicable"]),
    eldMalfunction: Object.freeze(["eld-malfunction", "eld-required", "eld-or-rods-applicable"]),
    hazmat: Object.freeze(["hazmat", "trip-specific"]),
    ifta: Object.freeze(["ifta-applicable"]),
    oversizePermit: Object.freeze(["oversize-or-overweight", "permit-applicable", "dimension-or-weight-applicable", "trip-specific"]),
    cargo: Object.freeze(["cargo", "trip-specific"]),
    cargoSecurement: Object.freeze(["cargo-securement"]),
    vehicleTransport: Object.freeze(["vehicle-transport"]),
    transportedVehicleAtMost10000Lb: Object.freeze(["transported-automobile-or-light-truck-at-most-10000-lb", "vehicle-transport"]),
    transportedVehicleOver10000Lb: Object.freeze(["transported-automobile-or-light-truck-over-10000-lb", "vehicle-transport"]),
    tripSpecific: Object.freeze(["trip-specific"]),
    cdlRequired: Object.freeze(["cdl-required"]),
    medicalStatusProof: Object.freeze(["medical-status-proof"]),
    speVariance: Object.freeze(["spe-variance", "medical-variance-or-spe-applicable"]),
    periodicInspectionProof: Object.freeze(["periodic-inspection-proof-applicable"]),
    dvir: Object.freeze(["dvir-applicable"]),
    scaleTicket: Object.freeze(["scale-ticket-issued", "dimension-or-weight-applicable", "trip-specific"]),
    postInspection: Object.freeze(["post-inspection"]),
    delivery: Object.freeze(["delivery"]),
    chainsRequired: Object.freeze(["chains-required"]),
    registrationRequired: Object.freeze(["registration-required"]),
  });
  const MATERIALIZATION_CONDITION_IMPLICATIONS = Object.freeze({
    "eld-malfunction": Object.freeze(["eld-required", "eld-or-rods-applicable"]),
    "eld-required": Object.freeze(["eld-or-rods-applicable"]),
    hazmat: Object.freeze(["trip-specific"]),
    "oversize-or-overweight": Object.freeze(["permit-applicable", "dimension-or-weight-applicable", "trip-specific"]),
    "scale-ticket-issued": Object.freeze(["dimension-or-weight-applicable", "trip-specific"]),
    "spe-variance": Object.freeze(["medical-variance-or-spe-applicable"]),
    "transported-automobile-or-light-truck-at-most-10000-lb": Object.freeze(["vehicle-transport"]),
    "transported-automobile-or-light-truck-over-10000-lb": Object.freeze(["vehicle-transport"]),
    "cargo-securement": Object.freeze(["cargo", "trip-specific"]),
    delivery: Object.freeze(["trip-specific"]),
  });
  const MATERIALIZATION_PROFILE_EQUIPMENT = Object.freeze({
    tractor: Object.freeze(["tractor-trailer"]),
    "hotshot-open": Object.freeze(["hotshot", "pickup", "gooseneck", "open-trailer"]),
    "hotshot-enclosed": Object.freeze(["hotshot", "pickup", "gooseneck", "enclosed-trailer"]),
  });
  const MATERIALIZATION_EQUIPMENT_IDS = Object.freeze({
    airBrakes: Object.freeze(["air-brakes"]),
    dryVan: Object.freeze(["dry-van"]),
    loadBars: Object.freeze(["load-bars", "dry-van"]),
  });
  const DEFAULT_DIAGNOSTIC_RECOVERY_TARGETS = Object.freeze([
    "vocabulary-lane",
    "vocabulary-seal",
    "vocabulary-reweigh",
    "vocabulary-shoulder",
    "vocabulary-merge",
    "listening-lane",
    "listening-time",
    "listening-route",
    "elp-origin",
    "elp-cargo",
    "elp-clarify",
    "inspection-oos",
    "inspection-document",
    "inspection-command",
    "vocabulary-oos",
    "vocabulary-overage",
    "vocabulary-securement",
    "vocabulary-clearance",
    "vocabulary-detour",
    "listening-weight",
    "listening-duration",
    "listening-oos-condition",
    "listening-stop-b",
    "listening-pressure-a",
    "listening-pressure-b",
    "elp-destination",
    "elp-carrier",
    "elp-duty",
    "inspection-repeat",
    "inspection-paper",
    "inspection-stop",
  ]);
  const DEFAULT_BRANCH_IDS = Object.freeze(["0", "1", "2", "3", "4"]);
  const DAILY_TASK_TYPES = new Set([
    ...PROGRESS_BUCKETS,
    "due",
    "due-questions",
    "due-signs",
    "due-situations",
    "due-documents",
    "due-lessons",
    "core",
    "truck",
    "hotshot",
    "lesson",
    "situation",
    "document",
    "elp",
    "listening",
    "diagnostic",
    "branching",
    "voice",
    "errors",
    "route",
  ]);
  const ROUTE_TASK_BUCKETS = Object.freeze({
    words: Object.freeze(["words"]),
    questions: Object.freeze(["questions"]),
    signs: Object.freeze(["signs"]),
    situations: Object.freeze(["situations"]),
    documents: Object.freeze(["documents"]),
    lessons: Object.freeze(["lessons"]),
    due: Object.freeze(["words"]),
    "due-questions": Object.freeze(["questions"]),
    "due-signs": Object.freeze(["signs"]),
    "due-situations": Object.freeze(["situations"]),
    "due-documents": Object.freeze(["documents"]),
    "due-lessons": Object.freeze(["lessons"]),
    core: Object.freeze(["words"]),
    truck: Object.freeze(["words"]),
    hotshot: Object.freeze(["words"]),
    lesson: Object.freeze(["lessons"]),
    situation: Object.freeze(["situations"]),
    document: Object.freeze(["documents"]),
    elp: Object.freeze(["questions"]),
    listening: Object.freeze(["questions"]),
    diagnostic: Object.freeze(["words", "questions"]),
    branching: Object.freeze([]),
    voice: Object.freeze([]),
    errors: Object.freeze([]),
    route: Object.freeze([]),
  });
  const ROUTE_SCALAR_TASKS = new Set([
    "due-situations",
    "due-documents",
    "due-lessons",
    "lesson",
    "situation",
    "document",
  ]);
  const MAX_ROUTE_TASKS = 3;
  const MAX_ROUTE_TASK_IDS = 5;
  const ERROR_TYPES = new Set([
    "word",
    "question",
    "sign",
    "situation",
    "document",
    "lesson",
    "diagnostic",
    "branching",
  ]);
  const DIAGNOSTIC_KEYS = new Set([
    "vocabulary",
    "listening",
    "elp",
    "inspection",
    "construct",
    "production",
    "signs",
    "mixed",
  ]);
  const DIAGNOSTIC_CATEGORIES = Object.freeze(["vocabulary", "listening", "elp", "inspection"]);
  const DIAGNOSTIC_CATEGORY_VALUES = new Set(DIAGNOSTIC_CATEGORIES);
  const BUCKET_ALIASES = Object.freeze({
    words: ["words", "word", "units", "unit", "truck"],
    questions: ["questions", "question", "inspectionQuestions", "inspection-questions"],
    signs: ["signs", "sign"],
    situations: ["situations", "situation"],
    documents: ["documents", "document", "docs", "doc"],
    lessons: ["lessons", "lesson"],
  });

  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function boundedInteger(value, minimum, maximum, fallback) {
    if (typeof value !== "number" && typeof value !== "string") return fallback;
    if (typeof value === "string" && !/^-?\d+$/.test(value.trim())) return fallback;
    const number = Number(value);
    if (!Number.isSafeInteger(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, number));
  }

  function boundedNumber(value, minimum, maximum, fallback) {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.min(maximum, Math.max(minimum, value));
  }

  function boundedString(value, maximum, fallback = "") {
    if (typeof value !== "string") return fallback;
    return value
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
      .slice(0, maximum);
  }

  function safeId(value) {
    const id = boundedString(value, 240).trim();
    if (!id || !/^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/.test(id)) return null;
    return id;
  }

  function diagnosticBaseId(value) {
    const id = safeId(value);
    if (!id) return null;
    return safeId(id.replace(/^diagnostic-/, ""));
  }

  function canonicalDiagnosticId(value, allowlist, aliases) {
    const base = diagnosticBaseId(value);
    if (!base) return null;
    const target = aliases?.get(base) || base;
    return allowlist.has(target) ? `diagnostic-${target}` : null;
  }

  function currentTime(options) {
    const source = options && Object.prototype.hasOwnProperty.call(options, "now") ? options.now : Date.now;
    const value = typeof source === "function" ? source() : source;
    const parsed = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : Number(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  function normalizedIso(value, options, allowFuture = true) {
    if (typeof value !== "string" || value.length > 40) return null;
    const milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) return null;
    const year = new Date(milliseconds).getUTCFullYear();
    if (year < 2000 || year > 2200) return null;
    if (!allowFuture && milliseconds > currentTime(options) + CLOCK_SKEW_MS) return null;
    return new Date(milliseconds).toISOString();
  }

  function normalizedDateKey(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    if (year < 2000 || year > 2200) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return value;
  }

  function dateMilliseconds(value) {
    const result = typeof value === "string" ? Date.parse(value) : NaN;
    return Number.isFinite(result) ? result : NaN;
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createNullRecord() {
    return Object.create(null);
  }

  function courseContentVersion(courseData) {
    if (!isPlainObject(courseData)) return 1;
    const migrationVersion = isPlainObject(courseData.idMigrations) ? courseData.idMigrations.targetContentVersion : null;
    return boundedInteger(courseData.contentVersion ?? courseData.version ?? migrationVersion, 1, 1000000, 1);
  }

  function createDefaultState(courseData, options) {
    const now = new Date(currentTime(options)).toISOString();
    const contentVersion = courseContentVersion(courseData);
    return {
      version: STATE_VERSION,
      contentVersion,
      words: createNullRecord(),
      signs: createNullRecord(),
      situations: createNullRecord(),
      documents: createNullRecord(),
      lessons: createNullRecord(),
      questions: createNullRecord(),
      questionAttempts: createNullRecord(),
      errorJournal: [],
      diagnostic: null,
      branchingProgress: createNullRecord(),
      elpGate: null,
      elpStepTwo: null,
      dailyAttempts: [],
      dailyMinutes: 10,
      dailyRefresh: 0,
      sessionOrdinal: INITIAL_SESSION_ORDINAL,
      dailyPlan: null,
      diagnosticFormCursor: 0,
      profile: null,
      applicability: {
        equipment: { ...EQUIPMENT_DEFAULTS },
        conditions: { ...CONDITION_DEFAULTS },
      },
      importTrust: null,
      onboardingComplete: false,
      updatedAt: now,
    };
  }

  function buildAllowlists(courseData) {
    const data = isPlainObject(courseData) ? courseData : {};
    const ids = values => new Set(
      values
        .filter(Array.isArray)
        .flatMap(value => value)
        .map(item => isPlainObject(item) ? safeId(item.id) : null)
        .filter(Boolean),
    );
    const diagnosticItems = [
      ...(Array.isArray(data.diagnosticItemInventory) ? data.diagnosticItemInventory : []),
      ...(Array.isArray(data.diagnosticItems) ? data.diagnosticItems : []),
      ...(Array.isArray(data.diagnosticItemBank) ? data.diagnosticItemBank : []),
      ...(Array.isArray(data.diagnosticForms) ? data.diagnosticForms.flatMap(form => Array.isArray(form && form.items) ? form.items : []) : []),
    ];
    const contentCollections = {
      words: [data.core, data.truck, data.hotshot],
      questions: [data.inspectionQuestions, data.regulatoryScoredQuestions],
      signs: [data.signs],
      situations: [data.situations],
      documents: [data.documents],
      lessons: [data.lessons],
    };
    const sharedErrorBranches = new Map();
    const contextualErrorItems = new Map();
    for (const [bucket, collections] of Object.entries(contentCollections)) {
      for (const item of collections.filter(Array.isArray).flat()) {
        const id = isPlainObject(item) ? safeId(item.id) : null;
        if (!id) continue;
        const contextual = isPlainObject(item.profileMaterializations)
          || isPlainObject(item.conditionMaterializations)
          || isPlainObject(item.profilePhrases)
          || Array.isArray(item.profilePhrases);
        const key = `${bucket}\0${id}`;
        if (contextual) {
          contextualErrorItems.set(key, item);
          sharedErrorBranches.delete(key);
        } else if (!contextualErrorItems.has(key)) {
          sharedErrorBranches.set(key, `shared:${bucket}:${id}`);
        }
      }
    }
    const configuredRecoveryTargets = Array.isArray(data.diagnosticRecoveryTargets)
      ? data.diagnosticRecoveryTargets
      : [];
    const diagnosticIds = new Set(configuredRecoveryTargets.length ? [] : DEFAULT_DIAGNOSTIC_RECOVERY_TARGETS);
    for (const value of configuredRecoveryTargets) {
      const id = diagnosticBaseId(isPlainObject(value) ? value.id : value);
      if (id) diagnosticIds.add(id);
    }
    const diagnosticAliases = new Map();
    for (const id of diagnosticIds) diagnosticAliases.set(id, id);
    const configuredAliases = isPlainObject(data.diagnosticRecoveryAliases)
      ? Object.entries(data.diagnosticRecoveryAliases)
      : [];
    for (const [rawAlias, rawTarget] of configuredAliases) {
      const alias = diagnosticBaseId(rawAlias);
      const target = diagnosticBaseId(rawTarget);
      if (alias && target && diagnosticIds.has(target)) diagnosticAliases.set(alias, target);
    }
    for (const item of diagnosticItems) {
      if (!isPlainObject(item)) continue;
      const alias = diagnosticBaseId(item.id);
      const target = diagnosticBaseId(item.recoveryTargetId || item.category || item.id);
      if (!alias || !target) continue;
      if (!configuredRecoveryTargets.length) diagnosticIds.add(target);
      if (diagnosticIds.has(target)) diagnosticAliases.set(alias, target);
    }
    for (const value of Array.isArray(data.diagnosticItemIds) ? data.diagnosticItemIds : []) {
      const alias = diagnosticBaseId(value);
      if (alias && diagnosticIds.has(alias)) diagnosticAliases.set(alias, alias);
    }
    const branchIds = new Set(DEFAULT_BRANCH_IDS);
    for (const value of Array.isArray(data.branchingIds) ? data.branchingIds : []) {
      const id = safeId(value);
      if (id) branchIds.add(id.replace(/^branch-/, ""));
    }
    for (const [index, item] of (Array.isArray(data.branchingScenarios) ? data.branchingScenarios : []).entries()) {
      const id = isPlainObject(item) ? safeId(item.id) : null;
      branchIds.add((id || String(index)).replace(/^branch-/, ""));
    }
    const signItems = Array.isArray(data.signs) ? data.signs : [];
    const signs = ids([signItems]);
    const configuredStepTwo = Array.isArray(data.elpStepTwoEnglishBearingIds)
      ? data.elpStepTwoEnglishBearingIds
      : Array.isArray(data.elpStepTwoIds) ? data.elpStepTwoIds : null;
    const elpStepTwoSigns = new Set();
    if (configuredStepTwo) {
      for (const value of configuredStepTwo) {
        const id = safeId(value);
        if (id && signs.has(id)) elpStepTwoSigns.add(id);
      }
    } else {
      for (const item of signItems) {
        if (!isPlainObject(item) || item.englishBearing !== true) continue;
        const id = safeId(item.id);
        if (id) elpStepTwoSigns.add(id);
      }
    }
    const configuredStepTwoAttempts = data.elpStepTwoCompletionBlueprint?.requiredScoredAttempts;
    const elpStepTwoRequiredAttempts = Number.isInteger(configuredStepTwoAttempts)
      && configuredStepTwoAttempts > 0
      && configuredStepTwoAttempts <= elpStepTwoSigns.size
      ? configuredStepTwoAttempts
      : elpStepTwoSigns.size;
    const configuredBlueprint = isPlainObject(data.elpStepTwoCompletionBlueprint)
      ? data.elpStepTwoCompletionBlueprint
      : {};
    const configuredBlueprintVersion = boundedString(configuredBlueprint.version, MAX_ELP_STEP_TWO_BLUEPRINT_VERSION).trim();
    const elpStepTwoProvenance = new Map();
    let officialSvgReferenceCount = 0;
    let trainingDmsReferenceCount = 0;
    for (const item of signItems) {
      if (!isPlainObject(item)) continue;
      const id = safeId(item.id);
      if (item.provenance === "fhwa-mutcd-shs") officialSvgReferenceCount += 1;
      if (item.provenance === "training-dms") trainingDmsReferenceCount += 1;
      if (id && elpStepTwoSigns.has(id) && ["fhwa-mutcd-shs", "training-dms"].includes(item.provenance)) {
        elpStepTwoProvenance.set(id, item.provenance);
      }
    }
    const configuredOfficialAttempts = configuredBlueprint.requiredOfficialSvgAttempts;
    const configuredDmsAttempts = configuredBlueprint.requiredTrainingDmsAttempts;
    const elpStepTwoBlueprint = {
      version: configuredBlueprintVersion || "english-bearing-v1",
      requiredScoredAttempts: elpStepTwoRequiredAttempts,
      requiredOfficialSvgAttempts: Number.isInteger(configuredOfficialAttempts) ? configuredOfficialAttempts : 8,
      requiredTrainingDmsAttempts: Number.isInteger(configuredDmsAttempts) ? configuredDmsAttempts : 4,
      referenceCounts: {
        officialSvg: officialSvgReferenceCount,
        trainingDms: trainingDmsReferenceCount,
      },
    };
    const situationErrorIds = new Set();
    for (const item of Array.isArray(data.situations) ? data.situations : []) {
      const id = isPlainObject(item) ? safeId(item.id) : null;
      if (!id) continue;
      situationErrorIds.add(id);
      const dialogue = Array.isArray(item.dialogue) ? item.dialogue : [];
      for (let index = 0; index < dialogue.length; index += 1) situationErrorIds.add(`${id}-${index}`);
    }
    return {
      words: ids([data.core, data.truck, data.hotshot]),
      questions: ids([data.inspectionQuestions, data.regulatoryScoredQuestions]),
      signs,
      situations: ids([data.situations]),
      documents: ids([data.documents]),
      lessons: ids([data.lessons]),
      diagnostic: diagnosticIds,
      diagnosticAliases,
      branching: branchIds,
      elpStepTwoSigns,
      elpStepTwoRequiredAttempts,
      elpStepTwoProvenance,
      elpStepTwoBlueprint,
      situationErrors: situationErrorIds,
      sharedErrorBranches,
      contextualErrorItems,
    };
  }

  function collectionBucket(value) {
    const normalized = boundedString(value, 80).toLowerCase().replace(/[^a-z]/g, "");
    if (["word", "words", "unit", "units", "core", "truck", "hotshot"].includes(normalized)) return "words";
    if (["question", "questions", "inspectionquestion", "inspectionquestions"].includes(normalized)) return "questions";
    if (["sign", "signs"].includes(normalized)) return "signs";
    if (["situation", "situations"].includes(normalized)) return "situations";
    if (["document", "documents", "doc", "docs"].includes(normalized)) return "documents";
    if (["lesson", "lessons"].includes(normalized)) return "lessons";
    return null;
  }

  function inferredSourceBucket(id, fallback) {
    if (/^(question|inspection-question)[-:]/i.test(id)) return "questions";
    if (/^sign[-:]/i.test(id)) return "signs";
    if (/^(situation|hotshot-situation)[-:]/i.test(id)) return "situations";
    if (/^(doc|document)[-:]/i.test(id)) return "documents";
    if (/^lesson[-:]/i.test(id)) return "lessons";
    if (/^(word|unit|core|truck|hotshot)[-:]/i.test(id)) return "words";
    return fallback || null;
  }

  function collectMigrationMaps(courseData) {
    const result = Object.fromEntries(PROGRESS_BUCKETS.map(bucket => [bucket, createNullRecord()]));
    const targets = Object.fromEntries(PROGRESS_BUCKETS.map(bucket => [bucket, createNullRecord()]));
    Object.defineProperty(result, "targets", { value: targets, enumerable: false });
    const root = isPlainObject(courseData) ? courseData.idMigrations : null;
    if (!root) return result;
    const allowlists = buildAllowlists(courseData);
    const visited = new Set();

    function uniqueTargetBucket(id) {
      const matches = PROGRESS_BUCKETS.filter(bucket => allowlists[bucket].has(id));
      return matches.length === 1 ? matches[0] : null;
    }

    function add(sourceBucket, fromValue, toValue, targetBucket) {
      const from = safeId(fromValue);
      const to = safeId(toValue);
      const source = collectionBucket(sourceBucket) || inferredSourceBucket(from || "", targetBucket);
      const target = collectionBucket(targetBucket) || uniqueTargetBucket(to) || source;
      if (!from || !to || !source || !target) return;
      result[source][from] = to;
      targets[source][from] = target;
    }

    function addObjectMap(value, defaultSource) {
      if (!isPlainObject(value)) return;
      for (const [from, descriptor] of Object.entries(value)) {
        if (typeof descriptor === "string") {
          const target = uniqueTargetBucket(descriptor) || defaultSource || inferredSourceBucket(from, null);
          add(defaultSource || inferredSourceBucket(from, target), from, descriptor, target);
          continue;
        }
        if (!isPlainObject(descriptor)) continue;
        const to = descriptor.id || descriptor.to || descriptor.newId;
        const target = descriptor.targetCollection || descriptor.targetBucket || descriptor.collection || uniqueTargetBucket(safeId(to));
        const source = descriptor.sourceCollection || descriptor.sourceBucket || defaultSource || inferredSourceBucket(from, collectionBucket(target));
        add(source, from, to, target);
      }
    }

    function walk(value, depth) {
      if (depth > 8 || value === null || typeof value !== "object" || visited.has(value)) return;
      visited.add(value);
      if (Array.isArray(value)) {
        for (const entry of value.slice(0, 10000)) {
          if (isPlainObject(entry) && (entry.from || entry.oldId)) {
            const source = entry.sourceCollection || entry.sourceBucket || entry.bucket;
            const target = entry.targetCollection || entry.targetBucket || entry.bucket;
            add(source, entry.from || entry.oldId, entry.to || entry.newId || entry.id, target);
          } else {
            walk(entry, depth + 1);
          }
        }
        return;
      }
      for (const [bucket, aliases] of Object.entries(BUCKET_ALIASES)) {
        for (const alias of aliases) addObjectMap(value[alias], bucket);
      }
      if (isPlainObject(value.migrations)) addObjectMap(value.migrations, null);
      if (depth === 0 && !value.migrations) addObjectMap(value, null);
      for (const child of Object.values(value)) walk(child, depth + 1);
    }

    walk(root, 0);
    return result;
  }

  function resolveMigratedRoute(id, sourceBucket, migrations, issues) {
    let currentId = id;
    let currentBucket = sourceBucket;
    const seen = new Set();
    for (let step = 0; step < 32; step += 1) {
      const identity = `${currentBucket}\0${currentId}`;
      if (seen.has(identity)) {
        issues.push(`id migration cycle in ${sourceBucket}: ${id}`);
        return null;
      }
      seen.add(identity);
      const nextId = migrations[currentBucket][currentId];
      if (!nextId) return { id: currentId, bucket: currentBucket };
      const nextBucket = migrations.targets[currentBucket][currentId] || currentBucket;
      currentId = nextId;
      currentBucket = nextBucket;
    }
    issues.push(`id migration chain too long in ${sourceBucket}: ${id}`);
    return null;
  }

  function normalizeOutcome(value) {
    if (value === "fail" || value === "again") return "failed";
    if (value === "hard" || value === "prompted" || value === "viewed") return "partial";
    if (value === "good" || value === "easy" || value === "independent") return "success";
    return OUTCOMES.has(value) ? value : null;
  }

  function normalizeProfile(value) {
    if (PROFILE_VALUES.has(value)) return value;
    return PROFILE_MIGRATIONS[value] || null;
  }

  function normalizeBooleanSettings(value, defaults, issues, label) {
    const result = { ...defaults };
    if (value === undefined || value === null) return result;
    if (!isPlainObject(value)) {
      if (issues) issues.push(`${label} must be an object`);
      return result;
    }
    for (const key of Object.keys(defaults)) result[key] = value[key] === true;
    for (const key of Object.keys(value)) {
      if (!Object.prototype.hasOwnProperty.call(defaults, key) && issues) issues.push(`unknown ${label} key: ${boundedString(key, 80, "invalid")}`);
    }
    if (label === "equipment" && !result.dryVan) result.loadBars = false;
    if (label === "conditions" && result.transportedVehicleAtMost10000Lb && result.transportedVehicleOver10000Lb) {
      result.transportedVehicleAtMost10000Lb = false;
      result.transportedVehicleOver10000Lb = false;
      if (issues) issues.push("transported vehicle weight conditions are mutually exclusive");
    }
    return result;
  }

  function normalizeEquipment(value, issues) {
    return normalizeBooleanSettings(value, EQUIPMENT_DEFAULTS, issues, "equipment");
  }

  function normalizeConditions(value, issues) {
    return normalizeBooleanSettings(value, CONDITION_DEFAULTS, issues, "conditions");
  }

  function normalizeApplicability(value, legacyEquipment, legacyConditions, issues) {
    const source = isPlainObject(value) ? value : {};
    if (value !== undefined && value !== null && !isPlainObject(value) && issues) issues.push("applicability must be an object");
    if (isPlainObject(value)) {
      for (const key of Object.keys(value)) {
        if (!["equipment", "conditions"].includes(key) && issues) issues.push(`unknown applicability key: ${boundedString(key, 80, "invalid")}`);
      }
    }
    return {
      equipment: normalizeEquipment(source.equipment ?? legacyEquipment, issues),
      conditions: normalizeConditions(source.conditions ?? legacyConditions, issues),
    };
  }

  function qualificationContextKey(profile, applicability) {
    const normalizedProfile = normalizeProfile(profile);
    if (!normalizedProfile) return null;
    const normalizedApplicability = normalizeApplicability(applicability, null, null, []);
    return JSON.stringify({ profile: normalizedProfile, applicability: normalizedApplicability });
  }

  function canonicalQualificationContextKey(value) {
    if (typeof value !== "string"
      || value.length > MAX_QUALIFICATION_CONTEXT_KEY
      || boundedString(value, MAX_QUALIFICATION_CONTEXT_KEY).trim() !== value) return null;
    try {
      const parsed = JSON.parse(value);
      if (!isPlainObject(parsed)
        || Object.keys(parsed).some(key => !["profile", "applicability"].includes(key))
        || !Object.prototype.hasOwnProperty.call(parsed, "profile")
        || !Object.prototype.hasOwnProperty.call(parsed, "applicability")
        || !isPlainObject(parsed.applicability)) return null;
      const canonical = qualificationContextKey(parsed.profile, parsed.applicability);
      return canonical === value ? canonical : null;
    } catch (_) {
      return null;
    }
  }

  function canonicalSemanticBranch(value) {
    if (value === undefined || value === null || value === "") return null;
    const branch = boundedString(value, MAX_SEMANTIC_BRANCH_KEY).trim();
    return branch === value && /^[a-zA-Z0-9][a-zA-Z0-9:._/|=-]*$/.test(branch) ? branch : null;
  }

  function materializationProfile(profile) {
    const normalized = normalizeProfile(profile);
    return normalized === "both" ? "tractor" : normalized;
  }

  function usesProfileMaterialization(item) {
    return Boolean(isPlainObject(item?.profileMaterializations)
      || isPlainObject(item?.profilePhrases)
      || Array.isArray(item?.profilePhrases));
  }

  function usesConditionMaterialization(item) {
    return isPlainObject(item?.conditionMaterializations);
  }

  function enabledMaterializationContext(profile, applicability) {
    const effectiveProfile = materializationProfile(profile);
    const normalized = normalizeApplicability(applicability, null, null, []);
    const conditions = new Set();
    for (const [setting, ids] of Object.entries(MATERIALIZATION_CONDITION_IDS)) {
      if (normalized.conditions[setting] === true) ids.forEach(id => conditions.add(id));
    }
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const id of [...conditions]) {
        for (const implied of MATERIALIZATION_CONDITION_IMPLICATIONS[id] || []) {
          if (conditions.has(implied)) continue;
          conditions.add(implied);
          expanded = true;
        }
      }
    }
    const equipment = new Set(MATERIALIZATION_PROFILE_EQUIPMENT[effectiveProfile] || []);
    for (const [setting, ids] of Object.entries(MATERIALIZATION_EQUIPMENT_IDS)) {
      if (normalized.equipment[setting] === true) ids.forEach(id => equipment.add(id));
    }
    return { profile: effectiveProfile, conditions, equipment };
  }

  function overlayAppliesToMaterialization(overlay, context) {
    if (!isPlainObject(overlay) || !context.profile) return false;
    const profiles = Array.isArray(overlay.profiles) ? overlay.profiles.map(normalizeProfile).filter(Boolean) : [];
    if (profiles.length && !profiles.includes(context.profile) && !profiles.includes("both")) return false;
    const conditions = Array.isArray(overlay.conditions) ? overlay.conditions : [];
    if (conditions.some(id => !context.conditions.has(String(id)) && !context.equipment.has(String(id)))) return false;
    const equipment = [
      ...(Array.isArray(overlay.equipment) ? overlay.equipment : []),
      ...(Array.isArray(overlay.requiredEquipment) ? overlay.requiredEquipment : []),
    ];
    return equipment.every(id => context.equipment.has(String(id)));
  }

  function activeMaterializationCondition(item, profile, applicability) {
    if (!usesConditionMaterialization(item)) return null;
    const context = enabledMaterializationContext(profile, applicability);
    const active = Object.entries(item.conditionMaterializations).filter(([conditionId, overlay]) => (
      context.conditions.has(conditionId)
      && overlayAppliesToMaterialization(overlay, context)
    ));
    if (active.length > 1) return "conflict";
    return active[0]?.[0] || "base";
  }

  function materializationScopeBranch(item, profile, applicability) {
    if (!isPlainObject(item) || (!usesProfileMaterialization(item) && !usesConditionMaterialization(item))) return null;
    const parts = [];
    if (usesProfileMaterialization(item)) {
      const effectiveProfile = materializationProfile(profile);
      if (!effectiveProfile) return null;
      parts.push(`profile:${effectiveProfile}`);
    }
    if (usesConditionMaterialization(item)) {
      const condition = activeMaterializationCondition(item, profile, applicability);
      if (!condition) return null;
      parts.push(`condition:${condition}`);
    }
    return canonicalSemanticBranch(`scope:${parts.join("|")}`);
  }

  function allowedMaterializationScopeBranches(item) {
    if (!isPlainObject(item) || (!usesProfileMaterialization(item) && !usesConditionMaterialization(item))) return new Set();
    const profiles = usesProfileMaterialization(item)
      ? ["tractor", "hotshot-open", "hotshot-enclosed"]
      : [null];
    const conditions = usesConditionMaterialization(item)
      ? ["base", ...Object.keys(item.conditionMaterializations), ...(Object.keys(item.conditionMaterializations).length > 1 ? ["conflict"] : [])]
      : [null];
    const scopes = new Set();
    for (const profile of profiles) {
      for (const condition of conditions) {
        const overlay = condition && !["base", "conflict"].includes(condition)
          ? item.conditionMaterializations[condition]
          : null;
        if (profile && Array.isArray(overlay?.profiles)) {
          const allowedProfiles = overlay.profiles.map(normalizeProfile).filter(Boolean);
          if (allowedProfiles.length && !allowedProfiles.includes(profile) && !allowedProfiles.includes("both")) continue;
        }
        const parts = [];
        if (profile) parts.push(`profile:${profile}`);
        if (condition) parts.push(`condition:${condition}`);
        const scope = canonicalSemanticBranch(`scope:${parts.join("|")}`);
        if (scope) scopes.add(scope);
      }
    }
    return scopes;
  }

  function qualificationContextValue(contextKey) {
    const canonical = canonicalQualificationContextKey(contextKey);
    if (!canonical) return null;
    try {
      return JSON.parse(canonical);
    } catch (_) {
      return null;
    }
  }

  function legacyMaterializationBranch(item, bucket, profile, applicability) {
    const condition = activeMaterializationCondition(item, profile, applicability);
    if (!condition || ["base", "conflict"].includes(condition)) return null;
    const branchId = canonicalSemanticBranch(item.conditionMaterializations?.[condition]?.branchId);
    return branchId ? `${bucket}:${branchId}` : null;
  }

  function errorBindingForContent(state, bucket, id, allowlists) {
    const key = `${bucket}\0${id}`;
    const sharedBranch = allowlists.sharedErrorBranches?.get(key) || null;
    if (sharedBranch) return { contextKey: null, semanticBranch: sharedBranch, kind: "shared" };
    const item = allowlists.contextualErrorItems?.get(key) || null;
    if (item) {
      const semanticBranch = materializationScopeBranch(item, state?.profile, state?.applicability);
      if (!semanticBranch) return null;
      return { contextKey: null, semanticBranch, kind: "materialization" };
    }
    const contextKey = qualificationContextKey(state?.profile, state?.applicability);
    return contextKey ? { contextKey, semanticBranch: null, kind: "qualification" } : null;
  }

  function qualificationBinding(raw, sourceVersion, options) {
    const rawProfile = raw?.profile;
    const profile = normalizeProfile(rawProfile);
    const rawContextKey = typeof raw?.contextKey === "string" && raw.contextKey.length <= MAX_QUALIFICATION_CONTEXT_KEY
      ? raw.contextKey
      : null;
    const contextKey = rawContextKey && boundedString(rawContextKey, MAX_QUALIFICATION_CONTEXT_KEY).trim() === rawContextKey
      ? rawContextKey
      : null;
    const expectedProfile = normalizeProfile(options?.qualificationProfile);
    const expectedContextKey = boundedString(options?.qualificationContextKey, MAX_QUALIFICATION_CONTEXT_KEY).trim() || null;
    return {
      profile,
      contextKey,
      bound: sourceVersion === STATE_VERSION
        && PROFILE_VALUES.has(rawProfile)
        && Boolean(profile && contextKey && expectedProfile && expectedContextKey)
        && profile === expectedProfile
        && contextKey === expectedContextKey,
    };
  }

  function normalizeEvidence(value, options) {
    if (!isPlainObject(value)) return null;
    const at = normalizedIso(value.at, options, false);
    const outcome = normalizeOutcome(value.outcome || value.result || value.grade);
    if (!at || !outcome) return null;
    const mode = boundedString(value.mode, 64).trim().toLowerCase();
    const independent = value.independent === true;
    const requestedSupport = boundedString(value.support, 24).toLowerCase();
    const support = SUPPORT_VALUES.has(requestedSupport) ? requestedSupport : independent ? "none" : "unknown";
    const requestedKind = boundedString(value.kind, 32).toLowerCase();
    let kind = EVIDENCE_KINDS.has(requestedKind)
      ? requestedKind
      : value.legacy === true
        ? "legacy"
        : value.viewed === true || NON_QUALIFYING_MODES.has(mode) || ["reveal", "model"].includes(support)
          ? "viewed"
          : "self-reported";
    const requestedResponseMode = boundedString(value.responseMode || value.inputMode, 24).toLowerCase();
    const responseMode = RESPONSE_MODES.has(requestedResponseMode) ? requestedResponseMode : "none";
    const evaluator = boundedString(value.evaluator, 64).trim().toLowerCase();
    const requestedGrade = Object.prototype.hasOwnProperty.call(SRS_GRADES, value.grade) ? value.grade : null;
    const grade = outcome === "failed" && requestedGrade !== "again" ? null : requestedGrade;
    const normalized = {
      at,
      outcome,
      independent,
      support,
      mode,
      variant: boundedString(value.variant, 128).trim(),
      kind,
      objective: value.objective === true,
      blind: value.blind === true && value.revealedBefore !== true && value.modelVisible !== true,
      productive: value.productive === true,
      preReveal: value.preReveal === true && value.revealedBefore !== true && value.modelVisible !== true,
      evaluator,
      responseMode,
      response: boundedString(value.response, 400).trim(),
      responseHash: boundedString(value.responseHash, 128).trim(),
      grade,
      legacy: value.legacy === true || kind === "legacy",
    };
    const contextKey = canonicalQualificationContextKey(value.contextKey);
    const semanticBranch = canonicalSemanticBranch(value.semanticBranch);
    if (contextKey) normalized.contextKey = contextKey;
    if (semanticBranch) normalized.semanticBranch = semanticBranch;
    if (normalized.legacy) normalized.kind = "legacy";
    if (normalized.kind === "viewed") {
      normalized.objective = false;
      normalized.blind = false;
      normalized.preReveal = false;
    }
    if (normalized.kind === "imported-unverified") {
      normalized.independent = false;
      normalized.objective = false;
      normalized.blind = false;
      normalized.productive = false;
      normalized.preReveal = false;
      normalized.legacy = false;
    }
    if (normalized.kind === "demonstrated" && !isObjectiveAttemptEvidence(normalized)) {
      normalized.kind = NON_QUALIFYING_MODES.has(mode) || ["reveal", "model"].includes(support) ? "viewed" : "self-reported";
      normalized.objective = false;
    }
    return normalized;
  }

  function evidenceIdentity(item) {
    return [
      item.at,
      item.outcome,
      item.independent,
      item.support,
      item.mode,
      item.variant,
      item.kind,
      item.objective,
      item.blind,
      item.productive,
      item.preReveal,
      item.evaluator,
      item.responseMode,
      item.response,
      item.responseHash,
      item.grade,
      item.legacy,
      item.contextKey,
      item.semanticBranch,
    ].join("\0");
  }

  function evidenceBindingKey(item) {
    const variant = boundedString(item?.variant, 128).trim();
    const prefix = variant.match(/^(?:(?:profile|condition):[^|]+\|)+/)?.[0] || "";
    return `${prefix}\0${canonicalSemanticBranch(item?.semanticBranch) || ""}`;
  }

  function normalizeEvidenceList(values, options) {
    if (!Array.isArray(values)) return [];
    const unique = new Map();
    for (const value of values.slice(-MAX_PROGRESS_EVIDENCE * 4)) {
      const item = normalizeEvidence(value, options);
      if (item) unique.set(evidenceIdentity(item), item);
    }
    const bindings = new Map();
    for (const item of unique.values()) {
      const key = evidenceBindingKey(item);
      if (!bindings.has(key)) bindings.set(key, []);
      bindings.get(key).push(item);
    }
    return [...bindings.values()]
      .map(items => items.sort((left, right) => dateMilliseconds(left.at) - dateMilliseconds(right.at)).slice(-MAX_EVIDENCE_PER_BINDING))
      .sort((left, right) => dateMilliseconds(left.at(-1)?.at) - dateMilliseconds(right.at(-1)?.at))
      .slice(-MAX_EVIDENCE_BINDINGS)
      .flat()
      .sort((left, right) => dateMilliseconds(left.at) - dateMilliseconds(right.at));
  }

  function isObjectiveAttemptEvidence(item) {
    return Boolean(item
      && item.kind === "demonstrated"
      && item.objective === true
      && item.blind === true
      && item.productive === true
      && item.preReveal === true
      && item.support === "none"
      && !item.legacy
      && !NON_QUALIFYING_MODES.has(item.mode)
      && OBJECTIVE_EVALUATOR_VALUES.has(item.evaluator)
      && ["typed", "choice", "keyed"].includes(item.responseMode)
      && ((typeof item.response === "string" && item.response.trim().length > 0)
        || (typeof item.responseHash === "string" && /^[a-zA-Z0-9:_-]{8,128}$/.test(item.responseHash)))
      && typeof item.variant === "string"
      && item.variant.trim().length > 0);
  }

  function isQualifyingEvidence(item) {
    return Boolean(isObjectiveAttemptEvidence(item)
      && item.outcome === "success"
      && item.independent === true);
  }

  function qualifyingSuccesses(evidence) {
    return evidence.filter(isQualifyingEvidence);
  }

  function validMasteryPair(values, options) {
    if (!Array.isArray(values) || values.length !== 2) return null;
    const pair = values.map(value => normalizeEvidence(value, options));
    if (pair.some(value => !isQualifyingEvidence(value))) return null;
    if (evidenceBindingKey(pair[0]) !== evidenceBindingKey(pair[1])) return null;
    pair.sort((left, right) => dateMilliseconds(left.at) - dateMilliseconds(right.at));
    if (pair[0].variant === pair[1].variant) return null;
    if (dateMilliseconds(pair[1].at) - dateMilliseconds(pair[0].at) < MASTERY_GAP_MS) return null;
    return pair;
  }

  function isMasteryInvalidatingEvidence(item) {
    if (!item || item.kind === "imported-unverified" || item.legacy === true) return false;
    if (item.outcome === "failed") return true;
    if (item.kind === "demonstrated" && item.outcome !== "success") return true;
    if (["hint", "reveal", "model"].includes(item.support)) return true;
    return ["reveal", "model"].includes(item.mode);
  }

  function latestInvalidationAt(evidence, storedAt, options) {
    const candidates = [];
    const stored = normalizedIso(storedAt, options, false);
    if (stored) candidates.push(stored);
    for (const item of evidence) {
      if (isMasteryInvalidatingEvidence(item)) candidates.push(item.at);
    }
    return candidates.sort((left, right) => dateMilliseconds(right) - dateMilliseconds(left))[0] || null;
  }

  function deriveAnyMasteryProof(evidence, storedProof, options) {
    const preserved = validMasteryPair(storedProof, options);
    if (preserved) return preserved;
    const candidates = new Map();
    for (const item of evidence) {
      if (isQualifyingEvidence(item)) candidates.set(evidenceIdentity(item), item);
    }
    const successes = [...candidates.values()].sort((left, right) => dateMilliseconds(left.at) - dateMilliseconds(right.at));
    for (let later = 1; later < successes.length; later += 1) {
      const laterAt = dateMilliseconds(successes[later].at);
      for (let earlier = 0; earlier < later; earlier += 1) {
        if (evidenceBindingKey(successes[earlier]) !== evidenceBindingKey(successes[later])) continue;
        if (successes[earlier].variant === successes[later].variant) continue;
        if (laterAt - dateMilliseconds(successes[earlier].at) >= MASTERY_GAP_MS) return [successes[earlier], successes[later]];
      }
    }
    return null;
  }

  function deriveMasteryProof(evidence, storedProof, invalidatedAt, options) {
    const cutoff = dateMilliseconds(invalidatedAt);
    const preserved = validMasteryPair(storedProof, options);
    if (preserved && (!Number.isFinite(cutoff) || preserved.every(item => dateMilliseconds(item.at) > cutoff))) return preserved;
    const eligible = Number.isFinite(cutoff)
      ? evidence.filter(item => dateMilliseconds(item.at) > cutoff)
      : evidence;
    return deriveAnyMasteryProof(eligible, [], options);
  }

  function deriveMasteredAt(evidence, storedProof, invalidatedAt, options) {
    const proof = deriveMasteryProof(evidence, storedProof, invalidatedAt, options);
    return proof ? proof[1].at : null;
  }

  function makeLegacyEvidence(record, sourceVersion, options) {
    if (sourceVersion >= STATE_VERSION || !isPlainObject(record)) return [];
    const evidence = [];
    const completedAt = normalizedIso(record.completedAt, options, false);
    const lastReviewed = normalizedIso(record.lastReviewed || record.lastAttemptAt, options, false);
    const grade = boundedString(record.lastGrade || record.lastResult, 24).toLowerCase();
    if (completedAt) {
      evidence.push({
        at: completedAt,
        outcome: "success",
        independent: true,
        support: "none",
        mode: "legacy",
        variant: "",
        kind: "legacy",
        objective: false,
        blind: false,
        productive: false,
        preReveal: false,
        evaluator: "",
        responseMode: "none",
        response: "",
        responseHash: "",
        grade: null,
        legacy: true,
      });
    }
    if (!completedAt && lastReviewed && grade) {
      const outcome = normalizeOutcome(grade);
      if (outcome) {
        evidence.push({
          at: lastReviewed,
          outcome,
          independent: outcome === "success",
          support: outcome === "success" ? "none" : grade === "prompted" ? "hint" : "unknown",
          mode: "legacy",
          variant: "",
          kind: "legacy",
          objective: false,
          blind: false,
          productive: false,
          preReveal: false,
          evaluator: "",
          responseMode: "none",
          response: "",
          responseHash: "",
          grade: null,
          legacy: true,
        });
      }
    }
    return evidence;
  }

  function schedulerIntervalForEvidence(evidence, masteredAt) {
    if (evidence && evidence.grade && SRS_GRADES[evidence.grade]) return SRS_GRADES[evidence.grade].intervalMs;
    if (!evidence || evidence.outcome !== "success" || !isQualifyingEvidence(evidence)) return FAILURE_RETRY_MS;
    return masteredAt ? MASTERED_REVIEW_MS : MASTERY_GAP_MS;
  }

  function scheduleForEvidence(evidence, masteredAt) {
    if (!evidence) return null;
    const intervalMs = schedulerIntervalForEvidence(evidence, masteredAt);
    const grade = evidence.grade && SRS_GRADES[evidence.grade] ? evidence.grade : null;
    return {
      grade,
      label: grade ? SRS_GRADES[grade].label : evidence.outcome === "success" ? "Проверка" : "Повторить",
      intervalMs,
      dueAt: new Date(dateMilliseconds(evidence.at) + intervalMs).toISOString(),
    };
  }

  function deriveNextDueAt(evidence, masteredAt, lastGrade, lastReviewed, suppliedDueAt, options, forceLegacyDue) {
    const now = currentTime(options);
    if (forceLegacyDue && evidence.length) return new Date(now).toISOString();
    const last = evidence[evidence.length - 1];
    if (last?.legacy) {
      const supplied = normalizedIso(suppliedDueAt, options, true);
      if (supplied) return supplied;
    }
    if (lastGrade && lastReviewed) {
      return new Date(dateMilliseconds(lastReviewed) + SRS_GRADES[lastGrade].intervalMs).toISOString();
    }
    if (!last) return null;
    return scheduleForEvidence(last, masteredAt).dueAt;
  }

  function normalizeProgressRecord(record, sourceVersion, options) {
    if (!isPlainObject(record)) return null;
    let evidence = normalizeEvidenceList(record.evidence, options);
    let legacyAdded = false;
    if (!evidence.length) {
      const legacy = makeLegacyEvidence(record, sourceVersion, options);
      if (legacy.length) {
        evidence = normalizeEvidenceList(legacy, options);
        legacyAdded = true;
      }
    }
    if (!evidence.length) return null;
    const previousProof = validMasteryPair(record.masteryProof, options);
    const masteryInvalidatedAt = latestInvalidationAt(evidence, record.masteryInvalidatedAt, options);
    const masteryProof = deriveMasteryProof(evidence, record.masteryProof, masteryInvalidatedAt, options);
    const masteredAt = masteryProof ? masteryProof[1].at : null;
    const successes = qualifyingSuccesses(evidence);
    const demonstratedSuccessCount = Math.max(successes.length, masteryProof ? masteryProof.length : 0);
    const viewedCount = evidence.filter(item => item.kind === "viewed").length;
    const selfReportedSuccessCount = evidence.filter(item => item.kind === "self-reported" && item.outcome === "success").length;
    const legacyCompletedAt = normalizedIso(record.legacyCompletedAt || (sourceVersion < 4 ? record.completedAt : null), options, false);
    const lastReviewed = normalizedIso(record.lastReviewed, options, false) || evidence[evidence.length - 1].at;
    const lastEvidence = evidence[evidence.length - 1];
    const lastGradeRaw = boundedString(lastEvidence.grade || record.lastGrade, 24).toLowerCase();
    const lastGrade = Object.prototype.hasOwnProperty.call(SRS_GRADES, lastGradeRaw)
      && !(lastEvidence.outcome === "failed" && lastGradeRaw !== "again")
      ? lastGradeRaw
      : null;
    const nextDueAt = deriveNextDueAt(
      evidence,
      masteredAt,
      lastGrade,
      lastReviewed,
      record.nextDueAt || record.dueAt,
      options,
      legacyAdded,
    );
    const intervalMs = lastGrade ? SRS_GRADES[lastGrade].intervalMs : lastEvidence ? schedulerIntervalForEvidence(lastEvidence, masteredAt) : 0;
    const storedFirstEvidenceAt = normalizedIso(record.firstEvidenceAt, options, false);
    const storedHistoricalMasteredAt = normalizedIso(record.historicalMasteredAt, options, false);
    const historicalMasteredAt = [storedHistoricalMasteredAt, previousProof?.[1]?.at, masteredAt]
      .filter(Boolean)
      .sort((left, right) => dateMilliseconds(right) - dateMilliseconds(left))[0] || null;
    const candidateFirstTimes = [storedFirstEvidenceAt, evidence[0]?.at, masteryProof?.[0]?.at]
      .filter(Boolean)
      .sort((left, right) => dateMilliseconds(left) - dateMilliseconds(right));
    const normalized = {
      evidence,
      masteryProof: masteryProof || [],
      successCount: demonstratedSuccessCount,
      demonstratedSuccessCount,
      selfReportedSuccessCount,
      viewedCount,
      firstEvidenceAt: candidateFirstTimes[0] || evidence[0].at,
      lastAttemptAt: lastEvidence.at,
      masteredAt,
      completedAt: masteredAt,
      historicalMasteredAt,
      masteryInvalidatedAt,
      nextDueAt,
      dueAt: nextDueAt,
      lastReviewed,
      repetitions: boundedInteger(record.repetitions, 0, 100000, demonstratedSuccessCount),
      intervalDays: Math.floor(intervalMs / MASTERY_GAP_MS),
    };
    if (legacyCompletedAt) normalized.legacyCompletedAt = legacyCompletedAt;
    if (lastGrade) normalized.lastGrade = lastGrade;
    return normalized;
  }

  function mergeProgressRecords(left, right, options) {
    if (!left) return right;
    if (!right) return left;
    const evidence = normalizeEvidenceList([...(left.evidence || []), ...(right.evidence || [])], options);
    const latest = dateMilliseconds(left.lastAttemptAt) >= dateMilliseconds(right.lastAttemptAt) ? left : right;
    return normalizeProgressRecord({
      ...latest,
      evidence,
      masteryProof: validMasteryPair(left.masteryProof, options) || validMasteryPair(right.masteryProof, options) || [],
      historicalMasteredAt: [left.historicalMasteredAt, right.historicalMasteredAt]
        .filter(Boolean)
        .sort((a, b) => dateMilliseconds(b) - dateMilliseconds(a))[0] || null,
      masteryInvalidatedAt: [left.masteryInvalidatedAt, right.masteryInvalidatedAt]
        .filter(Boolean)
        .sort((a, b) => dateMilliseconds(b) - dateMilliseconds(a))[0] || null,
      legacyCompletedAt: left.legacyCompletedAt || right.legacyCompletedAt,
      firstEvidenceAt: [left.firstEvidenceAt, right.firstEvidenceAt]
        .filter(Boolean)
        .sort((a, b) => dateMilliseconds(a) - dateMilliseconds(b))[0],
      nextDueAt: null,
      dueAt: null,
    }, STATE_VERSION, options);
  }

  function normalizeProgressBuckets(input, sourceVersion, allowlists, migrations, issues, options) {
    const result = Object.fromEntries(PROGRESS_BUCKETS.map(bucket => [bucket, createNullRecord()]));
    for (const sourceBucket of PROGRESS_BUCKETS) {
      const raw = input[sourceBucket];
      if (raw === undefined || raw === null) continue;
      if (!isPlainObject(raw)) {
        issues.push(`${sourceBucket} must be an object`);
        continue;
      }
      const maximum = Math.max(allowlists[sourceBucket].size * 2, 32);
      for (const [rawId, rawRecord] of Object.entries(raw).slice(0, maximum)) {
        const id = safeId(rawId);
        const route = id ? resolveMigratedRoute(id, sourceBucket, migrations, issues) : null;
        if (!route || !allowlists[route.bucket].has(route.id)) {
          issues.push(`unknown ${sourceBucket} id: ${boundedString(rawId, 120, "invalid")}`);
          continue;
        }
        const record = normalizeProgressRecord(rawRecord, sourceVersion, options);
        if (!record) {
          issues.push(`invalid ${sourceBucket} record: ${route.id}`);
          continue;
        }
        result[route.bucket][route.id] = mergeProgressRecords(result[route.bucket][route.id], record, options);
      }
    }
    return result;
  }

  function normalizeQuestionAttempts(raw, allowlist, migrations, issues, options) {
    const result = createNullRecord();
    if (raw === undefined || raw === null) return result;
    if (!isPlainObject(raw)) {
      issues.push("questionAttempts must be an object");
      return result;
    }
    for (const [rawId, value] of Object.entries(raw).slice(0, Math.max(allowlist.size * 2, 32))) {
      const id = safeId(rawId);
      const route = id ? resolveMigratedRoute(id, "questions", migrations, issues) : null;
      const migrated = route && route.bucket === "questions" ? route.id : null;
      if (!migrated || !allowlist.has(migrated) || !isPlainObject(value)) {
        issues.push(`invalid questionAttempts record: ${boundedString(rawId, 120, "invalid")}`);
        continue;
      }
      const lastResult = QUESTION_RESULTS.has(value.lastResult) ? value.lastResult : null;
      const lastAttemptAt = normalizedIso(value.lastAttemptAt, options, false);
      const record = {
        independent: boundedInteger(value.independent, 0, 100000, 0),
        prompted: boundedInteger(value.prompted, 0, 100000, 0),
        failed: boundedInteger(value.failed, 0, 100000, 0),
        viewed: boundedInteger(value.viewed, 0, 100000, 0),
        selfReported: boundedInteger(value.selfReported, 0, 100000, 0),
        lastResult,
        lastAttemptAt,
      };
      const previous = result[migrated];
      if (!previous) {
        result[migrated] = record;
        continue;
      }
      const newer = dateMilliseconds(record.lastAttemptAt) >= dateMilliseconds(previous.lastAttemptAt) ? record : previous;
      result[migrated] = {
        independent: boundedInteger(previous.independent + record.independent, 0, 100000, 0),
        prompted: boundedInteger(previous.prompted + record.prompted, 0, 100000, 0),
        failed: boundedInteger(previous.failed + record.failed, 0, 100000, 0),
        viewed: boundedInteger(previous.viewed + record.viewed, 0, 100000, 0),
        selfReported: boundedInteger(previous.selfReported + record.selfReported, 0, 100000, 0),
        lastResult: newer.lastResult,
        lastAttemptAt: newer.lastAttemptAt,
      };
    }
    return result;
  }

  function questionAttemptEvidence(record, options) {
    if (!record || !record.lastAttemptAt) return null;
    let result = record.lastResult;
    if (!result) {
      if (record.independent > 0) result = "independent";
      else if (record.prompted > 0) result = "prompted";
      else if (record.failed > 0) result = "failed";
      else if (record.viewed > 0) result = "viewed";
      else if (record.selfReported > 0) result = "self-reported";
    }
    if (!result) return null;
    return normalizeEvidence({
      at: record.lastAttemptAt,
      outcome: result,
      independent: result === "independent",
      support: result === "independent" ? "none" : result === "prompted" ? "hint" : "unknown",
      mode: "legacy-question",
      kind: "legacy",
      legacy: true,
    }, options);
  }

  function normalizeDailyPlan(raw, allowlists, migrations, issues, options = {}) {
    if (raw === undefined || raw === null) return null;
    if (!isPlainObject(raw)) {
      issues.push("dailyPlan must be an object or null");
      return null;
    }
    const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null;
    const profile = normalizeProfile(raw.profile);
    const refresh = boundedInteger(raw.refresh, 0, 1000000, null);
    if (!date || !profile || refresh === null) return null;

    function ids(value, bucket, maximum) {
      if (!Array.isArray(value)) return [];
      const result = [];
      for (const rawId of value.slice(0, maximum)) {
        const id = safeId(rawId);
        const route = id ? resolveMigratedRoute(id, bucket, migrations, issues) : null;
        if (route && route.bucket === bucket && allowlists[bucket].has(route.id) && !result.includes(route.id)) result.push(route.id);
      }
      return result;
    }

    function one(value, bucket) {
      const id = safeId(value);
      const route = id ? resolveMigratedRoute(id, bucket, migrations, issues) : null;
      return route && route.bucket === bucket && allowlists[bucket].has(route.id) ? route.id : null;
    }

    function routeKeys(value) {
      if (value === undefined) return undefined;
      if (!Array.isArray(value)) {
        issues.push("dailyPlan.routeKeys must be an array");
        return undefined;
      }
      if (value.length > 3) issues.push("dailyPlan.routeKeys exceeds its stored limit");
      const result = [];
      for (const rawKey of value) {
        const key = boundedString(rawKey, 40).trim().toLowerCase();
        if (!DAILY_TASK_TYPES.has(key)) {
          issues.push(`unknown dailyPlan route key: ${boundedString(rawKey, 80, "invalid")}`);
          continue;
        }
        if (!result.includes(key) && result.length < 3) result.push(key);
      }
      return result;
    }

    function dueCursor(value) {
      if (value === undefined) return undefined;
      const parsed = typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : value;
      if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 5) {
        issues.push("dailyPlan.dueCursor must be an integer from 0 through 5");
        return undefined;
      }
      return parsed;
    }

    function routeDescriptor(value) {
      if (!isPlainObject(value)) {
        issues.push("dailyPlan.routeSnapshot contains a non-object task");
        return null;
      }
      const key = boundedString(value.key, 40).trim().toLowerCase();
      const configuredElpLimit = Number(options?.courseData?.elpStepOneBlueprint?.requiredResponses
        || options?.courseData?.elpStepOneIds?.length
        || 0);
      const routeIdLimit = key === "elp"
        ? Math.min(MAX_ELP_SESSION_IDS, Math.max(MAX_ROUTE_TASK_IDS, configuredElpLimit))
        : MAX_ROUTE_TASK_IDS;
      const allowedBuckets = ROUTE_TASK_BUCKETS[key];
      if (!DAILY_TASK_TYPES.has(key) || !allowedBuckets) {
        issues.push(`unknown dailyPlan route task key: ${boundedString(value.key, 80, "invalid")}`);
        return null;
      }
      const allowedFields = new Set(["key", "bucket", "id", "ids", "errorTarget"]);
      for (const field of Object.keys(value)) {
        if (!allowedFields.has(field)) issues.push(`unknown dailyPlan.routeSnapshot field: ${boundedString(field, 80, "invalid")}`);
      }
      if (!allowedBuckets.length) {
        if (!(value.bucket === undefined || value.bucket === null) || value.id !== undefined || value.ids !== undefined) {
          issues.push(`dailyPlan route task ${key} must not contain content ids`);
          return null;
        }
        if (key === "errors") {
          const errorTarget = normalizeDailyErrorTarget(value.errorTarget, allowlists, migrations, issues, options);
          if (!errorTarget) return null;
          return { key, bucket: null, errorTarget };
        }
        if (value.errorTarget !== undefined) {
          issues.push(`dailyPlan route task ${key} must not contain an error target`);
          return null;
        }
        return { key, bucket: null };
      }
      if (value.errorTarget !== undefined) {
        issues.push(`dailyPlan route task ${key} must not contain an error target`);
        return null;
      }
      const bucket = collectionBucket(value.bucket);
      if (!bucket || !allowedBuckets.includes(bucket)) {
        issues.push(`dailyPlan route task ${key} has an incompatible bucket`);
        return null;
      }
      if (ROUTE_SCALAR_TASKS.has(key)) {
        if (value.ids !== undefined) {
          issues.push(`dailyPlan route task ${key} requires one scalar id`);
          return null;
        }
        const id = one(value.id, bucket);
        if (!id) {
          issues.push(`dailyPlan route task ${key} contains an unknown id`);
          return null;
        }
        return { key, bucket, id };
      }
      if (!Array.isArray(value.ids) || value.id !== undefined || value.ids.length < 1 || value.ids.length > routeIdLimit) {
        issues.push(`dailyPlan route task ${key} requires 1 through ${routeIdLimit} ids`);
        return null;
      }
      const normalizedIds = ids(value.ids, bucket, routeIdLimit);
      if (normalizedIds.length !== value.ids.length) {
        issues.push(`dailyPlan route task ${key} contains duplicate or unknown ids`);
        return null;
      }
      return { key, bucket, ids: normalizedIds };
    }

    function routeSnapshot(value, expectedKeys) {
      if (value === undefined) {
        if (expectedKeys?.length) issues.push("dailyPlan legacy route reset because immutable task payload is unavailable");
        return undefined;
      }
      if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ROUTE_TASKS) {
        issues.push(`dailyPlan.routeSnapshot must contain 1 through ${MAX_ROUTE_TASKS} tasks`);
        return undefined;
      }
      const result = [];
      for (const rawTask of value.slice(0, MAX_ROUTE_TASKS)) {
        const task = routeDescriptor(rawTask);
        if (!task) continue;
        if (result.some(item => item.key === task.key)) {
          issues.push(`duplicate dailyPlan route task key: ${task.key}`);
          continue;
        }
        result.push(task);
      }
      if (result.length !== value.length) return undefined;
      const keys = result.map(item => item.key);
      if (!Array.isArray(expectedKeys) || expectedKeys.length !== keys.length || expectedKeys.some((key, index) => key !== keys[index])) {
        issues.push("dailyPlan.routeSnapshot keys must exactly match routeKeys");
        return undefined;
      }
      return result;
    }

    let normalizedRouteKeys = routeKeys(raw.routeKeys);
    const normalizedDueCursor = dueCursor(raw.dueCursor);
    const normalizedRouteSnapshot = routeSnapshot(raw.routeSnapshot, normalizedRouteKeys);
    if (normalizedRouteSnapshot === undefined && normalizedRouteKeys?.length) normalizedRouteKeys = [];

    return {
      date,
      refresh,
      profile,
      applicabilityKey: boundedString(raw.applicabilityKey, 4096).trim() || null,
      coreIds: ids(raw.coreIds, "words", 32),
      dueIds: ids(raw.dueIds, "words", 32),
      dueQuestionIds: ids(raw.dueQuestionIds, "questions", 16),
      dueSignIds: ids(raw.dueSignIds, "signs", 16),
      dueSituationIds: ids(raw.dueSituationIds, "situations", 8),
      dueDocumentIds: ids(raw.dueDocumentIds, "documents", 8),
      dueLessonIds: ids(raw.dueLessonIds, "lessons", 8),
      questionIds: ids(raw.questionIds, "questions", 16),
      truckIds: ids(raw.truckIds, "words", 32),
      hotshotIds: ids(raw.hotshotIds, "words", 32),
      lessonId: one(raw.lessonId, "lessons"),
      situationId: one(raw.situationId, "situations"),
      signIds: ids(raw.signIds, "signs", 80),
      documentId: one(raw.documentId, "documents"),
      ...(normalizedRouteKeys === undefined ? {} : { routeKeys: normalizedRouteKeys }),
      ...(normalizedDueCursor === undefined ? {} : { dueCursor: normalizedDueCursor }),
      ...(normalizedRouteSnapshot === undefined ? {} : { routeSnapshot: normalizedRouteSnapshot }),
    };
  }

  function migrateErrorId(type, rawId, allowlists, migrations, issues) {
    const id = safeId(rawId);
    if (!id) return null;
    if (type === "diagnostic") {
      const diagnosticId = canonicalDiagnosticId(id, allowlists.diagnostic, allowlists.diagnosticAliases);
      return diagnosticId ? { id: diagnosticId, bucket: null } : null;
    }
    if (type === "branching") {
      const branchId = id.replace(/^branch-/, "");
      return allowlists.branching.has(branchId) ? { id: `branch-${branchId}`, bucket: null } : null;
    }
    const bucket = type === "word" ? "words" : type === "question" ? "questions" : type === "sign" ? "signs" : type === "situation" ? "situations" : type === "document" ? "documents" : type === "lesson" ? "lessons" : null;
    if (!bucket) return null;
    const direct = resolveMigratedRoute(id, bucket, migrations, issues);
    if (direct && allowlists[direct.bucket].has(direct.id)) return direct;
    if (bucket === "situations") {
      const candidates = Object.keys(migrations.situations).sort((left, right) => right.length - left.length);
      for (const oldId of candidates) {
        if (!id.startsWith(`${oldId}-`)) continue;
        const target = resolveMigratedRoute(oldId, "situations", migrations, issues);
        if (target && target.bucket === "situations" && allowlists.situations.has(target.id)) {
          const migratedId = `${target.id}${id.slice(oldId.length)}`;
          if (allowlists.situationErrors.has(migratedId)) return { id: migratedId, bucket: "situations" };
        }
      }
      if (allowlists.situationErrors.has(id)) return { id, bucket: "situations" };
    }
    return null;
  }

  function errorTypeForBucket(bucket, fallback) {
    const types = {
      words: "word",
      questions: "question",
      signs: "sign",
      situations: "situation",
      documents: "document",
      lessons: "lesson",
    };
    return types[bucket] || fallback;
  }

  function defaultErrorDrill(type) {
    return {
      word: "blind-card-retrieval",
      question: "typed-question-retrieval",
      sign: "typed-sign-meaning-action",
      situation: "typed-situation-driver-turn",
      document: "typed-document-field-retrieval",
      lesson: "typed-lesson-production",
      diagnostic: "alternate-diagnostic-item",
      branching: "alternate-branch-transfer",
    }[type] || "blind-retrieval";
  }

  function errorJournalBinding(raw, sourceVersion) {
    if (sourceVersion !== STATE_VERSION || !isPlainObject(raw)) return { contextKey: null, semanticBranch: null };
    return {
      contextKey: canonicalQualificationContextKey(raw.contextKey),
      semanticBranch: canonicalSemanticBranch(raw.semanticBranch),
    };
  }

  function sameDailyErrorTarget(left, right) {
    return Boolean(left && right
      && left.type === right.type
      && left.id === right.id
      && left.contextKey === right.contextKey
      && left.semanticBranch === right.semanticBranch);
  }

  function dailyErrorAttemptMatchesTarget(target, bucket, id) {
    const expectedBucket = {
      word: "words",
      question: "questions",
      sign: "signs",
      situation: "situations",
      document: "documents",
      lesson: "lessons",
    }[target?.type] || null;
    return expectedBucket ? bucket === expectedBucket && id === target.id : bucket === null && id === null;
  }

  function normalizeDailyErrorTarget(raw, allowlists, migrations, issues, options = {}) {
    if (!isPlainObject(raw)) {
      issues.push("Today error target must be an object");
      return null;
    }
    const allowedFields = new Set(["type", "id", "contextKey", "semanticBranch"]);
    if (Object.keys(raw).some(field => !allowedFields.has(field))) {
      issues.push("Today error target contains an unknown field");
      return null;
    }
    if (!ERROR_TYPES.has(raw.type)) {
      issues.push("Today error target has an unknown type");
      return null;
    }
    const migrated = migrateErrorId(raw.type, raw.id, allowlists, migrations, issues);
    if (!migrated) {
      issues.push(`Today error target contains an unknown id: ${boundedString(raw.id, 120, "invalid")}`);
      return null;
    }
    const type = errorTypeForBucket(migrated.bucket, raw.type);
    const contextKey = raw.contextKey === null ? null : canonicalQualificationContextKey(raw.contextKey);
    const semanticBranch = raw.semanticBranch === null ? null : canonicalSemanticBranch(raw.semanticBranch);
    if ((raw.contextKey !== null && !contextKey)
      || (raw.semanticBranch !== null && !semanticBranch)
      || Boolean(contextKey) === Boolean(semanticBranch)) {
      issues.push("Today error target has an invalid qualification binding");
      return null;
    }
    const qualificationState = options.qualificationState;
    const expectedBinding = migrated.bucket
      ? errorBindingForContent(qualificationState, migrated.bucket, migrated.id, allowlists)
      : {
          contextKey: canonicalQualificationContextKey(options.qualificationContextKey),
          semanticBranch: null,
        };
    if (!expectedBinding
      || contextKey !== expectedBinding.contextKey
      || semanticBranch !== expectedBinding.semanticBranch) {
      issues.push("Today error target does not match the current content qualification binding");
      return null;
    }
    return { type, id: migrated.id, contextKey, semanticBranch };
  }

  function dailyErrorRecord(errorJournal, target) {
    return (Array.isArray(errorJournal) ? errorJournal : []).find(record => sameDailyErrorTarget({
      type: record.type,
      id: record.id,
      contextKey: record.contextKey ?? null,
      semanticBranch: record.semanticBranch ?? null,
    }, target)) || null;
  }

  function evidenceMatchesErrorBinding(item, binding) {
    if (!item || !binding || (!binding.contextKey && !binding.semanticBranch)) return false;
    if (binding.contextKey && item.contextKey !== binding.contextKey) return false;
    if (binding.semanticBranch && item.semanticBranch !== binding.semanticBranch) return false;
    return true;
  }

  function validErrorProof(values, options, binding) {
    if (!Array.isArray(values) || values.length > 2) return null;
    const proof = values.map(value => normalizeEvidence(value, options));
    if (proof.some(value => !isQualifyingEvidence(value) || !evidenceMatchesErrorBinding(value, binding))) return null;
    proof.sort((left, right) => dateMilliseconds(left.at) - dateMilliseconds(right.at));
    if (proof.length === 2 && (
      proof[0].variant === proof[1].variant
      || dateMilliseconds(proof[1].at) - dateMilliseconds(proof[0].at) < MASTERY_GAP_MS
    )) return null;
    return proof;
  }

  function deriveErrorLifecycle(evidence, storedProof, storedInvalidatedAt, options, binding) {
    const boundEvidence = evidence.filter(item => evidenceMatchesErrorBinding(item, binding));
    const invalidatedAt = latestInvalidationAt(boundEvidence, storedInvalidatedAt, options);
    const cutoff = dateMilliseconds(invalidatedAt);
    const objectiveSuccesses = qualifyingSuccesses(boundEvidence)
      .filter(item => !Number.isFinite(cutoff) || dateMilliseconds(item.at) > cutoff)
      .sort((left, right) => dateMilliseconds(left.at) - dateMilliseconds(right.at));
    const validStored = validErrorProof(storedProof, options, binding) || [];
    const preserved = validStored.every(item => !Number.isFinite(cutoff) || dateMilliseconds(item.at) > cutoff)
      ? validStored
      : [];
    const corrected = preserved[0] || objectiveSuccesses[0] || null;
    let confirmation = preserved[1] || null;
    if (corrected && !confirmation) {
      confirmation = objectiveSuccesses.find(item => item.variant !== corrected.variant
        && dateMilliseconds(item.at) - dateMilliseconds(corrected.at) >= MASTERY_GAP_MS) || null;
    }
    const confirmationDueAt = corrected ? new Date(dateMilliseconds(corrected.at) + MASTERY_GAP_MS).toISOString() : null;
    const proof = confirmation ? [corrected, confirmation] : corrected ? [corrected] : [];
    const stage = confirmation
      ? "closed"
      : corrected
        ? currentTime(options) >= dateMilliseconds(confirmationDueAt) ? "confirmation-due" : "corrected-awaiting-confirmation"
        : "open";
    return {
      proof,
      correctedAt: corrected ? corrected.at : null,
      confirmationDueAt,
      confirmedAt: confirmation ? confirmation.at : null,
      invalidatedAt,
      stage,
    };
  }

  function normalizeErrorJournal(raw, allowlists, migrations, issues, options) {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw)) {
      issues.push("errorJournal must be an array");
      return [];
    }
    const result = new Map();
    for (const value of raw.slice(0, MAX_ERROR_ITEMS * 2)) {
      if (!isPlainObject(value) || !ERROR_TYPES.has(value.type)) {
        issues.push("invalid errorJournal item");
        continue;
      }
      const migrated = migrateErrorId(value.type, value.id, allowlists, migrations, issues);
      if (!migrated) {
        issues.push(`unknown errorJournal id: ${boundedString(value.id, 120, "invalid")}`);
        continue;
      }
      const type = errorTypeForBucket(migrated.bucket, value.type);
      const storedBinding = errorJournalBinding(value, options?.sourceVersion);
      const contentKey = `${migrated.bucket}\0${migrated.id}`;
      const sharedBranch = allowlists.sharedErrorBranches?.get(contentKey) || null;
      const contextualItem = allowlists.contextualErrorItems?.get(contentKey) || null;
      if (storedBinding.semanticBranch?.startsWith("shared:") && storedBinding.semanticBranch !== sharedBranch) {
        issues.push(`invalid shared error binding: ${migrated.id}`);
        continue;
      }
      const migrateLegacySharedBinding = SUPPORTED_STATE_VERSIONS.has(options?.sourceVersion)
        && options.sourceVersion < STATE_VERSION
        && Boolean(sharedBranch)
        && !storedBinding.contextKey
        && !storedBinding.semanticBranch;
      const migrateCurrentSharedBinding = options?.sourceVersion === STATE_VERSION
        && Boolean(sharedBranch)
        && Boolean(storedBinding.contextKey)
        && !storedBinding.semanticBranch;
      const migrateSharedBinding = migrateLegacySharedBinding || migrateCurrentSharedBinding;
      let rewriteBinding = migrateSharedBinding;
      let binding = migrateSharedBinding
        ? { contextKey: null, semanticBranch: sharedBranch }
        : storedBinding;
      if (contextualItem && options?.sourceVersion === STATE_VERSION) {
        if (storedBinding.contextKey) {
          const legacyContext = qualificationContextValue(storedBinding.contextKey);
          const expectedScope = legacyContext
            ? materializationScopeBranch(contextualItem, legacyContext.profile, legacyContext.applicability)
            : null;
          const expectedLegacyBranch = legacyContext
            ? legacyMaterializationBranch(contextualItem, migrated.bucket, legacyContext.profile, legacyContext.applicability)
            : null;
          if (!expectedScope || (storedBinding.semanticBranch
            && storedBinding.semanticBranch !== expectedScope
            && storedBinding.semanticBranch !== expectedLegacyBranch)) {
            issues.push(`invalid contextual error binding: ${migrated.id}`);
            continue;
          }
          binding = { contextKey: null, semanticBranch: expectedScope };
          rewriteBinding = true;
        } else if (storedBinding.semanticBranch) {
          const allowedScopes = allowedMaterializationScopeBranches(contextualItem);
          if (!allowedScopes.has(storedBinding.semanticBranch)) {
            issues.push(`invalid contextual error binding: ${migrated.id}`);
            continue;
          }
          binding = { contextKey: null, semanticBranch: storedBinding.semanticBranch };
        }
      }
      if (options?.sourceVersion === STATE_VERSION) {
        if (Object.prototype.hasOwnProperty.call(value, "contextKey")
          && value.contextKey !== null
          && !storedBinding.contextKey) issues.push(`invalid errorJournal contextKey: ${migrated.id}`);
        if (Object.prototype.hasOwnProperty.call(value, "semanticBranch")
          && value.semanticBranch !== null
          && !storedBinding.semanticBranch) issues.push(`invalid errorJournal semanticBranch: ${migrated.id}`);
      }
      const key = `${type}\0${migrated.id}\0${binding.contextKey || ""}\0${binding.semanticBranch || ""}`;
      const previous = result.get(key);
      const rawEvidence = [
        ...(Array.isArray(previous && previous.evidence) ? previous.evidence : []),
        ...(Array.isArray(value.evidence) ? value.evidence : []),
      ];
      const evidence = normalizeEvidenceList(rewriteBinding
        ? rawEvidence.map(item => ({ ...item, contextKey: binding.contextKey, semanticBranch: binding.semanticBranch }))
        : rawEvidence, options);
      const storedResolutionProof = previous?.resolutionProof?.length ? previous.resolutionProof : value.resolutionProof;
      const resolutionProof = rewriteBinding && Array.isArray(storedResolutionProof)
        ? storedResolutionProof.map(item => ({ ...item, contextKey: binding.contextKey, semanticBranch: binding.semanticBranch }))
        : storedResolutionProof;
      const resolutionInvalidatedAt = [previous?.resolutionInvalidatedAt, value.resolutionInvalidatedAt]
        .map(candidate => normalizedIso(candidate, options, false))
        .filter(Boolean)
        .sort((left, right) => dateMilliseconds(right) - dateMilliseconds(left))[0] || null;
      const lifecycle = deriveErrorLifecycle(
        evidence,
        resolutionProof,
        resolutionInvalidatedAt,
        options,
        binding,
      );
      const updatedAt = [normalizedIso(value.updatedAt, options, false), previous?.updatedAt]
        .filter(Boolean)
        .sort((left, right) => dateMilliseconds(right) - dateMilliseconds(left))[0]
        || new Date(currentTime(options)).toISOString();
      const openedAt = [normalizedIso(value.openedAt, options, false), previous?.openedAt]
        .filter(Boolean)
        .sort((left, right) => dateMilliseconds(left) - dateMilliseconds(right))[0]
        || updatedAt;
      result.set(key, {
        type,
        id: migrated.id,
        text: boundedString(value.text, 300) || previous?.text || "",
        reason: boundedString(value.reason, 240) || previous?.reason || "",
        errorType: boundedString(value.errorType, 64).trim().toLowerCase() || previous?.errorType || "retrieval",
        drill: boundedString(value.drill, 160).trim() || previous?.drill || defaultErrorDrill(type),
        contextKey: binding.contextKey,
        semanticBranch: binding.semanticBranch,
        openedAt,
        updatedAt,
        evidence,
        resolutionProof: lifecycle.proof,
        correctedAt: lifecycle.correctedAt,
        confirmationDueAt: lifecycle.confirmationDueAt,
        confirmedAt: lifecycle.confirmedAt,
        resolutionInvalidatedAt: lifecycle.invalidatedAt,
        stage: lifecycle.stage,
      });
      if (result.size >= MAX_ERROR_ITEMS) break;
    }
    return [...result.values()]
      .sort((left, right) => dateMilliseconds(right.updatedAt) - dateMilliseconds(left.updatedAt))
      .slice(0, MAX_ERROR_ITEMS);
  }

  function diagnosticRecommendation(weakest) {
    const recommendations = {
      listening: "Начните с доступных записей и короткого повтора без текста.",
      elp: "Начните с репрезентативных тренировочных вопросов и собственных коротких ответов.",
      inspection: "Начните с безопасной последовательности команд и последствий каждого действия.",
      vocabulary: "Начните с профессиональных карточек и повторной проверки завтра.",
      construct: "Начните с самостоятельного построения коротких ответов.",
      production: "Начните с продуктивной практики без подсказки.",
      signs: "Начните с распознавания смысла знака и нужного действия.",
      mixed: "Начните со смешанного маршрута: повторение, профессиональная фраза и одна рабочая ситуация.",
    };
    return recommendations[weakest] || recommendations.mixed;
  }

  function normalizeDiagnosticItem(raw, issues) {
    if (!isPlainObject(raw)) return null;
    const itemId = safeId(raw.itemId);
    const category = DIAGNOSTIC_CATEGORY_VALUES.has(raw.category) ? raw.category : null;
    const form = ["A", "B"].includes(raw.form) ? raw.form : null;
    const formVersion = boundedString(raw.formVersion, 80).trim();
    const stimulusVersion = boundedString(raw.stimulusVersion, 160).trim();
    const responseHash = boundedString(raw.responseHash, 128).trim();
    const evaluator = boundedString(raw.evaluator, 64).trim().toLowerCase();
    const score = boundedNumber(raw.score, 0, 1, null);
    const sourceEvidence = isPlainObject(raw.scoreEvidence) ? raw.scoreEvidence : null;
    if (!itemId || !category || !form || !formVersion || !stimulusVersion || !responseHash || !evaluator || score === null || !sourceEvidence) {
      issues.push("diagnostic.items contains invalid evidence");
      return null;
    }
    const stringList = value => Array.isArray(value)
      ? value.slice(0, 20).map(item => boundedString(item, 100).trim()).filter(Boolean)
      : [];
    return {
      itemId,
      category,
      form,
      formVersion,
      stimulusVersion,
      response: boundedString(raw.response, 400).trim(),
      responseHash,
      score,
      evaluator,
      scoreEvidence: {
        pass: sourceEvidence.pass === true,
        score: boundedNumber(sourceEvidence.score, 0, 1, score),
        matched: stringList(sourceEvidence.matched),
        missing: stringList(sourceEvidence.missing),
      },
      stimulusExposed: raw.stimulusExposed === true,
    };
  }

  function normalizeDiagnostic(raw, issues, options, sourceVersion = STATE_VERSION) {
    if (raw === undefined || raw === null) return null;
    if (!isPlainObject(raw)) {
      issues.push("diagnostic must be an object or null");
      return null;
    }
    const completedAt = normalizedIso(raw.completedAt, options, false);
    if (!completedAt) return null;
    const scores = createNullRecord();
    if (isPlainObject(raw.scores)) {
      for (const [key, value] of Object.entries(raw.scores)) {
        if (!DIAGNOSTIC_KEYS.has(key) || key === "mixed") continue;
        scores[key] = boundedInteger(value, 0, 100, 0);
      }
    } else if (raw.scores !== undefined) {
      issues.push("diagnostic.scores must be an object");
    }
    const complete = DIAGNOSTIC_CATEGORIES.every(key => Object.hasOwn(scores, key));
    const form = ["A", "B"].includes(raw.form) ? raw.form : null;
    const formVersion = boundedString(raw.formVersion, 80).trim() || null;
    const blueprint = createNullRecord();
    if (isPlainObject(raw.blueprint)) {
      for (const category of DIAGNOSTIC_CATEGORIES) blueprint[category] = boundedInteger(raw.blueprint[category], 0, 12, 0);
    }
    const items = [];
    if (Array.isArray(raw.items)) {
      for (const item of raw.items.slice(0, 12)) {
        const normalized = normalizeDiagnosticItem(item, issues);
        if (normalized) items.push(normalized);
      }
      if (raw.items.length > 12) issues.push("diagnostic.items exceeds 12 records");
    } else if (raw.items !== undefined) {
      issues.push("diagnostic.items must be an array");
    }
    const itemIds = new Set(items.map(item => item.itemId));
    const exactBlueprint = DIAGNOSTIC_CATEGORIES.every(category => (
      blueprint[category] === 3
      && items.filter(item => item.category === category).length === 3
    ));
    const consistentForm = Boolean(form && formVersion && items.every(item => item.form === form && item.formVersion === formVersion));
    const consistentEvidence = items.every(item => item.score === item.scoreEvidence.score);
    const allStimuliExposed = items.every(item => item.stimulusExposed === true);
    const binding = qualificationBinding(raw, sourceVersion, options);
    if (sourceVersion === STATE_VERSION && items.length === 12 && exactBlueprint) {
      for (const category of DIAGNOSTIC_CATEGORIES) {
        const earned = items.filter(item => item.category === category).reduce((total, item) => total + item.score, 0);
        scores[category] = Math.round(earned / 3 * 100);
      }
    }
    const strong = complete && DIAGNOSTIC_CATEGORIES.every(key => scores[key] >= 75);
    const weakest = complete
      ? DIAGNOSTIC_CATEGORIES.reduce((lowest, key) => scores[key] < scores[lowest] ? key : lowest, DIAGNOSTIC_CATEGORIES[0])
      : "mixed";
    const verified = sourceVersion === STATE_VERSION
      && raw.verified === true
      && raw.selfScored === false
      && binding.bound
      && complete
      && items.length === 12
      && itemIds.size === 12
      && exactBlueprint
      && consistentForm
      && consistentEvidence
      && allStimuliExposed;
    return {
      completedAt,
      verified,
      selfScored: false,
      profile: binding.profile,
      contextKey: binding.contextKey,
      form,
      formVersion,
      blueprint,
      scores,
      weakest,
      recommendation: diagnosticRecommendation(strong ? "mixed" : weakest),
      items,
    };
  }

  function diagnosticImportSummary(raw, issues, options) {
    if (!raw) return null;
    const diagnostic = normalizeDiagnostic(raw, issues, options, STATE_VERSION);
    if (!diagnostic) return null;
    return {
      completedAt: diagnostic.completedAt,
      verified: false,
      form: diagnostic.form,
      formVersion: diagnostic.formVersion,
      itemCount: diagnostic.items.length,
      scores: diagnostic.scores,
      weakest: diagnostic.weakest,
      recommendation: diagnostic.recommendation,
    };
  }

  function normalizeDiagnosticImportSummary(raw, issues, options) {
    if (!isPlainObject(raw)) {
      issues.push("importTrust diagnostic summary is invalid");
      return null;
    }
    const completedAt = normalizedIso(raw.completedAt, options, false);
    if (!completedAt) return null;
    const scores = createNullRecord();
    if (isPlainObject(raw.scores)) {
      for (const category of DIAGNOSTIC_CATEGORIES) {
        if (Object.prototype.hasOwnProperty.call(raw.scores, category)) scores[category] = boundedInteger(raw.scores[category], 0, 100, 0);
      }
    }
    const complete = DIAGNOSTIC_CATEGORIES.every(category => Object.prototype.hasOwnProperty.call(scores, category));
    const strong = complete && DIAGNOSTIC_CATEGORIES.every(category => scores[category] >= 75);
    const weakest = complete
      ? DIAGNOSTIC_CATEGORIES.reduce((lowest, category) => scores[category] < scores[lowest] ? category : lowest, DIAGNOSTIC_CATEGORIES[0])
      : "mixed";
    return {
      completedAt,
      verified: false,
      form: ["A", "B"].includes(raw.form) ? raw.form : null,
      formVersion: boundedString(raw.formVersion, 80).trim() || null,
      itemCount: boundedInteger(raw.itemCount, 0, 12, 0),
      scores,
      weakest,
      recommendation: diagnosticRecommendation(strong ? "mixed" : weakest),
    };
  }

  function normalizeImportTrust(raw, issues, options) {
    if (raw === undefined || raw === null) return null;
    if (!isPlainObject(raw) || raw.status !== "imported-unverified" || !isPlainObject(raw.history)) {
      issues.push("importTrust has invalid structure");
      return null;
    }
    const importedAt = normalizedIso(raw.importedAt, options, false);
    const sourceVersion = boundedInteger(raw.sourceVersion, 1, STATE_VERSION, null);
    if (!importedAt || sourceVersion === null) {
      issues.push("importTrust has invalid metadata");
      return null;
    }
    const history = raw.history;
    const count = key => boundedInteger(history[key], 0, 1000000, 0);
    const diagnostic = history.diagnostic === null || history.diagnostic === undefined
      ? null
      : normalizeDiagnosticImportSummary(history.diagnostic, issues, options);
    return {
      status: "imported-unverified",
      importedAt,
      sourceVersion,
      qualificationReset: true,
      history: {
        progressRecords: count("progressRecords"),
        evidenceItems: count("evidenceItems"),
        claimedMasteryRecords: count("claimedMasteryRecords"),
        dailyAttempts: count("dailyAttempts"),
        completedDailyAttempts: count("completedDailyAttempts"),
        errorItems: count("errorItems"),
        closedErrorItems: count("closedErrorItems"),
        branchingCompletions: count("branchingCompletions"),
        elpStepOneClaimed: history.elpStepOneClaimed === true,
        elpStepTwoClaimed: history.elpStepTwoClaimed === true,
        diagnostic,
      },
    };
  }

  function importedEvidence(value, options) {
    const evidence = normalizeEvidence(value, options);
    if (!evidence) return null;
    return normalizeEvidence({
      ...evidence,
      kind: "imported-unverified",
      independent: false,
      objective: false,
      blind: false,
      productive: false,
      preReveal: false,
      legacy: false,
    }, options);
  }

  function quarantineImportedQualification(state, sourceVersion, options) {
    const importedAt = new Date(currentTime(options)).toISOString();
    const history = {
      progressRecords: 0,
      evidenceItems: 0,
      claimedMasteryRecords: 0,
      dailyAttempts: Array.isArray(state.dailyAttempts) ? state.dailyAttempts.length : 0,
      completedDailyAttempts: Array.isArray(state.dailyAttempts) ? state.dailyAttempts.filter(item => item.completed === true).length : 0,
      errorItems: Array.isArray(state.errorJournal) ? state.errorJournal.length : 0,
      closedErrorItems: Array.isArray(state.errorJournal) ? state.errorJournal.filter(item => item.stage === "closed").length : 0,
      branchingCompletions: isPlainObject(state.branchingProgress) ? Object.values(state.branchingProgress).filter(item => item && item.correct === true).length : 0,
      elpStepOneClaimed: state.elpGate?.status === "passed",
      elpStepTwoClaimed: state.elpStepTwo?.status === "passed",
      diagnostic: state.diagnostic ? diagnosticImportSummary(state.diagnostic, [], options) : null,
    };

    for (const bucket of PROGRESS_BUCKETS) {
      const records = createNullRecord();
      for (const [id, record] of Object.entries(state[bucket] || {})) {
        const evidence = (record.evidence || []).map(item => importedEvidence(item, options)).filter(Boolean);
        history.progressRecords += 1;
        history.evidenceItems += evidence.length;
        if (record.masteredAt || validMasteryPair(record.masteryProof, options)) history.claimedMasteryRecords += 1;
        const quarantined = normalizeProgressRecord({
          evidence,
          masteryProof: [],
          historicalMasteredAt: null,
          masteryInvalidatedAt: null,
          repetitions: 0,
          nextDueAt: null,
          dueAt: null,
        }, STATE_VERSION, options);
        if (quarantined) records[id] = quarantined;
      }
      state[bucket] = records;
    }

    state.errorJournal = (state.errorJournal || []).map(item => ({
      ...item,
      evidence: (item.evidence || []).map(value => importedEvidence(value, options)).filter(Boolean),
      resolutionProof: [],
      resolutionInvalidatedAt: importedAt,
      correctedAt: null,
      confirmationDueAt: null,
      confirmedAt: null,
      stage: "open",
    }));
    state.dailyAttempts = (state.dailyAttempts || []).map(item => ({ ...item, completed: false }));
    state.dailyPlan = null;
    state.sessionOrdinal = INITIAL_SESSION_ORDINAL;
    state.diagnostic = null;
    state.branchingProgress = createNullRecord();
    state.elpGate = null;
    state.elpStepTwo = null;
    state.importTrust = {
      status: "imported-unverified",
      importedAt,
      sourceVersion,
      qualificationReset: true,
      history,
    };
    state.updatedAt = importedAt;
    return state;
  }

  function normalizeBranchingProgress(raw, allowlists, issues, options) {
    const result = createNullRecord();
    if (raw === undefined || raw === null) return result;
    if (!isPlainObject(raw)) {
      issues.push("branchingProgress must be an object");
      return result;
    }
    for (const [rawId, value] of Object.entries(raw).slice(0, MAX_BRANCH_ITEMS)) {
      const id = safeId(rawId);
      const canonicalId = id ? id.replace(/^branch-/, "") : null;
      if (!canonicalId || !allowlists.branching.has(canonicalId) || !isPlainObject(value) || typeof value.correct !== "boolean") {
        issues.push(`unknown branching id: ${boundedString(rawId, 120, "invalid")}`);
        continue;
      }
      const completedAt = normalizedIso(value.completedAt, options, false);
      if (!completedAt) continue;
      result[canonicalId] = { correct: value.correct, completedAt };
    }
    return result;
  }

  function normalizeQuestionRoute(value, allowlists, migrations, issues) {
    const id = safeId(value);
    const route = id ? resolveMigratedRoute(id, "questions", migrations, issues) : null;
    return route && route.bucket === "questions" && allowlists.questions.has(route.id) ? route.id : null;
  }

  function normalizeTypedGateEvidence(value, startedAt, options) {
    const evidence = normalizeEvidence(value, options);
    if (!evidence
      || !isObjectiveAttemptEvidence(evidence)
      || evidence.responseMode !== "typed"
      || dateMilliseconds(evidence.at) < dateMilliseconds(startedAt)) return null;
    return evidence;
  }

  function normalizeGateResult(value, fallbackEvidence, fallbackAt, startedAt, requireStimulus, options) {
    const input = isPlainObject(value) ? value : {};
    const source = isPlainObject(input.evidence)
      ? input.evidence
      : isPlainObject(fallbackEvidence)
        ? fallbackEvidence
        : {
            at: input.at || input.evaluatedAt || fallbackAt,
            outcome: input.pass === true ? "success" : "failed",
            independent: input.pass === true,
            support: "none",
            mode: input.mode || "elp-keyed-response",
            variant: input.variant,
            kind: "demonstrated",
            objective: true,
            blind: input.blind === true,
            productive: input.productive === true,
            preReveal: input.preReveal === true,
            evaluator: input.evaluator,
            responseMode: input.typed === true ? "typed" : input.responseMode,
            response: input.response,
            responseHash: input.responseHash,
            legacy: false,
          };
    const evidence = normalizeTypedGateEvidence(source, startedAt, options);
    if (!evidence || (requireStimulus && input.stimulusExposed !== true)) return null;
    return {
      evidence,
      result: {
        pass: isQualifyingEvidence(evidence),
        evaluator: evidence.evaluator,
        feedback: boundedString(input.feedback, 300),
        responseHash: evidence.responseHash,
        variant: evidence.variant,
        typed: true,
        preReveal: evidence.preReveal,
        blind: evidence.blind,
        productive: evidence.productive,
        stimulusExposed: requireStimulus ? true : input.stimulusExposed === true,
        at: evidence.at,
      },
    };
  }

  function normalizeElpGate(raw, allowlists, migrations, issues, options) {
    if (raw === undefined || raw === null) return null;
    if (!isPlainObject(raw)) {
      issues.push("elpGate must be an object or null");
      return null;
    }
    const startedAt = normalizedIso(raw.startedAt, options, false);
    if (!startedAt || !Array.isArray(raw.sessionIds)) {
      issues.push("elpGate requires startedAt and sessionIds");
      return null;
    }
    const requiredIds = [];
    const configuredIds = Array.isArray(options && options.courseData && options.courseData.elpStepOneIds)
      ? options.courseData.elpStepOneIds
      : [];
    const configuredCount = Number(options?.courseData?.elpStepOneBlueprint?.requiredResponses || configuredIds.length);
    for (const rawId of configuredIds.slice(0, MAX_ELP_SESSION_IDS * 2)) {
      const id = normalizeQuestionRoute(rawId, allowlists, migrations, issues);
      if (id && !requiredIds.includes(id)) requiredIds.push(id);
    }
    if (configuredCount !== 7 || requiredIds.length !== configuredCount) {
      issues.push("course ELP Step 1 set must contain seven valid question ids");
      return null;
    }
    const sessionIds = [];
    for (const rawId of raw.sessionIds.slice(0, MAX_ELP_SESSION_IDS * 2)) {
      const id = normalizeQuestionRoute(rawId, allowlists, migrations, issues);
      if (id && !sessionIds.includes(id)) sessionIds.push(id);
      if (sessionIds.length >= MAX_ELP_SESSION_IDS) break;
    }
    const legacyRestart = sessionIds.length === LEGACY_ELP_STEP_ONE_IDS.length
      && LEGACY_ELP_STEP_ONE_IDS.every(id => sessionIds.includes(id))
      && LEGACY_ELP_STEP_ONE_IDS.every(id => requiredIds.includes(id));
    if (legacyRestart) {
      issues.push(`${ELP_STEP_ONE_RESET_PREFIX} stored five-function gate does not match the current seven-function course`);
      return null;
    }
    if (raw.sessionIds.length !== requiredIds.length) {
      issues.push("elpGate.sessionIds must contain exactly the seven fixed Step 1 ids");
      return null;
    }
    if (sessionIds.length !== requiredIds.length || requiredIds.some(id => !sessionIds.includes(id))) {
      issues.push("elpGate.sessionIds must match the fixed Step 1 set");
      return null;
    }
    sessionIds.splice(0, sessionIds.length, ...requiredIds);
    const evidence = createNullRecord();
    const results = createNullRecord();
    const evidenceSource = isPlainObject(raw.evidence) ? raw.evidence : isPlainObject(raw.answerEvidence) ? raw.answerEvidence : null;
    const resultSource = isPlainObject(raw.results) ? raw.results : null;
    const resultTimeSource = isPlainObject(raw.resultTimes) ? raw.resultTimes : null;
    const sourceIds = new Set([
      ...Object.keys(evidenceSource || {}),
      ...Object.keys(resultSource || {}),
      ...Object.keys(resultTimeSource || {}),
    ]);
    if (sourceIds.size > requiredIds.length) issues.push("elpGate contains extra result ids");
    for (const rawId of [...sourceIds].slice(0, MAX_ELP_SESSION_IDS * 2)) {
      const id = normalizeQuestionRoute(rawId, allowlists, migrations, issues);
      const item = normalizeGateResult(resultSource?.[rawId], evidenceSource?.[rawId], resultTimeSource?.[rawId], startedAt, false, options);
      if (id && sessionIds.includes(id) && item) {
        evidence[id] = item.evidence;
        results[id] = item.result;
      } else issues.push(`invalid ELP Step 1 evidence: ${boundedString(rawId, 120, "invalid")}`);
    }
    if (!evidenceSource && (raw.evidence !== undefined || raw.answerEvidence !== undefined)) {
      issues.push("elpGate.evidence must be an object");
    }
    if (!resultSource && raw.results !== undefined) issues.push("elpGate.results must be an object");
    if (!resultTimeSource && raw.resultTimes !== undefined) issues.push("elpGate.resultTimes must be an object");
    const resultTimes = createNullRecord();
    for (const id of sessionIds) {
      if (!evidence[id]) continue;
      resultTimes[id] = evidence[id].at;
    }
    const completeEvidence = sessionIds.every(id => Boolean(evidence[id]));
    const derivedStatus = completeEvidence
      ? sessionIds.every(id => results[id].pass === true) ? "passed" : "failed"
      : "pending";
    const binding = qualificationBinding(raw, options?.sourceVersion, options);
    const sessionDate = normalizedDateKey(raw.sessionDate);
    if (raw.sessionDate !== undefined && raw.sessionDate !== null && !sessionDate) issues.push("elpGate.sessionDate must be a valid YYYY-MM-DD date");
    const status = binding.bound && sessionDate ? derivedStatus : "failed";
    const completedAt = completeEvidence
      ? new Date(Math.max(...sessionIds.map(id => dateMilliseconds(evidence[id].at)))).toISOString()
      : null;
    return {
      profile: binding.profile,
      contextKey: binding.contextKey,
      sessionDate,
      sessionIds,
      evidence,
      results,
      resultTimes,
      startedAt,
      completedAt,
      status,
      attempts: boundedInteger(raw.attempts, 0, MAX_ELP_ATTEMPTS, Object.keys(results).length),
    };
  }

  function normalizeElpStepTwo(raw, allowlists, issues, options) {
    if (raw === undefined || raw === null) return null;
    if (!isPlainObject(raw)) {
      issues.push("elpStepTwo must be an object or null");
      return null;
    }
    const eligibleIds = [...allowlists.elpStepTwoSigns];
    const requiredAttempts = allowlists.elpStepTwoRequiredAttempts;
    const blueprint = allowlists.elpStepTwoBlueprint;
    const requiredOfficial = blueprint?.requiredOfficialSvgAttempts;
    const requiredDms = blueprint?.requiredTrainingDmsAttempts;
    const expectedReferenceCounts = blueprint?.referenceCounts;
    if (eligibleIds.length !== 47
      || requiredAttempts !== 12
      || requiredOfficial !== 8
      || requiredDms !== 4
      || requiredOfficial + requiredDms !== requiredAttempts
      || allowlists.elpStepTwoProvenance.size !== eligibleIds.length) {
      issues.push("course ELP Step 2 must contain 47 English-bearing ids and a valid 8 official plus 4 DMS blueprint");
      return null;
    }
    const rawBlueprintVersion = typeof raw.blueprintVersion === "string"
      && raw.blueprintVersion.length <= MAX_ELP_STEP_TWO_BLUEPRINT_VERSION
      && boundedString(raw.blueprintVersion, MAX_ELP_STEP_TWO_BLUEPRINT_VERSION).trim() === raw.blueprintVersion
      ? raw.blueprintVersion
      : null;
    const referenceCounts = isPlainObject(raw.referenceCounts) ? raw.referenceCounts : null;
    const referenceCountFields = referenceCounts ? Object.keys(referenceCounts) : [];
    const validReferenceCounts = Boolean(referenceCounts
      && referenceCountFields.length === 2
      && referenceCountFields.every(field => ["officialSvg", "trainingDms"].includes(field))
      && Number.isSafeInteger(referenceCounts.officialSvg)
      && referenceCounts.officialSvg >= 0
      && referenceCounts.officialSvg <= MAX_ELP_STEP_TWO_REFERENCE_COUNT
      && Number.isSafeInteger(referenceCounts.trainingDms)
      && referenceCounts.trainingDms >= 0
      && referenceCounts.trainingDms <= MAX_ELP_STEP_TWO_REFERENCE_COUNT
      && referenceCounts.officialSvg === expectedReferenceCounts.officialSvg
      && referenceCounts.trainingDms === expectedReferenceCounts.trainingDms);
    if (rawBlueprintVersion !== blueprint.version || !validReferenceCounts) {
      issues.push(`${ELP_STEP_TWO_RESET_PREFIX} stored blueprint or reference inventory does not match the current course`);
      return null;
    }
    const startedAt = normalizedIso(raw.startedAt, options, false);
    if (!startedAt || !Array.isArray(raw.sessionIds)) {
      issues.push("elpStepTwo requires startedAt and sessionIds");
      return null;
    }
    if (raw.sessionIds.length !== requiredAttempts) {
      issues.push(`${ELP_STEP_TWO_RESET_PREFIX} sessionIds must contain exactly 12 entries`);
      return null;
    }
    const sessionIds = [];
    for (const rawId of raw.sessionIds.slice(0, 130)) {
      const id = safeId(rawId);
      if (id && allowlists.elpStepTwoSigns.has(id) && !sessionIds.includes(id)) sessionIds.push(id);
    }
    if (sessionIds.length !== requiredAttempts) {
      issues.push(`${ELP_STEP_TWO_RESET_PREFIX} sessionIds must contain exactly 12 unique English-bearing ids`);
      return null;
    }
    const officialCount = sessionIds.filter(id => allowlists.elpStepTwoProvenance.get(id) === "fhwa-mutcd-shs").length;
    const dmsCount = sessionIds.filter(id => allowlists.elpStepTwoProvenance.get(id) === "training-dms").length;
    if (officialCount !== requiredOfficial || dmsCount !== requiredDms) {
      issues.push(`${ELP_STEP_TWO_RESET_PREFIX} session must contain exactly 8 official and 4 DMS stimuli`);
      return null;
    }
    const evidence = createNullRecord();
    const results = createNullRecord();
    const source = isPlainObject(raw.evidence) ? raw.evidence : isPlainObject(raw.answerEvidence) ? raw.answerEvidence : null;
    const resultSource = isPlainObject(raw.results) ? raw.results : null;
    const resultTimeSource = isPlainObject(raw.resultTimes) ? raw.resultTimes : null;
    const sourceIds = new Set([
      ...Object.keys(source || {}),
      ...Object.keys(resultSource || {}),
      ...Object.keys(resultTimeSource || {}),
    ]);
    if (sourceIds.size > requiredAttempts) issues.push("elpStepTwo contains extra result ids");
    for (const rawId of [...sourceIds].slice(0, 130)) {
      const id = safeId(rawId);
      const item = normalizeGateResult(resultSource?.[rawId], source?.[rawId], resultTimeSource?.[rawId], startedAt, true, options);
      if (id && sessionIds.includes(id) && item && item.result.variant === "elp-reading-meaning-and-action") {
        evidence[id] = item.evidence;
        results[id] = item.result;
      } else issues.push(`invalid ELP Step 2 reading evidence: ${boundedString(rawId, 120, "invalid")}`);
    }
    if (!source && (raw.evidence !== undefined || raw.answerEvidence !== undefined)) {
      issues.push("elpStepTwo.evidence must be an object");
    }
    if (!resultSource && raw.results !== undefined) issues.push("elpStepTwo.results must be an object");
    if (!resultTimeSource && raw.resultTimes !== undefined) issues.push("elpStepTwo.resultTimes must be an object");
    const resultTimes = createNullRecord();
    for (const id of sessionIds) {
      if (!evidence[id]) continue;
      resultTimes[id] = evidence[id].at;
    }
    const completeEvidence = sessionIds.every(id => Boolean(evidence[id]));
    const derivedStatus = completeEvidence
      ? sessionIds.every(id => results[id].pass === true) ? "passed" : "failed"
      : "pending";
    const binding = qualificationBinding(raw, options?.sourceVersion, options);
    const status = binding.bound ? derivedStatus : "failed";
    const completedAt = completeEvidence
      ? new Date(Math.max(...sessionIds.map(id => dateMilliseconds(evidence[id].at)))).toISOString()
      : null;
    return {
      profile: binding.profile,
      contextKey: binding.contextKey,
      blueprintVersion: blueprint.version,
      referenceCounts: {
        officialSvg: expectedReferenceCounts.officialSvg,
        trainingDms: expectedReferenceCounts.trainingDms,
      },
      sessionIds,
      evidence,
      results,
      resultTimes,
      startedAt,
      completedAt,
      status,
      attempts: boundedInteger(raw.attempts, 0, MAX_ELP_ATTEMPTS, Object.keys(results).length),
    };
  }

  function normalizeDailyAttempts(raw, allowlists, migrations, issues, options) {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw)) {
      issues.push("dailyAttempts must be an array");
      return [];
    }
    const result = [];
    const expectedContextKey = canonicalQualificationContextKey(options?.qualificationContextKey);
    for (const value of raw.slice(0, MAX_DAILY_ATTEMPTS * 2)) {
      if (!isPlainObject(value)) continue;
      const date = typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date) ? value.date : null;
      const at = normalizedIso(value.at || value.completedAt, options, false);
      const requestedBucket = collectionBucket(value.bucket);
      const taskType = boundedString(value.taskType || value.taskKey || value.task || requestedBucket, 40).toLowerCase();
      if (!date || !at || !DAILY_TASK_TYPES.has(taskType)) continue;
      const suppliedContextKey = canonicalQualificationContextKey(value.contextKey);
      if (Object.prototype.hasOwnProperty.call(value, "contextKey")
        && value.contextKey !== null
        && !suppliedContextKey) issues.push("dailyAttempts contains a noncanonical contextKey");
      const contextKey = suppliedContextKey || expectedContextKey;
      if (!contextKey) {
        issues.push("dailyAttempts context cannot be recovered without a profile");
        continue;
      }
      let bucket = requestedBucket;
      let id = null;
      if (bucket) {
        const rawId = safeId(value.id || value.contentId);
        const route = rawId ? resolveMigratedRoute(rawId, bucket, migrations, issues) : null;
        if (!route || !allowlists[route.bucket].has(route.id)) continue;
        bucket = route.bucket;
        id = route.id;
      } else if ((value.id !== undefined && value.id !== null) || (value.contentId !== undefined && value.contentId !== null)) {
        const rawId = safeId(value.id || value.contentId);
        if (!rawId) continue;
        if (taskType === "diagnostic") {
          id = canonicalDiagnosticId(rawId, allowlists.diagnostic, allowlists.diagnosticAliases);
        } else if (taskType === "branching") {
          const branchId = rawId.replace(/^branch-/, "");
          id = allowlists.branching.has(branchId) ? `branch-${branchId}` : null;
        } else if (["elp", "listening"].includes(taskType)) {
          const question = normalizeQuestionRoute(rawId, allowlists, migrations, issues);
          id = question || (taskType === "elp" && allowlists.elpStepTwoSigns.has(rawId) ? rawId : null);
        } else if (["core", "truck", "hotshot"].includes(taskType)) {
          const route = resolveMigratedRoute(rawId, "words", migrations, issues);
          id = route && route.bucket === "words" && allowlists.words.has(route.id) ? route.id : null;
        } else {
          id = null;
        }
        if (!id) {
          issues.push(`unknown dailyAttempts id: ${boundedString(rawId, 120, "invalid")}`);
          continue;
        }
      }
      const requestedResult = boundedString(value.result, 24).toLowerCase();
      const variant = boundedString(value.variant || value.evidence?.variant, 128).trim() || null;
      const contextTrusted = options?.sourceVersion === STATE_VERSION && Boolean(suppliedContextKey);
      let completed = value.completed === true && contextTrusted;
      let errorTarget = null;
      let errorEvidenceAt = null;
      if (taskType === "errors") {
        if (value.errorTarget !== undefined) {
          errorTarget = normalizeDailyErrorTarget(value.errorTarget, allowlists, migrations, issues, options);
        }
        if (value.errorEvidenceAt !== undefined && value.errorEvidenceAt !== null) {
          errorEvidenceAt = normalizedIso(value.errorEvidenceAt, options, false);
          if (!errorEvidenceAt) issues.push("Today error attempt has an invalid evidence timestamp");
        }
        const journalRecord = errorTarget ? dailyErrorRecord(options?.errorJournal, errorTarget) : null;
        const recoveryCutoff = dateMilliseconds(journalRecord?.resolutionInvalidatedAt);
        const qualifyingEvidence = journalRecord && errorEvidenceAt
          ? journalRecord.evidence.find(evidence => evidence.at === errorEvidenceAt
            && isQualifyingEvidence(evidence)
            && (!Number.isFinite(recoveryCutoff) || dateMilliseconds(evidence.at) > recoveryCutoff)
            && evidenceMatchesErrorBinding(evidence, errorTarget))
          : null;
        if (completed && (!errorTarget || !qualifyingEvidence || !dailyErrorAttemptMatchesTarget(errorTarget, bucket, id))) {
          completed = false;
          issues.push("unbound Today error completion was reset");
        }
      } else if (value.errorTarget !== undefined || value.errorEvidenceAt !== undefined) {
        issues.push("non-error daily attempt contains error recovery metadata");
      }
      if (value.completed === true && !contextTrusted) issues.push("contextless or legacy daily completion was reset");
      result.push({
        date,
        at,
        taskType,
        bucket,
        id,
        contextKey,
        completed,
        result: DAILY_RESULTS.has(requestedResult) ? requestedResult : null,
        variant,
        ...(errorTarget ? { errorTarget } : {}),
        ...(errorTarget && errorEvidenceAt ? { errorEvidenceAt } : {}),
      });
    }
    return compactDailyAttempts(result, options?.activeDailyPlan, expectedContextKey);
  }

  function dailyCompletionAnchorKey(attempt) {
    const errorTarget = attempt.errorTarget
      ? [
          attempt.errorTarget.type,
          attempt.errorTarget.id,
          attempt.errorTarget.contextKey || "",
          attempt.errorTarget.semanticBranch || "",
        ].join("\u0001")
      : "";
    return [
      attempt.date,
      attempt.contextKey,
      attempt.taskType,
      attempt.bucket || "",
      attempt.id || "",
      attempt.variant || "",
      errorTarget,
    ].join("\0");
  }

  function activeDailyPlanAnchor(attempt, plan, contextKey) {
    if (!isPlainObject(plan) || !Array.isArray(plan.routeSnapshot) || !plan.routeSnapshot.length) return false;
    if (attempt.date !== plan.date || attempt.contextKey !== contextKey) return false;
    return plan.routeSnapshot.some(task => {
      if (task.key === "errors" && attempt.taskType === "errors") {
        return sameDailyErrorTarget(task.errorTarget, attempt.errorTarget)
          && typeof attempt.errorEvidenceAt === "string"
          && attempt.errorEvidenceAt.length > 0;
      }
      const taskTypes = new Set([task.key]);
      if (task.key === "due-questions") taskTypes.add("questions");
      if (task.key === "diagnostic" && task.bucket === "questions") taskTypes.add("questions");
      if (!taskTypes.has(attempt.taskType)) return false;
      const ids = Array.isArray(task.ids) ? task.ids : task.id ? [task.id] : [];
      if (!ids.length) return attempt.id === null;
      return attempt.bucket === task.bucket && ids.includes(attempt.id);
    });
  }

  function compactDailyAttempts(values, activePlan = null, contextKey = null) {
    const ordered = (Array.isArray(values) ? values : [])
      .filter(isPlainObject)
      .sort((left, right) => dateMilliseconds(left.at) - dateMilliseconds(right.at));
    if (ordered.length <= MAX_DAILY_ATTEMPTS) return ordered;
    const anchors = new Map();
    for (const item of ordered) {
      if (item.completed === true && ["independent", "demonstrated"].includes(item.result)) {
        anchors.set(dailyCompletionAnchorKey(item), item);
      }
    }
    const allAnchors = [...anchors.values()];
    const activeAnchors = allAnchors
      .filter(item => activeDailyPlanAnchor(item, activePlan, contextKey))
      .sort((left, right) => dateMilliseconds(left.at) - dateMilliseconds(right.at));
    const activeSet = new Set(activeAnchors);
    const otherAnchorSlots = Math.max(0, MAX_DAILY_ATTEMPTS - activeAnchors.length);
    const newestOtherAnchors = otherAnchorSlots > 0
      ? allAnchors
          .filter(item => !activeSet.has(item))
          .sort((left, right) => dateMilliseconds(left.at) - dateMilliseconds(right.at))
          .slice(-otherAnchorSlots)
      : [];
    const protectedItems = [...activeAnchors, ...newestOtherAnchors].slice(-MAX_DAILY_ATTEMPTS);
    const protectedSet = new Set(protectedItems);
    const remaining = Math.max(0, MAX_DAILY_ATTEMPTS - protectedItems.length);
    const newestOthers = remaining > 0
      ? ordered.filter(item => !protectedSet.has(item)).slice(-remaining)
      : [];
    return [...protectedItems, ...newestOthers]
      .sort((left, right) => dateMilliseconds(left.at) - dateMilliseconds(right.at))
      .slice(-MAX_DAILY_ATTEMPTS);
  }

  function normalizeState(input, courseData, options) {
    const issues = [];
    if (!isPlainObject(input)) return { ok: false, error: "state root must be an object", issues, state: null };
    const sourceVersion = input.version;
    if (!Number.isInteger(sourceVersion) || !SUPPORTED_STATE_VERSIONS.has(sourceVersion)) {
      return { ok: false, error: "unsupported state version", issues, state: null };
    }
    const allowlists = buildAllowlists(courseData);
    const migrations = collectMigrationMaps(courseData);
    const state = createDefaultState(courseData, options);
    state.profile = normalizeProfile(input.profile);
    state.applicability = normalizeApplicability(input.applicability, input.equipment, input.conditions, issues);
    state.onboardingComplete = input.onboardingComplete === true;
    if (sourceVersion === 1) {
      if (!state.profile) state.profile = "both";
      state.onboardingComplete = true;
    } else if (state.onboardingComplete && !state.profile) {
      state.profile = "both";
    }
    const qualificationOptions = {
      ...(options || {}),
      sourceVersion,
      qualificationProfile: state.profile,
      qualificationContextKey: qualificationContextKey(state.profile, state.applicability),
    };
    const progress = normalizeProgressBuckets(input, sourceVersion, allowlists, migrations, issues, options);
    for (const bucket of PROGRESS_BUCKETS) state[bucket] = progress[bucket];
    state.questionAttempts = normalizeQuestionAttempts(input.questionAttempts, allowlists.questions, migrations, issues, options);
    for (const [id, attemptRecord] of Object.entries(state.questionAttempts)) {
      const evidence = questionAttemptEvidence(attemptRecord, options);
      if (!evidence || state.questions[id]) continue;
      const fromAttempt = normalizeProgressRecord({ evidence: [evidence] }, STATE_VERSION, options);
      state.questions[id] = mergeProgressRecords(state.questions[id], fromAttempt, options);
    }
    state.errorJournal = normalizeErrorJournal(input.errorJournal, allowlists, migrations, issues, qualificationOptions);
    state.diagnostic = normalizeDiagnostic(input.diagnostic, issues, qualificationOptions, sourceVersion);
    state.branchingProgress = normalizeBranchingProgress(input.branchingProgress, allowlists, issues, options);
    const stepOneIssues = [];
    state.elpGate = normalizeElpGate(input.elpGate, allowlists, migrations, stepOneIssues, { ...qualificationOptions, courseData });
    issues.push(...stepOneIssues);
    const stepOneRestart = stepOneIssues.length === 1 && stepOneIssues[0].startsWith(ELP_STEP_ONE_RESET_PREFIX);
    state.elpStepTwo = stepOneRestart ? null : normalizeElpStepTwo(input.elpStepTwo, allowlists, issues, qualificationOptions);
    const dailyQualificationOptions = {
      ...qualificationOptions,
      courseData,
      qualificationState: state,
      errorJournal: state.errorJournal,
    };
    state.dailyPlan = normalizeDailyPlan(input.dailyPlan, allowlists, migrations, issues, dailyQualificationOptions);
    const currentStepOneIds = Array.isArray(courseData?.elpStepOneIds) ? courseData.elpStepOneIds : [];
    const frozenElp = state.dailyPlan?.routeSnapshot?.find(item => item.key === "elp");
    const incompatibleElpRoute = frozenElp
      && (frozenElp.ids.length !== currentStepOneIds.length || currentStepOneIds.some(id => !frozenElp.ids.includes(id)));
    if (state.dailyPlan && (stepOneRestart || incompatibleElpRoute) && state.dailyPlan.routeKeys?.includes("elp")) {
      const retained = state.dailyPlan.routeSnapshot
        .map((item, index) => ({ item, key: state.dailyPlan.routeKeys[index] }))
        .filter(entry => entry.item.key !== "elp");
      if (retained.length) {
        state.dailyPlan.routeSnapshot = retained.map(entry => entry.item);
        state.dailyPlan.routeKeys = retained.map(entry => entry.key);
      } else {
        delete state.dailyPlan.routeSnapshot;
        delete state.dailyPlan.routeKeys;
        delete state.dailyPlan.dueCursor;
      }
      if (!stepOneRestart) issues.push(`${ELP_STEP_ONE_RESET_PREFIX} stored Today route does not match the current seven-function course`);
    }
    state.dailyAttempts = normalizeDailyAttempts(input.dailyAttempts, allowlists, migrations, issues, { ...dailyQualificationOptions, activeDailyPlan: state.dailyPlan });
    state.dailyMinutes = [5, 10, 15].includes(Number(input.dailyMinutes)) ? Number(input.dailyMinutes) : 10;
    state.dailyRefresh = boundedInteger(input.dailyRefresh, 0, 1000000, 0);
    state.sessionOrdinal = boundedInteger(input.sessionOrdinal, INITIAL_SESSION_ORDINAL, MAX_SESSION_ORDINAL, INITIAL_SESSION_ORDINAL);
    state.diagnosticFormCursor = boundedInteger(input.diagnosticFormCursor, 0, 1000000, 0);
    state.importTrust = normalizeImportTrust(input.importTrust, issues, options);
    state.updatedAt = normalizedIso(input.updatedAt, options, false) || new Date(currentTime(options)).toISOString();
    state.contentVersion = courseContentVersion(courseData);
    return {
      ok: true,
      state,
      issues,
      migrated: sourceVersion !== STATE_VERSION
        || issues.some(issue => issue.startsWith("unknown ") || issue.startsWith(ELP_STEP_ONE_RESET_PREFIX)),
      sourceVersion,
    };
  }

  function appendEvidence(record, attempt, options) {
    const now = currentTime(options);
    const input = isPlainObject(attempt) ? { ...attempt } : {};
    if (!input.at) input.at = new Date(now).toISOString();
    const evidence = normalizeEvidence(input, { ...(options || {}), now });
    if (!evidence) return { ok: false, error: "invalid mastery evidence", record };
    const next = normalizeProgressRecord({
      ...(isPlainObject(record) ? record : {}),
      evidence: [...(Array.isArray(record && record.evidence) ? record.evidence : []), evidence],
      nextDueAt: null,
      dueAt: null,
      lastReviewed: evidence.at,
      lastGrade: evidence.grade,
    }, STATE_VERSION, { ...(options || {}), now });
    return { ok: true, record: next, evidence };
  }

  function recordEvidence(record, evidence, options) {
    return appendEvidence(record, evidence, options);
  }

  function createDemonstratedEvidence(value) {
    const input = isPlainObject(value) ? value : {};
    return {
      at: input.at,
      outcome: normalizeOutcome(input.outcome || input.result) || "failed",
      independent: input.independent === true,
      support: "none",
      mode: boundedString(input.mode, 64).trim().toLowerCase(),
      variant: boundedString(input.variant, 128).trim(),
      kind: "demonstrated",
      objective: true,
      blind: true,
      productive: true,
      preReveal: true,
      evaluator: boundedString(input.evaluator, 64).trim().toLowerCase(),
      responseMode: RESPONSE_MODES.has(input.responseMode) && input.responseMode !== "none" ? input.responseMode : "typed",
      response: boundedString(input.response, 400).trim(),
      responseHash: boundedString(input.responseHash, 128).trim(),
      grade: Object.prototype.hasOwnProperty.call(SRS_GRADES, input.grade) ? input.grade : null,
      legacy: false,
    };
  }

  function isMastered(record, options) {
    if (!isPlainObject(record)) return false;
    const evidence = normalizeEvidenceList(record.evidence, options || { now: Date.now });
    const invalidatedAt = latestInvalidationAt(evidence, record.masteryInvalidatedAt, options || { now: Date.now });
    return Boolean(deriveMasteryProof(evidence, record.masteryProof, invalidatedAt, options || { now: Date.now }));
  }

  function isDue(record, options) {
    if (!isPlainObject(record)) return false;
    const dueAt = normalizedIso(record.nextDueAt || record.dueAt, options, true);
    return Boolean(dueAt && dateMilliseconds(dueAt) <= currentTime(options));
  }

  function masteryStatus(record, options) {
    if (!isPlainObject(record) || !Array.isArray(record.evidence) || !record.evidence.length) return "new";
    if (isMastered(record, options)) return isDue(record, options) ? "review-due" : "mastered";
    const invalidatedAt = latestInvalidationAt(record.evidence, record.masteryInvalidatedAt, options);
    const cutoff = dateMilliseconds(invalidatedAt);
    const hasQualifyingSuccess = record.evidence.some(item => isQualifyingEvidence(item)
      && (!Number.isFinite(cutoff) || dateMilliseconds(item.at) > cutoff));
    if (!hasQualifyingSuccess && record.historicalMasteredAt) return "needs-reconfirmation";
    if (!hasQualifyingSuccess) return "needs-review";
    return isDue(record, options) ? "verification-due" : "learning";
  }

  function nextDueDeadline(state, options) {
    if (!isPlainObject(state)) return null;
    const now = currentTime(options);
    let earliest = Infinity;
    for (const bucket of PROGRESS_BUCKETS) {
      if (!isPlainObject(state[bucket])) continue;
      for (const record of Object.values(state[bucket])) {
        if (!isPlainObject(record)) continue;
        const due = dateMilliseconds(record.nextDueAt || record.dueAt);
        if (Number.isFinite(due) && due > now && due < earliest) earliest = due;
      }
    }
    return Number.isFinite(earliest) ? new Date(earliest).toISOString() : null;
  }

  function errorStage(record, options) {
    if (!isPlainObject(record)) return "open";
    const binding = errorJournalBinding(record, STATE_VERSION);
    const lifecycle = deriveErrorLifecycle(
      normalizeEvidenceList(record.evidence, options),
      record.resolutionProof,
      record.resolutionInvalidatedAt,
      options,
      binding,
    );
    return lifecycle.stage;
  }

  function qualificationOptionsForState(state, options) {
    const profile = normalizeProfile(state?.profile);
    return {
      ...(options || {}),
      sourceVersion: STATE_VERSION,
      qualificationProfile: profile,
      qualificationContextKey: qualificationContextKey(profile, state?.applicability),
    };
  }

  function journalBindingForMutation(state, raw) {
    const input = isPlainObject(raw) ? raw : {};
    const currentContextKey = qualificationContextKey(state?.profile, state?.applicability);
    const hasContextKey = Object.prototype.hasOwnProperty.call(input, "contextKey");
    const contextKey = hasContextKey
      ? input.contextKey === null ? null : canonicalQualificationContextKey(input.contextKey)
      : currentContextKey;
    const hasSemanticBranch = Object.prototype.hasOwnProperty.call(input, "semanticBranch");
    const semanticBranch = hasSemanticBranch
      ? input.semanticBranch === null ? null : canonicalSemanticBranch(input.semanticBranch)
      : null;
    if ((hasContextKey && input.contextKey !== null && !contextKey)
      || (hasSemanticBranch && input.semanticBranch !== null && !semanticBranch)) {
      return { ok: false, error: "invalid error qualification binding" };
    }
    if (contextKey && contextKey !== currentContextKey) {
      return { ok: false, error: "error qualification context does not match current state" };
    }
    if (!contextKey && !semanticBranch) return { ok: false, error: "error qualification binding is required" };
    return { ok: true, contextKey, semanticBranch };
  }

  function materializationBindingForMutation(state, bucket, id, raw, allowlists) {
    const item = allowlists.contextualErrorItems?.get(`${bucket}\0${id}`) || null;
    if (!item) return null;
    const expected = errorBindingForContent(state, bucket, id, allowlists);
    if (!expected || expected.kind !== "materialization") {
      return { ok: false, error: "content materialization scope is unavailable" };
    }
    const input = isPlainObject(raw) ? raw : {};
    const hasContextKey = Object.prototype.hasOwnProperty.call(input, "contextKey");
    const requestedContext = hasContextKey && input.contextKey !== null
      ? canonicalQualificationContextKey(input.contextKey)
      : null;
    const currentContext = qualificationContextKey(state?.profile, state?.applicability);
    if (hasContextKey && input.contextKey !== null && requestedContext !== currentContext) {
      return { ok: false, error: "error qualification context does not match current state" };
    }
    const hasSemanticBranch = Object.prototype.hasOwnProperty.call(input, "semanticBranch");
    const requestedBranch = hasSemanticBranch && input.semanticBranch !== null
      ? canonicalSemanticBranch(input.semanticBranch)
      : null;
    if (hasSemanticBranch && input.semanticBranch !== null && !requestedBranch) {
      return { ok: false, error: "invalid error qualification binding" };
    }
    const legacyBranch = legacyMaterializationBranch(item, bucket, state?.profile, state?.applicability);
    if (requestedBranch && requestedBranch !== expected.semanticBranch && requestedBranch !== legacyBranch) {
      return { ok: false, error: "error materialization scope does not match current content" };
    }
    return { ok: true, contextKey: null, semanticBranch: expected.semanticBranch };
  }

  function sameErrorBinding(record, binding) {
    return record?.contextKey === binding.contextKey && record?.semanticBranch === binding.semanticBranch;
  }

  function addError(inputState, item, courseData, options) {
    const normalized = normalizeState(inputState, courseData, options);
    if (!normalized.ok) return normalized;
    if (!isPlainObject(item)) return { ok: false, error: "invalid error item", errorType: "validation", state: normalized.state };
    const issues = normalized.issues;
    const allowlists = buildAllowlists(courseData);
    const migrations = collectMigrationMaps(courseData);
    const requested = migrateErrorId(item.type, item.id, allowlists, migrations, issues);
    if (!requested) return { ok: false, error: "unknown error item id", errorType: "validation", state: normalized.state, issues };
    const sharedBranch = allowlists.sharedErrorBranches?.get(`${requested.bucket}\0${requested.id}`) || null;
    const requestedSemanticBranch = canonicalSemanticBranch(item.semanticBranch);
    if (requestedSemanticBranch?.startsWith("shared:") && requestedSemanticBranch !== sharedBranch) {
      return { ok: false, error: "shared error binding is not valid for this content", errorType: "validation", state: normalized.state, issues };
    }
    const bindingInput = sharedBranch
      && (!requestedSemanticBranch || requestedSemanticBranch === sharedBranch)
      ? { ...item, contextKey: null, semanticBranch: sharedBranch }
      : item;
    const materializationBinding = materializationBindingForMutation(
      normalized.state,
      requested.bucket,
      requested.id,
      bindingInput,
      allowlists,
    );
    const binding = materializationBinding || journalBindingForMutation(normalized.state, bindingInput);
    if (!binding.ok) return { ...binding, errorType: "validation", state: normalized.state, issues: normalized.issues };
    const now = new Date(currentTime(options)).toISOString();
    const type = errorTypeForBucket(requested.bucket, item.type);
    const currentItems = normalized.state.errorJournal.filter(existing => !(
      existing.type === type
      && existing.id === requested.id
      && existing.stage === "closed"
      && sameErrorBinding(existing, binding)
    ));
    const qualificationOptions = qualificationOptionsForState(normalized.state, options);
    const journal = normalizeErrorJournal([
      ...currentItems,
      {
        ...item,
        contextKey: binding.contextKey,
        semanticBranch: binding.semanticBranch,
        openedAt: item.openedAt || now,
        updatedAt: item.updatedAt || now,
      },
    ], allowlists, migrations, issues, qualificationOptions);
    const record = journal.find(entry => entry.type === type && entry.id === requested.id && sameErrorBinding(entry, binding));
    if (!record) return { ok: false, error: "invalid error item", errorType: "validation", state: normalized.state, issues };
    const state = {
      ...normalized.state,
      errorJournal: journal,
      updatedAt: now,
    };
    return { ok: true, state, record, issues };
  }

  function recordErrorAttempt(inputState, type, id, attempt, courseData, options) {
    const normalized = normalizeState(inputState, courseData, options);
    if (!normalized.ok) return normalized;
    const issues = normalized.issues;
    const allowlists = buildAllowlists(courseData);
    const migrations = collectMigrationMaps(courseData);
    const migrated = migrateErrorId(type, id, allowlists, migrations, issues);
    if (!migrated) return { ok: false, error: "unknown error item id", errorType: "validation", state: normalized.state, issues };
    const canonicalType = errorTypeForBucket(migrated.bucket, type);
    const input = isPlainObject(attempt) ? { ...attempt } : {};
    const sharedBranch = allowlists.sharedErrorBranches?.get(`${migrated.bucket}\0${migrated.id}`) || null;
    const requestedSemanticBranch = canonicalSemanticBranch(input.semanticBranch);
    if (requestedSemanticBranch?.startsWith("shared:") && requestedSemanticBranch !== sharedBranch) {
      return { ok: false, error: "shared error binding is not valid for this content", errorType: "validation", state: normalized.state, issues };
    }
    if (sharedBranch && (!requestedSemanticBranch || requestedSemanticBranch === sharedBranch)) {
      input.contextKey = null;
      input.semanticBranch = sharedBranch;
    }
    const materializationBinding = materializationBindingForMutation(
      normalized.state,
      migrated.bucket,
      migrated.id,
      input,
      allowlists,
    );
    const binding = materializationBinding || journalBindingForMutation(normalized.state, input);
    if (!binding.ok) return { ...binding, errorType: "validation", state: normalized.state, issues };
    const index = normalized.state.errorJournal.findIndex(item => item.type === canonicalType
      && item.id === migrated.id
      && item.stage !== "closed"
      && sameErrorBinding(item, binding));
    if (index < 0) return { ok: false, error: "error item is not open", errorType: "validation", state: normalized.state, issues };
    if (!input.at) input.at = new Date(currentTime(options)).toISOString();
    const evidence = normalizeEvidence({
      ...input,
      contextKey: binding.contextKey,
      semanticBranch: binding.semanticBranch,
    }, options);
    if (!evidence) return { ok: false, error: "invalid error evidence", errorType: "validation", state: normalized.state, issues };
    const current = normalized.state.errorJournal[index];
    const updated = normalizeErrorJournal([{
      ...current,
      evidence: [...current.evidence, evidence],
      updatedAt: evidence.at,
    }], allowlists, migrations, issues, qualificationOptionsForState(normalized.state, options))[0];
    const journal = [...normalized.state.errorJournal];
    journal[index] = updated;
    const state = {
      ...normalized.state,
      errorJournal: journal,
      updatedAt: new Date(currentTime(options)).toISOString(),
    };
    return { ok: true, state, record: updated, evidence, closed: updated.stage === "closed", issues };
  }

  function recordAttempt(inputState, bucket, id, attempt, courseData, options) {
    if (!PROGRESS_BUCKETS.includes(bucket)) return { ok: false, error: "unsupported progress bucket", state: inputState };
    const normalized = normalizeState(inputState, courseData, options);
    if (!normalized.ok) return normalized;
    const allowlists = buildAllowlists(courseData);
    const migrations = collectMigrationMaps(courseData);
    const safe = safeId(id);
    const route = safe ? resolveMigratedRoute(safe, bucket, migrations, normalized.issues) : null;
    if (!route || !allowlists[route.bucket].has(route.id)) return { ok: false, error: "unknown content id", state: normalized.state };
    const attemptInput = isPlainObject(attempt) ? { ...attempt } : {};
    const materializationBinding = materializationBindingForMutation(
      normalized.state,
      route.bucket,
      route.id,
      attemptInput,
      allowlists,
    );
    if (materializationBinding && !materializationBinding.ok) {
      return { ...materializationBinding, errorType: "validation", state: normalized.state, issues: normalized.issues };
    }
    if (materializationBinding?.ok) attemptInput.semanticBranch = materializationBinding.semanticBranch;
    const appended = appendEvidence(normalized.state[route.bucket][route.id], attemptInput, options);
    if (!appended.ok) return { ...appended, state: normalized.state };
    const state = { ...normalized.state, [route.bucket]: { ...normalized.state[route.bucket], [route.id]: appended.record } };
    if (route.bucket === "questions") {
      const previous = state.questionAttempts[route.id] || { independent: 0, prompted: 0, failed: 0, viewed: 0, selfReported: 0, lastResult: null, lastAttemptAt: null };
      const result = isQualifyingEvidence(appended.evidence)
        ? "independent"
        : appended.evidence.kind === "viewed"
          ? "viewed"
          : appended.evidence.kind === "self-reported" && appended.evidence.outcome === "success"
            ? "selfReported"
        : appended.evidence.support === "hint" || appended.evidence.support === "reveal" || appended.evidence.support === "model"
          ? "prompted"
          : "failed";
      state.questionAttempts = {
        ...state.questionAttempts,
        [route.id]: {
          ...previous,
          [result]: boundedInteger(previous[result], 0, 99999, 0) + 1,
          lastResult: result === "selfReported" ? "self-reported" : result,
          lastAttemptAt: appended.evidence.at,
        },
      };
    }
    const errorType = errorTypeForBucket(route.bucket, null);
    const contentBinding = errorBindingForContent(state, route.bucket, route.id, allowlists);
    const contextKey = contentBinding?.kind === "materialization"
      ? null
      : qualificationContextKey(state.profile, state.applicability);
    const semanticBranch = canonicalSemanticBranch(appended.evidence.semanticBranch);
    const binding = contentBinding?.kind === "materialization"
      ? { contextKey: null, semanticBranch: contentBinding.semanticBranch }
      : { contextKey, semanticBranch };
    const sharedBranch = allowlists.sharedErrorBranches?.get(`${route.bucket}\0${route.id}`) || null;
    const expectedSharedBranch = sharedBranch;
    const errorIndexes = state.errorJournal
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.type === errorType
        && item.id === route.id
        && item.stage !== "closed"
        && (sameErrorBinding(item, binding)
          || expectedSharedBranch
            && (!semanticBranch || semanticBranch === expectedSharedBranch)
            && item.contextKey === null
            && item.semanticBranch === expectedSharedBranch))
      .map(({ index }) => index);
    if (errorIndexes.length) {
      state.errorJournal = [...state.errorJournal];
      for (const errorIndex of errorIndexes) {
        const currentError = state.errorJournal[errorIndex];
        const errorBinding = errorJournalBinding(currentError, STATE_VERSION);
      const journalEvidence = normalizeEvidence({
        ...appended.evidence,
          contextKey: errorBinding.contextKey,
          semanticBranch: errorBinding.semanticBranch,
      }, options);
      const updatedError = normalizeErrorJournal([{
        ...currentError,
        evidence: [...currentError.evidence, journalEvidence],
        updatedAt: appended.evidence.at,
      }], allowlists, migrations, normalized.issues, qualificationOptionsForState(state, options))[0];
      state.errorJournal[errorIndex] = updatedError;
      }
    }
    state.updatedAt = new Date(currentTime(options)).toISOString();
    return { ok: true, state, record: appended.record, evidence: appended.evidence, bucket: route.bucket, id: route.id, issues: normalized.issues };
  }

  function recordDailyAttempt(inputState, attempt, courseData, options) {
    const normalized = normalizeState(inputState, courseData, options);
    if (!normalized.ok) return normalized;
    const issues = normalized.issues;
    const currentContextKey = qualificationContextKey(normalized.state.profile, normalized.state.applicability);
    const requestedContextKey = canonicalQualificationContextKey(isPlainObject(attempt) ? attempt.contextKey : null);
    if (!currentContextKey || !requestedContextKey || requestedContextKey !== currentContextKey) {
      return {
        ok: false,
        error: "daily attempt qualification context is missing or does not match current state",
        errorType: "validation",
        state: normalized.state,
        issues,
      };
    }
    const qualificationOptions = {
      ...qualificationOptionsForState(normalized.state, options),
      qualificationState: normalized.state,
      errorJournal: normalized.state.errorJournal,
      activeDailyPlan: normalized.state.dailyPlan,
    };
    const entries = normalizeDailyAttempts(
      [attempt],
      buildAllowlists(courseData),
      collectMigrationMaps(courseData),
      issues,
      qualificationOptions,
    );
    if (!entries.length) return { ok: false, error: "invalid daily attempt", state: normalized.state, issues };
    if (attempt?.taskType === "errors" && attempt.completed === true) {
      const activeTarget = normalized.state.dailyPlan?.routeSnapshot
        ?.find(task => task.key === "errors")?.errorTarget;
      if (!entries[0].completed || !sameDailyErrorTarget(activeTarget, entries[0].errorTarget)) {
        return {
          ok: false,
          error: "Today error completion did not advance the frozen recovery target",
          errorType: "validation",
          state: normalized.state,
          issues,
        };
      }
    }
    const state = {
      ...normalized.state,
      dailyAttempts: compactDailyAttempts([...normalized.state.dailyAttempts, entries[0]], normalized.state.dailyPlan, currentContextKey),
      updatedAt: new Date(currentTime(options)).toISOString(),
    };
    return { ok: true, state, attempt: entries[0], issues };
  }

  function safeStorageCall(storage, method, args, issues) {
    try {
      return { ok: true, value: storage[method](...args) };
    } catch (error) {
      issues.push(`storage ${method} failed: ${boundedString(error && error.message, 160, "unknown error")}`);
      return { ok: false, error };
    }
  }

  function readRaw(storage, key, issues) {
    const result = safeStorageCall(storage, "getItem", [key], issues);
    return result.ok ? { ok: true, raw: result.value } : { ok: false, raw: null };
  }

  function writeRaw(storage, key, raw, issues) {
    return safeStorageCall(storage, "setItem", [key, raw], issues).ok;
  }

  function removeRaw(storage, key, issues) {
    return safeStorageCall(storage, "removeItem", [key], issues).ok;
  }

  function restoreRaw(storage, key, raw, issues) {
    return raw === null || raw === undefined ? removeRaw(storage, key, issues) : writeRaw(storage, key, raw, issues);
  }

  function storedStateStructuralError(value, courseData, options) {
    if (!isPlainObject(value) || !SUPPORTED_STATE_VERSIONS.has(value.version)) return null;
    const current = value.version === STATE_VERSION;
    const allowlists = buildAllowlists(courseData);
    const migrations = collectMigrationMaps(courseData);
    const has = field => Object.prototype.hasOwnProperty.call(value, field);
    let qualificationProfile = normalizeProfile(value.profile);
    if ((value.version === 1 || value.onboardingComplete === true) && !qualificationProfile) qualificationProfile = "both";
    const qualificationApplicability = normalizeApplicability(value.applicability, value.equipment, value.conditions, []);
    const qualificationOptions = {
      ...(options || {}),
      sourceVersion: value.version,
      qualificationProfile,
      qualificationContextKey: qualificationContextKey(qualificationProfile, qualificationApplicability),
      qualificationState: { profile: qualificationProfile, applicability: qualificationApplicability },
      courseData,
      errorJournal: Array.isArray(value.errorJournal) ? value.errorJournal : [],
      activeDailyPlan: isPlainObject(value.dailyPlan) ? value.dailyPlan : null,
    };
    const validIso = (input, allowNull = false, allowFuture = false) => (
      (allowNull && (input === null || input === undefined)) || Boolean(normalizedIso(input, options, allowFuture))
    );
    const validCount = (input, maximum = 100000) => Number.isSafeInteger(input) && input >= 0 && input <= maximum;

    function validEvidence(evidence, strict) {
      if (!isPlainObject(evidence) || !validIso(evidence.at)) return false;
      if (strict && !OUTCOMES.has(evidence.outcome)) return false;
      if (!strict && !normalizeOutcome(evidence.outcome || evidence.result || evidence.grade)) return false;
      if (strict && typeof evidence.independent !== "boolean") return false;
      if (strict && !SUPPORT_VALUES.has(evidence.support)) return false;
      if (strict && (
        typeof evidence.mode !== "string"
        || typeof evidence.variant !== "string"
        || !EVIDENCE_KINDS.has(evidence.kind)
        || typeof evidence.objective !== "boolean"
        || typeof evidence.blind !== "boolean"
        || typeof evidence.productive !== "boolean"
        || typeof evidence.preReveal !== "boolean"
        || typeof evidence.evaluator !== "string"
        || !RESPONSE_MODES.has(evidence.responseMode)
        || typeof evidence.response !== "string"
        || typeof evidence.responseHash !== "string"
        || !(evidence.grade === null || Object.prototype.hasOwnProperty.call(SRS_GRADES, evidence.grade))
        || typeof evidence.legacy !== "boolean"
      )) return false;
      if (strict && !(evidence.contextKey === undefined || canonicalQualificationContextKey(evidence.contextKey))) return false;
      if (strict && !(evidence.semanticBranch === undefined || canonicalSemanticBranch(evidence.semanticBranch))) return false;
      return true;
    }

    function validProgressRecord(record) {
      if (!isPlainObject(record)) return false;
      if (Array.isArray(record.evidence)) {
        if (!record.evidence.length || record.evidence.length > MAX_PROGRESS_EVIDENCE || record.evidence.some(item => !validEvidence(item, current))) return false;
      } else if (current || makeLegacyEvidence(record, value.version, options).length === 0) {
        return false;
      }
      if (!current) return true;
      if (!Array.isArray(record.masteryProof) || ![0, 2].includes(record.masteryProof.length) || record.masteryProof.some(item => !validEvidence(item, true))) return false;
      const proof = validMasteryPair(record.masteryProof, options);
      if (record.masteryProof.length === 2 && !proof) return false;
      if (!validCount(record.successCount)
        || !validCount(record.demonstratedSuccessCount)
        || !validCount(record.selfReportedSuccessCount)
        || !validCount(record.viewedCount)
        || !validIso(record.firstEvidenceAt)
        || !validIso(record.lastAttemptAt)) return false;
      if (!validIso(record.masteredAt, true) || !validIso(record.completedAt, true) || !validIso(record.nextDueAt, true, true) || !validIso(record.dueAt, true, true)) return false;
      if (!validIso(record.historicalMasteredAt, true) || !validIso(record.masteryInvalidatedAt, true)) return false;
      const activeProof = deriveMasteryProof(record.evidence, record.masteryProof, record.masteryInvalidatedAt, options);
      if (Boolean(activeProof) !== Boolean(record.masteredAt) || record.masteredAt !== record.completedAt || (activeProof && record.masteredAt !== activeProof[1].at)) return false;
      if (record.nextDueAt !== record.dueAt) return false;
      if (!validIso(record.lastReviewed) || !validCount(record.repetitions) || !validCount(record.intervalDays, 36500)) return false;
      if (record.legacyCompletedAt !== undefined && !validIso(record.legacyCompletedAt)) return false;
      if (record.lastGrade !== undefined && !["again", "hard", "good", "easy"].includes(record.lastGrade)) return false;
      const derived = normalizeProgressRecord(record, STATE_VERSION, options);
      const derivedFields = [
        "masteryProof", "successCount", "demonstratedSuccessCount", "selfReportedSuccessCount", "viewedCount",
        "firstEvidenceAt", "lastAttemptAt", "masteredAt", "completedAt", "historicalMasteredAt",
        "masteryInvalidatedAt", "nextDueAt", "dueAt", "lastReviewed", "repetitions", "intervalDays",
      ];
      if (!derived || derivedFields.some(field => JSON.stringify(record[field]) !== JSON.stringify(derived[field]))) return false;
      if ((record.lastGrade || null) !== (derived.lastGrade || null)) return false;
      return true;
    }

    for (const bucket of PROGRESS_BUCKETS) {
      if (!has(bucket)) {
        if (current) return `${bucket} is missing from current state`;
        continue;
      }
      if (!isPlainObject(value[bucket])) return `${bucket} has invalid stored structure`;
      const records = Object.entries(value[bucket]);
      if (current && records.length > Math.max(allowlists[bucket].size * 2, 32)) return `${bucket} exceeds its stored limit`;
      for (const [id, record] of records) {
        if (current && (!safeId(id) || !allowlists[bucket].has(id))) return `${bucket} contains an unknown current id`;
        if (!current) {
          const route = safeId(id) ? resolveMigratedRoute(id, bucket, migrations, []) : null;
          if (!route || !allowlists[route.bucket].has(route.id)) return `${bucket} contains an unknown legacy id`;
        }
        if (!validProgressRecord(record)) return `${bucket} contains an invalid stored record`;
      }
    }

    if (current || has("questionAttempts")) {
      if (!isPlainObject(value.questionAttempts)) return "questionAttempts has invalid stored structure";
      for (const [id, record] of Object.entries(value.questionAttempts)) {
        if (!isPlainObject(record)) return "questionAttempts contains an invalid record";
        if (current && (!allowlists.questions.has(id)
          || !validCount(record.independent)
          || !validCount(record.prompted)
          || !validCount(record.failed)
          || !validCount(record.viewed)
          || !validCount(record.selfReported)
          || !(record.lastResult === null || QUESTION_RESULTS.has(record.lastResult))
          || !validIso(record.lastAttemptAt, true))) return "questionAttempts contains an invalid current record";
        if (!current) {
          const fields = ["independent", "prompted", "failed", "viewed", "selfReported"];
          if (!safeId(id) || fields.some(field => record[field] !== undefined && boundedInteger(record[field], 0, 100000, null) === null)) return "questionAttempts contains an invalid legacy record";
          if (record.lastResult !== undefined && record.lastResult !== null && !QUESTION_RESULTS.has(record.lastResult)) return "questionAttempts contains an invalid legacy result";
          if (record.lastAttemptAt !== undefined && record.lastAttemptAt !== null && !validIso(record.lastAttemptAt)) return "questionAttempts contains an invalid legacy timestamp";
          if (!fields.some(field => boundedInteger(record[field], 0, 100000, 0) > 0)) return "questionAttempts contains an empty legacy record";
          const route = resolveMigratedRoute(id, "questions", migrations, []);
          if (!route || route.bucket !== "questions" || !allowlists.questions.has(route.id)) return "questionAttempts contains an unknown legacy id";
        }
      }
    }

    if (current || has("errorJournal")) {
      if (!Array.isArray(value.errorJournal) || value.errorJournal.length > MAX_ERROR_ITEMS) return "errorJournal has invalid stored structure";
      for (const record of value.errorJournal) {
        if (!isPlainObject(record) || !ERROR_TYPES.has(record.type) || !safeId(record.id)) return "errorJournal contains an invalid record";
        if (current && (
          typeof record.text !== "string"
          || typeof record.reason !== "string"
          || typeof record.errorType !== "string"
          || typeof record.drill !== "string"
          || !validIso(record.openedAt)
          || !validIso(record.updatedAt)
          || !Array.isArray(record.evidence)
          || record.evidence.length > MAX_EVIDENCE_PER_BINDING
          || record.evidence.some(item => !validEvidence(item, true))
          || !Array.isArray(record.resolutionProof)
          || ![0, 1, 2].includes(record.resolutionProof.length)
          || record.resolutionProof.some(item => !validEvidence(item, true))
          || !validIso(record.correctedAt, true)
          || !validIso(record.confirmationDueAt, true, true)
          || !validIso(record.confirmedAt, true)
          || !validIso(record.resolutionInvalidatedAt, true)
          || !ERROR_STATUSES.has(record.stage)
        )) return "errorJournal contains an invalid current record";
        const binding = errorJournalBinding(record, STATE_VERSION);
        if (current && (
          !(record.contextKey === undefined || record.contextKey === null || binding.contextKey)
          || !(record.semanticBranch === undefined || record.semanticBranch === null || binding.semanticBranch)
        )) return "errorJournal contains an invalid qualification binding";
        if (!migrateErrorId(record.type, record.id, allowlists, migrations, [])) return `errorJournal contains an unknown ${current ? "current" : "legacy"} id`;
        if (current && (binding.contextKey || binding.semanticBranch)) {
          if (!validErrorProof(record.resolutionProof, options, binding)) return "errorJournal contains an invalid correction proof";
          const lifecycle = deriveErrorLifecycle(record.evidence, record.resolutionProof, record.resolutionInvalidatedAt, options, binding);
          if (record.correctedAt !== lifecycle.correctedAt
            || record.confirmationDueAt !== lifecycle.confirmationDueAt
            || record.confirmedAt !== lifecycle.confirmedAt
            || (lifecycle.stage === "closed" && record.stage !== "closed")
            || (lifecycle.stage === "open" && record.stage !== "open")
            || (["corrected-awaiting-confirmation", "confirmation-due"].includes(lifecycle.stage)
              && !["corrected-awaiting-confirmation", "confirmation-due"].includes(record.stage))) return "errorJournal lifecycle conflicts with its evidence";
        }
      }
    }

    if (has("diagnostic") && value.diagnostic !== null) {
      const record = value.diagnostic;
      if (!isPlainObject(record) || !validIso(record.completedAt) || !isPlainObject(record.scores)) return "diagnostic has invalid stored structure";
      if (current) {
        if (!(record.profile === undefined || record.profile === null || PROFILE_VALUES.has(record.profile))
          || !(record.contextKey === undefined || record.contextKey === null || (
            typeof record.contextKey === "string"
            && record.contextKey.length <= MAX_QUALIFICATION_CONTEXT_KEY
            && boundedString(record.contextKey, MAX_QUALIFICATION_CONTEXT_KEY).trim() === record.contextKey
          ))) {
          return "diagnostic contains invalid qualification context";
        }
        if (Object.entries(record.scores).some(([key, score]) => !DIAGNOSTIC_CATEGORY_VALUES.has(key) || !Number.isSafeInteger(score) || score < 0 || score > 100)) return "diagnostic contains invalid current scores";
        const diagnosticIssues = [];
        const normalizedDiagnostic = normalizeDiagnostic(record, diagnosticIssues, qualificationOptions, STATE_VERSION);
        const binding = qualificationBinding(record, STATE_VERSION, qualificationOptions);
        const qualificationFields = new Set(["verified", "profile", "contextKey"]);
        const allowedFields = new Set(Object.keys(normalizedDiagnostic || {}));
        if (diagnosticIssues.length
          || !normalizedDiagnostic
          || (binding.bound && normalizedDiagnostic.verified !== record.verified)
          || Object.keys(record).some(field => !allowedFields.has(field))
          || Object.keys(normalizedDiagnostic).some(field => !qualificationFields.has(field)
            && JSON.stringify(normalizedDiagnostic[field]) !== JSON.stringify(record[field]))) {
          return "diagnostic contains inconsistent current evidence";
        }
      }
    } else if (current && !has("diagnostic")) {
      return "diagnostic is missing from current state";
    }

    if (current || has("branchingProgress")) {
      if (!isPlainObject(value.branchingProgress) || Object.keys(value.branchingProgress).length > MAX_BRANCH_ITEMS) return "branchingProgress has invalid stored structure";
      for (const [id, record] of Object.entries(value.branchingProgress)) {
        const canonicalId = safeId(id)?.replace(/^branch-/, "");
        if (!canonicalId || !allowlists.branching.has(canonicalId) || !isPlainObject(record) || typeof record.correct !== "boolean" || !validIso(record.completedAt)) return "branchingProgress contains an invalid record";
      }
    }

    let stepOneSafeRestart = false;
    if (has("elpGate") && value.elpGate !== null) {
      const gate = value.elpGate;
      if (!isPlainObject(gate) || !Array.isArray(gate.sessionIds) || !isPlainObject(gate.results) || !validIso(gate.startedAt)) return "elpGate has invalid stored structure";
      if (current) {
        if (!(gate.sessionDate === undefined || gate.sessionDate === null || normalizedDateKey(gate.sessionDate) === gate.sessionDate)) return "elpGate contains invalid sessionDate";
        if (!(gate.profile === undefined || gate.profile === null || PROFILE_VALUES.has(gate.profile))
          || !(gate.contextKey === undefined || gate.contextKey === null || (
            typeof gate.contextKey === "string"
            && gate.contextKey.length <= MAX_QUALIFICATION_CONTEXT_KEY
            && boundedString(gate.contextKey, MAX_QUALIFICATION_CONTEXT_KEY).trim() === gate.contextKey
          ))) {
          return "elpGate contains invalid qualification context";
        }
        if (Object.values(gate.results).some(result => !isPlainObject(result))
          || !Number.isSafeInteger(gate.attempts)
          || gate.attempts < 0) return "elpGate contains invalid current results";
        const gateIssues = [];
        const normalizedGate = normalizeElpGate(gate, allowlists, migrations, gateIssues, { ...qualificationOptions, courseData });
        const safeRestart = normalizedGate === null
          && gateIssues.length === 1
          && gateIssues[0].startsWith(ELP_STEP_ONE_RESET_PREFIX);
        stepOneSafeRestart = safeRestart;
        if (!safeRestart && (!normalizedGate || gateIssues.length)) return "elpGate contains invalid typed evidence";
      }
    } else if (current && !has("elpGate")) {
      return "elpGate is missing from current state";
    }

    if (!stepOneSafeRestart && has("elpStepTwo") && value.elpStepTwo !== null) {
      const gate = value.elpStepTwo;
      if (!isPlainObject(gate) || !Array.isArray(gate.sessionIds) || !isPlainObject(gate.results) || !validIso(gate.startedAt)) return "elpStepTwo has invalid stored structure";
      if (current) {
        if (!(gate.profile === undefined || gate.profile === null || PROFILE_VALUES.has(gate.profile))
          || !(gate.contextKey === undefined || gate.contextKey === null || (
            typeof gate.contextKey === "string"
            && gate.contextKey.length <= MAX_QUALIFICATION_CONTEXT_KEY
            && boundedString(gate.contextKey, MAX_QUALIFICATION_CONTEXT_KEY).trim() === gate.contextKey
          ))) {
          return "elpStepTwo contains invalid qualification context";
        }
        if (Object.values(gate.results).some(result => !isPlainObject(result))
          || !Number.isSafeInteger(gate.attempts)
          || gate.attempts < 0) return "elpStepTwo contains invalid current results";
        const gateIssues = [];
        const normalizedGate = normalizeElpStepTwo(gate, allowlists, gateIssues, qualificationOptions);
        const safeRestart = normalizedGate === null
          && gateIssues.length === 1
          && gateIssues[0].startsWith(ELP_STEP_TWO_RESET_PREFIX);
        if (!safeRestart && (!normalizedGate || gateIssues.length)) return "elpStepTwo contains invalid typed evidence";
      }
    } else if (!stepOneSafeRestart && current && !has("elpStepTwo")) {
      return "elpStepTwo is missing from current state";
    }

    if (current || has("dailyAttempts")) {
      if (!Array.isArray(value.dailyAttempts) || value.dailyAttempts.length > MAX_DAILY_ATTEMPTS) return "dailyAttempts has invalid stored structure";
      for (const attempt of value.dailyAttempts) {
        if (!isPlainObject(attempt)) return "dailyAttempts contains an invalid record";
        if (current && (
          typeof attempt.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(attempt.date)
          || !validIso(attempt.at)
          || !DAILY_TASK_TYPES.has(attempt.taskType)
          || !(attempt.bucket === null || PROGRESS_BUCKETS.includes(attempt.bucket))
          || !(attempt.id === null || safeId(attempt.id))
          || typeof attempt.completed !== "boolean"
          || !(attempt.result === null || DAILY_RESULTS.has(attempt.result))
          || !(attempt.variant === null || typeof attempt.variant === "string" && attempt.variant.length > 0 && attempt.variant.length <= 128)
          || !(attempt.contextKey === undefined || attempt.contextKey === null || canonicalQualificationContextKey(attempt.contextKey))
          || (attempt.bucket && (!attempt.id || !allowlists[attempt.bucket].has(attempt.id)))
          || !(attempt.errorEvidenceAt === undefined || normalizedIso(attempt.errorEvidenceAt, options, false) === attempt.errorEvidenceAt)
          || !(attempt.errorTarget === undefined || sameDailyErrorTarget(
            normalizeDailyErrorTarget(attempt.errorTarget, allowlists, migrations, [], qualificationOptions),
            attempt.errorTarget,
          ))
          || (attempt.taskType !== "errors" && (attempt.errorTarget !== undefined || attempt.errorEvidenceAt !== undefined))
        )) return "dailyAttempts contains an invalid current record";
        if (current && normalizeDailyAttempts([attempt], allowlists, migrations, [], qualificationOptions).length !== 1) return "dailyAttempts contains an unknown current id";
        if (!current) {
          const normalizedAttempts = normalizeDailyAttempts([attempt], allowlists, migrations, [], qualificationOptions);
          if (normalizedAttempts.length !== 1) return "dailyAttempts contains an invalid legacy record";
        }
      }
    }

    if (has("dailyPlan") && value.dailyPlan !== null) {
      const plan = value.dailyPlan;
      if (!isPlainObject(plan)) return "dailyPlan has invalid stored structure";
      const requiredArrays = [["coreIds", "words", 32], ["dueIds", "words", 32], ["truckIds", "words", 32], ["hotshotIds", "words", 32], ["signIds", "signs", 80]];
      const optionalArrays = [["dueQuestionIds", "questions", 16], ["dueSignIds", "signs", 16], ["dueSituationIds", "situations", 8], ["dueDocumentIds", "documents", 8], ["dueLessonIds", "lessons", 8], ["questionIds", "questions", 16]];
      for (const [field, bucket, maximum] of requiredArrays) {
        if (!Array.isArray(plan[field])) return `dailyPlan.${field} has invalid stored structure`;
        if (current && (plan[field].length > maximum || plan[field].some(id => !safeId(id) || !allowlists[bucket].has(id)))) return `dailyPlan.${field} contains invalid current ids`;
      }
      for (const [field, bucket, maximum] of optionalArrays) {
        if (plan[field] === undefined) continue;
        if (!Array.isArray(plan[field])) return `dailyPlan.${field} has invalid stored structure`;
        if (current && (plan[field].length > maximum || plan[field].some(id => !safeId(id) || !allowlists[bucket].has(id)))) return `dailyPlan.${field} contains invalid current ids`;
      }
      if (plan.routeKeys !== undefined && (
        !Array.isArray(plan.routeKeys)
        || plan.routeKeys.length > 3
        || new Set(plan.routeKeys).size !== plan.routeKeys.length
        || plan.routeKeys.some(key => typeof key !== "string" || !DAILY_TASK_TYPES.has(key))
      )) return "dailyPlan.routeKeys contains invalid task keys";
      if (plan.dueCursor !== undefined && (
        !Number.isSafeInteger(plan.dueCursor)
        || plan.dueCursor < 0
        || plan.dueCursor > 5
      )) return "dailyPlan.dueCursor has invalid stored structure";
      if (plan.routeSnapshot !== undefined) {
        const routeIssues = [];
        const normalizedPlan = normalizeDailyPlan(plan, allowlists, migrations, routeIssues, qualificationOptions);
        if (routeIssues.length
          || !normalizedPlan?.routeSnapshot
          || JSON.stringify(normalizedPlan.routeKeys) !== JSON.stringify(plan.routeKeys)
          || JSON.stringify(normalizedPlan.routeSnapshot) !== JSON.stringify(plan.routeSnapshot)) {
          return "dailyPlan.routeSnapshot contains invalid immutable tasks";
        }
      }
      if (current && (
        typeof plan.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(plan.date)
        || !PROFILE_VALUES.has(plan.profile)
        || !validCount(plan.refresh, 1000000)
        || !(plan.applicabilityKey === undefined || plan.applicabilityKey === null || (typeof plan.applicabilityKey === "string" && plan.applicabilityKey.length <= 4096))
        || ![["lessonId", "lessons"], ["situationId", "situations"], ["documentId", "documents"]]
          .every(([field, bucket]) => plan[field] === null || (safeId(plan[field]) && allowlists[bucket].has(plan[field])))
      )) return "dailyPlan contains invalid current metadata";
      if (!current) {
        const normalizedPlan = normalizeDailyPlan(plan, allowlists, migrations, [], qualificationOptions);
        if (!normalizedPlan) return "dailyPlan contains invalid legacy metadata";
        for (const [field, bucket] of [...requiredArrays, ...optionalArrays]) {
          if (plan[field] !== undefined && (!Array.isArray(plan[field]) || plan[field].some(id => {
            const route = safeId(id) ? resolveMigratedRoute(id, bucket, migrations, []) : null;
            return !route || route.bucket !== bucket || !allowlists[bucket].has(route.id);
          }))) return `dailyPlan.${field} contains an invalid legacy id`;
        }
        for (const [field, bucket] of [["lessonId", "lessons"], ["situationId", "situations"], ["documentId", "documents"]]) {
          if (plan[field] === undefined || plan[field] === null) continue;
          const route = safeId(plan[field]) ? resolveMigratedRoute(plan[field], bucket, migrations, []) : null;
          if (!route || route.bucket !== bucket || !allowlists[bucket].has(route.id)) return `dailyPlan.${field} contains an invalid legacy id`;
        }
      }
    } else if (current && !has("dailyPlan")) {
      return "dailyPlan is missing from current state";
    }

    if (has("sessionOrdinal") && (
      !Number.isSafeInteger(value.sessionOrdinal)
      || value.sessionOrdinal < 1
      || value.sessionOrdinal > MAX_SESSION_ORDINAL
    )) return "sessionOrdinal has invalid stored structure";

    if (current) {
      if (!isPlainObject(value.applicability)
        || !isPlainObject(value.applicability.equipment)
        || !isPlainObject(value.applicability.conditions)
        || Object.keys(value.applicability).length > 8
        || Object.keys(value.applicability.equipment).length > 32
        || Object.keys(value.applicability.conditions).length > 64
        || Object.keys(EQUIPMENT_DEFAULTS).some(key => value.applicability.equipment[key] !== undefined && typeof value.applicability.equipment[key] !== "boolean")
        || Object.keys(CONDITION_DEFAULTS).some(key => value.applicability.conditions[key] !== undefined && typeof value.applicability.conditions[key] !== "boolean")) return "applicability has invalid current structure";
    } else if (has("applicability") && value.applicability !== null && !isPlainObject(value.applicability)) {
      return "applicability has invalid legacy structure";
    }

    if (current) {
      if (![5, 10, 15].includes(value.dailyMinutes)) return "dailyMinutes has invalid current structure";
      if (!validCount(value.dailyRefresh, 1000000)) return "dailyRefresh has invalid current structure";
      if (value.diagnosticFormCursor !== undefined && !validCount(value.diagnosticFormCursor, 1000000)) return "diagnosticFormCursor has invalid current structure";
      if (value.profile !== null && !PROFILE_VALUES.has(value.profile)) return "profile has invalid current structure";
      if (typeof value.onboardingComplete !== "boolean") return "onboardingComplete has invalid current structure";
      if (!validIso(value.updatedAt) || !validCount(value.contentVersion, 1000000)) return "state metadata has invalid current structure";
      if (!Object.prototype.hasOwnProperty.call(value, "importTrust")) return "importTrust is missing from current state";
      const trustIssues = [];
      const normalizedTrust = normalizeImportTrust(value.importTrust, trustIssues, options);
      if (trustIssues.length || JSON.stringify(normalizedTrust) !== JSON.stringify(value.importTrust)) return "importTrust has invalid current structure";
    } else {
      if (has("dailyMinutes") && ![5, 10, 15].includes(Number(value.dailyMinutes))) return "dailyMinutes has invalid legacy structure";
      if (has("dailyRefresh") && boundedInteger(value.dailyRefresh, 0, 1000000, null) === null) return "dailyRefresh has invalid legacy structure";
      if (has("updatedAt") && !validIso(value.updatedAt)) return "updatedAt has invalid legacy structure";
    }
    return null;
  }

  function stateSemanticIssues(input, normalizedState, courseData, options) {
    if (!isPlainObject(input) || input.version !== 4 || !isPlainObject(normalizedState)) return [];
    const issues = [];
    const allowlists = buildAllowlists(courseData);
    const migrations = collectMigrationMaps(courseData);
    for (const sourceBucket of PROGRESS_BUCKETS) {
      if (!isPlainObject(input[sourceBucket])) continue;
      for (const [rawId, record] of Object.entries(input[sourceBucket])) {
        if (!isPlainObject(record) || !Array.isArray(record.evidence)) continue;
        const route = safeId(rawId) ? resolveMigratedRoute(rawId, sourceBucket, migrations, []) : null;
        if (!route || !allowlists[route.bucket].has(route.id)) continue;
        const evidence = normalizeEvidenceList(record.evidence, options);
        if (JSON.stringify(evidence) !== JSON.stringify(record.evidence)) {
          issues.push(`${sourceBucket}.${rawId} evidence is not canonical`);
          continue;
        }
        const proof = deriveAnyMasteryProof(evidence, record.masteryProof, options);
        const successes = qualifyingSuccesses(evidence);
        const expected = {
          successCount: Math.max(successes.length, proof ? proof.length : 0),
          demonstratedSuccessCount: Math.max(successes.length, proof ? proof.length : 0),
          selfReportedSuccessCount: evidence.filter(item => item.kind === "self-reported" && item.outcome === "success").length,
          viewedCount: evidence.filter(item => item.kind === "viewed").length,
          lastAttemptAt: evidence.at(-1)?.at || null,
          masteredAt: proof?.[1]?.at || null,
          completedAt: proof?.[1]?.at || null,
        };
        for (const [field, expectedValue] of Object.entries(expected)) {
          if (record[field] !== expectedValue) {
            issues.push(`${sourceBucket}.${rawId}.${field} conflicts with evidence`);
            break;
          }
        }
        if (issues.length >= 32) return issues;
      }
    }
    return issues;
  }

  function decodeStateRaw(raw, courseData, options) {
    if (raw === null || raw === undefined) return { present: false, ok: false, error: "missing", raw };
    if (typeof raw !== "string" || raw.length > MAX_IMPORT_BYTES) return { present: true, ok: false, error: "stored state is oversized", raw };
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return { present: true, ok: false, error: "invalid JSON", raw };
    }
    const structuralError = storedStateStructuralError(parsed, courseData, options);
    if (structuralError) return { present: true, ok: false, error: structuralError, raw };
    const normalized = normalizeState(parsed, courseData, options);
    if (!normalized.ok) return { present: true, raw, ...normalized };
    const semanticIssues = stateSemanticIssues(parsed, normalized.state, courseData, options);
    return { present: true, raw, ...normalized, semanticHealthy: semanticIssues.length === 0, semanticIssues };
  }

  function decodeStagingRaw(raw, courseData, options) {
    if (raw === null || raw === undefined) return { present: false, ok: false, error: "missing", raw };
    if (typeof raw !== "string" || raw.length > MAX_IMPORT_BYTES) return { present: true, ok: false, error: "invalid staging", raw };
    try {
      const parsed = JSON.parse(raw);
      if (!isPlainObject(parsed) || parsed.kind !== "truck-state-transaction-v1") return { present: true, ok: false, error: "invalid staging", raw };
      const structuralError = storedStateStructuralError(parsed.state, courseData, options);
      if (structuralError) return { present: true, ok: false, error: `invalid staging state: ${structuralError}`, raw };
      const normalized = normalizeState(parsed.state, courseData, options);
      if (!normalized.ok) return { present: true, raw, ...normalized };
      const semanticIssues = stateSemanticIssues(parsed.state, normalized.state, courseData, options);
      return {
        present: true,
        raw,
        createdAt: normalizedIso(parsed.createdAt, options, true),
        ...normalized,
        semanticHealthy: semanticIssues.length === 0,
        semanticIssues,
      };
    } catch (_) {
      return { present: true, ok: false, error: "invalid staging JSON", raw };
    }
  }

  function quarantine(storage, key, source, raw, reason, options, issues) {
    if (raw === null || raw === undefined) return;
    const existingResult = readRaw(storage, key, issues);
    let entries = [];
    if (existingResult.ok && existingResult.raw) {
      try {
        const parsed = JSON.parse(existingResult.raw);
        if (isPlainObject(parsed) && Array.isArray(parsed.entries)) entries = parsed.entries.slice(-3);
      } catch (_) {
        entries = [];
      }
    }
    const text = typeof raw === "string" ? raw : String(raw);
    entries.push({
      source: boundedString(source, 32, "unknown"),
      reason: boundedString(reason, 180, "invalid state"),
      quarantinedAt: new Date(currentTime(options)).toISOString(),
      raw: text.slice(0, MAX_QUARANTINE_RAW),
      originalLength: text.length,
      truncated: text.length > MAX_QUARANTINE_RAW,
    });
    writeRaw(storage, key, JSON.stringify({ version: 1, entries: entries.slice(-4) }), issues);
  }

  function serializeState(state) {
    return JSON.stringify(state);
  }

  function parseImportPayload(payload, courseData, options) {
    let parsed = payload;
    if (typeof payload === "string") {
      if (payload.length > MAX_IMPORT_BYTES) return { ok: false, error: "import is oversized", errorType: "validation", issues: [], state: null };
      try {
        parsed = JSON.parse(payload);
      } catch (_) {
        return { ok: false, error: "import is not valid JSON", errorType: "validation", issues: [], state: null };
      }
    } else {
      try {
        if (JSON.stringify(payload).length > MAX_IMPORT_BYTES) return { ok: false, error: "import is oversized", errorType: "validation", issues: [], state: null };
      } catch (_) {
        return { ok: false, error: "import is not serializable JSON", errorType: "validation", issues: [], state: null };
      }
    }
    if (isPlainObject(parsed) && Object.prototype.hasOwnProperty.call(parsed, "state")) parsed = parsed.state;
    const structuralError = storedStateStructuralError(parsed, courseData, options);
    if (structuralError) return { ok: false, error: structuralError, errorType: "validation", issues: [], state: null };
    const normalized = normalizeState(parsed, courseData, options);
    if (!normalized.ok) return { ...normalized, errorType: "validation" };
    const sourceVersion = normalized.sourceVersion;
    const state = quarantineImportedQualification(normalized.state, sourceVersion, options);
    const verified = normalizeState(state, courseData, options);
    if (!verified.ok) return { ...verified, errorType: "validation" };
    verified.issues.unshift("Imported learning history is unverified; mastery, diagnostic, Today, journal and ELP qualification require local revalidation");
    return { ...verified, sourceVersion, migrated: normalized.migrated || verified.migrated };
  }

  function createStateStore(config) {
    const settings = isPlainObject(config) ? config : {};
    const storage = settings.storage;
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function" || typeof storage.removeItem !== "function") {
      throw new TypeError("createStateStore requires a Storage-compatible object");
    }
    const courseData = isPlainObject(settings.courseData) ? settings.courseData : {};
    const storageKey = boundedString(settings.storageKey, 160, "truck-driver-english-state-v1") || "truck-driver-english-state-v1";
    const keys = Object.freeze({
      primary: storageKey,
      backup: settings.backupKey || `${storageKey}-backup`,
      quarantine: settings.quarantineKey || `${storageKey}-quarantine`,
      staging: settings.stagingKey || `${storageKey}-staging`,
    });
    const preparedCandidates = new WeakSet();
    const options = { now: settings.now || Date.now };

    function load() {
      const issues = [];
      let persistenceError = false;
      const primaryRead = readRaw(storage, keys.primary, issues);
      const backupRead = readRaw(storage, keys.backup, issues);
      const stagingRead = readRaw(storage, keys.staging, issues);
      const primary = primaryRead.ok ? decodeStateRaw(primaryRead.raw, courseData, options) : { present: false, ok: false, error: "read failed" };
      const backup = backupRead.ok ? decodeStateRaw(backupRead.raw, courseData, options) : { present: false, ok: false, error: "read failed" };
      const staging = stagingRead.ok ? decodeStagingRaw(stagingRead.raw, courseData, options) : { present: false, ok: false, error: "read failed" };

      const healthy = candidate => Boolean(candidate && candidate.ok && candidate.semanticHealthy !== false);
      const candidateTime = candidate => candidate && candidate.ok ? dateMilliseconds(candidate.state.updatedAt) : -Infinity;
      const candidateIssues = candidate => [
        ...(Array.isArray(candidate && candidate.issues) ? candidate.issues : []),
        ...(Array.isArray(candidate && candidate.semanticIssues) ? candidate.semanticIssues : []),
      ];
      const semanticReason = candidate => candidate?.semanticIssues?.length
        ? `semantic inconsistency: ${candidate.semanticIssues.join("; ")}`
        : candidate?.error || "invalid state";
      const persistent = [
        { source: "main", candidate: primary, preference: 1 },
        { source: "backup", candidate: backup, preference: 0 },
      ].filter(item => item.candidate.ok);
      persistent.sort((left, right) => {
        const healthDifference = Number(healthy(right.candidate)) - Number(healthy(left.candidate));
        if (healthDifference) return healthDifference;
        const timeDifference = candidateTime(right.candidate) - candidateTime(left.candidate);
        if (timeDifference) return timeDifference;
        return right.preference - left.preference;
      });
      const bestPersistent = persistent[0] || null;

      if (staging.present && !staging.ok) quarantine(storage, keys.quarantine, "staging", staging.raw, staging.error, options, issues);
      if (staging.ok) {
        const stagingTime = dateMilliseconds(staging.state.updatedAt);
        const stagingCanonical = serializeState(staging.state);
        const primaryMatches = primary.ok && serializeState(primary.state) === stagingCanonical;
        if (primaryMatches) {
          if (!removeRaw(storage, keys.staging, issues)) persistenceError = true;
        } else if (healthy(staging)
          && (!bestPersistent || !healthy(bestPersistent.candidate) || stagingTime >= candidateTime(bestPersistent.candidate))) {
          if (backup.present && (!backup.ok || !healthy(backup))) {
            quarantine(storage, keys.quarantine, "backup", backup.raw, semanticReason(backup), options, issues);
          }
          if (primary.present && (!primary.ok || !healthy(primary))) {
            quarantine(storage, keys.quarantine, "main", primary.raw, semanticReason(primary), options, issues);
          }
          if (bestPersistent
            && (!backup.ok || serializeState(backup.state) !== serializeState(bestPersistent.candidate.state))
            && !writeRaw(storage, keys.backup, serializeState(bestPersistent.candidate.state), issues)) persistenceError = true;
          if (writeRaw(storage, keys.primary, serializeState(staging.state), issues)) {
            if (!removeRaw(storage, keys.staging, issues)) persistenceError = true;
            return {
              state: staging.state,
              source: "staging",
              recovered: true,
              ...(persistenceError ? { persistenceError: true } : {}),
              issues: [...issues, ...candidateIssues(staging)],
            };
          }
          return {
            state: staging.state,
            source: "staging",
            recovered: true,
            persistenceError: true,
            stagingPreserved: true,
            issues: [...issues, ...candidateIssues(staging)],
          };
        } else if (!healthy(staging)) {
          quarantine(storage, keys.quarantine, "staging", staging.raw, semanticReason(staging), options, issues);
        }
      }

      if (bestPersistent?.source === "main") {
        const canonical = serializeState(bestPersistent.candidate.state);
        const semanticRecovery = !healthy(primary);
        if (semanticRecovery) quarantine(storage, keys.quarantine, "main", primary.raw, semanticReason(primary), options, issues);
        if (primary.raw !== canonical && !writeRaw(storage, keys.primary, canonical, issues)) persistenceError = true;
        if (backup.present && (!backup.ok || !healthy(backup))) {
          quarantine(storage, keys.quarantine, "backup", backup.raw, semanticReason(backup), options, issues);
          if (!writeRaw(storage, keys.backup, canonical, issues)) persistenceError = true;
        } else if (!backup.present) {
          if (!writeRaw(storage, keys.backup, canonical, issues)) persistenceError = true;
        } else if (backup.ok && backup.raw !== serializeState(backup.state)) {
          if (!writeRaw(storage, keys.backup, serializeState(backup.state), issues)) persistenceError = true;
        }
        return {
          state: primary.state,
          source: "main",
          recovered: semanticRecovery,
          ...(persistenceError ? { persistenceError: true } : {}),
          issues: [...issues, ...candidateIssues(primary)],
        };
      }

      if (bestPersistent?.source === "backup") {
        if (primary.present && (!primary.ok || !healthy(primary))) {
          quarantine(storage, keys.quarantine, "main", primary.raw, semanticReason(primary), options, issues);
        }
        if (!writeRaw(storage, keys.primary, serializeState(bestPersistent.candidate.state), issues)) persistenceError = true;
        return {
          state: backup.state,
          source: "backup",
          recovered: true,
          ...(persistenceError ? { persistenceError: true } : {}),
          issues: [...issues, ...candidateIssues(primary), ...candidateIssues(backup)],
        };
      }

      if (primary.present) quarantine(storage, keys.quarantine, "main", primary.raw, semanticReason(primary), options, issues);
      if (backup.present) quarantine(storage, keys.quarantine, "backup", backup.raw, backup.error, options, issues);
      return { state: createDefaultState(courseData, options), source: "default", recovered: false, issues };
    }

    function commitState(candidateState, reason) {
      const issues = [];
      const structuralError = storedStateStructuralError(candidateState, courseData, options);
      if (structuralError) return { ok: false, error: structuralError, errorType: "validation", issues, state: null };
      const normalized = normalizeState(candidateState, courseData, options);
      if (!normalized.ok) return { ok: false, error: normalized.error, errorType: "validation", issues: normalized.issues, state: null };
      const state = normalized.state;
      state.updatedAt = new Date(currentTime(options)).toISOString();
      const serialized = serializeState(state);
      const stagingEnvelope = JSON.stringify({
        kind: "truck-state-transaction-v1",
        reason: boundedString(reason, 32, "save"),
        createdAt: state.updatedAt,
        state,
      });
      if (serialized.length > MAX_IMPORT_BYTES || stagingEnvelope.length > MAX_IMPORT_BYTES) {
        return {
          ok: false,
          error: "state exceeds safe storage size",
          errorType: "persistence",
          issues: ["serialized state cannot be decoded by the storage recovery path"],
          state,
        };
      }
      const originalPrimary = readRaw(storage, keys.primary, issues);
      const originalBackup = readRaw(storage, keys.backup, issues);
      const originalStaging = readRaw(storage, keys.staging, issues);
      if (!originalPrimary.ok || !originalBackup.ok || !originalStaging.ok) {
        return { ok: false, error: "storage read failed", errorType: "persistence", issues, state: null };
      }
      const current = decodeStateRaw(originalPrimary.raw, courseData, options);
      const existingBackup = decodeStateRaw(originalBackup.raw, courseData, options);
      if (!writeRaw(storage, keys.staging, stagingEnvelope, issues)) return { ok: false, error: "unable to stage state", errorType: "persistence", issues, state: null };

      let desiredBackup = null;
      if (current.ok) desiredBackup = serializeState(current.state);
      else if (existingBackup.ok) desiredBackup = originalBackup.raw;
      if (current.present && !current.ok) quarantine(storage, keys.quarantine, "main", current.raw, current.error, options, issues);
      if (existingBackup.present && !existingBackup.ok) quarantine(storage, keys.quarantine, "backup", existingBackup.raw, existingBackup.error, options, issues);

      if (desiredBackup !== null && !writeRaw(storage, keys.backup, desiredBackup, issues)) {
        return { ok: false, error: "unable to preserve backup", errorType: "persistence", staged: true, issues, state };
      }
      if (!writeRaw(storage, keys.primary, serialized, issues)) {
        restoreRaw(storage, keys.primary, originalPrimary.raw, issues);
        restoreRaw(storage, keys.backup, originalBackup.raw, issues);
        return { ok: false, error: "unable to write primary state", errorType: "persistence", staged: true, issues, state };
      }
      if (desiredBackup === null && !writeRaw(storage, keys.backup, serialized, issues)) {
        restoreRaw(storage, keys.primary, originalPrimary.raw, issues);
        restoreRaw(storage, keys.backup, originalBackup.raw, issues);
        return { ok: false, error: "unable to create initial backup", errorType: "persistence", staged: true, issues, state };
      }
      removeRaw(storage, keys.staging, issues);
      return { ok: true, state, issues: [...issues, ...normalized.issues] };
    }

    function prepareImport(payload) {
      const result = parseImportPayload(payload, courseData, options);
      if (!result.ok) return result;
      result.state.updatedAt = new Date(currentTime(options)).toISOString();
      const candidate = {
        state: cloneJson(result.state),
        issues: [...result.issues],
        sourceVersion: result.sourceVersion,
      };
      preparedCandidates.add(candidate);
      return { ok: true, candidate, issues: candidate.issues };
    }

    function commitImport(candidate) {
      if (!isPlainObject(candidate) || !preparedCandidates.has(candidate)) {
        return { ok: false, error: "import candidate was not prepared by this store", errorType: "validation", issues: [], state: null };
      }
      const result = commitState(candidate.state, "import");
      if (result.ok || result.errorType === "validation") preparedCandidates.delete(candidate);
      return result;
    }

    function save(state) {
      return commitState(state, "save");
    }

    function reset() {
      const issues = [];
      const state = createDefaultState(courseData, options);
      const serialized = serializeState(state);
      const originalPrimary = readRaw(storage, keys.primary, issues);
      const originalBackup = readRaw(storage, keys.backup, issues);
      const originalStaging = readRaw(storage, keys.staging, issues);
      const originalQuarantine = readRaw(storage, keys.quarantine, issues);
      if (![originalPrimary, originalBackup, originalStaging, originalQuarantine].every(item => item.ok)) {
        return { ok: false, error: "storage read failed", errorType: "persistence", issues, state: null };
      }
      const envelope = JSON.stringify({ kind: "truck-state-transaction-v1", reason: "reset", createdAt: state.updatedAt, state });
      if (!writeRaw(storage, keys.staging, envelope, issues)) return { ok: false, error: "unable to stage reset", errorType: "persistence", issues, state: null };
      if (!writeRaw(storage, keys.primary, serialized, issues) || !writeRaw(storage, keys.backup, serialized, issues)) {
        restoreRaw(storage, keys.primary, originalPrimary.raw, issues);
        restoreRaw(storage, keys.backup, originalBackup.raw, issues);
        restoreRaw(storage, keys.quarantine, originalQuarantine.raw, issues);
        return { ok: false, error: "unable to reset state", errorType: "persistence", staged: true, issues, state };
      }
      removeRaw(storage, keys.quarantine, issues);
      removeRaw(storage, keys.staging, issues);
      return { ok: true, state, issues };
    }

    return Object.freeze({
      keys,
      load,
      save,
      prepareImport,
      commitImport,
      reset,
      normalize: value => normalizeState(value, courseData, options),
      defaultState: () => createDefaultState(courseData, options),
      recordAttempt: (state, bucket, id, attempt) => recordAttempt(state, bucket, id, attempt, courseData, options),
      recordEvidence: (state, bucket, id, evidence) => recordAttempt(state, bucket, id, evidence, courseData, options),
      recordDailyAttempt: (state, attempt) => recordDailyAttempt(state, attempt, courseData, options),
      addError: (state, item) => addError(state, item, courseData, options),
      recordErrorAttempt: (state, type, id, evidence) => recordErrorAttempt(state, type, id, evidence, courseData, options),
      errorBindingForContent: (state, bucket, id) => errorBindingForContent(state, bucket, id, buildAllowlists(courseData)),
    });
  }

  class MemoryStorage {
    constructor(initial) {
      this.values = new Map();
      if (isPlainObject(initial)) {
        for (const [key, value] of Object.entries(initial)) this.values.set(String(key), String(value));
      }
    }

    get length() {
      return this.values.size;
    }

    key(index) {
      return [...this.values.keys()][index] || null;
    }

    getItem(key) {
      const normalized = String(key);
      return this.values.has(normalized) ? this.values.get(normalized) : null;
    }

    setItem(key, value) {
      this.values.set(String(key), String(value));
    }

    removeItem(key) {
      this.values.delete(String(key));
    }

    clear() {
      this.values.clear();
    }

    snapshot() {
      return Object.fromEntries(this.values);
    }
  }

  /*
   * Browser API: window.TruckDriverStateStore.
   * Node API: require("./state-store.js").
   * createStateStore({storage, courseData, storageKey, now}) returns load,
   * save, prepareImport, commitImport, reset, normalize, recordEvidence,
   * recordAttempt, recordDailyAttempt, addError and recordErrorAttempt.
   * recordDailyAttempt requires qualificationContextKey(state.profile,
   * state.applicability) as attempt.contextKey. Error mutations bind to that
   * current context and may additionally require an exact semanticBranch.
   * prepareImport never writes. Only commitImport accepts its prepared candidate.
   */
  return Object.freeze({
    STATE_VERSION,
    INITIAL_SESSION_ORDINAL,
    MAX_SESSION_ORDINAL,
    MASTERY_GAP_MS,
    FAILURE_RETRY_MS,
    SRS_GRADES,
    OBJECTIVE_EVALUATORS,
    EQUIPMENT_DEFAULTS,
    CONDITION_DEFAULTS,
    PROGRESS_BUCKETS,
    MemoryStorage,
    isPlainObject,
    buildAllowlists,
    collectMigrationMaps,
    createDefaultState,
    normalizeApplicability,
    qualificationContextKey,
    materializationScopeBranch,
    normalizeState,
    appendEvidence,
    createDemonstratedEvidence,
    isObjectiveAttemptEvidence,
    isQualifyingEvidence,
    recordEvidence,
    recordAttempt,
    recordDailyAttempt,
    addError,
    recordErrorAttempt,
    errorStage,
    isMastered,
    isDue,
    masteryStatus,
    scheduleForEvidence,
    nextDueDeadline,
    parseImportPayload,
    createStateStore,
  });
});
