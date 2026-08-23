import html
import re
import shutil
from pathlib import Path


EDITION = Path(__file__).resolve().parents[1]
APP = EDITION / "app"
GUIDES = [
    ("ru", "Русский", EDITION / "USER_GUIDE_RU.md"),
    ("uk", "Українська", EDITION / "USER_GUIDE_UK.md"),
    ("be", "Беларуская", EDITION / "USER_GUIDE_BE.md"),
]


def inline_markup(text):
    escaped = html.escape(text, quote=False)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)

    def public_link(match):
        raw = match.group(0)
        url = raw.rstrip(".,;:")
        suffix = raw[len(url):]
        return f'<a href="{url}" target="_blank" rel="noopener noreferrer">{url}</a>{suffix}'

    return re.sub(
        r"(?<![\"'=])(https://[^\s<]+)",
        public_link,
        escaped,
    )


def markdown_blocks(source):
    output = []
    paragraph = []
    list_type = None

    def close_paragraph():
        if paragraph:
            output.append(f"<p>{inline_markup(' '.join(paragraph))}</p>")
            paragraph.clear()

    def close_list():
        nonlocal list_type
        if list_type:
            output.append(f"</{list_type}>")
            list_type = None

    for raw_line in source.splitlines():
        line = raw_line.strip()
        if not line:
            close_paragraph()
            close_list()
            continue
        heading = re.match(r"^(#{1,3})\s+(.+)$", line)
        if heading:
            close_paragraph()
            close_list()
            level = min(4, len(heading.group(1)) + 1)
            output.append(f"<h{level}>{inline_markup(heading.group(2))}</h{level}>")
            continue
        ordered = re.match(r"^\d+\.\s+(.+)$", line)
        bullet = re.match(r"^-\s+(.+)$", line)
        if ordered or bullet:
            close_paragraph()
            desired = "ol" if ordered else "ul"
            if list_type != desired:
                close_list()
                list_type = desired
                output.append(f"<{list_type}>")
            output.append(f"<li>{inline_markup((ordered or bullet).group(1))}</li>")
            continue
        close_list()
        paragraph.append(line)

    close_paragraph()
    close_list()
    return "\n".join(output)


def main():
    rendered = []
    for language, label, source in GUIDES:
        text = source.read_text(encoding="utf-8")
        rendered.append(
            f'<article id="{language}" lang="{language}">'
            f'<p class="language-label">{label}</p>{markdown_blocks(text)}</article>'
        )
        shutil.copy2(source, APP / source.name)

    license_text = (EDITION / "LICENSE").read_text(encoding="utf-8")
    notice_text = (EDITION / "NOTICE").read_text(encoding="utf-8")
    shutil.copy2(EDITION / "LICENSE", APP / "LICENSE")
    shutil.copy2(EDITION / "NOTICE", APP / "NOTICE")

    page = f'''<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#10251f">
  <meta name="description" content="Полная инструкция Truck Driver English на русском, украинском и белорусском языках, лицензия MIT и сведения об авторе">
  <meta name="robots" content="index, follow">
  <title>Инструкции и лицензия · Truck Driver English</title>
  <link rel="canonical" href="https://truck-driver-english-eug.pages.dev/guide.html">
  <link rel="icon" href="assets/icon.svg" type="image/svg+xml">
  <style>
    :root {{ color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f4f1e9; color: #17221e; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; line-height: 1.65; }}
    a {{ color: #145c49; overflow-wrap: anywhere; }}
    .skip-link {{ position: absolute; left: 12px; top: -60px; padding: 10px 14px; background: #fff; z-index: 2; }}
    .skip-link:focus {{ top: 12px; }}
    header {{ padding: 42px 20px 28px; background: #10251f; color: #fff; }}
    header > div, main {{ width: min(920px, 100%); margin: 0 auto; }}
    header p {{ max-width: 720px; margin-bottom: 0; color: #d9e9e2; }}
    h1 {{ margin: 0; font-size: clamp(2rem, 7vw, 3.6rem); line-height: 1.05; }}
    nav {{ display: flex; gap: 8px; flex-wrap: wrap; margin-top: 24px; }}
    nav a {{ color: #fff; border: 1px solid #66867a; border-radius: 999px; padding: 8px 13px; text-decoration: none; }}
    nav a:hover, nav a:focus-visible {{ background: #fff; color: #10251f; }}
    main {{ padding: 24px 16px 60px; }}
    article, .legal {{ margin: 24px 0; padding: clamp(20px, 5vw, 42px); border: 1px solid #d3cec0; border-radius: 20px; background: #fffdf8; box-shadow: 0 12px 30px rgba(16, 37, 31, .07); }}
    article {{ scroll-margin-top: 12px; }}
    .language-label {{ margin: 0 0 10px; color: #8b3c28; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }}
    h2 {{ margin-top: 0; font-size: clamp(1.6rem, 5vw, 2.4rem); line-height: 1.15; }}
    h3 {{ margin-top: 2rem; font-size: 1.45rem; }}
    h4 {{ margin-top: 1.6rem; font-size: 1.15rem; }}
    li + li {{ margin-top: .45rem; }}
    code {{ padding: .12em .35em; border-radius: 5px; background: #e8eee9; font-size: .93em; }}
    pre {{ white-space: pre-wrap; overflow-wrap: anywhere; padding: 16px; border-radius: 12px; background: #10251f; color: #f6f1e8; font: 14px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .downloads {{ margin-top: 18px; font-size: .95rem; }}
    @media (max-width: 520px) {{ header {{ padding-top: 30px; }} main {{ padding-inline: 10px; }} article, .legal {{ border-radius: 14px; padding: 18px; }} }}
  </style>
</head>
<body>
  <a class="skip-link" href="#content">Перейти к содержанию</a>
  <header><div>
    <h1>Инструкции и лицензия</h1>
    <p>Полное руководство Truck Driver English на трех языках. Ниже также опубликованы полный текст MIT License и сведения об авторе и происхождении материалов.</p>
    <nav aria-label="Язык и документы">
      <a href="#ru" hreflang="ru">Русский</a>
      <a href="#uk" hreflang="uk">Українська</a>
      <a href="#be" hreflang="be">Беларуская</a>
      <a href="#license">MIT License</a>
      <a href="#notice">NOTICE</a>
      <a href="https://github.com/denis-ostapenko/truck-driver-english" target="_blank" rel="noopener noreferrer">GitHub</a>
      <a href="index.html">Вернуться в приложение</a>
    </nav>
  </div></header>
  <main id="content">
    {''.join(rendered)}
    <section class="legal" id="license"><h2>MIT License</h2><pre>{html.escape(license_text)}</pre><p class="downloads"><a href="LICENSE">Открыть LICENSE отдельным файлом</a></p></section>
    <section class="legal" id="notice"><h2>NOTICE</h2><pre>{html.escape(notice_text)}</pre><p class="downloads"><a href="NOTICE">Открыть NOTICE отдельным файлом</a></p></section>
  </main>
</body>
</html>
'''
    (APP / "guide.html").write_text(page, encoding="utf-8")
    print("public guide built: ru, uk, be, license, notice")


if __name__ == "__main__":
    main()
