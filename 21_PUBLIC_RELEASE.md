# Truck Driver English, публичный релиз на Cloudflare

Дата публикации: 2026-08-23.

## Опубликованная версия

- Cloudflare Pages project: `truck-driver-english`.
- Рабочий адрес: `https://truck-driver-english-eug.pages.dev`.
- Deployment id: `2e5367a9-8aa6-465f-ab57-6d507f5ef954`.
- Deployment URL: `https://2e5367a9.truck-driver-english-eug.pages.dev`.
- Доступ публичный, HTTP Basic Authentication не применяется.
- Анонимный запрос возвращает HTTP 200.
- `robots.txt` разрешает обход, `sitemap.xml` доступен, `X-Robots-Tag` отсутствует.

Защитные заголовки сохранены: Content Security Policy, Permissions Policy, Referrer Policy, MIME sniffing protection, запрет встраивания и cross-origin isolation policies. Публичный Pages Worker только передает allowlisted runtime assets и добавляет эти заголовки.

## Release

- Каталог: `release/cloudflare-pages/`.
- Архив: `release/truck-driver-english-public-2026-08-23.zip`.
- Manifest: `release/release-manifest.json`.
- Runtime-файлов: 1788.
- SHA-256 архива: `29f6f31ac2a81c4aca190ca0ceb152037245ba67faf070c60074cdd79c840c31`.
- Прежняя закрытая beta сохранена в `release/archive/deployment-e3119057-2026-08-23-closed-beta/`.

## Публикация следующей версии

```bash
npx wrangler pages deploy release/cloudflare-pages --project-name=truck-driver-english --branch=main
```

Перед следующим deployment требуется повторить validator, Python tests, Node tests, JavaScript syntax, локальный Chrome QA, manifest hash validation и production Chrome QA.

## Приемка

Публичный релиз полностью проверен в Google Chrome 151 на desktop 1440 px и mobile 390 px. Открыты все 40 сцен, все профили, значимые условия и режимы. Проверены изображения, аудио, поля ответа, оценивание, переходы, сохранение, service worker v37, cache и offline reload. Ошибки консоли и failed requests отсутствуют. Восемь ключевых production-файлов побайтно совпадают с локальной release.

Полный отчет: `output/public-release-2026-08-23/REPORT.md`.
