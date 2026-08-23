const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../app/index.html"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../app/styles.css"), "utf8");

test("every runtime tabpanel has an accessible tab label", () => {
  const panels = [...html.matchAll(/<[^>]+role="tabpanel"[^>]+>/g)].map(match => match[0]);
  assert.ok(panels.length >= 5);
  for (const panel of panels) assert.match(panel, /aria-labelledby="[^"]+"/);
});

test("the public PWA manifest does not request authentication credentials", () => {
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.doesNotMatch(html, /crossorigin="use-credentials"/);
});

test("APG tab keys separate horizontal and vertical axes", () => {
  assert.match(app, /!vertical && event\.key === "ArrowRight"/);
  assert.match(app, /!vertical && event\.key === "ArrowLeft"/);
  assert.match(app, /vertical && event\.key === "ArrowDown"/);
  assert.match(app, /vertical && event\.key === "ArrowUp"/);
  assert.match(app, /event\.key === "Home"/);
  assert.match(app, /event\.key === "End"/);
});

test("onboarding changes the dialog name and focuses the visible step", () => {
  assert.match(html, /<dialog[^>]+id="onboarding-dialog"[^>]+aria-labelledby="onboarding-title"/);
  assert.match(app, /\$\("#onboarding-title"\)\.textContent = selected\.title/);
  assert.match(app, /querySelector\(selected\.focus\)\?\.focus\(\)/);
  assert.match(app, /const focusScope = input\.closest\("#onboarding-dialog"\) \|\| input\.closest\("#conditions-settings"\)/);
  assert.match(app, /focusScope\?\.querySelector\(`/);
  assert.match(html, /<details[^>]+class="onboarding-conditions-details"/);
  assert.match(html, /id="onboarding-conditions-count"[^>]+aria-live="polite"/);
  assert.match(styles, /\.onboarding-actions\s*\{[^}]*position:\s*sticky/);
  assert.match(app, /function updateOnboardingConditionCount\(\)/);
});

test("audited layouts keep long content readable and compact", () => {
  assert.match(styles, /\.situation-list button, \.document-list button\s*\{[^}]*height:\s*auto[^}]*line-height:\s*1\.35/);
  assert.match(styles, /\.situation-list button\s*\{[^}]*min-height:\s*90px/);
  assert.match(styles, /\.settings-card\.conditions-card\s*\{[^}]*display:\s*block/);
  assert.match(styles, /\.profile-switch\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.lesson-card\s*\{[^}]*scroll-margin-top:\s*100px/);
  assert.match(app, /scrollIntoView\(\{ behavior: scrollBehavior\(\), block: "start" \}\)/);
  assert.doesNotMatch(app, /data-lesson-id[^\n]+scrollIntoView\(\{ behavior: scrollBehavior\(\), block: "center" \}\)/);
  assert.match(html, /80 знаков в полном справочнике/);
  assert.match(app, /Показано \$\{visibleSigns\.length\} из \$\{signs\.length\} применимых/);
  for (const technicalCopy of ["локальная semantic", "Локальные HTML и CSS", "локальную проверку", "Внешние AI-сервисы"]) {
    assert.equal(html.includes(technicalCopy), false, technicalCopy);
  }
});

test("situation inventory explains every filter without hiding canonical scenes", () => {
  assert.match(html, /id="situation-availability">Доступно 0 из 40/);
  assert.match(html, /id="situation-filter-context"/);
  assert.match(html, /data-go="progress">Изменить профиль и условия/);
  assert.match(app, /function situationInventoryEntries\(\)/);
  assert.match(app, /Core\.evaluateApplicability\(source, context\)/);
  assert.match(app, /data-situation-locked="\$\{entry\.index\}"/);
  assert.match(app, /aria-disabled="true"/);
  assert.match(app, /Недоступно: \$\{escapeHtml\(entry\.reason\)\}/);
  assert.match(app, /Доступно \$\{availableCount\} из \$\{DATA\.situations\.length\}/);
  assert.match(app, /function syncActiveSituationCard\(restoreFocus = false\)/);
  assert.match(app, /list\.scrollTo\(\{ left: target, behavior: "auto" \}\)/);
  assert.match(app, /active\.focus\(\{ preventScroll: true \}\)/);
});

test("situation mobile layout contains intrinsic widths and wraps the header", () => {
  assert.match(styles, /\.situation-layout, \.document-layout\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/);
  assert.match(styles, /\.situation-player, \.document-viewer\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/);
  assert.match(styles, /\.situation-header\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/);
  assert.match(styles, /\.situation-header h3\s*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(styles, /\.dialogue-line > \*\s*\{[^}]*min-width:\s*0/);
  assert.match(styles, /\.situation-header\s*\{\s*flex-wrap:\s*wrap/);
});

test("situation audio control names the queue it actually plays", () => {
  assert.match(app, /evaluated \|\| situationMode === "read"[\s\S]{0,220}"Прослушать всю сцену"/);
  assert.match(app, /"Прослушать текущую реплику"/);
  assert.match(app, /"Аудиоходы завершены"/);
});

test("question mastery records the actual target objective", () => {
  assert.match(app, /const attemptVariant = contextualAttemptVariant\(item, item\.practiceVariantId/);
  assert.match(app, /Eval\.questionAttemptVariant\(\{/);
  assert.match(app, /recordLearningAttempt\("questions", item\.id, evaluation, "question-typed-pre-reveal", attemptVariant/);
  assert.match(app, /questionVariant === "direct-response" && activeDailyTaskKey !== "listening"/);
});

test("a locked regulatory question keeps the evaluated instance until Next", () => {
  assert.match(app, /function materializeQuestionPractice\(item, mode = questionVariant\)/);
  assert.match(app, /const lockedPracticeMode = previousEvaluation\?\.practiceMode \|\| revealedAttempt\?\.practiceMode \|\| null/);
  assert.match(app, /questionEvaluations\.set\(item\.id, \{ \.\.\.evaluation, practiceMode: questionVariant \}\)/);
  assert.match(app, /item\.practiceVariantId\s*\? `regulatory-\$\{item\.practiceVariantId\}`/);
});

test("a revealed question remains locked to the exact saved model across rerenders", () => {
  const renderStart = app.indexOf("function renderQuestion()");
  const renderEnd = app.indexOf("function listeningProfileRow", renderStart);
  const render = app.slice(renderStart, renderEnd);
  const checkStart = app.indexOf("function checkQuestionResponse(");
  const checkEnd = app.indexOf("function revealQuestion()", checkStart);
  const check = app.slice(checkStart, checkEnd);
  const revealStart = checkEnd;
  const revealEnd = app.indexOf("function visibleSituationEntries", revealStart);
  const reveal = app.slice(revealStart, revealEnd);

  assert.match(app, /const questionRevealLocks = window\.TruckAppPersistence\.createQuestionRevealLocks\(\)/);
  assert.match(app, /function questionRevealDescriptor\(item, practiceMode\)/);
  assert.match(app, /semanticFingerprint \|\| item\?\.practiceVariantId \|\| contextualAttemptVariant\(item, mode\)/);
  assert.match(render, /const revealedAttempt = questionRevealLocks\.get\(sourceItem\.id\)/);
  assert.match(render, /Boolean\(previousEvaluation\) \|\| Boolean\(revealedAttempt\)/);
  assert.match(render, /applyQuestionRevealInstance\(materializeQuestionPractice\(sourceItem, questionVariant\), revealedAttempt\)/);
  assert.match(render, /\$\("#official-answer"\)\.hidden = !responseLocked/);
  assert.match(render, /\$\("#reveal-question"\)\.hidden = responseLocked/);
  assert.ok(check.indexOf("questionRevealLocks.has(item.id)") < check.indexOf('recordLearningAttempt("questions"'), "reveal guard must run before evidence or Today mutations");
  assert.match(reveal, /questionRevealLocks\.remember\(questionRevealDescriptor\(item, questionVariant\)\)/);
  assert.match(reveal, /if \(!saveState\(\)\.ok\) \{\s+questionRevealLocks\.delete\(item\.id\);\s+renderQuestion\(\)/);
  assert.match(reveal, /renderQuestion\(\);\s+requestAnimationFrame\(\(\) => \$\("#next-question"\)\?\.focus\(\)\)/);
});

test("question reveal locks clear only at explicit attempt and context boundaries", () => {
  assert.match(app, /function clearDailyTaskTransientState\(task\)[\s\S]{0,700}questionRevealLocks\.delete\(id\)/);
  assert.match(app, /function resetElpStepOneAttemptUi\(ids\)[\s\S]{0,300}questionRevealLocks/);
  assert.match(app, /if \(item\.type === "question"\)[\s\S]{0,300}questionRevealLocks\.delete\(item\.id\)/);
  assert.match(app, /function invalidateContextDependentReadiness\(\)[\s\S]{0,500}questionRevealLocks\.clear\(\)/);
  assert.match(app, /function resetEphemeralSessionState\(\)[\s\S]{0,500}questionRevealLocks\.clear\(\)/);
  assert.match(app, /\$\("#next-question"\)\.addEventListener[\s\S]{0,500}questionRevealLocks\.delete\(item\.id\)/);
  const go = app.slice(app.indexOf("function go(view)"), app.indexOf("function renderView(view)"));
  assert.doesNotMatch(go, /questionRevealLocks/);
  const category = app.slice(app.indexOf('$("#question-category").addEventListener'), app.indexOf('$("#elp-response").addEventListener'));
  assert.doesNotMatch(category, /questionRevealLocks/);
});

test("diagnostic inspection routes retain their construct and cannot select the driver model", () => {
  assert.match(app, /key: "diagnostic", bucket: "words"/);
  assert.match(app, /key: "diagnostic", bucket: "questions"/);
  assert.match(app, /descriptor\.key !== "diagnostic" \|\| task\.bucket === descriptor\.bucket/);
  assert.match(app, /key: descriptor\.key, bucket: descriptor\.bucket/);
  assert.match(app, /activeDailyTaskKey === "diagnostic"\) listeningTarget = "prompt"/);
  assert.match(app, /activeDailyTaskKey === "diagnostic"\s*\? "direct-response"/);
});

test("static card markup cannot flash a model answer before runtime initialization", () => {
  assert.match(html, /<div class="card-answer" id="card-answer" hidden>/);
});

test("listening exposure is consumed and reset for each new question attempt", () => {
  assert.match(app, /function clearQuestionStimulusExposure\(id\)/);
  assert.match(app, /function clearQuestionStimulusExposure\(id\) \{\n\s+stopPlayback\(\)/);
  assert.match(app, /if \(listeningRequired\) \{\n\s+stopPlayback\(\);\n\s+heardQuestionStimuli\.delete\(exposureKey\)/);
  assert.match(app, /heardQuestionStimuli\.delete\(exposureKey\)/);
  assert.match(app, /if \(item\) clearQuestionStimulusExposure\(item\.id\)/);
  assert.match(app, /heardQuestionStimuli\.clear\(\)/);
});

test("pending ELP results are immutable and resume at the first unanswered item", () => {
  assert.match(app, /const firstUnanswered = state\.elpGate\.sessionIds\.findIndex\(id => !state\.elpGate\.results\?\.\[id\]\)/);
  assert.match(app, /if \(gate\.results\[id\]\) return;/);
  assert.match(app, /if \(gateQuestion && state\.elpGate\.results\?\.\[item\.id\]\)/);
  assert.match(app, /focusedSignIds = state\.elpStepTwo\.sessionIds\.filter\(id => !state\.elpStepTwo\.results\?\.\[id\]\)/);
  assert.match(app, /if \(gate\.results\[item\.id\]\) return;/);
  assert.match(app, /if \(stepTwoSession && state\.elpStepTwo\?\.results\?\.\[item\.id\]\)/);
  assert.match(app, /inspectionTabButton\.dataset\.inspectionTab === "questions" && state\.elpGate\?\.status === "pending" && artifactMatchesCurrentContext\(state\.elpGate\)\) elpSession = true/);
  assert.doesNotMatch(app, /inspectionTabButton\.dataset\.inspectionTab !== "elp"\) elpSession = false/);
});

test("question listening target is normalized before the prompt is masked", () => {
  const renderStart = app.indexOf("function renderQuestion()");
  const renderEnd = app.indexOf("function listeningProfileRow", renderStart);
  const render = app.slice(renderStart, renderEnd);
  assert.ok(render.indexOf("syncListeningButtons(item)") < render.indexOf("const blindListening"));
});

test("hearing the exact driver model is receptive evidence, not productive mastery", () => {
  assert.match(app, /productive: !\(listeningRequired && listeningTarget === "answer"\)/);
  assert.match(app, /variant: evidence\.variant,\n\s+contextKey: currentQualificationContextKey\(\)/);
});

test("situation listening hides text and requires consumed file-backed exposure", () => {
  assert.match(app, /const display = Core\.situationDialogueDisplay\(line, \{ mode: situationMode, evaluated \}\)/);
  assert.match(app, /const criticalTurnNeedsExposure = Core\.situationStageRequiresExposure\(task\.stage, situationMode\)/);
  assert.match(app, /const localStimulusAvailable = !criticalTurnNeedsExposure \|\| situationStimulusAudio/);
  assert.match(app, /if \(revealedSituationStimuli\.has\(exposureKey\)\)/);
  assert.match(app, /needsExposure && !heardSituationStimuli\.has\(exposureKey\)/);
  assert.match(app, /if \(sameAttempt && result\.played && result\.qualifying\) heardSituationStimuli\.add\(exposureKey\)/);
  assert.match(app, /heardSituationStimuli\.delete\(exposureKey\)/);
  assert.match(app, /Это воспроизведение доступно только как подсказка/);
});

test("scored consumers retain the evaluated variant and restore keyboard focus", () => {
  assert.match(app, /situationEvaluation = \{[\s\S]{0,220}variant: practice\.id,[\s\S]{0,160}choiceId:/);
  assert.match(app, /const variant = evaluationState\?\.variant \|\| \(stepTwoReadinessCard/);
  assert.match(app, /documentEvaluation = \{ id: item\.id, response, evaluation, variant: currentDocumentInstance\.id, field:/);
  assert.match(app, /const constructState = lessonConstructState\(item\)/);
  assert.match(app, /if \(construct === "production-interaction"\) order\.reverse\(\)/);
  assert.match(html, /id="situation-evaluation-feedback" role="status" tabindex="-1"/);
  assert.match(app, /data-sign-id=.*evaluation-status.*focus\(\)/);
  assert.match(app, /document-evaluation-feedback"\)\?\.focus\(\)/);
  assert.match(app, /data-lesson-id=.*evaluation-status.*focus\(\)/);
  assert.match(app, /class="sign-info" tabindex="-1"/);
});

test("revealing a document permanently locks that blind attempt", () => {
  assert.match(app, /const locked = evaluated \|\| documentRevealed/);
  assert.match(app, /id="document-response"[^`]*\$\{locked \? "disabled" : ""\}/);
  assert.match(app, /id="check-document-response"[^`]*\$\{locked \? "disabled" : ""\}/);
  assert.match(app, /if \(documentRevealed && documentEvaluation\?\.id !== item\.id\)/);
  assert.match(app, /После открытия ответа начните новую самостоятельную попытку/);
});

test("revealed sign and situation models cannot become qualifying evidence", () => {
  assert.match(app, /const locked = revealed \|\| Boolean\(evaluationState\)/);
  assert.match(app, /if \(revealedSignIds\.has\(item\.id\)\)/);
  assert.match(app, /После открытия модели начните новую самостоятельную попытку/);
  assert.match(app, /const revealedAttempt = revealedSituationStimuli\.has\(situationStimulusKey\(item\)\)/);
  assert.match(app, /disabled = evaluated \|\| !localStimulusAvailable \|\| revealedAttempt/);
  assert.match(app, /if \(revealedSituationStimuli\.has\(exposureKey\)\)/);
  assert.match(app, /missing: \["pre-reveal"\]/);
});

test("diagnostic completion refuses incomplete construct coverage", () => {
  assert.match(app, /const incompleteConstructs = Object\.entries\(rawScores\).*answered/);
  assert.match(app, /if \(!blueprint\.valid \|\| incompleteConstructs\.length\)/);
  assert.match(app, /Результат не сохранен/);
});

test("a failed diagnostic item save exposes only a fresh retry and cannot advance", () => {
  const retryMarkup = app.match(/const retryNotice =[\s\S]*?const feedback =/)?.[0] || "";
  assert.match(retryMarkup, /Ответ и результат удалены\. Повторите это же задание/);
  assert.doesNotMatch(retryMarkup, /data-diagnostic-next|item\.model/);
  assert.match(app, /diagnosticFeedback = committed\.feedback;/);
  assert.match(app, /diagnosticPersistenceRetry = committed\.retryRequired \? \{ itemId: item\.id \} : null;/);
  assert.match(app, /if \(!diagnosticFeedback \|\| !diagnosticAnswers\[diagnosticIndex\]\) return;/);
  assert.match(app, /stimulusExposure\.delete\(String\(itemId \|\| ""\)\)/);
});

test("wallet count is based on the same filtered items rendered in its lists", () => {
  assert.match(app, /document-wallet-count"\)\.textContent = `\$\{walletItems\.length\} элементов после фильтров`/);
  assert.match(app, /\["carry-or-trip", "trip-specific", "conditional", "training"\]/);
  assert.match(app, /data-wallet-item=/);
});

test("ordinary success messages require a successful persistence result", () => {
  assert.match(app, /if \(!applyCardSchedule\(item\.id, grade\)\)/);
  assert.match(app, /if \(!saveState\(\)\.ok\) return;\n\s+renderView\(currentView\);\n\s+toast\("Профиль маршрута обновлен"\)/);
  assert.match(app, /if \(!saveState\(\)\.ok\) return;\n\s+renderProgress\(\);\n\s+toast\(`Маршрут:/);
  assert.match(app, /if \(!saveState\(\)\.ok\) return; renderDashboard\(\); toast\("Новая ограниченная сессия создана"\)/);
});

test("automatic error queues remove closed and inapplicable content", () => {
  assert.match(app, /if \(item\.stage === "closed"\) return false/);
  assert.match(app, /if \(branchCarriesJournalScope\(currentBranch\)\)/);
  assert.match(app, /stateStore\.errorBindingForContent\?\.\(state, bucket, id\)\?\.semanticBranch/);
  assert.match(app, /item\.contextKey !== currentQualificationContextKey\(\)/);
  assert.match(app, /if \(\(item\.semanticBranch \|\| null\) !== \(currentBranch \|\| null\)\) return false/);
  assert.match(app, /return !source \|\| applies\(source\)/);
  assert.doesNotMatch(app.match(/function errorItems\(\)[\s\S]*?\n  function wordMastered/)?.[0] || "", /questionAttempts/);
  assert.match(app, /item\.type === "diagnostic" && item\.id\.startsWith\("diagnostic-"\)/);
  assert.match(app, /if \(item\.type === "diagnostic" && !source\) return false/);
});

test("import and reset clear all transient assessment sessions", () => {
  assert.match(app, /function resetEphemeralSessionState\(\)/);
  assert.match(app, /elpSession = false/);
  assert.match(app, /stepTwoSession = false/);
  assert.match(app, /focusedSignIds = null/);
  assert.match(app, /activeDailyTaskKey = null/);
  assert.match(app, /questionEvaluations\.clear\(\)/);
  assert.match(app, /signEvaluations\.clear\(\)/);
  assert.match(app, /diagnosticStimulusExposure\.clear\(\)/);
  assert.match(app, /state = persistenceBoundary\.accept\(committed\.state\);\n\s+resetEphemeralSessionState\(\)/);
  assert.match(app, /state = persistenceBoundary\.accept\(reset\.state\);\n\s+resetEphemeralSessionState\(\)/);
});
