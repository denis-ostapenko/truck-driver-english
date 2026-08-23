const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const Core = require(path.join(ROOT, "app", "app-core.js"));
const data = require(path.join(ROOT, "app", "data", "course-data.json"));
const appSource = fs.readFileSync(path.join(ROOT, "app", "app.js"), "utf8");
const indexSource = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");

function runtimeDiagnosticBank() {
  const marker = "const DIAGNOSTIC_ITEMS = ";
  const start = appSource.indexOf(marker);
  const end = appSource.indexOf("\n\n  function materializeDiagnosticItem", start);
  assert.ok(start >= 0 && end > start);
  return vm.runInNewContext(appSource.slice(start + marker.length, end).replace(/;\s*$/, ""));
}

test("CDL and optional ELD help stay out of automatic document lists until applicable", () => {
  const documents = new Map(data.documents.map(item => [item.id, item]));
  const cdl = documents.get("document:commercial-drivers-license");
  const manual = documents.get("document:eld-user-manual-locator");
  const bare = { profile: "tractor", applicability: {} };

  assert.equal(Core.appliesTo(cdl, bare), false);
  assert.equal(Core.appliesTo(cdl, { profile: "tractor", applicability: { cdlRequired: true } }), true);
  assert.equal(Core.appliesTo(manual, bare), false);
  assert.equal(Core.appliesTo(manual, { profile: "tractor", applicability: { eld: true } }), true);
  assert.equal(manual.federallyRequiredOnboard, false);
  assert.equal(manual.optionalDeviceHelp, true);
});

test("dry-van trailer registration never appears in either Hotshot profile", () => {
  const trailer = data.documents.find(item => item.id === "document:trailer-registration");
  assert.deepEqual(trailer.profiles, ["tractor"]);
  assert.deepEqual(trailer.conditions, ["registration-required"]);
  assert.deepEqual(new Set(trailer.equipment), new Set(["tractor-trailer", "dry-van"]));
  const configured = profile => ({
    profile,
    applicability: {
      equipment: { dryVan: true },
      conditions: { registrationRequired: true },
    },
  });
  assert.equal(Core.appliesTo(trailer, configured("tractor")), true);
  assert.equal(Core.appliesTo(trailer, configured("hotshot-open")), false);
  assert.equal(Core.appliesTo(trailer, configured("hotshot-enclosed")), false);
});

test("hardcoded listening diagnostic blueprints preserve source conditions", () => {
  const questions = new Map(data.inspectionQuestions.map(item => [item.id, item]));
  assert.deepEqual(questions.get("question:what-is-the-listed-weight").conditions, ["trip-specific"]);
  assert.deepEqual(questions.get("question:how-many-driving-hours-do-you-have-left").conditions, ["eld-or-rods-applicable"]);

  const bank = new Map(runtimeDiagnosticBank().map(item => [item.id, item]));
  assert.deepEqual(Array.from(bank.get("a-listening-weight").conditions), ["trip-specific"]);
  assert.deepEqual(Array.from(bank.get("a-listening-weight").equipment), ["tractor-trailer", "dry-van"]);
  assert.deepEqual(Array.from(bank.get("a-listening-weight").profiles), ["tractor"]);
  assert.deepEqual(Array.from(bank.get("b-listening-time").conditions), ["eld-or-rods-applicable"]);
});

test("other driver-answer listening blueprints keep their intended applicability", () => {
  const bank = new Map(runtimeDiagnosticBank().map(item => [item.id, item]));
  for (const id of ["a-listening-time", "b-listening-oos"]) {
    const row = bank.get(id);
    assert.ok(row, `${id} blueprint is present`);
    assert.equal(row.conditions, undefined);
    assert.equal(row.equipment, undefined);
    assert.equal(row.profiles, undefined);
  }

  for (const id of ["a-listening-pressure", "b-listening-pressure"]) {
    const row = bank.get(id);
    assert.ok(row, `${id} blueprint is present`);
    assert.deepEqual(Array.from(row.profiles), ["tractor"]);
    assert.ok(row.equipment.includes("air-brakes"));
  }
});

test("document checklist copy describes filtered availability", () => {
  assert.match(indexSource, /только документы текущего профиля и включенных условий/);
  assert.match(indexSource, /По условиям: CDL, ELD/);
  assert.doesNotMatch(indexSource, /Всегда доступны: CDL/);
});

function diagnosticBlueprintMetadata() {
  return [...appSource.matchAll(/^\s*\{ form: "([AB])", id: "([^"]+)", category: "(vocabulary|listening|elp|inspection)"([^\n]*)$/gm)].map(match => {
    const list = name => {
      const body = match[4].match(new RegExp(`${name}: \\[([^\\]]*)\\]`))?.[1] || "";
      return [...body.matchAll(/"([^"]+)"/g)].map(entry => entry[1]);
    };
    const item = { form: match[1], id: match[2], category: match[3] };
    for (const name of ["profiles", "equipment", "conditions"]) {
      const values = list(name);
      if (values.length) item[name] = values;
    }
    return item;
  });
}

test("both diagnostic forms materialize exactly three applicable items per construct for every profile", () => {
  const blueprints = diagnosticBlueprintMetadata();
  assert.ok(blueprints.length > 24);
  const contexts = [];
  for (const profile of ["tractor", "hotshot-open", "hotshot-enclosed", "both"]) {
    contexts.push({ label: `${profile}-bare`, context: { profile, applicability: {} } });
    contexts.push({
      label: `${profile}-configured`,
      context: {
        profile,
        applicability: {
          equipment: { airBrakes: true, dryVan: true, loadBars: true },
          conditions: { cargo: true, cargoSecurement: true, scaleTicket: true, tripSpecific: true, eld: true, cdlRequired: true },
        },
      },
    });
  }
  for (const { label, context } of contexts) {
    for (const form of ["A", "B"]) {
      for (const category of ["vocabulary", "listening", "elp", "inspection"]) {
        const formItems = Core.materializeDiagnosticForm(blueprints, { form, seed: 7, formVersion: "cycle3-12x4-v1", context });
        const count = formItems.filter(item => item.category === category).length;
        assert.equal(count, 3, `${label} form ${form} needs three ${category} items, got ${count}`);
      }
    }
  }
});

test("the unconditional form B listening command has a deterministic local roadside file", () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "app", "data", "audio-data.js"), "utf8"), context);
  const pathValue = context.window.TRUCK_AUDIO_DATA.lookup?.["inspector\0Stop at the white line."]?.roadside;
  assert.ok(pathValue);
  assert.ok(fs.existsSync(path.join(ROOT, "app", pathValue)));
});

function allCourseRecords() {
  return [
    ...data.core,
    ...data.truck,
    ...data.hotshot,
    ...data.inspectionQuestions,
    ...data.situations,
    ...data.signs,
    ...data.documents,
    ...data.lessons,
  ];
}

function fullyConfigured(profile) {
  return {
    profile,
    applicability: {
      equipment: Core.EQUIPMENT_VALUES,
      conditions: Core.CONDITION_VALUES,
    },
  };
}

test("every generated record has explicit known applicability metadata and an exact inventory row", () => {
  const inventory = data.applicabilityInventory;
  const collections = {
    words: [...data.core, ...data.truck, ...data.hotshot],
    questions: data.inspectionQuestions,
    situations: data.situations,
    signs: data.signs,
    documents: data.documents,
    lessons: data.lessons,
  };
  for (const [collection, records] of Object.entries(collections)) {
    assert.deepEqual(new Set(Object.keys(inventory[collection])), new Set(records.map(item => item.id)), collection);
    for (const item of records) {
      assert.ok(Array.isArray(item.profiles) && item.profiles.length, `${item.id}: profiles`);
      assert.ok(Array.isArray(item.equipment), `${item.id}: equipment`);
      assert.ok(Array.isArray(item.conditions), `${item.id}: conditions`);
      assert.deepEqual(inventory[collection][item.id], {
        profiles: item.profiles,
        equipment: item.equipment,
        conditions: item.conditions,
      }, item.id);
      assert.deepEqual(Core.evaluateApplicability(item, fullyConfigured("both")).unknownMetadata, [], item.id);
    }
  }
});

test("air-brake equipment is entirely absent when air brakes are disabled", () => {
  const airSpecific = allCourseRecords().filter(item => item.equipment.includes("air-brakes"));
  assert.ok(airSpecific.length > 10);
  const disabled = { profile: "tractor", applicability: { equipment: { airBrakes: false }, conditions: Core.CONDITION_VALUES } };
  const enabled = { profile: "tractor", applicability: { equipment: { airBrakes: true }, conditions: Core.CONDITION_VALUES } };
  assert.equal(airSpecific.filter(item => Core.appliesTo(item, disabled)).length, 0);
  for (const id of [
    "t:term:brake-chamber",
    "t:term:pushrod",
    "t:term:slack-adjuster",
    "t:term:air-loss-rate",
    "t:term:tractor-protection-system",
    "question:release-the-tractor-brakes-and-keep-the-trailer-brakes-set",
    "question:fan-the-brakes-down",
    "question:tell-me-when-the-low-air-warning-activates",
  ]) {
    const item = allCourseRecords().find(candidate => candidate.id === id);
    assert.ok(item, id);
    assert.ok(item.equipment.includes("air-brakes"), id);
    assert.equal(Core.appliesTo(item, disabled), false, `${id}: disabled`);
    assert.equal(Core.appliesTo(item, enabled), true, `${id}: enabled`);
  }
});

test("Hotshot never receives Tractor, dry-van or ELD-specific records without their applicability", () => {
  const byId = new Map(allCourseRecords().map(item => [item.id, item]));
  const hotshot = {
    profile: "hotshot-open",
    applicability: {
      conditions: {
        tripSpecific: true,
        cargo: true,
        cargoSecurement: true,
        vehicleTransport: true,
        delivery: true,
        oversizePermit: true,
        dvir: true,
        scaleTicket: true,
      },
      equipment: { airBrakes: false, dryVan: false, loadBars: false },
    },
  };
  for (const id of [
    "t:required:here-is-the-tractor-registration",
    "t:required:are-you-asking-for-the-tractor-or-trailer-registration",
    "document:tractor-registration-irp",
    "document:driver-vehicle-inspection-report",
    "document:bill-of-lading",
    "document:scale-ticket",
    "document:oversize-overweight-permit",
    "document:proof-of-delivery-osd",
    "question:what-is-the-listed-weight",
  ]) {
    assert.ok(byId.has(id), id);
    assert.equal(Core.appliesTo(byId.get(id), hotshot), false, id);
  }
  const eldSpecific = allCourseRecords().filter(item => item.conditions.some(value => ["eld-required", "eld-or-rods-applicable", "eld-malfunction"].includes(value)));
  assert.ok(eldSpecific.length > 10);
  assert.equal(eldSpecific.filter(item => Core.appliesTo(item, hotshot)).length, 0);
  for (const id of ["lesson:identity-and-unit-numbers", "lesson:clarification-and-repair-phrases", "lesson:full-elp-rehearsal"] ) {
    assert.equal(Core.appliesTo(byId.get(id), hotshot), true, `${id}: common lesson`);
  }
});

test("profile materialization removes Tractor cargo, unit and document values from every effective Hotshot learning field", () => {
  const context = {
    profile: "hotshot-open",
    applicability: {
      conditions: {
        tripSpecific: true,
        cargo: true,
        cargoSecurement: true,
        vehicleTransport: true,
        delivery: true,
        oversizePermit: true,
        dvir: true,
        scaleTicket: true,
      },
      equipment: { airBrakes: false, dryVan: false, loadBars: false },
    },
  };
  const effectiveText = item => {
    const materialized = Core.materializeForProfile(item, context);
    if (item.kind || item.word) return [materialized.word, materialized.wordDisplay, materialized.translation, materialized.example].join(" ");
    if (item.phrases) return ((materialized.profilePhrases && materialized.profilePhrases[context.profile]) || materialized.phrases).join(" ");
    if (item.dialogue) return JSON.stringify({ dialogue: materialized.dialogue, practiceContract: materialized.practiceContract });
    if (item.prompt) return [materialized.prompt, materialized.answer, JSON.stringify(materialized.slots)].join(" ");
    if (item.fields) return JSON.stringify(materialized.fields);
    return "";
  };
  const forbidden = /packaged food|22 pallets|38,200|79,260|92,000|\bT-204\b|tractor registration/i;
  for (const item of allCourseRecords()) {
    if (!Core.appliesTo(item, context)) continue;
    assert.doesNotMatch(effectiveText(item), forbidden, item.id);
  }

  const commodity = data.truck.find(item => item.id === "t:required:i-am-hauling-commodity");
  assert.equal(Core.materializeForProfile(commodity, context).word, "I am hauling two vehicles.");
  const q16 = data.inspectionQuestions.find(item => item.legacyId === "question-16");
  assert.equal(Core.materializeForProfile(q16, context).answer, "The pickup is P two zero four and the trailer is H S five one eight.");
  const breakdown = data.situations.find(item => item.legacyId === "situation-16");
  assert.match(JSON.stringify(Core.materializeForProfile(breakdown, context).dialogue), /P-204/);
});

test("conditional Hotshot documents and scale-ticket question require the exact declared facts", () => {
  const documents = new Map(data.documents.map(item => [item.id, item]));
  const questions = new Map(data.inspectionQuestions.map(item => [item.id, item]));
  const rating = documents.get("document:pickup-and-trailer-rating-record");
  assert.deepEqual(rating.conditions, ["cdl-required"]);
  assert.equal(Core.appliesTo(rating, { profile: "hotshot-open", applicability: { cdlRequired: false } }), false);
  assert.equal(Core.appliesTo(rating, { profile: "hotshot-open", applicability: { cdlRequired: true } }), true);

  assert.deepEqual(documents.get("document:vehicle-condition-report").conditions, ["vehicle-transport", "trip-specific"]);
  assert.deepEqual(documents.get("document:vehicle-release-form").conditions, ["vehicle-transport", "trip-specific"]);
  assert.deepEqual(documents.get("document:hotshot-proof-of-delivery").conditions, ["vehicle-transport", "delivery", "trip-specific"]);
  assert.deepEqual(questions.get("question:do-you-have-supporting-documents-for-this-trip").conditions, ["trip-specific", "scale-ticket-issued"]);
  assert.equal(Core.appliesTo(questions.get("question:do-you-have-supporting-documents-for-this-trip"), { profile: "hotshot-open", applicability: { tripSpecific: true } }), false);
  assert.equal(Core.appliesTo(questions.get("question:do-you-have-supporting-documents-for-this-trip"), { profile: "hotshot-open", applicability: { scaleTicket: true } }), true);
});
