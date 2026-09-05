# Truck Driver English

Truck Driver English is a free browser-based course for Russian, Ukrainian, and Belarusian speaking commercial drivers working in the United States.

[Open the course](https://truck-driver-english-eug.pages.dev/) · [Source repository](https://github.com/denis-ostapenko/truck-driver-english)

Use it to practice the English you need to understand a work instruction, describe your vehicle and cargo, handle a phone conversation, or respond in a roadside training scenario. Vocabulary, listening, and written recall are connected to driver situations.

## Your first session

1. Open the course and choose Tractor-trailer, Hotshot open, Hotshot enclosed, or all tracks.
2. Choose a 5, 10, or 15 minute session and open the first task on the Today screen.
3. Listen to the recording and attempt the response before revealing the model answer.
4. Return for the next scheduled review. Looking at an answer alone does not demonstrate independent recall.

English practice uses Russian learning prompts. Full user instructions are available in [Russian](USER_GUIDE_RU.md), [Ukrainian](USER_GUIDE_UK.md), and [Belarusian](USER_GUIDE_BE.md).

Progress is stored on your device. Use export/import to move it to another browser. Offline use includes the course shell and media already cached on that device; open the recordings you need while connected.

## What is included

- 1,200 learning units across General, Truck, and Hotshot tracks
- 75 representative roadside inspection prompts
- 40 interactive situations with local illustrations and audio
- Tractor-trailer, Hotshot open, and Hotshot enclosed profiles
- Read, Say, Listen, Phone, and ELP practice modes
- 80 traffic sign cards and 24 synthetic training documents
- Offline shell and warmed-media support through a service worker
- Local progress storage, export, import, backup, and validation

This is training software. It does not issue CEFR, ACTFL, FMCSA, or legal qualifications.

## Full user guides

- [Русская инструкция](USER_GUIDE_RU.md)
- [Українська інструкція](USER_GUIDE_UK.md)
- [Беларуская інструкцыя](USER_GUIDE_BE.md)

The same guides, the MIT License, and NOTICE are available inside the public application on the Instructions page.

## Run locally

The repository includes the application, its media, source data, document samples, generators, and tests. To run your own local copy, install Python 3 and Git, then run:

```bash
git clone https://github.com/denis-ostapenko/truck-driver-english.git
cd truck-driver-english
python3 app/server.py
```

Open `http://127.0.0.1:8002/`.

## Build public documentation

```bash
python3 scripts/build_public_guide.py
```

## Validate

```bash
python3 scripts/validate_app.py
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.js
find app scripts tests -name '*.js' -print0 | xargs -0 -n1 node --check
```

## Build the Cloudflare Pages artifact

Move any previous `release/cloudflare-pages`, release manifest, and ZIP to an archive directory, then run:

```bash
python3 scripts/build_cloudflare_release.py
```

## Author

Developed by [Denis Ostapenko](https://denisostapenko.com).

- [LinkedIn](https://www.linkedin.com/in/denisostapenko1985)
- Feedback: denis.alex.ostapenko@gmail.com

## License

Code is released under the [MIT License](LICENSE). Asset provenance and product notices are listed in [NOTICE](NOTICE) and the referenced source files.
