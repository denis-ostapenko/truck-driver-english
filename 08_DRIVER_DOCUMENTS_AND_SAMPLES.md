# Документы водителя и учебные образцы

Hotshot addendum добавляет четыре синтетических образца: pickup and trailer rating record, vehicle condition report, vehicle release form и hotshot proof of delivery. Текущий итог приложения: 24 документа.

## Принцип

Водителю не нужен один универсальный список, одинаковый для любого рейса. Комплект зависит от vehicle, carrier, ELD status, state, cargo и permit conditions. Поэтому программа показывает три статуса:

- `Carry or access`: обычно должен быть у водителя или доступен в vehicle.
- `Trip-specific`: относится к текущему рейсу и предъявляется по запросу.
- `Conditional`: нужен только при конкретной операции, cargo, license status или permit.

Все макеты в `document-samples/` являются учебными. Имена, номера, адреса, VIN, USDOT, policy и cargo полностью вымышлены. Они не являются действительными формами и не должны предъявляться как реальные документы.

## Матрица 20 документов

| # | Документ | Статус | Что водитель должен найти и сказать |
|---:|---|---|---|
| 1 | Commercial driver's license | Carry or access | Name, class, endorsements, restrictions, expiration |
| 2 | Medical Examiner's Certificate paper proof | Conditional or transition proof | Exam date, expiration, examiner, limitations |
| 3 | Medical variance or SPE Certificate | Conditional | Type, covered impairment, expiration |
| 4 | Tractor registration or IRP cab card | Carry or access | Registrant, VIN, plate, unit, weight, expiration |
| 5 | Trailer registration | Carry or access | VIN, plate, owner, expiration |
| 6 | Proof of insurance or insurance cab card | Carry or access | Named insured, policy, vehicle scope, effective dates |
| 7 | Tractor and trailer periodic inspection documentation | Carry or access | Vehicle identity, inspection date, pass certification, record location |
| 8 | Driver vehicle inspection report | If applicable | Defect, unit, date, driver report and repair status |
| 9 | ELD user's manual locator | Optional device help, not federally required after July 22, 2026 | Device name and where optional help is accessible |
| 10 | ELD data transfer instruction sheet | Conditional on ELD use | Web services or email steps and output file comment |
| 11 | ELD malfunction instruction sheet | Conditional on ELD use | Report within required process, reconstruct logs, use paper RODS |
| 12 | Blank paper RODS graph grid | Conditional on ELD use or paper RODS operation | Date, duty statuses, locations, total hours and remarks |
| 13 | ELD RODS and roadside transfer screen | Carry or access when using ELD | Current day plus previous seven days, status, certification, transfer |
| 14 | Bill of lading or shipping paper | Trip-specific | BOL, shipper, consignee, commodity, weight, pieces, seal |
| 15 | Scale ticket | Trip-specific supporting document | Steer, drive, trailer, gross weight, date and location |
| 16 | IFTA license copy | Conditional | Licensee, account, effective year and vehicle applicability |
| 17 | Hazmat shipping paper | Conditional | Proper shipping name, hazard class, ID number, quantity, emergency contact |
| 18 | Oversize or overweight permit | Conditional | Vehicle, load, dimensions, weight, route, dates and restrictions |
| 19 | Roadside inspection report | Carry after inspection when applicable | Inspection number, level, violations, OOS status and instructions |
| 20 | Proof of delivery and OS&D report | Trip-specific operational record | Delivery time, signature, shortage, overage or damage |

## Правовые и процедурные нюансы, которые отражаются в приложении

### Medical certification in 2026

National Registry II передает medical certification data электронно между medical examiner, FMCSA и state licensing agency. На дату исследования действует временное nationwide exemption с 11 апреля по 11 октября 2026 года. Оно позволяет interstate CDL or CLP driver и carrier полагаться на paper MEC как proof до 60 дней после выдачи. Поэтому sample 02 помечается датой проверки правила и не преподается как вечное требование носить бумажную card.

### Periodic inspection proof

49 CFR 396.17 требует, чтобы каждый component combination vehicle прошел periodic inspection в предшествующие 12 месяцев, а documentation была на vehicle. Это может быть inspection report или допустимый sticker/decal с установленными данными. В упражнении отдельно проверяются tractor и trailer identities.

### ELD information packet

При использовании ELD федеральный onboard packet после July 22, 2026 содержит:

1. Data transfer instruction sheet.
2. Malfunction reporting and recordkeeping instruction sheet.
3. Blank RODS graph grids в количестве, достаточном минимум для восьми дней.

User's manual может оставаться доступным как optional device help, но не считается федерально обязательным onboard item после July 22, 2026.

ELD должен показать или передать current 24-hour period и предыдущие семь последовательных дней. Водитель тренируется спросить, какой transfer method требуется, и ввести только comment, данный official.

### Supporting documents

При roadside inspection водитель по запросу предоставляет supporting documents, которые находятся в его possession, в том формате, в котором он их имеет. В тренировку входят BOL, scale ticket, fuel receipt и trip record, но программа не учит создавать отсутствующие документы задним числом.

### Conditional documents

IFTA, IRP, hazmat papers, route plans, permits, medical variances и lease records зависят от конкретной операции. Onboarding задает vehicle, cargo и operating profile, после чего `inspection wallet` показывает применимый набор. Ученик не должен отвечать `not applicable`, не проверив условия сцены.

## Структура одного учебного макета

```json
{
  "id": "doc:tractor-registration",
  "title": "Tractor Registration",
  "status": "carry-or-access",
  "appliesWhen": ["power-unit-in-operation"],
  "sourceRefs": ["FMCSA-VISOR-CARD", "STATE-REGISTRATION-RULE"],
  "verifiedOn": "2026-08-20",
  "synthetic": true,
  "fields": ["registrant", "vin", "plate", "unit", "expiration"],
  "officialQuestions": ["Show me the tractor registration."],
  "expectedAnswerSlots": ["document-location", "unit-match"],
  "samplePath": "document-samples/04_tractor_registration_irp.md"
}
```

## Упражнения

### 1. Find the document

Система задает operating profile и просит собрать inspection wallet. Ошибка объясняется по применимости, а не только по названию.

### 2. Find the field

Ученик за ограниченное время находит VIN, expiration, BOL number, gross weight, seal или OOS status.

### 3. Read it aloud

Ученик читает буквы, цифры, даты, state abbreviations и ограничения без русской подсказки.

### 4. Answer the official

Программа задает короткий вопрос, например `When was the trailer last inspected?`, и проверяет точное поле.

### 5. Detect a mismatch

В двух макетах намеренно различаются unit, VIN, plate, expiration или seal. Правильный ответ не угадывает причину, а называет точное расхождение и просит следующую инструкцию.

### 6. Conditional pack

Сцена задает `non-hazmat dry van`, `hazmat`, `oversize`, `ELD malfunction` или `ELD-exempt paper logs`. Ученик выбирает только применимые документы.

## Источники

- [FMCSA roadside inspection visor card](https://www.fmcsa.dot.gov/international-programs/are-you-ready-vehicle-andor-driver-inspection-visor-card)
- [49 CFR 396.17, periodic inspection](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-396/section-396.17)
- [FMCSA ELD onboard documentation](https://www.fmcsa.dot.gov/hours-service/elds/what-electronic-logging-device-eld-user-documentation-must-be-onboard-drivers)
- [FMCSA ELD driver checklist](https://www.fmcsa.dot.gov/hours-service/elds/eld-checklist-drivers)
- [FMCSA supporting documents at roadside](https://www.fmcsa.dot.gov/hours-service/elds/are-drivers-required-show-supporting-documents-during-roadside-inspections)
- [FMCSA National Registry II Learning Center](https://nationalregistry.fmcsa.dot.gov/nriilearning-center)
- [FMCSA temporary NRII exemption](https://www.fmcsa.dot.gov/regulations/federal-register-documents/2026-07173)

## Приемка document module

- Каждый sample явно помечен `TRAINING SAMPLE, NOT VALID`.
- Ни один sample не содержит реальных personal or carrier identifiers.
- У каждого документа есть применимость, дата проверки источника и список fields.
- Document text создается детерминированно, не свободной image generation.
- Программа не утверждает, что conditional document обязателен для любого водителя.
- Ученик правильно собирает минимум пять разных inspection wallet profiles.
