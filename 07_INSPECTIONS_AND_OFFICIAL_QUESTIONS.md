# Инспекции, representative training prompts и roadside communication

Старое имя файла сохранено для ссылочной совместимости. Банк из 75 prompts не является официальным или стандартизированным опросником.

## Результат исследования

Для курса зафиксированы восемь уровней CVSA. Наибольший учебный вес получают Levels I, II и III, потому что именно там водитель должен одновременно отвечать на вопросы, находить документы и выполнять команды. Level VIII изучается как electronic inspection и vocabulary recognition. Levels IV, V, VI и VII изучаются на уровне назначения и применимости.

Источники повторно проверены 21 августа 2026 года:

- [CVSA, All Inspection Levels](https://cvsa.org/inspections/all-inspection-levels/)
- [CVSA, Inspection Procedures](https://cvsa.org/inspections/inspection-procedures/)
- [CVSA, 2026 Out-of-Service Criteria](https://cvsa.org/news/2026-oosc/)
- [FMCSA ELP Roadside Policy, April 16, 2026](https://www.fmcsa.dot.gov/regulations/enforcement/fmcsa-elp-guidance-roadside-policy-mc-see-2026-0002)
- [FMCSA carrier ELP assessment guidance](https://www.fmcsa.dot.gov/regulations/what-should-motor-carrier-do-assess-cmv-drivers-english-language-proficiency-elp-during)
- [49 CFR 391.11](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-391/subpart-B/section-391.11)

## Восемь уровней CVSA

| Level | Название | Что проверяют | Что должен уметь водитель |
|---:|---|---|---|
| I | North American Standard Inspection | Driver, credentials, HOS, documents и полный vehicle inspection, включая элементы снизу | Ответить на вопросы, передать документы, выполнить cab commands, lights and brake tests |
| II | Walk-Around Driver/Vehicle Inspection | Driver, documents и доступные без захода под vehicle элементы | Понять последовательность обхода, включить equipment, описать известный defect |
| III | Driver/Credential/Administrative Inspection | CDL, medical status if applicable, RODS, HOS, reports, carrier identity and status | Быстро найти нужную запись и дать короткий фактический ответ |
| IV | Special Inspection | Один конкретный элемент, обычно исследование или проверка тренда | Понять предмет проверки и следовать точным инструкциям |
| V | Vehicle-Only Inspection | Vehicle items Level I без присутствия водителя | Узнать термин и понимать, что проверка может пройти без driver interview |
| VI | Radioactive Material Inspection | Усиленный Level I для определенных radioactive shipments | Только conditional pack для водителей с такой операцией |
| VII | Jurisdictional Mandated Inspection | Проверка по программе конкретной jurisdiction, не совпадающая с другими уровнями | Понимать, что правила и формат зависят от jurisdiction |
| VIII | Electronic Inspection | Электронная проверка identity, license, medical status, RODS, HOS, registration, authority, UCR и OOS orders | Узнавать термины и понимать результат electronic screening |

## Реальная последовательность практических проверок

### Level I, 37 шагов

Учебная сцена повторяет официальный порядок крупными блоками:

1. Safe stop, greeting and driver preparation.
2. Driver interview and collection of documents.
3. Hazmat check, carrier identity, CDL, medical status, RODS, DVIR if applicable и periodic inspection reports.
4. Front, left side, rear, right side, axles, tractor, trailer and coupling inspection.
5. Brake adjustment, tractor protection system, emergency brakes, low-air warning, brake pedal and air-loss test.
6. Steering wheel lash, fifth-wheel movement and completion.

### Level II, 31 шаг

Первые документные этапы совпадают с Level I. Vehicle portion выполняется как walk-around без физического захода инспектора под vehicle. Отдельно сохраняются low-air warning, air-loss и steering checks.

### Level III, 13 шагов

1. Stop and greeting.
2. Driver interview.
3. Collect documents.
4. Hazmat presence, if applicable.
5. Carrier identity.
6. CDL.
7. Medical status and SPE, if applicable.
8. RODS and HOS.
9. DVIR, if applicable.
10. Periodic inspection reports.
11. Completion and report.

## Что изменилось в CVSA Out-of-Service Criteria 2026

Критерии 2026 действуют с 1 апреля 2026 года и заменяют предыдущую редакцию. В содержание v1 включаются изменения, которые влияют на язык водителя:

- отдельное распознавание CDL endorsements и restrictions;
- false RODS и ELD tampering, включая случай, когда невозможно определить произошедшие events;
- brake terminology и 20 percent defective brake criterion;
- cargo securement и damaged tie-down language;
- fifth-wheel upper coupler and kingpin terminology;
- missing rim pieces and wheel condition;
- hazmat placard language;
- federal out-of-service orders и запрет движения до устранения условия.

Программа не пытается воспроизвести платный полный текст OOS criteria. Она обучает распознаванию применимых терминов, точному ответу и пониманию результата inspection report по открытым официальным материалам.

## Важное правило ELP режима

Roadside inspection начинается на английском. Если initial contact показывает возможное непонимание, FMCSA policy предусматривает два этапа:

1. Driver interview in English.
2. Highway traffic sign recognition, включая dynamic message signs.

Во время driver interview нельзя строить тренировку вокруг переводчика, cue card или smartphone translation. Ученик должен ответить по-английски. После попытки программа может разобрать ошибку по-русски и дать повтор.

## Банк representative training prompts

Это не официальный script и не обещание, что инспектор задаст именно эти фразы. Это банк из 75 representative training prompts, построенный по темам FMCSA и последовательности CVSA.

Квадратные скобки в таблицах ниже обозначают authoring templates. Runtime не показывает и не озвучивает незаполненные brackets. Сборка материализует typed slots с отдельными display и spoken forms. Типы различают time, date, weight, duration, identifiers, equipment IDs, locations, organizations, cargo, pressure, defects, securement methods и OOS conditions. Например, вес читается как cardinal value, а unit или seal number как identifier. `question-71` материализован как `The driver is out of service until the required rest period is complete.`

### A. Initial contact and safe stop

| Вопрос или команда | Минимальный достаточный ответ водителя |
|---|---|
| Pull into the inspection lane. | Yes, officer. I will pull into the inspection lane. |
| Stop at the white line. | Understood. I will stop at the white line. |
| Set your parking brake. | The parking brake is set. |
| Turn off the engine. | The engine is off. |
| Keep the vehicle here. | Understood. I will remain here. |
| Stay in the cab until I tell you to exit. | Understood. I will stay in the cab. |
| Please step out of the vehicle. | Yes, officer. Where would you like me to stand? |
| Do you understand my instructions? | Yes, I do. / I understood the first part. Could you repeat the last instruction? |

### B. Trip, origin, destination and cargo

| Вопрос | Модель ответа |
|---|---|
| Where are you coming from? | I picked up in [Columbus, Ohio]. |
| Where are you going? | I am delivering in [Nashville, Tennessee]. |
| What is your final destination? | My final destination is [city, state]. |
| What are you hauling? | I am hauling [packaged food]. |
| Is the trailer loaded or empty? | The trailer is loaded. / The trailer is empty. |
| Where did you pick up this load? | I picked it up at [shipper] in [city, state]. |
| When is your delivery appointment? | My appointment is at [time] on [date]. |
| What is your truck and trailer number? | The truck is [unit] and the trailer is [unit]. |

### C. Driver, carrier and credentials

| Вопрос | Модель ответа |
|---|---|
| May I see your commercial driver's license? | Yes. Here is my CDL. |
| What class is your license? | It is a Class A CDL. |
| Do you have any endorsements? | Yes. I have [endorsement]. / No, I do not. |
| Are there any restrictions on your license? | It shows restriction [code]. / There are no restrictions listed. |
| Who do you drive for? | I drive for [carrier name]. |
| What is your carrier's USDOT number? | The USDOT number is [number]. |
| Is this your assigned tractor? | Yes, this is my assigned tractor. / No, it is a temporary unit. |
| Do you have a medical variance or SPE certificate? | Yes, it is here. / No, it does not apply to me. |

### D. Registration, insurance and inspection proof

| Вопрос | Модель ответа |
|---|---|
| Show me the tractor registration. | Here is the tractor registration. |
| Do you have the trailer registration? | Yes. It is in this document folder. |
| May I see proof of insurance? | Yes. Here is my proof of insurance. |
| Where is the periodic inspection documentation? | The tractor report is here, and the trailer report is here. |
| When was the tractor last inspected? | It was inspected on [date]. |
| Does this registration match the unit number? | Yes, the unit and VIN match. / I see a mismatch. I will contact carrier safety. |
| Is the trailer leased? | Yes, it is leased. The equipment document is here. / No, it is carrier-owned. |
| Do you have the applicable permit? | Yes. Here is the permit for this trip. / No special permit applies to this load. |

### E. Shipping papers and load records

| Вопрос | Модель ответа |
|---|---|
| May I see your shipping papers? | Yes. Here is the bill of lading. |
| What is the bill of lading number? | The BOL number is [number]. |
| Who is the shipper? | The shipper is [name]. |
| Who is the consignee? | The consignee is [name]. |
| What is the listed weight? | The listed weight is [number] pounds. |
| Is this hazardous material? | No, it is not. / Yes. The hazmat shipping paper is on top. |
| What is the seal number? | The seal number is [number]. |
| Do you have supporting documents for this trip? | Yes. I have the BOL, scale ticket and fuel receipt in my possession. |

### F. HOS, RODS and ELD

| Вопрос или команда | Модель ответа |
|---|---|
| What is your current duty status? | I am on duty, not driving. |
| How many driving hours do you have left? | I have [number] hours and [number] minutes left. |
| When did you come on duty today? | I came on duty at [time]. |
| Where did you take your last break? | I took my last break in [city, state]. |
| Are your logs current? | Yes. My logs are current and certified. |
| Show me today's log and the previous seven days. | Yes. I am opening roadside inspection mode now. |
| Transfer your ELD records. | Which transfer method would you like, web services or email? |
| Enter this output file comment. | Understood. I will enter the comment exactly as provided. |
| Are there any unidentified driving events? | No. / Yes, there is one event that I have already annotated. |
| Did you edit this duty-status record? | Yes. I corrected [fact] and added an annotation. / No, I did not edit it. |
| Is the ELD malfunctioning? | Yes. The malfunction started at [time], and I notified the carrier. |
| Where are your blank paper logs? | They are in the ELD information packet. |

### G. Vehicle, equipment and visible defects

| Вопрос или команда | Модель ответа |
|---|---|
| Turn on your headlights. | The headlights are on. |
| Turn on the high beams. | The high beams are on. |
| Activate the left turn signal. | The left turn signal is on. |
| Activate the right turn signal. | The right turn signal is on. |
| Turn on the four-way flashers. | The four-way flashers are on. |
| Apply and hold the service brake. | I am applying and holding the service brake. |
| Sound the horn. | I will sound the horn now. |
| Turn on the windshield wipers. | The wipers are on. |
| Open the hood. | The hood is open. |
| Release the tractor brakes and keep the trailer brakes set. | Tractor brakes released, trailer brakes set. |
| Fan the brakes down. | Understood. I will fan the brakes down. |
| Tell me when the low-air warning activates. | The low-air warning activated at [pressure] psi. |
| Do you know of any defects? | Yes. I reported [defect]. / No known defects at this time. |
| How is the cargo secured? | It is secured with [method], and I checked it at [location]. |
| What is the seal condition? | The seal is intact and matches the BOL. |

### H. Result, violation and completion

| Вопрос или фраза инспектора | Ответ водителя |
|---|---|
| The inspection is complete. | Thank you. May I have the inspection report? |
| I found a violation. | I understand. Which item is listed on the report? |
| This vehicle is out of service. | Understood. I will not move the vehicle. What is the next required step? |
| The driver is out of service until [condition]. | Understood. I will remain out of service until the condition is corrected. |
| Sign here to acknowledge receipt. | Does my signature confirm receipt of the report? |
| You may proceed. | Thank you. Am I clear to leave the inspection area? |
| Move to the repair area. | Understood. Please show me the approved route to the repair area. |
| Contact your carrier. | Understood. I will contact carrier safety now. |

## Базовое общение со state trooper

Обычная traffic stop и DOT inspection получают разные роли в программе. State trooper может остановить CMV из-за traffic observation, equipment issue, crash scene или другой дорожной причины. DOT inspector проводит структурированную commercial vehicle inspection. Один officer может выполнять обе функции, но цели вопросов различаются.

### Старт остановки

| Реплика | Безопасная рабочая формулировка |
|---|---|
| License, registration and insurance, please. | Yes, officer. They are in my document folder. May I reach for it? |
| Do you know why I stopped you? | No, officer. Please tell me. |
| Where are you headed? | I am delivering to [city, state]. |
| Stay in the vehicle. | Understood. I will stay in the vehicle. |
| Exit the vehicle and stand by the guardrail. | Understood. Which side would you like me to use? |
| Move to the next safe exit. | Understood. I will proceed to the next safe exit. |

### Repair phrases, если вопрос непонятен

- `Could you repeat that more slowly?`
- `Could you rephrase the question?`
- `I understood the first instruction, but not the second one.`
- `Are you asking for the tractor registration or the trailer registration?`
- `Do you want me to show the screen or transfer the file?`
- `May I confirm the instruction before I move the vehicle?`
- `I do not know that information. May I check the document?`
- `I do not want to guess. The document shows [fact].`

## Модификация программы под инспекции

| Учебная потребность | Изменение приложения |
|---|---|
| Понять уровень проверки | Level selector с кратким scope и ожидаемыми действиями |
| Выполнить длинную последовательность команд | Command chain с repeat-back и безопасной остановкой при ошибке |
| Быстро найти документ | Timed inspection wallet и field finder |
| Ответить по ELP без переводчика | English-only first attempt, затем русская коррекция |
| Объяснить trip and HOS | Dynamic route card и ELD timeline |
| Узнать truck part | Hotspot diagrams tractor, trailer, coupling, axles и brake system |
| Передать ELD records | Device-neutral simulation: полный telematics set, Web Services plus Email, или полный local set, USB 2.0 plus Bluetooth, только по возможностям конкретного ELD |
| Понять нарушение и OOS | Result report с vocabulary, repeat-back и next-step question |
| Различить police и inspector | Отдельные role profiles, audio voices и question banks |

## Приемочные проверки модуля

- Ученик различает все восемь levels по назначению.
- Ученик без русской подсказки проходит representative Level III interview.
- Ученик выполняет минимум 20 критических Level I and II commands в правильном порядке.
- Ученик находит CDL, registration, insurance, periodic inspection proof, BOL и ELD records.
- Ученик отвечает про origin, destination, cargo, duty status и available hours.
- Ученик умеет попросить повторить или переформулировать вопрос, не переходя на переводчик во время ELP attempt.
- Ученик понимает `out of service`, не подтверждает движение и запрашивает следующий разрешенный шаг.
