# Cycle 1 remediation

## Текущий статус

Этот документ является актуальным техническим и редакционным контрактом Truck Driver English на 21 августа 2026 года. Документы Batch 2, Batch 3 и Batch 4 сохранены только как исторические снимки. При расхождении действует этот документ, фактические данные `app/data/course-data.json` и текущий код приложения.

Приложение локальное, не публикуется и не меняет исходный English Basic. Cycle 1 не вызывал платные API, не использовал реальный микрофон в тестах и не очищал пользовательский localStorage origin 8002.

## Контент и идентификаторы

Текущий объем:

- 700 General Core units;
- 400 Truck units;
- 100 Hotshot units;
- 75 representative training prompts для вопросов и команд на roadside inspection;
- 40 situations;
- 80 sign cards;
- 24 синтетических документа;
- 21 урок.

Банк из 75 элементов не является официальным или стандартизированным опросником. Это репрезентативные учебные формулировки, созданные по открытым темам FMCSA и последовательности CVSA. Приложение не обещает, что инспектор произнесет эти фразы дословно.

Текущие записи используют semantic IDs. Сохраняются все 640 старых позиционных ID через `app/data/content-id-migrations.json`. Карта указывает исходную и целевую коллекции, включая 37 переносов из прежнего bucket `words` в `signs`. Корневой `contentVersion` равен 2. Импорт старого прогресса не зависит от позиции элемента в массиве.

Выбор 400 Truck units больше не использует позиционный срез. Сборка фиксирует явные квоты: 120 terminology, 30 required phrases, 144 prompt and answer units, 20 document phrases, 44 professional-priority phrases и 42 sign actions. В professional-priority входят dispatch, dock, cargo, scale, emergency и delivery.

## Typed slots и роли

Шаблонные значения имеют типы. В данных отдельно хранятся template, display и spoken representation. Это относится к времени, датам, весу, длительности, identifiers, equipment IDs, cargo, locations, pressure и другим значениям. Номера больше не озвучиваются одним универсальным способом.

Пример: `T-204` показывается как equipment identifier, а spoken form задается отдельно. Вес `38,200` имеет cardinal reading. `question-71` материализован как `The driver is out of service until the required rest period is complete.` и не содержит незакрытого placeholder.

У каждой unit заполнены `pronRu`, естественный русский перевод, `wordRole` и `exampleRole`. Для representative training prompts роль prompt равна `inspector`, роль answer равна `driver`.

## Диагностика и mastery

После Cycle 2 стартовая диагностика имеет две формы по 12 заданий: по три на vocabulary, listening, ELP и inspection. Productive ответы проверяет локальный keyed evaluator, listening нельзя ответить до запуска stimulus. Позиции вариантов перемешиваются, а рекомендация строится по результатам нескольких заданий в каждой категории.

Диагностика является только учебным ориентиром. Это не валидированный CEFR или ACTFL assessment, и приложение не присваивает уровень по этим шкалам.

Mastery требует минимум двух самостоятельных успешных retrieval attempts без reveal, hint или model, с интервалом не менее 24 часов. Один self-click не делает элемент освоенным. Это правило применяется к словам, representative training prompts, ситуациям, урокам, знакам и документам. После успеха создается срок следующего повторения. Due reviews каждого из этих шести типов входят в Today до нового материала.

Маршрут на 5, 10 или 15 минут всегда включает применимую профессиональную задачу. Календарный день вычисляется в `America/New_York` через `Intl.DateTimeFormat`, поэтому смена даты учитывает локальную зону и DST.

## ELP gate

49 CFR 391.11(b)(2) включает достаточный английский для official inquiries, traffic signs and signals, общения и записей. FMCSA policy MC-SEE-2026-0002 от 16 апреля 2026 года задает порядок roadside ELP assessment: Step 1, driver interview, затем Step 2, highway traffic sign recognition. В policy прямо сказано не переходить к Step 2, если водитель недостаточно ответил в Step 1.

После Cycle 2 Step 1 является фиксированной учебной сессией из пяти representative training prompts. До показа модели водитель печатает ответ по-английски, а локальная task-specific semantic rubric проверяет его без self-score. Gate проходит только после пяти правильных keyed ответов. Failed result оставляет Step 2 заблокированным и возвращает трудные элементы в учебный цикл.

Step 2 открывает 65 карточек:

- 49 original FHWA SVG с `assetCode`, `assetPath`, точным `assetAlt` и source URL;
- 16 симуляций электронных сообщений с заметной маркировкой `TRAINING DMS`.

Еще 15 local, composite или variable-value sign cards остаются тренировочным материалом и не выдаются за official SVG. Этот gate является внутренним учебным критерием, а не юридической оценкой водителя.

## Профили и применимость

Все основные коллекции содержат `profiles` и `conditions`. Используются три конфигурации:

- `tractor`, Tractor-trailer;
- `hotshot-open`, Hotshot open;
- `hotshot-enclosed`, Hotshot enclosed.

Daily route, questions, situations, lessons, signs и document wallet фильтруются по этим полям. Условия документов отдельно учитывают trip-specific, ELD, ELD malfunction, medical status, SPE, DVIR, periodic inspection proof, scale ticket, IFTA, hazmat, permit, post-inspection и delivery. В Hotshot wallet отдельно присутствует регистрация пикапа, а tractor registration и IRP не показываются как документ Hotshot.

Hotshot securement H4 относится к перевозимым автомобилям, light trucks и vans весом не более 10,000 lb каждый по 49 CFR 393.128. Более тяжелые vehicles требуют отдельной applicable branch. H6 относится только к enclosed profile. Закрытая cargo area сама по себе не отменяет применимые требования securement.

## Compliance corrections

- Hazmat training sample содержит basic description, total quantity, unit of measurement, number and type of packages. Значения синтетические, а документ явно помечен `TRAINING SAMPLE, NOT VALID`.
- ELD transfer sample различает полный telematics set, Web Services плюс Email, и полный local set, USB 2.0 плюс Bluetooth. Используется только набор, поддерживаемый конкретным registered ELD.
- ELD malfunction sample включает письменное уведомление carrier в течение 24 часов, reconstruction текущих 24 часов и предыдущих семи дней, manual records до восстановления и восьмидневный срок carrier action, если extension не предоставлен.
- Paper MEC context ограничен временной FMCSA exemption с 11 апреля по 11 октября 2026 года. Он не описан как бессрочное универсальное правило.
- ELP wording ограничено областью MC-SEE-2026-0002 и не превращает внутренний тренажер в официальную проверку.

## Audio

Сохраняется исторический production contract: 1,261 studio masters и 1,274 прежних runtime MP3. Еще 150 локально обработанных listening assets дают текущие 1,424 runtime MP3. Cycle 1 не вызывал TTS API.

Для всех 75 representative training prompts создана отдельная локальная listening matrix с тремя различимыми файлами:

- clean, локально обработанный dry master;
- phone, локально обработанный telephone profile;
- roadside, существующий отдельный roadside render.

Эти записи являются учебными обработками. Они не имитируют конкретного инспектора, телефон, радио или roadside environment и не доказывают понимание в реальной обстановке. Если точный studio asset отсутствует или устарел после исправления текста, UI использует browser Web Speech только для точного текущего текста либо честно отключает недоступный профиль. Исправленные signs 23, 27, 30, 34, 35, 52, 54, 55, 62, 63 и 64 не воспроизводят старый несовпадающий MP3.

## State, recorder, server и offline

State schema 3 глубоко нормализует импорт. Main, backup и staging envelope читаются независимо, поврежденные записи не заменяют хороший backup, а невалидные данные получают quarantine metadata. Проверка выполняется на fixtures и mocks, без чтения или очистки реального localStorage origin 8002.

Recorder lifecycle останавливает MediaRecorder и все MediaStream tracks, снимает event handlers и отзывает object URLs при delete, close, error и SPA navigation. Автоматические тесты используют только mocked media objects. Разрешение микрофона в QA не запрашивается.

Локальный `app/server.py` отдает CSP, Permissions-Policy, Referrer-Policy, nosniff и frame protection, блокирует hidden paths и Python source, поддерживает корректные single byte ranges и 416. Service worker использует отдельные versioned shell и media caches, удаляет stale versions, ожидает cache writes и поддерживает cached Range responses. Runtime не зависит от `.staging` directory.

## Accessibility

Tabs используют WAI APG roles, roving tabindex, Arrow keys, Home и End. Reveal возвращает keyboard focus в предсказуемую точку. JavaScript учитывает `prefers-reduced-motion`. Эти проверки не равны полной сертификации WCAG 2.2.

## Проверка

Основные команды:

```bash
python3 scripts/build_app.py
python3 scripts/validate_app.py
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.js
find app -name '*.js' -print0 | xargs -0 -n1 node --check
```

Browser regression выполняется на desktop и mobile 390 px по пяти верхним направлениям и вложенным экранам. XSS, corrupt main, backup recovery, migration и recorder lifecycle проверяются изолированными fixtures и mocks. Warm offline проверяется после прогрева отдельного тестового origin.

## Первичные источники

- [49 CFR 391.11](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-391/subpart-B/section-391.11)
- [FMCSA ELP Guidance Roadside Policy MC-SEE-2026-0002](https://www.fmcsa.dot.gov/regulations/enforcement/fmcsa-elp-guidance-roadside-policy-mc-see-2026-0002)
- [FHWA Standard Highway Signs phased releases](https://mutcd.fhwa.dot.gov/kno-shs_2024-release-status/index.htm)
- [CVSA All Inspection Levels](https://cvsa.org/inspections/all-inspection-levels/)
- [CVSA Inspection Procedures](https://cvsa.org/inspections/inspection-procedures/)
- [49 CFR 172.202, hazmat shipping papers](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-172/subpart-C/section-172.202)
- [PHMSA interpretation 21-0037](https://www.phmsa.dot.gov/regulations/title49/interp/21-0037)
- [FMCSA ELD transfer method sets](https://www.fmcsa.dot.gov/hours-service/elds/section-491-49-cfr-part-395-subpart-b-appendix-states-electronic-logging-device)
- [49 CFR 395.34, ELD malfunctions](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-B/section-395.34)
- [FMCSA temporary MEC exemption](https://www.fmcsa.dot.gov/newsroom/fmcsa-issues-temporary-exemption-support-nrii-transition)
- [49 CFR 393.128, automobiles, light trucks and vans](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-393/subpart-I/section-393.128)
- [FMCSA enclosed cargo area applicability](https://www.fmcsa.dot.gov/safety/do-rules-protection-against-shifting-or-falling-cargo-apply-cmvs-enclosed-cargo-areas)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI APG Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)

## Оставшиеся ограничения

1. Representative training prompts, synthesized documents, variable sign cards и TRAINING DMS не являются официальными assessment materials.
2. Listening profiles являются локальными учебными обработками, а не полевыми записями.
3. Полный формальный WCAG 2.2 conformance audit не проводился.
4. Нормативный материал следует повторно сверять перед новым release, особенно после окончания временной MEC exemption или изменения FMCSA, CVSA и FHWA sources.
