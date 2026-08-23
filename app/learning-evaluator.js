(function initTruckLearningEvaluator(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TruckLearningEvaluator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTruckLearningEvaluator() {
  "use strict";

  const GENERIC_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "do", "for", "from", "have", "here", "i", "in", "is", "it", "me", "my", "of", "on", "or", "please", "the", "this", "to", "was", "will", "with", "you", "your",
  ]);
  const EMPTY_ANSWER_WORDS = new Set(["yes", "no", "okay", "ok", "officer", "understood", "repeat"]);
  const NEGATION_WORDS = new Set([
    "aint", "arent", "no", "not", "never", "cannot", "cant", "couldnt", "didnt", "doesnt", "dont", "hadnt", "hasnt", "havent", "isnt", "mustnt", "neednt", "shouldnt", "wasnt", "werent", "wont", "wouldnt",
  ]);
  const ACTION_VERBS = new Set(["activate", "call", "come", "contact", "drive", "enter", "exceed", "exit", "follow", "keep", "leave", "move", "open", "park", "proceed", "pull", "reduce", "remain", "show", "slow", "stay", "stop", "transfer", "turn", "use", "wait", "watch"]);
  const NUMBER_WORDS = new Map([
    ["zero", 0], ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9], ["ten", 10],
    ["eleven", 11], ["twelve", 12], ["thirteen", 13], ["fourteen", 14], ["fifteen", 15], ["sixteen", 16], ["seventeen", 17], ["eighteen", 18], ["nineteen", 19],
    ["twenty", 20], ["thirty", 30], ["forty", 40], ["fifty", 50], ["sixty", 60], ["seventy", 70], ["eighty", 80], ["ninety", 90],
    ["first", 1], ["second", 2], ["third", 3], ["fourth", 4], ["fifth", 5], ["sixth", 6], ["seventh", 7], ["eighth", 8], ["ninth", 9], ["tenth", 10],
    ["eleventh", 11], ["twelfth", 12], ["thirteenth", 13], ["fourteenth", 14], ["fifteenth", 15], ["sixteenth", 16], ["seventeenth", 17], ["eighteenth", 18], ["nineteenth", 19],
    ["twentieth", 20], ["thirtieth", 30], ["fortieth", 40], ["fiftieth", 50], ["sixtieth", 60], ["seventieth", 70], ["eightieth", 80], ["ninetieth", 90],
  ]);
  const SYNONYMS = new Map([
    ["pull", ["enter", "move", "drive"]],
    ["remain", ["stay", "wait"]],
    ["hauling", ["haul", "carrying", "carry", "loaded", "transport", "transporting"]],
    ["drive", ["work", "driving", "employer"]],
    ["complete", ["full", "fully"]],
    ["stop", ["stopped", "stopping"]],
    ["slow", ["reduce", "slower"]],
    ["secure", ["secured", "tight", "tied"]],
    ["show", ["provide", "present", "open"]],
    ["turn", ["activate", "switch"]],
    ["not", ["no"]],
  ]);

  const ELP_STEP_ONE_RUBRICS = Object.freeze({
    "question:pull-into-the-inspection-lane": {
      minTokens: 3,
      taskRelation: "inspection-lane-entry",
      requiredGroups: [["pull", "enter", "move", "drive"], ["inspection", "lane"]],
    },
    "question:what-is-your-truck-and-trailer-number": {
      minTokens: 6,
      taskRelation: "unit-identification-from-expected",
      requiredGroups: [["truck", "pickup", "power"], ["trailer"]],
    },
    "question:where-are-you-coming-from": {
      minTokens: 3,
      taskRelation: "origin-from-expected",
      requiredGroups: [["picked", "coming", "came", "left", "started", "origin"], ["columbus"], ["ohio"]],
    },
    "question:where-are-you-going": {
      minTokens: 4,
      taskRelation: "destination-from-expected",
      requiredGroups: [["delivering", "going", "headed", "bound", "destination"]],
    },
    "question:what-are-you-hauling": {
      minTokens: 2,
      taskRelation: "cargo-from-expected",
      requiredGroups: [["hauling", "carrying", "haul", "carry", "transport", "transporting", "cargo", "load"]],
      requiredRatio: 0,
    },
    "question:who-do-you-drive-for": {
      minTokens: 4,
      taskRelation: "carrier-from-expected",
      requiredGroups: [["drive", "work", "employer", "carrier", "company"], ["training"], ["carrier"]],
    },
    "question:what-is-your-current-duty-status": {
      minTokens: 5,
      taskRelation: "status-on-duty-not-driving",
      requiredGroups: [["on"], ["duty"], ["not", "no"], ["driving", "drive"]],
    },
  });

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’‘]/g, "'")
      .replace(/([a-z])'([a-z])/gi, "$1$2")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\ba m\b/g, "am")
      .replace(/\bp m\b/g, "pm");
  }

  function hashResponse(value) {
    let hash = 2166136261;
    const normalized = normalizeText(value);
    for (let index = 0; index < normalized.length; index += 1) {
      hash ^= normalized.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function deterministicOptionOrder(options, seedText) {
    return (Array.isArray(options) ? options : [])
      .map((option, originalIndex) => ({ option, originalIndex }))
      .sort((left, right) => {
        const leftKey = hashResponse(`${seedText}:${left.originalIndex}`);
        const rightKey = hashResponse(`${seedText}:${right.originalIndex}`);
        return leftKey.localeCompare(rightKey) || left.originalIndex - right.originalIndex;
      });
  }

  function stem(token) {
    if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
    if (token.length > 4 && token.endsWith("ied")) return `${token.slice(0, -3)}y`;
    if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
    if (token.length > 4 && /(?:s|x|z|ch|sh)es$/.test(token)) return token.slice(0, -2);
    if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
    return token;
  }

  function targetMorphologicalForms(value, irregularForms = []) {
    const token = normalizeText(value);
    if (!token || token.includes(" ")) return [];
    const forms = new Set([token, ...irregularForms.map(normalizeText).filter(Boolean)]);
    const consonantY = /[^aeiou]y$/.test(token);
    const sibilant = /(?:s|x|z|ch|sh)$/.test(token);
    if (consonantY) {
      forms.add(`${token.slice(0, -1)}ies`);
      forms.add(`${token.slice(0, -1)}ied`);
      forms.add(`${token}ing`);
    } else {
      forms.add(`${token}${sibilant ? "es" : "s"}`);
      if (token.endsWith("e")) {
        forms.add(`${token}d`);
        forms.add(`${token.slice(0, -1)}ing`);
      } else {
        forms.add(`${token}ed`);
        forms.add(`${token}ing`);
      }
    }
    if (/[^aeiou][aeiou][^aeiouwxy]$/.test(token)) {
      const final = token.at(-1);
      forms.add(`${token}${final}ed`);
      forms.add(`${token}${final}ing`);
    }
    return [...forms];
  }

  function textTokens(value) {
    return normalizeText(value).split(" ").filter(Boolean);
  }

  function tokenVariants(token) {
    const normalized = stem(token);
    const variants = new Set([token, normalized]);
    for (const [key, values] of SYNONYMS) {
      if (key === token || key === normalized || values.includes(token) || values.includes(normalized)) {
        variants.add(key);
        values.forEach(value => variants.add(stem(value)));
      }
    }
    return variants;
  }

  function hasToken(responseTokens, expected) {
    const expectedVariants = tokenVariants(expected);
    return responseTokens.some(token => {
      const responseVariants = tokenVariants(token);
      return [...expectedVariants].some(value => responseVariants.has(value));
    });
  }

  function tokenSimilarity(left, right) {
    const a = new Set(textTokens(left).map(stem));
    const b = new Set(textTokens(right).map(stem));
    if (!a.size || !b.size) return 0;
    let common = 0;
    for (const token of a) if (b.has(token)) common += 1;
    return common / Math.max(a.size, b.size);
  }

  function editDistance(left, right) {
    const a = String(left || "");
    const b = String(right || "");
    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let column = 0; column <= b.length; column += 1) matrix[0][column] = column;
    for (let row = 1; row <= a.length; row += 1) {
      matrix[row][0] = row;
      for (let column = 1; column <= b.length; column += 1) {
        matrix[row][column] = Math.min(
          matrix[row][column - 1] + 1,
          matrix[row - 1][column] + 1,
          matrix[row - 1][column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1),
        );
        if (row > 1 && column > 1 && a[row - 1] === b[column - 2] && a[row - 2] === b[column - 1]) {
          matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
        }
      }
    }
    return matrix[a.length][b.length];
  }

  function orderedTokenSimilarity(left, right) {
    const a = textTokens(left);
    const b = textTokens(right);
    if (!a.length || !b.length) return 0;
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let row = 1; row <= a.length; row += 1) {
      const current = [row];
      for (let column = 1; column <= b.length; column += 1) {
        const width = Math.max(a[row - 1].length, b[column - 1].length, 1);
        const substitution = Math.min(1, editDistance(a[row - 1], b[column - 1]) / width);
        current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + substitution);
      }
      previous.splice(0, previous.length, ...current);
    }
    return Math.max(0, 1 - (previous[b.length] / Math.max(a.length, b.length)));
  }

  function limitedOrderedTypoMatch(left, right) {
    const actual = textTokens(left);
    const expected = textTokens(right);
    if (!actual.length || actual.length !== expected.length) return false;
    let totalEdits = 0;
    for (let index = 0; index < actual.length; index += 1) {
      const distance = editDistance(actual[index], expected[index]);
      const perTokenLimit = Math.max(actual[index].length, expected[index].length) >= 4 ? 1 : 0;
      if (distance > perTokenLimit) return false;
      totalEdits += distance;
    }
    return totalEdits <= (actual.length >= 5 ? 2 : 1);
  }

  function numberValues(value) {
    const normalized = normalizeText(String(value || "").replace(/(?<=\d),(?=\d{3}\b)/g, ""));
    const values = [];
    for (const match of normalized.matchAll(/\b\d+\b/g)) values.push(Number(match[0]));
    const tokens = normalized.split(" ");
    let current = 0;
    let total = 0;
    let active = false;
    const flush = () => {
      if (!active) return;
      values.push(total + current);
      current = 0;
      total = 0;
      active = false;
    };
    for (const token of tokens) {
      if (NUMBER_WORDS.has(token)) {
        current += NUMBER_WORDS.get(token);
        active = true;
      } else if (token === "hundred" && active) {
        current = Math.max(1, current) * 100;
      } else if (token === "thousand" && active) {
        total += Math.max(1, current) * 1000;
        current = 0;
      } else if (token === "and" && active) {
        continue;
      } else {
        flush();
      }
    }
    flush();
    return [...new Set(values.filter(Number.isFinite))];
  }

  function containsTokenSequence(value, sequence) {
    const source = textTokens(value);
    const expected = textTokens(sequence);
    if (!expected.length || expected.length > source.length) return false;
    return source.some((_, start) => expected.every((token, offset) => source[start + offset] === token));
  }

  function semanticClauseRecords(value) {
    const protectedText = String(value || "")
      .replace(/\ba\.m\./gi, "am")
      .replace(/\bp\.m\./gi, "pm");
    const records = protectedText
      .split(/(?:\band\s+(?=now\b)|\b(?:but|however|although|yet)\b|[!?;]+|\.(?:\s+|$)|,\s+(?=(?:not|wrong|incorrect|false|rejected|that\s+is|this\s+is)\b))/i)
      .map(text => ({ text: text.trim(), normalized: normalizeText(text) }))
      .filter(record => record.normalized)
      .map(record => {
        const oppositeRepudiation = /^(?:actually\s+)?(?:(?:the|its|that(?:s| is)|this(?: is)?)\s+)?(?:opposite|contrary|reverse)(?:\s+(?:answer|statement|meaning|value|fact))?\s+(?:(?:is|was)\s+(?:true|correct|valid|applicable)|applies)$/i.test(record.normalized)
          || /^(?:actually\s+)?(?:the\s+)?(?:opposite|contrary|reverse)\s+(?:is\s+)?true$/i.test(record.normalized);
        const metaRepudiation = /\b(?:it is|its) false(?: that)?\b/.test(record.normalized)
          || /\b(?:that|this)s false\b/.test(record.normalized)
          || /\b(?:(?:does|do|did)\s+not|doesnt|dont|didnt)\s+mean\b/.test(record.normalized)
          || /\b(?:take|took)\s+(?:that|it|the answer)\s+back\b/.test(record.normalized)
          || /\b(?:i\s+)?(?:deny|reject)\s+(?:that|this|the answer|the statement)\b/.test(record.normalized)
          || /\b(?:phrase|answer|statement|value|fact)\b.*\bdoes not apply\b/.test(record.normalized)
          || oppositeRepudiation;
        const hardRejected = metaRepudiation
          || /\b(?:is|are|was|were|seems|seemed)\s+(?:wrong|incorrect|false|rejected)\b/.test(record.normalized)
          || /\b(?:is|are|was|were)\s+not\s+(?:correct|true|valid)\b/.test(record.normalized);
        const negative = textTokens(record.normalized).some(token => NEGATION_WORDS.has(token));
        const explicitCurrent = /\b(?:now|currently|right now|at present|as of now|current status)\b/.test(record.normalized);
        const explicitHistorical = /\b(?:earlier|previously|formerly|yesterday|last (?:trip|shift|day|week)|used to|at first)\b/.test(record.normalized);
        const pastState = /\b(?:was|were|had|worked|drove|hauled|carried|came|left|picked)\b/.test(record.normalized);
        const anaphoricRejection = /^(?:actually\s+)?(?:(?:that|this)(?:\s+(?:answer|statement|value|fact))?|the previous (?:answer|statement|value|fact))(?:s|\s+(?:is|was))\s+(?:wrong|incorrect|false|rejected|not correct|not true|not valid)\b/.test(record.normalized)
          || /^(?:actually\s+)?(?:no|wrong|incorrect|false|not true)$/.test(record.normalized)
          || oppositeRepudiation;
        return { ...record, hardRejected, metaRepudiation, negative, explicitCurrent, explicitHistorical, pastState, anaphoricRejection, repudiated: false };
      });
    for (let index = 1; index < records.length; index += 1) {
      if (!records[index].anaphoricRejection) continue;
      records[index - 1].hardRejected = true;
      records[index - 1].repudiated = true;
    }
    if (records.length > 1 && records[0].anaphoricRejection) {
      records[0].hardRejected = true;
      records[0].repudiated = true;
    }
    return records;
  }

  function activeSemanticClauseRecords(value) {
    const records = semanticClauseRecords(value).filter(record => !record.hardRejected);
    if (!records.length) return [];
    const currentRecords = records.filter(record => record.explicitCurrent);
    if (!currentRecords.length) return records;
    const domains = record => {
      const text = record.normalized;
      const values = new Set();
      if (/\b(?:picked\s+up|came|coming|left|started|origin)\b/.test(text)) values.add("origin");
      if (/\b(?:deliver|delivering|destination|going|headed|bound)\b/.test(text)) values.add("destination");
      if (/\b(?:truck|pickup|power unit|trailer)(?:\s+number)?\b/.test(text)) values.add("unit-identification");
      if (/\b(?:haul|hauling|carry|carrying|transport|transporting|cargo|commodity|load)\b/.test(text)) values.add("cargo");
      if (/\b(?:work|working|drive|driving)\s+for\b|\b(?:employer|carrier|company)\b/.test(text)) values.add("carrier");
      if (/\b(?:duty|driving status|off duty|on duty)\b/.test(text)) values.add("duty");
      if (/\b(?:appointment|time|am|pm)\b|\d{1,2}:\d{2}/.test(text)) values.add("time");
      if (/\b(?:january|february|march|april|may|june|july|august|september|october|november|december|date)\b|\d{1,2}[/-]\d{1,2}/.test(text)) values.add("date");
      if (/\b(?:weight|pound|pounds|lb|lbs)\b/.test(text)) values.add("weight");
      if (/\b(?:pressure|psi)\b/.test(text)) values.add("pressure");
      return values;
    };
    const content = record => new Set(textTokens(record.normalized)
      .filter(token => !GENERIC_WORDS.has(token) && !NEGATION_WORDS.has(token) && !/^\d+$/.test(token) && !["now", "currently", "earlier", "previously", "formerly", "yesterday"].includes(token))
      .map(stem));
    const competes = (historical, current) => {
      const historicalDomains = domains(historical);
      const currentDomains = domains(current);
      if ([...historicalDomains].some(value => currentDomains.has(value))) return true;
      const historicalContent = content(historical);
      return [...content(current)].some(value => historicalContent.has(value));
    };
    return records.filter(record => {
      if (!record.explicitCurrent && (record.explicitHistorical || record.pastState) && currentRecords.some(current => competes(record, current))) return false;
      return true;
    });
  }

  function assertionIntegrityViolations(value) {
    const normalized = normalizeText(value);
    const violations = [];
    const records = semanticClauseRecords(value);
    const refusal = /\b(?:i\s+)?(?:refuse|decline)\s+(?:to\s+)?(?:answer|respond|say|tell)\b/.test(normalized)
      || records.some(record => /^(?:i\s+)?(?:refuse|decline)(?:\s+(?:this|that))?$/.test(record.normalized))
      || /\bi\s+(?:refuse|decline)\s+(?:but|however)\b/.test(normalized)
      || /\bi\s+(?:will not|wont|do not|dont|cannot|cant)\s+(?:answer|respond|say|tell)\b/.test(normalized)
      || /\bno comment\b/.test(normalized);
    const keywordStuffing = /\b(?:prompt|rubric|model answer|answer key|keyword stuffing)\b/.test(normalized)
      || /\b(?:word|phrase|token|keyword)s?\s+(?:is|are|was|were|appears?|occurs?)\b/.test(normalized)
      || /\b(?:is|are|was|were)\s+(?:(?:a|an|the|another)\s+)?(?:word|phrase|token|keyword)s?\b/.test(normalized)
      || /\b(?:list|listing|listed|repeat|repeating|copy|copying|mention|mentioning)\s+(?:the\s+)?(?:words|phrases|tokens|keywords)\b/.test(normalized);
    if (refusal) violations.push("refusal");
    if (keywordStuffing) violations.push("keyword-stuffing");
    if (records.some(record => record.metaRepudiation || record.repudiated)) violations.push("repudiated-assertion");
    return violations;
  }

  function tokenIsNegated(tokens, index) {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (["and", "but", "however", "yet"].includes(tokens[cursor])) return false;
      if (NEGATION_WORDS.has(tokens[cursor])) return true;
    }
    return false;
  }

  function groupValueMatchesAt(tokens, index, value) {
    const expected = textTokens(value);
    if (!expected.length || index + expected.length > tokens.length) return false;
    if (expected.length === 1) return hasToken([tokens[index]], expected[0]);
    return expected.every((token, offset) => tokens[index + offset] === token);
  }

  function groupPolarity(tokens, group) {
    for (let index = 0; index < tokens.length; index += 1) {
      if (group.some(value => groupValueMatchesAt(tokens, index, value))) return tokenIsNegated(tokens, index) ? "negative" : "positive";
    }
    return null;
  }

  function groupPolarities(tokens, group) {
    const values = new Set();
    for (let index = 0; index < tokens.length; index += 1) {
      if (group.some(value => groupValueMatchesAt(tokens, index, value))) values.add(tokenIsNegated(tokens, index) ? "negative" : "positive");
    }
    return values;
  }

  function polarityConflicts(response, expected, groups) {
    const expectedTokens = textTokens(expected);
    const records = activeSemanticClauseRecords(response);
    const conflicts = [];
    for (const rawGroup of groups || []) {
      const group = (Array.isArray(rawGroup) ? rawGroup : [rawGroup]).map(normalizeText).filter(Boolean);
      if (!group.length || group.every(value => NEGATION_WORDS.has(value))) continue;
      const wanted = groupPolarity(expectedTokens, group) || "positive";
      const actual = new Set(records.flatMap(record => [...groupPolarities(textTokens(record.normalized), group)]));
      const opposite = wanted === "negative" ? "positive" : "negative";
      if (actual.has(opposite) || (actual.size && !actual.has(wanted))) conflicts.push(group.join("/"));
    }
    return conflicts;
  }

  function normalizedClockText(value) {
    return normalizeText(value).replace(/\ba m\b/g, "am").replace(/\bp m\b/g, "pm");
  }

  function parseClockComponent(tokens, maximum) {
    const values = tokens.map(token => {
      if (/^\d+$/.test(token)) return Number(token);
      if (token === "oh" || token === "o") return 0;
      return NUMBER_WORDS.has(token) ? NUMBER_WORDS.get(token) : NaN;
    });
    if (!values.length || values.some(value => !Number.isFinite(value))) return null;
    let value = null;
    if (values.length === 1) value = values[0];
    if (values.length === 2 && values[0] === 0 && values[1] >= 0 && values[1] <= 9) value = values[1];
    if (values.length === 2 && values[0] >= 20 && values[0] <= 90 && values[0] % 10 === 0 && values[1] >= 1 && values[1] <= 9) value = values[0] + values[1];
    return Number.isFinite(value) && value <= maximum ? value : null;
  }

  function normalizedClockValue(hourValue, minuteValue, marker = "") {
    if (hourValue === null || minuteValue === null) return "";
    let hour = Number(hourValue);
    const minute = Number(minuteValue);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
    if (marker === "pm" && hour < 12) hour += 12;
    if (marker === "am" && hour === 12) hour = 0;
    if (marker && hourValue > 12) return "";
    return `${hour}:${String(minute).padStart(2, "0")}`;
  }

  function clockValues(value) {
    const source = String(value || "").toLowerCase();
    const values = [];
    for (const match of source.matchAll(/\b(\d{1,2})\s*:\s*(\d{2})\s*(a\.?m\.?|p\.?m\.?)?/g)) {
      const marker = String(match[3] || "").replace(/[^apm]/g, "");
      const parsed = normalizedClockValue(Number(match[1]), Number(match[2]), marker);
      if (parsed) values.push(parsed);
    }
    const normalized = normalizedClockText(source);
    const tokens = textTokens(normalized);
    const monthWords = new Set(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]);
    const clockToken = token => /^\d+$/.test(token) || token === "oh" || token === "o" || NUMBER_WORDS.has(token);
    for (let start = 0; start < tokens.length; start += 1) {
      if (!clockToken(tokens[start]) || monthWords.has(tokens[start - 1])) continue;
      let end = start;
      while (end < tokens.length && clockToken(tokens[end]) && end - start < 4) end += 1;
      const run = tokens.slice(start, end);
      if (run.length < 2) continue;
      const marker = ["am", "pm"].includes(tokens[end]) ? tokens[end] : "";
      const candidates = [];
      for (let split = 1; split < run.length; split += 1) {
        const hour = parseClockComponent(run.slice(0, split), 23);
        const minute = parseClockComponent(run.slice(split), 59);
        const parsed = normalizedClockValue(hour, minute, marker);
        if (parsed) candidates.push({ parsed, split });
      }
      if (candidates.length) {
        candidates.sort((left, right) => Math.abs((run.length - left.split) - 1) - Math.abs((run.length - right.split) - 1));
        values.push(candidates[0].parsed);
      }
      start = end - 1;
    }
    return [...new Set(values)];
  }

  function dateValues(value) {
    const source = String(value || "").toLowerCase();
    const months = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
    const values = [];
    for (const match of source.matchAll(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/g)) values.push(`${Number(match[1])}/${Number(match[2])}/${match[3] || ""}`);
    const tokens = textTokens(source);
    const parseDay = (start, length) => {
      const part = tokens.slice(start, start + length);
      if (part.length !== length) return null;
      const digitDay = length === 1 ? part[0].match(/^(\d{1,2})(?:st|nd|rd|th)?$/) : null;
      if (digitDay) return Number(digitDay[1]);
      const valuesForPart = part.map(token => NUMBER_WORDS.get(token));
      if (valuesForPart.some(number => !Number.isFinite(number))) return null;
      if (length === 1) return valuesForPart[0];
      if (valuesForPart[0] >= 20 && valuesForPart[0] % 10 === 0 && valuesForPart[1] >= 1 && valuesForPart[1] <= 9) return valuesForPart[0] + valuesForPart[1];
      return null;
    };
    const parseYear = start => {
      const digit = tokens[start]?.match(/^\d{4}$/);
      if (digit) return { value: digit[0], length: 1 };
      const first = NUMBER_WORDS.get(tokens[start]);
      const second = NUMBER_WORDS.get(tokens[start + 1]);
      const third = NUMBER_WORDS.get(tokens[start + 2]);
      if ([19, 20].includes(first) && Number.isFinite(second)) {
        const tail = second >= 20 && second % 10 === 0 && Number.isFinite(third) && third > 0 && third < 10
          ? second + third
          : second;
        if (tail >= 0 && tail <= 99) return { value: String(first * 100 + tail), length: tail === second ? 2 : 3 };
      }
      if (first === 2 && tokens[start + 1] === "thousand") {
        const tail = NUMBER_WORDS.get(tokens[start + 2]);
        const extra = NUMBER_WORDS.get(tokens[start + 3]);
        const suffix = Number.isFinite(tail) ? tail + (tail >= 20 && tail % 10 === 0 && Number.isFinite(extra) ? extra : 0) : 0;
        const length = 2 + (Number.isFinite(tail) ? 1 : 0) + (Number.isFinite(extra) && tail >= 20 && tail % 10 === 0 ? 1 : 0);
        return { value: String(2000 + suffix), length };
      }
      return { value: "", length: 0 };
    };
    for (let index = 0; index < tokens.length; index += 1) {
      const month = months[tokens[index]];
      if (!month) continue;
      let dayLength = 2;
      let day = parseDay(index + 1, dayLength);
      if (!day || day > 31) {
        dayLength = 1;
        day = parseDay(index + 1, dayLength);
      }
      if (!day || day > 31) continue;
      let cursor = index + 1 + dayLength;
      const parsedYear = parseYear(cursor);
      const year = parsedYear.value;
      cursor += parsedYear.length;
      values.push(`${month}/${day}/${year}`);
      if (tokens[cursor] === "or") {
        let alternateLength = 2;
        let alternateDay = parseDay(cursor + 1, alternateLength);
        if (!alternateDay || alternateDay > 31) {
          alternateLength = 1;
          alternateDay = parseDay(cursor + 1, alternateLength);
        }
        if (alternateDay && alternateDay <= 31) values.push(`${month}/${alternateDay}/${year}`);
      }
    }
    return [...new Set(values)];
  }

  function hasAnyUnit(value, units) {
    const tokens = new Set(textTokens(value));
    return units.some(unit => tokens.has(unit));
  }

  function quantityValues(value, unitSequences) {
    const normalized = normalizeText(String(value || "").replace(/(?<=\d),(?=\d{3}\b)/g, ""))
      .replace(/\bp s i\b/g, "psi");
    const tokens = textTokens(normalized);
    const numericTokens = new Set([...NUMBER_WORDS.keys(), "hundred", "thousand", "and"]);
    const values = [];
    for (let index = 0; index < tokens.length; index += 1) {
      const unit = unitSequences.find(sequence => sequence.every((token, offset) => tokens[index + offset] === token));
      if (!unit) continue;
      let start = index - 1;
      while (start >= 0 && (numericTokens.has(tokens[start]) || tokens[start] === "or" || /^\d+$/.test(tokens[start]))) start -= 1;
      const numberText = tokens.slice(start + 1, index).join(" ");
      const candidates = numberValues(numberText);
      if (candidates.length) values.push(...candidates);
    }
    return values;
  }

  function slotExpectedTexts(slot) {
    const extra = [slot?.accepted, slot?.acceptedValues, slot?.aliases, slot?.alternatives]
      .flatMap(value => Array.isArray(value) ? value : value ? [value] : []);
    return [...new Set([slot?.display, slot?.spoken, ...extra].map(value => String(value || "").trim()).filter(Boolean))];
  }

  function cargoCategories(value) {
    const normalized = normalizeText(value);
    const categories = new Set();
    if (/\b(?:car|cars|vehicle|vehicles|automobile|automobiles)\b/.test(normalized)) categories.add("vehicle");
    if (/\b(?:packaged food|food products|groceries)\b/.test(normalized)) categories.add("packaged-food");
    return categories;
  }

  function cargoCategory(value) {
    return [...cargoCategories(value)][0] || "";
  }

  function cargoSlotMatches(response, slot) {
    const expectedTexts = slotExpectedTexts(slot);
    const expectedCategory = expectedTexts.map(cargoCategory).find(Boolean) || "";
    const records = activeSemanticClauseRecords(response);
    const evidence = records.filter(record => !record.negative).map(record => record.normalized).join(" ");
    if (!evidence) return false;
    if (expectedCategory) {
      const actualCategories = new Set([cargoCategory(evidence)].filter(Boolean));
      if (/\b(?:car|cars|vehicle|vehicles|automobile|automobiles)\b/.test(evidence)) actualCategories.add("vehicle");
      if (/\b(?:packaged food|food products|groceries)\b/.test(evidence)) actualCategories.add("packaged-food");
      if (!actualCategories.has(expectedCategory) || actualCategories.size > 1) return false;
      const expectedNumbers = expectedTexts.flatMap(numberValues);
      const actualNumbers = numberValues(evidence);
      if (expectedNumbers.length && actualNumbers.length && actualNumbers.some(value => !expectedNumbers.includes(value))) return false;
      return true;
    }
    return expectedTexts.some(value => containsTokenSequence(evidence, value));
  }

  function datesEquivalent(expected, actual) {
    const [expectedMonth, expectedDay, expectedYear] = String(expected || "").split("/");
    const [actualMonth, actualDay, actualYear] = String(actual || "").split("/");
    return expectedMonth === actualMonth && expectedDay === actualDay && (!expectedYear || expectedYear === actualYear);
  }

  function typedSlotMatches(response, slot) {
    const type = String(slot?.type || "").toLowerCase();
    const records = activeSemanticClauseRecords(response).filter(record => !record.negative);
    const evidence = records.map(record => record.text).join(". ");
    if (/cargo|commodity/.test(type)) return cargoSlotMatches(response, slot);
    if (type === "time") {
      const expectedClock = clockValues(`${slot?.display || ""} ${slot?.spoken || ""}`)[0];
      const actualClocks = records.flatMap(record => clockValues(record.text));
      if (expectedClock) return actualClocks.length > 0 && actualClocks.includes(expectedClock) && actualClocks.every(value => value === expectedClock);
      return containsTokenSequence(normalizedClockText(evidence), normalizedClockText(slot?.spoken));
    }
    if (type === "date") {
      const expectedDates = dateValues(`${slot?.display || ""} ${slot?.spoken || ""}`);
      const actualDates = records.flatMap(record => dateValues(record.text));
      if (expectedDates.length) {
        return actualDates.length > 0
          && expectedDates.every(value => actualDates.some(actual => datesEquivalent(value, actual)))
          && actualDates.every(value => expectedDates.some(expected => datesEquivalent(expected, value)));
      }
      return containsTokenSequence(evidence, slot?.spoken);
    }
    const expectedNumbers = numberValues(slot?.display).length ? numberValues(slot?.display) : numberValues(slot?.spoken);
    let actualNumbers = [];
    if (/^weight(?:-|$)/.test(type)) actualNumbers = records.flatMap(record => quantityValues(record.text, [["pound"], ["pounds"], ["lb"], ["lbs"]]));
    if (type === "pressure") actualNumbers = records.flatMap(record => quantityValues(record.text, [["psi"], ["pound", "per", "square", "inch"], ["pounds", "per", "square", "inch"]]));
    if (type === "duration-hours") actualNumbers = records.flatMap(record => quantityValues(record.text, [["hour"], ["hours"]]));
    if (type === "duration-minutes") actualNumbers = records.flatMap(record => quantityValues(record.text, [["minute"], ["minutes"]]));
    if (actualNumbers.length) {
      return expectedNumbers.length > 0
        && expectedNumbers.every(value => actualNumbers.includes(value))
        && actualNumbers.every(value => expectedNumbers.includes(value));
    }
    if (/^weight(?:-|$)/.test(type) || type === "pressure" || type === "duration-hours" || type === "duration-minutes") return false;
    return null;
  }

  function isDegenerateResponse(response, prompt, minimumTokens = 2) {
    const normalized = normalizeText(response);
    const tokens = textTokens(normalized);
    if (!normalized || tokens.length < minimumTokens) return { invalid: true, reason: "Ответ слишком короткий." };
    if (new Set(tokens).size === 1 && tokens.length > 1) return { invalid: true, reason: "Повтор одного слова не отвечает на задание." };
    if (tokens.every(token => EMPTY_ANSWER_WORDS.has(token))) return { invalid: true, reason: "Нужен ответ по смыслу, а не только yes, no или подтверждение." };
    const normalizedPrompt = normalizeText(prompt);
    const crossLanguageCue = /[\u0400-\u04ff]/i.test(String(prompt || "")) && !/[\u0400-\u04ff]/i.test(String(response || ""));
    if (!crossLanguageCue && normalizedPrompt && normalized === normalizedPrompt) return { invalid: true, reason: "Повтор вопроса или команды не считается ответом." };
    if (!crossLanguageCue && normalizedPrompt && tokenSimilarity(normalized, normalizedPrompt) >= 0.9 && tokens.length <= textTokens(normalizedPrompt).length + 1) {
      return { invalid: true, reason: "Echo prompt не подтверждает понимание. Добавьте собственный рабочий ответ." };
    }
    return { invalid: false, reason: "" };
  }

  function sequencePolarities(record, sequence) {
    const source = textTokens(record?.normalized);
    const expected = textTokens(sequence);
    const values = new Set();
    if (!expected.length || expected.length > source.length) return values;
    for (let start = 0; start <= source.length - expected.length; start += 1) {
      if (!expected.every((token, offset) => source[start + offset] === token)) continue;
      values.add(tokenIsNegated(source, start) ? "negative" : "positive");
    }
    return values;
  }

  function slotMatches(response, slot) {
    if (assertionIntegrityViolations(response).length) return false;
    const typedMatch = typedSlotMatches(response, slot);
    if (typedMatch !== null) return typedMatch;
    const expectedTexts = slotExpectedTexts(slot);
    const expectsNegation = expectedTexts.some(value => textTokens(value).some(token => NEGATION_WORDS.has(token)));
    const records = activeSemanticClauseRecords(response);
    const responseEvidence = records.map(record => record.text).join(". ");
    const affirmativeEvidence = records.filter(record => !record.negative).map(record => record.text).join(". ");
    const fallbackEvidence = expectsNegation ? responseEvidence : affirmativeEvidence;
    if (semanticConstraintConflicts(responseEvidence, expectedTexts.join(" ")).length) return false;
    if (!expectedTexts.length) return true;
    if (expectsNegation && expectedTexts.some(value => containsTokenSequence(responseEvidence, value))) {
      const polarityTarget = textTokens(expectedTexts.find(value => containsTokenSequence(responseEvidence, value)))
        .filter(token => !NEGATION_WORDS.has(token) && !GENERIC_WORDS.has(token))
        .at(-1);
      if (polarityTarget) {
        const polarities = new Set(records.flatMap(record => [...groupPolarities(textTokens(record.normalized), [polarityTarget])]));
        if (!polarities.has("positive")) return true;
      }
    }
    const sequenceStates = new Set(expectedTexts.flatMap(value => records.flatMap(record => [...sequencePolarities(record, value)])));
    const wanted = expectsNegation ? "negative" : "positive";
    const opposite = wanted === "negative" ? "positive" : "negative";
    if (sequenceStates.has(opposite)) return false;
    if (sequenceStates.has(wanted)) return true;
    const compactDisplayNumber = String(slot?.display || "").replace(/[^0-9]/g, "");
    const responseDigitRuns = String(fallbackEvidence || "").match(/[0-9][0-9,.:/]*/g) || [];
    if (compactDisplayNumber && responseDigitRuns.some(value => value.replace(/[^0-9]/g, "") === compactDisplayNumber)) return true;
    const spokenNumbers = numberValues(slot?.spoken);
    const actualNumbers = numberValues(fallbackEvidence);
    if (spokenNumbers.length && spokenNumbers.every(value => actualNumbers.includes(value))) return true;
    const expectedTokens = textTokens(slot?.spoken || slot?.display).filter(token => !GENERIC_WORDS.has(token));
    if (!expectedTokens.length) return false;
    const responseTokens = textTokens(fallbackEvidence);
    const matched = expectedTokens.filter(token => hasToken(responseTokens, token)).length;
    return matched / expectedTokens.length >= 0.75;
  }

  function inferredRequiredGroups(expected) {
    const allTokens = textTokens(expected);
    const unique = [...new Set(allTokens.filter(token => !GENERIC_WORDS.has(token) && !/^\d+$/.test(token)))];
    if (unique.length < 2) {
      for (const token of allTokens) {
        if (!["do", "here", "apply", "listed"].includes(token) || unique.includes(token)) continue;
        unique.push(token);
      }
    }
    if (!unique.length) return [];
    const maximum = unique.length <= 3 ? unique.length : Math.min(4, Math.ceil(unique.length * 0.55));
    return unique.slice(0, maximum).map(token => [token]);
  }

  function escapedPhrase(value) {
    return normalizeText(value).split(" ").filter(Boolean).map(token => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  }

  function expectedSlotTexts(slots, predicate) {
    const rows = (Array.isArray(slots) ? slots : []).filter(slot => predicate(slot));
    return [...new Set(rows.flatMap(slotExpectedTexts).map(normalizeText).filter(Boolean))];
  }

  function taskRelationMatches(response, relation, expected = "", slots = []) {
    const records = activeSemanticClauseRecords(response);
    const focus = records.map(record => record.normalized).join(" ");
    if (/\bor\b/.test(focus) && !/\bor\b/.test(normalizeText(expected))) return false;
    if (relation === "inspection-lane-entry") {
      return records.some(record => {
        if (record.negative || /\b(?:past|away from|out of)\s+(?:the\s+)?inspection\s+lane\b/.test(record.normalized)) return false;
        return /\b(?:i\s+)?(?:will\s+|ill\s+)?enter(?:ed|ing)?\s+(?:the\s+)?inspection\s+lane\b/.test(record.normalized)
          || /\b(?:pull|drive|move)(?:ed|ing)?\s+(?:safely\s+)?(?:into|to)\s+(?:the\s+)?inspection\s+lane\b/.test(record.normalized);
      });
    }
    if (relation === "unit-identification-from-expected") {
      const powerUnits = expectedSlotTexts(slots, slot => /power-unit|truck|pickup/.test(`${slot?.type || ""} ${slot?.name || ""}`));
      const trailers = expectedSlotTexts(slots, slot => /trailer/.test(`${slot?.type || ""} ${slot?.name || ""}`));
      if (!powerUnits.length || !trailers.length) return false;
      const roleMatches = (rolePattern, identifiers) => identifiers.some(identifier => {
        const value = escapedPhrase(identifier);
        return new RegExp(`\\b(?:${rolePattern})(?:\\s+number)?\\s+(?:is\\s+)?${value}\\b`).test(focus)
          || new RegExp(`\\b${value}\\s+is\\s+(?:the\\s+|my\\s+)?(?:${rolePattern})(?:\\s+number)?\\b`).test(focus);
      });
      return roleMatches("truck|pickup|power\\s+unit", powerUnits)
        && roleMatches("trailer", trailers);
    }
    if (["origin-columbus-ohio", "origin-from-expected"].includes(relation)) {
      const locations = expectedSlotTexts(slots, slot => /location|origin/.test(`${slot?.type || ""} ${slot?.name || ""}`));
      if (!locations.length && /columbus\s+ohio/.test(normalizeText(expected))) locations.push("columbus ohio");
      if (!locations.length) return false;
      const assertions = records.filter(record => /\b(?:picked\s+up|came|coming|left|started|origin)\b/.test(record.normalized));
      if (!assertions.length) return false;
      return assertions.every(record => {
        if (record.negative) return false;
        return locations.some(location => {
          const place = escapedPhrase(location);
          return new RegExp(`\\bpicked\\s+up\\s+(?:in|from)\\s+${place}\\b`).test(record.normalized)
            || new RegExp(`\\b(?:came|coming)\\s+from\\s+${place}\\b`).test(record.normalized)
            || new RegExp(`\\b(?:left|started\\s+(?:in|from))\\s+${place}\\b`).test(record.normalized)
            || new RegExp(`\\borigin\\s+(?:is|was)\\s+${place}\\b`).test(record.normalized)
            || new RegExp(`\\b${place}\\s+(?:is|was)\\s+(?:my\\s+)?origin\\b`).test(record.normalized);
        });
      });
    }
    if (relation === "destination-from-expected") {
      const locations = expectedSlotTexts(slots, slot => /location|destination/.test(`${slot?.type || ""} ${slot?.name || ""}`));
      if (!locations.length) return false;
      const assertions = records.filter(record => /\b(?:deliver|delivering|destination|going|headed|bound)\b/.test(record.normalized));
      if (!assertions.length) return false;
      return assertions.every(record => {
        if (record.negative || /\b(?:from|left|origin)\b/.test(record.normalized)) return false;
        return locations.some(location => {
          const place = escapedPhrase(location);
          return new RegExp(`\\b(?:deliver|delivering)(?:ed|ing)?\\s+(?:the\\s+load\\s+)?(?:to|in)\\s+${place}\\b`).test(record.normalized)
            || new RegExp(`\\b(?:going|headed|bound)\\s+(?:to|for)\\s+${place}\\b`).test(record.normalized)
            || new RegExp(`\\b(?:my\\s+)?(?:final\\s+)?destination\\s+(?:is|will\\s+be)\\s+${place}\\b`).test(record.normalized)
            || new RegExp(`\\b${place}\\s+is\\s+(?:my\\s+)?(?:final\\s+)?destination\\b`).test(record.normalized);
        });
      });
    }
    if (["cargo-packaged-food", "cargo-from-expected"].includes(relation)) {
      const cargoTexts = expectedSlotTexts(slots, slot => /cargo|commodity/.test(`${slot?.type || ""} ${slot?.name || ""}`));
      if (!cargoTexts.length && /packaged\s+food/.test(normalizeText(expected))) cargoTexts.push("packaged food");
      if (!cargoTexts.length) return false;
      const expectedCategories = new Set(cargoTexts.map(cargoCategory).filter(Boolean));
      const textMatches = text => cargoTexts.some(cargo => containsTokenSequence(text, cargo))
        || (expectedCategories.has("vehicle") && /\b(?:car|cars|vehicle|vehicles|automobile|automobiles)\b/.test(text))
        || (expectedCategories.has("packaged-food") && /\b(?:packaged food|food products|groceries)\b/.test(text));
      const assertions = records.filter(record => /\b(?:haul|hauling|carry|carrying|transport|transporting)\b/.test(record.normalized)
        || textMatches(record.normalized)
        || Boolean(cargoCategory(record.normalized)));
      if (!assertions.length) return records.some(record => !record.negative && textMatches(record.normalized) && textTokens(record.normalized).length <= 5);
      return assertions.every(record => !record.negative && textMatches(record.normalized));
    }
    if (["carrier-training-carrier", "carrier-from-expected"].includes(relation)) {
      const organizations = expectedSlotTexts(slots, slot => /organization|carrier|employer/.test(`${slot?.type || ""} ${slot?.name || ""}`));
      if (!organizations.length && /training\s+carrier/.test(normalizeText(expected))) organizations.push("training carrier");
      const assertions = records.filter(record => /\b(?:drive|driving|work|working)\s+for\b/.test(record.normalized)
        || /\b(?:employer|carrier|company)\s+is\b/.test(record.normalized)
        || /\bis\s+my\s+(?:employer|carrier|company)\b/.test(record.normalized));
      return assertions.length > 0 && assertions.every(record => !record.negative && organizations.some(organization => {
        const name = escapedPhrase(organization);
        return new RegExp(`\\b(?:drive|driving|work|working)\\s+for\\s+${name}\\b`).test(record.normalized)
          || new RegExp(`\\b${name}\\s+is\\s+my\\s+(?:employer|carrier|company)\\b`).test(record.normalized)
          || new RegExp(`\\bmy\\s+(?:employer|carrier|company)\\s+is\\s+${name}\\b`).test(record.normalized);
      }));
    }
    if (relation === "status-on-duty-not-driving") {
      return /\bon\s+duty\b/.test(focus) && /\bnot\s+driving\b/.test(focus);
    }
    return true;
  }

  function semanticConstraintConflicts(response, expected) {
    const records = activeSemanticClauseRecords(response);
    const expectedTokens = textTokens(expected);
    const actualPolarities = group => new Set(records.flatMap(record => [...groupPolarities(textTokens(record.normalized), group)]));
    const actualHasPositive = group => records.some(record => groupPolarities(textTokens(record.normalized), group).has("positive"));
    const expectedPolarities = group => groupPolarities(expectedTokens, group);
    const expectedHasPositive = group => expectedPolarities(group).has("positive");
    const conflicts = [];
    const statePairs = [
      [["on"], ["off"]],
      [["open"], ["closed", "close"]],
      [["before"], ["after"]],
      [["left"], ["right"]],
      [["front"], ["rear"]],
      [["stop", "stopped", "stopping"], ["go", "going"]],
      [["reduce speed", "slow down"], ["increase speed", "speed up"]],
      [["set", "applied"], ["release", "released"]],
      [["loaded"], ["empty"]],
      [["match", "matches"], ["mismatch"]],
      [["intact"], ["broken", "damaged"]],
    ];
    for (const [left, right] of statePairs) {
      const wantsLeft = expectedPolarities(left);
      const wantsRight = expectedPolarities(right);
      if (wantsLeft.size && wantsRight.size) continue;
      if (wantsLeft.size && [...wantsLeft].some(polarity => {
        const opposite = polarity === "negative" ? "positive" : "negative";
        return actualPolarities(right).has(polarity) || actualPolarities(left).has(opposite);
      })) conflicts.push(`${left[0]}:${right[0]}`);
      if (wantsRight.size && [...wantsRight].some(polarity => {
        const opposite = polarity === "negative" ? "positive" : "negative";
        return actualPolarities(left).has(polarity) || actualPolarities(right).has(opposite);
      })) conflicts.push(`${right[0]}:${left[0]}`);
    }
    const expectedRelation = [["for"], ["to"], ["in"], ["from"]].some(group => expectedHasPositive(group));
    if (expectedRelation && actualHasPositive(["away"]) && containsTokenSequence(records.map(record => record.normalized).join(" "), "away from")) {
      conflicts.push("relation:away-from");
    }
    const actualText = records.map(record => record.normalized).join(" ");
    const expectedCargoCategories = cargoCategories(expected);
    const actualCargoCategories = cargoCategories(actualText);
    const expectedCargoContext = /\b(?:haul|hauling|carry|carrying|transport|transporting|cargo|commodity|load)\b/.test(normalizeText(expected));
    if (expectedCargoContext
      && expectedCargoCategories.size === 1
      && [...actualCargoCategories].some(category => !expectedCargoCategories.has(category))) {
      conflicts.push("cargo:conflicting-category");
    }
    if (containsTokenSequence(expected, "leased") && containsTokenSequence(actualText, "carrier owned")) conflicts.push("leased:carrier-owned");
    if (containsTokenSequence(expected, "carrier owned") && actualHasPositive(["leased"])) conflicts.push("carrier-owned:leased");
    if (containsTokenSequence(expected, "trailer brakes set")
      && (containsTokenSequence(actualText, "trailer brakes released") || containsTokenSequence(actualText, "release the trailer brakes"))) {
      conflicts.push("trailer-brakes:set-released");
    }
    if (containsTokenSequence(expected, "tractor brakes released")
      && (containsTokenSequence(actualText, "tractor brakes set") || containsTokenSequence(actualText, "set the tractor brakes"))) {
      conflicts.push("tractor-brakes:released-set");
    }
    if (containsTokenSequence(expected, "not park") && !containsTokenSequence(actualText, "not park")) {
      conflicts.push("action:not-park");
    }
    return conflicts;
  }

  function failedSemanticResult(feedback, missing, evaluator = "semantic-slots") {
    return { pass: false, score: 0, evaluator, feedback, matched: [], missing: Array.isArray(missing) ? missing : [missing] };
  }

  function branchConflictViolations(response, policy) {
    if (!policy || typeof policy !== "object") return [];
    const normalized = normalizeText(response);
    const violations = [];
    const requiredCues = (Array.isArray(policy.requiredBranchCues) ? policy.requiredBranchCues : []).map(normalizeText).filter(Boolean);
    const forbiddenCues = (Array.isArray(policy.forbiddenBranchCues) ? policy.forbiddenBranchCues : []).map(normalizeText).filter(Boolean);
    if (requiredCues.length && !requiredCues.some(cue => containsTokenSequence(normalized, cue))) violations.push("branch-cue");
    if (forbiddenCues.some(cue => containsTokenSequence(normalized, cue))) violations.push("conflicting-branch-cue");
    const requiredDistances = [...new Set((Array.isArray(policy.requiredDistanceValuesFeet) ? policy.requiredDistanceValuesFeet : []).map(Number).filter(Number.isFinite))];
    if (requiredDistances.length) {
      const actualDistances = [...new Set(quantityValues(response, [["feet"], ["foot"], ["ft"]]).map(Number).filter(Number.isFinite))];
      if (requiredDistances.some(value => !actualDistances.includes(value))) violations.push("required-distance-values");
      if (policy.rejectUnexpectedDistanceValues === true && actualDistances.some(value => !requiredDistances.includes(value))) violations.push("unexpected-distance-values");
      if (policy.distanceMode === "exact-set" && actualDistances.length !== requiredDistances.length) violations.push("distance-set");
    }
    const requiredRegulation = normalizeText(policy.requiredRegulation);
    const forbiddenRegulation = normalizeText(policy.forbiddenRegulation);
    if (requiredRegulation && !containsTokenSequence(normalized, requiredRegulation)) violations.push("required-regulation");
    if (forbiddenRegulation && containsTokenSequence(normalized, forbiddenRegulation)) violations.push("forbidden-regulation");
    const tiedownValues = [...new Set(quantityValues(response, [
      ["tiedowns"],
      ["tiedown"],
      ["tie", "downs"],
      ["tie", "down"],
    ]).map(Number).filter(Number.isFinite))];
    const requiredMinimumTiedowns = Number(policy.requiredMinimumTiedowns);
    const forbiddenMinimumTiedowns = Number(policy.forbiddenMinimumTiedowns);
    if (Number.isFinite(requiredMinimumTiedowns) && !tiedownValues.includes(requiredMinimumTiedowns)) violations.push("required-minimum-tiedowns");
    if (Number.isFinite(forbiddenMinimumTiedowns) && tiedownValues.includes(forbiddenMinimumTiedowns)) violations.push("forbidden-minimum-tiedowns");
    if (policy.minimumAnswerStrict === true
      && Number.isFinite(requiredMinimumTiedowns)
      && tiedownValues.some(value => value !== requiredMinimumTiedowns)) {
      violations.push("unexpected-tiedown-count");
    }
    return [...new Set(violations)];
  }

  function earliestEventViolations(response, policy) {
    if (!policy || typeof policy !== "object") return [];
    const normalized = normalizeText(response);
    const eventMentioned = eventId => {
      if (eventId === "duty-status-change") return containsTokenSequence(normalized, "duty status change");
      if (eventId === "three-hours") {
        return quantityValues(response, [["hours"], ["hour"]]).map(Number).includes(3);
      }
      if (eventId === "one-hundred-fifty-miles") {
        return quantityValues(response, [["miles"], ["mile"]]).map(Number).includes(150);
      }
      return containsTokenSequence(normalized, String(eventId || "").replaceAll("-", " "));
    };
    const candidates = [...new Set((Array.isArray(policy.candidateEventIds) ? policy.candidateEventIds : []).map(String).filter(Boolean))];
    const mentioned = candidates.filter(eventMentioned);
    const expected = String(policy.expectedEventId || "");
    const violations = [];
    if (policy.missingEarliestEventFails === true && expected && !mentioned.includes(expected)) violations.push("missing-earliest-event");
    if (policy.mustChooseExactlyOne === true && mentioned.length !== 1) violations.push("single-earliest-event-required");
    if (mentioned.length === 1 && expected && mentioned[0] !== expected) violations.push("wrong-earliest-event");
    if (policy.rejectAndAsDeadlineLogic === true && mentioned.length > 1) violations.push("combined-deadline-events");
    return [...new Set(violations)];
  }

  function computationPolicyViolations(response, policy) {
    if (!policy || typeof policy !== "object") return [];
    const expected = Number(policy.expectedOdometerMiles);
    const deadline = Number(policy.deadlineMiles);
    if (!Number.isFinite(expected)) return ["invalid-computation-policy"];
    const values = numberValues(response).map(Number).filter(Number.isFinite);
    const violations = [];
    if (!values.includes(expected)) violations.push("missing-computed-odometer");
    if (policy.operation === "trip-start-plus-deadline") {
      const tripStart = Number.isFinite(deadline) ? expected - deadline : NaN;
      const allowed = new Set([expected]);
      if (Number.isFinite(deadline)) allowed.add(deadline);
      if (Number.isFinite(tripStart)) allowed.add(tripStart);
      const odometerScale = Math.max(1000, Number.isFinite(tripStart) ? Math.floor(tripStart * 0.5) : 1000);
      if (values.some(value => value >= odometerScale && !allowed.has(value))) violations.push("conflicting-computed-odometer");
    }
    if (policy.genericRuleStatementFails === true && !values.includes(expected)) {
      violations.push("generic-rule-without-computation");
    }
    return [...new Set(violations)];
  }

  function exceptionDecisionViolations(response, policy) {
    if (!policy || typeof policy !== "object") return [];
    const normalized = normalizeText(response);
    const negativeDecision = /\b(?:the\s+)?exception\s+(?:(?:does|did|will|would)\s+)?not\s+(?:apply|applies)|\b(?:the\s+)?exception\s+is\s+not\s+applicable|\bno\s+exception\s+applies\b/.test(normalized);
    const positiveDecision = !negativeDecision && /\b(?:the\s+)?exception\s+(?:applies|apply|is\s+applicable)\b/.test(normalized);
    const decision = negativeDecision ? "exception-does-not-apply" : positiveDecision ? "exception-applies" : "";
    const expected = String(policy.expectedDecision || "");
    const sealed = /\bseal(?:ed)?\b/.test(normalized);
    const notOrdered = /\b(?:was|is|were|are)?\s*not\s+(?:specifically\s+)?(?:ordered|instructed|told)\b/.test(normalized);
    const orderedNotToOpen = !notOrdered && (/(?:ordered|instructed|told)\s+not\s+to\s+open\b/.test(normalized)
      || /\b(?:prohibited|forbidden)\s+from\s+open(?:ing)?\b/.test(normalized)
      || /\bnot\s+allowed\s+to\s+open\b/.test(normalized));
    const impracticable = /\b(?:impracticable|impractical)\b|\b(?:cannot|can\s+not|could\s+not)\s+be\s+inspect(?:ed|able)\b/.test(normalized);
    const practicable = !impracticable && /\bpracticable\b|\bcan\s+be\s+inspect(?:ed|able)\b/.test(normalized);
    const allowsImpracticable = policy.impracticableInspectionIsIndependentException === true;
    const violations = [];
    if (!decision) violations.push("missing-exception-decision");
    else if (expected && decision !== expected) violations.push("wrong-exception-decision");
    if (policy.genericExceptionStatementFails === true && !sealed && !orderedNotToOpen && !impracticable && !practicable) {
      violations.push("missing-exception-reason");
    }
    if (positiveDecision && policy.sealedRequiresOrderedNotToOpen === true && sealed && !impracticable && !orderedNotToOpen) {
      violations.push("sealed-without-order");
    }
    if (positiveDecision && policy.rejectUniversalSealedException === true && sealed && !impracticable && !orderedNotToOpen) {
      violations.push("universal-sealed-exception");
    }
    if (expected === "exception-applies" && positiveDecision && !(allowsImpracticable && impracticable) && !(sealed && orderedNotToOpen)) {
      violations.push("missing-applicable-exception-basis");
    }
    if (expected === "exception-does-not-apply" && allowsImpracticable && impracticable) violations.push("impracticable-exception-ignored");
    return [...new Set(violations)];
  }

  function evaluateSemanticBranch(input = {}) {
    const response = String(input.response || "").trim();
    const prompt = String(input.prompt || "");
    const expected = String(input.expected || "");
    const rubric = input.rubric || {};
    const minimumTokens = Number(rubric.minTokens || input.minTokens || 2);
    const integrityErrors = assertionIntegrityViolations(response);
    if (integrityErrors.length) {
      return failedSemanticResult(
        integrityErrors.includes("refusal")
          ? "Отказ отвечать не может быть объединен с ключевыми словами модели. Дайте один фактический ответ."
          : "Ответ явно отрицает или отзывает собственное утверждение.",
        integrityErrors.map(value => `integrity:${value}`),
      );
    }
    const slots = Array.isArray(input.slots) ? input.slots : [];
    const branchErrors = [
      ...branchConflictViolations(response, rubric.branchConflictPolicy),
      ...computationPolicyViolations(response, rubric.computationPolicy),
      ...earliestEventViolations(response, rubric.earliestEventPolicy),
      ...exceptionDecisionViolations(response, rubric.exceptionDecisionPolicy),
    ];
    if (normalizeText(response) === normalizeText(expected) && expected) {
      const missingSlots = slots.filter(slot => !slotMatches(response, slot));
      if (!missingSlots.length && !branchErrors.length) {
        return { pass: true, score: 1, evaluator: slots.length ? "semantic-slots" : "productive-rubric", feedback: "Ключевой смысл и обязательные значения совпали.", matched: [normalizeText(expected)], missing: [] };
      }
    }
    const degenerate = isDegenerateResponse(response, prompt, minimumTokens);
    if (degenerate.invalid) {
      return { pass: false, score: 0, evaluator: "semantic-slots", feedback: degenerate.reason, matched: [], missing: ["meaningful-response"] };
    }

    const responseRecords = activeSemanticClauseRecords(response);
    const expectedTokens = textTokens(expected);
    const groups = Array.isArray(rubric.requiredGroups) && rubric.requiredGroups.length
      ? rubric.requiredGroups
      : inferredRequiredGroups(expected);
    const matched = [];
    const missing = [];
    for (const group of groups) {
      const values = Array.isArray(group) ? group : [group];
      const normalizedGroup = values.map(normalizeText).filter(Boolean);
      const wanted = groupPolarity(expectedTokens, normalizedGroup) || "positive";
      const found = responseRecords.some(record => groupPolarities(textTokens(record.normalized), normalizedGroup).has(wanted));
      (found ? matched : missing).push(values.join("/"));
    }

    const missingSlots = slots.filter(slot => !slotMatches(response, slot));
    const polarityErrors = polarityConflicts(response, expected, groups);
    const constraintErrors = semanticConstraintConflicts(response, input.constraintExpected || expected);
    const relationError = rubric.taskRelation && !taskRelationMatches(response, rubric.taskRelation, expected, slots)
      ? `relation:${rubric.taskRelation}`
      : "";
    const requiredRatio = Number.isFinite(Number(rubric.requiredRatio)) ? Number(rubric.requiredRatio) : 1;
    const groupRatio = groups.length ? matched.length / groups.length : tokenSimilarity(response, expected);
    const coherentGroupRatio = groups.length
      ? Math.max(0, ...responseRecords.map(record => {
          const tokens = textTokens(record.normalized);
          const clauseMatches = groups.filter(group => {
            const values = (Array.isArray(group) ? group : [group]).map(normalizeText).filter(Boolean);
            const wanted = groupPolarity(expectedTokens, values) || "positive";
            return groupPolarities(tokens, values).has(wanted);
          }).length;
          return clauseMatches / groups.length;
        }))
      : groupRatio;
    const incoherentAssertion = !rubric.taskRelation
      && responseRecords.length > 1
      && groupRatio >= requiredRatio
      && !(input.alternativeBranch && containsTokenSequence(response, expected))
      && coherentGroupRatio + 0.01 < requiredRatio;
    const pass = groupRatio >= requiredRatio
      && missingSlots.length === 0
      && polarityErrors.length === 0
      && constraintErrors.length === 0
      && branchErrors.length === 0
      && !relationError
      && !incoherentAssertion;
    const unmetGroups = groupRatio >= requiredRatio ? [] : missing;
    const feedbackParts = [];
    if (missingSlots.length) feedbackParts.push(`Не совпали значения: ${missingSlots.map(slot => slot.name || slot.type || slot.display).join(", ")}.`);
    if (unmetGroups.length) feedbackParts.push(`Не хватает ключевого смысла: ${unmetGroups.join(", ")}.`);
    if (polarityErrors.length) feedbackParts.push(`Смысл изменен отрицанием: ${polarityErrors.join(", ")}.`);
    if (constraintErrors.length) feedbackParts.push(`Смысл изменен противоположным состоянием или направлением: ${constraintErrors.join(", ")}.`);
    if (branchErrors.some(value => value.includes("computed-odometer") || value.includes("computation") || value.includes("generic-rule"))) feedbackParts.push("Рассчитайте точное показание одометра по видимому началу рейса и сроку, одного общего правила недостаточно.");
    if (branchErrors.some(value => value.includes("earliest") || value.includes("deadline-event"))) feedbackParts.push("Выберите одно событие, которое наступает раньше остальных видимых сроков.");
    if (branchErrors.some(value => value.includes("exception") || value.includes("sealed") || value.includes("order"))) feedbackParts.push("Решение об исключении должно совпадать с видимыми условиями и содержать применимое основание.");
    if (branchErrors.some(value => !value.includes("computed-odometer") && !value.includes("computation") && !value.includes("generic-rule") && !value.includes("earliest") && !value.includes("deadline-event") && !value.includes("exception") && !value.includes("sealed") && !value.includes("order"))) feedbackParts.push("Ответ смешивает взаимоисключающие нормативные ветки или не содержит обязательные значения выбранной ветки.");
    if (relationError) feedbackParts.push("Ключевые слова не связаны с требуемым направлением, объектом или текущим статусом.");
    if (incoherentAssertion) feedbackParts.push("Дайте одну связную рабочую реплику, а не отдельные фрагменты с нужными словами.");
    if (!feedbackParts.length) feedbackParts.push("Ключевой смысл и обязательные значения совпали.");
    return {
      pass,
      score: Math.max(0, Math.min(1, groups.length || slots.length ? (matched.length + (slots.length - missingSlots.length)) / Math.max(1, groups.length + slots.length) : tokenSimilarity(response, expected))),
      evaluator: slots.length ? "semantic-slots" : "productive-rubric",
      feedback: feedbackParts.join(" "),
      matched,
      missing: [...unmetGroups, ...missingSlots.map(slot => slot.name || slot.type || "slot"), ...polarityErrors.map(value => `polarity:${value}`), ...constraintErrors.map(value => `constraint:${value}`), ...branchErrors.map(value => `branch:${value}`), ...(relationError ? [relationError] : []), ...(incoherentAssertion ? ["coherent-assertion"] : [])],
    };
  }

  function expectedAlternatives(input = {}) {
    const explicit = Array.isArray(input.alternatives) ? input.alternatives : [];
    const source = explicit.length ? explicit : String(input.expected || "").split(/\s+\/\s+/);
    return source.map(value => String(value || "").trim()).filter(Boolean);
  }

  function slotsForAlternative(slots, branch, alternatives) {
    return (Array.isArray(slots) ? slots : []).filter(slot => {
      const owners = alternatives.filter(candidate => slotMatches(candidate, slot));
      return !owners.length || owners.includes(branch);
    });
  }

  function evaluateSemanticResponse(input = {}) {
    const alternatives = expectedAlternatives(input);
    if (alternatives.length <= 1) return evaluateSemanticBranch({ ...input, expected: alternatives[0] || input.expected || "" });
    const results = alternatives.map(branch => {
      const branchRubric = input.completeAlternatives
        ? {
            ...(input.rubric || {}),
            requiredGroups: [...new Set(textTokens(branch).filter(token => !GENERIC_WORDS.has(token)))].map(token => [token]),
            requiredRatio: 1,
          }
        : input.rubric;
      return evaluateSemanticBranch({
        ...input,
        expected: branch,
        constraintExpected: alternatives.join(" or "),
        alternativeBranch: true,
        rubric: branchRubric,
        slots: slotsForAlternative(input.slots || [], branch, alternatives),
      });
    });
    const passing = results.map((result, index) => ({ result, index })).filter(row => row.result.pass);
    if (passing.length === 1 || (passing.length > 1 && input.alternativesExclusive === false)) {
      return { ...passing[0].result, evaluator: "semantic-alternative", alternativeIndex: passing[0].index };
    }
    const best = results.reduce((current, candidate) => Number(candidate.score || 0) > Number(current.score || 0) ? candidate : current, results[0]);
    if (passing.length > 1) {
      return {
        ...best,
        pass: false,
        evaluator: "semantic-alternative",
        feedback: "Ответ смешивает взаимоисключающие варианты. Выберите и утверждайте только один применимый факт.",
        missing: [...new Set([...(best.missing || []), "conflicting-alternatives"])],
      };
    }
    return { ...best, pass: false, evaluator: "semantic-alternative" };
  }

  function evaluateExactRecall(input = {}) {
    const response = String(input.response || "").trim();
    const expected = String(input.expected || "").trim();
    const degenerate = isDegenerateResponse(response, input.prompt || "", 1);
    if (degenerate.invalid) return { pass: false, score: 0, evaluator: "exact", feedback: degenerate.reason, matched: [], missing: ["exact-recall"] };
    const normalizedResponse = normalizeText(response);
    const normalizedExpected = normalizeText(expected);
    const similarity = orderedTokenSimilarity(normalizedResponse, normalizedExpected);
    const pass = normalizedResponse === normalizedExpected || limitedOrderedTypoMatch(normalizedResponse, normalizedExpected);
    return {
      pass,
      score: similarity,
      evaluator: "exact",
      feedback: pass ? "Форма совпала с ключом." : "Форма не совпала. Проверьте ключевые слова и порядок фразы.",
      matched: pass ? [normalizedExpected] : [],
      missing: pass ? [] : [normalizedExpected],
    };
  }

  function normalizeMultilingual(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function normalizeMeaningAssertion(value) {
    return normalizeMultilingual(value)
      .replace(/(?:меня зовут|мое имя|моё имя)/g, " имя ")
      .replace(/(?:я работаю водителем|я водитель)(?= |$)/g, " водитель ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function russianMeaningConcept(token) {
    const value = String(token || "");
    if (/^(?:прибыл|прибыла|прибыли|приехал|приехала|приехали)$/.test(value)) return "прибытие";
    if (/^работ/.test(value)) return "работа";
    if (/^водител/.test(value)) return "водитель";
    if (/^включ/.test(value)) return "включено";
    if (/^фар(?:а|ы|у|ой|е)?$/.test(value)) return "фара";
    if (!/^[а-яё]{6,}$/u.test(value)) return value;
    const stemmed = value.replace(/(?:иями|ами|ями|ого|ему|ому|ыми|ими|ой|ей|ах|ях|ам|ям|ом|ем|ов|ев|ы|и|а|я|у|ю|е)$/u, "");
    return stemmed.length >= 4 ? stemmed : value;
  }

  function evaluateMeaningRecall(response, expected) {
    const actual = normalizeMeaningAssertion(response);
    const target = normalizeMeaningAssertion(expected);
    const actualTokens = actual.split(" ").filter(Boolean);
    const targetTokens = target.split(" ").filter(Boolean);
    const result = (pass, score, feedback, matched = [], missing = []) => ({
      pass,
      score,
      evaluator: "lesson-reception-key",
      feedback,
      matched,
      missing,
    });
    if (!targetTokens.length || actualTokens.length < 2) {
      return result(false, 0, "Передайте по-русски ключевой смысл услышанной реплики.", [], ["meaningful-response"]);
    }

    const repudiationWords = new Set(["неверно", "неправильно", "ложно", "ошибка", "ошибочно"]);
    if (actualTokens.some(token => repudiationWords.has(token))) {
      return result(false, 0, "Явное опровержение отзывает переданный смысл.", [], ["integrity:repudiation"]);
    }
    const joined = ` ${actual} `;
    const supersedingMeaning = [
      /(?:^| )(?:смысл|значение|утверждение|фраза|реплика)(?= |$).{0,60}(?:противополож\p{L}*|обрат\p{L}*|наоборот|друг\p{L}*)/u,
      /(?:^| )(?:на самом деле|в действительности|фактически)(?= |$).{0,60}(?:противополож\p{L}*|обрат\p{L}*|наоборот|друг\p{L}*)/u,
      /(?:^| )(?:означает|значит) (?:обратное|противоположное|другое)(?= |$)/u,
      /(?:^| )(?:но|однако) (?:на самом деле|в действительности|фактически)(?= |$)/u,
    ].some(pattern => pattern.test(actual));
    if (supersedingMeaning) {
      return result(false, 0, "Дополнительная оговорка заменяет или обращает переданный смысл.", [], ["integrity:superseding-assertion"]);
    }
    const refusalPhrases = [
      " не знаю ",
      " не понимаю ",
      " отказываюсь отвечать ",
      " отказываюсь ответить ",
      " не буду отвечать ",
      " без ответа ",
    ];
    if (refusalPhrases.some(phrase => joined.includes(phrase))) {
      return result(false, 0, "Отказ не подтверждает понимание услышанной реплики.", [], ["integrity:refusal"]);
    }

    const stop = new Set(["и", "а", "но", "в", "во", "на", "по", "с", "со", "для", "это", "этот", "эта", "что", "у", "к", "из", "мой", "моя", "мое", "я"]);
    const negationTokens = new Set(["не", "нет", "нельзя", "никогда", "без"]);
    const actualConcepts = actualTokens.map(russianMeaningConcept);
    const actualSet = new Set(actualConcepts);
    const contentTargets = targetTokens.filter(token => !stop.has(token) && !negationTokens.has(token)).map(russianMeaningConcept);
    const matched = contentTargets.filter(token => actualSet.has(token));
    const ratio = contentTargets.length ? matched.length / contentTargets.length : 0;
    const actualContent = actualTokens.filter(token => !stop.has(token) && !negationTokens.has(token)).map(russianMeaningConcept);
    const orderedMatches = (() => {
      const rows = Array.from({ length: contentTargets.length + 1 }, () => Array(actualContent.length + 1).fill(0));
      for (let left = 1; left <= contentTargets.length; left += 1) {
        for (let right = 1; right <= actualContent.length; right += 1) {
          rows[left][right] = contentTargets[left - 1] === actualContent[right - 1]
            ? rows[left - 1][right - 1] + 1
            : Math.max(rows[left - 1][right], rows[left][right - 1]);
        }
      }
      return rows[contentTargets.length][actualContent.length];
    })();
    const coherentOrder = !contentTargets.length || orderedMatches / contentTargets.length >= 0.6;
    const targetNegations = targetTokens.filter(token => negationTokens.has(token));
    const actualNegations = actualTokens.filter(token => negationTokens.has(token));
    const negativeAnchors = tokens => tokens.flatMap((token, index) => {
      if (!negationTokens.has(token)) return [];
      const following = tokens.slice(index + 1, index + 4).filter(value => !stop.has(value) && !negationTokens.has(value));
      return following.slice(0, 2).map(anchor => `${token}:${anchor}`);
    });
    const targetAnchors = negativeAnchors(targetTokens);
    const actualAnchors = new Set(negativeAnchors(actualTokens));
    const polarityMismatch = targetNegations.length !== actualNegations.length
      || targetAnchors.some(anchor => !actualAnchors.has(anchor));
    const targetNumbers = targetTokens.filter(token => /^\d+$/.test(token));
    const actualNumbers = new Set(actualTokens.filter(token => /^\d+$/.test(token)));
    const numbersMatch = targetNumbers.every(value => actualNumbers.has(value));
    const pass = !polarityMismatch && numbersMatch && ratio >= 0.7 && coherentOrder;
    const coherentDifferentMeaning = !coherentOrder
      && ratio < 0.4
      && actualContent.length >= 3
      && actualContent.length <= Math.max(4, Math.ceil(contentTargets.length * 0.6));
    const missing = contentTargets.filter(token => !actualSet.has(token));
    if (polarityMismatch) missing.push("polarity");
    if (!numbersMatch) missing.push("numbers");
    if (!coherentOrder) missing.push("coherent-assertion");
    return result(
      pass,
      pass ? 1 : ratio,
      pass
        ? "Смысл услышанной реплики подтвержден."
        : polarityMismatch
          ? "Отрицание меняет смысл услышанной реплики."
          : coherentDifferentMeaning
            ? "Ответ связный, но передает другой смысл. Сверьте действие и объект."
            : !coherentOrder
            ? "Передайте смысл связным утверждением, а не набором ключевых слов."
            : "Передайте по-русски ключевой смысл услышанной реплики, включая числа и объект действия.",
      matched,
      [...new Set(missing)],
    );
  }

  function exampleGapCue(item = {}) {
    const example = String(item.example || "").trim();
    const word = String(item.word || "").trim();
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const masked = escaped ? example.replace(new RegExp(escaped, "ig"), "____") : "";
    if (masked !== example && masked.includes("____")) return masked;
    const irregular = {
      become: ["became", "become"], bring: ["brought", "bring"], catch: ["caught", "catch"], come: ["came", "come"],
      fall: ["fell", "fallen", "fall"], get: ["got", "gotten", "get"], give: ["gave", "given", "give"], have: ["had", "have"],
      make: ["made", "make"], pay: ["paid", "pay"], try: ["tried", "trying", "try"],
    };
    const ignored = new Set(["a", "an", "and", "be", "of", "the", "to"]);
    let contextual = example;
    for (const token of textTokens(word)) {
      if (token.length < 3 || ignored.has(token)) continue;
      const forms = targetMorphologicalForms(token, irregular[token] || []);
      const pattern = forms
        .sort((left, right) => right.length - left.length)
        .map(form => form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|");
      contextual = contextual.replace(new RegExp(`\\b(?:${pattern})\\b`, "ig"), "____");
    }
    if (contextual !== example) return contextual.replace(/(?:____[\s,;:/-]*){2,}/g, "____ ").trim();
    return `Дайте целевую английскую реплику или единицу для этого контекста: ${example}`;
  }

  function questionAttemptVariant(options = {}) {
    const baseVariant = String(options.baseVariant || "direct-response");
    if (options.gateQuestion) return baseVariant;
    if (options.listeningTarget === "answer") return "driver-answer-listening";
    if (options.listeningRequired || baseVariant === "listening-response") return "listening-response";
    return "direct-response";
  }

  function evaluateQuestion(item, response, options = {}) {
    const rubric = options.elpStepOne ? ELP_STEP_ONE_RUBRICS[item?.id] : item?.responseRubric;
    return evaluateSemanticResponse({
      response,
      prompt: item?.promptDisplay || item?.materializedPrompt || item?.prompt,
      expected: item?.answerDisplay || item?.materializedAnswer || item?.answer,
      slots: item?.answerSlots || item?.slots || [],
      rubric,
      minTokens: options.elpStepOne ? 3 : 2,
    });
  }

  function independentActionAlternatives(value) {
    const normalized = normalizeText(value);
    const parts = normalized.split(/\s+or\s+/).map(part => part.trim()).filter(Boolean);
    if (parts.length !== 2) return [];
    return parts.every(part => textTokens(part).some(token => ACTION_VERBS.has(token) || ACTION_VERBS.has(stem(token)))) ? parts : [];
  }

  function evaluateSign(item, response) {
    const alternatives = independentActionAlternatives(item?.actionEn);
    if (alternatives.length) {
      return evaluateSemanticResponse({
        response,
        prompt: item?.display,
        expected: item?.actionEn,
        alternatives,
        alternativesExclusive: false,
        completeAlternatives: true,
        rubric: item?.responseRubric || { minTokens: 2, requiredRatio: 1 },
      });
    }
    const completeActionGroups = [...new Set(textTokens(item?.actionEn).filter(token => !GENERIC_WORDS.has(token)))].map(token => [token]);
    return evaluateSemanticResponse({
      response,
      prompt: item?.display,
      expected: item?.actionEn,
      rubric: item?.responseRubric || { minTokens: 2, requiredGroups: completeActionGroups, requiredRatio: 1 },
    });
  }

  function evaluateSignMeaningAndAction(item, response) {
    const integrityErrors = assertionIntegrityViolations(response);
    const completeActionGroups = [...new Set(textTokens(item?.actionEn).filter(token => ACTION_VERBS.has(token) || ACTION_VERBS.has(stem(token))))].map(token => [token]);
    const clauses = String(response || "")
      .split(/(?:[.!?;]+|,?\s+(?:so|therefore)\s+|\s+and\s+(?=(?:i|we|the\s+driver)\b))/i)
      .map(value => value.trim())
      .filter(Boolean);
    const explainsMeaning = value => /\b(means?|indicates?|warns?|requires?|prohibits?|tells?)\b/i.test(value);
    const meaningCandidates = clauses.filter(explainsMeaning);
    const meaningResponse = meaningCandidates.join(". ") || String(response || "");
    const actionCandidates = clauses.filter(clause => !explainsMeaning(clause));
    const actionResponse = actionCandidates.join(". ");
    const actionContradictions = [
      ...polarityConflicts(actionResponse, item?.actionEn, completeActionGroups),
      ...semanticConstraintConflicts(actionResponse, item?.actionEn),
    ];
    const actionResults = actionCandidates.map(clause => evaluateSign(item, clause));
    const action = actionResults.sort((left, right) => Number(right.pass) - Number(left.pass) || Number(right.score || 0) - Number(left.score || 0))[0]
      || { pass: false, score: 0, evaluator: "productive-rubric", feedback: "Добавьте отдельное безопасное действие водителя.", matched: [], missing: ["safe-action-clause"] };
    const displayTokens = textTokens(item?.display);
    const responseTokens = textTokens(meaningResponse);
    const prohibitionExpected = displayTokens.some(token => NEGATION_WORDS.has(token));
    const prohibitionExpressed = responseTokens.some(token => NEGATION_WORDS.has(token) || /^prohibit/.test(token) || /^forbid/.test(token));
    const displayConcepts = displayTokens.filter(token => !GENERIC_WORDS.has(token) && !NEGATION_WORDS.has(token));
    const prohibitionMeaningPass = prohibitionExpected
      && prohibitionExpressed
      && displayConcepts.every(token => hasToken(responseTokens, token));
    const lexicalMeaning = evaluateSemanticResponse({
      response: meaningResponse,
      prompt: "Explain the sign meaning and the safe action.",
      expected: item?.display,
      rubric: { minTokens: 4, requiredRatio: 0.75 },
    });
    const meaning = prohibitionMeaningPass
      ? { ...lexicalMeaning, pass: true, score: Math.max(Number(lexicalMeaning.score || 0), 1), feedback: "Смысл запрета распознан.", missing: [] }
      : lexicalMeaning;
    const explanationMarker = clauses.some(explainsMeaning);
    const pass = action.pass && meaning.pass && explanationMarker && integrityErrors.length === 0 && actionContradictions.length === 0;
    return {
      ...action,
      pass,
      score: Math.min(Number(action.score || 0), Number(meaning.score || 0)),
      feedback: pass
        ? "Смысл знака и безопасное действие подтверждены."
        : [action.feedback, meaning.feedback, explanationMarker ? "" : "Добавьте явное объяснение: means, warns, requires или prohibits.", integrityErrors.length ? "Ответ содержит отказ или явное опровержение собственного утверждения." : "", actionContradictions.length ? "Безопасное действие одновременно утверждается и отрицается." : ""].filter(Boolean).join(" "),
      missing: [...(action.missing || []), ...(meaning.missing || []), ...(explanationMarker ? [] : ["meaning-explanation"]), ...integrityErrors.map(value => `integrity:${value}`), ...actionContradictions.map(value => `constraint:${value}`)],
    };
  }

  function evaluateSituation(item, response, expectedLine) {
    const expected = expectedLine || item?.expectedDriverTurn || (item?.dialogue || []).find(line => String(line.speaker).toLowerCase().includes("driver"))?.english || "";
    return evaluateSemanticResponse({ response, prompt: item?.informationGap || item?.goal, expected, slots: item?.typedSlots || [], rubric: item?.responseRubric || { requiredRatio: 0.67 } });
  }

  function evaluateLesson(item, response, expectedPhrase) {
    return evaluateSemanticResponse({ response, prompt: item?.goal, expected: expectedPhrase, rubric: item?.responseRubric || { requiredRatio: 0.67 } });
  }

  function evaluateLessonAssertionSet(item, response, expectedPhrases, options = {}) {
    const expected = (Array.isArray(expectedPhrases) ? expectedPhrases : []).map(String).filter(Boolean);
    const integrityErrors = assertionIntegrityViolations(response);
    if (integrityErrors.length || !expected.length) {
      return failedSemanticResult(
        integrityErrors.length ? "Ответ содержит отказ или явное опровержение собственного утверждения." : "Не настроены обязательные части рабочего ответа.",
        integrityErrors.length ? integrityErrors.map(value => `integrity:${value}`) : ["required-lesson-assertions"],
        "lesson-interaction-blueprint",
      );
    }
    const protectedResponse = String(response || "").replace(/\ba\.m\./gi, "am").replace(/\bp\.m\./gi, "pm");
    const segments = protectedResponse.split(/[.!?;\n]+/).map(value => value.trim()).filter(Boolean);
    const assertions = expected.map(target => {
      const targetParts = String(target || "").replace(/\ba\.m\./gi, "am").replace(/\bp\.m\./gi, "pm").split(/[.!?;\n]+/).map(value => value.trim()).filter(Boolean);
      const candidates = [...segments];
      for (let width = 2; width <= Math.max(1, targetParts.length); width += 1) {
        for (let start = 0; start + width <= segments.length; start += 1) candidates.push(segments.slice(start, start + width).join(". "));
      }
      const results = [...new Set(candidates)].map(segment => evaluateLesson({ ...item, goal: options.prompt || item?.goal, responseRubric: options.rubric || item?.responseRubric }, segment, target));
      const passing = results.find(result => result.pass);
      const conflicting = results.find(result => !result.pass
        && Number(result.score || 0) >= 0.5
        && (result.missing || []).some(value => /^(?:polarity|constraint):/.test(String(value))));
      const best = results.reduce((current, candidate) => Number(candidate.score || 0) > Number(current.score || 0) ? candidate : current, results[0] || failedSemanticResult("Ответ не дан.", "meaningful-response"));
      return passing && !conflicting ? passing : { ...best, pass: false, missing: [...new Set([...(best.missing || []), ...(conflicting ? ["conflicting-assertion"] : [])])] };
    });
    const failed = assertions.filter(result => !result.pass);
    if (failed.length) {
      return {
        pass: false,
        score: assertions.reduce((total, result) => total + Number(result.score || 0), 0) / assertions.length,
        evaluator: "lesson-interaction-blueprint",
        feedback: `Ответ не покрывает ${failed.length} из ${assertions.length} обязательных частей рабочего взаимодействия.`,
        matched: assertions.filter(result => result.pass).flatMap(result => result.matched || []),
        missing: failed.flatMap(result => result.missing || ["required-interaction-assertion"]),
        assertions,
      };
    }
    return {
      pass: true,
      score: 1,
      evaluator: "lesson-interaction-blueprint",
      feedback: "Ответ соответствует запросу собеседника и покрывает все обязательные части.",
      matched: ["all-required-interaction-assertions"],
      missing: [],
      assertions,
    };
  }

  function evaluateDocumentField(field, response, item = {}) {
    const exact = evaluateExactRecall({ response, expected: field?.value, prompt: field?.label });
    const expectedValue = String(field?.value || item?.practice || "");
    const identifierField = /\d/.test(expectedValue)
      && /\b(?:account|bol|code|id|license|number|permit|plate|policy|registration|seal|stock|ticket|tractor|trailer|vin)\b/i.test(String(field?.label || ""))
      && !/\b(?:date|time|weight)\b/i.test(String(field?.label || ""));
    if (identifierField && normalizeText(response) !== normalizeText(expectedValue)) {
      return { ...exact, pass: false, score: 0, matched: [], missing: [normalizeText(expectedValue)], feedback: "Идентификатор должен точно совпадать с полем образца." };
    }
    if (exact.pass) return { ...exact, evaluator: "exact" };
    const expected = expectedValue;
    const expectedDates = dateValues(expected);
    const actualDates = dateValues(response);
    const expectedClocks = clockValues(expected);
    const actualClocks = clockValues(response);
    const sameOrderedValues = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);
    const dateEquivalent = expectedDates.length > 0
      && sameOrderedValues(expectedDates, actualDates)
      && (!expectedClocks.length || sameOrderedValues(expectedClocks, actualClocks));
    const weightField = /\b(weight|axle|gvwr)\b/i.test(`${field?.label || ""} ${expected}`);
    const weightEquivalent = weightField
      && sameOrderedValues(numberValues(expected), numberValues(response))
      && hasAnyUnit(expected, ["pound", "pounds", "lb", "lbs"])
      && hasAnyUnit(response, ["pound", "pounds", "lb", "lbs"]);
    if (dateEquivalent || weightEquivalent) {
      return {
        pass: true,
        score: 1,
        evaluator: "structured-exact",
        feedback: "Значение совпало с ключом в допустимом формате.",
        matched: [normalizeText(expected)],
        missing: [],
      };
    }
    return {
      ...exact,
      feedback: "Значение или порядок частей не совпадает с полем образца.",
    };
  }

  function diagnosticAnswerAllowed(item, exposure) {
    return !item?.audio || Boolean(exposure);
  }

  function scoreDiagnosticAnswer(item, answer, options = {}) {
    if (item?.audio && !options.stimulusExposed) {
      return { pass: false, score: 0, evaluator: "stimulus-required", feedback: "Сначала прослушайте стимул.", missing: ["stimulus-exposure"] };
    }
    if (item?.kind === "productive") {
      return evaluateSemanticResponse({ response: answer, prompt: item.prompt, expected: item.model || item.expected, slots: item.slots || [], rubric: item.rubric || { requiredRatio: 0.67 } });
    }
    const selected = Number(answer);
    const option = item?.options?.[selected];
    const pass = Boolean(option?.correct);
    const keyedOption = item?.options?.find(candidate => candidate?.correct);
    const keyedFeedback = keyedOption?.text
      ? `Выбран другой смысл. Ключевой ответ: ${keyedOption.text}`
      : "Выбран другой смысл. Проверьте конкретную команду или факт.";
    return { pass, score: pass ? 1 : 0, evaluator: "choice-key", feedback: pass ? "Ответ совпал с ключом." : (item?.feedback || keyedFeedback), missing: pass ? [] : ["choice-key"] };
  }

  function deriveGateStatus(results, requiredIds) {
    const ids = Array.isArray(requiredIds) ? requiredIds : [];
    if (!ids.length) return "not-started";
    const values = ids.map(id => results?.[id]).filter(Boolean);
    if (!values.length) return "not-started";
    if (values.length < ids.length) return "pending";
    return ids.every(id => results?.[id]?.pass === true || results?.[id] === "passed" || results?.[id] === "independent") ? "passed" : "failed";
  }

  function evidenceForEvaluation(evaluation, options = {}) {
    const passed = Boolean(evaluation?.pass);
    const objectiveAttempt = options.selfReported !== true && Boolean(evaluation?.evaluator);
    const productive = objectiveAttempt && options.productive !== false;
    return {
      kind: objectiveAttempt ? "demonstrated" : "self-reported",
      outcome: passed ? "success" : "failed",
      independent: passed,
      objective: objectiveAttempt,
      blind: objectiveAttempt && options.blind !== false,
      productive,
      preReveal: objectiveAttempt && options.preReveal !== false,
      typed: objectiveAttempt,
      keyed: objectiveAttempt,
      responseMode: "typed",
      responseHash: objectiveAttempt ? String(options.responseHash || hashResponse(options.response || "")) : "",
      support: passed ? "none" : (options.support || "none"),
      evaluator: objectiveAttempt ? (evaluation.evaluator || "productive-rubric") : "self-report",
      mode: String(options.mode || "typed-retrieval"),
      variant: String(options.variant || ""),
    };
  }

  return Object.freeze({
    ELP_STEP_ONE_RUBRICS,
    normalizeText,
    hashResponse,
    deterministicOptionOrder,
    textTokens,
    targetMorphologicalForms,
    tokenSimilarity,
    orderedTokenSimilarity,
    numberValues,
    polarityConflicts,
    isDegenerateResponse,
    slotMatches,
    evaluateSemanticResponse,
    evaluateExactRecall,
    evaluateMeaningRecall,
    exampleGapCue,
    questionAttemptVariant,
    evaluateQuestion,
    evaluateSign,
    evaluateSignMeaningAndAction,
    evaluateSituation,
    evaluateLesson,
    evaluateLessonAssertionSet,
    evaluateDocumentField,
    diagnosticAnswerAllowed,
    scoreDiagnosticAnswer,
    deriveGateStatus,
    evidenceForEvaluation,
  });
});
