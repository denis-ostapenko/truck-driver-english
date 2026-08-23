# Truck Driver English, публичный релиз на Cloudflare

Дата публикации: 2026-08-23.

## Опубликованная версия

- Cloudflare Pages project: `truck-driver-english`.
- Рабочий адрес: `https://truck-driver-english-eug.pages.dev`.
- Deployment id: `7bf28217-ad1b-4c05-82df-051e7f0aec73`.
- Deployment URL: `https://7bf28217.truck-driver-english-eug.pages.dev`.
- GitHub: `https://github.com/denis-ostapenko/truck-driver-english`.
- Cloudflare runtime source commit: `eb4d77e1614387ab683fb3c85ce01944c2c9c74d`.
- Доступ публичный, HTTP Basic Authentication не применяется.
- Анонимный запрос возвращает HTTP 200.
- `robots.txt` разрешает обход, `sitemap.xml` доступен, `X-Robots-Tag` отсутствует.

Защитные заголовки сохранены: Content Security Policy, Permissions Policy, Referrer Policy, MIME sniffing protection, запрет встраивания и cross-origin isolation policies. Публичный Pages Worker только передает allowlisted runtime assets и добавляет эти заголовки.

## Release

- Каталог: `release/cloudflare-pages/`.
- Архив: `release/truck-driver-english-public-2026-08-23.zip`.
- Manifest: `release/release-manifest.json`.
- Runtime-файлов: 1794.
- SHA-256 архива: `e248c06ad7ee33de7ad7043e2e9f51f4871e8dc99ab0d1dd98a027f7c68e6975`.
- Прежняя закрытая beta сохранена в `release/archive/deployment-e3119057-2026-08-23-closed-beta/`.

## Публикация следующей версии

```bash
npx wrangler pages deploy release/cloudflare-pages --project-name=truck-driver-english --branch=main
```

Перед следующим deployment требуется повторить validator, Python tests, Node tests, JavaScript syntax, локальный Chrome QA, manifest hash validation и production Chrome QA.

## Приемка

Публичный релиз полностью проверен в Google Chrome 151 на desktop 1440 px и mobile 390 px. Открыты все 40 сцен, все профили, значимые условия и режимы. Проверены изображения, аудио, поля ответа, оценивание, переходы, сохранение, service worker v38, cache и offline reload. Ошибки консоли и failed requests отсутствуют. Десять ключевых production-файлов побайтно совпадают с локальной release.

Полная инструкция опубликована на русском, украинском и белорусском языках в `guide.html` и отдельными Markdown-файлами. На той же странице находятся полный MIT License и NOTICE. Все документы доступны offline после первого открытия. Исходный проект загружен в публичный GitHub-репозиторий вместе с runtime audio, production audio masters, генераторами, тестами, provenance и synthetic training documents. GitHub CI прошел validator, Python 47/47, Node 311/311, JavaScript syntax и проверку воспроизводимости public guides.

Полный отчет: `output/public-release-2026-08-23/REPORT.md`.
