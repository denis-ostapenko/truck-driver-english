# План рабочих ситуаций

> SUPERSEDED PLANNING DOCUMENT. Current behavior and terminology are defined in `17_CYCLE_1_REMEDIATION.md`.

## Принцип

Ситуация считается завершенной не после чтения диалога, а после достижения рабочего результата. Пользователь должен понять намерение собеседника, дать достаточный ответ и получить следующий конкретный шаг.

Базовая версия содержит 32 ситуации. Hotshot and Car Hauler addendum добавляет 8 ситуаций для pickup, open gooseneck и enclosed car trailer. Текущий итог приложения: 40 ситуаций.

## Матрица v1

| Приоритет | Ситуация | Собеседники | Рабочий результат | Модификация программы | Основной визуал |
|---:|---|---|---|---|---|
| 1 | Roadside stop, первые команды | DOT inspector, driver | Безопасно остановиться, выключить двигатель, понять инструкцию | ELP mode, короткие команды, roadside audio | Инспектор у окна кабины |
| 1 | Traffic stop by state trooper | State trooper, driver | Безопасно остановиться, понять причину контакта, передать запрошенные документы | Police role, short-answer drill, roadside audio | Patrol car behind parked tractor-trailer |
| 1 | ELP interview | DOT inspector, driver | Назвать origin, destination, cargo и текущий trip | English-only attempt, оценка полноты ответа | Карта рейса и инспектор |
| 1 | License and shipping papers | Inspector, driver | Найти и передать license, registration, BOL и supporting document | Document practice, field finder | Документы на clipboard |
| 1 | Hours and ELD inspection | Inspector, driver | Объяснить duty status и показать records | ELD mockup, number listening | Экран ELD в inspection mode |
| 1 | Level III driver and credential inspection | DOT inspector, driver | Пройти проверку CDL, medical status, RODS, carrier и reports | Timed document wallet, representative prompt drill | Driver documents at inspection desk |
| 1 | Level II walk-around inspection | DOT inspector, driver | Выполнить команды по lights, brakes, steering и visible equipment | Command sequence, equipment hotspots | Inspector walking around tractor-trailer |
| 1 | Level I full inspection | DOT inspector, driver | Подготовить truck к полной проверке и выполнить cab and brake-test commands | 37-step scenario map, safety confirmations | Full inspection lane with undercarriage check |
| 1 | Highway and dynamic signs | Inspector, driver | Объяснить смысл знака или сообщения | Новый Signs section | Точный знак или message board |
| 1 | Vehicle inspection directions | Inspector, driver | Понять, что открыть, включить или показать | Action sequence, equipment hotspots | Tractor-trailer inspection |
| 1 | Inspection result and out-of-service order | Inspector, driver, safety manager | Понять violation, restriction, next legal step и получить report | Result card, repeat-back, no-move branch | Inspection report and red OOS status card |
| 1 | ELD malfunction and paper logs | Inspector, driver, dispatcher | Объяснить malfunction, показать reconstructed RODS и инструкцию | Timeline reconstruction, document switch | ELD warning beside paper log sheets |
| 1 | Registration or document mismatch | Inspector, driver, carrier safety | Точно назвать расхождение и запросить следующую инструкцию | Field comparison, escalation phrase | Two document fields highlighted for comparison |
| 1 | Weigh station and scale | Officer, scale clerk, driver | Заехать на scale, сообщить axle issue, получить reweigh | Number drill, axle diagram | Весы и три группы осей |
| 1 | Crash and 911 | Dispatcher, police, driver | Сообщить location, injuries, vehicles и hazards | Emergency mode, no decorative feedback | Безопасно остановленный truck после minor crash |
| 1 | Roadside breakdown | Driver, roadside assistance | Назвать location, unit, problem и безопасное положение | Phone mode, location spelling | Truck on shoulder with triangles |
| 2 | Dispatch load assignment | Dispatcher, driver | Подтвердить pickup, delivery, equipment и appointment | Dispatcher role, structured confirmation | Кабина и dispatch tablet |
| 2 | Appointment and ETA | Dispatcher, shipper, driver | Подтвердить время или сообщить задержку | Time listening, callback branch | Телефон с appointment window |
| 2 | Security gate check-in | Guard, driver | Назвать company, pickup number и purpose | Gate role, spelling and numbers | Guard shack at warehouse |
| 2 | Shipper pickup check-in | Clerk, driver | Получить door или staging instruction | Document field practice | Shipping office counter |
| 2 | Yard directions and backing | Yard spotter, driver | Найти row, door, staging area и понять hand signals | Map task, sequence listening | Yard map and dock doors |
| 2 | Drop and hook | Dispatcher, yard hostler, driver | Найти trailer, подтвердить seal и location | Equipment vocabulary, checklist | Tractor coupling to trailer |
| 2 | Loading, count and seal | Loader, clerk, driver | Подтвердить pieces, weight, damage и seal number | Cargo checklist, number dictation | Open trailer at dock |
| 2 | Overweight and rework | Scale clerk, shipper, dispatcher | Сообщить axle weights и запросить rework | Axle calculator view, branching | Tandems and scale ticket |
| 2 | Delay and detention | Shipper, broker, dispatcher | Зафиксировать arrival, delay reason и updated ETA | Timeline task, phone mode | Driver waiting at dock |
| 2 | Delivery and POD | Receiver, driver | Получить door, unload result, signature и POD | Document signing flow | Receiver signing POD |
| 2 | Short, damaged or refused load | Receiver, dispatcher, driver | Описать discrepancy и получить instruction | Evidence vocabulary, photo prompt placeholder | Damaged pallet and paperwork |
| 3 | Pre-trip defect report | Driver, maintenance, dispatcher | Назвать part, defect, severity и decision not to move | Equipment hotspots, report template | Tire or air line defect |
| 3 | Fuel, DEF and receipt | Cashier, fuel desk, driver | Активировать pump, указать tractor and reefer, получить receipt | Number and pump dialogue | Truck fuel island |
| 3 | Truck parking and overnight stop | Truck stop staff, driver | Найти legal parking, узнать правила и facilities | Map and sign practice | Truck parking rows at night |
| 3 | Weather, closure, fatigue or no hours | Dispatcher, driver | Сообщить unsafe condition и согласовать новый план | Safety decision branch, weather listening | Snow, closure sign, parked truck |
| 3 | Conditional permit and route check | Inspector, driver, dispatcher | Найти permit, ограничения маршрута и действующие даты | Permit field finder, route restriction check | Permit beside route map |

## Режимы одной ситуации

Каждая ситуация проходит пять уровней, но пользователь может начать с более высокого после короткой проверки.

1. `Read`: видны роли и все реплики, доступно аудио каждой строки.
2. `Say`: реплики водителя скрыты, видна рабочая цель.
3. `Listen`: скрыт весь текст, сначала проверяется общий смысл.
4. `Phone`: телефонный канал, числа и spelling нужно понять без текста.
5. `ELP`: только английский вопрос и устный ответ, подсказка появляется после попытки.

## Как сцены адаптируются к словарю

- Базовая ветка использует core и уже выученные truck units.
- Более богатая ветка включается, когда все ее опорные единицы активны.
- Критическая команда не заменяется красивым синонимом. Для safety phrase хранится одна каноническая формулировка и несколько вариантов на распознавание.
- Числа, адреса, штаты, время, trailer number, seal number и load number подставляются динамически.
- В режиме listening каждый новый прогон получает новые значения, но сохраняет тот же рабочий смысл.

## Шаблон разработки сцены

Для каждой из 32 сцен создается карточка со следующими полями:

```text
id
phase
priority
roles
work_goal
starting_context
required_core_units
required_truck_units
must_understand_lines
driver_response_slots
success_conditions
failure_branches
repair_phrases
numbers_and_spelling_slots
document_or_sign_refs
audio_profiles
illustration_id
source_refs
```

## Изменения программы, вызванные ситуациями

| Потребность ситуации | Нужная механика |
|---|---|
| Назвать origin и destination | Короткий route card с городом, штатом и грузом |
| Ответить про duty time | Тренажер чисел, времени и ELD status |
| Показать документ | Document field finder и безопасные учебные макеты |
| Понять traffic sign | Отдельный sign recognition engine |
| Понять dock instruction | Yard map с row, door, staging и one-way movement |
| Сообщить axle weights | Ввод и чтение steer, drive, trailer axle values |
| Позвонить при breakdown | Phone audio profile и spelling location |
| Сообщить повреждение | Словарь location, size, condition и evidence phrases |
| Пройти ELP interview | English-only roleplay с проверкой обязательных полей |
| Услышать несколько собеседников | Отдельные голоса inspector, dispatcher, clerk и mechanic |

## Критерии успешного ответа

Система не требует идеальной грамматики или акцента. Ответ успешен, если:

- понятен без перевода;
- содержит обязательные факты;
- не меняет смысл критического сообщения;
- подтверждает, что водитель понял следующую инструкцию;
- при непонимании использует repair phrase, например `Could you repeat that more slowly?`;
- в ELP mode дан на английском без скрытой внешней подсказки.

## Порядок выпуска ситуаций

Первая тестовая вертикаль включает пять сцен:

1. Roadside stop.
2. ELP interview.
3. Security gate check-in.
4. Loading, count and seal.
5. Roadside breakdown.

Эта пятерка проверяет все новые механики: representative training prompts, sign or document data, phone audio, typed values, multiple roles и structured success conditions. Следующий обязательный пакет содержит Level I, Level II, Level III, traffic stop и ELD malfunction. После него создаются остальные 22 сцены.
