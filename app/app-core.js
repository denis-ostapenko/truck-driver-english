(function initTruckAppCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TruckAppCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTruckAppCore() {
  "use strict";

  const EQUIPMENT_PROFILES = Object.freeze(["tractor", "hotshot-open", "hotshot-enclosed"]);
  const PROFILES = Object.freeze([...EQUIPMENT_PROFILES, "both"]);
  const DIAGNOSTIC_CATEGORIES = Object.freeze(["vocabulary", "listening", "elp", "inspection"]);
  const NEW_YORK_TIME_ZONE = "America/New_York";
  const DUE_TYPES = Object.freeze(["words", "questions", "signs", "situations", "documents", "lessons"]);

  const EQUIPMENT_VALUES = Object.freeze([
    "tractor-trailer",
    "hotshot",
    "pickup",
    "gooseneck",
    "open-trailer",
    "enclosed-trailer",
    "air-brakes",
    "dry-van",
    "load-bars",
  ]);

  const CONDITION_VALUES = Object.freeze([
    "cdl-required",
    "medical-variance-or-spe-applicable",
    "periodic-inspection-proof-applicable",
    "permit-applicable",
    "trip-specific",
    "hazmat",
    "eld-or-rods-applicable",
    "eld-malfunction",
    "medical-status-proof",
    "spe-variance",
    "dvir-applicable",
    "eld-required",
    "scale-ticket-issued",
    "ifta-applicable",
    "oversize-or-overweight",
    "post-inspection",
    "delivery",
    "dimension-or-weight-applicable",
    "transported-automobile-or-light-truck-at-most-10000-lb",
    "transported-automobile-or-light-truck-over-10000-lb",
    "enclosed-trailer",
    "vehicle-transport",
    "chains-required",
    "registration-required",
    "cargo",
    "cargo-securement",
    "road-not-divided",
    "road-divided",
    "hill-or-curve-obstructed",
  ]);

  const PROFILE_ALIASES = Object.freeze({
    truck: "tractor",
    "tractor-trailer": "tractor",
    hotshot: "hotshot-open",
  });

  const PROFILE_EQUIPMENT = Object.freeze({
    tractor: Object.freeze(["tractor-trailer"]),
    "hotshot-open": Object.freeze(["hotshot", "pickup", "gooseneck", "open-trailer"]),
    "hotshot-enclosed": Object.freeze(["hotshot", "pickup", "gooseneck", "enclosed-trailer"]),
  });

  const EQUIPMENT_SETTING_MAP = Object.freeze({
    airBrakes: Object.freeze(["air-brakes"]),
    "air-brakes": Object.freeze(["air-brakes"]),
    dryVan: Object.freeze(["dry-van"]),
    "dry-van": Object.freeze(["dry-van"]),
    loadBars: Object.freeze(["load-bars", "dry-van"]),
    "load-bars": Object.freeze(["load-bars", "dry-van"]),
  });

  const CONDITION_SETTING_MAP = Object.freeze({
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
    roadNotDivided: Object.freeze(["road-not-divided"]),
    roadDivided: Object.freeze(["road-divided"]),
    hillOrCurveObstructed: Object.freeze(["hill-or-curve-obstructed"]),
  });

  const CONDITION_IMPLICATIONS = Object.freeze({
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

  const SESSION_WORKLOADS = Object.freeze({
    5: Object.freeze({ taskCount: 1, newItemsPerTask: 2, reviewItemsPerTask: 3 }),
    10: Object.freeze({ taskCount: 2, newItemsPerTask: 3, reviewItemsPerTask: 4 }),
    15: Object.freeze({ taskCount: 3, newItemsPerTask: 4, reviewItemsPerTask: 5 }),
  });

  const MINUTE_MS = 60 * 1000;
  const DAY_MS = 24 * 60 * MINUTE_MS;
  const SRS_OPTIONS = Object.freeze({
    again: Object.freeze({ id: "again", label: "Снова · 10 минут", shortLabel: "10 минут", intervalMs: 10 * MINUTE_MS, intervalDays: 0, outcome: "failed" }),
    hard: Object.freeze({ id: "hard", label: "Трудно · 1 день", shortLabel: "1 день", intervalMs: DAY_MS, intervalDays: 1, outcome: "partial" }),
    good: Object.freeze({ id: "good", label: "Хорошо · 3 дня", shortLabel: "3 дня", intervalMs: 3 * DAY_MS, intervalDays: 3, outcome: "success" }),
    easy: Object.freeze({ id: "easy", label: "Легко · 7 дней", shortLabel: "7 дней", intervalMs: 7 * DAY_MS, intervalDays: 7, outcome: "success" }),
  });

  const EQUIPMENT_SET = new Set(EQUIPMENT_VALUES);
  const CONDITION_SET = new Set(CONDITION_VALUES);
  const DUE_TYPE_ALIASES = Object.freeze({
    word: "words",
    unit: "words",
    units: "words",
    due: "words",
    question: "questions",
    "due-questions": "questions",
    sign: "signs",
    "due-signs": "signs",
    situation: "situations",
    "due-situations": "situations",
    document: "documents",
    "due-documents": "documents",
    lesson: "lessons",
    "due-lessons": "lessons",
  });

  function localDateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: NEW_YORK_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${byType.year}-${byType.month}-${byType.day}`;
  }

  function nextLocalDateBoundary(value = new Date()) {
    const start = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (!Number.isFinite(start)) return NaN;
    const date = localDateKey(start);
    let low = start;
    let high = start + 36 * 60 * 60 * 1000;
    if (localDateKey(high) === date) return NaN;
    while (high - low > 1) {
      const middle = low + Math.floor((high - low) / 2);
      if (localDateKey(middle) === date) low = middle;
      else high = middle;
    }
    return high;
  }

  function canonicalProfile(profile) {
    const value = typeof profile === "string" ? profile.trim().toLowerCase() : "";
    const migrated = PROFILE_ALIASES[value] || value;
    return PROFILES.includes(migrated) ? migrated : null;
  }

  function normalizedProfile(profile) {
    return canonicalProfile(profile) || "both";
  }

  function enabledKeys(value) {
    if (value instanceof Set) return [...value];
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return [value];
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).filter(([, enabled]) => enabled === true).map(([key]) => key);
  }

  function addMappedValues(target, unknown, values, mapping, allowlist) {
    for (const rawValue of enabledKeys(values)) {
      const value = String(rawValue);
      const mapped = mapping[value];
      if (mapped) {
        mapped.forEach(item => target.add(item));
      } else if (allowlist.has(value)) {
        target.add(value);
      } else {
        unknown.add(value);
      }
    }
  }

  function expandConditionImplications(conditions) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const value of [...conditions]) {
        for (const implied of CONDITION_IMPLICATIONS[value] || []) {
          if (conditions.has(implied)) continue;
          conditions.add(implied);
          changed = true;
        }
      }
    }
    return conditions;
  }

  function normalizeApplicabilityContext(profileOrContext = "both", settings = null) {
    const input = profileOrContext && typeof profileOrContext === "object" && !Array.isArray(profileOrContext)
      ? profileOrContext
      : { profile: profileOrContext, applicability: settings };
    const configuration = input.applicability && typeof input.applicability === "object"
      ? input.applicability
      : input;
    const rawProfile = input.profile === undefined ? "both" : input.profile;
    const canonical = canonicalProfile(rawProfile);
    const profile = canonical || "both";
    const selectedProfiles = profile === "both" ? [...EQUIPMENT_PROFILES] : [profile];
    const equipment = new Set();
    selectedProfiles.forEach(value => PROFILE_EQUIPMENT[value].forEach(item => equipment.add(item)));
    const conditions = new Set();
    const unknownEquipment = new Set();
    const unknownConditions = new Set();
    addMappedValues(equipment, unknownEquipment, configuration.equipment, EQUIPMENT_SETTING_MAP, EQUIPMENT_SET);
    addMappedValues(conditions, unknownConditions, configuration.conditions, CONDITION_SETTING_MAP, CONDITION_SET);

    // Flat booleans are accepted to keep schema migrations and simple callers deterministic.
    addMappedValues(equipment, unknownEquipment, configuration, EQUIPMENT_SETTING_MAP, EQUIPMENT_SET);
    addMappedValues(conditions, unknownConditions, configuration, CONDITION_SETTING_MAP, CONDITION_SET);
    expandConditionImplications(conditions);

    return {
      profile,
      validProfile: Boolean(canonical),
      selectedProfiles,
      equipment: [...equipment],
      conditions: [...conditions],
      unknownEquipment: [...unknownEquipment],
      unknownConditions: [...unknownConditions],
    };
  }

  function normalizeItemProfiles(item) {
    if (!Array.isArray(item?.profiles)) return { values: [...EQUIPMENT_PROFILES], unknown: [] };
    const values = new Set();
    const unknown = [];
    for (const raw of item.profiles) {
      const profile = canonicalProfile(raw);
      if (!profile) unknown.push(String(raw));
      else if (profile === "both") EQUIPMENT_PROFILES.forEach(value => values.add(value));
      else values.add(profile);
    }
    return { values: [...values], unknown };
  }

  function normalizeItemRequirements(item, field, allowlist) {
    const source = Array.isArray(item?.[field]) ? item[field] : [];
    const values = [];
    const unknown = [];
    for (const raw of source) {
      const value = String(raw);
      if (allowlist.has(value)) values.push(value);
      else unknown.push(value);
    }
    return { values: [...new Set(values)], unknown };
  }

  function evaluateApplicability(item, profileOrContext = "both", settings = null) {
    const context = normalizeApplicabilityContext(profileOrContext, settings);
    const profiles = normalizeItemProfiles(item);
    const declaredEquipment = normalizeItemRequirements(item, "equipment", EQUIPMENT_SET);
    const additionalEquipment = normalizeItemRequirements(item, "requiredEquipment", EQUIPMENT_SET);
    const conditions = normalizeItemRequirements(item, "conditions", CONDITION_SET);
    const requiredEquipment = new Set([...declaredEquipment.values, ...additionalEquipment.values]);
    const selectedEquipment = new Set(context.equipment);
    const selectedConditions = new Set(context.conditions);
    const missingEquipment = [...requiredEquipment].filter(value => !selectedEquipment.has(value));
    const missingConditions = conditions.values.filter(value => !selectedConditions.has(value) && !selectedEquipment.has(value));
    const profileMatch = profiles.values.some(value => context.selectedProfiles.includes(value));
    const unknownMetadata = [
      ...profiles.unknown,
      ...declaredEquipment.unknown,
      ...additionalEquipment.unknown,
      ...conditions.unknown,
    ];
    const applies = Boolean(item)
      && context.validProfile
      && profileMatch
      && unknownMetadata.length === 0
      && missingEquipment.length === 0
      && missingConditions.length === 0;
    return {
      applies,
      profile: context.profile,
      profileMatch,
      requiredProfiles: profiles.values,
      requiredEquipment: [...requiredEquipment],
      requiredConditions: conditions.values,
      missingEquipment,
      missingConditions,
      unknownMetadata,
      context,
    };
  }

  function appliesTo(item, profileOrContext = "both", settings = null) {
    return evaluateApplicability(item, profileOrContext, settings).applies;
  }

  function materializeForProfile(item, profileOrContext = "both") {
    if (!item || typeof item !== "object") return item;
    const context = normalizeApplicabilityContext(profileOrContext);
    const requested = context.profile === "both" ? "tractor" : context.profile;
    const profileOverlay = item.profileMaterializations && typeof item.profileMaterializations === "object"
      ? item.profileMaterializations[requested]
      : null;
    const validOverlay = value => value && typeof value === "object" && !Array.isArray(value);
    const applyOverlay = (source, overlay, metadata = {}) => {
      const materialized = {
        ...source,
        ...overlay,
        id: item.id,
        profiles: item.profiles,
        conditions: item.conditions,
        equipment: item.equipment,
        ...metadata,
      };
      if (Object.prototype.hasOwnProperty.call(overlay, "prompt")) {
        materialized.promptDisplay = overlay.promptDisplay || overlay.prompt;
        materialized.promptSpoken = overlay.promptSpoken || overlay.prompt;
        materialized.materializedPrompt = overlay.prompt;
      }
      if (Object.prototype.hasOwnProperty.call(overlay, "answer")) {
        materialized.answerDisplay = overlay.answerDisplay || overlay.answer;
        materialized.answerSpoken = overlay.answerSpoken || overlay.answer;
        materialized.materializedAnswer = overlay.answer;
      }
      if (Array.isArray(overlay.slots)) materialized.answerSlots = overlay.answerSlots || overlay.slots;
      return materialized;
    };

    let materialized = item;
    if (validOverlay(profileOverlay)) {
      materialized = applyOverlay(materialized, profileOverlay, { materializedProfile: requested });
    }
    const conditionEntries = item.conditionMaterializations && typeof item.conditionMaterializations === "object"
      ? Object.entries(item.conditionMaterializations)
      : [];
    const activeConditionOverlays = conditionEntries.filter(([conditionId, overlay]) => (
      context.conditions.includes(conditionId)
      && validOverlay(overlay)
      && evaluateApplicability(overlay, context).applies
    ));
    if (activeConditionOverlays.length === 1) {
      const [conditionId, conditionOverlay] = activeConditionOverlays[0];
      materialized = applyOverlay(materialized, conditionOverlay, {
        materializedProfile: materialized.materializedProfile || requested,
        materializedCondition: conditionId,
        materializedConditionBranch: conditionOverlay.branchId || null,
        materializedConditionRequirements: {
          profiles: Array.isArray(conditionOverlay.profiles) ? [...conditionOverlay.profiles] : [],
          conditions: Array.isArray(conditionOverlay.conditions) ? [...conditionOverlay.conditions] : [],
        },
      });
    } else if (activeConditionOverlays.length > 1) {
      materialized = {
        ...materialized,
        materializationConflict: activeConditionOverlays.map(([conditionId]) => conditionId),
      };
    }
    return materialized;
  }

  function normalizedSemanticText(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function slotsForTurn(slots, turn = {}) {
    const source = Array.isArray(slots) ? slots : [];
    const turnId = String(turn.id || "");
    const expected = normalizedSemanticText(turn.expected || turn.modelAnswer || "");
    return source.filter(slot => {
      const explicit = Array.isArray(slot?.turnIds)
        ? slot.turnIds.map(String)
        : slot?.turnId === undefined
          ? []
          : [String(slot.turnId)];
      if (explicit.length && (!turnId || !explicit.includes(turnId))) return false;
      const values = [slot?.display, slot?.spoken, ...(Array.isArray(slot?.accepted) ? slot.accepted : [])]
        .map(normalizedSemanticText)
        .filter(Boolean);
      return slot?.requiredInResponse === true || values.some(value => expected.includes(value));
    });
  }

  function scopedTurnRequiredGroups(declaredGroups, variants, turnId, relevantSlots) {
    const groups = Array.isArray(declaredGroups) ? declaredGroups : [];
    const id = String(turnId || "");
    const ownedVariantTokens = new Set((Array.isArray(variants) ? variants : []).flatMap(entry => (
      Array.isArray(entry?.slotValues) ? entry.slotValues : []
    )
      .filter(slot => Array.isArray(slot?.turnIds) && slot.turnIds.map(String).includes(id))
      .flatMap(slot => normalizedSemanticText(slot?.display || slot?.spoken).split(" "))).filter(Boolean));
    const selectedTokens = (Array.isArray(relevantSlots) ? relevantSlots : [])
      .flatMap(slot => normalizedSemanticText(slot?.display || slot?.spoken).split(" "))
      .filter(Boolean);
    const ownsDeclaredGroup = group => (Array.isArray(group) ? group : [group])
      .some(token => ownedVariantTokens.has(normalizedSemanticText(token)));
    const output = groups.filter(group => !ownsDeclaredGroup(group)).map(group => Array.isArray(group) ? [...group] : [group]);
    if (selectedTokens.length && groups.some(ownsDeclaredGroup)) output.push(...selectedTokens.map(token => [token]));
    return output;
  }

  function filterApplicable(items, profileOrContext = "both", settings = null) {
    return Array.isArray(items) ? items.filter(item => appliesTo(item, profileOrContext, settings)) : [];
  }

  function seededRandom(seedValue) {
    let seed = (Number(seedValue) * 2654435761) >>> 0;
    return function random() {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function shuffled(values, seedValue) {
    const random = seededRandom(seedValue);
    const output = [...values];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [output[index], output[target]] = [output[target], output[index]];
    }
    return output;
  }

  function prepareDiagnostic(blueprints, seedValue) {
    return blueprints.map((blueprint, index) => {
      const item = { ...blueprint };
      if (Array.isArray(item.options)) {
        const options = item.options.map((option, optionIndex) => (
          typeof option === "string"
            ? { text: option, correct: optionIndex === Number(item.correct || 0) }
            : { text: String(option.text || ""), correct: Boolean(option.correct) }
        ));
        item.options = shuffled(options, Number(seedValue) + index * 7919);
        delete item.correct;
      }
      return item;
    });
  }

  function diagnosticBlueprint(items, requiredPerCategory = 3) {
    const counts = Object.fromEntries(DIAGNOSTIC_CATEGORIES.map(category => [category, 0]));
    const listeningStimuli = new Set();
    const duplicateListeningStimuli = [];
    for (const item of Array.isArray(items) ? items : []) {
      if (Object.prototype.hasOwnProperty.call(counts, item?.category)) counts[item.category] += 1;
      if (item?.category !== "listening") continue;
      const stimulus = String(item.stimulusVersion || item.audioId || item.audio || "").trim();
      if (!stimulus) continue;
      if (listeningStimuli.has(stimulus)) duplicateListeningStimuli.push(stimulus);
      listeningStimuli.add(stimulus);
    }
    const expectedTotal = DIAGNOSTIC_CATEGORIES.length * requiredPerCategory;
    return {
      counts,
      expectedTotal,
      total: Array.isArray(items) ? items.length : 0,
      duplicateListeningStimuli,
      valid: (Array.isArray(items) ? items.length : 0) === expectedTotal
        && DIAGNOSTIC_CATEGORIES.every(category => counts[category] === requiredPerCategory)
        && duplicateListeningStimuli.length === 0,
    };
  }

  function materializeDiagnosticForm(blueprints, options = {}) {
    const form = String(options.form || "A").toUpperCase();
    const requiredPerCategory = Number.isSafeInteger(Number(options.requiredPerCategory))
      ? Math.max(1, Number(options.requiredPerCategory))
      : 3;
    const context = options.context || null;
    const eligible = (Array.isArray(blueprints) ? blueprints : []).filter(item => {
      const forms = Array.isArray(item?.forms) ? item.forms.map(value => String(value).toUpperCase()) : null;
      const itemForm = item?.form === undefined ? null : String(item.form).toUpperCase();
      const formMatch = forms ? forms.includes(form) : !itemForm || itemForm === form;
      return formMatch && (!context || appliesTo(item, context));
    });
    const byCategory = Object.fromEntries(DIAGNOSTIC_CATEGORIES.map(category => [category, []]));
    for (const item of eligible) {
      if (byCategory[item.category]) byCategory[item.category].push(item);
    }
    const requiredItemId = options.requiredItemId === undefined ? null : String(options.requiredItemId);
    const requiredItem = requiredItemId ? eligible.find(item => String(item.id) === requiredItemId) : null;
    if (requiredItemId && !requiredItem) {
      const error = new Error(`Diagnostic item ${requiredItemId} is not applicable to form ${form}.`);
      error.code = "DIAGNOSTIC_REQUIRED_ITEM_INAPPLICABLE";
      throw error;
    }
    const selectedByCategory = Object.fromEntries(DIAGNOSTIC_CATEGORIES.map((category, index) => [
      category,
      (() => {
        const candidates = shuffled(byCategory[category].filter(item => item !== requiredItem), Number(options.seed || 0) + index * 104729);
        return requiredItem?.category === category
          ? [requiredItem, ...candidates.slice(0, Math.max(0, requiredPerCategory - 1))]
          : candidates.slice(0, requiredPerCategory);
      })(),
    ]));
    const selected = [];
    for (let slot = 0; slot < requiredPerCategory; slot += 1) {
      for (const category of DIAGNOSTIC_CATEGORIES) {
        if (selectedByCategory[category][slot]) selected.push(selectedByCategory[category][slot]);
      }
    }
    const prepared = prepareDiagnostic(selected, options.seed || 0).map(item => ({
      ...item,
      form,
      formVersion: String(options.formVersion || item.formVersion || "diagnostic-v1"),
      stimulusVersion: String(item.stimulusVersion || `${item.id || "item"}@1`),
    }));
    const blueprint = diagnosticBlueprint(prepared, requiredPerCategory);
    if (!blueprint.valid) {
      const error = new Error(`Diagnostic form ${form} does not satisfy the ${requiredPerCategory} x ${DIAGNOSTIC_CATEGORIES.length} blueprint.`);
      error.code = "DIAGNOSTIC_BLUEPRINT_INVALID";
      error.blueprint = blueprint;
      throw error;
    }
    return prepared;
  }

  function diagnosticScores(items, answers) {
    const totals = Object.fromEntries(DIAGNOSTIC_CATEGORIES.map(category => [category, { earned: 0, possible: 0, answered: 0 }]));
    items.forEach((item, index) => {
      if (!totals[item.category]) return;
      totals[item.category].possible += 1;
      const answer = answers[index];
      if (!answer || !Number.isFinite(Number(answer.score))) return;
      totals[item.category].answered += 1;
      totals[item.category].earned += Math.max(0, Math.min(1, Number(answer.score)));
    });
    return totals;
  }

  function diagnosticRecommendation(scores) {
    const labels = {
      vocabulary: "Начните с профессиональных карточек и повторной проверки завтра.",
      listening: "Начните с доступных записей и короткого повтора без текста.",
      elp: "Начните с репрезентативных тренировочных вопросов и собственных коротких ответов.",
      inspection: "Начните с безопасной последовательности команд и последствий каждого действия.",
    };
    const ranked = DIAGNOSTIC_CATEGORIES.map((category, order) => {
      const score = scores?.[category] || { earned: 0, possible: 0, answered: 0 };
      const ratio = score.possible ? score.earned / score.possible : 0;
      return { category, ratio, answered: score.answered, order };
    }).sort((left, right) => left.ratio - right.ratio || left.answered - right.answered || left.order - right.order);
    const weakest = ranked[0]?.category || "vocabulary";
    const complete = ranked.every(item => item.answered >= 2);
    const strong = ranked.every(item => item.ratio >= 0.75);
    return {
      weakest,
      recommendation: !complete
        ? "Диагностика не завершена. Продолжите с короткого смешанного маршрута."
        : strong
          ? "Начните со смешанного маршрута: повторение, профессиональная фраза и одна рабочая ситуация."
          : labels[weakest],
    };
  }

  function timestamp(value, fallback = NaN) {
    const source = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : Number(value);
    return Number.isFinite(source) ? source : fallback;
  }

  function dueAtMilliseconds(record) {
    return timestamp(record?.dueAt || record?.nextDueAt || record?.record?.dueAt || record?.record?.nextDueAt);
  }

  function isDueRecord(record, now = new Date()) {
    const due = dueAtMilliseconds(record);
    return Number.isFinite(due) && due <= timestamp(now, Date.now());
  }

  function nextDueAt(records, now = new Date()) {
    const current = timestamp(now, Date.now());
    const future = (Array.isArray(records) ? records : [])
      .map(dueAtMilliseconds)
      .filter(value => Number.isFinite(value) && value > current)
      .sort((left, right) => left - right)[0];
    return Number.isFinite(future) ? new Date(future).toISOString() : null;
  }

  function canonicalDueType(value) {
    const type = String(value || "").toLowerCase();
    const canonical = DUE_TYPE_ALIASES[type] || type;
    return DUE_TYPES.includes(canonical) ? canonical : null;
  }

  function itemDueType(item, fallback = null) {
    return canonicalDueType(item?.dueType || item?.bucket || item?.type || item?.key || fallback);
  }

  function dueItemIdentity(item, type, index) {
    const id = item?.id || item?.content?.id || item?.item?.id || item?.key;
    return id ? `${type}\0${id}` : `${type}\0index:${index}`;
  }

  function normalizeDueGroups(input, options = {}) {
    const groups = Object.fromEntries(DUE_TYPES.map(type => [type, []]));
    const now = timestamp(options.now, Date.now());
    const dueOnly = options.dueOnly !== false;
    const seen = new Set();
    const add = (item, fallback, index) => {
      if (!item) return;
      const type = itemDueType(item, fallback);
      if (!type) return;
      const due = dueAtMilliseconds(item);
      if (dueOnly && Number.isFinite(due) && due > now) return;
      if (dueOnly && options.requireDueAt === true && !Number.isFinite(due)) return;
      const content = item.content || item.item;
      if (options.context && content && !appliesTo(content, options.context)) return;
      const identity = dueItemIdentity(item, type, index);
      if (seen.has(identity)) return;
      seen.add(identity);
      groups[type].push(item);
    };
    if (Array.isArray(input)) {
      input.forEach((item, index) => add(item, null, index));
    } else if (input && typeof input === "object") {
      DUE_TYPES.forEach(type => (Array.isArray(input[type]) ? input[type] : []).forEach((item, index) => add(item, type, index)));
    }
    DUE_TYPES.forEach(type => groups[type].sort((left, right) => {
      const leftDue = dueAtMilliseconds(left);
      const rightDue = dueAtMilliseconds(right);
      if (Number.isFinite(leftDue) && Number.isFinite(rightDue) && leftDue !== rightDue) return leftDue - rightDue;
      if (Number.isFinite(leftDue) !== Number.isFinite(rightDue)) return Number.isFinite(leftDue) ? -1 : 1;
      return String(left.id || left.key || "").localeCompare(String(right.id || right.key || ""));
    }));
    return groups;
  }

  function dueCursorIndex(cursor) {
    const byType = canonicalDueType(cursor);
    if (byType) return DUE_TYPES.indexOf(byType);
    const numeric = Number(cursor);
    return Number.isSafeInteger(numeric) ? ((numeric % DUE_TYPES.length) + DUE_TYPES.length) % DUE_TYPES.length : 0;
  }

  function dueQueueSnapshot(input, options = {}) {
    const groups = normalizeDueGroups(input, options);
    const limit = Number.isSafeInteger(Number(options.limit)) && Number(options.limit) >= 0 ? Number(options.limit) : Number.POSITIVE_INFINITY;
    const queues = Object.fromEntries(DUE_TYPES.map(type => [type, [...groups[type]]]));
    const items = [];
    let cursor = dueCursorIndex(options.cursor);
    let lastTypeIndex = cursor;
    while (items.length < limit) {
      let selected = false;
      for (let offset = 0; offset < DUE_TYPES.length && items.length < limit; offset += 1) {
        const typeIndex = (cursor + offset) % DUE_TYPES.length;
        const type = DUE_TYPES[typeIndex];
        if (!queues[type].length) continue;
        items.push(queues[type].shift());
        lastTypeIndex = typeIndex;
        selected = true;
      }
      if (!selected) break;
      cursor = (lastTypeIndex + 1) % DUE_TYPES.length;
    }
    const flatInput = Array.isArray(input)
      ? input
      : input && typeof input === "object"
        ? DUE_TYPES.flatMap(type => Array.isArray(input[type]) ? input[type] : [])
        : [];
    return {
      items,
      nextCursor: (lastTypeIndex + 1) % DUE_TYPES.length,
      nextType: DUE_TYPES[(lastTypeIndex + 1) % DUE_TYPES.length],
      nextWakeAt: nextDueAt(flatInput, options.now),
    };
  }

  function roundRobinDueItems(input, options = {}) {
    return dueQueueSnapshot(input, options).items;
  }

  function sessionWorkload(minutes) {
    return SESSION_WORKLOADS[[5, 10, 15].includes(Number(minutes)) ? Number(minutes) : 10];
  }

  function taskIsError(task) {
    return task?.key === "errors" || task?.kind === "error" || task?.error === true;
  }

  function taskIsDue(task) {
    return task?.due === true || task?.kind === "due" || task?.key === "due" || String(task?.key || "").startsWith("due-");
  }

  function taskOrder(task, index) {
    for (const value of [task?.progression, task?.sequence, task?.order]) {
      if (Number.isFinite(Number(value))) return Number(value);
    }
    return index;
  }

  function trimTaskWorkload(task, workload) {
    if (!Array.isArray(task?.ids)) return task;
    if (task.atomic === true) return task;
    const maximum = taskIsDue(task) ? workload.reviewItemsPerTask : workload.newItemsPerTask;
    if (task.ids.length <= maximum) return task;
    const declaredProfessionalIds = enabledKeys(task.professionalIds).map(String);
    const inferredProfessionalIds = task.ids.filter(id => /^[th]:/.test(String(id)));
    const professionalIds = declaredProfessionalIds.length
      ? declaredProfessionalIds
      : inferredProfessionalIds.length
        ? inferredProfessionalIds
        : task.key === "due" && task.professional === true
          ? [String(task.ids[task.ids.length - 1])]
          : [];
    const ids = task.ids.slice(0, maximum);
    if (task.professional === true && professionalIds.length && !ids.some(id => professionalIds.includes(String(id)))) {
      ids[ids.length - 1] = task.ids.find(id => professionalIds.includes(String(id))) || task.ids[task.ids.length - 1];
    }
    return { ...task, ids };
  }

  function chooseSessionTasks(tasks, options = {}) {
    const workload = sessionWorkload(options.minutes);
    const source = (Array.isArray(tasks) ? tasks : [])
      .filter(Boolean)
      .filter((task, index, values) => values.findIndex(entry => entry?.key === task.key) === index)
      .filter(task => !options.context || !task.content || appliesTo(task.content, options.context));
    const indexed = source.map((task, index) => ({ task, index }));
    const ordered = values => values.sort((left, right) => taskOrder(left.task, left.index) - taskOrder(right.task, right.index)).map(entry => entry.task);
    const errors = ordered(indexed.filter(entry => taskIsError(entry.task)));
    const due = roundRobinDueItems(ordered(indexed.filter(entry => taskIsDue(entry.task))), {
      dueOnly: false,
      cursor: options.dueCursor,
    });
    const priority = ordered(indexed.filter(entry => entry.task.priority && !taskIsError(entry.task) && !taskIsDue(entry.task)));
    const professional = ordered(indexed.filter(entry => entry.task.professional && !taskIsError(entry.task) && !taskIsDue(entry.task) && !entry.task.priority));
    const remaining = ordered(indexed.filter(entry => !taskIsError(entry.task) && !taskIsDue(entry.task) && !entry.task.priority && !entry.task.professional));
    const selected = [];
    const add = task => {
      if (task && selected.length < workload.taskCount && !selected.some(item => item.key === task.key)) selected.push(task);
    };
    errors.forEach(add);
    due.forEach(add);
    priority.forEach(add);
    professional.forEach(add);
    remaining.forEach(add);

    const firstProfessional = source.find(task => task.professional);
    if (firstProfessional && !selected.some(task => task.professional)) {
      const replaceable = selected.map((task, index) => ({ task, index })).reverse().find(entry => !taskIsError(entry.task));
      if (replaceable) selected[replaceable.index] = firstProfessional;
      else add(firstProfessional);
    }
    return selected.slice(0, workload.taskCount).map(task => trimTaskWorkload(task, workload));
  }

  function selectTodayTasks(tasks, attempts, options = {}) {
    const workload = sessionWorkload(options.minutes);
    const date = typeof options.date === "string" && options.date
      ? options.date
      : localDateKey(options.now === undefined ? new Date() : options.now);
    const source = (Array.isArray(tasks) ? tasks : [])
      .filter(task => task && typeof task.key === "string" && task.key)
      .filter((task, index, values) => values.findIndex(entry => entry.key === task.key) === index)
      .filter(task => !options.context || !task.content || appliesTo(task.content, options.context));
    const byKey = new Map(source.map(task => [task.key, task]));
    const completed = task => dailyTaskCompleted({ ...task, date }, attempts, { ...options, date });
    const requestedRouteKeys = Array.isArray(options.routeKeys)
      ? [...new Set(options.routeKeys.filter(key => typeof key === "string" && key))].slice(0, workload.taskCount)
      : [];
    const fixedRoute = requestedRouteKeys.length > 0;
    if (fixedRoute) {
      const routeKeys = [...requestedRouteKeys];
      const dueCursor = dueCursorIndex(options.dueCursor);
      const routeTasks = routeKeys.map(key => byKey.get(key)).filter(Boolean).map(task => trimTaskWorkload(task, workload));
      const pendingTasks = routeTasks.filter(task => !completed(task));
      const completedKeys = routeKeys.filter(key => {
        const task = byKey.get(key);
        return !task || completed(task);
      });
      return {
        date,
        tasks: pendingTasks,
        routeTasks,
        routeKeys,
        completedKeys,
        dueCursor,
        taskCount: workload.taskCount,
        complete: completedKeys.length === routeKeys.length,
        backlogKeys: source.filter(task => !routeKeys.includes(task.key) && !completed(task)).map(task => task.key),
      };
    }

    const pendingSource = source.filter(task => !completed(task));
    const selected = chooseSessionTasks(pendingSource, options);
    const selectedDueCount = selected.filter(taskIsDue).length;
    const dueCursor = selectedDueCount
      ? dueQueueSnapshot(pendingSource.filter(taskIsDue), {
          dueOnly: false,
          cursor: options.dueCursor,
          limit: selectedDueCount,
        }).nextCursor
      : dueCursorIndex(options.dueCursor);
    return {
      date,
      tasks: selected,
      routeTasks: selected,
      routeKeys: selected.map(task => task.key),
      completedKeys: [],
      dueCursor,
      taskCount: workload.taskCount,
      complete: selected.length === 0,
      backlogKeys: pendingSource.filter(task => !selected.some(chosen => chosen.key === task.key)).map(task => task.key),
    };
  }

  function qualifyingDailySuccess(attempt) {
    if (!attempt || attempt.completed !== true) return false;
    const evidence = attempt.evidence && typeof attempt.evidence === "object" ? attempt.evidence : attempt;
    if (attempt.trust === "imported-unverified" || evidence.kind === "imported-unverified" || evidence.verified === false) return false;
    if (evidence.revealed === true || evidence.preReveal === false) return false;
    if (["hint", "reveal", "model"].includes(String(evidence.support || "").toLowerCase())) return false;
    if (evidence.outcome === "success") return evidence.independent === true;
    return ["independent", "correct", "corrected", "confirmed", "success"].includes(String(evidence.result || "").toLowerCase());
  }

  function dailyAttemptVariant(attempt) {
    const declared = [attempt?.evidence?.variant, attempt?.variant]
      .filter(value => typeof value === "string" && value.trim());
    if (!declared.length) return { declared: false, valid: true, base: "" };
    const parsed = declared.map(value => {
      const parts = value.split("|").map(part => part.trim());
      if (!parts.length || parts.some(part => !part)) return null;
      const base = parts.pop().toLowerCase();
      const validPrefixes = parts.every(part => /^(?:profile|condition):[a-z0-9][a-z0-9-]*$/i.test(part));
      return validPrefixes && base ? base : null;
    });
    const base = parsed[0];
    return {
      declared: true,
      valid: Boolean(base) && parsed.every(value => value === base),
      base: base || "",
    };
  }

  function dailyErrorTarget(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const type = typeof value.type === "string" ? value.type : "";
    const id = typeof value.id === "string" ? value.id : "";
    const contextKey = value.contextKey === null || typeof value.contextKey === "string" ? value.contextKey : undefined;
    const semanticBranch = value.semanticBranch === null || typeof value.semanticBranch === "string" ? value.semanticBranch : undefined;
    if (!type || !id || contextKey === undefined || semanticBranch === undefined) return null;
    if (Boolean(contextKey) === Boolean(semanticBranch)) return null;
    return { type, id, contextKey, semanticBranch };
  }

  function sameDailyErrorTarget(left, right) {
    const first = dailyErrorTarget(left);
    const second = dailyErrorTarget(right);
    return Boolean(first && second
      && first.type === second.type
      && first.id === second.id
      && first.contextKey === second.contextKey
      && first.semanticBranch === second.semanticBranch);
  }

  function dailyErrorAttemptMatchesTarget(target, attempt) {
    const bucket = {
      word: "words",
      question: "questions",
      sign: "signs",
      situation: "situations",
      document: "documents",
      lesson: "lessons",
    }[target?.type] || null;
    if (!bucket) return attempt?.bucket === null && attempt?.id === null;
    return attempt?.bucket === bucket && attempt?.id === target.id;
  }

  function dailyTaskCompleted(task, attempts, options = {}) {
    const contextKey = typeof options.contextKey === "string"
      && options.contextKey.length > 0
      && options.contextKey.length <= 4096
      ? options.contextKey
      : null;
    if (!contextKey) return false;
    const date = typeof task?.date === "string" && task.date
      ? task.date
      : typeof options.date === "string" && options.date
        ? options.date
        : localDateKey(options.now === undefined ? new Date() : options.now);
    const source = (Array.isArray(attempts) ? attempts : [])
      .filter(attempt => attempt?.date === date)
      .filter(attempt => attempt?.contextKey === contextKey)
      .filter(qualifyingDailySuccess);
    const ids = Array.isArray(task?.ids) ? [...new Set(task.ids)] : task?.id ? [task.id] : [];
    const listeningVariants = new Set(["listening-response", "driver-answer-listening"]);
    const questionTask = canonicalDueType(task?.dueType || task?.key) === "questions"
      || task?.key === "diagnostic" && task?.bucket === "questions";
    const constructTask = ["listening", "elp"].includes(task?.key) || questionTask;
    if (task?.key === "elp" && Object.prototype.hasOwnProperty.call(options, "elpGate")) {
      const gate = options.elpGate;
      const gateIds = Array.isArray(gate?.sessionIds) ? gate.sessionIds : [];
      const gatePassedToday = gate?.status === "passed"
        && gate.contextKey === contextKey
        && gate.sessionDate === date
        && gateIds.length === ids.length
        && ids.every(id => gateIds.includes(id) && gate.results?.[id]?.pass === true);
      if (!gatePassedToday) return false;
    }
    const matchesConstruct = attempt => {
      if (!constructTask) return true;
      const variant = dailyAttemptVariant(attempt);
      if (!variant.valid) return false;
      if (task.key === "listening") {
        return attempt.taskType === "listening" && listeningVariants.has(variant.base);
      }
      if (task.key === "elp") return attempt.taskType === "elp";
      const questionAttempt = canonicalDueType(attempt.taskType || attempt.bucket) === "questions";
      if (!questionAttempt || variant.base === "driver-answer-listening") return false;
      const evidence = attempt.evidence && typeof attempt.evidence === "object" ? attempt.evidence : attempt;
      return evidence.productive !== false
        && (!variant.declared
          || ["direct-response", "listening-response"].includes(variant.base)
          || /^regulatory-(?:primary|transfer)$/.test(variant.base));
    };
    if (ids.length) return ids.every(id => source.some(attempt => attempt.id === id && matchesConstruct(attempt)));
    const matchesTask = attempt => {
      if (task?.key === "errors") {
        const target = dailyErrorTarget(task.errorTarget);
        const variant = dailyAttemptVariant(attempt);
        const evidence = attempt.evidence && typeof attempt.evidence === "object" ? attempt.evidence : attempt;
        return Boolean(target)
          && attempt.taskType === "errors"
          && sameDailyErrorTarget(target, attempt.errorTarget)
          && dailyErrorAttemptMatchesTarget(target, attempt)
          && typeof attempt.errorEvidenceAt === "string"
          && attempt.errorEvidenceAt.length > 0
          && variant.valid
          && variant.base !== "driver-answer-listening"
          && evidence.productive !== false;
      }
      return !task?.key || !attempt.taskType || attempt.taskType === task.key || attempt.bucket === task.key;
    };
    return source.some(matchesTask);
  }

  function curriculumEligible(item, completedIds = [], plan = {}, options = {}) {
    if (!item || typeof item !== "object") return false;
    const completed = completedIds instanceof Set
      ? completedIds
      : new Set(Array.isArray(completedIds) ? completedIds.map(String) : []);
    const curriculum = item.curriculum && typeof item.curriculum === "object" ? item.curriculum : {};
    const sessionNumber = Math.max(1, Number(options.sessionNumber || 1));
    const advancedIds = new Set(Array.isArray(plan.advancedIds) ? plan.advancedIds.map(String) : []);
    const isAdvanced = advancedIds.has(String(item.id)) || curriculum.phase === "advanced";
    if (sessionNumber === 1 && curriculum.firstSessionEligible === false) return false;
    if (sessionNumber === 1 && Number(plan.firstSessionMaximumAdvancedItems) === 0 && isAdvanced) return false;
    const prerequisites = [
      ...(Array.isArray(curriculum.prerequisiteIds) ? curriculum.prerequisiteIds : []),
      ...(isAdvanced && Array.isArray(plan.requiredBeforeAdvanced) ? plan.requiredBeforeAdvanced : []),
    ].map(String);
    return [...new Set(prerequisites)].every(id => completed.has(id));
  }

  function orderCurriculum(items) {
    return (Array.isArray(items) ? items : []).map((item, index) => ({ item, index })).sort((left, right) => {
      const leftCurriculum = left.item?.curriculum || {};
      const rightCurriculum = right.item?.curriculum || {};
      const sequenceDifference = Number(leftCurriculum.sequence ?? Number.MAX_SAFE_INTEGER)
        - Number(rightCurriculum.sequence ?? Number.MAX_SAFE_INTEGER);
      if (sequenceDifference) return sequenceDifference;
      const priorityDifference = Number(leftCurriculum.priority ?? left.item?.priority ?? Number.MAX_SAFE_INTEGER)
        - Number(rightCurriculum.priority ?? right.item?.priority ?? Number.MAX_SAFE_INTEGER);
      return priorityDifference || left.index - right.index;
    }).map(entry => entry.item);
  }

  function curriculumSequence(items, completedIds = [], plan = {}, options = {}) {
    return orderCurriculum((Array.isArray(items) ? items : []).filter(item => curriculumEligible(item, completedIds, plan, options)));
  }

  function nextPendingIndex(items, currentIndex, completedIds = []) {
    const queue = Array.isArray(items) ? items : [];
    if (!queue.length) return -1;
    const completed = new Set(enabledKeys(completedIds).map(String));
    const start = Number.isSafeInteger(Number(currentIndex))
      ? ((Number(currentIndex) % queue.length) + queue.length) % queue.length
      : queue.length - 1;
    for (let offset = 1; offset <= queue.length; offset += 1) {
      const index = (start + offset) % queue.length;
      const item = queue[index];
      const id = item && typeof item === "object" ? item.id : item;
      if (id === undefined || id === null || !completed.has(String(id))) return index;
    }
    return -1;
  }

  function situationModeHidesStimulus(mode) {
    return ["listen", "phone", "elp"].includes(String(mode || "").toLowerCase());
  }

  function situationStageRequiresExposure(stage, mode) {
    return stage === "critical-turn" && situationModeHidesStimulus(mode);
  }

  function situationPromptForMode(prompt, options = {}) {
    if (options.evaluated !== true && situationModeHidesStimulus(options.mode)) return "";
    return String(prompt || "");
  }

  function situationDialogueDisplay(line, options = {}) {
    const source = line && typeof line === "object" ? line : {};
    const mode = String(options.mode || "read").toLowerCase();
    const evaluated = options.evaluated === true;
    const driver = String(source.speaker || "").toLowerCase().includes("driver");
    const hidden = !evaluated && (situationModeHidesStimulus(mode) || (mode === "say" && driver));
    return {
      hidden,
      english: hidden ? "" : String(source.english || ""),
      translation: hidden || situationModeHidesStimulus(mode) ? "" : String(source.translation || ""),
    };
  }

  function lessonConstructAvailable(constructState, now = Date.now()) {
    const waitUntil = Date.parse(String(constructState?.waitUntil || ""));
    return !Number.isFinite(waitUntil) || timestamp(now) >= waitUntil;
  }

  function getSrsOption(grade) {
    return SRS_OPTIONS[String(grade || "").toLowerCase()] || null;
  }

  function srsOptions() {
    return Object.values(SRS_OPTIONS).map(option => ({ ...option }));
  }

  function scheduleReview(grade, now = new Date()) {
    const option = getSrsOption(grade);
    const reviewedAt = timestamp(now);
    if (!option || !Number.isFinite(reviewedAt)) return null;
    return {
      ...option,
      reviewedAt: new Date(reviewedAt).toISOString(),
      dueAt: new Date(reviewedAt + option.intervalMs).toISOString(),
    };
  }

  function applyCardSchedule(record, grade, now = new Date()) {
    const requested = getSrsOption(grade);
    if (!requested) return null;
    const lastDemonstrated = Array.isArray(record?.evidence)
      ? [...record.evidence].reverse().find(item => item?.kind === "demonstrated")
      : null;
    const effectiveGrade = lastDemonstrated?.outcome === "failed" ? "again" : requested.id;
    const schedule = scheduleReview(effectiveGrade, now);
    if (!schedule) return null;
    return {
      ...(record && typeof record === "object" ? record : {}),
      lastGrade: schedule.id,
      lastReviewed: schedule.reviewedAt,
      nextDueAt: schedule.dueAt,
      dueAt: schedule.dueAt,
      intervalDays: schedule.intervalDays,
      intervalMs: schedule.intervalMs,
    };
  }

  return Object.freeze({
    PROFILES,
    EQUIPMENT_PROFILES,
    EQUIPMENT_VALUES,
    CONDITION_VALUES,
    DIAGNOSTIC_CATEGORIES,
    NEW_YORK_TIME_ZONE,
    DUE_TYPES,
    SESSION_WORKLOADS,
    SRS_OPTIONS,
    localDateKey,
    nextLocalDateBoundary,
    canonicalProfile,
    normalizedProfile,
    normalizeApplicabilityContext,
    evaluateApplicability,
    appliesTo,
    materializeForProfile,
    slotsForTurn,
    scopedTurnRequiredGroups,
    filterApplicable,
    seededRandom,
    shuffled,
    prepareDiagnostic,
    diagnosticBlueprint,
    materializeDiagnosticForm,
    diagnosticScores,
    diagnosticRecommendation,
    dueAtMilliseconds,
    isDueRecord,
    nextDueAt,
    canonicalDueType,
    normalizeDueGroups,
    dueQueueSnapshot,
    roundRobinDueItems,
    sessionWorkload,
    chooseSessionTasks,
    selectTodayTasks,
    qualifyingDailySuccess,
    dailyTaskCompleted,
    curriculumEligible,
    orderCurriculum,
    curriculumSequence,
    nextPendingIndex,
    situationModeHidesStimulus,
    situationStageRequiresExposure,
    situationPromptForMode,
    situationDialogueDisplay,
    lessonConstructAvailable,
    getSrsOption,
    srsOptions,
    scheduleReview,
    applyCardSchedule,
    applyReviewSchedule: applyCardSchedule,
  });
});
