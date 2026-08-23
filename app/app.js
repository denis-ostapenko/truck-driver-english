(function exposePersistenceBoundary(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TruckAppPersistence = api;
})(typeof window === "undefined" ? null : window, () => {
  "use strict";

  function cloneState(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function createPersistenceBoundary(initialState) {
    let committed = cloneState(initialState);
    return {
      commit(candidate, persist) {
        let result;
        try {
          result = persist(candidate);
        } catch (error) {
          result = { ok: false, errorType: "persistence", error };
        }
        if (result?.ok) {
          committed = cloneState(result.state || candidate);
          return { ...result, state: cloneState(committed) };
        }
        return { ...(result || {}), ok: false, state: cloneState(committed) };
      },
      accept(persistedState) {
        committed = cloneState(persistedState);
        return cloneState(committed);
      },
      rollback() {
        return cloneState(committed);
      },
    };
  }

  function clearAttemptStateForIds(ids, ...collections) {
    const attemptIds = [...new Set(Array.isArray(ids) ? ids.map(String) : [])];
    for (const collection of collections) {
      if (!collection || typeof collection.delete !== "function") continue;
      for (const id of attemptIds) collection.delete(id);
    }
    return attemptIds.length;
  }

  function createQuestionRevealLocks() {
    const locks = new Map();
    return {
      remember(descriptor) {
        const id = String(descriptor?.id || "");
        const practiceMode = String(descriptor?.practiceMode || "");
        const instance = cloneState(descriptor?.instance || {});
        if (!id || !practiceMode || !String(instance.id || "")) return null;
        const lock = { id, practiceMode, instance };
        locks.set(id, cloneState(lock));
        return cloneState(lock);
      },
      get(id) {
        const lock = locks.get(String(id));
        return lock ? cloneState(lock) : null;
      },
      has(id) {
        return locks.has(String(id));
      },
      delete(id) {
        return locks.delete(String(id));
      },
      clear() {
        locks.clear();
      },
    };
  }

  function commitDiagnosticAttempt({ answers, index, answerRecord, feedback, stimulusExposure, itemId, commit }) {
    if (!Array.isArray(answers) || !Number.isInteger(index) || index < 0 || typeof commit !== "function") {
      throw new TypeError("Diagnostic attempt transaction is invalid.");
    }
    answers[index] = cloneState(answerRecord);
    const result = commit();
    if (result?.ok) {
      return { result, feedback: cloneState(feedback), retryRequired: false };
    }
    delete answers[index];
    while (answers.length && !Object.prototype.hasOwnProperty.call(answers, answers.length - 1)) answers.length -= 1;
    if (stimulusExposure && typeof stimulusExposure.delete === "function") stimulusExposure.delete(String(itemId || ""));
    return { result: result || { ok: false }, feedback: null, retryRequired: true };
  }

  const MAX_EXTERNAL_IMPORT_BYTES = 2 * 1024 * 1024;

  async function readExternalImportFile(file, maximumBytes = MAX_EXTERNAL_IMPORT_BYTES) {
    if (!file || typeof file.text !== "function") {
      const error = new TypeError("Import file is not readable.");
      error.code = "IMPORT_NOT_READABLE";
      throw error;
    }
    if (Number.isFinite(Number(file.size)) && Number(file.size) > maximumBytes) {
      const error = new RangeError("Import file is larger than 2 MiB.");
      error.code = "IMPORT_FILE_OVERSIZED";
      throw error;
    }
    return file.text();
  }

  return { createPersistenceBoundary, createQuestionRevealLocks, commitDiagnosticAttempt, clearAttemptStateForIds, readExternalImportFile, MAX_EXTERNAL_IMPORT_BYTES };
});

(() => {
  "use strict";

  if (typeof window === "undefined") return;

  const DATA = window.COURSE_DATA;
  let AUDIO_DATA = window.TRUCK_AUDIO_DATA || { lookup: {}, bySource: {} };
  let audioDataReady = Boolean(window.TRUCK_AUDIO_DATA);
  let audioDataPromise = null;
  const LISTENING_DATA = window.TRUCK_LISTENING_DATA || { profiles: {}, limitations: [] };
  const Core = window.TruckAppCore;
  const Eval = window.TruckLearningEvaluator;
  const StateApi = window.TruckDriverStateStore;
  const RecorderApi = window.TruckDriverRecorder;
  const STORAGE_KEY = "truck-driver-english-state-v1";
  const BACKUP_KEY = `${STORAGE_KEY}-backup`;
  const stateStore = StateApi.createStateStore({ storage: localStorage, courseData: DATA, storageKey: STORAGE_KEY, backupKey: BACKUP_KEY });
  const allUnits = [
    ...DATA.core.map(item => ({ ...item, track: "core" })),
    ...DATA.truck.map(item => ({ ...item, track: "truck" })),
    ...DATA.hotshot.map(item => ({ ...item, track: "hotshot" })),
  ];
  const assessmentQuestions = [
    ...DATA.inspectionQuestions,
    ...(Array.isArray(DATA.regulatoryScoredQuestions) ? DATA.regulatoryScoredQuestions : []),
  ];
  const unitById = new Map(allUnits.map(item => [item.id, item]));
  const visualsByRef = new Map();
  for (const asset of DATA.visualAssets || []) {
    for (const ref of asset.contentRefs || []) {
      if (!visualsByRef.has(ref)) visualsByRef.set(ref, asset);
    }
  }
  const STALE_SIGN_AUDIO_CODES = new Set(["R12-2", "W7-2bP", "W8-6", "W8-21", "W8-14", "R2-6aP", "W21-5bR", "D8-1a", "R7-1", "D5-1", "D9-17P"]);

  const DOCUMENT_STATUS_LABELS = {
    "carry-or-trip": "Всегда доступно · Carry or access",
    "trip-specific": "Для рейса · Trip-specific",
    conditional: "По ситуации · Conditional",
    training: "Учебная справка",
  };
  const PROFILE_LABELS = {
    tractor: "Tractor-trailer",
    "hotshot-open": "Hotshot open",
    "hotshot-enclosed": "Hotshot enclosed",
    both: "Tractor-trailer + Hotshot open + Hotshot enclosed",
  };
  const PROFILE_SHORT_LABELS = {
    tractor: "Tractor-trailer",
    "hotshot-open": "Hotshot open",
    "hotshot-enclosed": "Hotshot enclosed",
    both: "Все направления",
  };
  const SITUATION_REQUIREMENT_LABELS = {
    tractor: "Tractor-trailer",
    "hotshot-open": "Hotshot open",
    "hotshot-enclosed": "Hotshot enclosed",
    "tractor-trailer": "Tractor-trailer",
    "dry-van": "Dry van",
    "air-brakes": "пневматические тормоза",
    "trip-specific": "текущий грузовой рейс",
    "eld-required": "ELD используется",
    "eld-malfunction": "неисправность ELD",
    "scale-ticket-issued": "есть scale ticket",
    delivery: "доставка",
    "permit-applicable": "разрешение на негабарит или перегруз",
    "vehicle-transport": "перевозка автомобилей",
    "cargo-securement": "проверка крепления груза",
  };
  const CONDITION_CONTROLS = [
    ["cdlRequired", "CDL требуется", "Включает CDL и связанные задания по документам только для применимой операции."],
    ["eld", "ELD используется", "Включает ELD transfer, RODS и применимые инструкции."],
    ["eldMalfunction", "Неисправность ELD", "Добавляет тренировку по неисправности и бумажные RODS. Требует ELD."],
    ["hazmat", "Hazmat", "Добавляет только применимые вопросы и shipping papers."],
    ["ifta", "IFTA применимо", "Добавляет материалы IFTA только для соответствующей операции."],
    ["oversizePermit", "Разрешение на негабарит или перегруз", "Добавляет разрешение и ограничения маршрута."],
    ["tripSpecific", "Есть текущий грузовой рейс", "Добавляет BOL, сведения о грузе и пломбе, а также другие задания текущего рейса."],
    ["cargo", "Есть груз", "Добавляет только общие задания по грузу для текущего рейса."],
    ["cargoSecurement", "Проверка крепления груза", "Добавляет применимые задания по креплению."],
    ["vehicleTransport", "Перевозка автомобилей", "Для Hotshot и автовоза."],
    ["transportedVehicleAtMost10000Lb", "Автомобиль до 10 000 lb", "Включает учебную ветку 49 CFR 393.128."],
    ["transportedVehicleOver10000Lb", "Автомобиль тяжелее 10 000 lb", "Включает отдельную ветку 49 CFR 393.130."],
    ["medicalStatusProof", "Нужно подтверждение медицинского статуса", "Бумажная MEC показывается только с актуальным временным контекстом."],
    ["speVariance", "SPE или медицинское исключение", "Добавляет условный сертификат."],
    ["dvir", "DVIR применим", "Добавляет отчет о дефектах, когда он нужен."],
    ["periodicInspectionProof", "Подтверждение periodic inspection", "Добавляет применимые записи по тягачу и прицепу."],
    ["scaleTicket", "Есть scale ticket", "Добавляет чтение нагрузок по осям и полной массы."],
    ["postInspection", "После дорожной проверки", "Добавляет отчет о проверке и действия после OOS."],
    ["delivery", "Этап доставки", "Добавляет POD, OS&D и задания общения с получателем."],
    ["chainsRequired", "Требуются цепи", "Добавляет только применимые задания по цепям."],
    ["registrationRequired", "Нужна регистрация", "Добавляет регистрационные документы только для применимой техники."],
  ];
  const EQUIPMENT_CONTROLS = [
    ["airBrakes", "Air brakes", "Только для Tractor-trailer с пневматическими тормозами."],
    ["dryVan", "Dry van", "Включает учебный материал по dry van."],
    ["loadBars", "Load bars", "Включает задания по load bars только вместе с применимым dry van."],
  ];

  const INSPECTION_LEVEL_RU = {
    I: { scope: "Водитель, права, HOS, документы и полный осмотр машины, включая узлы снизу.", focus: "Полная последовательность команд, тормоза и сцепка." },
    II: { scope: "Водитель, документы и узлы машины, которые видны без осмотра снизу.", focus: "Свет, тормоза, рулевое управление, груз и видимые дефекты." },
    III: { scope: "CDL, медицинский статус при необходимости, RODS, HOS, отчеты и данные перевозчика.", focus: "Короткие точные ответы и быстрое предъявление документов." },
    IV: { scope: "Разовая проверка конкретного узла или вопроса, обычно для исследования или отслеживания тенденции.", focus: "Понять предмет проверки и точно выполнить указания." },
    V: { scope: "Проверка узлов машины по объему Level I без присутствия водителя.", focus: "Понимание результата и терминов, связанных с машиной." },
    VI: { scope: "Расширенный Level I для определенных перевозок радиоактивных материалов.", focus: "Специализированный раздел, только когда он применим." },
    VII: { scope: "Отдельная программа, обязательная по правилам конкретной юрисдикции.", focus: "Распознавать местные требования и указания." },
    VIII: { scope: "Электронная проверка личности, прав, медицинского статуса, RODS, HOS, регистрации, разрешений, UCR и запретов OOS.", focus: "Сейчас Level VIII проходит эксплуатационное тестирование с ограниченным числом добровольных перевозчиков." },
  };

  const QUESTION_CATEGORY_LABELS = {
    "A. Initial contact and safe stop": "A. Первый контакт и безопасная остановка",
    "B. Trip, origin, destination and cargo": "B. Рейс, отправление, назначение и груз",
    "C. Driver, carrier and credentials": "C. Водитель, перевозчик и документы",
    "D. Registration, insurance and inspection proof": "D. Регистрация, страховка и подтверждение инспекции",
    "E. Shipping papers and load records": "E. Транспортные документы и записи о грузе",
    "F. HOS, RODS and ELD": "F. HOS, RODS и ELD",
    "G. Vehicle, equipment and visible defects": "G. Машина, оборудование и видимые дефекты",
    "H. Result, violation and completion": "H. Результат, нарушение и завершение",
  };

  const ELP_STEP_ONE_IDS = Array.isArray(DATA.elpStepOneIds) ? DATA.elpStepOneIds : [];
  const ELP_STEP_ONE_BLUEPRINT = DATA.elpStepOneBlueprint || {};
  const ELP_STEP_ONE_REQUIRED = Number(ELP_STEP_ONE_BLUEPRINT.requiredResponses || ELP_STEP_ONE_IDS.length);

  function elpStepOneContractValid() {
    const functionIds = Array.isArray(ELP_STEP_ONE_BLUEPRINT.functions)
      ? ELP_STEP_ONE_BLUEPRINT.functions.map(item => item?.questionId).filter(Boolean)
      : [];
    return ELP_STEP_ONE_REQUIRED === 7
      && ELP_STEP_ONE_IDS.length === ELP_STEP_ONE_REQUIRED
      && functionIds.length === ELP_STEP_ONE_REQUIRED
      && functionIds.every((id, index) => id === ELP_STEP_ONE_IDS[index])
      && ELP_STEP_ONE_BLUEPRINT.officialAssessment === false;
  }

  function isElpEnglishBearing(item) {
    return item?.englishBearing === true && item?.readinessCredit !== false;
  }

  function elpStepTwoReadinessItems() {
    const candidates = DATA.signs.filter(item => ["fhwa-mutcd-shs", "training-dms"].includes(item.provenance));
    const declaredIds = DATA.elpStepTwoEnglishBearingIds
      || DATA.elpStepTwoCompletionBlueprint?.englishBearingIds
      || DATA.elpStepTwoBlueprint?.englishBearingIds
      || DATA.elpStepTwoBlueprint?.readinessIds;
    if (Array.isArray(declaredIds) && declaredIds.length) {
      const byId = new Map(candidates.map(item => [item.id, item]));
      return declaredIds.map(id => byId.get(id)).filter(item => item && isElpEnglishBearing(item));
    }
    return candidates.filter(isElpEnglishBearing);
  }

  function materializeElpStepTwoSession(items) {
    const blueprint = DATA.elpStepTwoCompletionBlueprint || {};
    const required = Number(blueprint.requiredScoredAttempts || 12);
    const requiredOfficial = Number(blueprint.requiredOfficialSvgAttempts || 8);
    const requiredDms = Number(blueprint.requiredTrainingDmsAttempts || Math.max(0, required - requiredOfficial));
    const seed = Number(todayKey().replaceAll("-", "")) + Number(state.elpStepTwo?.attempts || 0) * 7919 + Number(state.dailyRefresh || 0) * 101;
    const official = Core.shuffled(items.filter(item => item.provenance === "fhwa-mutcd-shs"), seed).slice(0, requiredOfficial);
    const dms = Core.shuffled(items.filter(item => item.provenance === "training-dms"), seed + 31337).slice(0, requiredDms);
    const selected = Core.shuffled([...official, ...dms], seed + 65537);
    return selected.length === required ? selected : [];
  }

  function elpStepOneItems() {
    return ELP_STEP_ONE_IDS.map(questionById).filter(item => item && applies(item));
  }

  const PROFILE_VISUALS = {
    tractor: [{ label: "Tractor-trailer", path: "images/situations/roadside-inspection-v01.webp", alt: "Conventional tractor with semi-trailer at a roadside inspection" }],
    "hotshot-open": [{ label: "Hotshot open", path: "images/situations/hotshot-car-hauler-v01.webp", alt: "Heavy-duty dually pickup towing an open gooseneck car-hauler" }],
    "hotshot-enclosed": [{ label: "Hotshot enclosed", path: "images/situations/hotshot-enclosed-loading-v01.webp", alt: "Heavy-duty dually pickup towing an enclosed gooseneck car-hauler" }],
    both: [
      { label: "Tractor-trailer", path: "images/situations/roadside-inspection-v01.webp", alt: "Conventional tractor with semi-trailer at a roadside inspection" },
      { label: "Hotshot open", path: "images/situations/hotshot-car-hauler-v01.webp", alt: "Heavy-duty dually pickup towing an open gooseneck car-hauler" },
      { label: "Hotshot enclosed", path: "images/situations/hotshot-enclosed-loading-v01.webp", alt: "Heavy-duty dually pickup towing an enclosed gooseneck car-hauler" },
    ],
  };

  function todayKey() {
    return Core.localDateKey(new Date());
  }

  const defaultState = () => stateStore.defaultState();
  const recoveredState = stateStore.load();
  let state = recoveredState.state;
  const persistenceBoundary = window.TruckAppPersistence.createPersistenceBoundary(state);
  let currentView = "dashboard";
  let displayLimit = 50;
  let cardTrack = "mixed";
  let cardQueue = [];
  let cardIndex = 0;
  let cardSessionCount = 0;
  let cardRevealed = false;
  let cardEvaluation = null;
  let cardVariant = "translation-to-english";
  let cardEvidenceVariant = "translation-to-english";
  let focusedCardIds = null;
  let focusedQuestionIds = null;
  let questionIndex = 0;
  let questionVariant = "direct-response";
  let inspectionTab = "levels";
  let situationIndex = 0;
  let situationMode = "read";
  let documentIndex = 0;
  let signFilter = "all";
  let signStatus = "all";
  let signVisibleLimit = 16;
  let focusedSignIds = null;
  let focusedLessonId = null;
  let elpSession = state.elpGate?.status === "pending" && artifactMatchesCurrentContext(state.elpGate);
  let todayTaskOffset = 0;
  let diagnosticIndex = 0;
  let diagnosticAnswers = [];
  let diagnosticSeed = Date.now() >>> 0;
  let diagnosticPrepared = [];
  let diagnosticProductiveShown = false;
  let diagnosticCorrectionMode = false;
  let diagnosticCorrectionTargetId = null;
  const diagnosticStimulusExposure = new Set();
  let diagnosticFeedback = null;
  let diagnosticPersistenceRetry = null;
  let branchIndex = 0;
  let branchChoiceCorrect = false;
  let branchVariant = "primary-turn";
  let listeningProfile = "roadside";
  let listeningTarget = "prompt";
  let stepTwoSession = state.elpStepTwo?.status === "pending" && artifactMatchesCurrentContext(state.elpStepTwo);
  let currentDocumentField = null;
  let currentDocumentInstance = null;
  let currentDocumentVariant = "field-primary";
  let documentEvaluation = null;
  let documentRevealed = false;
  let situationEvaluation = null;
  let situationTask = null;
  let situationVariant = "primary";
  let currentSituationPractice = null;
  const questionEvaluations = new Map();
  const signEvaluations = new Map();
  const lessonEvaluations = new Map();
  const heardLessonStimuli = new Set();
  let activeDailyTaskKey = null;
  let recorderController = null;
  const heardQuestionStimuli = new Set();
  const heardSituationStimuli = new Set();
  const revealedSituationStimuli = new Set();
  const elpResponseDrafts = new Map();
  const elpResponseLocks = new Map();
  const questionRevealLocks = window.TruckAppPersistence.createQuestionRevealLocks();
  const revealedSignIds = new Set();
  let activeDailySessionDate = null;
  if (elpSession) {
    const firstUnanswered = state.elpGate.sessionIds.findIndex(id => !state.elpGate.results?.[id]);
    questionIndex = Math.max(0, firstUnanswered);
  }
  if (stepTwoSession) {
    focusedSignIds = state.elpStepTwo.sessionIds.filter(id => !state.elpStepTwo.results?.[id]);
  }
  let toastTimer = null;
  let activeAudio = null;
  let activeAudioButton = null;
  let playbackToken = 0;
  let lastPlaybackQualifying = false;

  const LEGACY_VOICE_IDS = {
    Driver: "driver",
    Inspector: "inspector",
    Officer: "inspector",
    Trooper: "state-trooper",
    Dispatcher: "dispatcher",
    Guard: "gate-clerk",
    Clerk: "gate-clerk",
    "Scale Clerk": "gate-clerk",
    Cashier: "gate-clerk",
    Staff: "gate-clerk",
    Spotter: "gate-clerk",
    Receiver: "receiver",
    Loader: "receiver",
    Maintenance: "mechanic",
    Roadside: "roadside-assistance",
    "911": "dispatcher",
  };

  const ROLE_LABELS = {
    driver: "Водитель",
    "hotshot driver": "Водитель Hotshot",
    inspector: "Инспектор",
    "dot inspector": "Инспектор DOT",
    "safety inspector": "Инспектор по безопасности",
    "carrier dispatcher": "Диспетчер перевозчика",
    "emergency dispatcher": "Оператор экстренной службы",
    "enforcement officer": "Сотрудник дорожного надзора",
    "fuel cashier": "Кассир АЗС",
    "maintenance technician": "Механик",
    "parking attendant": "Сотрудник стоянки",
    "security gate guard": "Сотрудник въездного поста",
    "shipping clerk": "Сотрудник отправителя",
    "vehicle spotter": "Помощник при маневрах",
    officer: "Офицер",
    trooper: "Сотрудник дорожной полиции",
    "state trooper": "Сотрудник дорожной полиции",
    police: "Полиция",
    dispatcher: "Диспетчер",
    guard: "Охрана",
    clerk: "Сотрудник",
    "gate clerk": "Сотрудник въездного поста",
    "scale clerk": "Оператор весов",
    cashier: "Кассир",
    staff: "Сотрудник",
    "truck stop staff": "Сотрудник стоянки",
    "fuel desk": "Топливная касса",
    spotter: "Помощник",
    "yard spotter": "Помощник на площадке",
    "yard hostler": "Водитель на площадке",
    receiver: "Получатель",
    loader: "Погрузчик",
    shipper: "Отправитель",
    broker: "Брокер",
    "carrier safety": "Отдел безопасности перевозчика",
    "safety manager": "Менеджер по безопасности",
    maintenance: "Механик",
    roadside: "Дорожная помощь",
    "roadside assistance": "Дорожная помощь",
    "911": "Оператор 911",
  };

  function roleLabel(value) {
    const key = String(value).toLowerCase().replaceAll("-", " ");
    return ROLE_LABELS[key] || value;
  }

  function semanticRole(line) {
    return line?.semanticRole || line?.speaker || "Staff";
  }

  function voiceId(line, fallback = "driver") {
    return line?.voiceId || LEGACY_VOICE_IDS[line?.speaker] || fallback;
  }

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const dialogReturnFocus = new WeakMap();

  function ensureAudioData() {
    if (audioDataReady) return Promise.resolve(true);
    if (audioDataPromise) return audioDataPromise;
    audioDataPromise = new Promise(resolve => {
      const script = document.createElement("script");
      script.src = "data/audio-data.js?v=6";
      script.async = true;
      script.addEventListener("load", () => {
        AUDIO_DATA = window.TRUCK_AUDIO_DATA || { lookup: {}, bySource: {} };
        audioDataReady = Boolean(window.TRUCK_AUDIO_DATA);
        resolve(audioDataReady);
      }, { once: true });
      script.addEventListener("error", () => resolve(false), { once: true });
      document.head.append(script);
    });
    return audioDataPromise;
  }

  function dialogFocusable(dialog) {
    return [...dialog.querySelectorAll('button:not([disabled]):not([hidden]), a[href], input:not([disabled]):not([hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter(node => !node.closest("[hidden]") && node.getClientRects().length > 0);
  }

  function openDialog(dialog, initiator = document.activeElement) {
    if (!dialog?.showModal) return;
    dialogReturnFocus.set(dialog, initiator instanceof HTMLElement ? initiator : null);
    dialog.showModal();
    requestAnimationFrame(() => dialogFocusable(dialog)[0]?.focus());
  }

  function closeDialog(dialog) {
    if (!dialog?.open) return;
    dialog.close();
  }

  function restoreDialogFocus(dialog) {
    const initiator = dialogReturnFocus.get(dialog);
    dialogReturnFocus.delete(dialog);
    requestAnimationFrame(() => {
      if (initiator?.isConnected && !initiator.disabled) initiator.focus();
      else $("#view-title")?.focus();
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function applicabilityContext() {
    return Core.normalizeApplicabilityContext
      ? Core.normalizeApplicabilityContext({ profile: state.profile || "both", applicability: state.applicability || {} })
      : { profile: state.profile || "both", applicability: state.applicability || {} };
  }

  function applies(item) {
    const context = applicabilityContext();
    if (!Core.appliesTo(item, context)) return false;
    const materialized = Core.materializeForProfile ? Core.materializeForProfile(item, context) : item;
    return !Array.isArray(materialized?.materializationConflict);
  }

  function effectiveEquipmentProfile() {
    return state.profile === "both" ? "tractor" : state.profile || "tractor";
  }

  function materializeForCurrentProfile(item) {
    return Core.materializeForProfile ? Core.materializeForProfile(item, applicabilityContext()) : item;
  }

  function materializeUnit(item) {
    if (!item) return null;
    return { ...materializeForCurrentProfile(item), track: item.track };
  }

  function currentUnits(source = allUnits) {
    return source.map(materializeUnit);
  }

  function unitForCurrentProfile(id) {
    return materializeUnit(unitById.get(id));
  }

  function questionById(id) {
    const item = assessmentQuestions.find(entry => entry.id === id);
    return item ? materializeForCurrentProfile(item) : null;
  }

  function lessonById(id) {
    const item = DATA.lessons.find(entry => entry.id === id);
    return item ? materializeForCurrentProfile(item) : null;
  }

  function readinessContextKey() {
    return applicabilityKey();
  }

  function activeConditionMaterializationKey(item) {
    if (!item?.conditionMaterializations || typeof item.conditionMaterializations !== "object") return null;
    if (Array.isArray(item.materializationConflict) && item.materializationConflict.length) return "conflict";
    if (typeof item.materializedCondition === "string" && item.materializedCondition) return item.materializedCondition;
    const materialized = Core.materializeForProfile ? Core.materializeForProfile(item, applicabilityContext()) : item;
    if (Array.isArray(materialized?.materializationConflict) && materialized.materializationConflict.length) return "conflict";
    return typeof materialized?.materializedCondition === "string" && materialized.materializedCondition
      ? materialized.materializedCondition
      : "base";
  }

  function semanticBranchForContent(bucket, id) {
    return stateStore.errorBindingForContent?.(state, bucket, id)?.semanticBranch || null;
  }

  function sharedSemanticBranch(branch) {
    return typeof branch === "string" && branch.startsWith("shared:");
  }

  function materializationSemanticBranch(branch) {
    return typeof branch === "string" && branch.startsWith("scope:");
  }

  function branchCarriesJournalScope(branch) {
    return sharedSemanticBranch(branch) || materializationSemanticBranch(branch);
  }

  function errorBucket(type) {
    return { word: "words", question: "questions", sign: "signs", situation: "situations", document: "documents", lesson: "lessons" }[type] || null;
  }

  function errorTypeForBucket(bucket) {
    return { words: "word", questions: "question", signs: "sign", situations: "situation", documents: "document", lessons: "lesson" }[bucket] || null;
  }

  function errorTargetForRecord(record) {
    if (!record || typeof record.type !== "string" || typeof record.id !== "string") return null;
    const contextKey = record.contextKey ?? null;
    const semanticBranch = record.semanticBranch ?? null;
    if (Boolean(contextKey) === Boolean(semanticBranch)) return null;
    return { type: record.type, id: record.id, contextKey, semanticBranch };
  }

  function sameErrorTarget(left, right) {
    return Boolean(left && right
      && left.type === right.type
      && left.id === right.id
      && left.contextKey === right.contextKey
      && left.semanticBranch === right.semanticBranch);
  }

  function activeDailyErrorTarget() {
    const descriptor = state.dailyPlan?.routeSnapshot?.find(task => task.key === "errors");
    return descriptor?.errorTarget || null;
  }

  function errorRecordForTarget(target) {
    return (state.errorJournal || []).find(record => sameErrorTarget(errorTargetForRecord(record), target)) || null;
  }

  function recoveryEvidenceIdentity(evidence) {
    if (!evidence) return "";
    return [
      evidence.at || "",
      evidence.outcome || "",
      evidence.kind || "",
      evidence.mode || "",
      evidence.variant || "",
      evidence.responseHash || "",
    ].join("\u0000");
  }

  function errorRecoveryAdvanced(before, after, evidence) {
    if (!before || !after || !StateApi.isQualifyingEvidence?.(evidence)) return false;
    const identity = recoveryEvidenceIdentity(evidence);
    const count = record => (record.evidence || []).filter(item => recoveryEvidenceIdentity(item) === identity).length;
    return count(after) > count(before);
  }

  function attemptContextPrefix(item) {
    const parts = [];
    if (item?.profileMaterializations || item?.profilePhrases) parts.push(`profile:${effectiveEquipmentProfile()}`);
    const conditionKey = activeConditionMaterializationKey(item);
    if (conditionKey) parts.push(`condition:${conditionKey}`);
    return parts.length ? `${parts.join("|")}|` : "";
  }

  function contextualAttemptVariant(item, variant) {
    return `${attemptContextPrefix(item)}${String(variant || "")}`;
  }

  function currentQualificationContextKey() {
    return StateApi.qualificationContextKey?.(state.profile, state.applicability) || readinessContextKey();
  }

  function artifactMatchesCurrentContext(artifact) {
    return Boolean(artifact
      && artifact.profile === state.profile
      && artifact.contextKey === currentQualificationContextKey());
  }

  function verifiedDiagnosticForCurrentContext() {
    return state.diagnostic?.verified === true && artifactMatchesCurrentContext(state.diagnostic)
      ? state.diagnostic
      : null;
  }

  function invalidateContextDependentReadiness() {
    state.elpGate = null;
    state.elpStepTwo = null;
    state.diagnostic = null;
    diagnosticPrepared = [];
    diagnosticAnswers = [];
    diagnosticFeedback = null;
    diagnosticPersistenceRetry = null;
    diagnosticCorrectionTargetId = null;
    diagnosticStimulusExposure.clear();
    elpSession = false;
    stepTwoSession = false;
    focusedQuestionIds = null;
    questionRevealLocks.clear();
    focusedSignIds = null;
    lessonEvaluations.clear();
    heardLessonStimuli.clear();
    situationTask = null;
    situationEvaluation = null;
    currentSituationPractice = null;
  }

  function saveState(options = {}) {
    const result = persistenceBoundary.commit(state, candidate => stateStore.save(candidate));
    state = result.state;
    if (!result.ok) {
      const validationFailure = result.errorType === "validation";
      if (!options.silent) toast(validationFailure
        ? "Прогресс не сохранен: состояние не прошло проверку"
        : "Прогресс не сохранен: локальное хранилище недоступно");
      console.warn(validationFailure
        ? "Progress update was rejected by state validation."
        : "Progress update was rolled back because local storage could not be updated.", result.error);
    }
    updateTopProgress();
    scheduleDueInvalidation();
    return result;
  }

  function contextDependentItem(bucket, id) {
    if (bucket === "words") {
      const item = unitById.get(id);
      return item && (item.profileMaterializations || item.conditionMaterializations) ? item : null;
    }
    if (bucket === "questions") return assessmentQuestions.find(item => item.id === id && (item.profileMaterializations || item.conditionMaterializations));
    if (bucket === "situations") return DATA.situations.find(item => item.id === id && (item.profileMaterializations || item.conditionMaterializations));
    if (bucket === "lessons") return DATA.lessons.find(item => item.id === id && (item.profilePhrases || item.conditionMaterializations));
    return null;
  }

  function recordForCurrentContext(bucket, id) {
    const record = state[bucket]?.[id];
    if (!record || !contextDependentItem(bucket, id)) return record;
    const prefix = attemptContextPrefix(contextDependentItem(bucket, id));
    const evidence = (record.evidence || []).filter(item => String(item.variant || "").startsWith(prefix));
    let scoped = null;
    for (const item of evidence) {
      const appended = StateApi.recordEvidence(scoped, item);
      if (appended?.ok) scoped = appended.record;
    }
    return scoped;
  }

  function isDone(bucket, id) {
    return StateApi.isMastered(recordForCurrentContext(bucket, id));
  }

  function masteryLabel(bucket, id) {
    const record = recordForCurrentContext(bucket, id);
    const status = StateApi.masteryStatus(record);
    const qualifyingSuccesses = (record?.evidence || []).filter(item => StateApi.isQualifyingEvidence?.(item));
    const confirmed = {
      words: "Письменное воспроизведение подтверждено",
      questions: "Письменный рабочий ответ подтвержден",
      situations: "Рабочее взаимодействие отработано",
      signs: "Чтение знака и действие подтверждены",
      documents: "Чтение учебного документа подтверждено",
      lessons: "Понимание и рабочая реплика подтверждены",
    }[bucket] || "Результат в этом упражнении подтвержден";
    if (!qualifyingSuccesses.length && record?.evidence?.length) return "Пока нет самостоятельного подтверждения";
    return {
      new: "Новая",
      "needs-review": "Нужна самостоятельная правильная попытка",
      "needs-reconfirmation": "Предыдущий результат сохранен в истории, но после ошибки нужны две новые самостоятельные проверки",
      learning: "Первый успех, проверка не раньше чем через 24 часа",
      "verification-due": "Пора подтвердить повторным ответом",
      mastered: confirmed,
      "review-due": `${confirmed}, пора повторить`,
    }[status] || "Новая";
  }

  function recordLearningAttempt(bucket, id, evaluation, mode, variant = "", dailyTaskType = null, options = {}) {
    const evidence = Eval.evidenceForEvaluation(evaluation, {
      mode,
      variant,
      blind: options.blind !== false,
      support: options.support || "none",
      selfReported: options.selfReported === true,
      productive: options.productive !== false,
      response: options.response || "",
      responseHash: options.responseHash,
    });
    const semanticBranch = options.semanticBranch || semanticBranchForContent(bucket, id);
    if (semanticBranch && !sharedSemanticBranch(semanticBranch)) evidence.semanticBranch = semanticBranch;
    const taskType = dailyTaskType || activeDailyTaskKey || bucket;
    const frozenErrorTarget = taskType === "errors" ? activeDailyErrorTarget() : null;
    const matchingErrorTarget = frozenErrorTarget
      && frozenErrorTarget.type === errorTypeForBucket(bucket)
      && frozenErrorTarget.id === id
      ? frozenErrorTarget
      : null;
    const errorBefore = matchingErrorTarget ? errorRecordForTarget(matchingErrorTarget) : null;
    const recorded = stateStore.recordAttempt(state, bucket, id, evidence);
    if (!recorded.ok) {
      toast("Попытку не удалось сохранить");
      return null;
    }
    state = recorded.state;
    const errorAfter = matchingErrorTarget ? errorRecordForTarget(matchingErrorTarget) : null;
    const recoveryAdvanced = Boolean(evaluation?.pass)
      && options.productive !== false
      && errorRecoveryAdvanced(errorBefore, errorAfter, recorded.evidence);
    const dailyCompleted = Boolean(evaluation?.pass) && (taskType !== "errors" || recoveryAdvanced);
    const daily = stateStore.recordDailyAttempt(state, {
      date: activeDailyTaskKey ? activeDailySessionDate || todayKey() : todayKey(),
      at: recorded.evidence?.at || new Date().toISOString(),
      taskType,
      bucket,
      id,
      completed: dailyCompleted,
      result: dailyCompleted ? "independent" : "failed",
      outcome: dailyCompleted ? "success" : "failed",
      independent: dailyCompleted,
      preReveal: evidence.preReveal === true,
      support: evidence.support,
      evidence,
      variant: evidence.variant,
      contextKey: currentQualificationContextKey(),
      ...(frozenErrorTarget ? { errorTarget: frozenErrorTarget } : {}),
      ...(recoveryAdvanced ? { errorEvidenceAt: recorded.evidence.at } : {}),
    });
    if (!daily.ok) {
      toast("Попытка проверена, но дневной прогресс не сохранен");
      return null;
    }
    state = daily.state;
    if (options.deferSave === true) return recorded.record;
    const saved = saveState();
    if (!saved.ok) return null;
    return recorded.record;
  }

  function recordViewed(bucket, id, mode, variant = "", options = {}) {
    const evidence = {
      kind: "viewed",
      outcome: "viewed",
      independent: false,
      objective: false,
      blind: false,
      productive: false,
      support: "reveal",
      evaluator: "none",
      mode,
      variant,
    };
    const semanticBranch = options.semanticBranch || semanticBranchForContent(bucket, id);
    if (semanticBranch && !sharedSemanticBranch(semanticBranch)) evidence.semanticBranch = semanticBranch;
    const recorded = stateStore.recordAttempt(state, bucket, id, evidence);
    if (recorded.ok) {
      state = recorded.state;
      if (options.deferSave === true) return true;
      return saveState().ok;
    }
    return false;
  }

  function attemptedToday(bucket, id = null, taskType = null, result = null) {
    const attemptDate = activeDailyTaskKey && activeDailySessionDate ? activeDailySessionDate : todayKey();
    return (state.dailyAttempts || []).some(attempt => attempt.date === attemptDate
      && attempt.contextKey === currentQualificationContextKey()
      && (bucket === null || attempt.bucket === bucket)
      && (id === null || attempt.id === id)
      && (taskType === null || attempt.taskType === taskType)
      && (result === null || attempt.result === result)
      && attempt.completed);
  }

  function recordErrorDailyCompletion(recovery, variant) {
    if (activeDailyTaskKey !== "errors"
      || !recovery?.matched
      || !recovery.advanced
      || !sameErrorTarget(activeDailyErrorTarget(), recovery.target)) return false;
    const daily = stateStore.recordDailyAttempt(state, {
      date: activeDailyTaskKey ? activeDailySessionDate || todayKey() : todayKey(),
      at: recovery.evidenceAt,
      taskType: "errors",
      contextKey: currentQualificationContextKey(),
      completed: true,
      result: "independent",
      variant,
      errorTarget: recovery.target,
      errorEvidenceAt: recovery.evidenceAt,
    });
    if (daily.ok) state = daily.state;
    return Boolean(daily.ok);
  }

  function doneCount(bucket) {
    if (bucket === "words") return allUnits.filter(item => wordMastered(item.id)).length;
    if (bucket === "questions") return assessmentQuestions.filter(item => isDone("questions", item.id)).length;
    const sources = { signs: DATA.signs, situations: DATA.situations, documents: DATA.documents, lessons: DATA.lessons };
    return (sources[bucket] || []).filter(item => isDone(bucket, item.id)).length;
  }

  function questionAttemptTotals() {
    return Object.values(state.questionAttempts || {}).reduce((totals, record) => {
      totals.independent += Number(record.independent || 0);
      totals.prompted += Number(record.prompted || 0);
      totals.failed += Number(record.failed || 0);
      return totals;
    }, { independent: 0, prompted: 0, failed: 0 });
  }

  function addErrorItem(type, id, text, reason, drill = "blind-retrieval", errorType = "meaning") {
    const semanticBranch = semanticBranchForContent(errorBucket(type), id);
    if (typeof stateStore.addError === "function") {
      const added = stateStore.addError(state, {
        type,
        id,
        text,
        reason,
        drill,
        errorType,
        ...(semanticBranch ? { semanticBranch } : {}),
        ...(branchCarriesJournalScope(semanticBranch) ? { contextKey: null } : {}),
      });
      if (added?.ok) state = added.state;
      return Boolean(added?.ok);
    }
    state.errorJournal = Array.isArray(state.errorJournal) ? state.errorJournal : [];
    const existing = state.errorJournal.find(item => item.type === type && item.id === id);
    const now = new Date().toISOString();
    const record = {
      type,
      id,
      text,
      reason,
      drill,
      errorType,
      contextKey: currentQualificationContextKey(),
      semanticBranch,
      stage: "open",
      failedAt: now,
      correctedAt: null,
      confirmationDueAt: null,
      updatedAt: now,
    };
    if (existing) Object.assign(existing, record);
    else state.errorJournal.unshift(record);
    state.errorJournal = state.errorJournal.slice(0, 100);
    return true;
  }

  function advanceErrorRecovery(type, id, drill = "blind-retrieval", evaluation = null, variant = "", response = "", now = Date.now()) {
    const frozenTarget = activeDailyErrorTarget();
    const matchingTarget = frozenTarget?.type === type && frozenTarget?.id === id ? frozenTarget : null;
    const before = matchingTarget ? errorRecordForTarget(matchingTarget) : null;
    if (typeof stateStore.recordErrorAttempt === "function" && evaluation) {
      const evidence = Eval.evidenceForEvaluation(evaluation, { mode: drill, variant, blind: true, response });
      const semanticBranch = semanticBranchForContent(errorBucket(type), id);
      if (semanticBranch) evidence.semanticBranch = semanticBranch;
      if (branchCarriesJournalScope(semanticBranch)) evidence.contextKey = null;
      const recorded = stateStore.recordErrorAttempt(state, type, id, evidence);
      if (recorded?.ok) state = recorded.state;
      const after = matchingTarget && recorded?.ok ? errorRecordForTarget(matchingTarget) : null;
      const advanced = Boolean(recorded?.ok)
        && Boolean(evaluation?.pass)
        && errorRecoveryAdvanced(before, after, recorded.evidence);
      return {
        matched: Boolean(recorded?.ok),
        advanced,
        closed: Boolean(recorded?.closed),
        target: matchingTarget,
        evidenceAt: advanced ? recorded.evidence.at : null,
      };
    }
    state.errorJournal = Array.isArray(state.errorJournal) ? state.errorJournal : [];
    const existing = state.errorJournal.find(item => item.type === type && item.id === id);
    if (!existing) return { matched: false, advanced: false, closed: false, target: matchingTarget, evidenceAt: null };
    if (existing.stage === "corrected-awaiting-confirmation" && Number(new Date(existing.confirmationDueAt)) <= now) {
      state.errorJournal = state.errorJournal.filter(item => item !== existing);
      return { matched: true, advanced: false, closed: true, target: matchingTarget, evidenceAt: null };
    }
    existing.stage = "corrected-awaiting-confirmation";
    existing.drill = drill || existing.drill || "blind-retrieval";
    existing.reason = "Исправлено вслепую. Нужна отдельная spaced confirmation не раньше чем через 24 часа.";
    existing.correctedAt = new Date(now).toISOString();
    existing.confirmationDueAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    existing.updatedAt = existing.correctedAt;
    return { matched: true, advanced: false, closed: false, target: matchingTarget, evidenceAt: null };
  }

  function applyCardSchedule(id, grade, now = Date.now()) {
    if (!Core.applyCardSchedule || !Core.getSrsOption?.(grade)) return false;
    state.words ||= {};
    const scheduled = Core.applyCardSchedule(state.words[id] || {}, grade, now);
    if (!scheduled) return false;
    const contextual = contextDependentItem("words", id);
    if (contextual && Array.isArray(scheduled.evidence)) {
      const prefix = attemptContextPrefix(contextual);
      const evidence = [...scheduled.evidence];
      const index = evidence.findLastIndex(item => String(item?.variant || "").startsWith(prefix));
      if (index >= 0) evidence[index] = { ...evidence[index], grade: scheduled.lastGrade || grade };
      scheduled.evidence = evidence;
    }
    state.words[id] = scheduled;
    return saveState().ok;
  }

  function errorItems() {
    const sourceFor = item => {
      if (item.type === "word") return unitForCurrentProfile(item.id);
      if (item.type === "question") return assessmentQuestions.find(entry => entry.id === item.id);
      if (item.type === "situation") return DATA.situations.find(entry => entry.id === item.id || item.id.startsWith(`${entry.id}-`));
      if (item.type === "sign") return DATA.signs.find(entry => entry.id === item.id);
      if (item.type === "document") return DATA.documents.find(entry => entry.id === item.id);
      if (item.type === "lesson") return DATA.lessons.find(entry => entry.id === item.id);
      if (item.type === "diagnostic" && item.id.startsWith("diagnostic-")) {
        return diagnosticCorrectionItem(item);
      }
      return null;
    };
    const items = (state.errorJournal || []).filter(item => {
      if (item.stage === "closed") return false;
      const currentBranch = semanticBranchForContent(errorBucket(item.type), item.id);
      if ((item.semanticBranch || null) !== (currentBranch || null)) return false;
      if (branchCarriesJournalScope(currentBranch)) {
        if (item.contextKey !== null) return false;
      } else if (item.contextKey !== currentQualificationContextKey()) return false;
      const source = sourceFor(item);
      if (item.type === "diagnostic" && !source) return false;
      return !source || applies(source);
    });
    return items;
  }

  function wordMastered(id) {
    return StateApi.isMastered(recordForCurrentContext("words", id));
  }

  function demonstratedSuccessVariants(bucket, id) {
    const record = state[bucket]?.[id] || {};
    const proof = Array.isArray(record.masteryProof) ? record.masteryProof : Array.isArray(record.masteryProof?.successes) ? record.masteryProof.successes : [];
    const evidence = Array.isArray(record.evidence) ? record.evidence : [];
    return new Set([...proof, ...evidence]
      .filter(item => item?.outcome === "success" && item?.kind === "demonstrated" && item?.objective && item?.blind && item?.productive)
      .map(item => item.variant)
      .filter(Boolean));
  }

  function activeErrorFor(bucket, id) {
    const type = {
      words: "word",
      questions: "question",
      signs: "sign",
      situations: "situation",
      documents: "document",
      lessons: "lesson",
    }[bucket];
    const semanticBranch = semanticBranchForContent(bucket, id);
    return (state.errorJournal || []).find(item => item.type === type
      && item.id === id
      && item.stage !== "closed"
      && (branchCarriesJournalScope(semanticBranch)
        ? item.contextKey === null
        : item.contextKey === currentQualificationContextKey())
      && (item.semanticBranch || null) === (semanticBranch || null)) || null;
  }

  function chooseVariant(bucket, id, variants) {
    const activeError = activeErrorFor(bucket, id);
    const correctionVariant = activeError?.resolutionProof?.[0]?.variant;
    if (correctionVariant) {
      return variants.find(variant => variant !== correctionVariant) || variants[0];
    }
    const used = demonstratedSuccessVariants(bucket, id);
    return variants.find(variant => !used.has(variant)) || variants[used.size % variants.length] || variants[0];
  }

  function chooseContextualMode(bucket, item, modes) {
    const contextual = modes.map(mode => contextualAttemptVariant(item, mode));
    const selected = chooseVariant(bucket, item.id, contextual);
    const index = Math.max(0, contextual.indexOf(selected));
    return modes[index] || modes[0];
  }

  function questionStimulusKey(id, target = listeningTarget) {
    return `${id}:${target}`;
  }

  function questionStimulusWasHeard(id, target = listeningTarget) {
    return heardQuestionStimuli.has(questionStimulusKey(id, target));
  }

  function clearQuestionStimulusExposure(id) {
    stopPlayback();
    heardQuestionStimuli.delete(questionStimulusKey(id, "prompt"));
    heardQuestionStimuli.delete(questionStimulusKey(id, "answer"));
  }

  function situationStimulusKey(item, variant = situationVariant, mode = situationMode) {
    return `${item?.id || "unknown"}:${variant}:${mode}`;
  }

  function situationRequiresExposure(mode = situationMode) {
    return ["listen", "phone", "elp"].includes(mode);
  }

  function situationAudioProfile(item, mode = situationMode) {
    if (mode === "phone") return "phone";
    if (mode === "elp") return "roadside";
    return situationProfile(situationIndex, item);
  }

  function situationVariantSupportsMode(item, variantId, mode = situationMode) {
    if (!situationRequiresExposure(mode)) return true;
    const profile = situationAudioProfile(item, mode);
    const practice = situationPracticeFor(item, variantId);
    return practice.turns.length > 0 && practice.turns.every(turn => {
      const audio = turn.promptAudio;
      return audio?.eligible === true
        && audio.qualificationPolicy === "exact-local-file-only"
        && typeof audio.sources?.[profile] === "string"
        && audio.sources[profile].length > 0;
    });
  }

  function eligibleSituationVariants(item, mode = situationMode) {
    return ["primary", "transfer"].filter(variant => situationVariantSupportsMode(item, variant, mode));
  }

  function exampleGap(item) {
    return Eval.exampleGapCue(item);
  }

  function responseHash(value) {
    let hash = 2166136261;
    const normalized = Eval.normalizeText(value);
    for (let index = 0; index < normalized.length; index += 1) {
      hash ^= normalized.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function reviewedToday(id) {
    return attemptedToday("words", id);
  }

  function dueUnits(source = allUnits) {
    return dueContent("words", source);
  }

  function dueContent(bucket, source) {
    const now = Date.now();
    return source
      .filter(item => StateApi.isDue(recordForCurrentContext(bucket, item.id), { now }))
      .sort((left, right) => {
        const leftRecord = recordForCurrentContext(bucket, left.id);
        const rightRecord = recordForCurrentContext(bucket, right.id);
        return new Date(leftRecord?.nextDueAt || leftRecord?.dueAt) - new Date(rightRecord?.nextDueAt || rightRecord?.dueAt);
      });
  }

  const DUE_PLAN_FIELDS = [
    ["dueIds", "words", () => allUnits.filter(applies), 6],
    ["dueQuestionIds", "questions", () => assessmentQuestions.filter(applies), 3],
    ["dueSignIds", "signs", () => DATA.signs.filter(applies), 3],
    ["dueSituationIds", "situations", () => DATA.situations.filter(applies), 2],
    ["dueDocumentIds", "documents", () => DATA.documents.filter(applies), 2],
    ["dueLessonIds", "lessons", () => DATA.lessons.filter(applies), 2],
  ];
  let dueInvalidationTimer = null;

  function applicabilityKey() {
    return JSON.stringify(applicabilityContext());
  }

  function liveDueFields() {
    return Object.fromEntries(DUE_PLAN_FIELDS.map(([field, bucket, source, limit]) => [
      field,
      dueContent(bucket, source()).slice(0, limit).map(item => item.id),
    ]));
  }

  function mergeLiveDue(plan) {
    const live = liveDueFields();
    let changed = false;
    for (const [field] of DUE_PLAN_FIELDS) {
      const current = Array.isArray(plan[field]) ? plan[field] : [];
      if (current.join("\0") !== live[field].join("\0")) {
        plan[field] = live[field];
        changed = true;
      }
    }
    return changed;
  }

  function activeDailyRoute(plan = state.dailyPlan) {
    return Array.isArray(plan?.routeSnapshot) && plan.routeSnapshot.length > 0;
  }

  function nextFutureDueAt() {
    let earliest = Infinity;
    for (const bucket of ["words", "questions", "signs", "situations", "documents", "lessons"]) {
      for (const id of Object.keys(state[bucket] || {})) {
        const record = recordForCurrentContext(bucket, id);
        const due = Date.parse(String(record?.nextDueAt || record?.dueAt || ""));
        if (Number.isFinite(due) && due > Date.now() && due < earliest) earliest = due;
      }
    }
    return earliest;
  }

  function scheduleDueInvalidation() {
    clearTimeout(dueInvalidationTimer);
    const wakeAt = Math.min(
      nextFutureDueAt(),
      Core.nextLocalDateBoundary ? Core.nextLocalDateBoundary(new Date()) : Infinity,
    );
    if (!Number.isFinite(wakeAt)) return;
    const delay = Math.max(50, Math.min(2147483000, wakeAt - Date.now() + 25));
    dueInvalidationTimer = setTimeout(() => {
      if (state.dailyPlan && !activeDailyRoute() && mergeLiveDue(state.dailyPlan)) saveState({ silent: true });
      if (["dashboard", "progress"].includes(currentView)) renderView(currentView);
      scheduleDueInvalidation();
    }, delay);
  }

  function refreshTimeSensitiveView() {
    if (state.dailyPlan && !activeDailyRoute() && mergeLiveDue(state.dailyPlan)) saveState({ silent: true });
    if (["dashboard", "progress"].includes(currentView)) renderView(currentView);
    scheduleDueInvalidation();
  }

  function allDueReviews(profile = state.profile || "both") {
    return [
      ...dueContent("words", allUnits.filter(applies)),
      ...dueContent("questions", assessmentQuestions.filter(applies)),
      ...dueContent("signs", DATA.signs.filter(applies)),
      ...dueContent("situations", DATA.situations.filter(applies)),
      ...dueContent("documents", DATA.documents.filter(applies)),
      ...dueContent("lessons", DATA.lessons.filter(applies)),
    ];
  }

  function masteredCount(source) {
    return source.filter(item => wordMastered(item.id)).length;
  }

  function clampPercent(done, total) {
    return total ? Math.min(100, Math.round((done / total) * 1000) / 10) : 0;
  }

  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("show"), 2200);
  }

  function showPersistenceNotice(message, kind = "information") {
    const node = $("#persistence-status");
    if (node) {
      node.textContent = message;
      node.dataset.kind = kind;
      node.hidden = false;
    }
    toast(message);
  }

  function showStorageRecoveryWarning() {
    if (!recoveredState.persistenceError) return;
    const warning = document.createElement("aside");
    warning.className = "storage-warning";
    warning.setAttribute("role", "alert");
    warning.innerHTML = '<strong>Прогресс восстановлен, но локальное хранилище не удалось полностью исправить.</strong><span>Текущие данные доступны в памяти. Освободите место и экспортируйте прогресс перед закрытием страницы.</span><button type="button" aria-label="Закрыть предупреждение">Закрыть</button>';
    warning.querySelector("button").addEventListener("click", () => warning.remove());
    $("#app-main").prepend(warning);
  }

  const VIEW_META = {
    dashboard: ["Рабочий маршрут", "Сегодня"],
    learn: ["Короткие занятия", "Учиться"],
    practice: ["Ответ как на работе", "Практика"],
    reference: ["Быстрый доступ", "Справочник"],
    course: ["General 700 + Truck 400 + Hotshot 100", "Курс"],
    cards: ["Активное вспоминание", "Карточки"],
    inspections: ["CVSA + FMCSA ELP", "Инспекции"],
    situations: ["40 рабочих сцен", "Ситуации"],
    signs: ["Дорожные знаки и табло", "Знаки"],
    documents: ["Документы для проверки", "Документы"],
    lessons: ["21 урок общения", "Уроки"],
    diagnostic: ["Необязательная проверка", "Диагностика"],
    errors: ["Короткая очередь", "Журнал ошибок"],
    branching: ["Рабочие ситуации", "Выбор действия"],
    summaries: ["Рабочий блокнот", "Конспекты"],
    progress: ["Ваши результаты", "Прогресс"],
  };

  const HUB_FOR_VIEW = {
    dashboard: "dashboard",
    learn: "learn", course: "learn", cards: "learn", lessons: "learn",
    practice: "practice", inspections: "practice", situations: "practice", diagnostic: "practice", errors: "practice", branching: "practice",
    reference: "reference", signs: "reference", documents: "reference", summaries: "reference",
    progress: "progress",
  };

  let menuReturnFocus = null;
  const mobileNavQuery = window.matchMedia("(max-width: 860px)");
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  function scrollBehavior() {
    return reducedMotionQuery.matches ? "auto" : "smooth";
  }

  function syncMobileNavState() {
    const sidebar = $("#sidebar");
    const workspace = $(".workspace");
    const isOpen = sidebar.classList.contains("open");
    if (!mobileNavQuery.matches) {
      sidebar.inert = false;
      sidebar.removeAttribute("aria-hidden");
      workspace.inert = false;
      workspace.removeAttribute("aria-hidden");
      $("#sidebar-backdrop").hidden = true;
      $("#mobile-menu").setAttribute("aria-expanded", "false");
      return;
    }
    sidebar.inert = !isOpen;
    sidebar.setAttribute("aria-hidden", isOpen ? "false" : "true");
    workspace.inert = isOpen;
    if (isOpen) workspace.setAttribute("aria-hidden", "true");
    else workspace.removeAttribute("aria-hidden");
  }

  function openMobileNav() {
    menuReturnFocus = document.activeElement;
    $(".sidebar").classList.add("open");
    $("#sidebar-backdrop").hidden = false;
    $("#mobile-menu").setAttribute("aria-expanded", "true");
    syncMobileNavState();
    $("#sidebar-close").focus();
  }

  function closeMobileNav(returnFocus = true) {
    $(".sidebar").classList.remove("open");
    $("#sidebar-backdrop").hidden = true;
    $("#mobile-menu").setAttribute("aria-expanded", "false");
    syncMobileNavState();
    if (returnFocus && menuReturnFocus instanceof HTMLElement) menuReturnFocus.focus();
    menuReturnFocus = null;
  }

  function go(view) {
    if (!VIEW_META[view]) return;
    if (view !== currentView && (view === "inspections" || currentView === "inspections")) heardQuestionStimuli.clear();
    if (view !== currentView && (view === "situations" || currentView === "situations")) {
      heardSituationStimuli.clear();
      revealedSituationStimuli.clear();
    }
    if (view !== currentView && (view === "lessons" || currentView === "lessons")) heardLessonStimuli.clear();
    currentView = view;
    stopPlayback();
    recorderController?.handleNavigation();
    $$(".view").forEach(node => node.classList.toggle("active", node.id === `view-${view}`));
    $$(".nav-button").forEach(node => {
      const active = node.dataset.hub === HUB_FOR_VIEW[view];
      node.classList.toggle("active", active);
      if (active) node.setAttribute("aria-current", "page");
      else node.removeAttribute("aria-current");
    });
    $("#view-eyebrow").textContent = VIEW_META[view][0];
    $("#view-title").textContent = VIEW_META[view][1];
    closeMobileNav(false);
    history.replaceState(null, "", `#${view}`);
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
    renderView(view);
    if (!audioDataReady && ["cards", "inspections", "situations", "signs", "lessons", "diagnostic"].includes(view)) {
      ensureAudioData().then(loaded => {
        if (loaded && currentView === view) renderView(view);
      });
    }
    $("#view-title").focus({ preventScroll: true });
  }

  function renderView(view) {
    if (view === "dashboard") renderDashboard();
    if (view === "practice") renderPracticeHub();
    if (view === "course") renderCourse();
    if (view === "cards") renderCard();
    if (view === "inspections") {
      renderInspectionLevels();
      setInspectionTab(inspectionTab);
    }
    if (view === "situations") renderSituations();
    if (view === "signs") renderSigns();
    if (view === "documents") renderDocuments();
    if (view === "lessons") renderLessons();
    if (view === "diagnostic") renderDiagnostic();
    if (view === "errors") renderErrors();
    if (view === "branching") renderBranching();
    if (view === "progress") renderProgress();
  }

  function updateTopProgress() {
    const applicable = allUnits.filter(applies);
    const learned = masteredCount(applicable);
    const total = applicable.length;
    const percent = clampPercent(learned, total);
    $("#top-progress-label").textContent = `Письменно: ${learned} из ${total}`;
    $("#top-progress-percent").textContent = `${percent}%`;
    $("#top-progress-bar").style.width = `${percent}%`;
  }

  function seededPick(items, count, offset = 0) {
    if (!items.length) return [];
    const dateKey = todayKey().replaceAll("-", "");
    let seed = Number(dateKey) + state.dailyRefresh * 97 + offset * 31;
    const pool = [...items];
    const picked = [];
    while (pool.length && picked.length < count) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const index = seed % pool.length;
      picked.push(pool.splice(index, 1)[0]);
    }
    return picked;
  }

  function curriculumPick(items, count, offset = 0) {
    const orderedWindow = items.slice(0, Math.max(count * 3, 12));
    return seededPick(orderedWindow, count, offset);
  }

  function curriculumRecordFor(id) {
    if (unitById.has(id)) return recordForCurrentContext("words", id);
    if (assessmentQuestions.some(item => item.id === id)) return recordForCurrentContext("questions", id);
    if (DATA.situations.some(item => item.id === id)) return recordForCurrentContext("situations", id);
    if (DATA.signs.some(item => item.id === id)) return recordForCurrentContext("signs", id);
    if (DATA.documents.some(item => item.id === id)) return recordForCurrentContext("documents", id);
    if (DATA.lessons.some(item => item.id === id)) return recordForCurrentContext("lessons", id);
    return null;
  }

  function completedCurriculumIds() {
    const ids = new Set();
    const declared = [
      ...(DATA.curriculumPlan?.foundationIds || []),
      ...(DATA.curriculumPlan?.advancedIds || []),
      ...allUnits.map(item => item.id),
      ...assessmentQuestions.map(item => item.id),
      ...DATA.situations.map(item => item.id),
      ...DATA.signs.map(item => item.id),
      ...DATA.documents.map(item => item.id),
      ...DATA.lessons.map(item => item.id),
    ];
    for (const id of new Set(declared)) {
      const record = curriculumRecordFor(id);
      if (StateApi.isMastered(record) || (record?.evidence || []).some(evidence => StateApi.isQualifyingEvidence?.(evidence))) ids.add(id);
    }
    return ids;
  }

  function curriculumSessionNumber() {
    return Math.max(1, Number(state.sessionOrdinal || 1));
  }

  function curriculumSource(items) {
    return Core.curriculumSequence
      ? Core.curriculumSequence(items, completedCurriculumIds(), DATA.curriculumPlan || {}, { sessionNumber: curriculumSessionNumber() })
      : items;
  }

  function profileHotshotSource() {
    return currentUnits(DATA.hotshot.map(item => ({ ...item, track: "hotshot" }))).filter(applies);
  }

  function resolveIds(ids, source) {
    const byId = new Map(source.map(item => [item.id, item]));
    return (ids || []).map(id => byId.get(id)).filter(Boolean);
  }

  function generateDailyPlan() {
    const profile = state.profile || "both";
    const counts = profile === "tractor" ? { truck: 6, hotshot: 0 } : profile === "both" ? { truck: 4, hotshot: 2 } : { truck: 2, hotshot: 4 };
    const coreSource = curriculumSource(currentUnits(DATA.core.map(item => ({ ...item, track: "core" }))).filter(applies));
    const newCore = coreSource.filter(item => !wordMastered(item.id));
    const truckSource = curriculumSource(currentUnits(DATA.truck.map(item => ({ ...item, track: "truck" }))).filter(applies));
    const newTruck = truckSource.filter(item => !wordMastered(item.id));
    const hotshotSource = curriculumSource(profileHotshotSource());
    const newHotshot = hotshotSource.filter(item => !wordMastered(item.id));
    const lessonSource = curriculumSource(DATA.lessons.filter(applies));
    const situationSource = curriculumSource(DATA.situations.filter(applies));
    const documentSource = curriculumSource(DATA.documents.filter(applies));
    const questionSource = curriculumSource(assessmentQuestions.filter(applies));
    const lesson = lessonSource.find(item => !isDone("lessons", item.id)
      && Core.lessonConstructAvailable(lessonConstructState(item), Date.now())) || null;
    const situationPending = situationSource.filter(item => !isDone("situations", item.id));
    const documentPending = documentSource.filter(item => !isDone("documents", item.id));
    const officialSigns = DATA.signs.filter(item => item.provenance === "fhwa-mutcd-shs" && applies(item));
    const signPending = officialSigns.filter(item => !isDone("signs", item.id));
    const applicableUnits = allUnits.filter(applies);
    const dueFields = liveDueFields();
    return {
      date: todayKey(),
      refresh: state.dailyRefresh,
      profile,
      applicabilityKey: applicabilityKey(),
      coreIds: curriculumPick(newCore.length ? newCore : coreSource, 4, 1).map(item => item.id),
      ...dueFields,
      truckIds: curriculumPick(newTruck.length ? newTruck : truckSource, counts.truck, 2).map(item => item.id),
      hotshotIds: counts.hotshot ? curriculumPick(newHotshot.length ? newHotshot : hotshotSource, counts.hotshot, 6).map(item => item.id) : [],
      questionIds: curriculumPick(questionSource.filter(item => !isDone("questions", item.id)), 3, 8).map(item => item.id),
      lessonId: lesson?.id ?? null,
      situationId: (situationPending.length ? situationPending : situationSource)[0]?.id ?? null,
      signIds: seededPick(signPending.length ? signPending : officialSigns, 5, 4).map(item => item.id),
      documentId: (documentPending.length ? documentPending : documentSource)[0]?.id ?? null,
    };
  }

  function hydrateDailyPlan(plan) {
    return {
      ...plan,
      due: resolveIds(plan.dueIds || [], currentUnits().filter(applies)),
      dueQuestions: resolveIds(plan.dueQuestionIds || [], assessmentQuestions.filter(applies)),
      dueSigns: resolveIds(plan.dueSignIds || [], DATA.signs.filter(applies)),
      dueSituations: resolveIds(plan.dueSituationIds || [], DATA.situations.filter(applies)),
      dueDocuments: resolveIds(plan.dueDocumentIds || [], DATA.documents.filter(applies)),
      dueLessons: resolveIds(plan.dueLessonIds || [], DATA.lessons.filter(applies)),
      core: resolveIds(plan.coreIds, currentUnits(DATA.core.map(item => ({ ...item, track: "core" }))).filter(applies)),
      truck: resolveIds(plan.truckIds, currentUnits(DATA.truck.map(item => ({ ...item, track: "truck" }))).filter(applies)),
      hotshot: resolveIds(plan.hotshotIds, currentUnits(DATA.hotshot.map(item => ({ ...item, track: "hotshot" }))).filter(applies)),
      lesson: DATA.lessons.find(item => item.id === plan.lessonId && applies(item)),
      situation: DATA.situations.find(item => item.id === plan.situationId && applies(item)),
      signs: resolveIds(plan.signIds, DATA.signs.filter(applies)),
      document: DATA.documents.find(item => item.id === plan.documentId && applies(item)),
      questions: resolveIds(plan.questionIds || [], assessmentQuestions.filter(applies)),
    };
  }

  function dailyPlan() {
    let plan = state.dailyPlan;
    const activeRoute = activeDailyRoute();
    const wrongDateWithoutActiveRoute = state.dailyPlan?.date !== todayKey() && !activeRoute;
    if (!state.dailyPlan || !Array.isArray(state.dailyPlan.dueIds) || wrongDateWithoutActiveRoute || state.dailyPlan.refresh !== state.dailyRefresh || state.dailyPlan.profile !== (state.profile || "both") || state.dailyPlan.applicabilityKey !== applicabilityKey()) {
      state.dailyPlan = generateDailyPlan();
      plan = state.dailyPlan;
      if (saveState().ok) plan = state.dailyPlan;
    } else if (!activeRoute && mergeLiveDue(state.dailyPlan)) {
      plan = state.dailyPlan;
      if (saveState({ silent: true }).ok) plan = state.dailyPlan;
    }
    return hydrateDailyPlan(plan);
  }

  function dailyTasks(plan = dailyPlan()) {
    const progression = item => Number(item?.curriculum?.sequence ?? item?.priority ?? Number.MAX_SAFE_INTEGER);
    const earliest = items => Math.min(...(items || []).map(progression), Number.MAX_SAFE_INTEGER);
    const professional = [...plan.truck, ...plan.hotshot];
    const dueIds = plan.due.map(item => item.id);
    if (dueIds.length && !plan.due.some(item => item.track !== "core") && professional[0]) dueIds.push(professional[0].id);
    const dueTasks = [
      dueIds.length ? { key: "due", label: "Повторение по сроку", title: `${plan.due.length} к повторению`, detail: "Срок наступил. Профессиональная фраза включена в этот шаг.", view: "cards", ids: [...new Set(dueIds)], track: "mixed", professional: true, priority: true } : null,
      plan.dueQuestions.length ? { key: "due-questions", label: "Повторение вопросов", title: `${plan.dueQuestions.length} к повторению`, detail: "Ответьте до раскрытия учебной модели.", view: "inspections", ids: plan.dueQuestions.map(item => item.id), professional: true, priority: true } : null,
      plan.dueSigns.length ? { key: "due-signs", label: "Повторение знаков", title: `${plan.dueSigns.length} к повторению`, detail: "Назовите смысл и действие до раскрытия.", view: "signs", ids: plan.dueSigns.map(item => item.id), professional: true, priority: true } : null,
      plan.dueSituations.length ? { key: "due-situations", label: "Повторение ситуации", title: plan.dueSituations[0].title, detail: "Снова дайте рабочий ответ без подсказки.", view: "situations", id: plan.dueSituations[0].id, professional: true, priority: true } : null,
      plan.dueDocuments.length ? { key: "due-documents", label: "Повторение документа", title: plan.dueDocuments[0].titleRu, detail: "Снова найдите поле без подсказки.", view: "documents", id: plan.dueDocuments[0].id, professional: true, priority: true } : null,
      plan.dueLessons.length ? { key: "due-lessons", label: "Повторение урока", title: plan.dueLessons[0].titleRu || plan.dueLessons[0].title, detail: "Снова проговорите целевые реплики.", view: "lessons", id: plan.dueLessons[0].id, professional: true, priority: true } : null,
    ].filter(Boolean);
    const dateCursor = [...todayKey()].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const dueCursor = Math.abs(dateCursor + Number(state.dailyRefresh || 0)) % Math.max(1, dueTasks.length);
    const rotatedDue = [...dueTasks.slice(dueCursor), ...dueTasks.slice(0, dueCursor)];
    return [
      ...rotatedDue,
      plan.core.length ? { key: "core", label: "Новые слова", title: `General Core, ${plan.core.length} ед.`, detail: "Целевые ответы откроются только после самостоятельного ввода по русской подсказке.", view: "cards", ids: plan.core.map(item => item.id), track: "core", progression: earliest(plan.core) } : null,
      plan.truck.length ? { key: "truck", label: "Рабочие фразы", title: `Truck Track, ${plan.truck.length} ед.`, detail: "Целевые рабочие реплики скрыты до самостоятельного ответа.", view: "cards", ids: plan.truck.map(item => item.id), track: "truck", professional: true, progression: earliest(plan.truck) } : null,
      plan.hotshot.length ? { key: "hotshot", label: "Hotshot car hauler", title: `Пикап и прицеп, ${plan.hotshot.length} ед.`, detail: "Целевые реплики Hotshot скрыты до самостоятельного ответа.", view: "cards", ids: plan.hotshot.map(item => item.id), track: "hotshot", professional: true, progression: earliest(plan.hotshot) } : null,
      plan.lesson ? { key: "lesson", label: "Урок общения", title: plan.lesson.titleRu || plan.lesson.title, detail: plan.lesson.goal, view: "lessons", id: plan.lesson.id, professional: true, progression: progression(plan.lesson) } : null,
      plan.questions.length ? { key: "questions", label: "Базовый рабочий ответ", title: `${plan.questions.length} фундаментальных вопроса`, detail: "Ответьте до раскрытия учебной модели.", view: "inspections", ids: plan.questions.map(item => item.id), professional: true, progression: earliest(plan.questions) } : null,
      plan.signs.length ? { key: "signs", label: "Распознавание знаков", title: `${plan.signs.length} знаков`, detail: plan.signs.map(item => item.display).slice(0, 3).join(" + "), view: "signs", ids: plan.signs.map(item => item.id), progression: earliest(plan.signs) } : null,
      plan.situation ? { key: "situation", label: "Рабочая ситуация", title: plan.situation.titleRu || plan.situation.title, detail: plan.situation.goal, view: "situations", id: plan.situation.id, professional: true, progression: progression(plan.situation) } : null,
      plan.document ? { key: "document", label: "Тренировка документов", title: plan.document.titleRu, detail: plan.document.practice || "Найдите ключевые поля.", view: "documents", id: plan.document.id, professional: true, progression: progression(plan.document) } : null,
    ].filter(Boolean);
  }

  function dailyTaskDone(task) {
    const date = state.dailyPlan?.date || todayKey();
    return Core.dailyTaskCompleted ? Core.dailyTaskCompleted({ ...task, date }, state.dailyAttempts || [], { contextKey: currentQualificationContextKey(), elpGate: state.elpGate, date }) : false;
  }

  function taskCompletionHint(task) {
    if (!task) return "Маршрут на сегодня завершен.";
    if (task.key.startsWith("due")) return "Ответьте еще раз без подсказки.";
    if (["core", "truck", "hotshot"].includes(task.key)) return "Ответьте на каждую карточку без подсказки.";
    if (task.key === "lesson") return "Ответьте до показа примера.";
    if (task.key === "signs") return "Назовите смысл знака и безопасное действие.";
    if (task.key === "situation") return "Дайте письменный ответ по ситуации.";
    if (task.key === "document") return "Найдите нужное поле до показа ответа.";
    if (task.key === "errors") return "Повторите задание без подсказки.";
    return "Ответьте без подсказки.";
  }

  function firstIncompleteDailyTask() {
    const snapshot = sessionSnapshot();
    return snapshot.tasks.length ? snapshot.tasks[todayTaskOffset % snapshot.tasks.length] : snapshot.routeTasks[0];
  }

  function diagnosticListeningIds() {
    const preferred = [
      "question:when-is-your-delivery-appointment",
      "question:what-is-the-listed-weight",
      "question:how-many-driving-hours-do-you-have-left",
      "question:tell-me-when-the-low-air-warning-activates",
      "question:the-driver-is-out-of-service-until-oos-condition",
    ];
    return preferred
      .map(id => DATA.inspectionQuestions.find(item => item.id === id))
      .filter(item => item && applies(item) && listeningProfileRow(item)?.driverAnswer)
      .map(item => item.id);
  }

  function diagnosticVocabularyIds() {
    const terms = ["inspection lane", "seal", "reweigh", "out-of-service", "overage", "cargo securement"];
    return currentUnits().filter(item => applies(item) && terms.some(term => Eval.normalizeText(item.word).includes(Eval.normalizeText(term)))).slice(0, 6).map(item => item.id);
  }

  function diagnosticInspectionIds() {
    return DATA.inspectionQuestions
      .filter(item => applies(item) && /inspection|result|violation|completion/i.test(item.category || ""))
      .slice(0, 6)
      .map(item => item.id);
  }

  const ROUTE_TASK_BUCKETS = Object.freeze({
    due: "words",
    "due-questions": "questions",
    "due-signs": "signs",
    "due-situations": "situations",
    "due-documents": "documents",
    "due-lessons": "lessons",
    core: "words",
    truck: "words",
    hotshot: "words",
    lesson: "lessons",
    situation: "situations",
    document: "documents",
    elp: "questions",
    listening: "questions",
    signs: "signs",
    words: "words",
    questions: "questions",
  });
  const ROUTE_SCALAR_KEYS = new Set(["due-situations", "due-documents", "due-lessons", "lesson", "situation", "document"]);

  function routeDescriptorForTask(task) {
    if (task?.key === "errors") {
      const errorTarget = task.errorTarget;
      return errorTarget ? { key: "errors", bucket: null, errorTarget: { ...errorTarget } } : null;
    }
    const routeIdLimit = task?.key === "elp" ? ELP_STEP_ONE_REQUIRED : 5;
    const requestedIds = [...new Set((task?.ids || []).map(String))].slice(0, routeIdLimit);
    const bucket = task?.key === "diagnostic"
      ? requestedIds.every(id => unitById.has(id)) ? "words" : "questions"
      : ROUTE_TASK_BUCKETS[task?.key];
    if (!bucket) return { key: task.key, bucket: null };
    if (ROUTE_SCALAR_KEYS.has(task.key)) {
      const id = task.id || task.ids?.[0];
      return id ? { key: task.key, bucket, id } : null;
    }
    const ids = requestedIds;
    if (!ids.length) return null;
    return { key: task.key, bucket, ids };
  }

  function taskWithFrozenPayload(descriptor, candidates) {
    const viewByBucket = {
      words: "cards",
      questions: "inspections",
      signs: "signs",
      situations: "situations",
      documents: "documents",
      lessons: "lessons",
    };
    const candidate = candidates.find(task => task.key === descriptor.key
      && (descriptor.key !== "diagnostic" || task.bucket === descriptor.bucket)) || {
      key: descriptor.key,
      label: descriptor.key === "errors" ? "Трудные фразы" : "Сохраненный шаг",
      title: descriptor.key === "errors" ? "Короткое повторение ошибок" : "Шаг текущей сессии",
      detail: "Состав этого шага зафиксирован до явного начала новой сессии.",
      view: descriptor.key === "errors" ? "errors" : viewByBucket[descriptor.bucket] || "dashboard",
      track: descriptor.bucket === "words" ? "mixed" : undefined,
      priority: descriptor.key.startsWith("due") || descriptor.key === "errors",
      professional: descriptor.key !== "core" && descriptor.key !== "signs",
    };
    const base = descriptor.key === "elp"
      ? { ...candidate, atomic: true, view: "inspections", professional: true, priority: true }
      : descriptor.key === "diagnostic"
        ? {
            ...candidate,
            view: descriptor.bucket === "words" ? "cards" : "inspections",
            track: descriptor.bucket === "words" ? "mixed" : undefined,
            professional: true,
            priority: true,
          }
        : candidate;
    if (descriptor.key === "errors") {
      return { ...base, key: descriptor.key, bucket: null, errorTarget: { ...descriptor.errorTarget } };
    }
    if (descriptor.bucket === null) return { ...base, key: descriptor.key, bucket: null };
    if (descriptor.id) return { ...base, key: descriptor.key, bucket: descriptor.bucket, id: descriptor.id, ids: undefined };
    return { ...base, key: descriptor.key, bucket: descriptor.bucket, ids: [...descriptor.ids], id: undefined };
  }

  function routePayloadDifferenceCount(routeSnapshot, liveCandidates) {
    if (!Array.isArray(routeSnapshot)) return 0;
    let count = 0;
    for (const descriptor of routeSnapshot) {
      const live = liveCandidates.find(task => task.key === descriptor.key);
      if (!live) continue;
      if (descriptor.key === "errors") {
        if (!sameErrorTarget(descriptor.errorTarget, live.errorTarget)) count += 1;
        continue;
      }
      const frozenIds = new Set(descriptor.ids || (descriptor.id ? [descriptor.id] : []));
      const liveIds = new Set(live.ids || (live.id ? [live.id] : []));
      if ([...liveIds].some(id => !frozenIds.has(id))) count += 1;
    }
    return count;
  }

  function sessionTaskCandidates(plan = dailyPlan()) {
    const tasks = dailyTasks(plan);
    const weak = verifiedDiagnosticForCurrentContext()?.weakest;
    const errors = errorItems();
    if (errors.length) tasks.unshift({ key: "errors", label: "Трудные фразы", title: "Короткое повторение ошибок", detail: "Только применимый элемент, зафиксированный для этой сессии", view: "errors", errorTarget: errorTargetForRecord(errors[0]), priority: true, professional: true });
    else if (weak === "listening") tasks.unshift({ key: "listening", label: "Понимание на слух", title: "Дорожная тренировка звука", detail: "Локальные записи с ответом водителя и проверяемыми значениями", view: "inspections", ids: diagnosticListeningIds(), priority: true, professional: true });
    else if (weak === "elp") tasks.unshift({ key: "elp", label: "Ответ ELP", title: "Семь проверяемых ответов ELP", detail: "Ответьте без подсказки", view: "inspections", ids: elpStepOneItems().map(item => item.id), priority: true, professional: true, atomic: true });
    else if (weak === "vocabulary") tasks.unshift({ key: "diagnostic", bucket: "words", label: "Словарь диагностики", title: "Термины, которые требуют повторения", detail: "Самостоятельно введите целевые профессиональные термины", view: "cards", ids: diagnosticVocabularyIds(), track: "mixed", priority: true, professional: true });
    else if (weak === "inspection") tasks.unshift({ key: "diagnostic", bucket: "questions", label: "Действия при инспекции", title: "Проверяемые ответы по инспекции", detail: "Ответьте на применимые вопросы до модели", view: "inspections", ids: diagnosticInspectionIds(), priority: true, professional: true });
    return tasks;
  }

  function sessionSnapshot() {
    const plan = dailyPlan();
    const livePlan = hydrateDailyPlan({ ...plan, ...liveDueFields() });
    const frozenCandidates = sessionTaskCandidates(plan);
    const liveCandidates = sessionTaskCandidates(livePlan);
    const storedSnapshot = Array.isArray(plan.routeSnapshot) && plan.routeSnapshot.length ? plan.routeSnapshot : null;
    const routeKeys = storedSnapshot ? storedSnapshot.map(task => task.key) : null;
    const routeTasks = storedSnapshot ? storedSnapshot.map(task => taskWithFrozenPayload(task, frozenCandidates)) : [];
    const routeKeySet = new Set(routeKeys || []);
    const candidateSource = storedSnapshot
      ? [...routeTasks, ...liveCandidates.filter(task => !routeKeySet.has(task.key))]
      : liveCandidates;
    const snapshot = Core.selectTodayTasks(candidateSource, state.dailyAttempts || [], {
      minutes: state.dailyMinutes,
      date: plan.date || todayKey(),
      context: applicabilityContext(),
      contextKey: currentQualificationContextKey(),
      elpGate: state.elpGate,
      dueCursor: Number(plan.dueCursor || 0),
      routeKeys,
    });
    const nextKeys = snapshot.routeKeys || [];
    const nextRouteSnapshot = storedSnapshot || snapshot.routeTasks.map(routeDescriptorForTask).filter(Boolean);
    if (state.dailyPlan && (JSON.stringify(state.dailyPlan.routeKeys || []) !== JSON.stringify(nextKeys)
      || JSON.stringify(state.dailyPlan.routeSnapshot || []) !== JSON.stringify(nextRouteSnapshot)
      || Number(state.dailyPlan.dueCursor || 0) !== Number(snapshot.dueCursor || 0))) {
      state.dailyPlan.routeKeys = nextKeys;
      if (nextRouteSnapshot.length) state.dailyPlan.routeSnapshot = nextRouteSnapshot;
      else delete state.dailyPlan.routeSnapshot;
      state.dailyPlan.dueCursor = Number(snapshot.dueCursor || 0);
      saveState({ silent: true });
    }
    const sameKeyBacklog = routePayloadDifferenceCount(nextRouteSnapshot, liveCandidates);
    return { ...snapshot, backlogCount: (snapshot.backlogKeys?.length || 0) + sameKeyBacklog };
  }

  function sessionTasks() {
    return sessionSnapshot().routeTasks;
  }

  function clearLessonTransientState(id) {
    lessonEvaluations.delete(id);
    for (const key of heardLessonStimuli) {
      if (key.startsWith(`${id}:`)) heardLessonStimuli.delete(key);
    }
  }

  function clearDailyTaskTransientState(task) {
    stopPlayback();
    const ids = [...new Set([...(task?.ids || []), ...(task?.id ? [task.id] : [])].map(String))];
    const questionTask = task?.key === "elp"
      || task?.key === "listening"
      || task?.key === "questions"
      || task?.key === "due-questions"
      || (task?.key === "diagnostic" && task?.view === "inspections");
    if (questionTask) {
      for (const id of ids) {
        questionEvaluations.delete(id);
        elpResponseDrafts.delete(id);
        elpResponseLocks.delete(id);
        questionRevealLocks.delete(id);
        clearQuestionStimulusExposure(id);
      }
    }
    if (task?.view === "signs") {
      for (const id of ids) {
        signEvaluations.delete(id);
        revealedSignIds.delete(id);
      }
    }
    if (task?.view === "situations") {
      const id = String(task.id || ids[0] || "");
      situationEvaluation = null;
      situationTask = null;
      currentSituationPractice = null;
      for (const key of heardSituationStimuli) if (!id || key.startsWith(`${id}:`)) heardSituationStimuli.delete(key);
      for (const key of revealedSituationStimuli) if (!id || key.startsWith(`${id}:`)) revealedSituationStimuli.delete(key);
    }
    if (task?.view === "documents") {
      documentEvaluation = null;
      documentRevealed = false;
      currentDocumentField = null;
      currentDocumentInstance = null;
    }
    if (task?.view === "lessons") {
      const id = String(task.id || ids[0] || "");
      if (id) clearLessonTransientState(id);
    }
  }

  function openDailyTask(task) {
    if (!task) return;
    clearDailyTaskTransientState(task);
    activeDailyTaskKey = task.key;
    activeDailySessionDate = state.dailyPlan?.date || todayKey();
    focusedCardIds = null;
    focusedQuestionIds = null;
    focusedSignIds = null;
    focusedLessonId = null;
    if (task.view === "errors") {
      const frozenTarget = task.errorTarget || activeDailyErrorTarget();
      const target = errorItems().find(item => sameErrorTarget(errorTargetForRecord(item), frozenTarget));
      if (target) openErrorItem(target);
      else go("errors");
      return;
    } else if (task.key === "elp") {
      startElpStepOne();
      return;
    } else if (task.key === "listening") {
      elpSession = false;
      inspectionTab = "questions";
      listeningProfile = "roadside";
      listeningTarget = "answer";
      focusedQuestionIds = [...(task.ids || diagnosticListeningIds())];
      questionIndex = 0;
      go("inspections");
      return;
    } else if (task.key === "diagnostic" && task.view === "inspections") {
      elpSession = false;
      inspectionTab = "questions";
      listeningTarget = "prompt";
      focusedQuestionIds = [...(task.ids || diagnosticInspectionIds())];
      questionIndex = 0;
      go("inspections");
      return;
    } else if (task.key === "due-questions" || task.key === "questions") {
      elpSession = false;
      inspectionTab = "questions";
      focusedQuestionIds = [...task.ids];
      questionIndex = 0;
      $("#question-category").value = "all";
      go("inspections");
      return;
    } else if (task.view === "cards") {
      cardTrack = task.track;
      focusedCardIds = [...task.ids];
      cardIndex = 0;
      $$('[data-card-track]').forEach(node => {
        const active = node.dataset.cardTrack === cardTrack;
        node.classList.toggle("active", active);
        node.setAttribute("aria-selected", String(active));
        node.tabIndex = active ? 0 : -1;
      });
    } else if (task.view === "signs") {
      focusedSignIds = [...task.ids];
      signFilter = "all";
      signStatus = "all";
      signVisibleLimit = 16;
      $("#sign-category").value = "all";
      $("#sign-status").value = "all";
    } else if (task.view === "situations") {
      situationIndex = Math.max(0, DATA.situations.findIndex(item => item.id === task.id));
    } else if (task.view === "documents") {
      documentIndex = Math.max(0, DATA.documents.findIndex(item => item.id === task.id));
    } else if (task.view === "lessons") {
      focusedLessonId = task.id;
    }
    go(task.view);
  }

  function renderProfileVisual() {
    const profile = state.profile || "both";
    const visuals = PROFILE_VISUALS[profile] || PROFILE_VISUALS.both;
    const node = $("#hero-profile-visual");
    node.classList.toggle("multiple", visuals.length > 1);
    node.innerHTML = visuals.map(item => `<figure><img src="${item.path}" alt="${escapeHtml(item.alt)}"><figcaption>${escapeHtml(item.label)}</figcaption></figure>`).join("");
  }

  function dailyAudioItem(task) {
    if (!task) return null;
    const unit = task.ids?.map(unitForCurrentProfile).find(Boolean);
    if (unit) return task.view === "cards" ? null : { text: unit.word, role: unit.wordRole || "driver", profile: unit.audioProfile || "clean" };
    const questionIds = task.ids || (task.errorTarget?.type === "question" ? [task.errorTarget.id] : []);
    const question = questionIds.map(id => assessmentQuestions.find(item => item.id === id)).find(item => item && applies(item));
    if (question) return { text: question.prompt, role: "inspector", profile: "roadside" };

    const contentId = task.id || task.errorTarget?.id;
    const lesson = DATA.lessons.find(item => item.id === contentId);
    if (lesson?.phrases?.length) return { text: lesson.phrases[0], role: "driver", profile: lesson.audioProfile || "clean" };
    const situation = DATA.situations.find(item => item.id === contentId);
    if (situation) {
      const line = situation.dialogue.find(item => item.speaker?.toLowerCase() !== "driver") || situation.dialogue[0];
      if (line) return { text: line.english, role: line.voicePreset || "driver", profile: situationProfile(0, situation) };
    }
    const documentItem = DATA.documents.find(item => item.id === contentId);
    if (documentItem) return { text: documentItem.practice || "This training document is available for inspection.", role: "driver", profile: "clean" };
    const signIds = task.ids || (task.errorTarget?.type === "sign" ? [task.errorTarget.id] : []);
    const sign = signIds.map(id => DATA.signs.find(item => item.id === id)).find(Boolean);
    if (sign) return { text: sign.display, role: "driver", profile: "clean" };
    return null;
  }

  function renderDashboard() {
    renderProfileVisual();
    const snapshot = sessionSnapshot();
    const tasks = snapshot.routeTasks;
    const completed = tasks.filter(dailyTaskDone).length;
    const routePercent = clampPercent(completed, tasks.length);
    const pending = snapshot.tasks;
    const nextTask = pending.length ? pending[todayTaskOffset % pending.length] : tasks[0];
    const firstUnit = nextTask?.ids?.map(unitForCurrentProfile).find(Boolean);
    const routedQuestions = nextTask?.ids?.map(id => assessmentQuestions.find(item => item.id === id)).filter(item => item && applies(item)) || [];
    const question = ["elp", "listening", "diagnostic"].includes(nextTask?.key)
      ? routedQuestions.find(item => !isDone("questions", item.id)) || routedQuestions[0] || assessmentQuestions.find(item => applies(item) && !isDone("questions", item.id)) || null
      : null;
    const cardTask = Boolean(firstUnit && nextTask?.view === "cards");
    const audioItem = dailyAudioItem(nextTask);
    const english = cardTask ? "Ответ по русской подсказке" : question?.prompt || nextTask?.title || "Маршрут завершен";
    const meaning = cardTask ? `Первая подсказка: ${firstUnit.translation}` : question ? "Прослушайте задание и ответьте по-английски." : nextTask?.detail || "Можно повторить короткую тренировку.";
    $("#session-time-label").textContent = `${state.dailyMinutes || 10} минут`;
    $("#route-progress").innerHTML = `<div class="route-progress-head"><span>${escapeHtml(PROFILE_LABELS[state.profile] || PROFILE_LABELS.both)}</span><strong>${completed} из ${tasks.length} шагов</strong></div><div class="progress-track"><span style="width:${routePercent}%"></span></div>`;
    $("#next-drill-title").textContent = nextTask ? nextTask.label : "Готово";
    $("#today-english").textContent = english;
    $("#next-drill-detail").textContent = meaning;
    $("#today-audio").disabled = cardTask || !audioItem;
    $("#today-audio").textContent = cardTask ? "Аудио после ответа" : audioItem ? "Прослушать" : "Аудио внутри задания";
    $("#today-completion-hint").textContent = taskCompletionHint(nextTask);
    $("#start-daily-route").textContent = completed === tasks.length ? "Повторить шаг" : "Начать этот шаг";
    $("#skip-daily-step").textContent = snapshot.complete
      ? "Продолжить новым маршрутом"
      : pending.length > 1
        ? "Другой шаг этой сессии"
        : "Новая сессия";
    $("#refresh-day").textContent = "Новая сессия";
    const backlogCount = Number(snapshot.backlogCount || 0);
    $("#route-progress").insertAdjacentHTML("beforeend", `<p class="route-backlog">Следующий маршрут: ${backlogCount} ${backlogCount === 1 ? "шаг" : "шагов"}. Текущая сессия не расширяется автоматически.</p>`);
    $("#daily-grid").innerHTML = tasks.map((task, index) => {
      const done = dailyTaskDone(task);
      const current = !done && task.key === nextTask?.key;
      return `<article class="daily-item ${done ? "done" : ""} ${current ? "current" : ""}" data-step="${index + 1}">
        <span>${escapeHtml(task.label)}</span>
        <h3>${escapeHtml(task.title)}</h3>
        <p>${escapeHtml(task.detail)}</p>
        <button data-daily-task="${escapeHtml(task.key)}">${done ? "Повторить" : "Открыть"}</button>
        <div class="daily-status">${done ? "Готово" : current ? "Следующий шаг" : "В очереди"}</div>
      </article>`;
    }).join("");
  }

  function currentCourseUnits() {
    const query = $("#course-search").value.trim().toLowerCase();
    const track = $("#course-track").value;
    const theme = $("#course-theme").value;
    return currentUnits().filter(item => {
      if (!applies(item)) return false;
      if (track !== "all" && item.track !== track) return false;
      if (theme !== "all" && item.theme !== theme) return false;
      if (!query) return true;
      return `${item.word} ${item.translation} ${item.example}`.toLowerCase().includes(query);
    });
  }

  function populateThemes() {
    const select = $("#course-theme");
    const previous = select.value || "all";
    const track = $("#course-track").value;
    const source = currentUnits().filter(item => applies(item) && (track === "all" || item.track === track));
    const themes = [...new Set(source.map(item => item.theme))].sort((a, b) => a.localeCompare(b, "ru"));
    select.innerHTML = `<option value="all">Все темы</option>` + themes.map(theme => `<option value="${escapeHtml(theme)}">${escapeHtml(theme)}</option>`).join("");
    if (themes.includes(previous)) select.value = previous;
  }

  function renderCourse() {
    populateThemes();
    const units = currentCourseUnits();
    const visible = units.slice(0, displayLimit);
    $("#course-summary").textContent = `Показано ${visible.length} из ${units.length}. Выучено ${masteredCount(units)} из ${units.length} в текущем фильтре.`;
    $("#unit-list").innerHTML = visible.map((item, index) => `
      <article class="unit-row ${isDone("words", item.id) ? "completed" : ""}" data-unit-id="${escapeHtml(item.id)}">
        <span class="unit-index">${String(index + 1).padStart(3, "0")}</span>
        <div class="unit-word"><strong>${escapeHtml(item.word)}</strong><span>${item.track === "core" ? "General Core" : escapeHtml(item.theme)}</span></div>
        <div class="unit-translation">${escapeHtml(item.translation)}</div>
        <div class="unit-example" lang="en-US">${escapeHtml(item.example)}</div>
        <div class="unit-controls"><button class="icon-button unit-speak" title="Прослушать">Слушать</button><button class="icon-button unit-practice ${isDone("words", item.id) ? "done" : ""}" title="Открыть активное вспоминание">${isDone("words", item.id) ? "Повторить" : "Тренировать"}</button></div>
      </article>`).join("");
    $("#load-more-units").hidden = visible.length >= units.length;
  }

  function buildCardQueue() {
    if (focusedCardIds?.length) {
      cardQueue = focusedCardIds.map(unitForCurrentProfile).filter(item => item && applies(item));
      cardIndex = Math.min(cardIndex, Math.max(0, cardQueue.length - 1));
      return;
    }
    let source = currentUnits(cardTrack === "core" ? DATA.core.map(item => ({ ...item, track: "core" })) : cardTrack === "truck" ? DATA.truck.map(item => ({ ...item, track: "truck" })) : cardTrack === "hotshot" ? DATA.hotshot.map(item => ({ ...item, track: "hotshot" })) : allUnits);
    source = source.map(item => item.track ? item : ({ ...item, track: cardTrack }));
    source = source.filter(applies);
    const due = dueUnits(source).sort((a, b) => new Date(state.words[a.id].dueAt) - new Date(state.words[b.id].dueAt));
    const pending = source.filter(item => !wordMastered(item.id));
    const seen = new Set(due.map(item => item.id));
    cardQueue = [...due, ...pending.filter(item => !seen.has(item.id))];
    if (!cardQueue.length) cardQueue = [...source];
    cardIndex = Math.min(cardIndex, Math.max(0, cardQueue.length - 1));
  }

  function renderCard() {
    buildCardQueue();
    const item = cardQueue[cardIndex];
    if (!item) return;
    cardRevealed = false;
    cardEvaluation = null;
    cardEvidenceVariant = chooseVariant("words", item.id, ["translation-to-english", "example-gap"].map(value => contextualAttemptVariant(item, value)));
    cardVariant = cardEvidenceVariant.endsWith("example-gap") ? "example-gap" : "translation-to-english";
    const dueCount = dueUnits(currentUnits(cardTrack === "mixed" ? allUnits : allUnits.filter(unit => unit.track === cardTrack)).filter(applies)).length;
    $("#card-queue-note").innerHTML = focusedCardIds?.length
      ? `<strong>Маршрут на сегодня:</strong> ${cardQueue.filter(item => reviewedToday(item.id)).length} из ${cardQueue.length} пройдено.`
      : `<strong>Очередь:</strong> на повторение сейчас ${dueCount}, затем новые карточки. Засчитывается только письменный ответ до показа модели.`;
    $("#card-track-label").textContent = item.track === "core" ? "General Core 700" : item.track === "hotshot" ? "Hotshot Car Hauler" : item.theme;
    $("#study-card").setAttribute("aria-labelledby", `card-tab-${cardTrack}`);
    $("#card-position").textContent = `${cardIndex + 1} / ${cardQueue.length}`;
    if ($("#card-session-left")) $("#card-session-left").textContent = focusedCardIds?.length ? `Осталось в маршруте: ${Math.max(1, cardQueue.length - cardIndex)}.` : `Осталось в короткой тренировке: ${Math.max(1, 5 - cardSessionCount)}.`;
    $("#card-word").textContent = item.word;
    $("#card-pron").textContent = item.pron ? `[${item.pron}]` : "";
    $("#card-translation").textContent = item.translation;
    $("#card-example").textContent = item.example;
    const visual = visualsByRef.get(item.id);
    const visualNode = $("#card-visual");
    visualNode.hidden = true;
    visualNode.removeAttribute("src");
    visualNode.alt = visual?.alt || "";
    if (visual) visualNode.src = visual.path;
    $("#card-cue-label").textContent = cardVariant === "example-gap" ? "Заполните пропуск по-английски" : "Переведите на английский";
    $("#card-cue").textContent = cardVariant === "example-gap" ? exampleGap(item) : item.translation;
    $("#card-response").value = "";
    $("#card-response").disabled = false;
    $("#check-card-response").disabled = false;
    $("#card-evaluation-status").textContent = "";
    $("#card-audio").disabled = true;
    $("#card-answer").hidden = true;
    $("#card-actions").innerHTML = `<button class="button secondary" id="reveal-card">Показать ответ</button>`;
    $("#reveal-card").addEventListener("click", () => revealCard({ withoutEvaluation: true }));
  }

  function revealCard(options = {}) {
    const item = cardQueue[cardIndex];
    if (!item) return;
    if (options.withoutEvaluation && !cardEvaluation) {
      if (!recordViewed("words", item.id, "card-reveal", cardEvidenceVariant, { deferSave: true })) return;
      cardEvaluation = { pass: false, evaluator: "self-report", feedback: "Модель открыта до проверки. Эта попытка не подтверждает письменное воспроизведение." };
      addErrorItem("word", item.id, item.word, "Модель открыта до ответа", "card-blind-retrieval");
      if (!saveState().ok) {
        cardEvaluation = null;
        $("#card-evaluation-status").textContent = "Модель не открыта, потому что результат не сохранился. Поле снова доступно.";
        $("#card-response")?.focus();
        return;
      }
      $("#card-evaluation-status").textContent = cardEvaluation.feedback;
    }
    cardRevealed = true;
    $("#card-response").disabled = true;
    $("#check-card-response").disabled = true;
    $("#card-audio").disabled = false;
    if ($("#card-visual").getAttribute("src")) $("#card-visual").hidden = false;
    $("#card-answer").hidden = false;
    const optionsList = Core.srsOptions?.() || Object.values(Core.SRS_OPTIONS || {}) || [
      { key: "again", label: "Снова · 10 минут" },
      { key: "hard", label: "Трудно · 1 день" },
      { key: "good", label: "Хорошо · 3 дня" },
      { key: "easy", label: "Легко · 7 дней" },
    ];
    const availableOptions = cardEvaluation?.pass === false
      ? optionsList.filter(option => (option.id || option.key) === "again")
      : optionsList;
    $("#card-actions").innerHTML = availableOptions.map(option => { const id = option.id || option.key; return `<button class="button ${id === "again" ? "danger" : id === "easy" ? "primary" : "secondary"}" data-card-grade="${escapeHtml(id)}">${escapeHtml(option.label)}</button>`; }).join("");
    $$('[data-card-grade]').forEach(button => button.addEventListener("click", () => nextCard(button.dataset.cardGrade)));
    requestAnimationFrame(() => $('[data-card-grade="again"]')?.focus());
  }

  function checkCardResponse() {
    const item = cardQueue[cardIndex];
    if (!item || cardRevealed) return;
    const response = $("#card-response").value;
    const evaluation = Eval.evaluateExactRecall({ response, expected: item.word, prompt: $("#card-cue").textContent });
    const record = recordLearningAttempt("words", item.id, evaluation, "card-typed-retrieval", cardEvidenceVariant, null, { response, deferSave: true });
    if (!record) {
      $("#card-evaluation-status").textContent = "Ответ проверен, но прогресс не сохранен. Освободите место в локальном хранилище и повторите.";
      return;
    }
    cardEvaluation = evaluation;
    $("#card-evaluation-status").textContent = evaluation.feedback;
    if (!evaluation.pass) addErrorItem("word", item.id, item.word, evaluation.feedback, "card-blind-retrieval");
    if (!saveState().ok) {
      cardEvaluation = null;
      cardRevealed = false;
      renderCard();
      $("#card-evaluation-status").textContent = "Ответ проверен, но не сохранен. Поле снова доступно, повторите попытку.";
      $("#card-response")?.focus();
      return;
    }
    revealCard();
  }

  function nextCard(grade) {
    const item = cardQueue[cardIndex];
    if (!item) return;
    if (cardEvaluation?.pass === false && grade !== "again") {
      toast("После ошибки доступен только повтор через 10 минут");
      return;
    }
    if (!applyCardSchedule(item.id, grade)) {
      toast("Интервал не сохранен. Карточка остается открытой");
      return;
    }
    cardSessionCount += 1;
    toast(grade === "again" ? "Карточка вернется через 10 минут" : "Повторение запланировано");
    if (focusedCardIds?.length) {
      const allReviewed = focusedCardIds.every(reviewedToday);
      if (allReviewed) {
        focusedCardIds = null;
        go("dashboard");
        return;
      }
      const completedIds = cardQueue.filter(entry => reviewedToday(entry.id)).map(entry => entry.id);
      const nextIndex = Core.nextPendingIndex?.(cardQueue, cardIndex, completedIds);
      cardIndex = Number.isInteger(nextIndex) && nextIndex >= 0 ? nextIndex : 0;
    } else {
      if (cardSessionCount >= 5) {
        cardSessionCount = 0;
        go("learn");
        toast("Короткая тренировка из 5 карточек завершена");
        return;
      }
      cardIndex = grade === "again" ? (cardIndex + 1) % Math.max(1, cardQueue.length) : 0;
    }
    renderCard();
  }

  function renderInspectionLevels() {
    $("#level-grid").innerHTML = DATA.inspectionLevels.map(item => `
      <article class="level-card ${["I", "II", "III"].includes(item.level) ? "primary-level" : ""}">
        <div class="level-number"><strong>${item.level}</strong><span>${["I", "II", "III"].includes(item.level) ? "Практический фокус" : "Для распознавания"}</span></div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(INSPECTION_LEVEL_RU[item.level]?.scope || item.scope)}</p>
        <small>${escapeHtml(INSPECTION_LEVEL_RU[item.level]?.focus || item.focus)}</small>
      </article>`).join("");
    populateQuestionCategories();
    renderQuestion();
  }

  function resetElpStepOneAttemptUi(ids) {
    stopPlayback();
    window.TruckAppPersistence.clearAttemptStateForIds(
      ids,
      questionEvaluations,
      elpResponseDrafts,
      elpResponseLocks,
      questionRevealLocks,
    );
    for (const id of ids) {
      heardQuestionStimuli.delete(questionStimulusKey(id, "prompt"));
      heardQuestionStimuli.delete(questionStimulusKey(id, "answer"));
    }
  }

  function resetElpStepTwoAttemptUi(ids) {
    stopPlayback();
    window.TruckAppPersistence.clearAttemptStateForIds(ids, signEvaluations, revealedSignIds);
  }

  function startElpStepOne() {
    const items = elpStepOneItems();
    if (!elpStepOneContractValid() || items.length !== ELP_STEP_ONE_REQUIRED) {
      toast("Учебный набор этапа 1 неполон");
      return;
    }
    const expectedIds = items.map(item => item.id);
    const sessionDate = activeDailySessionDate || todayKey();
    const pending = state.elpGate?.status === "pending"
      && state.elpGate.profile === state.profile
      && state.elpGate.contextKey === currentQualificationContextKey()
      && state.elpGate.sessionDate === sessionDate
      && expectedIds.length === state.elpGate.sessionIds?.length
      && expectedIds.every(id => state.elpGate.sessionIds.includes(id));
    if (pending) {
      resetElpStepOneAttemptUi(expectedIds);
      elpSession = true;
      focusedQuestionIds = null;
      questionIndex = Math.max(0, expectedIds.findIndex(id => !state.elpGate.results?.[id]));
      $("#question-category").value = "all";
      setInspectionTab("questions");
      return;
    }
    const previousGate = state.elpGate;
    resetElpStepOneAttemptUi(expectedIds);
    focusedQuestionIds = null;
    state.elpGate = {
      status: "pending",
      sessionIds: items.map(item => item.id),
      results: {},
      resultTimes: {},
      attempts: Math.min(32, Number(state.elpGate?.attempts || 0) + 1),
      sessionDate,
      startedAt: new Date().toISOString(),
      completedAt: null,
      profile: state.profile,
      contextKey: currentQualificationContextKey(),
    };
    elpSession = true;
    questionIndex = 0;
    $("#question-category").value = "all";
    if (!saveState().ok) {
      state.elpGate = previousGate;
      elpSession = false;
      return;
    }
    setInspectionTab("questions");
  }

  function updateElpGateAfterResult(id, evaluation, response, variant) {
    const gate = state.elpGate;
    if (!elpSession || gate?.status !== "pending" || !artifactMatchesCurrentContext(gate) || !gate.sessionIds?.includes(id)) return;
    gate.results ||= {};
    gate.resultTimes ||= {};
    if (gate.results[id]) return;
    gate.results[id] = {
      pass: Boolean(evaluation?.pass),
      evaluator: evaluation?.evaluator || "productive-rubric",
      feedback: String(evaluation?.feedback || ""),
      responseHash: responseHash(response),
      variant: String(variant || `elp-step-one-${id}`),
      typed: true,
      preReveal: true,
      blind: true,
      productive: true,
      stimulusExposed: true,
    };
    gate.resultTimes[id] = new Date().toISOString();
    const finished = gate.sessionIds.every(questionId => gate.results[questionId]);
    if (!finished) {
      if (!saveState().ok) {
        questionEvaluations.delete(id);
        elpResponseLocks.delete(id);
        elpSession = state.elpGate?.status === "pending" && artifactMatchesCurrentContext(state.elpGate);
        renderQuestion();
        $("#question-evaluation-feedback").textContent = "Ответ проверен, но не сохранен. Поле снова доступно, повторите попытку.";
        $("#elp-response").focus();
        return false;
      }
      const nextUnanswered = gate.sessionIds.findIndex(questionId => !gate.results[questionId]);
      questionIndex = Math.max(0, nextUnanswered);
      renderQuestion();
      return true;
    }
    gate.status = Eval.deriveGateStatus(gate.results, gate.sessionIds);
    const passed = gate.status === "passed";
    gate.completedAt = new Date().toISOString();
    if (!passed) {
      for (const questionId of gate.sessionIds.filter(questionId => gate.results[questionId]?.pass !== true)) {
        const question = questionById(questionId);
        addErrorItem("question", questionId, question?.prompt || questionId, gate.results[questionId]?.feedback || "Повторите этап 1 без подсказки", "elp-step-one-semantic", "elp-meaning");
      }
    }
    elpSession = false;
    if (!saveState().ok) {
      questionEvaluations.delete(id);
      elpResponseLocks.delete(id);
      elpSession = state.elpGate?.status === "pending" && artifactMatchesCurrentContext(state.elpGate);
      setInspectionTab("questions");
      renderQuestion();
      $("#question-evaluation-feedback").textContent = "Ответ проверен, но не сохранен. Поле снова доступно, этап не продвинут.";
      $("#elp-response").focus();
      return false;
    }
    updateElpGateUi();
    setInspectionTab("elp");
    toast(passed ? "Учебный этап 1 пройден. Этап 2 открыт" : "Этап 1 пока не пройден. Этап 2 остается закрытым");
    return true;
  }

  function updateElpGateUi() {
    const button = $("#elp-step-two");
    const status = $("#elp-gate-status");
    if (!button || !status) return;
    const gate = state.elpGate;
    const currentContext = artifactMatchesCurrentContext(gate);
    const passed = currentContext && gate?.status === "passed";
    button.disabled = !passed;
    const readinessCount = elpStepTwoReadinessItems().length;
    const stepTwoRouteCount = Number(DATA.elpStepTwoCompletionBlueprint?.requiredScoredAttempts || 12);
    button.textContent = passed ? `Начать этап 2, ${stepTwoRouteCount} из ${readinessCount}` : "Этап 2 заблокирован";
    if (currentContext && gate?.status === "pending") {
      const answered = gate.sessionIds.filter(id => gate.results?.[id]).length;
      status.textContent = `Этап 1: ${answered} из ${gate.sessionIds.length}. Нужны семь самостоятельных ответов без перевода.`;
    } else if (currentContext && gate?.status === "failed") {
      status.textContent = "Этап 1 пока не пройден. По политике FMCSA к этапу 2 не переходят. Повторите трудные ответы и начните этап 1 заново.";
    } else if (passed) {
      status.textContent = `Учебный этап 1 пройден. Этап 2 выберет ${stepTwoRouteCount} заданий из ${readinessCount} карточек с английским текстом. Все 49 SVG FHWA и 16 учебных DMS остаются в справочнике.`;
    } else {
      status.textContent = "Сначала завершите фиксированный учебный этап 1 без перевода. Это внутренний критерий готовности, не юридическая оценка.";
    }
    $("#elp-step-one").textContent = gate ? "Повторить этап 1 ELP" : "Начать этап 1 ELP";
    const stepTwoStatus = $("#elp-step-two-status");
    const stepTwo = state.elpStepTwo;
    if (stepTwoStatus && stepTwo?.sessionIds?.length) {
      const answered = stepTwo.sessionIds.filter(id => stepTwo.results?.[id]).length;
      const passedCount = stepTwo.sessionIds.filter(id => stepTwo.results?.[id]?.pass).length;
      stepTwoStatus.textContent = stepTwo.status === "passed"
        ? `Этап 2 пройден по ${stepTwo.sessionIds.length} текстовым стимулам. Символьные знаки не входили в зачет.`
        : `Этап 2: ${answered} из ${stepTwo.sessionIds.length} текстовых стимулов проверено, ${passedCount} успешно.`;
    }
  }

  function setInspectionTab(tab) {
    inspectionTab = ["levels", "questions", "elp"].includes(tab) ? tab : "levels";
    $$('[data-inspection-tab]').forEach(node => {
      const active = node.dataset.inspectionTab === inspectionTab;
      node.classList.toggle("active", active);
      node.setAttribute("aria-selected", String(active));
      node.tabIndex = active ? 0 : -1;
    });
    $("#inspection-levels-panel").hidden = inspectionTab !== "levels";
    $("#inspection-questions-panel").hidden = inspectionTab !== "questions";
    $("#inspection-elp-panel").hidden = inspectionTab !== "elp";
    if (inspectionTab === "questions") renderQuestion();
    updateElpGateUi();
  }

  function populateQuestionCategories() {
    const categories = [...new Set(assessmentQuestions.map(item => item.category))];
    const select = $("#question-category");
    if (!select.options.length) {
      select.innerHTML = `<option value="all">Все категории</option>` + categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(QUESTION_CATEGORY_LABELS[category] || category)}</option>`).join("");
    }
  }

  function filteredQuestions() {
    if (elpSession && state.elpGate?.status === "pending" && artifactMatchesCurrentContext(state.elpGate)) {
      return state.elpGate.sessionIds.map(questionById).filter(Boolean);
    }
    if (focusedQuestionIds?.length) return focusedQuestionIds.map(questionById).filter(item => item && applies(item));
    const category = $("#question-category").value || "all";
    return assessmentQuestions.filter(item => applies(item) && (category === "all" || item.category === category)).map(materializeForCurrentProfile);
  }

  function visibleQuestionStimulus(item) {
    const stimulus = item?.visibleStimulus;
    if (!stimulus || typeof stimulus !== "object" || Array.isArray(stimulus)) return "";
    const labels = {
      individualVehicleWeightLb: "Вес одной машины, lb",
      cargoType: "Тип груза",
      tripStartOdometerMiles: "Одометр в начале рейса",
      currentOdometerMiles: "Текущий одометр",
      lastInspectionTime: "Время последней проверки",
      lastInspectionOdometerMiles: "Одометр при последней проверке",
      nextDutyStatusChangeTime: "Следующая смена рабочего статуса",
      threeHourDeadlineTime: "Срок через 3 часа",
      projected150MileTime: "Когда будет пройдено 150 миль",
      projected150MileOdometer: "Одометр через 150 миль",
      exceptionApplies: "Исключение применяется",
      cmvSealed: "Машина опломбирована",
      driverOrderedNotToOpen: "Водителю запрещено открывать",
      cargoInspectionImpracticable: "Осмотр груза практически невозможен",
    };
    const rows = Object.entries(stimulus)
      .filter(([key]) => key !== "trainingSample")
      .map(([key, value]) => {
        const shown = typeof value === "boolean" ? (value ? "Да" : "Нет") : String(value);
        return `<span><strong>${escapeHtml(labels[key] || key)}:</strong> ${escapeHtml(shown)}</span>`;
      });
    if (!rows.length) return "";
    return `<strong>TRAINING SAMPLE, NOT VALID</strong><div>${rows.join("")}</div>`;
  }

  function questionPracticeVariantIds(item) {
    if (!item?.practiceVariants || typeof item.practiceVariants !== "object") return [];
    const configured = Array.isArray(item.practiceContract?.variantIds) ? item.practiceContract.variantIds : Object.keys(item.practiceVariants);
    return configured.filter(id => item.practiceVariants[id] && typeof item.practiceVariants[id] === "object");
  }

  function materializeQuestionPractice(item, mode = questionVariant) {
    const variantId = String(mode || "").replace(/^regulatory-/, "");
    const variant = item?.practiceVariants?.[variantId];
    if (!variant || typeof variant !== "object") return item;
    const { id: ignoredId, ...fields } = variant;
    return { ...item, ...fields, id: item.id, practiceVariantId: variantId };
  }

  function questionRevealDescriptor(item, practiceMode) {
    const mode = String(practiceMode || "direct-response");
    const instanceKey = item?.semanticFingerprint || item?.practiceVariantId || contextualAttemptVariant(item, mode);
    return {
      id: item.id,
      practiceMode: mode,
      instance: {
        id: `${item.id}:${instanceKey}`,
        practiceVariantId: item.practiceVariantId || "",
        prompt: item.promptDisplay || item.materializedPrompt || item.prompt || "",
        answer: item.answerDisplay || item.materializedAnswer || item.answer || "",
        visibleStimulus: item.visibleStimulus || null,
      },
    };
  }

  function applyQuestionRevealInstance(item, lock) {
    if (!lock?.instance) return item;
    return {
      ...item,
      prompt: lock.instance.prompt,
      promptDisplay: lock.instance.prompt,
      materializedPrompt: lock.instance.prompt,
      answer: lock.instance.answer,
      answerDisplay: lock.instance.answer,
      materializedAnswer: lock.instance.answer,
      visibleStimulus: lock.instance.visibleStimulus,
      practiceVariantId: lock.instance.practiceVariantId || item.practiceVariantId,
    };
  }

  function renderQuestion() {
    const questions = filteredQuestions();
    if (!questions.length) return;
    questionIndex %= questions.length;
    const sourceItem = questions[questionIndex];
    const gateQuestion = elpSession && state.elpGate?.status === "pending" && artifactMatchesCurrentContext(state.elpGate) && state.elpGate.sessionIds?.includes(sourceItem.id);
    const persistedGateResult = gateQuestion ? state.elpGate.results?.[sourceItem.id] : null;
    const hasLocalPromptAudio = Boolean(listeningProfileRow(sourceItem)?.prompt);
    const practiceModes = questionPracticeVariantIds(sourceItem).map(id => `regulatory-${id}`);
    const previousEvaluation = questionEvaluations.get(sourceItem.id);
    const revealedAttempt = questionRevealLocks.get(sourceItem.id);
    const responseLocked = Boolean(persistedGateResult) || elpResponseLocks.has(sourceItem.id) || Boolean(previousEvaluation) || Boolean(revealedAttempt);
    const lockedPracticeMode = previousEvaluation?.practiceMode || revealedAttempt?.practiceMode || null;
    questionVariant = lockedPracticeMode || (gateQuestion
      ? `elp-step-one-${questionIndex + 1}`
      : activeDailyTaskKey === "diagnostic"
        ? "direct-response"
        : chooseContextualMode("questions", sourceItem, practiceModes.length
          ? practiceModes
          : hasLocalPromptAudio ? ["direct-response", "listening-response"] : ["direct-response"]));
    const item = applyQuestionRevealInstance(materializeQuestionPractice(sourceItem, questionVariant), revealedAttempt);
    const stimulus = visibleQuestionStimulus(item);
    $("#question-visible-stimulus").innerHTML = stimulus;
    $("#question-visible-stimulus").hidden = !stimulus;
    $("#question-number").textContent = `Задание ${questionIndex + 1} из ${questions.length}`;
    $("#question-category-label").textContent = QUESTION_CATEGORY_LABELS[item.category] || item.category;
    $("#question-answer").textContent = "";
    $("#official-answer").hidden = !responseLocked;
    if (gateQuestion || (questionVariant === "direct-response" && activeDailyTaskKey !== "listening")) listeningTarget = "prompt";
    syncListeningButtons(item);
    $("#question-audio").disabled = !hasLocalPromptAudio;
    $("#question-audio").title = hasLocalPromptAudio ? "Прослушать аудио" : "Для этого задания доступно только чтение";
    const responseCapture = $("#elp-response-capture");
    const responseInput = $("#elp-response");
    if (responseLocked) $("#question-answer").textContent = item.answerDisplay || item.materializedAnswer || item.answer;
    const blindListening = !responseLocked && (questionVariant === "listening-response" || activeDailyTaskKey === "listening" || listeningTarget === "answer");
    $("#question-prompt").textContent = blindListening
      ? "Текст скрыт. Прослушайте аудио и ответьте по смыслу."
      : item.promptDisplay || item.materializedPrompt || item.prompt;
    responseCapture.hidden = false;
    responseInput.value = elpResponseDrafts.get(item.id) || "";
    responseInput.disabled = responseLocked;
    $("#check-question-response").disabled = responseLocked;
    $("#elp-no-answer").hidden = responseLocked;
    $("#reveal-question").hidden = responseLocked;
    $("#reveal-question").textContent = "Показать ответ";
    $("#reveal-question").disabled = responseLocked;
    $("#random-question").disabled = gateQuestion;
    $("#next-question").disabled = gateQuestion;
    const categoryLabel = QUESTION_CATEGORY_LABELS[item.category] || item.category;
    const modeLabel = questionVariant === "listening-response" ? "ответ после звука" : "письменный ответ";
    $("#question-category-label").textContent = gateQuestion ? `${categoryLabel} · этап 1, только английский` : `${categoryLabel} · ${modeLabel}`;
    $("#question-evaluation-feedback").textContent = persistedGateResult?.feedback || previousEvaluation?.feedback || (revealedAttempt
      ? "Модель открыта без зачета. Начните новую самостоятельную попытку кнопкой «Следующее»."
      : questionVariant === "listening-response" ? "Сначала прослушайте задание, затем ответьте по смыслу." : "Ответ проверяется по локальным смысловым требованиям до показа модели.");
    renderQuestionAttemptStatus(item);
  }

  function listeningProfileRow(item) {
    return LISTENING_DATA.profiles?.[item.id] || LISTENING_DATA.profiles?.[item.audioSourceId] || null;
  }

  function listeningStimulus(item) {
    const row = listeningProfileRow(item);
    if (!row) return null;
    const stimulus = listeningTarget === "answer" && row.driverAnswer ? row.driverAnswer : row.prompt || row;
    const expectedText = listeningTarget === "answer"
      ? item.answerSpoken || item.answerDisplay || item.materializedAnswer || item.answer
      : item.promptSpoken || item.promptDisplay || item.materializedPrompt || item.prompt;
    if (Eval.normalizeText(stimulus?.spokenText) !== Eval.normalizeText(expectedText)) return null;
    if (listeningTarget === "answer" && Array.isArray(item.slots || item.answerSlots)) {
      return { ...stimulus, semanticExpectedSlots: item.answerSlots || item.slots };
    }
    return stimulus;
  }

  function syncListeningButtons(item) {
    const row = listeningProfileRow(item);
    if (activeDailyTaskKey === "diagnostic") listeningTarget = "prompt";
    if (listeningTarget === "answer" && !row?.driverAnswer) listeningTarget = "prompt";
    $$("[data-listening-target]").forEach(button => {
      const available = button.dataset.listeningTarget === "prompt"
        || activeDailyTaskKey !== "diagnostic" && Boolean(row?.driverAnswer);
      button.hidden = !available;
      button.classList.toggle("active", available && button.dataset.listeningTarget === listeningTarget);
    });
    $$("[data-listening-profile]").forEach(button => {
      const profile = button.dataset.listeningProfile;
      const stimulus = listeningStimulus(item);
      const available = profile === "pause" ? Boolean(stimulus?.roadside) : Boolean(stimulus?.[profile]);
      button.disabled = !available;
      button.title = available ? "Прослушать аудио" : "Этот вариант недоступен для текущего задания";
      button.classList.toggle("active", available && profile === listeningProfile);
    });
    const stimulus = listeningStimulus(item);
    if (!stimulus?.[listeningProfile === "pause" ? "roadside" : listeningProfile]) {
      listeningProfile = stimulus?.roadside ? "roadside" : stimulus?.clean ? "clean" : stimulus?.phone ? "phone" : "roadside";
      $$("[data-listening-profile]").forEach(button => button.classList.toggle("active", button.dataset.listeningProfile === listeningProfile));
    }
  }

  function listeningQueue(item, profileName) {
    const row = listeningStimulus(item);
    const requested = profileName === "pause" ? "roadside" : profileName;
    const path = row?.[requested];
    if (!path) return [];
    const text = row?.spokenText || (listeningTarget === "answer" ? item.answerSpoken || item.answerDisplay || item.answer : item.promptSpoken || item.materializedPrompt || item.promptDisplay || item.prompt);
    const clip = { path, text, role: row?.role || (listeningTarget === "answer" ? "driver" : "inspector"), profile: requested };
    return profileName === "pause" ? [clip, clip] : [clip];
  }

  function renderQuestionAttemptStatus(item) {
    const node = $("#question-attempt-status");
    const record = state.questionAttempts?.[item.id];
    if (isDone("questions", item.id)) {
      node.textContent = "Письменный рабочий ответ подтвержден двумя самостоятельными попытками с интервалом не менее 24 часов.";
      return;
    }
    if (state.questions?.[item.id]) {
      node.textContent = masteryLabel("questions", item.id);
      return;
    }
    if (!record) {
      node.textContent = "Просмотр ответа сам по себе не меняет прогресс.";
      return;
    }
    const labels = { prompted: "Последняя попытка была с подсказкой.", failed: "Последняя попытка пока не получилась." };
    node.textContent = labels[record.lastResult] || "Попытка сохранена.";
  }

  function validElpResponse(value) {
    return !Eval.isDegenerateResponse(value, "", 2).invalid;
  }

  function questionDailyTaskType(gateQuestion, item) {
    if (activeDailyTaskKey === "errors") return "errors";
    if (gateQuestion || activeDailyTaskKey === "elp") return "elp";
    if (["questions", "due-questions", "diagnostic"].includes(activeDailyTaskKey)) return "questions";
    if (activeDailyTaskKey === "listening" || questionStimulusWasHeard(item.id) && questionVariant === "listening-response") return "listening";
    return "questions";
  }

  function checkQuestionResponse(options = {}) {
    const questions = filteredQuestions();
    const sourceItem = questions[questionIndex % questions.length];
    if (!sourceItem) return;
    const item = materializeQuestionPractice(sourceItem, questionVariant);
    if (questionRevealLocks.has(item.id)) {
      renderQuestion();
      toast("Ответ уже открыт. Начните новую самостоятельную попытку кнопкой «Следующее»");
      return;
    }
    const gateQuestion = elpSession && state.elpGate?.status === "pending" && artifactMatchesCurrentContext(state.elpGate) && state.elpGate.sessionIds?.includes(item.id);
    if (gateQuestion && state.elpGate.results?.[item.id]) {
      toast("Этот ответ уже зафиксирован в текущей попытке ELP");
      const nextUnanswered = state.elpGate.sessionIds.findIndex(id => !state.elpGate.results?.[id]);
      if (nextUnanswered >= 0) {
        questionIndex = nextUnanswered;
        renderQuestion();
      }
      return;
    }
    const response = options.noAnswer ? "" : $("#elp-response").value.trim();
    const listeningRequired = questionVariant === "listening-response" || activeDailyTaskKey === "listening" || listeningTarget === "answer";
    const attemptVariant = contextualAttemptVariant(item, item.practiceVariantId
      ? `regulatory-${item.practiceVariantId}`
      : Eval.questionAttemptVariant({
          baseVariant: questionVariant,
          gateQuestion,
          listeningTarget,
          listeningRequired,
        }));
    const exposureKey = questionStimulusKey(item.id, listeningTarget);
    let evaluation;
    if (listeningRequired && !questionStimulusWasHeard(item.id)) {
      evaluation = { pass: false, score: 0, evaluator: "semantic-slots", feedback: "Сначала полностью прослушайте аудио.", missing: ["stimulus-exposure"] };
    } else if (options.noAnswer) {
      evaluation = { pass: false, score: 0, evaluator: "productive-rubric", feedback: "Ответ не дан. Модель можно изучить, но учебный результат не подтвержден.", missing: ["meaningful-response"] };
    } else {
      const stimulus = listeningStimulus(item);
      evaluation = listeningRequired && listeningTarget === "answer" && stimulus?.semanticExpectedSlots
        ? Eval.evaluateSemanticResponse({ response, prompt: item.promptDisplay || item.prompt, expected: stimulus.spokenText, slots: stimulus.semanticExpectedSlots, rubric: { minTokens: 2, requiredRatio: 0.5 } })
        : Eval.evaluateQuestion(item, response, { elpStepOne: gateQuestion });
      if (!evaluation.pass && listeningTarget === "answer" && stimulus?.feedbackRu) evaluation.feedback = `${stimulus.feedbackRu} ${evaluation.feedback}`;
    }
    if (listeningRequired) {
      stopPlayback();
      heardQuestionStimuli.delete(exposureKey);
    }
    const record = recordLearningAttempt("questions", item.id, evaluation, "question-typed-pre-reveal", attemptVariant, questionDailyTaskType(gateQuestion, item), {
      response,
      productive: !(listeningRequired && listeningTarget === "answer"),
      deferSave: true,
    });
    if (!record) return;
    elpResponseDrafts.set(item.id, response);
    elpResponseLocks.set(item.id, true);
    questionEvaluations.set(item.id, { ...evaluation, practiceMode: questionVariant });
    if (!evaluation.pass) addErrorItem("question", item.id, item.promptDisplay || item.prompt, evaluation.feedback, "question-semantic-retrieval", evaluation.missing?.[0] || "meaning");
    if (!gateQuestion && !saveState().ok) {
      questionEvaluations.delete(item.id);
      elpResponseLocks.delete(item.id);
      renderQuestion();
      $("#question-evaluation-feedback").textContent = "Ответ проверен, но не сохранен. Поле снова доступно.";
      return;
    }
    $("#question-answer").textContent = item.answerDisplay || item.materializedAnswer || item.answer;
    $("#official-answer").hidden = false;
    $("#question-prompt").textContent = item.promptDisplay || item.materializedPrompt || item.prompt;
    $("#reveal-question").hidden = true;
    $("#elp-response").disabled = true;
    $("#check-question-response").disabled = true;
    $("#elp-no-answer").hidden = true;
    $("#question-evaluation-feedback").textContent = evaluation.feedback;
    renderQuestionAttemptStatus(item);
    if (gateQuestion) updateElpGateAfterResult(item.id, evaluation, response, attemptVariant);
    else requestAnimationFrame(() => $("#next-question")?.focus());
  }

  function revealQuestion() {
    const questions = filteredQuestions();
    const sourceItem = questions[questionIndex % questions.length];
    if (!sourceItem) return;
    const item = materializeQuestionPractice(sourceItem, questionVariant);
    const gateQuestion = elpSession && state.elpGate?.status === "pending" && artifactMatchesCurrentContext(state.elpGate) && state.elpGate.sessionIds?.includes(item.id);
    if (questionRevealLocks.has(item.id) || questionEvaluations.has(item.id) || elpResponseLocks.has(item.id) || gateQuestion && state.elpGate.results?.[item.id]) {
      renderQuestion();
      return;
    }
    if (!recordViewed("questions", item.id, "question-reveal", questionVariant, { deferSave: true })) return;
    clearQuestionStimulusExposure(item.id);
    addErrorItem("question", item.id, item.promptDisplay || item.prompt, "Учебная модель открыта до объективной проверки.", "question-semantic-retrieval", "premature-reveal");
    questionRevealLocks.remember(questionRevealDescriptor(item, questionVariant));
    if (gateQuestion) {
      const evaluation = { pass: false, evaluator: "productive-rubric", feedback: "Модель открыта до письменного ответа.", missing: ["pre-reveal-response"] };
      if (!updateElpGateAfterResult(item.id, evaluation, "", questionVariant)) {
        questionRevealLocks.delete(item.id);
        renderQuestion();
        $("#question-evaluation-feedback").textContent = "Модель не открыта, потому что результат не сохранился. Поле снова доступно.";
        $("#elp-response")?.focus();
      }
      return;
    }
    if (!saveState().ok) {
      questionRevealLocks.delete(item.id);
      renderQuestion();
      $("#question-evaluation-feedback").textContent = "Модель не открыта, потому что результат не сохранился. Поле снова доступно.";
      $("#elp-response")?.focus();
      return;
    }
    renderQuestion();
    requestAnimationFrame(() => $("#next-question")?.focus());
  }

  function situationRequirementLabel(value) {
    return SITUATION_REQUIREMENT_LABELS[value] || String(value).replaceAll("-", " ");
  }

  function situationInventoryEntries() {
    const context = applicabilityContext();
    return DATA.situations.map((source, index) => {
      const applicability = Core.evaluateApplicability(source, context);
      const item = materializeForCurrentProfile(source);
      const reasons = [];
      if (!applicability.profileMatch) {
        const profiles = applicability.requiredProfiles.map(situationRequirementLabel).join(", ");
        reasons.push(`нужен профиль: ${profiles}`);
      }
      const requirements = [...applicability.missingEquipment, ...applicability.missingConditions].map(situationRequirementLabel);
      if (requirements.length) reasons.push(`включите: ${requirements.join(", ")}`);
      if (applicability.unknownMetadata.length || Array.isArray(item?.materializationConflict)) reasons.push("метаданные сцены требуют проверки");
      if (!reasons.length && situationMode === "elp" && item.audioProfile !== "roadside") reasons.push("режим ELP показывает только roadside-сцены");
      if (!reasons.length && situationRequiresExposure() && eligibleSituationVariants(item).length === 0) reasons.push("для этого режима нет полного локального аудио");
      return { item, index, available: reasons.length === 0, reason: reasons.join("; ") };
    });
  }

  function visibleSituationEntries() {
    return situationInventoryEntries().filter(entry => entry.available);
  }

  function activeSituationContextLabel() {
    const selected = [
      ...EQUIPMENT_CONTROLS.map(([key, label]) => ["equipment", key, label]),
      ...CONDITION_CONTROLS.map(([key, label]) => ["conditions", key, label]),
    ].filter(([group, key]) => state.applicability?.[group]?.[key] === true).map(([, , label]) => label);
    return selected.length ? selected.join(", ") : "базовые условия";
  }

  function renderSituationInventorySummary(availableCount) {
    const modeLabel = {
      read: "Читать",
      say: "Скажи сам",
      listen: "На слух",
      phone: "Телефон",
      elp: "ELP",
    }[situationMode];
    $("#situation-availability").textContent = `Доступно ${availableCount} из ${DATA.situations.length}`;
    $("#situation-filter-context").textContent = `Режим: ${modeLabel}. Профиль: ${PROFILE_SHORT_LABELS[state.profile] || PROFILE_SHORT_LABELS.both}. Условия: ${activeSituationContextLabel()}.`;
  }

  function syncActiveSituationCard(restoreFocus = false) {
    requestAnimationFrame(() => {
      const list = $("#situation-list");
      const active = list?.querySelector("button.active[data-situation-index]");
      if (!list || !active) return;
      const horizontal = list.scrollWidth > list.clientWidth && getComputedStyle(list).display === "flex";
      if (horizontal) {
        const target = Math.max(0, Math.min(active.offsetLeft - 12, list.scrollWidth - list.clientWidth));
        list.scrollTo({ left: target, behavior: "auto" });
      } else {
        const top = active.offsetTop;
        const bottom = top + active.offsetHeight;
        if (top < list.scrollTop) list.scrollTop = top;
        else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
      }
      if (restoreFocus) active.focus({ preventScroll: true });
    });
  }

  function situationByIndex(index = situationIndex) {
    const item = DATA.situations[index];
    return item ? materializeForCurrentProfile(item) : null;
  }

  function situationPracticeFor(item, variant) {
    const contract = item?.practiceContract || {};
    const requestedId = variant === "transfer" || variant === "transfer-turn" ? "transfer" : "primary";
    const selected = (contract.variants || []).find(entry => entry.id === requestedId)
      || (contract.variants || [])[requestedId === "transfer" ? 1 : 0]
      || null;
    const dialogue = Array.isArray(selected?.dialogue) && selected.dialogue.length ? selected.dialogue : item?.dialogue || [];
    const driverLines = dialogue.filter(line => String(line.speaker).toLowerCase().includes("driver"));
    const legacyPrimary = item?.expectedDriverTurn || driverLines[0]?.english || item?.practice || "";
    const legacyTransfer = typeof item?.transferVariant === "string"
      ? item.transferVariant
      : item?.transferVariant?.expectedDriverTurn || item?.transferVariant?.driverTurn || driverLines[1]?.english || legacyPrimary;
    const semantic = contract.typedDriverTurn?.semanticRubric || {};
    const expected = selected?.modelAnswer || (requestedId === "transfer" ? legacyTransfer : legacyPrimary);
    const prompt = selected?.prompt || item?.informationGap || item?.goal || "";
    const slots = Array.isArray(selected?.slotValues) ? selected.slotValues : [];
    const criticalTurns = Array.isArray(contract.criticalTurns) && contract.criticalTurns.length
      ? contract.criticalTurns.filter(turn => turn?.required !== false)
      : [{ id: "turn-1", prompt, modelAnswer: expected, semanticRubric: semantic, required: true, typedOutcomeRequired: true, preRevealRequired: true }];
    const selectedTurns = new Map((Array.isArray(selected?.criticalTurns) ? selected.criticalTurns : []).map(turn => [turn.id, turn]));
    const turns = criticalTurns.map((baseTurn, index) => {
      const declaredVariantTurn = baseTurn?.variantTurns?.[requestedId] || {};
      const selectedTurn = selectedTurns.get(baseTurn.id) || {};
      const turn = {
        ...baseTurn,
        ...declaredVariantTurn,
        ...selectedTurn,
        semanticRubric: {
          ...(baseTurn.semanticRubric || {}),
          ...(declaredVariantTurn.semanticRubric || {}),
          ...(selectedTurn.semanticRubric || {}),
        },
      };
      const driverLine = driverLines[index] || driverLines[driverLines.length - 1];
      const dialogueIndex = driverLine ? dialogue.indexOf(driverLine) : -1;
      const preceding = dialogueIndex > 0
        ? [...dialogue.slice(0, dialogueIndex)].reverse().find(line => !String(line.speaker).toLowerCase().includes("driver"))
        : null;
      const relevantSlots = Core.slotsForTurn ? Core.slotsForTurn(slots, {
        id: turn.id || `turn-${index + 1}`,
        prompt: preceding?.english || turn.prompt || selected?.prompt || prompt,
        expected: driverLine?.english || turn.modelAnswer || selected?.modelAnswer || expected,
        promptRole: turn.promptRole || preceding?.semanticRole || preceding?.speaker || "inspector",
        promptAudio: turn.promptAudio || null,
      }) : slots;
      const assertionGroups = (turn.requiredAssertions || []).map(assertion => String(assertion).split(/\s*\|\s*/).filter(Boolean));
      const turnRubric = turn.semanticRubric || {};
      const declaredGroups = turnRubric.requiredConceptGroups || assertionGroups;
      const slotAwareGroups = Core.scopedTurnRequiredGroups
        ? Core.scopedTurnRequiredGroups(declaredGroups, contract.variants, turn.id || `turn-${index + 1}`, relevantSlots)
        : declaredGroups;
      return {
        id: turn.id || `turn-${index + 1}`,
        prompt: preceding?.english || turn.prompt || selected?.prompt || prompt,
        promptRole: turn.promptRole || preceding?.semanticRole || preceding?.speaker || "inspector",
        promptAudio: turn.promptAudio || null,
        expected: driverLine?.english || turn.modelAnswer || selected?.modelAnswer || expected,
        required: turn.required !== false,
        typedOutcomeRequired: turn.typedOutcomeRequired !== false,
        preRevealRequired: turn.preRevealRequired !== false,
        slots: relevantSlots,
        rubric: {
          minTokens: Number(turnRubric.minimumEnglishWords || turnRubric.minTokens || semantic.minimumEnglishWords || 3),
          requiredGroups: slotAwareGroups.length ? slotAwareGroups : undefined,
          forbiddenGroups: turnRubric.forbiddenConceptGroups,
          requiredRatio: 1,
          rejectPromptEcho: turnRubric.rejectPromptEcho !== false,
          rejectAffirmationOnly: turnRubric.rejectAffirmationOnly !== false,
          rejectContradiction: turnRubric.rejectContradiction !== false,
          rejectRefusal: turnRubric.rejectRefusal !== false,
          branchConflictPolicy: turnRubric.branchConflictPolicy,
        },
      };
    });
    const slotText = slots.map(slot => `${slot.name || slot.type}: ${slot.display || slot.spoken}`).join("; ");
    const instruction = contract.informationGap?.instructionRu || item?.informationGap || "Дайте рабочую реплику водителя до раскрытия модели.";
    const choiceCheck = contract.choiceCheck || null;
    const outcomeContract = contract.workplaceOutcome || {};
    const outcomeVariant = outcomeContract.expectedByVariant?.[requestedId] || {};
    const outcomeSemantic = { ...(outcomeContract.semanticRubric || {}), ...(outcomeVariant.responseRubric || outcomeVariant.semanticRubric || {}) };
    const outcomeExpected = outcomeVariant.modelAnswer || outcomeVariant.expected || outcomeContract.modelAnswer || outcomeContract.expected || "";
    const outcomeSlots = outcomeVariant.slotValues || outcomeVariant.typedSlots || outcomeContract.slotValues || outcomeContract.typedSlots || [];
    const workplaceOutcome = outcomeContract.required === false ? null : {
      ...outcomeContract,
      ...outcomeVariant,
      expected: outcomeExpected,
      promptEn: outcomeVariant.promptEn || outcomeContract.promptEn || "Confirm the completed safe workplace result.",
      promptRu: outcomeVariant.promptRu || outcomeContract.promptRu || outcomeContract.descriptionRu || "Подтвердите безопасный рабочий результат.",
      slots: outcomeSlots,
      rubric: {
        ...outcomeSemantic,
        minTokens: Number(outcomeSemantic.minimumEnglishWords || outcomeSemantic.minTokens || 3),
        requiredGroups: outcomeSemantic.requiredConceptGroups || outcomeSemantic.requiredGroups,
        forbiddenGroups: outcomeSemantic.forbiddenConceptGroups || outcomeSemantic.forbiddenGroups,
        requiredRatio: Number.isFinite(Number(outcomeSemantic.requiredRatio)) ? Number(outcomeSemantic.requiredRatio) : 1,
        rejectContradiction: outcomeSemantic.rejectContradiction !== false,
        rejectRefusal: outcomeSemantic.rejectRefusal !== false,
        rejectExactCriticalTurnReplay: outcomeSemantic.rejectExactCriticalTurnReplay === true,
      },
    };
    return {
      id: selected?.id || requestedId,
      expected,
      prompt,
      slots,
      dialogue,
      turns,
      choiceCheck,
      safetyDecision: contract.safetyDecision || null,
      completionBlueprint: contract.completionBlueprint || null,
      workplaceOutcome,
      instruction,
      rubric: {
        minTokens: Number(semantic.minimumEnglishWords || 3),
        requiredGroups: Array.isArray(semantic.requiredConceptGroups) ? semantic.requiredConceptGroups : undefined,
        requiredRatio: 1,
      },
      informationGap: [instruction, `Задание: ${prompt}`, slotText ? `Значение варианта: ${slotText}.` : ""].filter(Boolean).join(" "),
      success: contract.observableSuccessConditionRu || "Рабочий ответ передает требуемое действие и значение текущего варианта.",
      failure: contract.failureBranch?.feedbackRu || "Ответ не передает обязательный рабочий факт или действие.",
      drill: contract.failureBranch?.drill || "situation-driver-turn",
    };
  }

  function situationChoiceRows(item, practice) {
    const options = Array.isArray(practice.choiceCheck?.options) ? practice.choiceCheck.options : [];
    if (!options.length) return [];
    const order = Eval.deterministicOptionOrder(options.map(option => option.text), `${todayKey()}-${state.dailyRefresh}-${item.id}-${practice.id}`);
    return order.map(row => ({ ...options[row.originalIndex], originalIndex: row.originalIndex }));
  }

  function initializeSituationTask(item, practice) {
    const choices = situationChoiceRows(item, practice);
    const task = {
      itemId: item.id,
      mode: situationMode,
      variant: practice.id,
      turnIndex: 0,
      responses: [],
      evaluations: [],
      choiceId: choices.length ? null : "not-required",
      choiceSafe: choices.length ? null : true,
      stage: choices.length ? "safety-choice" : "critical-turn",
      finished: false,
    };
    situationTask = task;
    return task;
  }

  function activeSituationTask(item, practice) {
    if (!situationTask
      || situationTask.itemId !== item.id
      || situationTask.mode !== situationMode
      || situationTask.variant !== practice.id) return initializeSituationTask(item, practice);
    return situationTask;
  }

  function situationOptionIsSafe(practice, option) {
    if (!option) return false;
    return option.safe === true
      || option.id === practice.choiceCheck?.correctOptionId
      || option.result === "success"
      || option.result === "safe";
  }

  function finalSituationEvaluation(item, practice, evaluation, response = "") {
    const record = recordLearningAttempt(
      "situations",
      item.id,
      evaluation,
      "situation-multi-turn-typed",
      contextualAttemptVariant(item, practice.id),
      null,
      { response: [...(situationTask?.responses || []), response].filter(Boolean).join("\n"), deferSave: true },
    );
    if (!record) return false;
    situationTask.finished = true;
    situationEvaluation = {
      id: item.id,
      mode: situationMode,
      response: [...situationTask.responses, response].filter(Boolean).join("\n"),
      evaluation,
      variant: practice.id,
      practice,
      turns: situationTask.evaluations,
      choiceId: situationTask.choiceId,
    };
    if (!evaluation.pass) addErrorItem("situation", item.id, item.titleRu || item.title, evaluation.feedback, practice.drill, evaluation.missing?.[0] || "workplace-outcome");
    if (!saveState().ok) {
      situationEvaluation = null;
      heardSituationStimuli.delete(situationStimulusKey(item));
      revealedSituationStimuli.delete(situationStimulusKey(item));
      situationTask = initializeSituationTask(item, practice);
      situationTask.feedback = "Ответ проверен, но не сохранен. Начните новую самостоятельную попытку.";
      return false;
    }
    return true;
  }

  function failSituationTask(item, practice, feedback, missing) {
    const evaluation = { pass: false, score: 0, evaluator: "situation-completion-blueprint", feedback, missing: [missing] };
    finalSituationEvaluation(item, practice, evaluation);
    renderSituations();
    requestAnimationFrame(() => $("#situation-evaluation-feedback")?.focus());
  }

  function situationStimulusAudio(item, practice, mode = situationMode) {
    const profile = situationAudioProfile(item, mode);
    const task = activeSituationTask(item, practice);
    const turn = practice.turns[Math.min(task.turnIndex, practice.turns.length - 1)] || practice.turns[0];
    const dialogue = practice.dialogue || item.dialogue;
    const dialogueIndex = dialogue.findIndex(line => line.english === turn?.prompt);
    const line = dialogueIndex >= 0 ? dialogue[dialogueIndex] : dialogue.find(entry => !String(entry.speaker).toLowerCase().includes("driver"));
    const role = voiceId(line, "inspector");
    const prompt = turn?.prompt || practice.prompt;
    const declaredAudio = turn?.promptAudio;
    const declaredPath = declaredAudio?.sources?.[profile];
    if (declaredAudio) {
      const eligible = declaredAudio.eligible === true
        && declaredAudio.qualificationPolicy === "exact-local-file-only"
        && typeof declaredPath === "string"
        && declaredPath.length > 0;
      return {
        available: eligible,
        profile,
        queue: eligible ? [{ path: declaredPath, text: prompt, role: turn.promptRole || role, profile }] : [],
      };
    }
    const stored = dialogueIndex >= 0
      ? sourceAudio("situation", item.id, `dialogue-${dialogueIndex + 1}`).filter(clip => clip.profile === profile && clip.text === prompt)
      : [];
    const path = textAudio(prompt, role, profile);
    return {
      available: Boolean(stored.length || path),
      profile,
      queue: stored.length ? stored : [{ path, text: prompt, role, profile }],
    };
  }

  function renderSituations() {
    const modeDescriptions = {
      read: "<strong>Читать:</strong> прочитайте диалог и сверьте смысл.",
      say: "<strong>Скажи сам:</strong> реплики водителя скрыты. Скажите ответ до раскрытия.",
      listen: "<strong>На слух:</strong> весь текст скрыт. Сначала поймите намерение по аудио.",
      phone: "<strong>Телефон:</strong> текст скрыт, звук передан как по телефонной линии.",
      elp: "<strong>ELP:</strong> только сцены проверки на дороге, без русского перевода. Услышьте вопрос или команду и ответьте по-английски.",
    };
    $("#situation-mode-note").innerHTML = modeDescriptions[situationMode];
    const inventory = situationInventoryEntries();
    const entries = inventory.filter(entry => entry.available);
    const restoreListFocus = document.activeElement?.matches("#situation-list [data-situation-index]") === true;
    renderSituationInventorySummary(entries.length);
    if (!entries.some(entry => entry.index === situationIndex)) situationIndex = entries[0]?.index || 0;
    $("#situation-list").innerHTML = inventory.map(entry => entry.available ? `
      <button class="${entry.index === situationIndex ? "active" : ""}" type="button" data-situation-index="${entry.index}">
        ${String(entry.index + 1).padStart(2, "0")}. ${escapeHtml(entry.item.titleRu || entry.item.title)}
        <small>${isDone("situations", entry.item.id) ? "Пройдено" : `Приоритет ${entry.item.priority}`}</small>
      </button>` : `
      <button class="locked" type="button" aria-disabled="true" data-situation-locked="${entry.index}" data-lock-reason="${escapeHtml(entry.reason)}">
        ${String(entry.index + 1).padStart(2, "0")}. ${escapeHtml(entry.item.titleRu || entry.item.title)}
        <small>Недоступно: ${escapeHtml(entry.reason)}</small>
      </button>`).join("");
    syncActiveSituationCard(restoreListFocus);
    if (!entries.length) {
      $("#situation-priority").textContent = "Недоступно";
      $("#situation-title").textContent = "Для этого режима пока нет доступных сцен";
      $("#situation-goal").textContent = "Причины указаны на карточках. Измените профиль, условия или режим.";
      $("#situation-visual").hidden = true;
      $("#situation-image").removeAttribute("src");
      $("#situation-roles").innerHTML = "";
      $("#situation-challenge").hidden = true;
      $("#situation-dialogue").innerHTML = "";
      $("#situation-complete-status").textContent = "";
      $("#play-situation").disabled = true;
      $("#play-situation").textContent = "Прослушать сцену";
      return;
    }
    $("#play-situation").disabled = false;
    const item = situationByIndex();
    const evaluated = situationEvaluation?.id === item.id && situationEvaluation?.mode === situationMode;
    const selectableVariants = eligibleSituationVariants(item);
    situationVariant = evaluated && situationEvaluation.variant
      ? situationEvaluation.variant
      : chooseContextualMode("situations", item, selectableVariants);
    currentSituationPractice = evaluated && situationEvaluation.practice
      ? situationEvaluation.practice
      : situationPracticeFor(item, situationVariant);
    const task = activeSituationTask(item, currentSituationPractice);
    const criticalTurnNeedsExposure = Core.situationStageRequiresExposure(task.stage, situationMode);
    const localStimulusAvailable = !criticalTurnNeedsExposure || situationStimulusAudio(item, currentSituationPractice).available;
    const revealedAttempt = revealedSituationStimuli.has(situationStimulusKey(item));
    $("#situation-priority").textContent = `Приоритет ${item.priority}`;
    $("#situation-title").textContent = item.titleRu || item.title;
    const visual = visualsByRef.get(item.id);
    const visualWrap = $("#situation-visual");
    const visualNode = $("#situation-image");
    visualWrap.hidden = !visual;
    visualNode.removeAttribute("src");
    visualNode.alt = visual?.alt || "";
    if (visual) visualNode.src = visual.path;
    $("#situation-goal").textContent = item.goal;
    $("#situation-roles").innerHTML = item.roles.map(role => `<span>${escapeHtml(roleLabel(role))}</span>`).join("");
    $("#situation-challenge").hidden = situationMode === "read";
    const informationGap = $("#situation-information-gap");
    const responseInput = $("#situation-response");
    const responseLabel = document.querySelector('label[for="situation-response"]');
    const checkButton = $("#check-situation-response");
    const choices = situationChoiceRows(item, currentSituationPractice);
    const currentTurn = currentSituationPractice.turns[Math.min(task.turnIndex, currentSituationPractice.turns.length - 1)];
    if (task.stage === "safety-choice" && !evaluated) {
      informationGap.innerHTML = `<strong>Шаг безопасности обязателен.</strong><span>Выберите безопасное действие. Ошибочный выбор завершает эту попытку.</span><div class="situation-choice-options">${choices.map(option => `<button class="button secondary" type="button" data-situation-choice="${escapeHtml(option.id)}">${escapeHtml(option.text)}</button>`).join("")}</div>`;
      responseInput.hidden = true;
      responseLabel.hidden = true;
      checkButton.hidden = true;
    } else {
      responseInput.hidden = false;
      responseLabel.hidden = false;
      checkButton.hidden = false;
      if (evaluated) {
        informationGap.textContent = "Попытка завершена. Ниже открыт полный учебный диалог.";
        responseLabel.textContent = "Ответы завершенной попытки";
        responseInput.value = situationEvaluation.response;
      } else if (task.stage === "workplace-outcome") {
        const outcome = currentSituationPractice.workplaceOutcome;
        const description = outcome?.promptRu || outcome?.descriptionRu || "Подтвердите безопасный рабочий результат.";
        informationGap.textContent = `${description} ${outcome?.promptEn ? `Собеседник: ${outcome.promptEn}` : ""}`.trim();
        responseLabel.textContent = "Итоговая рабочая реплика по-английски";
        responseInput.value = "";
        checkButton.textContent = "Проверить итог и завершить";
      } else {
        const listeningInstruction = situationRequiresExposure()
          ? localStimulusAvailable
            ? "Полностью прослушайте аудио до ответа."
            : "Для этого варианта нет аудио. Выберите режим Скажи сам или другой вариант."
          : currentSituationPractice.informationGap;
        const visiblePrompt = Core.situationPromptForMode(currentTurn?.prompt || currentSituationPractice.prompt, { mode: situationMode, evaluated });
        informationGap.textContent = `Критический ход ${task.turnIndex + 1} из ${currentSituationPractice.turns.length}. ${listeningInstruction}${visiblePrompt ? ` Задание: ${visiblePrompt}` : ""}`;
        responseLabel.textContent = `Ответ водителя, ход ${task.turnIndex + 1}`;
        responseInput.value = "";
        checkButton.textContent = task.turnIndex === currentSituationPractice.turns.length - 1 ? "Проверить ход" : "Проверить и перейти дальше";
      }
    }
    responseInput.disabled = evaluated || !localStimulusAvailable || revealedAttempt || task.stage === "safety-choice";
    checkButton.disabled = evaluated || !localStimulusAvailable || revealedAttempt || task.stage === "safety-choice";
    $("#play-situation").disabled = !evaluated && task.stage === "workplace-outcome";
    $("#play-situation").textContent = evaluated || situationMode === "read"
      ? "Прослушать всю сцену"
      : task.stage === "workplace-outcome"
        ? "Аудиоходы завершены"
        : "Прослушать текущую реплику";
    $("#situation-evaluation-feedback").textContent = evaluated
      ? situationEvaluation.evaluation.feedback
      : revealedAttempt
        ? "Ответ уже открыт. Начните новую попытку без подсказки."
        : task.feedback || (localStimulusAvailable ? "" : "Для этого задания нет аудио.");
    const displayedDialogue = currentSituationPractice.dialogue || item.dialogue;
    $("#situation-dialogue").innerHTML = displayedDialogue.map((line, index) => {
      const isDriver = line.speaker.toLowerCase().includes("driver");
      const display = Core.situationDialogueDisplay(line, { mode: situationMode, evaluated });
      const hiddenEnglish = display.hidden;
      return `<div class="dialogue-line" data-dialogue-index="${index}">
        <span class="speaker">${escapeHtml(roleLabel(semanticRole(line)))}</span>
        <div>
          ${hiddenEnglish ? `<div class="dialogue-placeholder"><span>Сначала ответьте или поймите реплику.</span><button class="text-button reveal-dialogue" type="button">Показать текст</button></div>` : ""}
          ${hiddenEnglish ? "" : `<div class="dialogue-content" tabindex="-1"><p lang="en-US">${escapeHtml(display.english)}</p>${display.translation ? `<p class="translation">${escapeHtml(display.translation)}</p>` : ""}</div>`}
        </div>
        <button class="icon-button dialogue-audio" title="${!evaluated && situationMode !== "read" && isDriver ? "Ответ водителя откроется после проверки" : "Прослушать"}" ${!evaluated && situationMode !== "read" && isDriver ? "disabled" : ""}>Слушать</button>
      </div>`;
    }).join("");
    $("#situation-complete-status").textContent = masteryLabel("situations", item.id);
    $("#situation-player").setAttribute("aria-labelledby", `situation-tab-${situationMode}`);
    delete $("#situation-player").dataset.expectedTurn;
  }

  function checkSituationResponse() {
    const item = situationByIndex();
    if (!item || situationMode === "read") return;
    const response = $("#situation-response").value.trim();
    const practice = currentSituationPractice || situationPracticeFor(item, situationVariant);
    const task = activeSituationTask(item, practice);
    if (task.stage === "safety-choice" || task.choiceSafe !== true) {
      failSituationTask(item, practice, "Обязательный безопасный выбор пропущен. Попытка не завершена.", "safety-step");
      return;
    }
    const exposureKey = situationStimulusKey(item);
    const needsExposure = Core.situationStageRequiresExposure(task.stage, situationMode);
    let evaluation;
    if (revealedSituationStimuli.has(exposureKey)) {
      evaluation = {
        pass: false,
        score: 0,
        evaluator: "semantic-slots",
        feedback: "Модель или текст задания были открыты до ответа. Нужна новая самостоятельная попытка.",
        missing: ["pre-reveal"],
      };
    } else if (needsExposure && !heardSituationStimuli.has(exposureKey)) {
      evaluation = {
        pass: false,
        score: 0,
        evaluator: "semantic-slots",
        feedback: "Сначала полностью прослушайте аудио.",
        missing: ["stimulus-exposure"],
      };
    } else if (task.stage === "workplace-outcome") {
      const outcome = practice.workplaceOutcome;
      const replayedTurn = outcome?.rubric?.rejectExactCriticalTurnReplay === true
        && practice.turns.some(turn => Eval.normalizeText(turn.expected) === Eval.normalizeText(response));
      evaluation = !outcome?.expected
        ? { pass: false, score: 0, evaluator: "situation-outcome-contract", feedback: "Для этой сцены не настроен отдельный ключ рабочего результата.", missing: ["workplace-outcome-contract"] }
        : replayedTurn
          ? { pass: false, score: 0, evaluator: "situation-outcome-contract", feedback: "Итог должен подтвердить рабочий результат, а не повторять последний критический ход.", missing: ["distinct-workplace-outcome"] }
          : Eval.evaluateSituation({
              ...item,
              informationGap: outcome.promptEn || outcome.promptRu,
              typedSlots: outcome.slots || [],
              responseRubric: outcome.rubric || practice.rubric,
            }, response, outcome.expected);
    } else {
      const turn = practice.turns[task.turnIndex];
      evaluation = Eval.evaluateSituation({
        ...item,
        informationGap: turn?.prompt || practice.prompt,
        typedSlots: turn?.slots || [],
        responseRubric: turn?.rubric || practice.rubric,
      }, response, turn?.expected || practice.expected);
    }
    if (needsExposure || revealedSituationStimuli.has(exposureKey)) {
      stopPlayback();
      heardSituationStimuli.delete(exposureKey);
      revealedSituationStimuli.delete(exposureKey);
    }
    if (!evaluation.pass) {
      evaluation.feedback = `${practice.failure} ${evaluation.feedback}`;
      task.responses.push(response);
      task.evaluations.push({ id: task.stage === "workplace-outcome" ? "workplace-outcome" : practice.turns[task.turnIndex]?.id, response, evaluation });
      finalSituationEvaluation(item, practice, evaluation);
      renderSituations();
      requestAnimationFrame(() => $("#situation-evaluation-feedback")?.focus());
      return;
    }
    if (task.stage === "critical-turn") {
      const turn = practice.turns[task.turnIndex];
      task.responses.push(response);
      task.evaluations.push({ id: turn.id, response, evaluation });
      task.turnIndex += 1;
      task.stage = task.turnIndex >= practice.turns.length ? "workplace-outcome" : "critical-turn";
      task.feedback = task.stage === "workplace-outcome"
        ? "Все критические ходы пройдены. Осталось подтвердить рабочий результат отдельной репликой."
        : `Ход ${task.turnIndex} пройден. Продолжите сцену.`;
      renderSituations();
      requestAnimationFrame(() => $("#situation-response")?.focus());
      return;
    }
    task.responses.push(response);
    task.evaluations.push({ id: "workplace-outcome", response, evaluation });
    const requiredIds = practice.completionBlueprint?.requiredCriticalTurnIds || practice.turns.map(turn => turn.id);
    const completedIds = new Set(task.evaluations.filter(entry => entry.evaluation?.pass).map(entry => entry.id));
    const missingTurn = requiredIds.find(id => !completedIds.has(id));
    if (missingTurn || task.choiceSafe !== true) {
      failSituationTask(item, practice, "Не все обязательные ходы и шаг безопасности завершены.", missingTurn || "safety-step");
      return;
    }
    const completed = {
      pass: true,
      score: 1,
      evaluator: "situation-completion-blueprint",
      feedback: `Все ${requiredIds.length} критических хода, безопасный выбор и рабочий результат подтверждены.`,
      matched: [...requiredIds, "safe-choice", "workplace-outcome"],
      missing: [],
    };
    finalSituationEvaluation(item, practice, completed);
    renderSituations();
    requestAnimationFrame(() => $("#situation-evaluation-feedback")?.focus());
  }

  const SIGN_CATEGORY_LABELS = {
    regulatory: "Предписывающие",
    truck: "Ограничения для грузовиков",
    warning: "Предупреждения и габариты",
    "work-zone": "Дорожные работы",
    service: "Весы, инспекция и стоянка",
    dynamic: "Электронные табло",
  };

  function populateSignCategories() {
    const select = $("#sign-category");
    if (select.options.length > 1) return;
    select.innerHTML += Object.entries(SIGN_CATEGORY_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  }

  function dmsLines(message) {
    const lines = [];
    let line = "";
    for (const word of message.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && candidate.length > 15 && lines.length < 2) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines.map(value => `<span>${escapeHtml(value)}</span>`).join("");
  }

  function signVisual(item, asset) {
    if (asset) {
      const note = asset[2] || "Официальный SVG FHWA";
      const alt = asset[3] || `Official MUTCD ${asset[0]}: ${item.display}`;
      return `<div class="sign-visual" lang="en-US"><img src="${asset[1]}" alt="${escapeHtml(alt)}"></div>
        <span class="sign-designation">MUTCD ${escapeHtml(asset[0])}</span>
        <span class="sign-source-note">${escapeHtml(note)}</span>`;
    }
    if (item.category === "dynamic") {
      return `<div class="dms-training" role="img" aria-label="Учебная симуляция электронного табло: ${escapeHtml(item.display)}">
          <small>TRAINING DMS</small>
          <strong lang="en-US">${dmsLines(item.display)}</strong>
        </div>
        <span class="sign-designation">Учебная симуляция табло</span>
        <span class="sign-source-note">Текст и разбивка строк зависят от оператора дороги</span>`;
    }
    return `<div class="sign-context-drill">
        <small>VARIABLE OR LOCAL</small>
        <strong lang="en-US">${escapeHtml(item.display)}</strong>
      </div>
      <span class="sign-designation">Учебная карточка</span>
      <span class="sign-source-note">Форма и числовые значения могут отличаться по месту</span>`;
  }

  function renderSigns() {
    populateSignCategories();
    let signs = DATA.signs.filter(item => applies(item) && (signFilter === "all" || item.category === signFilter));
    if (signStatus !== "all") signs = signs.filter(item => signStatus === "learned" ? isDone("signs", item.id) : !isDone("signs", item.id));
    if (focusedSignIds?.length) signs = focusedSignIds
      .map(id => DATA.signs.find(item => item.id === id))
      .filter(item => item && (stepTwoSession && state.elpStepTwo?.sessionIds?.includes(item.id) || applies(item)));
    const visibleSigns = focusedSignIds?.length ? signs : signs.slice(0, signVisibleLimit);
    $("#sign-scope-note").textContent = focusedSignIds?.length ? `Маршрут на сегодня: ${signs.length} карточек.` : "Работайте короткой порцией: письменно назовите смысл и действие до показа модели.";
    $("#sign-count").textContent = `Показано ${visibleSigns.length} из ${signs.length} применимых`;
    $("#load-more-signs").hidden = Boolean(focusedSignIds?.length) || visibleSigns.length >= signs.length;
    if (!visibleSigns.length) {
      $("#sign-grid").innerHTML = `<div class="empty-state"><strong>Здесь пока нет карточек.</strong><p>Измените категорию или состояние изучения.</p></div>`;
      return;
    }
    $("#sign-grid").innerHTML = visibleSigns.map(item => {
      const asset = item.assetPath ? [item.assetCode, item.assetPath, "Официальный SVG FHWA", item.assetAlt] : null;
      const evaluationState = signEvaluations.get(item.id);
      const revealed = revealedSignIds.has(item.id) || Boolean(evaluationState);
      const locked = revealed || Boolean(evaluationState);
      const stepTwoReadinessCard = stepTwoSession && state.elpStepTwo?.sessionIds?.includes(item.id);
      const stepTwoResultRecorded = Boolean(state.elpStepTwo?.results?.[item.id]);
      const audioLockedForReading = stepTwoReadinessCard && !stepTwoResultRecorded;
      const variant = evaluationState?.variant || (stepTwoReadinessCard
        ? "elp-reading-meaning-and-action"
        : chooseVariant("signs", item.id, ["action-from-stimulus", "meaning-and-action"]));
      return `
      <article class="sign-card ${isDone("signs", item.id) ? "learned" : ""}" data-sign-id="${item.id}" data-category="${item.category}">
        <button class="icon-button sign-audio" title="${audioLockedForReading ? "Аудио доступно после фиксации ответа" : "Прослушать"}" ${audioLockedForReading ? "disabled" : ""}>Слушать</button>
        <span class="mastery-badge">${escapeHtml(!isElpEnglishBearing(item) && ["fhwa-mutcd-shs", "training-dms"].includes(item.provenance) ? "Ознакомление, без зачета ELP" : masteryLabel("signs", item.id))}</span>
        ${signVisual(item, asset)}
        <label class="response-label" for="sign-response-${escapeHtml(item.id)}">${variant.includes("meaning-and-action") ? "Объясните смысл английского текста и безопасное действие по-английски" : "Назовите безопасное действие по-английски"}</label>
        <textarea class="typed-response sign-response" id="sign-response-${escapeHtml(item.id)}" lang="en-US" autocomplete="off" data-sign-variant="${variant}" ${locked ? "disabled" : ""}>${escapeHtml(evaluationState?.response || "")}</textarea>
        <button class="button primary sign-check" type="button" ${locked ? "disabled" : ""}>Проверить ответ</button>
        <p class="evaluation-status" role="status" tabindex="-1">${escapeHtml(evaluationState?.evaluation?.feedback || (revealed ? "Модель открыта. Эта попытка не подтверждает результат." : ""))}</p>
        ${revealed ? `<div class="sign-info" tabindex="-1"><p>${escapeHtml(item.meaningRu)}</p><strong>${escapeHtml(item.actionEn)}</strong></div>` : ""}
        <button class="text-button sign-reveal" type="button" aria-expanded="${revealed}" ${locked ? "hidden" : ""}>Показать ответ</button>
      </article>`;
    }).join("");
  }

  function updateElpStepTwoResult(item, evaluation, response, variant) {
    const gate = state.elpStepTwo;
    if (!stepTwoSession || !gate?.sessionIds?.includes(item.id)) return;
    gate.results ||= {};
    gate.resultTimes ||= {};
    if (gate.results[item.id]) return;
    gate.results[item.id] = {
      pass: Boolean(evaluation.pass),
      evaluator: evaluation.evaluator,
      feedback: evaluation.feedback,
      responseHash: responseHash(response),
      variant,
      typed: true,
      preReveal: true,
      blind: true,
      productive: true,
      stimulusExposed: true,
    };
    gate.resultTimes[item.id] = new Date().toISOString();
    gate.status = Eval.deriveGateStatus(gate.results, gate.sessionIds);
    gate.completedAt = ["passed", "failed"].includes(gate.status) ? new Date().toISOString() : null;
    if (gate.status === "pending") focusedSignIds = gate.sessionIds.filter(id => !gate.results[id]);
    else {
      stepTwoSession = false;
      focusedSignIds = null;
    }
    const answered = gate.sessionIds.filter(id => gate.results[id]).length;
    const passed = gate.sessionIds.filter(id => gate.results[id]?.pass).length;
    const statusNode = $("#elp-step-two-status");
    if (statusNode) statusNode.textContent = gate.status === "passed"
      ? `Этап 2 пройден: все ${gate.sessionIds.length} текстовых стимула прочитаны с самостоятельным ответом.`
      : `Этап 2: ${answered} из ${gate.sessionIds.length} текстовых стимулов проверено, ${passed} успешно.`;
  }

  function checkSignResponse(card) {
    const item = DATA.signs.find(sign => sign.id === card?.dataset.signId);
    const input = card?.querySelector(".sign-response");
    if (!item || !input) return;
    if (revealedSignIds.has(item.id)) {
      toast("После открытия модели начните новую самостоятельную попытку");
      return;
    }
    if (stepTwoSession && state.elpStepTwo?.results?.[item.id]) {
      toast("Этот материал уже зафиксирован в текущей попытке этапа 2");
      renderSigns();
      return;
    }
    const response = input.value.trim();
    const variant = input.dataset.signVariant || "action-from-stimulus";
    const evaluation = variant.includes("meaning-and-action")
      ? Eval.evaluateSignMeaningAndAction(item, response)
      : Eval.evaluateSign(item, response);
    const record = recordLearningAttempt("signs", item.id, evaluation, "sign-typed-pre-reveal", variant, null, { response, deferSave: true });
    if (!record) return;
    signEvaluations.set(item.id, { response, evaluation, variant });
    if (!evaluation.pass) addErrorItem("sign", item.id, item.display, evaluation.feedback, "sign-meaning-action", evaluation.missing?.[0] || "meaning");
    updateElpStepTwoResult(item, evaluation, response, variant);
    if (!saveState().ok) {
      signEvaluations.delete(item.id);
      revealedSignIds.delete(item.id);
      stepTwoSession = state.elpStepTwo?.status === "pending" && artifactMatchesCurrentContext(state.elpStepTwo);
      focusedSignIds = stepTwoSession ? state.elpStepTwo.sessionIds.filter(id => !state.elpStepTwo.results?.[id]) : null;
      renderSigns();
      const cardAfterRollback = document.querySelector(`[data-sign-id="${CSS.escape(item.id)}"]`);
      cardAfterRollback?.querySelector(".sign-response")?.focus();
      const feedback = cardAfterRollback?.querySelector(".evaluation-status");
      if (feedback) feedback.textContent = "Ответ проверен, но не сохранен. Поле снова доступно, повторите попытку.";
      return;
    }
    renderSigns();
    requestAnimationFrame(() => document.querySelector(`[data-sign-id="${CSS.escape(item.id)}"] .evaluation-status`)?.focus());
  }

  function documentTrainingInstances(item) {
    if (Array.isArray(item?.trainingInstances) && item.trainingInstances.length) return item.trainingInstances;
    const legacyFields = item?.fields || [];
    const fallback = documentChallengeFields(item)[0] || { label: item?.title || "Document", value: item?.practice || item?.title || "" };
    return ["a", "b"].map(suffix => ({
      id: `${item.id}:legacy-${suffix}`,
      watermark: "TRAINING SAMPLE, NOT VALID",
      visibleStimulus: { title: item.title, fields: legacyFields, instructions: item.instructions || [], notes: item.notes || [] },
      promptEn: `According to the visible training sample, what is the value for ${fallback.label}?`,
      promptRu: `Какое значение указано в видимом учебном образце в поле «${fallback.label}»?`,
      answerKey: fallback.value,
      distractors: [],
    }));
  }

  function selectDocumentInstance(item) {
    const instances = documentTrainingInstances(item);
    const variant = chooseVariant("documents", item.id, instances.map(instance => instance.id));
    return instances.find(instance => instance.id === variant) || instances[0];
  }

  function renderVisibleDocument(instance) {
    const stimulus = instance?.visibleStimulus || {};
    const fields = Array.isArray(stimulus.fields) ? stimulus.fields : [];
    const instructions = Array.isArray(stimulus.instructions) ? stimulus.instructions : stimulus.instructions ? [stimulus.instructions] : [];
    const notes = Array.isArray(stimulus.notes) ? stimulus.notes : stimulus.notes ? [stimulus.notes] : [];
    const ruText = value => {
      if (value && typeof value === "object") return value.textRu || value.ru || value.instructionRu || "";
      return /[\u0400-\u04ff]/u.test(String(value || "")) ? String(value) : "";
    };
    const instructionRu = instructions.map(ruText).filter(Boolean);
    const notesRu = notes.map(ruText).filter(Boolean);
    return `<div class="training-watermark">${escapeHtml(instance?.watermark || "TRAINING SAMPLE, NOT VALID")}</div>${fields.length ? fields.map(field => `<div class="document-field"><span>${escapeHtml(field.label)}</span><strong>${escapeHtml(field.value)}</strong></div>`).join("") : `<div class="document-field"><span>Учебный материал</span><strong>${escapeHtml(stimulus.title || "TRAINING SAMPLE")}</strong></div>`}${instructionRu.length ? `<section class="document-stimulus-notes"><strong>Инструкции</strong><ol>${instructionRu.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol></section>` : ""}${notesRu.length ? `<section class="document-stimulus-notes"><strong>Примечания</strong><ul>${notesRu.map(note => `<li>${escapeHtml(note)}</li>`).join("")}</ul></section>` : ""}`;
  }

  function renderDocuments() {
    const statusFor = item => item.status || "training";
    const statusLabel = item => DOCUMENT_STATUS_LABELS[statusFor(item)] || statusFor(item);
    const entries = DATA.documents.map((item, index) => ({ item, index })).filter(entry => applies(entry.item));
    if (!entries.some(entry => entry.index === documentIndex)) documentIndex = entries[0]?.index || 0;
    $("#document-list").innerHTML = entries.map((entry, visibleIndex) => `
      <button class="${entry.index === documentIndex ? "active" : ""}" data-document-index="${entry.index}">
        ${String(visibleIndex + 1).padStart(2, "0")}. ${escapeHtml(entry.item.titleRu)}
        <small>${escapeHtml(masteryLabel("documents", entry.item.id))} · ${escapeHtml(statusLabel(entry.item))}</small>
      </button>`).join("");
    const item = DATA.documents[documentIndex];
    const walletCandidates = [
      ...entries.map(entry => entry.item),
      ...(DATA.documentWalletAdditions || []).filter(applies),
    ];
    const walletItems = walletCandidates.filter((document, index) => walletCandidates.findIndex(candidate => candidate.id === document.id) === index);
    $("#document-wallet-count").textContent = `${walletItems.length} элементов после фильтров`;
    const groups = ["carry-or-trip", "trip-specific", "conditional", "training"].map(status => ({
      status,
      items: walletItems.filter(document => statusFor(document) === status),
    }));
    $("#document-wallet-grid").innerHTML = groups.map(group => `<article class="${group.status === "carry-or-trip" ? "check-ready" : group.status === "trip-specific" ? "check-trip" : "check-conditional"}"><strong>${escapeHtml(DOCUMENT_STATUS_LABELS[group.status])}</strong>${group.items.length ? `<ul>${group.items.map(document => `<li data-wallet-item="${escapeHtml(document.id)}">${escapeHtml(document.titleRu)}</li>`).join("")}</ul>` : "<p>Для выбранного профиля нет элементов в этой группе.</p>"}</article>`).join("") + `<article class="check-stop"><strong>Перед передачей</strong><p>Покажите только запрошенный и применимый документ. Условия рейса, груза и юрисдикции проверяются отдельно.</p></article>`;
    $("#document-status").textContent = statusLabel(item);
    const evaluated = documentEvaluation?.id === item.id;
    currentDocumentInstance = evaluated && documentEvaluation.instance
      ? documentEvaluation.instance
      : selectDocumentInstance(item);
    currentDocumentVariant = currentDocumentInstance.id;
    $("#document-title").textContent = currentDocumentInstance.visibleStimulus?.title || item.title;
    $("#document-title-ru").textContent = item.titleRu;
    const showModel = documentRevealed || evaluated;
    $("#document-fields").innerHTML = renderVisibleDocument(currentDocumentInstance);
    $("#document-practice").textContent = showModel ? currentDocumentInstance.answerKey : "Правильный ответ скрыт до фиксации результата.";
    $("#document-audio").disabled = !showModel;
    renderFieldQuiz(item, currentDocumentInstance);
    renderDocumentCompliance(item, showModel);
    $("#document-complete-status").textContent = masteryLabel("documents", item.id);
  }

  function documentChallengeFields(item) {
    const result = [];
    const add = (label, value) => {
      const text = String(value || "").trim();
      if (!/[A-Za-z0-9А-Яа-я]/.test(text)) return;
      if (result.some(entry => Eval.normalizeText(entry.value) === Eval.normalizeText(text))) return;
      result.push({ label: String(label || "Required value"), value: text });
    };
    for (const field of item.fields || []) add(field.label, field.value);
    if (Number(item.minimumBlankDays) > 0) add("Minimum blank graph-grid supply", `${Number(item.minimumBlankDays)} days`);
    const instructions = item.regulatoryInstructions || item.instructions || item.complianceSteps || [];
    for (const [index, step] of (Array.isArray(instructions) ? instructions : [instructions]).entries()) {
      add(`Required step ${index + 1}`, typeof step === "string" ? step : step?.text || step?.instruction);
    }
    if (!result.length) add("Назначение и применимость", item.practice || item.title);
    if (result.length === 1) add("Название документа", item.title);
    return result.slice(0, 8);
  }

  function renderFieldQuiz(item, instance = currentDocumentInstance) {
    const quiz = $("#field-quiz");
    const evaluated = documentEvaluation?.id === item.id;
    const locked = evaluated || documentRevealed;
    currentDocumentVariant = evaluated && documentEvaluation.variant ? documentEvaluation.variant : instance.id;
    currentDocumentField = evaluated && documentEvaluation.field
      ? documentEvaluation.field
      : { label: instance.promptEn || instance.promptRu || "Required value", value: instance.answerKey, instanceId: instance.id };
    const answerChoices = [...new Set([instance.answerKey, ...(instance.distractors || [])].map(String))];
    const orderedChoices = Eval.deterministicOptionOrder(answerChoices, `${todayKey()}-${state.dailyRefresh}-${instance.id}`);
    quiz.innerHTML = `<span>Самостоятельное чтение образца</span><p>${escapeHtml(instance.promptRu || instance.promptEn)}</p><div class="document-distractors" aria-label="Варианты ответа">${orderedChoices.map(row => `<button type="button" class="button secondary" data-document-choice="${escapeHtml(row.option)}" ${locked ? "disabled" : ""}>${escapeHtml(row.option)}</button>`).join("")}</div><label class="sr-only" for="document-response">Ответ по образцу</label><textarea class="typed-response" id="document-response" lang="en-US" autocomplete="off" ${locked ? "disabled" : ""}>${escapeHtml(evaluated ? documentEvaluation.response : "")}</textarea><div class="button-row"><button class="button primary" id="check-document-response" type="button" ${locked ? "disabled" : ""}>Проверить ответ</button><button class="button secondary" id="reveal-field" type="button" ${locked ? "hidden" : ""}>Показать ответ</button></div><p class="evaluation-status" id="document-evaluation-feedback" role="status" tabindex="-1">${escapeHtml(evaluated ? documentEvaluation.evaluation.feedback : documentRevealed ? "Ответ открыт. Начните новую попытку без подсказки." : "")}</p>`;
    quiz.querySelectorAll("[data-document-choice]").forEach(button => button.addEventListener("click", () => {
      const input = $("#document-response");
      if (input && !input.disabled) {
        input.value = button.dataset.documentChoice;
        input.focus();
      }
    }));
    $("#check-document-response")?.addEventListener("click", checkDocumentResponse);
    $("#reveal-field")?.addEventListener("click", () => {
      documentRevealed = true;
      if (!recordViewed("documents", item.id, "document-reveal", instance.id, { deferSave: true })) {
        documentRevealed = false;
        return;
      }
      addErrorItem("document", item.id, item.titleRu, "Ответ открыт до самостоятельного чтения поля.", "document-field-retrieval", "premature-reveal");
      if (!saveState().ok) {
        documentRevealed = false;
        renderDocuments();
        const feedback = $("#document-evaluation-feedback");
        if (feedback) feedback.textContent = "Модель не открыта, потому что результат не сохранился. Поле снова доступно.";
        $("#document-response")?.focus();
        return;
      }
      renderDocuments();
      requestAnimationFrame(() => $("#document-evaluation-feedback")?.focus());
    });
  }

  function renderDocumentCompliance(item, showDetails = false) {
    const node = $("#document-compliance");
    const instructions = item.regulatoryInstructionsRu || item.instructionsRu || item.complianceStepsRu || item.instructions || [];
    const notesSource = item.notesRu || item.complianceNotesRu || item.notes || [];
    const notes = Array.isArray(notesSource) ? notesSource : notesSource ? [notesSource] : [];
    const sources = item.sourceRefs || item.sourceReferences || item.sources || [];
    const effectiveRange = item.effectiveFrom || item.effectiveThrough
      ? `с ${item.effectiveFrom || "не указано"} по ${item.effectiveThrough || "без даты окончания"}`
      : "";
    const effective = item.effectiveDateContextRu || item.dateContextRu || item.currentnessNoteRu || item.effectiveDate || effectiveRange;
    const conditionText = item.applicabilityRu || (Array.isArray(item.conditions) && item.conditions.length ? "Показывается только при выбранных применимых условиях рейса." : "Без дополнительных выбранных условий.");
    const instructionList = Array.isArray(instructions) ? instructions : [instructions];
    const safeActions = Array.isArray(item.safeActionsRu) ? item.safeActionsRu : item.safeActionRu ? [item.safeActionRu] : [];
    const sourceList = Array.isArray(sources) ? sources : [sources];
    const federalStatus = item.federallyRequiredOnboard === true
      ? "Входит в федеральный комплект документов при выбранных условиях."
      : item.federallyRequiredOnboard === false
        ? "Не является универсально обязательным федеральным документом на борту."
        : "Статус зависит от указанной операции и условий.";
    const ruText = value => typeof value === "string"
      ? /[\u0400-\u04ff]/u.test(value) ? value : ""
      : value?.textRu || value?.ru || value?.instructionRu || "";
    node.innerHTML = `<section class="compliance-panel"><h4>Нормативный контекст</h4><p><strong>Статус федерального комплекта:</strong> ${escapeHtml(federalStatus)}</p>${effective ? `<p><strong>Дата и применимость:</strong> ${escapeHtml(effective)}</p>` : ""}<p><strong>Условия показа:</strong> ${escapeHtml(conditionText)}</p>${!showDetails && (instructionList.filter(ruText).length || notes.filter(ruText).length || safeActions.filter(ruText).length) ? "<p>Пошаговое объяснение на русском откроется после самостоятельного чтения поля.</p>" : ""}${showDetails && instructionList.filter(ruText).length ? `<ol>${instructionList.filter(ruText).map(step => `<li>${escapeHtml(ruText(step))}</li>`).join("")}</ol>` : ""}${showDetails && safeActions.filter(ruText).length ? `<div class="safe-actions"><strong>Безопасное действие</strong><ul>${safeActions.filter(ruText).map(action => `<li>${escapeHtml(ruText(action))}</li>`).join("")}</ul></div>` : ""}${showDetails && notes.filter(ruText).length ? `<ul class="compliance-notes">${notes.filter(ruText).map(note => `<li>${escapeHtml(ruText(note))}</li>`).join("")}</ul>` : ""}${sourceList.filter(Boolean).length ? `<ul class="source-list">${sourceList.filter(Boolean).map(source => { const label = typeof source === "string" ? source : source.label || source.title || source.citation || source.url; const url = typeof source === "object" ? source.url : ""; return `<li>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>` : escapeHtml(label)}</li>`; }).join("")}</ul>` : ""}</section>`;
  }

  function checkDocumentResponse() {
    const item = DATA.documents[documentIndex];
    const input = $("#document-response");
    if (!item || !currentDocumentField || !input) return;
    if (documentRevealed && documentEvaluation?.id !== item.id) {
      toast("После открытия ответа начните новую самостоятельную попытку");
      return;
    }
    const response = input.value.trim();
    const evaluation = Eval.evaluateDocumentField(currentDocumentField, response, item);
    const record = recordLearningAttempt("documents", item.id, evaluation, "document-typed-pre-reveal", currentDocumentVariant, null, { response, deferSave: true });
    if (!record) return;
    documentEvaluation = { id: item.id, response, evaluation, variant: currentDocumentInstance.id, field: { ...currentDocumentField }, instance: currentDocumentInstance };
    documentRevealed = true;
    if (!evaluation.pass) addErrorItem("document", item.id, item.titleRu, evaluation.feedback, "document-field-retrieval", evaluation.missing?.[0] || "field-value");
    if (!saveState().ok) {
      documentEvaluation = null;
      documentRevealed = false;
      renderDocuments();
      const feedback = $("#document-evaluation-feedback");
      if (feedback) feedback.textContent = "Ответ проверен, но не сохранен. Поле снова доступно, повторите попытку.";
      $("#document-response")?.focus();
      return;
    }
    renderDocuments();
    requestAnimationFrame(() => $("#document-evaluation-feedback")?.focus());
  }

  function lessonStudyPanel(item) {
    const stimulus = item.visibleStimulus && typeof item.visibleStimulus === "object"
      ? `<section class="lesson-study-panel"><strong>TRAINING SAMPLE, NOT VALID</strong><ul>${Object.entries(item.visibleStimulus).filter(([key]) => key !== "trainingSample").map(([key, value]) => `<li>${escapeHtml(key)}: ${escapeHtml(value)}</li>`).join("")}</ul></section>`
      : "";
    if (item.studyPanel === "hotshot-open-securement" || /securement|креплен/i.test(`${item.id} ${item.title}`)) return `${stimulus}
      <section class="lesson-study-panel"><img src="images/situations/hotshot-car-hauler-v01.webp" alt="Open gooseneck car-hauler with transported vehicles"><strong>Распознавание креплений Hotshot open</strong><ul><li>Определите проверенные точки крепления и состояние ремней.</li><li>Проверьте прокладку ремней: без перекручивания, порезов и контакта с острым краем.</li><li>После начала движения выполните повторную проверку по правилам перевозчика и применимым требованиям.</li><li>Учебная иллюстрация не подтверждает достаточность крепления.</li></ul></section>`;
    if (item.studyPanel === "hotshot-enclosed-loading" || /enclosed loading|закрыт.*прицеп/i.test(`${item.id} ${item.title}`)) return `${stimulus}
      <section class="lesson-study-panel"><img src="images/situations/hotshot-enclosed-loading-v01.webp" alt="Enclosed gooseneck car-hauler prepared for loading"><strong>Проверка погрузки Hotshot enclosed</strong><ol><li>Проверьте угол рампы и зазор до переднего бампера.</li><li>Назначьте помощника и согласуйте сигнал остановки.</li><li>Контролируйте зазоры до крыши, зеркал и дверей, а также внутреннюю ширину.</li><li>Остановитесь до выхода из автомобиля и закрепите груз по проверенной процедуре.</li></ol></section>`;
    return stimulus;
  }

  function lessonPhrases(item) {
    const profile = state.profile || "tractor";
    return item.profilePhrases?.[profile] || item.phrases || [];
  }

  function lessonMeanings(item) {
    const profile = state.profile || "tractor";
    return item.profilePhraseMeaningsRu?.[profile] || item.phraseMeaningsRu || item.phrasesRu || [];
  }

  function lessonAudioQueue(item, phraseIndex, phrase) {
    const profile = item?.audioProfile || "clean";
    const stored = sourceAudio("lesson", item.id, `phrase-${phraseIndex + 1}`).filter(clip => clip.text === phrase && clip.profile === profile && clip.path);
    if (stored.length) return stored;
    const path = textAudio(phrase, "driver", profile);
    return [{ path, text: phrase, role: "driver", profile }];
  }

  function lessonConstructState(item) {
    const record = recordForCurrentContext("lessons", item.id);
    const evidence = Array.isArray(record?.evidence) ? record.evidence : [];
    const invalidatedAt = evidence.reduce((latest, entry) => {
      if (StateApi.isQualifyingEvidence?.(entry)) return latest;
      if (!entry?.at || !["failed", "prompted", "viewed"].includes(String(entry.outcome || entry.result || "").toLowerCase())) return latest;
      return Math.max(latest, Date.parse(entry.at) || 0);
    }, 0);
    const successes = evidence
      .filter(entry => StateApi.isQualifyingEvidence?.(entry) && (Date.parse(entry.at) || 0) > invalidatedAt)
      .sort((left, right) => (Date.parse(left.at) || 0) - (Date.parse(right.at) || 0));
    const reception = successes.filter(entry => String(entry.variant || "").endsWith("reception-only")).at(-1) || null;
    const receptionAt = Date.parse(reception?.at) || 0;
    const production = successes.find(entry => String(entry.variant || "").endsWith("production-interaction")
      && (Date.parse(entry.at) || 0) - receptionAt >= 24 * 60 * 60 * 1000) || null;
    if (!reception || production) return { construct: "reception", waitUntil: null };
    const waitUntil = receptionAt + 24 * 60 * 60 * 1000;
    return { construct: "production-interaction", waitUntil: Date.now() < waitUntil ? new Date(waitUntil).toISOString() : null };
  }

  function lessonAttempt(item) {
    const existing = lessonEvaluations.get(item.id);
    if (existing && !(existing.stage === "waiting" && existing.waitUntil && Date.now() >= Date.parse(existing.waitUntil))) return existing;
    if (existing) lessonEvaluations.delete(item.id);
    const constructState = lessonConstructState(item);
    const construct = constructState.construct;
    const variant = contextualAttemptVariant(item, construct === "reception" ? "reception-only" : "production-interaction");
    const phrases = lessonPhrases(item);
    const order = phrases.map((_, index) => index);
    if (construct === "production-interaction") order.reverse();
    const attempt = {
      variant,
      construct,
      stage: constructState.waitUntil ? "waiting" : construct === "reception" ? "reception" : "production",
      waitUntil: constructState.waitUntil,
      order,
      receptionIndex: 0,
      productionIndex: 0,
      reception: [],
      production: [],
      interaction: null,
      feedback: "",
      finished: false,
      revealed: false,
    };
    lessonEvaluations.set(item.id, attempt);
    return attempt;
  }

  function lessonStimulusKey(item, phraseIndex, variant) {
    return `${item.id}:${variant}:${phraseIndex}`;
  }

  function evaluateLessonMeaning(response, expected) {
    return Eval.evaluateMeaningRecall(response, expected);
  }

  function lessonInteractionContract(item, phrases) {
    const profileContract = item.profileInteractionMaterializations?.[state.profile || "tractor"];
    const contract = item.interaction || profileContract || item.assessmentBlueprint?.interaction || {};
    const phraseIds = Array.isArray(contract.requiredResponsePhraseIds) ? contract.requiredResponsePhraseIds : [];
    const indexed = new Map(phrases.map((phrase, index) => [`phrase-${index + 1}`, phrase]));
    const selected = phraseIds.map(id => indexed.get(id)).filter(Boolean);
    const expected = contract.modelResponse || selected.join(" ") || phrases.slice(0, Math.min(2, phrases.length)).join(" ");
    const semantic = contract.semanticRubric || {};
    return {
      promptEn: contract.promptEn || item.interactionPromptEn || "Respond to the workplace request using the lesson phrases.",
      promptRu: contract.promptRu || item.interactionPromptRu || item.goal,
      expected,
      requiredResponses: contract.modelResponse ? [contract.modelResponse] : selected.length ? selected : [expected],
      slots: Array.isArray(contract.responseSlots) ? contract.responseSlots : [],
      conditionSpecific: Boolean(item.interaction),
      rubric: {
        ...semantic,
        minTokens: Number(semantic.minimumEnglishWords || semantic.minTokens || 3),
        requiredRatio: Number.isFinite(Number(semantic.requiredResponseCoverage)) ? Number(semantic.requiredResponseCoverage) : Number(semantic.requiredRatio || 1),
      },
    };
  }

  function finalizeLessonAttempt(item, attempt, evaluation) {
    const response = [
      ...attempt.reception.map(entry => entry.response),
      ...attempt.production.map(entry => entry.response),
      attempt.interaction?.response || "",
    ].filter(Boolean).join("\n");
    const evidenceMode = attempt.construct === "reception" ? "lesson-reception-blueprint" : "lesson-production-interaction-blueprint";
    const record = recordLearningAttempt("lessons", item.id, evaluation, evidenceMode, attempt.variant, null, {
      response,
      blind: attempt.revealed !== true,
      support: attempt.revealed === true ? "reveal" : "none",
      deferSave: true,
    });
    if (!record) return false;
    attempt.finished = true;
    attempt.evaluation = evaluation;
    attempt.response = response;
    if (!evaluation.pass) addErrorItem("lesson", item.id, item.titleRu || item.title, evaluation.feedback, evidenceMode, evaluation.missing?.[0] || "lesson-blueprint");
    if (!saveState().ok) {
      for (const key of heardLessonStimuli) {
        if (key.startsWith(`${item.id}:`)) heardLessonStimuli.delete(key);
      }
      lessonEvaluations.delete(item.id);
      const retry = lessonAttempt(item);
      retry.feedback = "Ответ проверен, но не сохранен. Начните новую самостоятельную попытку.";
      return false;
    }
    return true;
  }

  function renderLessons() {
    const applicable = DATA.lessons.filter(applies).map(materializeForCurrentProfile);
    const lessons = Core.orderCurriculum ? Core.orderCurriculum(applicable) : applicable;
    $("#lesson-grid").innerHTML = lessons.map((item, index) => {
      const open = focusedLessonId === item.id;
      const attempt = open ? lessonAttempt(item) : lessonEvaluations.get(item.id);
      const phrases = lessonPhrases(item);
      const meanings = lessonMeanings(item);
      const finished = Boolean(attempt?.finished);
      let challenge = "";
      if (open && attempt) {
        const orderedIndex = attempt.stage === "production" ? attempt.order[attempt.productionIndex] : attempt.order[attempt.receptionIndex];
        const phrase = phrases[orderedIndex] || "";
        const meaning = meanings[orderedIndex] || item.goal;
        if (attempt.finished) {
          challenge = `<div class="typed-challenge"><p class="evaluation-status" role="status" tabindex="-1">${escapeHtml(attempt.evaluation?.feedback || "Попытка завершена.")}</p><button class="button primary lesson-restart" type="button">Начать новую самостоятельную попытку</button></div>`;
        } else if (attempt.stage === "waiting") {
          const available = new Date(attempt.waitUntil).toLocaleString("ru-RU", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
          challenge = `<div class="typed-challenge"><strong>Следующая самостоятельная проверка пока не открыта</strong><p>Понимание на слух уже зафиксировано. Письменные реплики и рабочее взаимодействие станут доступны не раньше чем через 24 часа, ${escapeHtml(available)} по времени Нью-Йорка.</p></div>`;
        } else if (attempt.stage === "reception") {
          const heard = heardLessonStimuli.has(lessonStimulusKey(item, orderedIndex, attempt.variant));
          challenge = `<div class="typed-challenge"><strong>Понимание на слух, ${attempt.receptionIndex + 1} из ${attempt.order.length}</strong><p>Прослушайте фразу. Текст ответа скрыт.</p><button class="audio-button lesson-reception-audio" type="button" data-phrase-index="${orderedIndex + 1}">${heard ? "Прослушать еще раз" : "Прослушать фразу"}</button><label class="response-label" for="lesson-response-${escapeHtml(item.id)}">Кратко передайте смысл по-русски</label><textarea class="typed-response lesson-response" id="lesson-response-${escapeHtml(item.id)}" autocomplete="off" ${heard ? "" : "disabled"}></textarea><div class="button-row"><button class="button primary lesson-check" type="button" ${heard ? "" : "disabled"}>Проверить смысл</button><button class="button secondary lesson-reveal" type="button">Показать примеры</button></div><p class="evaluation-status" role="status" tabindex="-1">${escapeHtml(attempt.feedback || "")}</p></div>`;
        } else if (attempt.stage === "production") {
          challenge = `<div class="typed-challenge"><strong>Письменная реплика, ${attempt.productionIndex + 1} из ${attempt.order.length}</strong><p>${escapeHtml(meaning || item.goal)}</p><label class="response-label" for="lesson-response-${escapeHtml(item.id)}">Напишите английскую реплику до показа примера</label><textarea class="typed-response lesson-response" id="lesson-response-${escapeHtml(item.id)}" lang="en-US" autocomplete="off"></textarea><div class="button-row"><button class="button primary lesson-check" type="button">Проверить реплику</button><button class="button secondary lesson-reveal" type="button">Показать примеры</button></div><p class="evaluation-status" role="status" tabindex="-1">${escapeHtml(attempt.feedback || "")}</p></div>`;
        } else {
          const interaction = lessonInteractionContract(item, phrases);
          challenge = `<div class="typed-challenge"><strong>Рабочее взаимодействие</strong><p>${escapeHtml(interaction.promptRu)}</p><p lang="en-US"><strong>Собеседник:</strong> ${escapeHtml(interaction.promptEn)}</p><label class="response-label" for="lesson-response-${escapeHtml(item.id)}">Ответьте собеседнику по-английски</label><textarea class="typed-response lesson-response" id="lesson-response-${escapeHtml(item.id)}" lang="en-US" autocomplete="off"></textarea><div class="button-row"><button class="button primary lesson-check" type="button">Проверить взаимодействие</button><button class="button secondary lesson-reveal" type="button">Показать примеры</button></div><p class="evaluation-status" role="status" tabindex="-1">${escapeHtml(attempt.feedback || "")}</p></div>`;
        }
      }
      return `<article class="lesson-card ${isDone("lessons", item.id) ? "completed" : ""} ${open ? "open" : ""}" data-lesson-id="${escapeHtml(item.id)}">
        <button class="lesson-head" data-lesson-toggle="${escapeHtml(item.id)}" aria-expanded="${open}"><span class="lesson-number">${index + 1}</span><div><h3>${escapeHtml(item.titleRu || item.title)}</h3><p>${escapeHtml(item.goal)}</p></div></button>
        <div class="lesson-body" ${open ? "" : "hidden"}>${lessonStudyPanel(item)}${challenge}${finished || attempt?.revealed ? phrases.map((phrase, modelIndex) => `<div class="lesson-phrase"><span lang="en-US">${escapeHtml(phrase)}</span><button class="icon-button lesson-audio" data-text="${escapeHtml(phrase)}" data-phrase-index="${modelIndex + 1}">Слушать</button></div>`).join("") : ""}<div class="lesson-rubric"><span>${escapeHtml(masteryLabel("lessons", item.id))}</span><p>Для полного результата нужны две самостоятельные попытки с интервалом не менее 24 часов.</p></div></div>
      </article>`;
    }).join("");
    if (focusedLessonId) requestAnimationFrame(() => document.querySelector(`[data-lesson-id="${CSS.escape(focusedLessonId)}"]`)?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }));
  }

  function checkLessonResponse(card) {
    const item = lessonById(card?.dataset.lessonId);
    const input = card?.querySelector(".lesson-response");
    if (!item || !input) return;
    const attempt = lessonAttempt(item);
    const phrases = lessonPhrases(item);
    const meanings = lessonMeanings(item);
    const response = input.value.trim();
    if (attempt.stage === "reception") {
      const phraseIndex = attempt.order[attempt.receptionIndex];
      const key = lessonStimulusKey(item, phraseIndex, attempt.variant);
      if (!heardLessonStimuli.has(key)) return;
      const evaluation = evaluateLessonMeaning(response, meanings[phraseIndex] || item.goal);
      if (!evaluation.pass) {
        attempt.feedback = evaluation.feedback;
        finalizeLessonAttempt(item, attempt, evaluation);
      } else {
        attempt.reception.push({ phraseIndex, response, evaluation, stimulusExposed: true });
        heardLessonStimuli.delete(key);
        attempt.receptionIndex += 1;
        if (attempt.receptionIndex >= attempt.order.length) {
          const completed = { pass: true, score: 1, evaluator: "lesson-reception-blueprint", feedback: `Вы правильно поняли ${attempt.reception.length} аудиофразы. Письменные реплики и рабочее взаимодействие проверяются отдельно.`, matched: ["reception-before-production-cues"], missing: [] };
          finalizeLessonAttempt(item, attempt, completed);
        } else {
          attempt.stage = "reception";
          attempt.feedback = "Смысл подтвержден. Прослушайте следующую реплику.";
        }
      }
    } else if (attempt.stage === "production") {
      const phraseIndex = attempt.order[attempt.productionIndex];
      const evaluation = Eval.evaluateLesson(item, response, phrases[phraseIndex]);
      if (!evaluation.pass) {
        attempt.feedback = evaluation.feedback;
        finalizeLessonAttempt(item, attempt, evaluation);
      } else {
        attempt.production.push({ phraseIndex, response, evaluation });
        attempt.productionIndex += 1;
        attempt.stage = attempt.productionIndex >= attempt.order.length ? "interaction" : "production";
        attempt.feedback = attempt.stage === "interaction" ? "Все целевые реплики воспроизведены до аудио. Теперь ответьте на рабочий запрос." : "Реплика подтверждена. Продолжите без показа модели.";
      }
    } else if (attempt.stage === "interaction") {
      const interaction = lessonInteractionContract(item, phrases);
      const evaluation = interaction.conditionSpecific
        ? Eval.evaluateSemanticResponse({ response, prompt: interaction.promptEn, expected: interaction.expected, slots: interaction.slots, rubric: interaction.rubric })
        : Eval.evaluateLessonAssertionSet(item, response, interaction.requiredResponses, { prompt: interaction.promptEn, rubric: interaction.rubric });
      attempt.interaction = { response, evaluation };
      if (!evaluation.pass) {
        attempt.feedback = evaluation.feedback;
        finalizeLessonAttempt(item, attempt, evaluation);
      } else {
        const completed = { pass: true, score: 1, evaluator: "lesson-production-interaction-blueprint", feedback: `Подтверждены ${attempt.production.length} письменных реплик и рабочее взаимодействие без аудиоподсказки. Понимание на слух проверяется отдельной попыткой.`, matched: ["production-before-model", "workplace-interaction"], missing: [] };
        finalizeLessonAttempt(item, attempt, completed);
      }
    }
    renderLessons();
    requestAnimationFrame(() => document.querySelector(`[data-lesson-id="${CSS.escape(item.id)}"] .evaluation-status`)?.focus());
  }

  function renderPracticeHub() {
    const node = $("#error-hub-count");
    if (node) node.textContent = `Ошибок: ${errorItems().length}`;
  }

  const DIAGNOSTIC_FORM_VERSION = String(DATA.diagnosticFormVersion || "");
  const DIAGNOSTIC_ITEMS = [
    { form: "A", id: "a-vocabulary-lane", category: "vocabulary", title: "Словарь", prompt: "Что значит inspection lane?", options: [{ text: "Полоса инспекции", correct: true }, { text: "Зона отдыха" }, { text: "Погрузочная рампа" }] },
    { form: "A", id: "a-vocabulary-shoulder", category: "vocabulary", title: "Словарь", prompt: "Что значит shoulder в дорожной команде?", options: [{ text: "Обочина", correct: true }, { text: "Сцепное устройство" }, { text: "Весовой талон" }] },
    { form: "A", id: "a-vocabulary-oos", category: "vocabulary", title: "Словарь", prompt: "Что значит out-of-service order?", options: [{ text: "Запрет эксплуатации до устранения указанного условия", correct: true }, { text: "Заказ на ремонт" }, { text: "Разрешение на объезд" }] },
    { form: "A", id: "a-vocabulary-clearance", category: "vocabulary", title: "Словарь", prompt: "Что значит clearance для машины?", options: [{ text: "Безопасный габаритный зазор", correct: true }, { text: "Платная парковка" }, { text: "Срок действия прав" }] },
    { form: "A", id: "a-vocabulary-seal", category: "vocabulary", title: "Словарь", conditions: ["cargo"], prompt: "Что сообщает фраза The seal is intact?", options: [{ text: "Пломба не повреждена", correct: true }, { text: "Ось перегружена" }, { text: "Документ просрочен" }] },

    { form: "A", id: "a-listening-lane", category: "listening", title: "Понимание на слух", stimulusVersion: "a-pull-inspection-lane-v1", prompt: "Прослушайте. Какое действие требуется?", audio: "Pull into the inspection lane.", options: [{ text: "Заехать на полосу инспекции", correct: true }, { text: "Показать страховку" }, { text: "Открыть двери прицепа" }] },
    { form: "A", id: "a-listening-right", category: "listening", title: "Понимание на слух", stimulusVersion: "a-stay-cab-v1", prompt: "Прослушайте. Что нужно делать?", audio: "Stay in the cab until I tell you to exit.", options: [{ text: "Оставаться в кабине до команды выйти", correct: true }, { text: "Сразу выйти из кабины" }, { text: "Проехать к воротам" }] },
    { form: "A", id: "a-listening-time", category: "listening", title: "Дата и время", kind: "productive", stimulusVersion: "a-appointment-0930-aug20-v1", listeningQuestionId: "question:when-is-your-delivery-appointment", prompt: "Прослушайте и введите дату и время встречи по-английски.", audio: "My appointment is at nine thirty A.M. on August twentieth.", model: "My appointment is at 9:30 a.m. on August 20.", slots: [{ name: "appointment-time", type: "time", display: "9:30 a.m.", spoken: "nine thirty A.M." }, { name: "appointment-date", type: "date", display: "August 20", spoken: "August twentieth" }], rubric: { minTokens: 6, requiredGroups: [["appointment"], ["at"], ["on"]] } },
    { form: "A", id: "a-listening-weight", category: "listening", title: "Вес", kind: "productive", stimulusVersion: "a-weight-38200-v1", profiles: ["tractor"], equipment: ["tractor-trailer", "dry-van"], conditions: ["trip-specific"], listeningQuestionId: "question:what-is-the-listed-weight", prompt: "Прослушайте и введите названный вес с единицей.", audio: "The listed weight is thirty-eight thousand two hundred pounds.", model: "The listed weight is 38,200 pounds.", slots: [{ name: "listed-weight", type: "weight", display: "38,200 pounds", spoken: "thirty-eight thousand two hundred pounds" }], rubric: { minTokens: 5, requiredGroups: [["listed"], ["weight"], ["pounds"]] } },
    { form: "A", id: "a-listening-pressure", category: "listening", title: "Давление", kind: "productive", stimulusVersion: "a-pressure-60-v1", listeningQuestionId: "question:tell-me-when-the-low-air-warning-activates", profiles: ["tractor"], equipment: ["tractor-trailer", "air-brakes"], prompt: "Прослушайте учебное показание и введите давление с единицей.", audio: "The low-air warning activated at sixty P S I.", model: "The low-air warning activated at 60 psi.", slots: [{ name: "pressure", type: "pressure", display: "60 psi", spoken: "sixty P S I" }], rubric: { minTokens: 6, requiredGroups: [["low"], ["air"], ["warning"], ["psi"]] } },

    { form: "A", id: "a-elp-origin", category: "elp", title: "Короткий ответ", kind: "productive", scenarioFactsRu: "Учебный маршрут: вы выехали из Dallas, Texas.", prompt: "Учебный маршрут: вы выехали из Dallas, Texas. Officer: Where are you coming from?", model: "I left Dallas, Texas.", rubric: { minTokens: 4, requiredGroups: [["left", "coming", "from"], ["dallas"], ["texas"]] } },
    { form: "A", id: "a-elp-destination", category: "elp", title: "Короткий ответ", kind: "productive", scenarioFactsRu: "Учебный маршрут: пункт назначения Tulsa, Oklahoma.", prompt: "Учебный маршрут: пункт назначения Tulsa, Oklahoma. Officer: Where are you headed?", model: "I am headed to Tulsa, Oklahoma.", rubric: { minTokens: 4, requiredGroups: [["headed", "going"], ["tulsa"], ["oklahoma"]] } },
    { form: "A", id: "a-elp-carrier", category: "elp", title: "Короткий ответ", kind: "productive", scenarioFactsRu: "Учебный работодатель: Training Carrier.", prompt: "Учебный работодатель: Training Carrier. Officer: Who is your employer?", model: "Training Carrier is my employer.", rubric: { minTokens: 4, requiredGroups: [["training"], ["carrier"], ["employer", "work", "drive"]] } },
    { form: "A", id: "a-elp-cargo", category: "elp", title: "Короткий ответ", kind: "productive", scenarioKey: "profile-cargo", prompt: "Officer: What are you hauling?", model: "I am hauling the training cargo.", rubric: { minTokens: 4 } },
    { form: "A", id: "a-elp-clarify", category: "elp", title: "Уточнение", prompt: "Вы не поняли вопрос. Какой ответ поддерживает безопасный диалог?", options: [{ text: "Could you repeat that more slowly, please?", correct: true }, { text: "I will guess and move." }, { text: "I refuse to answer." }] },

    { form: "A", id: "a-inspection-oos", category: "inspection", title: "Безопасное действие", prompt: "Сотрудник сообщил, что машина out of service. Что делать?", options: [{ text: "Подтвердить и не двигать машину до устранения указанного условия и разрешения продолжить", correct: true }, { text: "Доехать до ближайшей мастерской" }, { text: "Продолжить рейс после звонка диспетчеру" }] },
    { form: "A", id: "a-inspection-insurance", category: "inspection", title: "Документ", prompt: "Сотрудник просит proof of insurance. Какой ответ точнее?", options: [{ text: "Here is the proof of insurance.", correct: true }, { text: "Here are all papers in the cab." }, { text: "The BOL replaces insurance." }] },
    { form: "A", id: "a-inspection-command", category: "inspection", title: "Подтверждение команды", kind: "productive", prompt: "Inspector: Set the parking brake and turn off the engine. Напишите подтверждение после выполнения.", model: "The parking brake is set, and the engine is off.", rubric: { minTokens: 6, requiredGroups: [["parking"], ["brake"], ["engine"], ["off"]] } },
    { form: "A", id: "a-inspection-lane", category: "inspection", title: "Подтверждение команды", kind: "productive", prompt: "Inspector: Enter the inspection lane and wait. Напишите безопасное подтверждение.", model: "I will enter the inspection lane and wait.", rubric: { minTokens: 6, requiredGroups: [["enter", "pull"], ["inspection"], ["lane"], ["wait"]] } },
    { form: "A", id: "a-inspection-cdl", category: "inspection", title: "Документ", conditions: ["cdl-required"], prompt: "Сотрудник просит CDL. Какой ответ точнее?", options: [{ text: "Here is my commercial driver's license.", correct: true }, { text: "Here are all documents." }, { text: "My insurance replaces the license." }] },

    { form: "B", id: "b-vocabulary-detour", category: "vocabulary", title: "Словарь", prompt: "Что значит detour?", options: [{ text: "Объезд", correct: true }, { text: "Запрет эксплуатации" }, { text: "Осевая нагрузка" }] },
    { form: "B", id: "b-vocabulary-reweigh", category: "vocabulary", title: "Словарь", prompt: "Что значит reweigh?", options: [{ text: "Повторно взвеситься", correct: true }, { text: "Перецепить прицеп" }, { text: "Перестроиться" }] },
    { form: "B", id: "b-vocabulary-securement", category: "vocabulary", title: "Словарь", prompt: "Что значит cargo securement?", options: [{ text: "Крепление груза", correct: true }, { text: "Страхование груза" }, { text: "Пломбирование топлива" }] },
    { form: "B", id: "b-vocabulary-merge", category: "vocabulary", title: "Словарь", prompt: "Что значит merge в дорожной команде?", options: [{ text: "Безопасно влиться в поток", correct: true }, { text: "Отсоединить прицеп" }, { text: "Выключить двигатель" }] },
    { form: "B", id: "b-vocabulary-overage", category: "vocabulary", title: "Словарь", conditions: ["cargo"], prompt: "Что значит overage в документах груза?", options: [{ text: "Излишек относительно документов", correct: true }, { text: "Поврежденная упаковка" }, { text: "Опоздание" }] },

    { form: "B", id: "b-listening-cone", category: "listening", title: "Понимание на слух", stimulusVersion: "b-stop-white-line-v1", prompt: "Прослушайте. Где нужно остановиться?", audio: "Stop at the white line.", options: [{ text: "У белой линии", correct: true }, { text: "У ворот" }, { text: "На обочине" }] },
    { form: "B", id: "b-listening-route", category: "listening", title: "Понимание вопроса", stimulusVersion: "b-final-destination-v1", prompt: "Прослушайте. О чем спрашивает сотрудник?", audio: "What is your final destination?", options: [{ text: "Каков конечный пункт назначения", correct: true }, { text: "Сколько топлива осталось" }, { text: "Где находится страховка" }] },
    { form: "B", id: "b-listening-time", category: "listening", title: "Оставшееся время", kind: "productive", stimulusVersion: "b-duration-4h18-v1", conditions: ["eld-or-rods-applicable"], listeningQuestionId: "question:how-many-driving-hours-do-you-have-left", prompt: "Прослушайте и введите оставшуюся длительность по-английски.", audio: "I have four hours and eighteen minutes left.", model: "I have four hours and eighteen minutes left.", slots: [{ name: "duration-hours", type: "duration-hours", display: "4 hours", spoken: "four hours" }, { name: "duration-minutes", type: "duration-minutes", display: "18 minutes", spoken: "eighteen minutes" }], rubric: { minTokens: 6, requiredGroups: [["hours"], ["minutes"], ["left"]] } },
    { form: "B", id: "b-listening-oos", category: "listening", title: "Условие запрета", kind: "productive", stimulusVersion: "b-oos-rest-complete-v1", listeningQuestionId: "question:the-driver-is-out-of-service-until-oos-condition", prompt: "Прослушайте и введите условие окончания запрета.", audio: "Understood. I will remain out of service until the required rest period is complete.", model: "I will remain out of service until the required rest period is complete.", slots: [{ name: "oos-condition", type: "condition", display: "required rest period is complete", spoken: "required rest period is complete" }], rubric: { minTokens: 8, requiredGroups: [["out"], ["service"], ["rest"], ["complete"]] } },
    { form: "B", id: "b-listening-pressure", category: "listening", title: "Команда тормозов", stimulusVersion: "b-release-tractor-brakes-v1", profiles: ["tractor"], equipment: ["tractor-trailer", "air-brakes"], prompt: "Прослушайте. Какое действие требуется?", audio: "Release the tractor brakes and keep the trailer brakes set.", options: [{ text: "Отпустить тормоза тягача и оставить тормоза прицепа включенными", correct: true }, { text: "Отпустить все тормоза" }, { text: "Оставить все тормоза включенными" }] },

    { form: "B", id: "b-elp-origin", category: "elp", title: "Короткий ответ", kind: "productive", scenarioFactsRu: "Учебный маршрут: вы выехали из Phoenix, Arizona.", prompt: "Учебный маршрут: вы выехали из Phoenix, Arizona. Officer: Where did you start this trip?", model: "I started this trip in Phoenix, Arizona.", rubric: { minTokens: 5, requiredGroups: [["started", "left"], ["phoenix"], ["arizona"]] } },
    { form: "B", id: "b-elp-destination", category: "elp", title: "Короткий ответ", kind: "productive", scenarioFactsRu: "Учебный маршрут: пункт назначения Albuquerque, New Mexico.", prompt: "Учебный маршрут: пункт назначения Albuquerque, New Mexico. Officer: What is your destination?", model: "My destination is Albuquerque, New Mexico.", rubric: { minTokens: 5, requiredGroups: [["destination", "headed", "going"], ["albuquerque"], ["new"], ["mexico"]] } },
    { form: "B", id: "b-elp-employer", category: "elp", title: "Короткий ответ", kind: "productive", scenarioFactsRu: "Учебный работодатель: Training Carrier.", prompt: "Учебный работодатель: Training Carrier. Officer: Who do you work for?", model: "I work for Training Carrier.", rubric: { minTokens: 4, requiredGroups: [["work", "drive", "employer"], ["training"], ["carrier"]] } },
    { form: "B", id: "b-elp-cargo", category: "elp", title: "Короткий ответ", kind: "productive", scenarioKey: "profile-cargo", prompt: "Officer: What cargo are you carrying?", model: "I am carrying the training cargo.", rubric: { minTokens: 4 } },
    { form: "B", id: "b-elp-duty", category: "elp", title: "Короткий ответ", kind: "productive", scenarioFactsRu: "Учебный статус сейчас: on duty, not driving.", prompt: "Учебный статус сейчас: on duty, not driving. Officer: What is your current duty status?", model: "I am on duty, not driving.", rubric: { minTokens: 5, requiredGroups: [["on"], ["duty"], ["not"], ["driving"]] } },

    { form: "B", id: "b-inspection-repeat", category: "inspection", title: "Безопасная коммуникация", prompt: "Команда не понятна. Какой ответ подходит?", options: [{ text: "Could you repeat that more slowly, please?", correct: true }, { text: "I will move and guess." }, { text: "I refuse to answer." }] },
    { form: "B", id: "b-inspection-hazards", category: "inspection", title: "Поломка на дороге", prompt: "Машина остановилась на проезжей части. Какой первый шаг?", options: [{ text: "Немедленно включить аварийную сигнализацию", correct: true }, { text: "Сначала позвонить диспетчеру" }, { text: "Подождать десять минут в кабине" }] },
    { form: "B", id: "b-inspection-registration", category: "inspection", title: "Документ", prompt: "Сотрудник просит vehicle registration. Какой ответ точнее?", options: [{ text: "Here is the vehicle registration.", correct: true }, { text: "Here are all papers." }, { text: "Insurance replaces registration." }] },
    { form: "B", id: "b-inspection-wait", category: "inspection", title: "Подтверждение команды", kind: "productive", prompt: "Inspector: Stop beside the cone and wait for my signal. Напишите подтверждение.", model: "I will stop beside the cone and wait for your signal.", rubric: { minTokens: 8, requiredGroups: [["stop"], ["cone"], ["wait"], ["signal"]] } },
    { form: "B", id: "b-inspection-securement", category: "inspection", title: "Крепление груза", conditions: ["cargo-securement"], prompt: "Когда нужно проверить крепление после начала движения?", options: [{ text: "В пределах первых 50 miles, затем при применимых событиях и интервалах", correct: true }, { text: "Только в конце рейса" }, { text: "Только после требования инспектора" }] },
  ];

  function materializeDiagnosticItem(item) {
    const inventory = DIAGNOSTIC_CONTRACT_BY_ID.get(item.id);
    const materialized = {
      ...item,
      recoveryTargetId: inventory.recoveryTargetId,
      stimulusVersion: item.stimulusVersion || inventory.stimulusVersion,
    };
    if (item.scenarioKey !== "profile-cargo") return materialized;
    const contract = DATA.diagnosticProfileCargoMaterializations || {};
    const profile = effectiveEquipmentProfile();
    const cargo = contract.profiles?.[profile];
    if (!cargo) return { ...materialized, applicabilityConflict: "missing-profile-cargo-contract" };
    return {
      ...materialized,
      prompt: `${cargo.visibleContextRu} ${item.prompt}`,
      scenarioFactsRu: cargo.visibleContextRu,
      model: cargo.model,
      slots: cargo.slots,
      rubric: { ...(item.rubric || {}), ...(cargo.rubric || {}) },
      stimulusVersion: `${item.id}-${contract.version}-${profile}`,
    };
  }

  function buildDiagnosticContract() {
    const inventory = Array.isArray(DATA.diagnosticItemInventory) ? DATA.diagnosticItemInventory : [];
    const targets = Array.isArray(DATA.diagnosticRecoveryTargets) ? DATA.diagnosticRecoveryTargets : [];
    const aliases = DATA.diagnosticRecoveryAliases && typeof DATA.diagnosticRecoveryAliases === "object"
      ? DATA.diagnosticRecoveryAliases
      : {};
    const targetIds = new Set(targets.map(item => String(item?.id || "")).filter(Boolean));
    const byId = new Map();
    for (const item of inventory) {
      if (!item?.id || byId.has(item.id)) throw new Error("Diagnostic inventory contains a duplicate or missing item id.");
      if (!targetIds.has(item.recoveryTargetId)) throw new Error(`Diagnostic inventory has an unknown recovery target: ${item.id}.`);
      if (!item.stimulusVersion) throw new Error(`Diagnostic inventory has no stimulus version: ${item.id}.`);
      byId.set(item.id, item);
    }
    if (byId.size !== DIAGNOSTIC_ITEMS.length) throw new Error("Diagnostic inventory does not match the 40-item runtime bank.");
    for (const item of DIAGNOSTIC_ITEMS) {
      const contract = byId.get(item.id);
      if (!contract || contract.form !== item.form || contract.category !== item.category) {
        throw new Error(`Diagnostic inventory metadata does not match runtime: ${item.id}.`);
      }
      if (item.stimulusVersion && contract.stimulusVersion !== item.stimulusVersion) {
        throw new Error(`Diagnostic stimulus version does not match runtime: ${item.id}.`);
      }
      if (aliases[item.id] !== contract.recoveryTargetId) {
        throw new Error(`Diagnostic recovery alias does not match runtime: ${item.id}.`);
      }
    }
    return byId;
  }

  const DIAGNOSTIC_CONTRACT_BY_ID = buildDiagnosticContract();

  function diagnosticJournalId(item) {
    const targetId = diagnosticCorrectionMode && diagnosticCorrectionTargetId
      ? diagnosticCorrectionTargetId
      : item.recoveryTargetId;
    return targetId ? `diagnostic-${targetId}` : null;
  }

  function diagnosticEvidenceVariant(item) {
    return `diagnostic-${item.form}-${item.id}-${item.stimulusVersion}`;
  }

  function diagnosticRecoveryTargetId(value) {
    return String(value?.id || value || "").replace(/^diagnostic-/, "");
  }

  function diagnosticRecoveryCategory(targetId) {
    const normalized = diagnosticRecoveryTargetId(targetId);
    return (DATA.diagnosticRecoveryTargets || []).find(item => item.id === normalized)?.category || null;
  }

  function diagnosticCorrectionItem(record) {
    const targetId = diagnosticRecoveryTargetId(record);
    const category = diagnosticRecoveryCategory(targetId);
    if (!category) return null;
    const evidence = Array.isArray(record?.evidence) ? [...record.evidence] : [];
    evidence.sort((left, right) => Number(new Date(right?.at || 0)) - Number(new Date(left?.at || 0)));
    const latestVariant = String(evidence[0]?.variant || "");
    const latestForm = latestVariant.match(/^diagnostic-([AB])-/)?.[1] || null;
    const usedVariants = new Set(evidence.map(item => item?.variant).filter(Boolean));
    const candidates = DIAGNOSTIC_ITEMS
      .map(materializeDiagnosticItem)
      .filter(item => item.category === category && applies(item));
    candidates.sort((left, right) => {
      const leftVariant = diagnosticEvidenceVariant(left);
      const rightVariant = diagnosticEvidenceVariant(right);
      const leftScore = [
        latestForm && left.form !== latestForm ? 0 : 1,
        usedVariants.has(leftVariant) ? 1 : 0,
        left.recoveryTargetId === targetId ? 0 : 1,
      ];
      const rightScore = [
        latestForm && right.form !== latestForm ? 0 : 1,
        usedVariants.has(rightVariant) ? 1 : 0,
        right.recoveryTargetId === targetId ? 0 : 1,
      ];
      for (let index = 0; index < leftScore.length; index += 1) {
        if (leftScore[index] !== rightScore[index]) return leftScore[index] - rightScore[index];
      }
      return left.id.localeCompare(right.id);
    });
    return candidates[0] || null;
  }

  function diagnosticAudioClip(item) {
    const driverAnswer = item?.listeningQuestionId ? LISTENING_DATA.profiles?.[item.listeningQuestionId]?.driverAnswer : null;
    if (driverAnswer?.roadside) {
      return { path: driverAnswer.roadside, text: driverAnswer.spokenText || item.audio, role: driverAnswer.role || "driver", profile: "roadside" };
    }
    const local = textAudio(item?.audio, "inspector", "roadside") || textAudio(item?.audio, "driver", "roadside");
    return local
      ? { path: local, text: item.audio, role: textAudio(item.audio, "inspector", "roadside") ? "inspector" : "driver", profile: "roadside" }
      : null;
  }

  function resetDiagnosticSession(targetId = null) {
    diagnosticIndex = 0;
    diagnosticAnswers = [];
    diagnosticFeedback = null;
    diagnosticPersistenceRetry = null;
    diagnosticStimulusExposure.clear();
    diagnosticSeed = (Date.now() + Math.floor(Math.random() * 1000000)) >>> 0;
    const bank = DIAGNOSTIC_ITEMS.map(materializeDiagnosticItem);
    const target = targetId ? bank.find(item => item.id === targetId) : null;
    if (targetId && (!target || !applies(target))) {
      diagnosticPrepared = [];
      diagnosticProductiveShown = false;
      return;
    }
    const form = target?.form || (Number(state.diagnosticFormCursor || 0) % 2 === 0 ? "A" : "B");
    if (!target) state.diagnosticFormCursor = Number(state.diagnosticFormCursor || 0) + 1;
    diagnosticPrepared = Core.materializeDiagnosticForm(bank, {
      form,
      seed: diagnosticSeed,
      formVersion: DIAGNOSTIC_FORM_VERSION,
      context: applicabilityContext(),
      requiredItemId: target?.id,
    });
    diagnosticProductiveShown = false;
  }

  function diagnosticResultNode(scores, recommendation) {
    const wrapper = document.createElement("div");
    wrapper.className = "diagnostic-result";
    const title = document.createElement("strong");
    title.textContent = "Маршрут готов";
    const summary = document.createElement("p");
    summary.textContent = `Словарь: ${Number(scores.vocabulary || 0)}%. Понимание на слух: ${Number(scores.listening || 0)}%. ELP: ${Number(scores.elp || 0)}%. Инспекция: ${Number(scores.inspection || 0)}%.`;
    const note = document.createElement("p");
    note.textContent = recommendation || "Начните с короткого смешанного маршрута.";
    const actions = document.createElement("div");
    actions.className = "button-row";
    actions.innerHTML = '<button class="button primary" data-go="dashboard">Открыть Сегодня</button><button class="button secondary" data-diagnostic-restart>Пройти еще раз</button>';
    wrapper.append(title, summary, note, actions);
    return wrapper;
  }

  function renderDiagnostic() {
    const node = $("#diagnostic-content");
    if (state.diagnostic?.completedAt && artifactMatchesCurrentContext(state.diagnostic) && !diagnosticCorrectionMode) {
      const scores = state.diagnostic.scores || {};
      node.replaceChildren(diagnosticResultNode(scores, state.diagnostic.recommendation));
      return;
    }
    if (!diagnosticPrepared.length) resetDiagnosticSession();
    const item = diagnosticPrepared[diagnosticIndex];
    if (!item) {
      const rawScores = Core.diagnosticScores(diagnosticPrepared, diagnosticAnswers);
      const blueprint = Core.diagnosticBlueprint(diagnosticPrepared, 3);
      const incompleteConstructs = Object.entries(rawScores).filter(([, value]) => Number(value.answered || 0) !== 3).map(([category]) => category);
      if (!blueprint.valid || incompleteConstructs.length) {
        node.innerHTML = `<div class="diagnostic-feedback wrong" role="status" tabindex="-1"><strong>Диагностика не завершена.</strong><p>Недостаточно независимых заданий: ${escapeHtml(incompleteConstructs.join(", "))}. Результат не сохранен.</p><button class="button primary" data-diagnostic-restart>Начать полную форму заново</button></div>`;
        requestAnimationFrame(() => node.querySelector("[role=status]")?.focus());
        return;
      }
      const scores = Object.fromEntries(Object.entries(rawScores).map(([key, value]) => [key, value.possible ? Math.round(value.earned / value.possible * 100) : 0]));
      const route = Core.diagnosticRecommendation(rawScores);
      const previous = state.diagnostic;
      state.diagnostic = {
        completedAt: new Date().toISOString(),
        verified: true,
        selfScored: false,
        form: diagnosticPrepared[0]?.form || "A",
        formVersion: DIAGNOSTIC_FORM_VERSION,
        blueprint: blueprint.counts,
        scores,
        weakest: route.weakest,
        recommendation: route.recommendation,
        items: diagnosticAnswers.map(answer => ({ ...answer })),
        profile: state.profile,
        contextKey: currentQualificationContextKey(),
      };
      if (!saveState().ok) {
        state.diagnostic = previous;
        node.innerHTML = '<div class="diagnostic-feedback wrong" role="status"><strong>Результат рассчитан, но не сохранен.</strong><p>Освободите место в локальном хранилище и повторите сохранение. Диагностика не отмечена завершенной.</p><button class="button primary" data-diagnostic-save-retry>Повторить сохранение</button></div>';
        requestAnimationFrame(() => $("[data-diagnostic-save-retry]")?.focus());
        return;
      }
      renderDiagnostic();
      return;
    }
    const exposed = diagnosticStimulusExposure.has(item.id);
    const locked = Boolean(diagnosticFeedback);
    const audio = item.audio ? `<button class="audio-button light" data-diagnostic-audio>${exposed ? "Прослушать еще раз" : "Прослушать задание"}</button>` : "";
    const retryNotice = diagnosticPersistenceRetry?.itemId === item.id
      ? `<div class="diagnostic-feedback wrong" role="status"><strong>Попытка не сохранена.</strong><p>Ответ и результат удалены. Повторите это же задание.${item.audio ? " Сначала снова полностью прослушайте запись." : ""}</p></div>`
      : "";
    const feedback = locked ? `<div class="diagnostic-feedback ${diagnosticFeedback.evaluation.pass ? "correct" : "wrong"}" role="status"><strong>${diagnosticFeedback.evaluation.pass ? "Ответ засчитан" : "Ответ не засчитан"}</strong><p>${escapeHtml(diagnosticFeedback.evaluation.feedback)}</p>${item.kind === "productive" ? `<p><strong>Учебная модель после scoring:</strong> <span lang="en-US">${escapeHtml(item.model)}</span></p>` : ""}<button class="button primary" data-diagnostic-next>${diagnosticIndex === diagnosticPrepared.length - 1 ? "Показать маршрут" : "Следующее задание"}</button></div>` : "";
    if (item.kind === "productive") {
      node.innerHTML = `<div class="diagnostic-question"><span>${diagnosticIndex + 1} из ${diagnosticPrepared.length} · форма ${escapeHtml(item.form)} · ${escapeHtml(item.title)}</span><h3>${escapeHtml(item.prompt)}</h3>${audio}${retryNotice}<label class="sr-only" for="diagnostic-response">Ваш ответ</label><textarea class="diagnostic-response" id="diagnostic-response" lang="en-US" autocomplete="off" ${locked || item.audio && !exposed ? "disabled" : ""}>${escapeHtml(diagnosticFeedback?.response || "")}</textarea><button class="button primary" data-diagnostic-check ${locked || item.audio && !exposed ? "disabled" : ""}>Проверить самостоятельный ответ</button>${feedback}</div>`;
      return;
    }
    node.innerHTML = `<div class="diagnostic-question"><span>${diagnosticIndex + 1} из ${diagnosticPrepared.length} · форма ${escapeHtml(item.form)} · ${escapeHtml(item.title)}</span><h3>${escapeHtml(item.prompt)}</h3>${audio}${retryNotice}<div class="diagnostic-options">${item.options.map((option, index) => `<button data-diagnostic-answer="${index}" ${locked || item.audio && !exposed ? "disabled" : ""}>${escapeHtml(option.text)}</button>`).join("")}</div>${feedback}</div>`;
  }

  function rollbackDiagnosticItemMutation(item) {
    state = persistenceBoundary.rollback();
    delete diagnosticAnswers[diagnosticIndex];
    while (diagnosticAnswers.length && !Object.prototype.hasOwnProperty.call(diagnosticAnswers, diagnosticAnswers.length - 1)) diagnosticAnswers.length -= 1;
    diagnosticStimulusExposure.delete(item.id);
    diagnosticFeedback = null;
    diagnosticPersistenceRetry = { itemId: item.id };
    renderDiagnostic();
    requestAnimationFrame(() => {
      const target = item.audio ? $("[data-diagnostic-audio]") : $("#diagnostic-response") || $("[data-diagnostic-answer]");
      target?.focus();
    });
  }

  function finishDiagnosticItem(item, answer, evaluation) {
    const answerRecord = {
      itemId: item.id,
      category: item.category,
      form: item.form,
      formVersion: item.formVersion || DIAGNOSTIC_FORM_VERSION,
      stimulusVersion: item.stimulusVersion,
      response: String(answer ?? "").slice(0, 400),
      responseHash: responseHash(String(answer ?? "")),
      score: Number(evaluation.score || 0),
      evaluator: evaluation.evaluator,
      scoreEvidence: {
        pass: evaluation.pass === true,
        score: Number(evaluation.score || 0),
        matched: Array.isArray(evaluation.matched) ? evaluation.matched.slice(0, 20) : [],
        missing: Array.isArray(evaluation.missing) ? evaluation.missing.slice(0, 20) : [],
      },
      stimulusExposed: !item.audio || diagnosticStimulusExposure.has(item.id),
    };
    const feedback = { response: typeof answer === "string" ? answer : "", evaluation };
    const errorId = diagnosticJournalId(item);
    const evidenceVariant = diagnosticEvidenceVariant(item);
    let journalMutationOk = Boolean(errorId);
    if (evaluation.pass) {
      const recovery = journalMutationOk
        ? advanceErrorRecovery("diagnostic", errorId, `diagnostic-${item.category}`, evaluation, evidenceVariant, String(answer))
        : { matched: false };
      if (diagnosticCorrectionMode && !recovery.matched) journalMutationOk = false;
      if (journalMutationOk) recordErrorDailyCompletion(recovery, evidenceVariant);
    } else {
      journalMutationOk = journalMutationOk && addErrorItem("diagnostic", errorId, item.prompt, evaluation.feedback, `diagnostic-${item.category}`, evaluation.missing?.[0] || item.category);
      if (journalMutationOk) {
        const recovery = advanceErrorRecovery("diagnostic", errorId, `diagnostic-${item.category}`, evaluation, evidenceVariant, String(answer));
        journalMutationOk = recovery.matched;
      }
    }
    if (!journalMutationOk) {
      rollbackDiagnosticItemMutation(item);
      return;
    }
    const committed = window.TruckAppPersistence.commitDiagnosticAttempt({
      answers: diagnosticAnswers,
      index: diagnosticIndex,
      answerRecord,
      feedback,
      stimulusExposure: diagnosticStimulusExposure,
      itemId: item.id,
      commit: () => saveState(),
    });
    diagnosticFeedback = committed.feedback;
    diagnosticPersistenceRetry = committed.retryRequired ? { itemId: item.id } : null;
    renderDiagnostic();
    requestAnimationFrame(() => {
      const target = committed.retryRequired
        ? item.audio ? $("[data-diagnostic-audio]") : $("#diagnostic-response") || $("[data-diagnostic-answer]")
        : $("[data-diagnostic-next]");
      target?.focus();
    });
  }

  function renderErrors() {
    const items = errorItems();
    const node = $("#error-list");
    if (!items.length) {
      node.innerHTML = `<div class="empty-state"><strong>Очередь пока пуста.</strong><p>Трудные карточки и ответы с подсказкой появятся здесь автоматически.</p><button class="button primary" data-go="cards">Открыть карточки</button></div>`;
      return;
    }
    node.innerHTML = items.map(item => `<article class="error-item" data-error-type="${escapeHtml(item.type)}" data-error-id="${escapeHtml(item.id)}"><span>${escapeHtml(item.type === "word" ? "Фраза" : item.type === "question" ? "Тренировочное задание" : "Практика")}</span><div><strong>${escapeHtml(errorItemText(item))}</strong><p>${escapeHtml(item.reason || "Нужна новая попытка")}</p></div><button class="button secondary" data-open-error>Повторить</button></article>`).join("");
  }

  function errorItemText(item) {
    if (item.type === "word") return unitForCurrentProfile(item.id)?.word || item.text;
    if (item.type === "question") return assessmentQuestions.find(entry => entry.id === item.id)?.prompt || item.text;
    if (item.type === "branching") {
      const index = Math.max(0, Number(item.id.replace("branch-", "")) || 0);
      return BRANCHING_SCENARIOS[index]?.title || item.text;
    }
    if (item.type === "diagnostic") {
      return item.text || diagnosticCorrectionItem(item)?.prompt || "Диагностическое задание";
    }
    return item.text;
  }

  function openErrorItem(item, groupWords = false) {
    if (!item) {
      go("cards");
      return;
    }
    if (item.type === "word") {
      focusedCardIds = groupWords ? errorItems().filter(entry => entry.type === "word").slice(0, 5).map(entry => entry.id) : [item.id];
      cardIndex = 0;
      go("cards");
      return;
    }
    if (item.type === "question") {
      focusedQuestionIds = [item.id];
      questionIndex = 0;
      questionEvaluations.delete(item.id);
      elpResponseDrafts.delete(item.id);
      elpResponseLocks.delete(item.id);
      questionRevealLocks.delete(item.id);
      inspectionTab = "questions";
      go("inspections");
      return;
    }
    if (item.type === "branching") {
      branchIndex = Math.max(0, Number(item.id.replace("branch-", "")) || 0);
      go("branching");
      return;
    }
    if (item.type === "situation") {
      const index = DATA.situations.findIndex(entry => item.id === entry.id || item.id.startsWith(`${entry.id}-`));
      situationIndex = Math.max(0, index);
      situationEvaluation = null;
      situationTask = null;
      situationMode = "say";
      go("situations");
      return;
    }
    if (item.type === "sign") {
      focusedSignIds = [item.id];
      signFilter = "all";
      signStatus = "all";
      signEvaluations.delete(item.id);
      revealedSignIds.delete(item.id);
      go("signs");
      return;
    }
    if (item.type === "document") {
      documentIndex = Math.max(0, DATA.documents.findIndex(entry => entry.id === item.id));
      documentEvaluation = null;
      documentRevealed = false;
      currentDocumentInstance = null;
      go("documents");
      return;
    }
    if (item.type === "lesson") {
      focusedLessonId = item.id;
      lessonEvaluations.delete(item.id);
      for (const key of heardLessonStimuli) if (key.startsWith(`${item.id}:`)) heardLessonStimuli.delete(key);
      go("lessons");
      return;
    }
    const recoveryTargetId = diagnosticRecoveryTargetId(item);
    const correctionItem = diagnosticCorrectionItem(item);
    if (!recoveryTargetId || !correctionItem) {
      diagnosticCorrectionTargetId = null;
      toast("Диагностическое задание больше не применимо к выбранному профилю");
      go("errors");
      return;
    }
    diagnosticCorrectionTargetId = recoveryTargetId;
    resetDiagnosticSession(correctionItem.id);
    const target = diagnosticPrepared.find(entry => entry.id === correctionItem.id);
    if (!target) {
      diagnosticCorrectionTargetId = null;
      toast("Диагностическое задание больше не применимо к выбранному профилю");
      go("errors");
      return;
    }
    diagnosticPrepared = [target];
    diagnosticIndex = 0;
    diagnosticCorrectionMode = true;
    go("diagnostic");
  }

  const BRANCHING_SCENARIOS = [
    { title: "Сотрудник дорожной полиции просит остановиться", prompt: "Что вы делаете первым?", informationGap: "Переменная: отметка 12, правая безопасная площадка. Выберите действие, затем подтвердите его своей репликой.", options: ["Безопасно останавливаюсь и жду понятной команды", "Продолжаю ехать до стоянки грузовиков", "Сразу выхожу из кабины"], correct: 0, expectedDriverTurn: "I will pull over safely and wait for your instructions.", transferVariant: "I will stop at the next safe shoulder and wait in the cab.", rubrics: { "primary-turn": { minTokens: 6, requiredGroups: [["pull", "stop"], ["safe", "safely"], ["wait"]] }, "transfer-turn": { minTokens: 7, requiredGroups: [["stop", "pull"], ["safe", "safely"], ["shoulder"], ["wait"]] } }, successCondition: "Выбрана безопасная остановка, а письменная реплика содержит stop или pull over, safely и wait.", why: "Безопасно остановитесь в подходящем месте, затем слушайте и выполняйте понятные команды.", consequence: "Продолжение движения или выход без команды может создать новый риск и нарушить понятную последовательность контакта." },
    { title: "Инспектор просит показать права", prompt: "Какой ответ и действие подходят?", informationGap: "Переменная: водительское удостоверение лежит в синей папке. Не передавайте документы, которых не просили.", options: ["Here is my driver's license, officer.", "I hand over every paper in the cab.", "I say nothing and search for cargo records."], correct: 0, expectedDriverTurn: "Here is my driver's license, officer.", transferVariant: "My driver's license is in the blue folder. I will get it for you.", rubrics: { "primary-turn": { minTokens: 5, requiredGroups: [["license"], ["here"]] }, "transfer-turn": { minTokens: 9, requiredGroups: [["license"], ["blue"], ["folder"], ["get", "reach"]] } }, successCondition: "Выбран только driver's license, а письменная реплика называет его прямо.", why: "Покажите только запрошенный документ и коротко назовите его.", consequence: "Лишние бумаги замедляют проверку и увеличивают вероятность показать не тот документ." },
    { title: "Вы не поняли команду", prompt: "Выберите безопасный ответ.", informationGap: "Переменная: шум дороги закрыл последнюю часть команды. Не начинайте движение по догадке.", options: ["Could you repeat that, please?", "I guess the command and move.", "I ignore the inspector."], correct: 0, expectedDriverTurn: "Could you repeat that more slowly, please?", transferVariant: "I did not understand the last part. Could you say it again, please?", rubrics: { "primary-turn": { minTokens: 5, requiredGroups: [["repeat", "again"], ["slow", "slowly"]], forbiddenGroups: [["move"], ["guess"]] }, "transfer-turn": { minTokens: 9, requiredGroups: [["understand"], ["last"], ["repeat", "again"]], forbiddenGroups: [["move"], ["guess"]] } }, successCondition: "Typed response просит repeat или say again и не обещает движение.", why: "Попросите повторить. Не начинайте движение, пока команда не понятна.", consequence: "Движение по догадке может поставить людей и машину под угрозу." },
    { title: "Тренировочный вопрос о рейсе", prompt: "Officer: Where are you headed?", informationGap: "Переменная: destination Cincinnati, Ohio. В transfer варианте destination Cleveland, Ohio.", options: ["I am headed to Cincinnati, Ohio.", "My trailer is fifty-three feet.", "The bill of lading is in the folder."], correct: 0, expectedDriverTurn: "I am headed to Cincinnati, Ohio.", transferVariant: "I am headed to Cleveland, Ohio.", rubrics: { "primary-turn": { minTokens: 5, requiredGroups: [["headed", "going"], ["cincinnati"], ["ohio"]] }, "transfer-turn": { minTokens: 5, requiredGroups: [["headed", "going"], ["cleveland"], ["ohio"]] } }, successCondition: "Ответ прямо называет destination и штат.", why: "Прямо назовите пункт назначения, без лишних деталей.", consequence: "Ответ не по вопросу не подтверждает, что водитель понял запрос." },
    { title: "Инспектор сообщает о запрете дальнейшего движения", prompt: "Какой путь безопасен?", informationGap: "Переменная: out-of-service order действует до разрешения инспектора после устранения причины.", options: ["Подтверждаю, что понял, и не двигаю машину до разрешения", "Еду до ближайшей ремонтной мастерской", "Спорю и начинаю движение"], correct: 0, expectedDriverTurn: "I understand. I will not move the vehicle until it is authorized.", transferVariant: "I understand the out-of-service order. The vehicle will remain here until release.", rubrics: { "primary-turn": { minTokens: 9, requiredGroups: [["understand"], ["not", "never"], ["move"], ["authorized", "released"]] }, "transfer-turn": { minTokens: 10, requiredGroups: [["understand"], ["out"], ["service"], ["remain", "stay"], ["release", "authorized"]] } }, successCondition: "Typed response подтверждает понимание, запрет движения и условие разрешения.", why: "Подтвердите, что поняли результат, и не двигайтесь до разрешения.", consequence: "Самовольное движение оставляет причину запрета неустраненной и создает дополнительный риск." },
  ];

  function renderBranching() {
    branchIndex = Math.min(branchIndex, BRANCHING_SCENARIOS.length - 1);
    const item = BRANCHING_SCENARIOS[branchIndex];
    $("#branch-progress").innerHTML = `<span style="width:${((branchIndex + 1) / BRANCHING_SCENARIOS.length) * 100}%"></span>`;
    $("#branch-label").textContent = `Ситуация ${branchIndex + 1} из ${BRANCHING_SCENARIOS.length}`;
    $("#branch-title").textContent = item.title;
    $("#branch-prompt").textContent = item.prompt;
    $("#branch-information-gap").textContent = item.informationGap;
    const optionRows = Eval.deterministicOptionOrder(item.options, `${todayKey()}-${state.dailyRefresh}-${branchIndex}`);
    $("#branch-options").innerHTML = optionRows.map(row => `<button data-branch-answer="${row.originalIndex}">${escapeHtml(row.option)}</button>`).join("");
    branchChoiceCorrect = false;
    const error = (state.errorJournal || []).find(entry => entry.type === "branching" && entry.id === `branch-${branchIndex}`);
    branchVariant = error?.stage === "corrected-awaiting-confirmation" || error?.stage === "confirmation-due" ? "transfer-turn" : "primary-turn";
    $("#branch-driver-challenge").hidden = true;
    $("#branch-driver-response").value = "";
    $("#branch-driver-response").disabled = false;
    $("#check-branch-driver-response").disabled = false;
    $("#branch-feedback").hidden = true;
    $("#branch-feedback").className = "branch-feedback";
    $("#branch-next").hidden = true;
    $("#branch-next").textContent = branchIndex === BRANCHING_SCENARIOS.length - 1 ? "Завершить" : "Следующая ситуация";
    $("#branch-left").textContent = `Осталось: ${BRANCHING_SCENARIOS.length - branchIndex}.`;
  }

  function checkBranchDriverResponse() {
    if (!branchChoiceCorrect) return;
    const item = BRANCHING_SCENARIOS[branchIndex];
    const response = $("#branch-driver-response").value.trim();
    const expected = branchVariant === "transfer-turn" ? item.transferVariant : item.expectedDriverTurn;
    const rubric = { ...(item.rubrics?.[branchVariant] || {}), requiredRatio: 1 };
    const evaluation = Eval.evaluateSemanticResponse({ response, prompt: item.informationGap, expected, rubric });
    const normalizedResponse = Eval.normalizeText(response);
    const forbidden = (rubric.forbiddenGroups || []).filter(group => group.some(value => normalizedResponse.split(" ").includes(Eval.normalizeText(value))));
    if (forbidden.length) {
      evaluation.pass = false;
      evaluation.feedback = `Ответ содержит небезопасное действие: ${forbidden.flat().join("/")}.`;
      evaluation.missing = [...(evaluation.missing || []), "unsafe-action"];
    }
    const feedback = $("#branch-feedback");
    feedback.hidden = false;
    feedback.className = `branch-feedback ${evaluation.pass ? "correct" : "wrong"}`;
    if (!evaluation.pass) {
      feedback.innerHTML = `<strong>Failure branch:</strong> ${escapeHtml(evaluation.feedback)} <span>${escapeHtml(item.consequence)}</span>`;
      addErrorItem("branching", `branch-${branchIndex}`, item.title, evaluation.feedback, "branch-safe-choice-and-driver-turn", evaluation.missing?.[0] || "meaning");
      saveState();
      return;
    }
    const errorId = `branch-${branchIndex}`;
    const recovery = advanceErrorRecovery("branching", errorId, "branch-safe-choice-and-driver-turn", evaluation, `branch-${branchVariant}`, response);
    state.branchingProgress ||= {};
    state.branchingProgress[String(branchIndex)] = { correct: true, variant: branchVariant, responseHash: responseHash(response), completedAt: new Date().toISOString() };
    recordErrorDailyCompletion(recovery, `branch-${branchVariant}`);
    if (!saveState().ok) {
      feedback.innerHTML = "<strong>Ответ проверен, но прогресс не сохранен.</strong> Освободите место в локальном хранилище и повторите попытку.";
      return;
    }
    feedback.innerHTML = `<strong>Observable success confirmed.</strong> ${escapeHtml(evaluation.feedback)} <span>${escapeHtml(item.successCondition)}</span>`;
    $("#branch-driver-response").disabled = true;
    $("#check-branch-driver-response").disabled = true;
    $("#branch-next").hidden = false;
    $("#branch-next").focus();
  }

  function renderWeekPlan() {
    const node = $("#week-plan-grid");
    if (!node) return;
    const weak = verifiedDiagnosticForCurrentContext()?.weakest;
    const errors = errorItems().length;
    const themes = [errors ? "Ошибки + карточки" : "Карточки", weak === "listening" ? "Понимание на слух" : "Тренировочные задания", "Знаки", "Рабочая ситуация", state.profile?.startsWith("hotshot") ? "Порядок Hotshot" : "Документы", "Инспекция", "Свободный выбор"];
    const days = ["Сегодня", "День 2", "День 3", "День 4", "День 5", "День 6", "День 7"];
    node.innerHTML = days.map((day, index) => `<article class="week-day"><strong>${day}</strong><span>${escapeHtml(themes[index])}<br>${state.dailyMinutes || 10} минут</span></article>`).join("");
  }

  function ensureApplicabilityState() {
    state.applicability ||= {};
    state.applicability.equipment ||= {};
    state.applicability.conditions ||= {};
  }

  function syncApplicabilityDependencies(group, key, checked) {
    ensureApplicabilityState();
    const equipment = state.applicability.equipment;
    const conditions = state.applicability.conditions;
    if (group === "equipment") {
      if (key === "loadBars" && checked) equipment.dryVan = true;
      if (key === "dryVan" && !checked) equipment.loadBars = false;
      return;
    }
    if (key === "eldMalfunction" && checked) conditions.eld = true;
    if (key === "eld" && !checked) conditions.eldMalfunction = false;
    if (["hazmat", "oversizePermit", "cargo", "cargoSecurement", "scaleTicket", "delivery"].includes(key) && checked) conditions.tripSpecific = true;
    if (key === "cargoSecurement" && checked) conditions.cargo = true;
    if (key === "cargo" && !checked) conditions.cargoSecurement = false;
    if (key === "tripSpecific" && !checked) {
      for (const child of ["hazmat", "oversizePermit", "cargo", "cargoSecurement", "scaleTicket", "delivery"]) conditions[child] = false;
    }
    if (key === "transportedVehicleAtMost10000Lb" && checked) {
      conditions.vehicleTransport = true;
      conditions.transportedVehicleOver10000Lb = false;
    }
    if (key === "transportedVehicleOver10000Lb" && checked) {
      conditions.vehicleTransport = true;
      conditions.transportedVehicleAtMost10000Lb = false;
    }
    if (key === "vehicleTransport" && !checked) {
      conditions.transportedVehicleAtMost10000Lb = false;
      conditions.transportedVehicleOver10000Lb = false;
    }
  }

  function conditionControlMarkup(group, key, label, description, prefix) {
    ensureApplicabilityState();
    const tractorOnly = group === "equipment" && ["airBrakes", "dryVan", "loadBars"].includes(key);
    const incompatible = tractorOnly && ["hotshot-open", "hotshot-enclosed"].includes(state.profile);
    const checked = !incompatible && state.applicability[group]?.[key] === true;
    const id = `${prefix}-${group}-${key}`;
    return `<label class="condition-control ${incompatible ? "incompatible" : ""}" for="${id}"><input id="${id}" type="checkbox" data-applicability-group="${group}" data-applicability-key="${key}" ${checked ? "checked" : ""} ${incompatible ? "disabled" : ""}><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(incompatible ? "Не применяется к выбранному Hotshot profile." : description)}</small></span></label>`;
  }

  function renderConditionControls(target) {
    const node = typeof target === "string" ? $(target) : target;
    if (!node) return;
    const prefix = node.id || "applicability";
    node.innerHTML = `<fieldset><legend>Оборудование</legend>${EQUIPMENT_CONTROLS.map(item => conditionControlMarkup("equipment", ...item, prefix)).join("")}</fieldset><fieldset><legend>Условия текущего рейса</legend>${CONDITION_CONTROLS.map(item => conditionControlMarkup("conditions", ...item, prefix)).join("")}</fieldset>`;
  }

  function renderProgress() {
    const routeTasks = sessionTasks();
    const routeDone = routeTasks.filter(dailyTaskDone).length;
    const due = allDueReviews().length;
    const questionAttempts = questionAttemptTotals();
    renderWeekPlan();
    renderConditionControls("#conditions-settings");
    $$("[data-change-time]").forEach(button => button.classList.toggle("active", Number(button.dataset.changeTime) === Number(state.dailyMinutes || 10)));
    const applicableCore = allUnits.filter(item => item.track === "core" && applies(item));
    const applicableTruck = allUnits.filter(item => item.track === "truck" && applies(item));
    const applicableHotshot = allUnits.filter(item => item.track === "hotshot" && applies(item));
    const applicableQuestions = assessmentQuestions.filter(applies);
    const applicableSituations = DATA.situations.filter(applies);
    const applicableSigns = DATA.signs.filter(applies);
    const applicableDocuments = DATA.documents.filter(applies);
    const applicableLessons = DATA.lessons.filter(applies);
    const blocks = [
      ["General Core: письменное воспроизведение", masteredCount(applicableCore), applicableCore.length],
      ["Truck Track: письменное воспроизведение", masteredCount(applicableTruck), applicableTruck.length],
      ["Hotshot: письменное воспроизведение", masteredCount(applicableHotshot), applicableHotshot.length],
      ["Рабочие вопросы: письменный ответ", applicableQuestions.filter(item => isDone("questions", item.id)).length, applicableQuestions.length, `Ответов с подсказкой: ${questionAttempts.prompted}. Не получилось: ${questionAttempts.failed}.`],
      ["Ситуации: рабочее взаимодействие", applicableSituations.filter(item => isDone("situations", item.id)).length, applicableSituations.length],
      ["Знаки: чтение и действие", applicableSigns.filter(item => isDone("signs", item.id)).length, applicableSigns.length],
      ["Документы: чтение учебного образца", applicableDocuments.filter(item => isDone("documents", item.id)).length, applicableDocuments.length],
      ["Уроки: понимание и реплика", applicableLessons.filter(item => isDone("lessons", item.id)).length, applicableLessons.length],
    ];
    $("#progress-guidance").innerHTML = `<strong>Следующее действие:</strong> ${due ? `Карточек для повторения: ${due}.` : routeDone < routeTasks.length ? `Продолжите маршрут «Сегодня»: ${routeDone} из ${routeTasks.length} шагов.` : "Маршрут на сегодня завершен."}<p>Профиль: ${escapeHtml(PROFILE_LABELS[state.profile] || PROFILE_LABELS.both)}. Время: ${state.dailyMinutes || 10} минут.</p><div class="segmented profile-switch" aria-label="Изменить профиль">${Object.entries(PROFILE_SHORT_LABELS).map(([value, label]) => `<button class="${state.profile === value ? "active" : ""}" data-change-profile="${value}">${escapeHtml(label)}</button>`).join("")}</div>`;
    $("#progress-overview").innerHTML = `<aside class="construct-limits"><strong>Как считается прогресс</strong><p>Каждый счетчик показывает выполненные упражнения своего типа.</p></aside>` + blocks.map(([label, done, total, detail]) => {
      const percent = clampPercent(done, total);
      return `<article class="progress-block"><h3>${label}</h3><strong class="big-number">${done} / ${total}</strong><p>${percent}% подтверждено в этом формате${detail ? ` · ${escapeHtml(detail)}` : ""}</p><div class="progress-track"><span style="width:${percent}%"></span></div></article>`;
    }).join("") + `<article class="progress-block due-block"><h3>Повторение по сроку</h3><strong class="big-number">${due}</strong><p>${due ? "Нужно повторить сейчас" : "Очередь на сегодня пуста"}</p><button class="text-button" data-open-due>${due ? "Открыть повторение" : "Открыть карточки"}</button></article>`;
    if (state.importTrust?.status === "imported-unverified") {
      const importedAt = state.importTrust.importedAt ? new Date(state.importTrust.importedAt).toLocaleString("ru-RU") : "";
      const suffix = importedAt ? ` Импорт: ${importedAt}.` : "";
      const message = `Импортированная история хранится как неподтвержденная и не влияет на текущие результаты, диагностику или маршрут «Сегодня».${suffix}`;
      const notice = $("#persistence-status");
      notice.textContent = message;
      notice.dataset.kind = "imported-unverified";
      notice.hidden = false;
    }
  }

  function stopPlayback() {
    playbackToken += 1;
    lastPlaybackQualifying = false;
    if (activeAudio) {
      const stoppedAudio = activeAudio;
      activeAudio = null;
      stoppedAudio.pause();
      stoppedAudio.onended = null;
      stoppedAudio.onerror = null;
      stoppedAudio.removeAttribute("src");
      if (stoppedAudio.finishPlayback) stoppedAudio.finishPlayback();
    }
    if (activeAudioButton) activeAudioButton.classList.remove("speaking");
    activeAudioButton = null;
  }

  function sourceAudio(sourceType, sourceId, field) {
    const direct = AUDIO_DATA.bySource?.[[sourceType, sourceId, field].join("\0")];
    if (direct?.length) return direct;
    const collections = {
      "truck-unit": DATA.truck,
      "hotshot-unit": DATA.hotshot,
      "inspection-question": assessmentQuestions,
      situation: DATA.situations,
      sign: DATA.signs,
      document: DATA.documents,
      lesson: DATA.lessons,
    };
    const item = collections[sourceType]?.find(entry => entry.id === sourceId);
    const legacyId = item?.audioSourceId || item?.legacyId;
    return legacyId ? (AUDIO_DATA.bySource?.[[sourceType, legacyId, field].join("\0")] || []) : [];
  }

  function textAudio(text, role = "driver", profile = "clean") {
    const profiles = AUDIO_DATA.lookup?.[`${role}\0${text}`];
    if (!profiles) return null;
    return profiles[profile] || null;
  }

  function playFile(path) {
    return new Promise(resolve => {
      const audio = new Audio(path);
      activeAudio = audio;
      let settled = false;
      const done = (played, fileBacked = false) => {
        if (settled) return;
        settled = true;
        if (activeAudio === audio) activeAudio = null;
        resolve({ played, fileBacked });
      };
      const unavailable = () => {
        if (settled) return;
        if (activeAudio === audio) activeAudio = null;
        done(false, false);
      };
      audio.finishPlayback = () => done(false, false);
      audio.onended = () => done(true, true);
      audio.onerror = unavailable;
      audio.play().catch(unavailable);
    });
  }

  async function playSequence(items, button = null, rate = 0.86, gapMs = 280) {
    await ensureAudioData();
    stopPlayback();
    const token = playbackToken;
    const queue = items.filter(Boolean);
    let unavailable = false;
    let playedAny = false;
    let qualifying = queue.length > 0;
    activeAudioButton = button;
    if (button) button.classList.add("speaking");
    for (const [index, item] of queue.entries()) {
      if (token !== playbackToken) break;
      const path = item.path || textAudio(item.text, item.role, item.profile);
      const result = path ? await playFile(path) : { played: false, fileBacked: false };
      if (result.played) playedAny = true;
      if (!result.played) unavailable = true;
      if (!result.fileBacked) qualifying = false;
      if (token === playbackToken && index < queue.length - 1 && gapMs > 0) await new Promise(resolve => setTimeout(resolve, gapMs));
    }
    if (token === playbackToken && button) button.classList.remove("speaking");
    if (token === playbackToken) activeAudioButton = null;
    if (token === playbackToken) lastPlaybackQualifying = playedAny && qualifying && !unavailable;
    if (token === playbackToken && unavailable) toast("Аудио недоступно без сети. Откройте текст и продолжите без звука.");
    return { played: playedAny, qualifying: lastPlaybackQualifying };
  }

  function speak(text, button = null, role = "driver", profile = "clean") {
    if (!text) return;
    playSequence([{ text, role, profile }], button);
  }

  function playSource(sourceType, sourceId, field, button = null, fallback = null, role = "driver", profile = "clean") {
    const items = sourceAudio(sourceType, sourceId, field);
    return playSequence(items.length ? items : [{ text: fallback, role, profile }], button);
  }

  function situationProfile(_index, item) {
    const mechanic = String(item.mechanic || "").toLowerCase();
    if (["clean", "phone", "roadside"].includes(item.audioProfile)) return item.audioProfile;
    if (mechanic.includes("phone")) return "phone";
    if (mechanic.includes("roadside")) return "roadside";
    return "clean";
  }

  async function playSituation() {
    const item = situationByIndex();
    if (!item) return;
    const profile = situationMode === "phone" ? "phone" : situationMode === "elp" ? "roadside" : situationProfile(situationIndex, item);
    const evaluated = situationEvaluation?.id === item.id && situationEvaluation?.mode === situationMode;
    const modeAtStart = situationMode;
    const variantAtStart = situationVariant;
    const exposureKey = situationStimulusKey(item, variantAtStart, modeAtStart);
    const practice = currentSituationPractice || situationPracticeFor(item, variantAtStart);
    const task = activeSituationTask(item, practice);
    if (!evaluated && task.stage === "workplace-outcome") {
      toast("Аудиоходы завершены. Введите отдельный рабочий результат без аудиоподсказки");
      return;
    }
    let queue;
    if (evaluated || modeAtStart === "read") {
      queue = (practice.dialogue || item.dialogue).flatMap((line, index) => {
        const stored = sourceAudio("situation", item.id, `dialogue-${index + 1}`).filter(clip => clip.profile === profile);
        const role = voiceId(line);
        const path = textAudio(line.english, role, profile);
        return stored.length ? stored : [{ path, text: line.english, role, profile }];
      });
    } else {
      queue = situationStimulusAudio(item, practice, modeAtStart).queue;
    }
    const result = await playSequence(queue, $("#play-situation"), 0.84, 420);
    if (!situationRequiresExposure(modeAtStart) || evaluated) return;
    const sameAttempt = situationByIndex()?.id === item.id
      && situationMode === modeAtStart
      && situationVariant === variantAtStart
      && !(situationEvaluation?.id === item.id && situationEvaluation?.mode === modeAtStart);
    if (sameAttempt && result.played && result.qualifying) heardSituationStimuli.add(exposureKey);
    else if (sameAttempt && result.played) toast("Это воспроизведение доступно только как подсказка");
  }

  function exportProgress() {
    const payload = { app: "Truck Driver English", exportedAt: new Date().toISOString(), state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `truck-driver-english-progress-${todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function resetEphemeralSessionState() {
    stopPlayback();
    activeDailyTaskKey = null;
    focusedCardIds = null;
    cardQueue = [];
    cardIndex = 0;
    cardRevealed = false;
    cardEvaluation = null;
    focusedQuestionIds = null;
    questionIndex = 0;
    questionEvaluations.clear();
    elpSession = false;
    elpResponseDrafts.clear();
    elpResponseLocks.clear();
    questionRevealLocks.clear();
    heardQuestionStimuli.clear();
    focusedSignIds = null;
    signEvaluations.clear();
    stepTwoSession = false;
    revealedSignIds.clear();
    focusedLessonId = null;
    lessonEvaluations.clear();
    heardLessonStimuli.clear();
    situationEvaluation = null;
    situationTask = null;
    currentSituationPractice = null;
    heardSituationStimuli.clear();
    revealedSituationStimuli.clear();
    documentEvaluation = null;
    documentRevealed = false;
    currentDocumentField = null;
    currentDocumentInstance = null;
    diagnosticPrepared = [];
    diagnosticAnswers = [];
    diagnosticIndex = 0;
    diagnosticFeedback = null;
    diagnosticPersistenceRetry = null;
    diagnosticCorrectionMode = false;
    diagnosticCorrectionTargetId = null;
    diagnosticStimulusExposure.clear();
    branchChoiceCorrect = false;
  }

  async function importProgress(file) {
    try {
      const payload = await window.TruckAppPersistence.readExternalImportFile(file);
      const prepared = stateStore.prepareImport(payload);
      if (!prepared.ok) {
        showPersistenceNotice(`Файл не принят: ${prepared.error || "неверная структура"}`, "validation-error");
        return;
      }
      const committed = stateStore.commitImport(prepared.candidate);
      if (!committed.ok) {
        showPersistenceNotice(`Файл проверен, но не сохранен: ${committed.error || "локальное хранилище недоступно"}`, "persistence-error");
        return;
      }
      state = persistenceBoundary.accept(committed.state);
      resetEphemeralSessionState();
      renderView(currentView);
      showPersistenceNotice("История импортирована как неподтвержденная. Настройки, заметки и контекст сохранены, а учебные результаты нужно заново подтвердить локально.", "imported-unverified");
    } catch (error) {
      if (error?.code === "IMPORT_FILE_OVERSIZED") {
        showPersistenceNotice("Файл не прочитан: размер превышает безопасный предел 2 MiB.", "validation-error");
      } else {
        showPersistenceNotice(`Ошибка чтения файла: ${error?.message || "файл не распознан"}`, "read-error");
      }
    }
  }

  document.addEventListener("click", async event => {
    const dailyButton = event.target.closest("[data-daily-task]");
    if (dailyButton) {
      const task = sessionTasks().find(item => item.key === dailyButton.dataset.dailyTask);
      openDailyTask(task);
      return;
    }

    const diagnosticAnswer = event.target.closest("[data-diagnostic-answer]");
    if (diagnosticAnswer) {
      const item = diagnosticPrepared[diagnosticIndex];
      if (!item || diagnosticFeedback) return;
      const evaluation = Eval.scoreDiagnosticAnswer(item, Number(diagnosticAnswer.dataset.diagnosticAnswer), { stimulusExposed: !item.audio || diagnosticStimulusExposure.has(item.id) });
      if (evaluation.evaluator === "stimulus-required") {
        toast("Сначала полностью прослушайте аудио");
        return;
      }
      finishDiagnosticItem(item, Number(diagnosticAnswer.dataset.diagnosticAnswer), evaluation);
      return;
    }

    if (event.target.closest("[data-diagnostic-check]")) {
      const item = diagnosticPrepared[diagnosticIndex];
      const response = $("#diagnostic-response").value.trim();
      if (!response) {
        toast("Сначала напишите ответ");
        $("#diagnostic-response").focus();
        return;
      }
      const evaluation = Eval.scoreDiagnosticAnswer(item, response, { stimulusExposed: !item.audio || diagnosticStimulusExposure.has(item.id) });
      if (evaluation.evaluator === "stimulus-required") {
        toast("Сначала полностью прослушайте аудио");
        return;
      }
      finishDiagnosticItem(item, response, evaluation);
      return;
    }

    if (event.target.closest("[data-diagnostic-next]")) {
      if (!diagnosticFeedback || !diagnosticAnswers[diagnosticIndex]) return;
      if (diagnosticCorrectionMode) {
        diagnosticCorrectionMode = false;
        diagnosticCorrectionTargetId = null;
        diagnosticPrepared = [];
        diagnosticIndex = 0;
        diagnosticFeedback = null;
        diagnosticPersistenceRetry = null;
        go("errors");
        return;
      }
      diagnosticIndex += 1;
      diagnosticFeedback = null;
      diagnosticPersistenceRetry = null;
      diagnosticProductiveShown = false;
      renderDiagnostic();
      requestAnimationFrame(() => {
        const target = $("[data-diagnostic-audio]") || $("#diagnostic-response") || $("[data-diagnostic-answer]");
        target?.focus();
      });
      return;
    }

    if (event.target.closest("[data-diagnostic-save-retry]")) {
      renderDiagnostic();
      return;
    }

    if (event.target.closest("[data-diagnostic-restart]")) {
      diagnosticCorrectionMode = false;
      diagnosticCorrectionTargetId = null;
      state.diagnostic = null;
      resetDiagnosticSession();
      saveState();
      renderDiagnostic();
      return;
    }

    if (event.target.closest("[data-diagnostic-audio]")) {
      const item = diagnosticPrepared[diagnosticIndex];
      const button = event.target.closest("button");
      await ensureAudioData();
      const clip = diagnosticAudioClip(item);
      if (!clip) {
        toast("Локальная диагностическая запись недоступна. Прослушивание не засчитано");
        return;
      }
      playSequence([clip], button).then(result => {
        if (!result.played) return;
        if (!result.qualifying) {
          toast("Это воспроизведение доступно только как подсказка");
          return;
        }
        diagnosticStimulusExposure.add(item.id);
        renderDiagnostic();
        requestAnimationFrame(() => item.kind === "productive" ? $("#diagnostic-response")?.focus() : $("[data-diagnostic-answer]")?.focus());
      });
      return;
    }

    const branchAnswer = event.target.closest("[data-branch-answer]");
    if (branchAnswer) {
      const item = BRANCHING_SCENARIOS[branchIndex];
      const correct = Number(branchAnswer.dataset.branchAnswer) === item.correct;
      const feedback = $("#branch-feedback");
      feedback.hidden = false;
      feedback.className = `branch-feedback ${correct ? "correct" : "wrong"}`;
      feedback.innerHTML = correct
        ? `<strong>Безопасный выбор найден.</strong> ${escapeHtml(item.why)} <span>Теперь напишите реплику водителя. Результат фиксируется только после локальной проверки смысла.</span>`
        : `<strong>Failure branch:</strong> ${escapeHtml(item.consequence)} <span>Сделайте новый выбор и объясните безопасное действие.</span>`;
      if (correct) {
        branchChoiceCorrect = true;
        $$("[data-branch-answer]").forEach(button => button.disabled = true);
        $("#branch-driver-challenge").hidden = false;
        $("#branch-driver-response").focus();
      }
      else branchAnswer.disabled = true;
      if (!correct) addErrorItem("branching", `branch-${branchIndex}`, item.title, item.consequence, "branch-safe-choice-and-driver-turn", "unsafe-choice");
      saveState();
      $("#branch-next").hidden = true;
      if (!correct) $$("[data-branch-answer]:not([disabled])")[0]?.focus();
      return;
    }

    const errorButton = event.target.closest("[data-open-error]");
    if (errorButton) {
      const row = errorButton.closest(".error-item");
      openErrorItem({ type: row.dataset.errorType, id: row.dataset.errorId });
      return;
    }

    const profileButton = event.target.closest("[data-change-profile]");
    if (profileButton) {
      state.profile = profileButton.dataset.changeProfile;
      if (["hotshot-open", "hotshot-enclosed"].includes(state.profile)) {
        ensureApplicabilityState();
        state.applicability.equipment = { airBrakes: false, dryVan: false, loadBars: false };
      }
      invalidateContextDependentReadiness();
      state.onboardingComplete = true;
      state.dailyPlan = null;
      if (!saveState().ok) return;
      renderView(currentView);
      toast("Профиль маршрута обновлен");
      return;
    }

    const timeButton = event.target.closest("[data-change-time]");
    if (timeButton) {
      state.dailyMinutes = Number(timeButton.dataset.changeTime);
      state.dailyPlan = null;
      if (!saveState().ok) return;
      renderProgress();
      toast(`Маршрут: ${state.dailyMinutes} минут`);
      return;
    }

    if (event.target.closest('[data-quick="emergency"]')) {
      const emergency = DATA.situations.find(item => String(item.goal).toLowerCase().includes("emergency") || String(item.title).toLowerCase().includes("breakdown")) || DATA.situations.find(item => item.priority === 1) || DATA.situations[0];
      situationIndex = Math.max(0, DATA.situations.findIndex(item => item.id === emergency.id));
      situationMode = "say";
      go("situations");
      return;
    }

    if (event.target.closest("[data-open-due]")) {
      const dueTask = dailyTasks().find(task => task.key.startsWith("due"));
      if (dueTask) openDailyTask(dueTask);
      else {
        focusedCardIds = null;
        cardTrack = "mixed";
        cardIndex = 0;
        go("cards");
      }
      return;
    }

    const goButton = event.target.closest("[data-go]");
    if (goButton) {
      activeDailyTaskKey = null;
      focusedQuestionIds = null;
      if (goButton.dataset.go === "signs") {
        focusedSignIds = null;
        signFilter = "all";
        signStatus = "all";
        signVisibleLimit = 16;
        $("#sign-category").value = "all";
        $("#sign-status").value = "all";
      }
      go(goButton.dataset.go);
      return;
    }

    const nav = event.target.closest(".nav-button[data-view]");
    if (nav) {
      activeDailyTaskKey = null;
      focusedQuestionIds = null;
      go(nav.dataset.view);
    }

    const courseRow = event.target.closest(".unit-row");
    if (courseRow && event.target.closest(".unit-speak")) {
      const item = unitForCurrentProfile(courseRow.dataset.unitId);
      const profile = item.audioProfile || (["training-prompt", "training-answer"].includes(item.kind) ? "roadside" : "clean");
      const items = [
        { text: item.word, role: item.wordRole || "driver", profile },
        { text: item.example, role: item.exampleRole || "driver", profile },
      ];
      playSequence(items, event.target.closest("button"));
    }
    if (courseRow && event.target.closest(".unit-practice")) {
      focusedCardIds = [courseRow.dataset.unitId];
      cardTrack = "mixed";
      cardIndex = 0;
      go("cards");
    }

    const cardTab = event.target.closest("[data-card-track]");
    if (cardTab) {
      focusedCardIds = null;
      cardTrack = cardTab.dataset.cardTrack;
      cardIndex = 0;
      cardSessionCount = 0;
      $$("[data-card-track]").forEach(node => {
        const active = node === cardTab;
        node.classList.toggle("active", active);
        node.setAttribute("aria-selected", String(active));
        node.tabIndex = active ? 0 : -1;
      });
      renderCard();
    }

    const inspectionTabButton = event.target.closest("[data-inspection-tab]");
    if (inspectionTabButton) {
      if (inspectionTabButton.dataset.inspectionTab === "questions" && state.elpGate?.status === "pending" && artifactMatchesCurrentContext(state.elpGate)) elpSession = true;
      setInspectionTab(inspectionTabButton.dataset.inspectionTab);
    }

    const ladderButton = event.target.closest("[data-listening-profile]");
    if (ladderButton) {
      if (ladderButton.disabled) return;
      listeningProfile = ladderButton.dataset.listeningProfile;
      $$("[data-listening-profile]").forEach(button => button.classList.toggle("active", button === ladderButton));
      const item = filteredQuestions()[questionIndex % filteredQuestions().length];
      const exposureKey = questionStimulusKey(item.id, listeningTarget);
      const queue = listeningQueue(item, listeningProfile);
      playSequence(queue, ladderButton, 0.84, listeningProfile === "pause" ? 1200 : 0)
        .then(result => {
          if (result.played && result.qualifying) heardQuestionStimuli.add(exposureKey);
          else if (result.played) toast("Это воспроизведение доступно только как подсказка");
        });
      return;
    }

    const situationChoice = event.target.closest("[data-situation-choice]");
    if (situationChoice) {
      const item = situationByIndex();
      const practice = currentSituationPractice || situationPracticeFor(item, situationVariant);
      const task = activeSituationTask(item, practice);
      const option = (practice.choiceCheck?.options || []).find(entry => entry.id === situationChoice.dataset.situationChoice);
      task.choiceId = option?.id || null;
      task.choiceSafe = situationOptionIsSafe(practice, option);
      if (!task.choiceSafe) {
        failSituationTask(item, practice, "Выбран небезопасный путь. Эта попытка завершена, обязательные ходы не засчитаны.", "unsafe-choice");
      } else {
        task.stage = "critical-turn";
        task.feedback = "Безопасный путь выбран. Теперь выполните все критические ходы по порядку.";
        renderSituations();
        requestAnimationFrame(() => $("#situation-response")?.focus());
      }
      return;
    }

    const situationButton = event.target.closest("[data-situation-index]");
    if (situationButton) {
      stopPlayback();
      heardSituationStimuli.clear();
      revealedSituationStimuli.clear();
      situationIndex = Number(situationButton.dataset.situationIndex);
      situationEvaluation = null;
      situationTask = null;
      renderSituations();
    }
    const lockedSituationButton = event.target.closest("[data-situation-locked]");
    if (lockedSituationButton) {
      toast(`Сцена недоступна: ${lockedSituationButton.dataset.lockReason}`);
      return;
    }
    const modeButton = event.target.closest("[data-situation-mode]");
    if (modeButton) {
      stopPlayback();
      heardSituationStimuli.clear();
      revealedSituationStimuli.clear();
      situationMode = modeButton.dataset.situationMode;
      situationEvaluation = null;
      situationTask = null;
      $$("[data-situation-mode]").forEach(node => {
        const active = node === modeButton;
        node.classList.toggle("active", active);
        node.setAttribute("aria-selected", String(active));
        node.tabIndex = active ? 0 : -1;
      });
      renderSituations();
    }
    const dialogue = event.target.closest(".dialogue-line");
    if (dialogue && event.target.closest(".dialogue-audio")) {
      const item = situationByIndex();
      const practice = currentSituationPractice || situationPracticeFor(item, situationVariant);
      const line = (practice.dialogue || item.dialogue)[Number(dialogue.dataset.dialogueIndex)];
      const evaluated = situationEvaluation?.id === item.id && situationEvaluation?.mode === situationMode;
      if (!evaluated && situationMode !== "read" && String(line.speaker).toLowerCase().includes("driver")) {
        toast("Сначала напишите ответ. Аудио модели водителя пока скрыто");
        return;
      }
      const profile = situationMode === "phone" ? "phone" : situationMode === "elp" ? "roadside" : situationProfile(situationIndex, item);
      const stored = ["phone", "elp"].includes(situationMode) ? [] : sourceAudio("situation", item.id, `dialogue-${Number(dialogue.dataset.dialogueIndex) + 1}`);
      playSequence(stored.length ? stored : [{ text: line.english, role: voiceId(line), profile }], event.target.closest("button"));
    } else if (dialogue && event.target.closest(".reveal-dialogue")) {
      const item = situationByIndex();
      const practice = currentSituationPractice || situationPracticeFor(item, situationVariant);
      const line = (practice.dialogue || item.dialogue)[Number(dialogue.dataset.dialogueIndex)];
      const exposureMode = situationRequiresExposure();
      const revealedDriverModel = situationMode === "say" && line.speaker.toLowerCase().includes("driver");
      if (exposureMode || revealedDriverModel) {
        stopPlayback();
        const exposureKey = situationStimulusKey(item);
        heardSituationStimuli.delete(exposureKey);
        revealedSituationStimuli.add(exposureKey);
        addErrorItem("situation", item.id, line.english, exposureMode ? "Текст задания на слух открыт до ответа" : "Ответ открыт с подсказкой", "situation-driver-turn", "premature-reveal");
        const task = activeSituationTask(item, practice);
        if (!task.finished) {
          failSituationTask(item, practice, "Модель или текст задания открыты до завершения всех обязательных шагов.", task.choiceSafe === true ? "pre-reveal" : "safety-step");
          return;
        }
      }
    }

    const signCard = event.target.closest(".sign-card");
    if (signCard && event.target.closest(".sign-audio")) {
      event.stopPropagation();
      const item = DATA.signs.find(sign => sign.id === signCard.dataset.signId);
      if (stepTwoSession && state.elpStepTwo?.sessionIds?.includes(item.id) && !state.elpStepTwo.results?.[item.id]) {
        toast("Сначала зафиксируйте ответ по английскому тексту. Аудио до результата отключено");
        return;
      }
      const answerAvailable = revealedSignIds.has(item.id) || signEvaluations.has(item.id);
      const studio = STALE_SIGN_AUDIO_CODES.has(item.assetCode)
        ? []
        : [...sourceAudio("sign", item.id, "display"), ...(answerAvailable ? sourceAudio("sign", item.id, "action") : [])];
      playSequence(studio.length ? studio : [
        { text: item.display, role: "driver", profile: "clean" },
        ...(answerAvailable ? [{ text: item.actionEn, role: "driver", profile: "clean" }] : []),
      ], event.target.closest("button"));
    } else if (signCard && event.target.closest(".sign-check")) {
      event.stopPropagation();
      checkSignResponse(signCard);
    } else if (signCard && event.target.closest(".sign-reveal")) {
      const id = signCard.dataset.signId;
      const item = DATA.signs.find(sign => sign.id === id);
      revealedSignIds.add(id);
      const variant = signCard.querySelector(".sign-response")?.dataset.signVariant || "action-from-stimulus";
      if (!recordViewed("signs", id, "sign-reveal", variant, { deferSave: true })) {
        revealedSignIds.delete(id);
        return;
      }
      addErrorItem("sign", id, item?.display || id, "Модель открыта до письменного ответа.", "sign-meaning-action", "premature-reveal");
      if (item) updateElpStepTwoResult(item, { pass: false, evaluator: "productive-rubric", feedback: "Модель открыта до ответа." }, "", variant);
      if (!saveState().ok) {
        signEvaluations.delete(id);
        revealedSignIds.delete(id);
        stepTwoSession = state.elpStepTwo?.status === "pending" && artifactMatchesCurrentContext(state.elpStepTwo);
        focusedSignIds = stepTwoSession ? state.elpStepTwo.sessionIds.filter(signId => !state.elpStepTwo.results?.[signId]) : null;
        renderSigns();
        const restored = document.querySelector(`[data-sign-id="${CSS.escape(id)}"]`);
        const feedback = restored?.querySelector(".evaluation-status");
        if (feedback) feedback.textContent = "Модель не открыта, потому что результат не сохранился. Поле снова доступно.";
        restored?.querySelector(".sign-response")?.focus();
        return;
      }
      renderSigns();
      requestAnimationFrame(() => document.querySelector(`[data-sign-id="${CSS.escape(id)}"] .sign-info`)?.focus());
    }

    const documentButton = event.target.closest("[data-document-index]");
    if (documentButton) {
      documentIndex = Number(documentButton.dataset.documentIndex);
      documentEvaluation = null;
      documentRevealed = false;
      currentDocumentInstance = null;
      renderDocuments();
    }

    const lessonToggle = event.target.closest("[data-lesson-toggle]");
    if (lessonToggle) {
      const id = lessonToggle.dataset.lessonToggle;
      focusedLessonId = focusedLessonId === id ? null : id;
      renderLessons();
    }
    const lessonRestart = event.target.closest(".lesson-restart");
    if (lessonRestart) {
      const lessonCard = lessonRestart.closest(".lesson-card");
      const lessonId = lessonCard?.dataset.lessonId;
      if (!lessonId) return;
      clearLessonTransientState(lessonId);
      focusedLessonId = lessonId;
      renderLessons();
      requestAnimationFrame(() => document.querySelector(`[data-lesson-id="${CSS.escape(lessonId)}"] .lesson-response`)?.focus());
      return;
    }
    const lessonReceptionAudio = event.target.closest(".lesson-reception-audio");
    if (lessonReceptionAudio) {
      const lessonCard = lessonReceptionAudio.closest(".lesson-card");
      const lessonId = lessonCard.dataset.lessonId;
      const lesson = lessonById(lessonId);
      const attempt = lessonAttempt(lesson);
      const phraseIndex = Number(lessonReceptionAudio.dataset.phraseIndex) - 1;
      const phrase = lessonPhrases(lesson)[phraseIndex] || "";
      const key = lessonStimulusKey(lesson, phraseIndex, attempt.variant);
      playSequence(lessonAudioQueue(lesson, phraseIndex, phrase), lessonReceptionAudio).then(result => {
        const sameAttempt = lessonEvaluations.get(lessonId) === attempt && attempt.stage === "reception" && attempt.order[attempt.receptionIndex] === phraseIndex;
        if (sameAttempt && result?.played && result?.qualifying) {
          heardLessonStimuli.add(key);
          renderLessons();
          requestAnimationFrame(() => document.querySelector(`[data-lesson-id="${CSS.escape(lessonId)}"] .lesson-response`)?.focus());
        } else if (sameAttempt && result?.played) toast("Для этого задания нет полного аудио");
      });
      return;
    }
    const lessonAudio = event.target.closest(".lesson-audio");
    if (lessonAudio) {
      const lessonCard = lessonAudio.closest(".lesson-card");
      const lessonId = lessonCard.dataset.lessonId;
      const lesson = lessonById(lessonId);
      const phraseIndex = Number(lessonAudio.dataset.phraseIndex) - 1;
      playSequence(lessonAudioQueue(lesson, phraseIndex, lessonAudio.dataset.text), lessonAudio);
    }
    const lessonCheck = event.target.closest(".lesson-check");
    if (lessonCheck) {
      checkLessonResponse(lessonCheck.closest(".lesson-card"));
      return;
    }
    const lessonReveal = event.target.closest(".lesson-reveal");
    if (lessonReveal) {
      const card = lessonReveal.closest(".lesson-card");
      const item = lessonById(card.dataset.lessonId);
      const attempt = lessonAttempt(item);
      const evaluation = { pass: false, score: 0, evaluator: "lesson-completion-blueprint", feedback: "Модели открыты до завершения всех заданий урока. Эта попытка не подтверждает результат.", missing: ["pre-reveal"] };
      attempt.revealed = true;
      finalizeLessonAttempt(item, attempt, evaluation);
      renderLessons();
      requestAnimationFrame(() => document.querySelector(`[data-lesson-id="${CSS.escape(item.id)}"] .evaluation-status`)?.focus());
    }
  });

  $("#mobile-menu").addEventListener("click", openMobileNav);
  $("#sidebar-close").addEventListener("click", () => closeMobileNav());
  $("#sidebar-backdrop").addEventListener("click", () => closeMobileNav());
  $("#refresh-day").addEventListener("click", () => { state.dailyRefresh += 1; state.sessionOrdinal = Math.min(1000000, Math.max(1, Number(state.sessionOrdinal || 1)) + 1); state.dailyPlan = null; activeDailyTaskKey = null; activeDailySessionDate = null; if (!saveState().ok) return; renderDashboard(); toast("Новая ограниченная сессия создана"); });
  $("#start-daily-route").addEventListener("click", () => openDailyTask(firstIncompleteDailyTask()));
  $("#skip-daily-step").addEventListener("click", () => {
    const snapshot = sessionSnapshot();
    if (snapshot.tasks.length > 1) {
      todayTaskOffset += 1;
    } else if (state.dailyPlan) {
      state.dailyPlan.routeKeys = [];
      delete state.dailyPlan.routeSnapshot;
      state.dailyRefresh += 1;
      state.sessionOrdinal = Math.min(1000000, Math.max(1, Number(state.sessionOrdinal || 1)) + 1);
      state.dailyPlan.refresh = state.dailyRefresh;
      state.dailyPlan.date = todayKey();
      activeDailyTaskKey = null;
      activeDailySessionDate = null;
      todayTaskOffset = 0;
      if (!saveState().ok) return;
    } else {
      todayTaskOffset = 0;
    }
    renderDashboard();
  });
  $("#today-audio").addEventListener("click", event => {
    const task = firstIncompleteDailyTask();
    if (task?.ids?.map(unitForCurrentProfile).find(Boolean) && task?.view === "cards") {
      toast("Аудио целевого ответа доступно только после самостоятельной проверки карточки");
      return;
    }
    const item = dailyAudioItem(task);
    if (item) playSequence([item], event.currentTarget);
  });
  $("#start-elp-practice").addEventListener("click", () => { activeDailyTaskKey = null; elpSession = true; inspectionTab = "elp"; go("inspections"); });
  $("#elp-step-one").addEventListener("click", startElpStepOne);
  $("#elp-step-two").addEventListener("click", () => {
    if (state.elpGate?.status !== "passed" || !artifactMatchesCurrentContext(state.elpGate)) {
      toast("Сначала самостоятельно пройдите учебный этап 1");
      return;
    }
    const stepTwoSigns = DATA.signs.filter(item => ["fhwa-mutcd-shs", "training-dms"].includes(item.provenance));
    const officialCount = stepTwoSigns.filter(item => item.provenance === "fhwa-mutcd-shs").length;
    const dmsCount = stepTwoSigns.filter(item => item.provenance === "training-dms").length;
    if (officialCount !== 49 || dmsCount !== 16) {
      toast(`Этап 2 не запущен: доступно ${officialCount} FHWA и ${dmsCount} DMS вместо 49 и 16`);
      return;
    }
    const readinessItems = elpStepTwoReadinessItems();
    const allowlistedIds = new Set(readinessItems.map(item => item.id));
    const requiredScoredAttempts = Number(DATA.elpStepTwoCompletionBlueprint?.requiredScoredAttempts || 12);
    const requiredOfficialAttempts = Number(DATA.elpStepTwoCompletionBlueprint?.requiredOfficialSvgAttempts || 8);
    const requiredDmsAttempts = Number(DATA.elpStepTwoCompletionBlueprint?.requiredTrainingDmsAttempts || 4);
    const blueprintVersion = DATA.elpStepTwoCompletionBlueprint?.version || DATA.elpStepTwoBlueprint?.version || "english-bearing-v1";
    const pendingIds = state.elpStepTwo?.sessionIds || [];
    const pendingOfficial = pendingIds.filter(id => DATA.signs.find(item => item.id === id)?.provenance === "fhwa-mutcd-shs").length;
    const pendingDms = pendingIds.filter(id => DATA.signs.find(item => item.id === id)?.provenance === "training-dms").length;
    const pending = state.elpStepTwo?.status === "pending"
      && state.elpStepTwo.profile === state.profile
      && state.elpStepTwo.contextKey === currentQualificationContextKey()
      && state.elpStepTwo.blueprintVersion === blueprintVersion
      && state.elpStepTwo.referenceCounts?.officialSvg === officialCount
      && state.elpStepTwo.referenceCounts?.trainingDms === dmsCount
      && pendingIds.length === requiredScoredAttempts
      && new Set(pendingIds).size === requiredScoredAttempts
      && pendingIds.every(id => allowlistedIds.has(id))
      && pendingOfficial === requiredOfficialAttempts
      && pendingDms === requiredDmsAttempts;
    const expectedIds = pending ? [...pendingIds] : materializeElpStepTwoSession(readinessItems).map(item => item.id);
    if (expectedIds.length !== requiredScoredAttempts || expectedIds.some(id => !stepTwoSigns.some(item => item.id === id))) {
      toast("Этап 2 не запущен: список текстовых стимулов не прошел проверку");
      return;
    }
    if (pending) {
      stepTwoSession = true;
      focusedSignIds = expectedIds.filter(id => !state.elpStepTwo.results?.[id]);
      if (!focusedSignIds.length) focusedSignIds = [...expectedIds];
      signFilter = "all";
      signStatus = "all";
      signVisibleLimit = 16;
      $("#sign-category").value = "all";
      $("#sign-status").value = "all";
      go("signs");
      return;
    }
    const previousStepTwo = state.elpStepTwo;
    stepTwoSession = true;
    state.elpStepTwo = {
      status: "pending",
      sessionIds: expectedIds,
      blueprintVersion,
      referenceCounts: { officialSvg: officialCount, trainingDms: dmsCount },
      results: {},
      resultTimes: {},
      attempts: Math.min(32, Number(state.elpStepTwo?.attempts || 0) + 1),
      startedAt: new Date().toISOString(),
      completedAt: null,
      profile: state.profile,
      contextKey: currentQualificationContextKey(),
    };
    resetElpStepTwoAttemptUi(expectedIds);
    focusedSignIds = [...expectedIds];
    signFilter = "all";
    signStatus = "all";
    signVisibleLimit = 16;
    $("#sign-category").value = "all";
    $("#sign-status").value = "all";
    if (!saveState().ok) {
      state.elpStepTwo = previousStepTwo;
      stepTwoSession = false;
      focusedSignIds = null;
      return;
    }
    go("signs");
  });
  $("#course-search").addEventListener("input", () => { displayLimit = 50; renderCourse(); });
  $("#course-track").addEventListener("change", () => { displayLimit = 50; populateThemes(); renderCourse(); });
  $("#course-theme").addEventListener("change", () => { displayLimit = 50; renderCourse(); });
  $("#load-more-units").addEventListener("click", () => { displayLimit += 50; renderCourse(); });
  $("#card-audio").addEventListener("click", event => {
    const item = cardQueue[cardIndex];
    if (!item) return;
    const profile = item.audioProfile || (["training-prompt", "training-answer"].includes(item.kind) ? "roadside" : "clean");
    const items = [
      { text: item.word, role: item.wordRole || "driver", profile },
      { text: item.example, role: item.exampleRole || "driver", profile },
    ];
    playSequence(items, event.currentTarget);
  });
  $("#check-card-response").addEventListener("click", checkCardResponse);
  $("#shuffle-cards").addEventListener("click", () => { cardQueue.sort(() => Math.random() - .5); cardIndex = 0; renderCard(); toast("Очередь перемешана"); });
  $("#question-category").addEventListener("change", () => {
    const item = filteredQuestions()[questionIndex % filteredQuestions().length];
    if (item) clearQuestionStimulusExposure(item.id);
    focusedQuestionIds = null;
    questionIndex = 0;
    renderQuestion();
  });
  $("#random-question").addEventListener("click", () => {
    const list = filteredQuestions();
    const current = list[questionIndex % list.length];
    if (current) clearQuestionStimulusExposure(current.id);
    questionIndex = Math.floor(Math.random() * list.length);
    renderQuestion();
  });
  $("#elp-response").addEventListener("input", event => {
    const item = filteredQuestions()[questionIndex % filteredQuestions().length];
    if (!item) return;
    elpResponseDrafts.set(item.id, event.target.value);
  });
  $("#check-question-response").addEventListener("click", () => checkQuestionResponse());
  $("#elp-no-answer").addEventListener("click", () => checkQuestionResponse({ noAnswer: true }));
  $("#reveal-question").addEventListener("click", revealQuestion);
  $("#next-question").addEventListener("click", () => {
    if (elpSession && state.elpGate?.status === "pending" && artifactMatchesCurrentContext(state.elpGate)) return;
    const item = filteredQuestions()[questionIndex % filteredQuestions().length];
    if (item) {
      clearQuestionStimulusExposure(item.id);
      questionEvaluations.delete(item.id);
      elpResponseDrafts.delete(item.id);
      elpResponseLocks.delete(item.id);
      questionRevealLocks.delete(item.id);
    }
    questionIndex += 1;
    renderQuestion();
  });
  $("#check-situation-response").addEventListener("click", checkSituationResponse);
  document.addEventListener("click", event => {
    const target = event.target.closest("[data-listening-target]");
    if (!target || target.hidden) return;
    listeningTarget = target.dataset.listeningTarget;
    const item = filteredQuestions()[questionIndex % filteredQuestions().length];
    if (!item) return;
    syncListeningButtons(item);
    $("#question-evaluation-feedback").textContent = listeningTarget === "answer"
      ? "Прослушайте ответ водителя и введите ключевые значения: дату, время, вес, длительность или давление."
      : "Прослушайте вопрос инспектора и дайте рабочий ответ.";
  });
  $("#question-audio").addEventListener("click", async event => {
    const item = filteredQuestions()[questionIndex % filteredQuestions().length];
    const exposureKey = questionStimulusKey(item.id, listeningTarget);
    const queue = listeningQueue(item, listeningProfile);
    if (!queue.length) {
      toast("Для этого варианта нет аудио");
      return;
    }
    const result = await playSequence(queue, event.currentTarget, 0.84, listeningProfile === "pause" ? 1200 : 0);
    if (result.played && result.qualifying) heardQuestionStimuli.add(exposureKey);
    else if (result.played) toast("Это воспроизведение доступно только как подсказка");
  });
  $("#answer-audio").addEventListener("click", event => {
    const item = filteredQuestions()[questionIndex % filteredQuestions().length];
    const expected = item.answerSpoken || item.answerDisplay || item.materializedAnswer || item.answer;
    const exact = sourceAudio("inspection-question", item.id, "answer").filter(clip => Eval.normalizeText(clip.text) === Eval.normalizeText(expected));
    playSequence(exact.length ? exact : [{ text: expected, role: "driver", profile: "roadside" }], event.currentTarget);
  });
  $("#play-situation").addEventListener("click", playSituation);
  $("#sign-category").addEventListener("change", event => { focusedSignIds = null; signFilter = event.target.value; signVisibleLimit = 16; renderSigns(); });
  $("#sign-status").addEventListener("change", event => { focusedSignIds = null; signStatus = event.target.value; signVisibleLimit = 16; renderSigns(); });
  $("#load-more-signs").addEventListener("click", () => { signVisibleLimit += 16; renderSigns(); });
  $("#document-audio").addEventListener("click", event => {
    const item = DATA.documents[documentIndex];
    playSource("document", item.id, "practice", event.currentTarget, item.practice || "This training document is available for inspection.");
  });
  $("#check-branch-driver-response").addEventListener("click", checkBranchDriverResponse);
  $("#branch-next").addEventListener("click", () => {
    if (branchIndex >= BRANCHING_SCENARIOS.length - 1) {
      branchIndex = 0;
      go("practice");
      toast("Пять ситуаций завершены");
      return;
    }
    branchIndex += 1;
    branchChoiceCorrect = false;
    renderBranching();
  });
  $("#start-error-drill").addEventListener("click", () => {
    const first = errorItems()[0];
    openErrorItem(first, true);
  });
  $("#open-help").addEventListener("click", event => openDialog($("#help-dialog"), event.currentTarget));
  $("#close-help").addEventListener("click", () => closeDialog($("#help-dialog")));
  for (const dialog of $$("dialog")) {
    dialog.addEventListener("close", () => restoreDialogFocus(dialog));
    dialog.addEventListener("cancel", event => {
      if (dialog.id === "onboarding-dialog" && !state.onboardingComplete) {
        event.preventDefault();
        dialogFocusable(dialog)[0]?.focus();
      }
    });
  }

  document.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const dialog = $$("dialog").find(node => node.open);
    if (!dialog) return;
    const focusable = dialogFocusable(dialog);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  });

  function updateVoiceUi(event = { status: "idle" }) {
    const status = event.status;
    const ready = status === "ready";
    const recording = ["requesting", "recording", "stopping"].includes(status);
    $("#voice-record").disabled = status === "requesting" || status === "stopping";
    $("#voice-record").textContent = status === "recording" ? "Остановить запись" : ready ? "Записать заново" : "Записать";
    $("#voice-play").disabled = !ready;
    $("#voice-delete").disabled = !ready && !recording;
    $("#voice-rubric").disabled = !ready;
    $("#voice-retry").disabled = !ready;
    const labels = {
      idle: "Записи пока нет.",
      requesting: "Ожидается разрешение только для этой попытки...",
      recording: "Идет запись. Скажите целевую реплику и остановите запись.",
      stopping: "Запись завершается...",
      ready: "Запись готова. Прослушайте ее и отметьте три критерия. Анализа записи нет.",
      error: "Запись завершена из-за ошибки. Активные дорожки остановлены.",
    };
    $("#voice-status").textContent = labels[status] || labels.idle;
  }

  recorderController = RecorderApi.createRecorderController({
    onStateChange: updateVoiceUi,
    onError: error => {
      $("#voice-status").textContent = error?.name === "NotAllowedError" ? "Доступ к микрофону не разрешен." : "Не удалось выполнить запись. Все ресурсы освобождены.";
    },
  });

  async function startOrStopRecording() {
    if (recorderController.getState().isRecording) await recorderController.stop();
    else await recorderController.start({ audio: true });
  }

  $("#voice-model").addEventListener("click", event => speak($("#voice-target").textContent, event.currentTarget, "driver", "clean"));
  $("#voice-record").addEventListener("click", startOrStopRecording);
  $("#voice-play").addEventListener("click", () => recorderController.play());
  $("#voice-delete").addEventListener("click", async () => {
    await recorderController.deleteRecording();
    $("#voice-rubric").querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = false; });
    $("#voice-status").textContent = "Запись удалена из текущей сессии.";
  });
  $("#voice-retry").addEventListener("click", async () => {
    await recorderController.deleteRecording();
    await recorderController.start({ audio: true });
  });
  $("#export-progress").addEventListener("click", exportProgress);
  $("#import-progress").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", event => { if (event.target.files[0]) importProgress(event.target.files[0]); event.target.value = ""; });
  document.addEventListener("change", event => {
    const input = event.target.closest("[data-applicability-group][data-applicability-key]");
    if (!input) return;
    ensureApplicabilityState();
    const group = input.dataset.applicabilityGroup;
    const key = input.dataset.applicabilityKey;
    const focusScope = input.closest("#onboarding-dialog") || input.closest("#conditions-settings");
    if (!["equipment", "conditions"].includes(group)) return;
    state.applicability[group][key] = input.checked;
    syncApplicabilityDependencies(group, key, input.checked);
    invalidateContextDependentReadiness();
    state.dailyPlan = null;
    const saved = saveState();
    if (saved.ok) toast("Фильтр применимости обновлен");
    else if ($("#onboarding-dialog")?.open) {
      showOnboardingStep("profile");
      return;
    }
    if (currentView === "progress") renderProgress();
    if (!$("#onboarding-conditions-step").hidden) renderConditionControls("#onboarding-conditions");
    updateOnboardingConditionCount();
    requestAnimationFrame(() => {
      const replacement = focusScope?.querySelector(`[data-applicability-group="${CSS.escape(group)}"][data-applicability-key="${CSS.escape(key)}"]:not([disabled])`)
        || (focusScope?.id === "onboarding-dialog" ? $("#onboarding-conditions-next") : null);
      replacement?.focus();
    });
  });
  $("#reset-progress").addEventListener("click", () => {
    if (!window.confirm("Удалить только прогресс Truck Driver English?")) return;
    const reset = stateStore.reset();
    if (!reset.ok) {
      toast("Не удалось сбросить прогресс");
      return;
    }
    state = persistenceBoundary.accept(reset.state);
    resetEphemeralSessionState();
    renderView(currentView);
    toast("Прогресс Truck Driver English сброшен");
  });

  window.addEventListener("hashchange", () => {
    const view = location.hash.slice(1);
    if (VIEW_META[view] && view !== currentView) {
      activeDailyTaskKey = null;
      focusedQuestionIds = null;
      go(view);
    }
  });

  document.addEventListener("keydown", event => {
    const tab = event.target.closest('[role="tab"]');
    const tablist = tab?.closest('[role="tablist"]');
    if (!tab || !tablist) return;
    const tabs = [...tablist.querySelectorAll('[role="tab"]:not([disabled])')];
    const current = tabs.indexOf(tab);
    if (current < 0) return;
    const vertical = tablist.getAttribute("aria-orientation") === "vertical";
    let next = null;
    if (!vertical && event.key === "ArrowRight") next = (current + 1) % tabs.length;
    if (!vertical && event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
    if (!vertical && event.key === "Home") next = 0;
    if (!vertical && event.key === "End") next = tabs.length - 1;
    if (vertical && event.key === "ArrowDown") next = (current + 1) % tabs.length;
    if (vertical && event.key === "ArrowUp") next = (current - 1 + tabs.length) % tabs.length;
    if (next === null) return;
    event.preventDefault();
    tabs[next].focus();
    tabs[next].click();
  });

  document.addEventListener("keydown", event => {
    if (!$(".sidebar").classList.contains("open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeMobileNav();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = $$(".sidebar button:not([disabled])");
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  mobileNavQuery.addEventListener("change", () => {
    if (!mobileNavQuery.matches) $(".sidebar").classList.remove("open");
    syncMobileNavState();
  });
  syncMobileNavState();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshTimeSensitiveView();
  });
  window.addEventListener("pageshow", refreshTimeSensitiveView);

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js?v=38").catch(() => {});
  }

  updateTopProgress();
  populateThemes();
  populateSignCategories();
  populateQuestionCategories();
  buildCardQueue();
  const initialView = VIEW_META[location.hash.slice(1)] ? location.hash.slice(1) : "dashboard";
  go(initialView);
  showStorageRecoveryWarning();
  function updateOnboardingConditionCount() {
    const node = $("#onboarding-conditions-count");
    if (!node) return;
    const selected = $$("#onboarding-conditions input[type=checkbox]:checked").length;
    node.textContent = selected ? `Выбрано: ${selected}` : "Базовые настройки";
  }

  function showOnboardingStep(step) {
    const steps = {
      profile: { title: "На какой машине вы работаете?", panel: "#onboarding-profile-step", focus: "[data-profile]" },
      conditions: { title: "Какие условия применимы сейчас?", panel: "#onboarding-conditions-step", focus: "#onboarding-conditions-next" },
      time: { title: "Сколько времени есть сегодня?", panel: "#onboarding-time-step", focus: "[data-onboarding-time]" },
    };
    const selected = steps[step];
    if (!selected) return;
    Object.values(steps).forEach(item => { $(item.panel).hidden = item !== selected; });
    $("#onboarding-title").textContent = selected.title;
    if (step === "conditions") {
      renderConditionControls("#onboarding-conditions");
      updateOnboardingConditionCount();
    }
    requestAnimationFrame(() => $(selected.panel)?.querySelector(selected.focus)?.focus());
  }

  if (!state.onboardingComplete && $("#onboarding-dialog").showModal) {
    showOnboardingStep("profile");
    openDialog($("#onboarding-dialog"), $("#view-title"));
  }
  $$('[data-profile]').forEach(button => button.addEventListener("click", () => {
    state.profile = button.dataset.profile;
    if (["hotshot-open", "hotshot-enclosed"].includes(state.profile)) {
      ensureApplicabilityState();
      state.applicability.equipment = { airBrakes: false, dryVan: false, loadBars: false };
    }
    invalidateContextDependentReadiness();
    state.dailyPlan = null;
    showOnboardingStep("conditions");
  }));
  $("#onboarding-conditions-next").addEventListener("click", () => showOnboardingStep("time"));
  $$('[data-onboarding-time]').forEach(button => button.addEventListener("click", () => {
    state.dailyMinutes = Number(button.dataset.onboardingTime);
    state.onboardingComplete = true;
    state.dailyPlan = null;
    if (!saveState().ok) {
      showOnboardingStep("profile");
      return;
    }
    closeDialog($("#onboarding-dialog"));
    renderDashboard();
    toast(`Готово: ${PROFILE_LABELS[state.profile]}, ${state.dailyMinutes} минут`);
  }));
})();
