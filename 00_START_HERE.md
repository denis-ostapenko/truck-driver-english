# Truck Driver English

## Статус

Truck Driver English является отдельным локальным приложением для русскоязычных водителей коммерческих автомобилей в США. Текущий локальный release-candidate контракт Cycle 3 описан в `19_CYCLE_3_FINAL_REMEDIATION.md`. Документы Cycle 1, Cycle 2, Batch 2, Batch 3 и Batch 4 являются историческими снимками и не должны использоваться как описание текущего приложения.

Исходный English Basic находится вне `truck-driver-edition` и этим проектом не изменяется. Приложение не публикуется, не требует платного API для работы и хранит прогресс отдельно.

## Как открыть

- Запускатель: `/Users/garryportman/Desktop/Truck Driver English.app`
- Локальный адрес: `http://127.0.0.1:8002/index.html`
- Файлы: `/Users/garryportman/Documents/english-basic-app/truck-driver-edition/app`
- Локальный сервер: `app/server.py`
- LaunchAgent: `com.truckdriverenglish.app`

Локальный сервер отдает CSP, Permissions-Policy и другие защитные заголовки, поддерживает byte ranges и не показывает directory listing. Service worker использует раздельные versioned shell и media caches.

## Текущий состав

- 700 General Core units.
- 400 Truck units с явными source quotas и professional priorities.
- 100 Hotshot units.
- 75 representative training prompts, вопросы и команды, но не официальный стандартизированный опросник.
- 8 уровней инспекций CVSA.
- 40 ситуаций.
- 80 sign cards: 49 original FHWA SVG, 15 variable-local training cards и 16 `TRAINING DMS`.
- 24 синтетических документа с маркировкой `TRAINING SAMPLE, NOT VALID`.
- 21 урок.
- 16 проверенных растровых иллюстраций.
- Профили Tractor-trailer, Hotshot open и Hotshot enclosed.

Все основные коллекции имеют applicability metadata `profiles` и `conditions`. Document wallet показывает только применимые документы и отделяет always available, trip-specific и conditional records.

## Учебная логика

Сегодня создает неизменяемый маршрут из 1, 2 или 3 шагов на 5, 10 или 15 минут. Новые ошибки и наступившие сроки видны в очереди следующей сессии, но не расширяют активный маршрут. Дата рассчитывается в `America/New_York` с учетом переходов летнего времени.

Подтвержденный статус не возникает после одного нажатия. Требуются две самостоятельные успешные попытки без подсказки и показа модели, разнесенные минимум на 24 часа. После ошибки прежний результат остается только в истории, а текущий статус требует нового цикла подтверждения. Правило действует для слов, учебных вопросов, ситуаций, уроков, знаков и документов.

Диагностика материализует ровно 12 заданий: по три на словарь, понимание на слух, рабочий английский и инспекционные ситуации. Задания на слух требуют полного воспроизведения локальной записи, письменные ответы проверяются локальными ключами без самооценки. Формы следуют одной схеме, но приложение не заявляет их психометрическую эквивалентность. Диагностика выбирает стартовый маршрут, не является валидированной оценкой CEFR или ACTFL и не присваивает уровень.

## ELP

FMCSA policy MC-SEE-2026-0002 от 16 апреля 2026 года задает Step 1 как interview in English, а Step 2 как traffic sign recognition. Если водитель недостаточно проходит Step 1, policy говорит не переходить к Step 2.

В приложении Step 1 проверяет семь учебных коммуникативных функций: безопасное выполнение команды, идентификацию машины и прицепа, место отправления, пункт назначения, груз, перевозчика или работодателя, duty status или HOS. Каждый письменный ответ проверяется локально до показа модели. Step 2 до этого заблокирован. Его попытка содержит ровно 12 English-bearing стимулов: восемь официальных FHWA SVG и четыре `TRAINING DMS`, выбранные из оценочного пула 47 карточек. Все 49 FHWA SVG и 16 DMS остаются в справочнике. Это внутренний учебный критерий, не официальный FMCSA assessment и не юридическая оценка.

## Данные, аудио и состояние

`contentVersion` равен 2. Текущий контент использует semantic IDs. Карта `app/data/content-id-migrations.json` сохраняет все 640 прежних позиционных ID, включая cross-collection moves.

Структурированные поля разделяют шаблон, видимую и произносимую формы времени, дат, веса, идентификаторов, техники и мест. У Truck и Hotshot units заполнены практическая русская подсказка произношения, переводы и профессиональные роли говорящих.

Исторический audio contract содержит 1,261 immutable studio masters и 1,274 воспроизводимых catalog deliverables. Текущий runtime содержит 1,514 MP3, включая 225 prompt derivatives и 15 driver-answer derivatives. Clean, phone и roadside полностью строятся локально из immutable dry masters и проходят hash и signal QA. Это учебные профили, а не полевые записи конкретной обстановки. Browser Web Speech может использоваться только как study fallback и не создает listening evidence.

Схема состояния 5 отдельно проверяет основную, резервную и промежуточную копии и предпочитает семантически здоровую резервную копию. Внешний JSON импортирует настройки, заметки и историю только как неподтвержденные. Он не может создать текущий подтвержденный статус, диагностическую готовность, закрытие Сегодня, ELP или журнала ошибок. Тесты используют фикстуры и хранилище в памяти, не реальный localStorage origin 8002.

Recorder запускается только после явного действия пользователя. Автоматические тесты используют mocks и не запрашивают microphone permission. MediaRecorder, tracks и object URLs очищаются при delete, close, error и SPA navigation.

## Проверка

Из каталога `truck-driver-edition`:

```bash
python3 scripts/build_app.py
python3 scripts/validate_app.py
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.js
find app -name '*.js' -print0 | xargs -0 -n1 node --check
```

Browser regression выполняется на desktop и mobile 390 px по пяти верхним направлениям и вложенным экранам. Offline проверяется после прогрева на изолированном тестовом origin.

## Документы проекта

- `07_INSPECTIONS_AND_OFFICIAL_QUESTIONS.md`: уровни CVSA, ELP и representative training prompts. Старое имя файла сохранено для ссылочной совместимости.
- `11_VISUAL_BIBLE_BATCH_1.md`: visual invariants и разграничение raster, official SVG, variable cards и documents.
- `12_AUDIO_PRODUCTION.md`: текущий audio contract и ограничения listening profiles.
- `14_BATCH_2_PRODUCT_SYSTEM.md`, `15_BATCH_3_MODERNIZATION.md`, `16_BATCH_4_FINAL_PRODUCT.md`: superseded historical snapshots.
- `17_CYCLE_1_REMEDIATION.md`, `18_CYCLE_2_REMEDIATION.md`: исторический контекст исправлений.
- `19_CYCLE_3_FINAL_REMEDIATION.md`: текущая итоговая матрица исправлений, проверок и ограничений.
- `USER_GUIDE_RU.md`: инструкция пользователя.
- `app/README.md`: технический запуск, rebuild и tests.

## Первичные источники

- [49 CFR 391.11](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-391/subpart-B/section-391.11)
- [FMCSA ELP Guidance Roadside Policy MC-SEE-2026-0002](https://www.fmcsa.dot.gov/regulations/enforcement/fmcsa-elp-guidance-roadside-policy-mc-see-2026-0002)
- [FHWA Standard Highway Signs phased releases](https://mutcd.fhwa.dot.gov/kno-shs_2024-release-status/index.htm)
- [CVSA All Inspection Levels](https://cvsa.org/inspections/all-inspection-levels/)
- [49 CFR 172.202](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-172/subpart-C/section-172.202)
- [49 CFR 395.34](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-B/section-395.34)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI APG Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)

Источники перепроверены 22 августа 2026 года. Перед будущим выпуском нужна новая проверка актуальности.
