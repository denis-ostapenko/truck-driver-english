# План генерации иллюстраций

## Hotshot addendum, 20 августа 2026

В приложение добавлены четыре принятых Hotshot assets: loaded open gooseneck car hauler, gooseneck coupling, safe winch loading и enclosed trailer loading. Неточный wheel-net asset отклонен и не используется. Полный будущий visual inventory требуется rebaseline с учетом 100 новых Hotshot units.

## Задача визуального слоя

Иллюстрация должна помогать узнать предмет, понять действие, увидеть рабочее пространство или восстановить ситуацию. Она не должна быть декоративной и не должна подсказывать ответ до попытки в карточке.

Из текущих 633 изображений слов и фраз повторно используются только те, которые относятся к сохраненным General Core 700 units. Восемь бытовых сцен можно переиспользовать после проверки связи с сокращенным core. Неиспользуемые source assets не копируются в truck build. Для профессионального слоя создается отдельный набор.

## Плановый объем новых материалов

| Тип | Количество | Метод |
|---|---:|---|
| Truck vocabulary and equipment | 150 | AI raster или проверенная предметная схема |
| Phrase and action illustrations | 60 | AI raster |
| Situation hero images | 32 | AI raster |
| Road and dynamic signs | 64 | Точный SVG или HTML render по MUTCD |
| Procedure diagrams | 24 | SVG или ручная diagram composition |
| Document mockups | 20 | HTML, SVG или программный layout |
| App icons and section covers | 10 | Вектор или AI с ручной доработкой |
| Итого | 360 | 242 AI-oriented, 108 deterministic, 10 hybrid |

Не все 400 truck units требуют отдельной картинки. Абстрактные phrases, abbreviations и близкие термины могут ссылаться на одну сцену или diagram hotspot, если это улучшает понимание и не создает ложное совпадение.

## Что можно генерировать AI

- Реалистичные сцены shipper, receiver, dispatch, scale, truck stop и roadside assistance.
- Предметные изображения truck parts без мелкого текста.
- Простые действия: checking a seal, handing over documents, placing triangles, checking a tire.
- Ситуационные изображения для roleplay.
- Нейтральные section covers.

## Что нельзя отдавать свободной AI-генерации

- Точный текст traffic sign.
- Dynamic message sign text.
- BOL, POD, scale ticket, inspection report и ELD screen.
- Axle weight diagram с числами.
- Нумерация dock, trailer, seal или load.
- Инструкции по процедуре, где неверная деталь меняет смысл.

Такие материалы создаются детерминированно из проверенных данных, а AI может использоваться только для фона без текста.

## Визуальная система

### Стиль

- Реалистичная современная рабочая фотография или чистая instructional illustration.
- США, contemporary Class A tractor-trailer.
- Нейтральные fleet colors без брендов и логотипов.
- Правильная сторона дороги, понятная ориентация cab, trailer, dock и shoulder.
- Естественный дневной свет для предметов, умеренно драматичный свет только для weather and emergency scenes.
- Один главный учебный объект на кадр.
- Никакого встроенного текста, если он не добавлен детерминированно после генерации.

### Форматы

- Vocabulary: 1024 x 1024, квадрат.
- Situation hero: 1536 x 1024, горизонтальный 3:2.
- Mobile scene crop: safe center для 390 px.
- Procedure: SVG плюс PNG fallback.
- Sign card: SVG с точными цветами, формой и lettering.
- Output: WebP для raster, SVG для exact graphics.

### Безопасность изображения

- Driver не держит телефон во время движения.
- Инспекция и обмен документами происходят после безопасной остановки.
- При roadside breakdown видны shoulder, hazard lights и warning devices.
- На dock scene truck стоит в правильной зоне, без человека между движущимся tractor и trailer.
- PPE показывается там, где этого требует сама сцена.

## Пакеты генерации

### Batch 1, визуальный прототип, 12 изображений

- 4 equipment cards.
- 4 action cards.
- 4 situation heroes.

Цель: утвердить стиль, цвет, детализацию, crop и читаемость на карточке.

### Batch 2, критические ситуации, 48 изображений

- Roadside inspection.
- ELP interview context.
- ELD and documents.
- Weigh station.
- Crash and breakdown.
- Level I, Level II и Level III inspections.
- State trooper traffic stop и inspection result.
- Security gate, dock и loading.

Состав: 12 equipment, 12 actions и 24 situation heroes.

### Batch 3, vocabulary and equipment, 134 изображения

Создается по тематическим сериям, чтобы одинаковые truck parts не меняли форму и цвет между кадрами.

### Batch 4, остальные actions and situations, 48 изображений

Завершает 60 action illustrations и все 32 hero scenes.

### Batch 5, deterministic assets, 108 материалов

- 64 уникальных sign assets для 80 карточек и вариантов.
- 24 procedures.
- 20 documents.

### Batch 6, icons and covers, 10 материалов

Создается после стабилизации интерфейса, чтобы не переделывать размеры и композицию.

## Шаблон prompt для AI raster

Промпты пишутся на английском и строятся из фиксированных полей:

```text
Purpose: educational image for adult US truck driver English training.
Subject: [one exact object or action].
Setting: [truck cab, warehouse dock, inspection lane, truck stop].
Composition: one clear focal subject, realistic proportions, uncluttered background.
Vehicle: modern US Class A tractor-trailer, generic fleet, no brand logos.
Safety: [scene-specific safe behavior].
Lighting: natural documentary light.
Output: realistic instructional photography, no text, no watermark, no logo.
Avoid: extra fingers, unreadable labels, distorted wheels, European road signs, left-side driving, unsafe phone use.
```

Пример для сцены:

```text
Purpose: educational hero image for a roadside inspection roleplay.
Subject: a US DOT inspector speaking with a truck driver through the open driver-side window after the truck is safely parked in an inspection area.
Setting: American interstate weigh station inspection lane, modern Class A tractor-trailer.
Composition: inspector and driver clearly visible, documents in a folder, no readable private information.
Safety: engine off, parking brake set, no traffic conflict.
Lighting: neutral daylight, realistic documentary photography.
Output: horizontal 3:2, no text, no logos, no watermark.
```

## Именование файлов

```text
images/equipment/trailer-tandems-v01.webp
images/actions/check-seal-v01.webp
images/situations/roadside-inspection-v01.webp
images/procedures/drop-and-hook-step-03.svg
images/signs/truck-route.svg
images/documents/sample-bol-v01.svg
```

Manifest хранит:

```json
{
  "id": "scene-roadside-inspection",
  "path": "images/situations/roadside-inspection-v01.webp",
  "type": "ai-raster",
  "promptVersion": 1,
  "contentRefs": ["s:roadside-inspection-initial-contact"],
  "qa": {
    "visual": "pending",
    "domain": "pending",
    "mobile": "pending"
  }
}
```

## QA каждого изображения

### Визуальная проверка

- Объект узнаваем за 1 секунду.
- Нет лишнего фокуса и текста-псевдографики.
- Нет артефактов рук, колес, mirrors, hoses и coupling parts.
- Crop работает в desktop и mobile.

### Профессиональная проверка

- Деталь находится в правильном месте.
- Сцена не показывает опасное действие.
- Вид truck, trailer и infrastructure соответствует США.
- Sign, document и procedure совпадают с утвержденным источником.

### Учебная проверка

- Изображение помогает смыслу, но не раскрывает скрытый текст раньше времени.
- Одна картинка не используется для двух противоположных понятий.
- Визуал соответствует example sentence и situation goal.
- Alt text описывает учебный объект коротко и без ответа, если ответ должен быть скрыт.

## Генерационный порядок и стоимость

1. Сначала утверждается полный content inventory и visual manifest.
2. Затем создается Batch 1.
3. После визуального утверждения создаются остальные AI batches.
4. Перед каждым платным вызовом считается точное число изображений и стоимость.
5. Платная генерация начинается только после отдельного подтверждения пользователя.
6. Детерминированные signs, documents и diagrams создаются локально без платной image generation, где это возможно.
