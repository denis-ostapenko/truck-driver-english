# Структура учебного содержания

## Hotshot addendum, 20 августа 2026

К текущему контракту добавлен отдельный Hotshot and Car Hauler Track: 100 units для heavy-duty pickup, открытых и закрытых автомобильных прицепов. Текущий общий объем: 700 general, 400 tractor-trailer, 100 hotshot, 40 situations, 24 documents и 21 lessons.

## Фиксированное количество

Исходный English Basic остается на 1069 единицах. Отдельная truck-версия использует сокращенное general core на 700 единиц. Это два независимых автоматических контракта.

```text
source_core_count == 1069
truck_general_core_count == 700
truck_track_count == 400
foundation_lessons == 24
truck_lessons == 16
work_situations == 32
sign_cards == 80
document_templates == 20
```

Truck Driver Track, signs, documents, lesson examples и dialogue lines не входят в число 700.

## Что происходит с текущими наборами

### General Core 700

- Отбирается из канонических 1069 единиц с сохранением стабильных `c:` id.
- Исходный файл не редактируется. Отбор оформляется отдельным manifest и воспроизводимым отчетом.
- Удаляются редкие бытовые темы, избыточные синонимы и единицы, которые не помогают базовой жизни, безопасности или работе.
- Не удаляются служебные слова, базовые глаголы, местоимения, вопросы, отрицание, числа, время, направление, здоровье, просьбы и repair phrases.
- Профессиональная специализация остается отдельным слоем, поэтому truck term не подменяет general core item.

Плановый баланс General Core 700:

| Группа | Количество |
|---|---:|
| Function words, grammar frames and question forms | 220 |
| Everyday survival and public communication | 150 |
| High-frequency verbs and action phrases | 110 |
| Numbers, time, dates, location and directions | 80 |
| Clarification, repair and polite control phrases | 60 |
| Health, emergency and personal needs | 45 |
| Flexible adjectives and state descriptions | 35 |
| Итого | 700 |

### Known 632

- Для того же ученика можно импортировать текущий known dictionary и прогресс через явную команду.
- Для нового ученика 632 единицы считаются только исходным checklist, а не автоматически известными.
- Truck-версия получает onboarding audit: `знаю`, `не уверен`, `учу`.

### Текущий Professional 98

- Не копируется целиком.
- Полезные единицы из тем `Склад`, `Стройка` и общая работа сравниваются с новым truck track.
- Совпадения переносятся с сохранением текста, если перевод, произношение и пример подходят.
- AI, фитнес, уборка и нерелевантный офисный слой остаются только в English Basic.

### Supplements 300

- Сохраняются без изменения как факультативные наборы.
- Они не смешиваются с профессиональным прогрессом и не мешают ELP readiness.

## Truck Driver Track 400

| Домен | Количество |
|---|---:|
| Representative training prompts and CVSA inspection | 50 |
| State trooper and roadside police communication | 30 |
| Driver, vehicle and cargo documents | 40 |
| Hours of service and ELD | 30 |
| Truck, trailer, pre-trip and inspection parts | 45 |
| Traffic signs and route language | 30 |
| Dispatch and trip planning | 25 |
| Pickup, yard, dock and check-in | 25 |
| Cargo, loading and securement | 25 |
| Fuel, DEF, scales and parking | 20 |
| Breakdown, repair, crash and emergency | 30 |
| Delivery, POD, delay, damage and claims | 25 |
| Numbers, spelling, radio and workplace | 25 |
| Итого | 400 |

### Баланс типов единиц

- 220 готовых рабочих фраз, вопросов, ответов и команд, 55 процентов.
- 100 существительных и названий деталей, 25 процентов.
- 48 глаголов и phrasal verbs, 12 процентов.
- 32 сокращения, sign phrases и record terms, 8 процентов.

Фразы имеют приоритет над редкими названиями деталей. Цель курса: уметь действовать словами, а не только узнавать термин.

## Уровни приоритета

### P1, первые 30 дней

- Official inquiries.
- Origin, destination, cargo, time and documents.
- Traffic and dynamic message signs.
- Roadside commands.
- Dispatch, pickup number, dock, seal, BOL and POD.
- Breakdown, crash, location and emergency.

### P2, рабочая самостоятельность

- Loading discrepancies.
- Axle weights and rework.
- Detention and updated ETA.
- Drop and hook.
- ELD transfer and malfunction.
- Maintenance and defect report.

### P3, расширение

- Truck stop services.
- Workplace small talk.
- Payroll or settlement language.
- Equipment-specific terms, если они не нужны для общей безопасности.

## 16 Truck Communication Lessons

| Урок | Навык |
|---:|---|
| 1 | Называть имя, company, truck и trailer number |
| 2 | Spelling букв по телефону |
| 3 | Слышать даты, время и appointment window |
| 4 | Слышать четырехзначные и шестизначные load numbers |
| 5 | Говорить origin, destination, city и state |
| 6 | Описывать cargo, pieces, weight и seal |
| 7 | Понимать dock, row, lane, gate и yard directions |
| 8 | Объяснять duty status и оставшиеся часы |
| 9 | Сообщать defect по схеме part, problem, location, severity |
| 10 | Сообщать delay по схеме reason, current location, new ETA |
| 11 | Использовать repair phrases при непонимании |
| 12 | Различать CDL, registration, insurance, medical status и inspection proof |
| 13 | Выполнять команды Level I and Level II vehicle inspection |
| 14 | Отвечать на Level III driver and credential questions |
| 15 | Общаться со state trooper при обычной traffic stop |
| 16 | Полная репетиция ELP interview, documents и sign recognition |

## 80 Sign Cards

| Категория | Количество |
|---|---:|
| Regulatory text signs | 14 |
| Truck restrictions and routes | 16 |
| Warning, grade and clearance | 14 |
| Work zone and incident management | 10 |
| Weigh station, inspection and parking | 10 |
| Dynamic message signs | 16 |
| Итого | 80 |

Каждая карточка содержит точный display text, смысл, ожидаемое действие, короткий английский ответ, источник и дату проверки.

## 20 учебных документов

1. Commercial driver's license.
2. Medical Examiner's Certificate as temporary or supporting paper proof.
3. Medical variance or SPE Certificate, if applicable.
4. Tractor registration or IRP cab card.
5. Trailer registration.
6. Proof of insurance or insurance cab card.
7. Tractor and trailer periodic inspection documentation package.
8. Driver vehicle inspection report, if applicable.
9. ELD user's manual locator card, optional device help after July 22, 2026, not a federally required onboard packet item.
10. ELD data transfer instruction sheet.
11. ELD malfunction instruction sheet.
12. Blank paper RODS graph grid.
13. ELD RODS and roadside transfer screen.
14. Bill of lading or shipping paper.
15. Scale ticket as a supporting trip document.
16. IFTA license copy, if applicable.
17. Hazardous materials shipping paper, if applicable.
18. Oversize or overweight permit, if applicable.
19. Roadside inspection report.
20. Proof of delivery and OS&D report.

Все имена, номера, адреса и грузы вымышлены. Значения меняются между заданиями, чтобы ученик читал поле, а не запоминал картинку.

## Правила одной учебной единицы

Каждая единица обязана иметь:

- стабильный id;
- American English form;
- русский перевод без лишней теории;
- русскую транскрипцию с ударной ЗАГЛАВНОЙ буквой;
- короткий реалистичный пример;
- домен и priority;
- тип `word`, `phrase`, `abbreviation` или `sign text`;
- speaker and use context для фразы;
- source reference для official or safety-sensitive content;
- указатель audio and visual asset;
- отсутствие незапланированных незнакомых слов в примере.

## Правила языка

- Используется нейтральный живой American English.
- Industry slang добавляется только если водитель реально должен его понимать.
- У каждого slang item есть нейтральный эквивалент.
- Команды инспектора и safety phrases сохраняют точный смысл.
- Сокращения изучаются вместе с полной формой.
- Числа, штаты и unit identifiers тренируются в контексте.
- Примеры не обещают юридический или операционный результат. Они моделируют коммуникацию.

## Контроль дублей

Перед приемкой truck unit выполняются проверки:

1. Нормализованное совпадение с core, known и supplements.
2. Лемматическое совпадение.
3. Совпадение значения при другой форме.
4. Совпадение целой фразы внутри более длинной единицы.
5. Решение `reuse`, `replace`, `keep as recognition only` или `reject`.

## Прогресс

Новая схема состояния хранит прогресс раздельно:

```json
{
  "version": 1,
  "completed": {
    "core": [],
    "truck": [],
    "signs": [],
    "lessons": [],
    "situations": []
  },
  "reviews": {},
  "daily": {},
  "elp": {
    "attempts": [],
    "lastScore": null,
    "weakAreas": []
  }
}
```

ELP readiness не вычисляется только по числу выученных слов. Отдельно проверяются official answers, sign recognition, number listening и repair phrases.

## Контентный pipeline

```text
official sources and field situations
  -> candidate inventory
  -> duplicate check against core and known
  -> Russian translation and pronunciation
  -> example constrained by active vocabulary
  -> domain review
  -> source verification
  -> audio and visual mapping
  -> automated validation
  -> browser QA
```

## Автоматические проверки

- Исходный core равен 1069, truck general core равен 700, truck track равен 400.
- Уникальные id.
- Нет пустых translation, ruPron или example.
- Нет дублирования normalized English между активными tracks.
- Каждая official or sign unit имеет sourceRefs.
- Каждая scene reference указывает на существующую unit, sign или document.
- Все audio keys воспроизводимы.
- Все image paths существуют.
- В примере не более заданного числа незнакомых лемм.
- В generated HTML нет неразрешенного состояния или старого storage key.
