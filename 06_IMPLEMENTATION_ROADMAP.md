# Дорожная карта реализации

## Статус на 20 августа 2026 года

Рабочее локальное приложение v1 собрано. Реализированы отдельный каркас, 700 general units, 400 tractor-trailer units, 100 Hotshot and Car Hauler units, 40 ситуаций, 75 inspection questions, 80 знаков, 24 документа, 21 урок, поиск, фильтры, локальный прогресс, PWA shell, LaunchAgent и запускатель на рабочем столе. Автоматическая валидация и browser QA основных путей пройдены.

Встроены 16 проверенных растровых иллюстраций, включая четыре Hotshot assets для open и enclosed car trailers. Deterministic inventory студийного аудио зафиксирован в `app/data/audio-manifest.json`: 1,261 masters и 42,090 символов. Все catalog deliverables и listening profiles воспроизводятся локально из immutable seeds с hash validation. Платные API для текущей сборки не нужны и не вызываются.

## Общий принцип

Работа идет вертикальными срезами. Сначала один полный рабочий путь от данных до browser QA, затем масштабирование на 700 general core units, 400 truck units и 32 ситуации. Текущий English Basic остается рабочим и не используется как экспериментальная площадка.

## Фаза 0. Зафиксировать базу

### Работы

- Снять hashes исходного core 1069, foundations, supplements и stable ids.
- Зафиксировать правила отбора отдельного truck general core 700.
- Сохранить отчет текущих counts, tests, media coverage и browser state.
- Зафиксировать список файлов, которые импортируются, а не копируются вручную.

### Ворота

- English Basic по-прежнему открывается на порту 8000.
- Gate tests: 18 из 18.
- Tutor modes: 5, registers: 3.
- Audio dry run: 0 missing.
- Source core count: 1069.

## Фаза 1. Изолированный каркас truck-версии

### Работы

- Создать `app`, `data`, `scripts`, `voice`, `images` и `audio` внутри edition.
- Сделать воспроизводимый импорт core, known, supplements и foundations.
- Ввести отдельные title, manifest id, cache name и storage key.
- Собрать приложение с текущим контентом, но без изменения English Basic.

### Ворота

- Два приложения открываются независимо.
- Отметка слова в одном приложении не меняет второе.
- Сборка truck-версии не пишет в исходный проект.
- Source core остается 1069, truck general core равен 700.

## Фаза 2. Сокращенный core и первые 80 truck units

### Работы

- Создать schema и validator.
- Подготовить P1 inventory.
- Проверить дубли с core, known и supplements.
- Создать воспроизводимый `core_700.json` и отчет 369 исключенных единиц.
- Написать 80 первых units для inspection, police, documents, ELD, signs и emergency.
- Пересобрать wordforms и gate tests.

### Ворота

- 700 из 700 general units и 80 из 80 первых truck units проходят автоматическую проверку.
- Нет пустых полей и id collisions.
- Примеры соответствуют словарному ограничению.
- Official items имеют source refs.

## Фаза 3. Первая вертикаль из пяти ситуаций

### Работы

- Вынести scenario data в JSON.
- Реализовать роли, goal, branches, dynamic numbers и completion conditions.
- Сделать пять pilot scenes из `03_SITUATION_MATRIX.md`.
- Автоматически получать список аудиострок из scenario JSON.

### Ворота

- Каждая сцена работает в read, say и listen.
- Roadside breakdown работает в phone mode.
- ELP interview работает без русской подсказки до попытки.
- Нет ручного дублирования dialogue lines.

## Фаза 4. Inspections, police, documents и новый Today flow

### Работы

- Добавить Sign Recognition.
- Добавить Document Practice.
- Добавить отдельные Level I, Level II, Level III и traffic stop drills.
- Смешать 4 core и 6 truck units в дневном плане.
- Добавить отдельные progress counters и ELP shortcut.
- Реализовать 16 truck communication lessons.

### Ворота

- Дневной план не выдает больше 10 новых units.
- Sign answer проверяет meaning и expected action.
- Документные задания используют только вымышленные данные.
- Mobile 390 px остается удобным.

## Фаза 5. Полный контент

### Работы

- Довести Truck Driver Track до 400.
- Довести sign cards до 80.
- Довести document templates до 20.
- Довести situations до 32.
- Добавить filters and search.

### Ворота

- Все фиксированные counts совпадают с контрактом.
- 32 из 32 сцен имеют goal, success conditions, audio profiles и source refs, где они нужны.
- Нет дублей и неиспользуемых units.

## Фаза 6. Голос и аудирование

### Работы

- Добавить роли inspector, dispatcher, clerk, guard, mechanic и roadside assistance.
- Подготовить clean, phone и roadside audio profiles.
- Расширить voice UI и server contract.
- Добавить ELP rehearsal scoring по обязательным фактам.
- Предгенерировать только утвержденные финальные строки.

### Ворота

- Гейт не пропускает незапланированную лексику.
- Аббревиатуры и truck wordforms покрыты тестами.
- Все critical lines имеют локальное аудио.
- Phone filter не делает речь неразборчивой.
- Перед платной генерацией показан точный character count и стоимость.

## Фаза 7. Иллюстрации

### Работы

- Утвердить Batch 1. Выполнено: 12 из 12 assets прошли visual, domain, desktop и mobile QA.
- Создать AI raster batches.
- Создать exact signs, documents и procedures локально.
- Заполнить visual manifest и alt text.

### Ворота

- 360 new assets mapped.
- Нет отсутствующих и лишних файлов.
- Domain QA пройден для equipment, safety, signs and documents.
- Desktop and mobile crops проверены.

## Фаза 8. Финальная QA и запускатель

### Работы

- Полная воспроизводимая сборка из чистого candidate directory.
- Python, JavaScript, JSON, links, counts и media validation.
- Browser QA всех разделов.
- Progress backup, restore and migration tests.
- Создать отдельный LaunchAgent и `Truck Driver English.app`.

### Ворота

- English Basic.app и Truck Driver English.app работают одновременно и независимо.
- Нет console errors.
- Нет сетевой зависимости для core learning, cards, signs, documents и предзаписанных scenes.
- Voice features корректно показывают статус, если external brain недоступен.
- Прогресс восстанавливается из backup.

## Обязательные тесты

### Data

- Count assertions.
- Stable id uniqueness.
- Duplicate and lemma checks.
- Source reference validation.
- Scene reference integrity.
- Audio and image mapping.

### Learning behavior

- 4 core plus 6 truck daily mix.
- SRS intervals and forgotten flow.
- Image hidden before answer.
- Listening text hidden until reveal.
- Sign and document completion.

### Voice

- Все базовые gate tests.
- Truck abbreviations.
- Multiword phrases.
- English-only ELP attempt.
- Required fact scoring.
- Safe fallback.
- Role and audio profile selection.

### Browser

- Desktop.
- 390 px mobile.
- Today, List, Cards, Review, Lessons, Signs, Situations, Documents, Grammar и Voice.
- Offline shell.
- Separate localStorage and cache.

## Решения для следующего производственного пакета

Отдельное решение потребуется только в трех местах:

1. Нужна ли первая версия одному конкретному ученику или нескольким пользователям с onboarding audit.
2. Какие equipment packs нужны сразу после общего Class A модуля: reefer, flatbed, car hauler, tanker или hazmat.
3. Подтверждение платной генерации аудио и AI raster после точного расчета стоимости.

## Определение готового v1

Версия v1 готова, когда ученик может пройти ежедневный цикл, выучить 700 general core и 400 truck units раздельно, отработать 32 ситуации, прочитать 80 знаков, найти данные в 20 документах, пройти ELP rehearsal, CVSA inspection drills и police stop rehearsal, затем сохранить прогресс. При этом исходный English Basic, его порт, данные, медиа и прогресс остаются без изменений.
