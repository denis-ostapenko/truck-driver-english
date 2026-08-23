# План дополнения и модификации

> SUPERSEDED PLANNING DOCUMENT. Current behavior and terminology are defined in `17_CYCLE_1_REMEDIATION.md`.

## Цель продукта

Создать отдельный локальный тренажер, который быстрее выводит русскоязычного трак-драйвера на рабочую самостоятельность в США. Пользователь должен уметь понять задачу, задать уточнение, сообщить проблему, ответить инспектору, прочитать знак, объяснить маршрут и состояние груза, а также закрыть типовую коммуникацию без переводчика.

## Основа и сокращение core

- Канонический English Basic и его 1069 единиц не изменяются.
- Для truck-версии создается отдельный curated core на 700 единиц.
- Отбор сохраняет самые частотные служебные слова, базовые глаголы, числа, время, местоположение, здоровье, безопасность, просьбы, уточнения и бытовую самостоятельность.
- Редкие бытовые темы, избыточные синонимы и слова без прямой пользы для жизни или работы водителя в truck core не входят.
- Каждое исключение хранится в отчете отбора, а каждая сохраненная единица сохраняет исходный `c:` id.
- Единица означает отдельное слово, устойчивую фразу, phrasal verb или речевую формулу.
- Число 700 проверяется автоматическим тестом сборки truck-версии. Исходный тест English Basic продолжает проверять 1069.
- Основные методы остаются: список, карточки, SRS, listening, ситуации, foundation lessons, grammar и voice tutor.
- Дополнительные 100 глаголов, 100 прилагательных и 100 существительных сохраняются как факультативные треки.
- 24 базовых урока произношения и структуры сохраняются.

## Новые слои

| Слой | Объем | Назначение |
|---|---:|---|
| General Core | 700 | Сокращенная бытовая и разговорная база truck-версии |
| Truck Driver Track | 400 | Рабочие слова, команды, вопросы и ответы водителя |
| Sign Recognition | 80 карточек | Дорожные и dynamic message signs |
| Truck Communication Lessons | 16 уроков | Числа, spelling, документы, ELP, police и inspection listening |
| Work Situations | 32 сцены | Полный цикл рейса, police stop и CVSA inspections |
| Document Practice | 20 макетов | Driver, vehicle, ELD, cargo, inspection и conditional records |
| Optional Equipment Packs | после v1 | Reefer, flatbed, tanker, hazmat, car hauler, doubles/triples |

Sign cards, document tasks и реплики сцен не увеличивают базовые 700. Truck Driver Track также считается отдельно.

## Новый ежедневный маршрут

Текущий дневной план из пяти шагов меняется на профессиональный маршрут длительностью около 25 минут:

1. `Повтор`: SRS по core и truck track.
2. `Новые`: 4 единицы general core и 6 единиц truck track. Всего остается 10 новых за день.
3. `Рабочая основа`: один foundation lesson или truck communication lesson.
4. `Знаки`: три коротких sign recognition задания.
5. `Ситуация`: одна сцена в режиме listening или say it yourself.
6. `Разговор`: 5 минут roleplay с тьютором.

Для срочной подготовки к ELP добавляется отдельный 10-минутный маршрут:

```text
representative training prompts
  -> origin and destination
  -> hours and ELD
  -> license and shipping papers
  -> vehicle equipment
  -> sign recognition
```

## Изменения интерфейса

### Сегодня

- Два счетчика: `Core` и `Truck`.
- Отдельный быстрый вход `ELP practice`.
- Дневной план смешивает общее и рабочее обучение с первого дня.
- Не требуется сначала пройти все 700 базовых единиц.

### Список и Карточки

- Наборы: `Core`, `Truck Driver`, `Signs`, `100 verbs`, `100 adjectives`, `100 nouns`.
- Truck-фильтры: inspection, police, representative training prompts, credentials, documents, dispatch, pickup, dock, cargo, HOS and ELD, fuel and scale, repair, emergency, delivery.
- Для equipment card добавляется поле `where`: cab, tractor, trailer, coupling, wheel end, cargo area.
- Для phrase card показываются `who says it` и `when to use it`.
- Для аббревиатур показываются полная форма и произношение, например BOL, POD, ETA, ELD, DOT.

### Ситуации

- Сцены выбираются по этапу рейса, собеседнику и уровню.
- Режимы: `Читать`, `Скажи сам`, `На слух`, `Телефон`, `ELP check`.
- В `Телефон` текст скрыт, звук проходит через умеренный phone filter.
- В `ELP check` нет русской подсказки до завершения ответа.
- У каждой сцены есть конкретный результат: получить dock number, подтвердить seal, объяснить defect, передать ELD records, получить signature.

### Новый раздел Знаки

- Фото или точная карточка знака.
- Вопрос `What does this sign mean?`
- Выбор смысла, затем короткое устное объяснение.
- Отдельные наборы: regulatory, warning, truck restrictions, work zones, dynamic messages.
- Текст и форма знака воспроизводятся по актуальному MUTCD, а не генерируются моделью свободно.

### Новый раздел Документы

- Учебные, вымышленные макеты без персональных данных.
- Три статуса: `carry or access`, `trip-specific`, `conditional`.
- Поиск полей: license class, endorsements, restrictions, expiration, VIN, unit number, policy number, inspection date, pickup number, load number, commodity, weight, pieces, seal, appointment, shipper, consignee и signature.
- Упражнения: назвать поле, прочитать значение, ответить инспектору, сообщить расхождение.
- Встроенный `inspection wallet drill`: собрать комплект документов под конкретный truck, trailer, cargo и ELD status.

### Голосовой тьютор

- Новые роли: dispatcher, broker, shipper clerk, receiver clerk, security guard, yard spotter, mechanic, roadside assistance, police officer, DOT inspector.
- Режим `ELP rehearsal` использует официальный порядок вопросов как основу, но не раскрывает ответ заранее.
- Для truck roleplay гейт берет активные core и truck units.
- Сценарий, роль, ожидаемый результат и запрещенные подсказки передаются серверу как структурированные поля.
- После попытки тьютор дает только одну главную коррекцию и предлагает повторить ответ.

## Изоляция от English Basic

| Элемент | English Basic | Truck Driver English |
|---|---|---|
| localStorage | `english-basic-state-v4` | `truck-driver-english-state-v1` |
| App title | English Basic | Truck Driver English |
| Manifest id | english-basic | truck-driver-english |
| Voice port | 8000 | 8002 |
| LaunchAgent | `com.englishbasic.voice` | `com.truckdriverenglish.voice` |
| Desktop app | English Basic.app | Truck Driver English.app |
| Gate log | `voice/gate_log.jsonl` | отдельный журнал truck-версии |

Порт и LaunchAgent создаются только на этапе реализации после отдельной проверки, что 8002 свободен.

## Предлагаемая структура реализации

```text
truck-driver-edition/
  00_START_HERE.md
  01_CURRENT_APP_AUDIT.md
  02_PRODUCT_MODIFICATION_PLAN.md
  03_SITUATION_MATRIX.md
  04_CONTENT_STRUCTURE.md
  05_ILLUSTRATION_PLAN.md
  06_IMPLEMENTATION_ROADMAP.md
  07_INSPECTIONS_AND_OFFICIAL_QUESTIONS.md
  08_DRIVER_DOCUMENTS_AND_SAMPLES.md
  09_TRUCK_TERMINOLOGY.md
  document-samples/
    README.md
    01_commercial_drivers_license.md
    ...
    20_proof_of_delivery_osd.md
  app/
    truck-driver-learning-app.html
    manifest.webmanifest
    sw.js
    media-controller.js
  data/
    core_700.json
    core_selection_report.json
    known_dictionary.json
    truck_driver_track_400.json
    truck_situations.json
    sign_cards.json
    document_practice.json
    inspection_questions.json
    inspection_commands.json
    document_requirements.json
    truck_lessons.json
    learner_app_data.json
    visual_assets.json
    audio_manifest.json
    content_id_migrations.json
    wordforms.json
  images/
    words/
    equipment/
    situations/
    procedures/
    signs/
    documents/
  audio/
    vocabulary/
    scenarios/
    phone/
    inspection/
  scripts/
    import_base.py
    build_truck_content.py
    validate_content.py
    build_inflections.py
    build_audio.py
    build_app.py
  voice/
    gate.py
    server.py
    index.html
    tests/
```

Текущая подпапка пока содержит только проектные документы. Каталоги реализации создаются после утверждения плана.

## Контракты данных

### Учебная единица

```json
{
  "id": "t:bill of lading",
  "english": "bill of lading",
  "translation": "коносамент, транспортный документ",
  "ruPron": "бил ав лЭйдинг",
  "example": "The bill of lading is in the cab.",
  "theme": "documents",
  "kind": "phrase",
  "speaker": "driver or inspector",
  "use": "roadside inspection or check-in",
  "priority": 1,
  "sourceRefs": ["FMCSA-ELP-FAQ-2025"],
  "image": "images/documents/bill-of-lading.webp"
}
```

### Ситуация

```json
{
  "id": "s:roadside-inspection-initial-contact",
  "phase": "inspection",
  "titleRu": "Остановка и первые команды инспектора",
  "roles": ["DOT inspector", "driver"],
  "goal": "остановиться безопасно и понять первые инструкции",
  "requiredUnits": ["pull over", "turn off the engine", "driver's license"],
  "branches": [],
  "audioProfiles": ["clean", "roadside"],
  "modes": ["read", "say", "listen", "elp"],
  "illustrationId": "scene-roadside-inspection"
}
```

### Проверка дорожного знака

```json
{
  "id": "sign:truck-route",
  "category": "truck-restriction",
  "displayText": "TRUCK ROUTE",
  "meaningRu": "разрешенный маршрут для грузовиков",
  "expectedAnswer": "Trucks should use this route.",
  "source": "MUTCD-current",
  "asset": "images/signs/truck-route.svg"
}
```

## Карта изменений исходных компонентов

| Текущий компонент | План изменения |
|---|---|
| `scripts/rebuild_dictionaries.py` | Не использовать как место для truck-словаря. Отобрать truck core 700 из исходных 1069 и строить truck track отдельным генератором. |
| `scripts/build_html_app.py` | Разделить шаблон и данные, добавить tracks, signs, documents, scenario filters и новый Today flow. |
| `scripts/situation_lines.py` | Убрать ручное дублирование. Получать все реплики из `truck_situations.json`. |
| `scripts/build_audio.py` | Добавить роли, несколько голосов, phone and roadside variants, предварительный расчет стоимости. |
| `voice/gate.py` | Подключить truck wordforms, отдельные правила ELP режима и тесты аббревиатур. |
| `voice/server.py` | Добавить структурированные роли, цели ситуации, ELP rehearsal и выбор голосового профиля. |
| `voice/index.html` | Добавить truck scenarios, role selector, ELP mode и результат попытки. |
| `visual_assets.json` | Разделить common, truck, sign, procedure и document assets. |
| `manifest.webmanifest`, `sw.js` | Новая identity и независимый cache name. |
| Desktop launcher | Новый URL, порт и LaunchAgent без изменения English Basic.app. |

## Главные критерии готовности

- Исходный English Basic остается на 1069, truck core равен 700.
- Прогресс двух приложений не пересекается.
- Все 400 truck units имеют перевод, транскрипцию, пример, тему, приоритет и источник.
- Все 32 ситуации доступны минимум в режимах read, say и listen.
- ELP rehearsal проверяет origin, destination, duty time, license, shipping papers, equipment и sign recognition.
- Inspection modules различают CVSA Levels I through VIII и подробно тренируют практические Levels I, II и III.
- Police и inspector language разделены по роли, цели остановки и типу команды.
- Все 20 document templates имеют статус применимости, вымышленные данные и проверяемые поля.
- У всех финальных аудиострок есть локальный mp3 либо явно проверенный fallback.
- Текст дорожных знаков и документов не создается свободной AI-генерацией.
- Desktop и mobile 390 px проходят browser QA без ошибок консоли.
