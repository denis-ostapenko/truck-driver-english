import argparse
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path


EDITION = Path(__file__).resolve().parents[1]
PROJECT = EDITION.parent
APP = EDITION / "app"
SOURCE_CORE = next(
    (candidate for candidate in (
        PROJECT / "data" / "learning_core_1000.json",
        EDITION / "data" / "learning_core_1000.json",
    ) if candidate.is_file()),
    EDITION / "data" / "learning_core_1000.json",
)

ALL_PROFILES = ["tractor", "hotshot-open", "hotshot-enclosed"]
HOTSHOT_PROFILES = ["hotshot-open", "hotshot-enclosed"]
FHWA_SHS_SOURCE = "https://mutcd.fhwa.dot.gov/kno-shs_2024-release-status/index.htm"
DEFAULT_BUILD_DATE = "2026-08-22"


# Human-reviewed readiness and curriculum metadata. These inventories are
# intentionally explicit: runtime applicability must not depend on words found
# in a title, theme, prompt, or answer.
ELP_STEP_TWO_ENGLISH_BEARING_OFFICIAL_INDEXES = {
    1, 2, 3, 4, 5, 6, 7, 9, 11, 12, 13, 14, 15, 17, 22, 23, 27, 38,
    45, 46, 47, 48, 50, 51, 52, 53, 54, 55, 62, 63, 64,
}
ELP_STEP_TWO_SYMBOL_FAMILIARIZATION_INDEXES = {
    8, 10, 16, 28, 30, 31, 33, 34, 35, 36, 37, 39, 40, 41, 42, 43, 49, 61,
}
AIR_BRAKE_TRUCK_UNIT_IDS = {
    "t:term:service-air-line",
    "t:term:emergency-air-line",
    "t:term:brake-chamber",
    "t:term:pushrod",
    "t:term:slack-adjuster",
    "t:term:brake-adjustment",
    "t:term:low-air-warning",
    "t:term:air-pressure-gauge",
    "t:term:air-loss-rate",
    "t:term:tractor-protection-system",
    "t:question:tell-me-when-the-low-air-warning-activates:prompt",
    "t:question:tell-me-when-the-low-air-warning-activates:answer",
    "t:professional:the-air-lines-are-connected-and-secure",
}
ELD_TRUCK_UNIT_IDS = {
    "t:term:electronic-logging-device-eld",
    "t:term:data-transfer",
    "t:term:eld-malfunction",
    "t:term:eld-diagnostic-event",
    "t:term:unidentified-driving-record",
    "t:term:annotation",
    "t:professional:my-eld-records-are-available-on-the-screen",
    "t:professional:there-are-no-active-malfunctions",
    "t:professional:i-added-an-annotation-to-the-edit",
}

SITUATION_TITLES_RU = [
    "Остановка для дорожной проверки",
    "Остановка дорожной полицией",
    "Интервью по английскому языку",
    "Права и грузовые документы",
    "Рабочее время и проверка ELD",
    "Проверка водителя и документов уровня III",
    "Внешний осмотр уровня II",
    "Полная проверка уровня I",
    "Дорожные знаки и электронные табло",
    "Команды при осмотре машины",
    "Результат проверки и запрет эксплуатации",
    "Неисправность ELD и бумажный журнал",
    "Несовпадение регистрации или документа",
    "Весовая станция и взвешивание",
    "Авария и звонок 911",
    "Поломка на дороге",
    "Назначение груза диспетчером",
    "Окно приема и расчетное время прибытия",
    "Регистрация на охраняемом въезде",
    "Регистрация на погрузку",
    "Движение по территории и постановка к воротам",
    "Смена прицепа",
    "Погрузка, количество мест и пломба",
    "Перегруз и перераспределение груза",
    "Задержка и время ожидания",
    "Доставка и подтверждение получения",
    "Недостача, повреждение или отказ от груза",
    "Сообщение о неисправности перед рейсом",
    "Топливо, DEF и чек",
    "Стоянка грузовиков на ночь",
    "Погода, закрытие дороги, усталость или нехватка часов",
    "Проверка разрешения и маршрута",
    "Пикап с прицепом на дорожной проверке",
    "Получение автомобиля на аукционе и сверка VIN",
    "Погрузка неисправного автомобиля",
    "Проверка крепления автомобиля",
    "Весы и нагрузки на оси",
    "Доставка клиенту и акт состояния",
    "Погрузка низкого автомобиля в закрытый прицеп",
    "Проверка крепления в закрытом прицепе",
]

LESSON_TITLES_RU_BY_ID = {
    "lesson:identity-and-unit-numbers": "Имя, перевозчик и номера машины",
    "lesson:spelling-on-the-phone": "Диктовка букв и номера по телефону",
    "lesson:dates-times-and-appointments": "Даты, время и окна приема",
    "lesson:load-and-reference-numbers": "Номера груза и документов",
    "lesson:origin-and-destination": "Место отправления и назначения",
    "lesson:cargo-pieces-weight-and-seal": "Груз, количество мест, вес и пломба",
    "lesson:gate-yard-and-dock-directions": "КПП, территория и погрузочные ворота",
    "lesson:duty-status-and-available-hours": "Рабочий статус и доступные часы",
    "lesson:defect-report": "Сообщение о неисправности",
    "lesson:delay-and-updated-eta": "Задержка и новое время прибытия",
    "lesson:clarification-and-repair-phrases": "Уточнение и проверка понимания",
    "lesson:driver-and-vehicle-documents": "Документы водителя и машины",
    "lesson:level-i-and-level-ii-commands": "Команды при проверке уровней I и II",
    "lesson:level-iii-representative-questions": "Учебные вопросы для проверки уровня III",
    "lesson:state-trooper-traffic-stop": "Остановка дорожной полицией",
    "lesson:full-elp-rehearsal": "Полная репетиция проверки владения английским",
    "lesson:pickup-trailer-and-ratings": "Пикап, прицеп и допустимые весовые характеристики",
    "lesson:loading-a-vehicle": "Погрузка автомобиля",
    "lesson:securing-transported-vehicles": "Крепление перевозимых автомобилей",
    "lesson:pickup-and-delivery-condition": "Прием и доставка: состояние автомобиля",
    "lesson:enclosed-car-trailer": "Закрытый автовоз: погрузка, обзор и двери",
}

LESSON_PHRASE_MEANINGS_RU = [
    ["Меня зовут Алекс Экзампл.", "Я работаю водителем в Training Carrier.", "Номер тягача T-204.", "Номер прицепа TR-518."],
    ["Буква A, как в слове Alpha.", "Подтвердите последнюю букву, пожалуйста.", "Код: T, R, пять, один, восемь."],
    ["Мое время приема в 9:30 утра.", "Я прибыл в 8:55.", "Доставка назначена на завтра утром."],
    ["Номер груза: ноль, ноль, ноль, пять, один, восемь.", "Повторите последние четыре цифры, пожалуйста.", "Номер BOL: 2048."],
    ["Я забрал груз в Коламбусе, штат Огайо.", "Я доставляю груз в Нэшвилл, штат Теннесси.", "Конечный пункт назначения: Атланта, штат Джорджия."],
    ["Я везу упакованные продукты.", "В грузе 22 палеты.", "Номер пломбы 000845."],
    ["Следуйте к воротам номер два.", "Припаркуйтесь в ряду C.", "Сдайте назад к погрузочным воротам 18."],
    ["Я на работе, но сейчас не управляю машиной.", "У меня осталось четыре часа и восемнадцать минут доступного времени.", "Мои журналы актуальны и подтверждены."],
    ["Правый задний габаритный фонарь не работает.", "Я обнаружил утечку воздуха рядом с осью прицепа.", "Я не буду двигаться, пока неисправность не проверят."],
    ["Движение остановилось из-за аварии.", "Новое расчетное время прибытия 16:30.", "Я сообщу новости после объезда."],
    ["Повторите это медленнее, пожалуйста.", "Сформулируйте вопрос иначе, пожалуйста.", "Можно я повторю указание, чтобы подтвердить, что понял его?"],
    ["Вот мои коммерческие водительские права.", "Вот регистрация тягача.", "Документ о периодической проверке находится на машине."],
    ["Стояночный тормоз установлен.", "Фары включены.", "Я нажимаю и удерживаю рабочий тормоз."],
    ["Я работаю водителем в Training Carrier.", "Я забрал груз в Коламбусе.", "У меня осталось четыре часа восемнадцать минут."],
    ["Можно мне взять папку с документами?", "Я доставляю груз в Нэшвилл.", "Я останусь в машине."],
    ["Я везу упакованные продукты.", "Этот знак означает, что грузовики должны воспользоваться этим съездом.", "Показать записи на экране или передать их?"],
    ["Я управляю тяжелым пикапом с прицепом на гусачной сцепке.", "Рейтинги пикапа и прицепа указаны на сертификационных табличках.", "Я проверил полную массу автопоезда и нагрузки на оси.", "Контроллер тормозов прицепа работает."],
    ["Автомобиль запускается и едет своим ходом?", "Оставьте рулевое управление разблокированным, пока я направляю автомобиль.", "Расположите автомобиль по центру прицепа.", "Не приближайтесь к натянутому тросу лебедки."],
    ["Каждый автомобиль закреплен спереди и сзади.", "Средства крепления установлены в предназначенных для этого точках.", "Колесные ремни расположены по центру и натянуты.", "Я повторно проверил каждое средство крепления после начала рейса."],
    ["Мне нужно сверить VIN до погрузки.", "Эта царапина отмечена как ранее существовавшее повреждение.", "Осмотрите автомобиль перед подписанием.", "Получатель не обнаружил новых повреждений."],
    ["Проверьте угол рампы и внутренние зазоры.", "Используйте сигнальщика, потому что боковой зазор ограничен.", "Автомобиль закреплен внутри закрытого прицепа.", "Задняя рампа и боковые двери заперты для движения."],
]

PROFILE_LESSON_PHRASE_MEANINGS_RU = {
    1: {
        "tractor": LESSON_PHRASE_MEANINGS_RU[0],
        "hotshot-open": ["Меня зовут Алекс Экзампл.", "Я работаю водителем в Training Carrier.", "Я управляю тяжелым пикапом с прицепом на гусачной сцепке.", "Номер прицепа TR-518."],
        "hotshot-enclosed": ["Меня зовут Алекс Экзампл.", "Я работаю водителем в Training Carrier.", "Я управляю тяжелым пикапом с автовозным прицепом.", "Номер прицепа TR-518, номерной знак SAMPLE518."],
    },
    6: {
        "tractor": LESSON_PHRASE_MEANINGS_RU[5],
        "hotshot-open": ["Этот автовозный прицеп перевозит три автомобиля.", "Я сверил VIN с транспортным заказом.", "Я проверил полную массу автопоезда и нагрузки на оси.", "Каждый автомобиль закреплен спереди и сзади."],
        "hotshot-enclosed": ["Автомобиль закреплен внутри закрытого прицепа.", "Я сверил VIN с транспортным заказом.", "Я проверил полную массу автопоезда и нагрузки на оси.", "Обе защелки двери-рампы закрыты и зафиксированы."],
    },
    9: {
        "tractor": LESSON_PHRASE_MEANINGS_RU[8],
        "hotshot-open": ["Правый задний габаритный фонарь не работает.", "Я обнаружил порез на правой шине прицепа.", "Я не буду двигаться, пока это не проверят.", "Да, давление падает."],
        "hotshot-enclosed": ["Правый задний габаритный фонарь не работает.", "Я обнаружил порез на правой шине прицепа.", "Я не буду двигаться, пока это не проверят.", "Обе защелки двери-рампы закрыты и зафиксированы."],
    },
    16: {
        "tractor": LESSON_PHRASE_MEANINGS_RU[15],
        "hotshot-open": ["Этот автовозный прицеп перевозит три автомобиля.", "Этот знак означает, что грузовики должны воспользоваться этим съездом.", "Показать записи на экране или передать их?"],
        "hotshot-enclosed": ["Автомобиль закреплен внутри закрытого прицепа.", "Этот знак означает, что грузовики должны воспользоваться этим съездом.", "Показать записи на экране или передать их?"],
    },
    12: {
        "tractor": LESSON_PHRASE_MEANINGS_RU[11],
        "hotshot-open": ["Вот мой документ, подтверждающий личность водителя.", "Вот регистрация прицепа.", "Документ о периодической проверке находится на машине."],
        "hotshot-enclosed": ["Вот мой документ, подтверждающий личность водителя.", "Вот регистрация прицепа.", "Документ о периодической проверке находится на машине."],
    },
}

LESSON_INTERACTION_BLUEPRINTS = [
    ("Please state your name, carrier and unit numbers.", "Назовите свое имя, перевозчика и номера машин.", [1, 2, 3, 4]),
    ("Please spell the code and confirm its final letter.", "Продиктуйте код по буквам и подтвердите последнюю букву.", [1, 2, 3]),
    ("What are your appointment and arrival times?", "Назовите время назначения и фактического прибытия.", [1, 2]),
    ("Please give the load number and BOL number.", "Назовите номер груза и номер BOL.", [1, 3]),
    ("Where did you pick up, where are you delivering and what is the final destination?", "Назовите место отправления, место доставки и конечный пункт.", [1, 2, 3]),
    ("What are you hauling? Give the count and seal number.", "Опишите груз, назовите количество мест и номер пломбы.", [1, 2, 3]),
    ("Repeat the gate, yard row and dock directions.", "Повторите указания по воротам, ряду и погрузочным воротам.", [1, 2, 3]),
    ("State your duty status, available driving time and record status.", "Назовите рабочий статус, доступное время управления и состояние записей.", [1, 2, 3]),
    ("Report the defect, its location and your safe decision.", "Сообщите неисправность, ее место и безопасное решение.", [1, 2, 3]),
    ("Report the delay reason, new ETA and next update.", "Сообщите причину задержки, новое время прибытия и следующее обновление.", [1, 2, 3]),
    ("You did not understand the instruction. Ask for clarification and confirm how you will check it.", "Вы не поняли указание. Попросите уточнить и скажите, как проверите понимание.", [1, 3]),
    ("Present the driver, registration and inspection documents requested in this scenario.", "Предъявите запрошенные в сценарии документы водителя, регистрации и проверки.", [1, 2, 3]),
    ("Confirm the parking brake, lights and service-brake action.", "Подтвердите состояние стояночного тормоза, света и действие с рабочим тормозом.", [1, 2, 3]),
    ("State your carrier, pickup location and remaining driving time.", "Назовите перевозчика, место отправления и оставшееся время управления.", [1, 2, 3]),
    ("Ask before reaching, state your destination and confirm that you will remain in the vehicle.", "Спросите разрешение взять документы, назовите пункт доставки и подтвердите, что останетесь в машине.", [1, 2, 3]),
    ("Answer the cargo question, explain the sign and offer the correct record method.", "Ответьте о грузе, объясните знак и предложите способ предъявления записей.", [1, 2, 3]),
    ("Describe the combination, ratings, axle check and trailer-brake controller.", "Опишите автопоезд, рейтинги, проверку нагрузок и контроллер тормозов прицепа.", [1, 2, 3, 4]),
    ("Check whether the vehicle moves, then give the steering, centering and winch-safety directions.", "Проверьте, движется ли автомобиль, затем дайте указания по рулю, центровке и безопасности лебедки.", [1, 2, 3, 4]),
    ("Explain the front and rear securement, attachment points, wheel straps and departure recheck.", "Объясните переднее и заднее крепление, точки крепления, колесные ремни и повторную проверку после выезда.", [1, 2, 3, 4]),
    ("Explain the VIN check, existing damage, delivery inspection and signed condition outcome.", "Объясните сверку VIN, ранее существовавшее повреждение, осмотр при доставке и итог акта состояния.", [1, 2, 3, 4]),
    ("Give the ramp, clearance, spotter, securement and door checks for the enclosed trailer.", "Назовите проверки рампы, зазоров, сигнальщика, крепления и дверей закрытого прицепа.", [1, 2, 3, 4]),
]

PROFILE_LESSON_INTERACTION_OVERRIDES = {
    1: {
        "hotshot-open": ("State your name, carrier, equipment type and trailer number.", "Назовите свое имя, перевозчика, тип машины и номер прицепа.", [1, 2, 3, 4]),
        "hotshot-enclosed": ("State your name, carrier, equipment type, trailer number and plate.", "Назовите свое имя, перевозчика, тип машины, номер прицепа и номерной знак.", [1, 2, 3, 4]),
    },
    6: {
        "hotshot-open": ("State the vehicle count, VIN check, weight check and front-and-rear securement.", "Назовите количество автомобилей, сверку VIN, проверку массы и крепление спереди и сзади.", [1, 2, 3, 4]),
        "hotshot-enclosed": ("State the enclosed securement, VIN check, weight check and ramp-door latch status.", "Назовите крепление в закрытом прицепе, сверку VIN, проверку массы и состояние защелок двери-рампы.", [1, 2, 3, 4]),
    },
    9: {
        "hotshot-open": ("Report the marker-light defect, trailer-tire cut, safe decision and pressure trend.", "Сообщите о неисправности габаритного фонаря, порезе шины прицепа, безопасном решении и изменении давления.", [1, 2, 3, 4]),
        "hotshot-enclosed": ("Report the marker-light defect, trailer-tire cut, safe decision and ramp-door latch status.", "Сообщите о неисправности габаритного фонаря, порезе шины прицепа, безопасном решении и состоянии защелок двери-рампы.", [1, 2, 3, 4]),
    },
    12: {
        "hotshot-open": ("Present the proof of insurance, trailer registration and periodic inspection documentation.", "Предъявите страховой документ, регистрацию прицепа и документ о периодической проверке.", [1, 2, 3]),
        "hotshot-enclosed": ("Present the proof of insurance, trailer registration and periodic inspection documentation.", "Предъявите страховой документ, регистрацию прицепа и документ о периодической проверке.", [1, 2, 3]),
    },
}

VOICE_PRESET_IDS = {
    "driver": "CwhRBWXzGAHq8TQ4Fs17", "inspector": "cjVigY5qzO86Huf0OWal",
    "state-trooper": "pNInz6obpgDQGcFmaJgB", "dispatcher": "EXAVITQu4vr4xnSDxMaL",
    "gate-clerk": "XrExE9yKIg1WjnnlVkGX", "receiver": "hpp4J3VqNfWAUOO0d1Us",
    "mechanic": "nPczCjzI2devNBz1zQrb", "roadside-assistance": "SAz9YHcvj6GT2YYXdXww",
}
SPEAKER_METADATA = {
    "Driver": ("driver", "driver", "Водитель"),
    "Inspector": ("safety-inspector", "inspector", "Инспектор безопасности"),
    "Officer": ("enforcement-officer", "inspector", "Сотрудник весового контроля"),
    "Trooper": ("state-trooper", "state-trooper", "Сотрудник дорожной полиции"),
    "Dispatcher": ("carrier-dispatcher", "dispatcher", "Диспетчер перевозчика"),
    "Guard": ("security-gate-guard", "gate-clerk", "Сотрудник охраны на въезде"),
    "Clerk": ("shipping-clerk", "gate-clerk", "Сотрудник приемки или отгрузки"),
    "Scale Clerk": ("scale-clerk", "gate-clerk", "Оператор весов"),
    "Cashier": ("fuel-cashier", "gate-clerk", "Кассир АЗС"),
    "Staff": ("parking-attendant", "gate-clerk", "Сотрудник стоянки"),
    "Spotter": ("vehicle-spotter", "gate-clerk", "Сигнальщик"),
    "Receiver": ("receiver", "receiver", "Получатель"),
    "Loader": ("loader", "receiver", "Грузчик"),
    "Maintenance": ("maintenance-technician", "mechanic", "Механик"),
    "Roadside": ("roadside-assistance", "roadside-assistance", "Оператор дорожной помощи"),
    "911": ("emergency-dispatcher", "state-trooper", "Диспетчер 911"),
}


def enrich_dialogue_line(line):
    semantic_role, voice_preset, role_label_ru = SPEAKER_METADATA[line["speaker"]]
    return {
        **line,
        "semanticRole": semantic_role,
        "roleLabelRu": role_label_ru,
        "voicePreset": voice_preset,
        "voiceId": VOICE_PRESET_IDS[voice_preset],
    }


def resolve_build_date(explicit=None):
    value = explicit
    if value is None and os.environ.get("SOURCE_DATE_EPOCH"):
        try:
            value = datetime.fromtimestamp(int(os.environ["SOURCE_DATE_EPOCH"]), tz=timezone.utc).date().isoformat()
        except (TypeError, ValueError, OverflowError) as error:
            raise ValueError("SOURCE_DATE_EPOCH must be a valid Unix timestamp") from error
    value = value or DEFAULT_BUILD_DATE
    try:
        return datetime.strptime(value, "%Y-%m-%d").date().isoformat()
    except ValueError as error:
        raise ValueError("--built-on must use YYYY-MM-DD") from error


def stable_id(prefix, value):
    return f"{prefix}:{slug(value)}"


PRON_WORDS = {
    "a": "э", "about": "эбаут", "after": "афтэр", "again": "эгэн", "air": "эр",
    "all": "ол", "am": "эм", "and": "энд", "answer": "ансэр", "are": "ар",
    "at": "эт", "available": "эвэйлабэл", "back": "бэк", "brake": "брэйк",
    "brakes": "брэйкс", "call": "кол", "can": "кэн", "cargo": "карго",
    "carrier": "кэриэр", "check": "чэк", "clear": "клир", "complete": "кэмплит",
    "contact": "контэкт", "current": "кёрэнт", "driver": "драйвэр", "driving": "драйвинг",
    "document": "дакьюмэнт", "documents": "дакьюмэнтс", "do": "ду", "does": "даз",
    "duty": "дьюти", "engine": "энджин", "enter": "энтэр", "equipment": "иквипмэнт",
    "for": "фор", "from": "фром", "here": "хир", "hours": "ауэрз", "how": "хау",
    "i": "ай", "in": "ин", "inspection": "инспэкшэн", "inspector": "инспэктэр",
    "is": "из", "it": "ит", "lane": "лэйн", "left": "лэфт", "license": "лайсэнс",
    "load": "лоуд", "loaded": "лоудид", "logs": "логз", "may": "мэй", "me": "ми",
    "move": "мув", "my": "май", "no": "ноу", "not": "нат", "now": "нау",
    "number": "намбэр", "of": "ав", "off": "оф", "officer": "офисэр", "on": "ан",
    "open": "оупэн", "or": "ор", "out": "аут", "paper": "пэйпэр", "parking": "паркинг",
    "please": "плиз", "pull": "пул", "question": "квэсчэн", "ready": "рэди",
    "record": "рэкэрд", "records": "рэкэрдз", "registration": "рэджистрэйшэн",
    "remain": "римэйн", "repeat": "рипит", "report": "рипорт", "right": "райт",
    "roadside": "роудсайд", "safe": "сэйф", "safety": "сэйфти", "seal": "сил",
    "service": "сёрвис", "show": "шоу", "sign": "сайн", "slow": "слоу", "stay": "стэй",
    "stop": "стап", "the": "зэ", "this": "зис", "time": "тайм", "to": "ту",
    "tractor": "трактэр", "trailer": "трэйлэр", "transfer": "трэнсфёр", "truck": "трак",
    "turn": "тёрн", "understand": "андэрстэнд", "unit": "юнит", "vehicle": "виикл",
    "what": "уат", "when": "уэн", "where": "уэр", "which": "уич", "will": "уил",
    "with": "уиз", "yes": "йес", "you": "ю", "your": "йор",
}

ACRONYM_PRON = {
    "A.M": "эй-эм", "P.M": "пи-эм",
    "BOL": "би-оу-эл", "CDL": "си-ди-эл", "CVSA": "си-ви-эс-эй", "DEF": "ди-и-эф",
    "DOT": "ди-оу-ти", "DVIR": "ди-ви-ай-ар", "ELD": "и-эл-ди", "ETA": "и-ти-эй", "FMCSA": "эф-эм-си-эс-эй",
    "GVWR": "джи-ви-дабл-ю-ар", "HOS": "эйч-оу-эс", "IFTA": "ай-эф-ти-эй",
    "IRP": "ай-ар-пи", "MEC": "эм-и-си", "OOS": "оу-оу-эс", "OS&D": "оу-эс-энд-ди", "POD": "пи-оу-ди",
    "CMV": "си-эм-ви", "RODS": "родз", "SPE": "эс-пи-и", "USDOT": "ю-эс-ди-оу-ти", "VIN": "вин",
}

PRON_LEXICON = json.loads((EDITION / "data" / "pronunciation-lexicon.json").read_text(encoding="utf-8"))["entries"]
PRON_WORDS.update({
    "consignee": "кансайнИ", "dually": "дУэли", "gooseneck": "гУснэк", "hotshot": "хАтшот",
    "securement": "сикьУрмэнт", "tiedown": "тАйдаун", "tiedowns": "тАйдаунз", "winch": "уинч",
})


def load_local_audio_lookup():
    path = APP / "data" / "audio-data.js"
    prefix = "window.TRUCK_AUDIO_DATA = "
    source = path.read_text(encoding="utf-8").strip()
    if not source.startswith(prefix) or not source.endswith(";"):
        raise ValueError("app/data/audio-data.js has an unsupported wrapper")
    payload = json.loads(source[len(prefix):-1])
    lookup = payload.get("lookup")
    if not isinstance(lookup, dict):
        raise ValueError("app/data/audio-data.js is missing its exact local audio lookup")
    return lookup


LOCAL_AUDIO_LOOKUP = load_local_audio_lookup()


def _pronounce_word(token):
    bare = token.strip(".,?!:;()[]\"'")
    if not bare or bare == "/":
        return ""
    if bare in ACRONYM_PRON:
        return ACRONYM_PRON[bare]
    if bare.upper() in ACRONYM_PRON and bare.isupper():
        return ACRONYM_PRON[bare.upper()]
    lower = bare.lower()
    if lower in PRON_LEXICON:
        return PRON_LEXICON[lower]
    if lower in PRON_WORDS:
        return PRON_WORDS[lower]
    if lower.isdigit():
        digits = {"0": "зиро", "1": "уан", "2": "ту", "3": "сри", "4": "фор", "5": "файв", "6": "сикс", "7": "сэвэн", "8": "эйт", "9": "найн"}
        return " ".join(digits[digit] for digit in lower)
    raise ValueError(f"Unknown pronunciation token: {bare!r}")


def pronounce_ru(text):
    result = " ".join(filter(None, (_pronounce_word(token) for token in str(text).split())))
    return re.sub(r"\s+", " ", result).strip() or "произношение недоступно"


TRANSLATION_OVERRIDES = {
    "Commercial Vehicle Safety Alliance, CVSA": "Альянс безопасности коммерческого транспорта, CVSA",
    "restriction": "ограничение в водительских правах",
    "IRP cab card": "регистрационная карточка IRP",
    "driver vehicle inspection report, DVIR": "отчет водителя о техническом состоянии машины, DVIR",
    "citation": "протокол или предписание о нарушении",
    "CVSA decal": "наклейка CVSA о пройденной проверке",
    "power unit": "силовая единица автопоезда, тягач",
    "locking jaws": "захваты седельно-сцепного устройства",
    "trailer apron": "опорная плита передней части прицепа",
    "emergency air line": "аварийная пневмолиния",
    "landing gear": "опорные стойки прицепа",
    "trailer emergency brake": "аварийный тормоз прицепа",
    "trailer axle": "ось или группа осей прицепа",
    "marker light": "контурный или боковой габаритный фонарь",
    "sleeper berth": "время в спальном отсеке",
    "driving": "статус управления машиной",
    "data transfer": "передача записей ELD",
    "gross weight": "полная масса автопоезда",
    "slider pin": "фиксатор сдвижных осей прицепа",
}

RUSSIAN_TRANSLATION_OVERRIDES = {
    "I am opening roadside inspection mode now.": "Я открываю режим дорожной проверки.",
    "The low-air warning activated at 58 psi.": "Предупреждение о низком давлении сработало при 58 фунтах на квадратный дюйм.",
    "I am at mile marker 42 on I-71 southbound. Unit T-204.": "Я на I-71 в южном направлении у отметки 42-й мили. Машина T-204.",
    "Your pickup is at Sample Foods at 2:00 p.m.": "Погрузка назначена в Sample Foods на 14:00.",
    "I will update after check-in.": "Я сообщу после регистрации на месте.",
    "Company name and pickup number?": "Название компании и номер погрузки?",
    "Training Carrier. Pickup number 000518.": "Training Carrier. Номер погрузки 000518.",
    "Are you here for pickup or delivery?": "Вы приехали на погрузку или доставку?",
    "I am here for pickup. The load number is 000518.": "Я приехал на погрузку. Номер груза 000518.",
    "Use dock door 18.": "Подъезжайте к погрузочным воротам 18.",
    "Please confirm, dock door one-eight?": "Подтвердите: погрузочные ворота один-восемь?",
    "Understood. I will call with an updated ETA.": "Понял. Я сообщу новое расчетное время прибытия.",
    "What is the delay reason and current ETA?": "Какова причина задержки и текущее расчетное время прибытия?",
    "The dock is unavailable. New ETA is 5:00 p.m.": "Погрузочные ворота недоступны. Новое расчетное время прибытия 17:00.",
    "Use rows E through H.": "Используйте ряды с E по H.",
}


def natural_translation(english, translation):
    if english in TRANSLATION_OVERRIDES:
        return TRANSLATION_OVERRIDES[english]
    if english in RUSSIAN_TRANSLATION_OVERRIDES:
        return RUSSIAN_TRANSLATION_OVERRIDES[english]
    replacements = {
        "work zone": "зоне дорожных работ",
        "engine brake": "моторного тормоза", "highway": "шоссе", "services": "сервисные пункты",
        "vehicle": "машине", "truck space": "месте для грузовика", "tandems": "сдвижные оси",
        "roadside service": "дорожную техпомощь", "shipper": "отправителю",
    }
    value = translation
    for source, target in replacements.items():
        pattern = rf"\b{re.escape(source)}\b"
        if source == "shipper":
            pattern = rf"(?<!Training )\b{re.escape(source)}\b"
        value = re.sub(pattern, target, value, flags=re.IGNORECASE)
    return value


def slug(value):
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "item"


def table_parts(line):
    return [part.strip() for part in line.strip().strip("|").split("|")]


def parse_terminology():
    lines = (EDITION / "09_TRUCK_TERMINOLOGY.md").read_text(encoding="utf-8").splitlines()
    terms = []
    section = "Truck terminology"
    for line in lines:
        if line.startswith("## "):
            section = re.sub(r",\s*\d+ units$", "", line[3:].strip())
        if not line.startswith("| ") or line.startswith("|---") or line.startswith("| English "):
            continue
        parts = table_parts(line)
        if len(parts) == 3:
            terms.append({"english": parts[0], "translation": parts[1], "example": parts[2], "theme": section})
    if len(terms) != 120:
        raise ValueError(f"Expected 120 terminology rows, got {len(terms)}")
    return terms


PHRASE_TRANSLATIONS = [
    "Да, офицер. Я понимаю.",
    "Где вы хотите, чтобы я остановился?",
    "Стояночный тормоз установлен.",
    "Двигатель выключен.",
    "Я могу выйти из машины сейчас?",
    "Можно мне потянуться за папкой с документами?",
    "Я останусь в кабине.",
    "Я не буду двигать транспортное средство.",
    "Мне разрешено продолжить движение?",
    "Какой следующий обязательный шаг?",
    "Вот мои коммерческие водительские права.",
    "Вот регистрация тягача.",
    "Регистрация прицепа находится в этой папке.",
    "Вот подтверждение страхования.",
    "Документ периодической проверки находится в машине.",
    "Вот транспортная накладная на этот груз.",
    "Я забрал груз в городе и штате, указанных в задании.",
    "Я доставляю груз в город и штат, указанные в задании.",
    "Я везу указанный вид груза.",
    "Мой текущий рабочий статус указан в ответе.",
    "Повторите, пожалуйста, медленнее.",
    "Сформулируйте вопрос иначе, пожалуйста.",
    "Я понял первую часть, но не вторую.",
    "Вы просите регистрацию тягача или прицепа?",
    "Вы хотите, чтобы я показал экран или передал записи?",
    "Какой способ передачи вы хотите использовать?",
    "Можно я проверю документ перед ответом?",
    "Я не знаю эту информацию.",
    "Я не хочу угадывать. В документе указано следующее.",
    "Можно я повторю инструкцию, чтобы подтвердить ее?",
]

INSPECTION_RU = [
    ("Заезжайте на полосу досмотра.", "Да, офицер. Я заеду на полосу досмотра."),
    ("Остановитесь у белой линии.", "Понял. Я остановлюсь у белой линии."),
    ("Включите стояночный тормоз.", "Стояночный тормоз включен."),
    ("Выключите двигатель.", "Двигатель выключен."),
    ("Оставьте машину здесь.", "Понял. Я останусь здесь."),
    ("Оставайтесь в кабине, пока я не разрешу выйти.", "Понял. Я останусь в кабине."),
    ("Выйдите из машины, пожалуйста.", "Да, офицер. Где мне встать?"),
    ("Вы понимаете мои указания?", "Да. Первую часть я понял. Повторите, пожалуйста, последнюю инструкцию."),
    ("Откуда вы едете?", "Я забрал груз в Колумбусе, штат Огайо."),
    ("Куда вы едете?", "Я доставляю груз в Нэшвилл, штат Теннесси."),
    ("Какой у вас конечный пункт назначения?", "Мой конечный пункт назначения: Атланта, штат Джорджия."),
    ("Что вы перевозите?", "Я перевожу упакованные продукты."),
    ("Прицеп загружен или пуст?", "Прицеп загружен. / Прицеп пуст."),
    ("Где вы забрали этот груз?", "Я забрал его у компании Training Shipper в Колумбусе, штат Огайо."),
    ("На какое время назначена доставка?", "Доставка назначена на 9:30 утра 20 августа."),
    ("Назовите номера машины и прицепа.", "Номер машины T-204, номер прицепа TR-518."),
    ("Покажите коммерческие водительские права.", "Да. Вот мои CDL."),
    ("Какой класс указан в ваших правах?", "У меня CDL класса A."),
    ("У вас есть дополнительные категории?", "Да, у меня есть допуск к автоцистернам. / Нет."),
    ("В правах указаны ограничения?", "Указано ограничение L. / Ограничений нет."),
    ("На какого перевозчика вы работаете?", "Я работаю на Training Carrier."),
    ("Какой USDOT номер у перевозчика?", "USDOT номер: 1234567."),
    ("Это закрепленный за вами тягач?", "Да, это мой закрепленный тягач. / Нет, это временный тягач."),
    ("У вас есть медицинское исключение или сертификат SPE?", "Да, документ здесь. / Нет, ко мне это не относится."),
    ("Покажите регистрацию тягача.", "Вот регистрация тягача."),
    ("У вас есть регистрация прицепа?", "Да. Она в этой папке."),
    ("Покажите подтверждение страхования.", "Да. Вот мое подтверждение страхования."),
    ("Где документы о периодической проверке?", "Отчет по тягачу здесь, отчет по прицепу тоже здесь."),
    ("Когда тягач проходил последнюю проверку?", "Его проверили 1 августа 2026 года."),
    ("Регистрация соответствует номеру машины?", "Да, номер машины и VIN совпадают. / Есть расхождение, я свяжусь со службой безопасности перевозчика."),
    ("Прицеп арендован?", "Да, он арендован, документ на оборудование здесь. / Нет, он принадлежит перевозчику."),
    ("У вас есть применимое разрешение?", "Да. Вот разрешение на этот рейс. / Для этого груза специальное разрешение не требуется."),
    ("Покажите транспортные документы.", "Да. Вот транспортная накладная."),
    ("Какой номер транспортной накладной?", "Номер BOL: BOL-4582."),
    ("Кто отправитель?", "Отправитель: Training Shipper."),
    ("Кто получатель?", "Получатель: Training Receiver."),
    ("Какой вес указан в документах?", "Указанный вес: 38 200 фунтов."),
    ("Это опасный груз?", "Нет. / Да. Документ на опасный груз лежит сверху."),
    ("Какой номер пломбы?", "Номер пломбы: 000845."),
    ("У вас есть сопроводительные документы на рейс?", "Да. У меня есть BOL, весовой талон и чек на топливо."),
    ("Какой у вас сейчас рабочий статус?", "Я на работе, но не управляю машиной."),
    ("Сколько времени управления у вас осталось?", "У меня осталось 4 часа 18 минут управления."),
    ("Когда вы сегодня начали работу?", "Я начал работу в 7:40 утра."),
    ("Где вы делали последний перерыв?", "Последний перерыв был в Колумбусе, штат Огайо."),
    ("Ваши журналы актуальны?", "Да. Журналы актуальны и подтверждены."),
    ("Покажите сегодняшний журнал и предыдущие семь дней.", "Да. Я открываю режим дорожной проверки."),
    ("Передайте записи ELD.", "Какой поддерживаемый способ передачи использовать?"),
    ("Введите этот комментарий к выходному файлу.", "Понял. Я введу комментарий точно, как указано."),
    ("Есть записи движения без назначенного водителя?", "Нет. / Да, есть одна запись, к которой я уже добавил пояснение."),
    ("Вы исправляли эту запись рабочего статуса?", "Да. Я исправил номер машины и добавил пояснение. / Нет."),
    ("ELD неисправен?", "Да. Неисправность началась в 7:40 утра, я письменно уведомил перевозчика."),
    ("Где чистые бумажные журналы?", "Они находятся в информационном пакете ELD."),
    ("Включите фары.", "Фары включены."),
    ("Включите дальний свет.", "Дальний свет включен."),
    ("Включите левый указатель поворота.", "Левый указатель поворота включен."),
    ("Включите правый указатель поворота.", "Правый указатель поворота включен."),
    ("Включите аварийную сигнализацию.", "Аварийная сигнализация включена."),
    ("Нажмите и удерживайте рабочий тормоз.", "Я нажимаю и удерживаю рабочий тормоз."),
    ("Подайте звуковой сигнал.", "Сейчас подам звуковой сигнал."),
    ("Включите стеклоочистители.", "Стеклоочистители включены."),
    ("Откройте капот.", "Капот открыт."),
    ("Отпустите тормоза тягача, тормоза прицепа оставьте включенными.", "Тормоза тягача отпущены, тормоза прицепа включены."),
    ("Снизьте давление в тормозной системе последовательными нажатиями.", "Понял. Я снижу давление последовательными нажатиями."),
    ("Сообщите, когда сработает предупреждение о низком давлении воздуха.", "Предупреждение сработало при 60 psi."),
    ("Вам известны какие-либо неисправности?", "Да. Я сообщил о порезе боковины шины. / Сейчас известных неисправностей нет."),
    ("Как закреплен груз?", "Он закреплен распорными балками, я проверил крепление в Колумбусе, штат Огайо."),
    ("В каком состоянии пломба?", "Пломба цела и соответствует BOL."),
    ("Проверка завершена.", "Спасибо. Можно получить отчет о проверке?"),
    ("Я обнаружил нарушение.", "Понял. Какой пункт указан в отчете?"),
    ("Эта машина отстранена от эксплуатации.", "Понял. Я не буду двигать машину. Какой следующий обязательный шаг?"),
    ("Водитель отстранен от работы до окончания обязательного отдыха.", "Понял. Я останусь отстраненным до выполнения условия."),
    ("Распишитесь здесь в получении.", "Моя подпись подтверждает только получение отчета?"),
    ("Можете продолжать движение.", "Спасибо. Я могу выехать с территории проверки?"),
    ("Переместитесь в зону ремонта.", "Понял. Покажите разрешенный путь в зону ремонта."),
    ("Свяжитесь со своим перевозчиком.", "Понял. Сейчас свяжусь со службой безопасности перевозчика."),
]


def slot(name, slot_type, display, spoken=None):
    return {"name": name, "type": slot_type, "display": display, "spoken": spoken or display}


QUESTION_SLOT_CONFIG = {
    9: {"answerTemplate": "I picked up in [origin-city-state].", "slots": [slot("origin-city-state", "location", "Columbus, Ohio")]},
    10: {"answerTemplate": "I am delivering in [destination-city-state].", "slots": [slot("destination-city-state", "location", "Nashville, Tennessee")]},
    11: {"answerTemplate": "My final destination is [destination-city-state].", "slots": [slot("destination-city-state", "location", "Atlanta, Georgia")]},
    12: {"answerTemplate": "I am hauling [commodity].", "slots": [slot("commodity", "cargo-description", "packaged food")]},
    14: {"answerTemplate": "I picked it up at [shipper-name] in [origin-city-state].", "slots": [slot("shipper-name", "organization", "Training Shipper"), slot("origin-city-state", "location", "Columbus, Ohio")]},
    15: {"answerTemplate": "My appointment is at [appointment-time] on [appointment-date].", "slots": [slot("appointment-time", "time", "9:30 a.m.", "nine thirty A.M."), slot("appointment-date", "date", "August 20", "August twentieth")]},
    16: {"answerTemplate": "The truck is [power-unit-id] and the trailer is [trailer-unit-id].", "slots": [slot("power-unit-id", "equipment-identifier", "T-204", "T two zero four"), slot("trailer-unit-id", "equipment-identifier", "TR-518", "T R five one eight")]},
    19: {"answerTemplate": "Yes. I have a [endorsement] endorsement. / No, I do not.", "slots": [slot("endorsement", "credential-endorsement", "tanker")]},
    20: {"answerTemplate": "It shows restriction [restriction-code]. / There are no restrictions listed.", "slots": [slot("restriction-code", "credential-code", "L") ]},
    21: {"answerTemplate": "I drive for [carrier-name].", "slots": [slot("carrier-name", "organization", "Training Carrier")]},
    22: {"answerTemplate": "The USDOT number is [usdot-id].", "slots": [slot("usdot-id", "identifier-digits", "1234567", "one two three four five six seven")]},
    29: {"answerTemplate": "It was inspected on [inspection-date].", "slots": [slot("inspection-date", "date", "August 1, 2026", "August first, twenty twenty-six")]},
    34: {"answerTemplate": "The BOL number is [bol-id].", "slots": [slot("bol-id", "document-identifier", "BOL-4582", "B O L four five eight two")]},
    35: {"answerTemplate": "The shipper is [shipper-name].", "slots": [slot("shipper-name", "organization", "Training Shipper")]},
    36: {"answerTemplate": "The consignee is [consignee-name].", "slots": [slot("consignee-name", "organization", "Training Receiver")]},
    37: {"answerTemplate": "The listed weight is [cargo-weight-lb] pounds.", "slots": [slot("cargo-weight-lb", "weight-cardinal", "38,200", "thirty-eight thousand two hundred")]},
    39: {"answerTemplate": "The seal number is [seal-id].", "slots": [slot("seal-id", "identifier-digits", "000845", "zero zero zero eight four five")]},
    42: {"answerTemplate": "I have [driving-hours] hours and [driving-minutes] minutes left.", "slots": [slot("driving-hours", "duration-hours", "4", "four"), slot("driving-minutes", "duration-minutes", "18", "eighteen")]},
    43: {"answerTemplate": "I came on duty at [duty-start-time]", "slots": [slot("duty-start-time", "time", "7:40 a.m.", "seven forty A.M.")]},
    44: {"answerTemplate": "I took my last break in [break-city-state].", "slots": [slot("break-city-state", "location", "Columbus, Ohio")]},
    47: {"answerTemplate": "Which supported transfer method would you like me to use?", "slots": []},
    50: {"answerTemplate": "Yes. I corrected [eld-edit-fact] and added an annotation. / No, I did not edit it.", "slots": [slot("eld-edit-fact", "statement", "the unit number mismatch")]},
    51: {"answerTemplate": "Yes. The malfunction started at [malfunction-time], and I notified the carrier in writing.", "slots": [slot("malfunction-time", "time", "7:40 a.m.", "seven forty A.M.")]},
    64: {"answerTemplate": "The low-air warning activated at [pressure-psi].", "slots": [slot("pressure-psi", "pressure", "60 psi", "sixty P S I")]},
    65: {"answerTemplate": "Yes. I reported [defect]. / No known defects at this time.", "slots": [slot("defect", "defect-description", "a cut in the tire sidewall")]},
    66: {"answerTemplate": "It is secured with [securement-method], and I checked it at [inspection-location].", "slots": [slot("securement-method", "securement-method", "load bars"), slot("inspection-location", "location", "Columbus, Ohio")]},
    71: {
        "promptTemplate": "The driver is out of service until [oos-condition].",
        "answerTemplate": "Understood. I will remain out of service until [oos-condition].",
        "slots": [slot("oos-condition", "oos-condition", "the required rest period is complete")],
    },
}


def materialize_template(template, slots, spoken=False):
    result = template
    for item in slots:
        result = result.replace(f"[{item['name']}]", item["spoken" if spoken else "display"])
    if re.search(r"\[[^]]+\]", result):
        raise ValueError(f"Unresolved typed slot in: {result}")
    return result


def typed_question(index, row):
    config = QUESTION_SLOT_CONFIG.get(index, {})
    slots = config.get("slots", [])
    prompt_template = config.get("promptTemplate", row["prompt"])
    answer_template = config.get("answerTemplate", row["answer"])
    return {
        **row,
        "promptTemplate": prompt_template,
        "answerTemplate": answer_template,
        "promptDisplay": materialize_template(prompt_template, slots),
        "answerDisplay": materialize_template(answer_template, slots),
        "prompt": materialize_template(prompt_template, slots, spoken=True),
        "answer": materialize_template(answer_template, slots, spoken=True),
        "slots": slots,
    }


REQUIRED_SLOT_CONFIG = {
    "I picked up in [city, state].": ("I picked up in [origin-city-state].", [slot("origin-city-state", "location", "Columbus, Ohio")]),
    "I am delivering in [city, state].": ("I am delivering in [destination-city-state].", [slot("destination-city-state", "location", "Nashville, Tennessee")]),
    "I am hauling [commodity].": ("I am hauling [commodity].", [slot("commodity", "cargo-description", "packaged food")]),
    "My current duty status is [status].": ("My current duty status is [duty-status].", [slot("duty-status", "duty-status", "on duty, not driving")]),
    "I do not want to guess. The document shows [fact].": ("I do not want to guess. The document shows [document-fact].", [slot("document-fact", "statement", "that the unit number does not match")]),
}


def parse_required_phrases():
    lines = (EDITION / "09_TRUCK_TERMINOLOGY.md").read_text(encoding="utf-8").splitlines()
    phrases = []
    section = None
    active = False
    for line in lines:
        if line == "## 30 обязательных речевых формул":
            active = True
            continue
        if active and line.startswith("## "):
            break
        if active and line.startswith("### "):
            section = line[4:].strip()
            continue
        match = re.match(r"\d+\. `(.+)`", line)
        if active and match:
            phrases.append({"english": match.group(1), "theme": section})
    if len(phrases) != 30:
        raise ValueError(f"Expected 30 required phrases, got {len(phrases)}")
    for item, translation in zip(phrases, PHRASE_TRANSLATIONS):
        original = item["english"]
        template, slots = REQUIRED_SLOT_CONFIG.get(original, (original, []))
        item.update({
            "template": template,
            "display": materialize_template(template, slots),
            "english": materialize_template(template, slots, spoken=True),
            "slots": slots,
            "translation": natural_translation(original, translation),
        })
    return phrases


def parse_inspection_bank():
    lines = (EDITION / "07_INSPECTIONS_AND_OFFICIAL_QUESTIONS.md").read_text(encoding="utf-8").splitlines()
    start = next(index for index, line in enumerate(lines) if line in {
        "## Банк representative training prompts",
        "## Банк вопросов и ответов",
    })
    end = lines.index("## Базовое общение со state trooper")
    rows = []
    section = "Representative training prompts"
    for line in lines[start:end]:
        if line.startswith("### "):
            section = line[4:].strip()
        if not line.startswith("| ") or line.startswith("|---"):
            continue
        parts = table_parts(line)
        if len(parts) != 2 or parts[0].startswith("Вопрос"):
            continue
        rows.append({"prompt": parts[0], "answer": parts[1], "category": section})
    if len(rows) != 75:
        raise ValueError(f"Expected 75 inspection rows, got {len(rows)}")
    if len(INSPECTION_RU) != len(rows):
        raise ValueError(f"Expected 75 Russian inspection translations, got {len(INSPECTION_RU)}")
    result = []
    for index, (row, translations) in enumerate(zip(rows, INSPECTION_RU), 1):
        prompt_ru, answer_ru = translations
        result.append(typed_question(index, {**row, "promptRu": prompt_ru, "answerRu": answer_ru}))
    return result


def parse_situations():
    lines = (EDITION / "03_SITUATION_MATRIX.md").read_text(encoding="utf-8").splitlines()
    start = lines.index("## Матрица v1")
    end = lines.index("## Режимы одной ситуации")
    rows = []
    for line in lines[start:end]:
        if not line.startswith("| ") or line.startswith("|---") or "Приоритет" in line:
            continue
        parts = table_parts(line)
        rows.append({
            "priority": int(parts[0]),
            "title": parts[1],
            "roles": [part.strip() for part in parts[2].split(",")],
            "goal": parts[3],
            "mechanic": parts[4],
            "visual": parts[5],
        })
    if len(rows) != 32:
        raise ValueError(f"Expected 32 situations, got {len(rows)}")
    return rows


DOC_RU = [
    "Коммерческие водительские права",
    "Медицинское свидетельство",
    "Сертификат SPE",
    "Регистрация тягача и карточка IRP",
    "Регистрация прицепа",
    "Подтверждение страхования",
    "Пакет периодической проверки",
    "Отчет водителя о состоянии машины",
    "Необязательная помощь: руководство ELD",
    "Инструкция по передаче данных ELD",
    "Инструкция при неисправности ELD",
    "Бумажный журнал RODS",
    "Экран ELD для дорожной проверки",
    "Транспортная накладная",
    "Весовой талон",
    "Копия лицензии IFTA",
    "Транспортный документ на опасный груз",
    "Разрешение на негабаритный или тяжеловесный груз",
    "Отчет о дорожной проверке",
    "Подтверждение доставки и отчет о расхождениях OS&D",
]

DOCUMENT_META = {
    "commercial-drivers-license": {
        "profiles": ALL_PROFILES,
        "conditions": ["cdl-required"],
        "sourceRefs": ["https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-383/subpart-B/section-383.23"],
    },
    "medical-examiner-certificate": {
        "profiles": ALL_PROFILES,
        "conditions": ["medical-status-proof"],
        "effectiveFrom": "2026-04-11",
        "effectiveThrough": "2026-10-11",
        "effectiveDateContext": "Temporary nationwide NRII transition exemption. Paper MEC proof may be used for up to 60 days after issuance during this period; it is not a permanent universal carry rule.",
        "sourceRefs": ["https://www.fmcsa.dot.gov/newsroom/fmcsa-issues-temporary-exemption-support-nrii-transition"],
    },
    "spe-certificate": {
        "profiles": ALL_PROFILES,
        "conditions": ["spe-variance"],
        "sourceRefs": ["https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-391/subpart-E/section-391.49"],
    },
    "tractor-registration-irp": {
        "profiles": ["tractor"],
        "conditions": [],
        "sourceRefs": ["https://www.fmcsa.dot.gov/international-programs/are-you-ready-vehicle-andor-driver-inspection-visor-card"],
    },
    "trailer-registration": {
        "profiles": ["tractor"],
        "conditions": ["registration-required", "dry-van-load"],
        "sourceRefs": ["https://www.fmcsa.dot.gov/international-programs/are-you-ready-vehicle-andor-driver-inspection-visor-card"],
    },
    "proof-of-insurance": {
        "profiles": ALL_PROFILES,
        "conditions": [],
        "sourceRefs": ["https://www.fmcsa.dot.gov/international-programs/are-you-ready-vehicle-andor-driver-inspection-visor-card"],
    },
    "periodic-inspection-package": {
        "profiles": ALL_PROFILES,
        "conditions": ["periodic-inspection-proof-applicable"],
        "sourceRefs": ["https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-396/section-396.17"],
    },
    "driver-vehicle-inspection-report": {
        "profiles": ["tractor"],
        "conditions": ["dvir-applicable"],
        "sourceRefs": ["https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-396/section-396.11"],
    },
    "eld-user-manual-locator": {
        "profiles": ALL_PROFILES,
        "conditions": ["eld-required"],
        "status": "training",
        "federallyRequiredOnboard": False,
        "optionalDeviceHelp": True,
        "effectiveFrom": "2026-07-22",
        "effectiveDateContext": "Optional device help only. Effective July 22, 2026, 49 CFR 395.22(h) no longer requires an ELD user manual onboard a CMV.",
        "sourceRefs": [
            "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-B/section-395.22",
            "https://www.federalregister.gov/documents/2026/06/22/2026-12448/rescinding-the-requirement-for-electronic-logging-device-operators-manual-located-in-commercial",
        ],
    },
    "eld-transfer-instructions": {
        "profiles": ALL_PROFILES,
        "conditions": ["eld-required"],
        "federallyRequiredOnboard": True,
        "sourceRefs": [
            "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-B/section-395.22",
            "https://www.fmcsa.dot.gov/hours-service/elds/eld-data-transfer-faqs",
        ],
    },
    "eld-malfunction-instructions": {
        "profiles": ALL_PROFILES,
        "conditions": ["eld-required", "eld-malfunction"],
        "federallyRequiredOnboard": True,
        "sourceRefs": ["https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-B/section-395.34"],
    },
    "blank-paper-rods": {
        "profiles": ALL_PROFILES,
        "conditions": ["eld-required"],
        "federallyRequiredOnboard": True,
        "minimumBlankDays": 8,
        "sourceRefs": ["https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-B/section-395.22"],
    },
    "eld-roadside-screen": {
        "profiles": ALL_PROFILES,
        "conditions": ["eld-required"],
        "recordWindow": "current 24-hour period plus previous 7 consecutive days",
        "sourceRefs": [
            "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-B/section-395.24",
            "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-B/section-395.34",
        ],
    },
    "bill-of-lading": {"profiles": ["tractor"], "conditions": ["trip-specific", "dry-van-load"], "sourceRefs": []},
    "scale-ticket": {
        "profiles": ["tractor"],
        "conditions": ["trip-specific", "scale-ticket-issued", "dry-van-load"],
        "sourceRefs": ["https://www.fmcsa.dot.gov/hours-service/elds/are-drivers-required-show-supporting-documents-during-roadside-inspections"],
    },
    "ifta-license-copy": {"profiles": ALL_PROFILES, "conditions": ["ifta-applicable"], "sourceRefs": []},
    "hazmat-shipping-paper": {
        "profiles": ALL_PROFILES,
        "conditions": ["hazmat"],
        "sourceRefs": [
            "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-172/subpart-C/section-172.202",
            "https://www.phmsa.dot.gov/regulations/title49/interp/21-0037",
        ],
        "complianceReviewedOn": "2026-08-21",
    },
    "oversize-overweight-permit": {"profiles": ["tractor"], "conditions": ["oversize-or-overweight", "dry-van-load"], "sourceRefs": []},
    "roadside-inspection-report": {
        "profiles": ALL_PROFILES,
        "conditions": ["post-inspection"],
        "sourceRefs": ["https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-396/section-396.9"],
    },
    "proof-of-delivery-osd": {"profiles": ["tractor"], "conditions": ["trip-specific", "delivery", "dry-van-load"], "sourceRefs": []},
}

COMPLIANCE_DOCUMENT_RU = {
    "medical-examiner-certificate": {
        "applicabilityRu": "Для водителя, которому в текущем сценарии требуется подтверждение медицинского статуса.",
        "dateContextRu": "Временное федеральное исключение действует с 11 апреля по 11 октября 2026 года. В этот период бумажное медицинское свидетельство может подтверждать статус не более 60 дней после выдачи. Это не постоянное универсальное правило хранения на борту.",
        "safeActionRu": "Проверьте дату выдачи и срок действия, затем примените актуальную процедуру штата и FMCSA.",
    },
    "periodic-inspection-package": {
        "applicabilityRu": "Для машины, по которой требуется подтверждение периодической проверки согласно 49 CFR 396.17.",
        "dateContextRu": "Проверяйте дату фактической проверки конкретной машины и срок, применимый к текущему рейсу.",
        "safeActionRu": "Сверьте номер машины, VIN, дату проверки и место хранения отчета до предъявления.",
    },
    "eld-user-manual-locator": {
        "applicabilityRu": "Только справочная помощь для водителя машины с ELD.",
        "dateContextRu": "С 22 июля 2026 года руководство пользователя ELD не является обязательным федеральным документом на борту по 49 CFR 395.22(h).",
        "safeActionRu": "Используйте руководство как помощь по устройству, но не называйте его обязательной частью федерального комплекта ELD.",
    },
    "eld-transfer-instructions": {
        "applicabilityRu": "Для машины, на которую распространяется требование ELD, при передаче данных уполномоченному сотруднику безопасности.",
        "dateContextRu": "Учебный диапазон данных: текущие 24 часа и предыдущие семь последовательных дней.",
        "safeActionRu": "Спросите, какой поддерживаемый устройством способ передачи использовать, точно введите комментарий к файлу и отправьте данные один раз.",
        "instructionsRu": [
            "Откройте режим дорожной проверки.", "Выберите передачу данных.",
            "Спросите сотрудника безопасности, какой поддерживаемый способ использовать.",
            "Выберите Web Services или Email, если эти способы поддерживает зарегистрированное устройство.",
            "Точно введите комментарий к выходному файлу, который сообщил сотрудник.",
            "Проверьте диапазон: текущий день и предыдущие семь последовательных дней.",
            "Один раз нажмите отправку.", "Сообщите результат, показанный устройством.",
        ],
    },
    "eld-malfunction-instructions": {
        "applicabilityRu": "Для машины с неисправным ELD, когда применяется 49 CFR 395.34.",
        "dateContextRu": "Водитель письменно уведомляет перевозчика в течение 24 часов. Перевозчик обычно восстанавливает соответствие в течение восьми дней, если FMCSA не предоставила продление.",
        "safeActionRu": "Зафиксируйте код и время, уведомите перевозчика, восстановите требуемые записи и ведите бумажный RODS до восстановления ELD.",
        "instructionsRu": [
            "Запишите код неисправности и время.", "Письменно уведомите перевозчика в течение 24 часов после обнаружения.",
            "При необходимости восстановите текущие 24 часа и предыдущие семь последовательных дней, если данные нельзя получить иначе.",
            "Ведите бумажный RODS, пока ELD не обслужен и снова не соответствует требованиям.",
            "Держите восстановленные записи готовыми для дорожной проверки.",
            "Перевозчик обычно должен отремонтировать, заменить или обслужить ELD в течение восьми дней, если FMCSA не дала продление.",
        ],
    },
    "blank-paper-rods": {
        "applicabilityRu": "Для федерального комплекта ELD, когда требуется запас бумажных графических сеток.",
        "dateContextRu": "Минимальный запас рассчитан не менее чем на восемь дней.",
        "safeActionRu": "Проверьте наличие пустых сеток и заполняйте все обязательные поля разборчиво при переходе на бумажные записи.",
    },
    "eld-roadside-screen": {
        "applicabilityRu": "Для предъявления записей ELD при дорожной проверке, когда ELD обязателен.",
        "dateContextRu": "Показывается текущий 24-часовой период и предыдущие семь последовательных дней.",
        "safeActionRu": "Сначала проверьте текущий статус, доступные часы, сертификацию, неопознанное вождение и активные неисправности.",
    },
    "hazmat-shipping-paper": {
        "applicabilityRu": "Только для рейса с опасным грузом, к которому применяются требования к транспортному документу.",
        "dateContextRu": "Учебный образец проверен 21 августа 2026 года по полям 49 CFR 172.202 и разъяснению PHMSA 21-0037.",
        "safeActionRu": "Сверьте транспортное наименование, количество, упаковки, аварийный телефон и доступность документа. Этот образец нельзя использовать в реальной перевозке.",
    },
    "roadside-inspection-report": {
        "applicabilityRu": "После завершенной дорожной проверки, если сотрудник выдал отчет.",
        "dateContextRu": "Действуйте по датам, срокам и распоряжениям в фактически выданном отчете.",
        "safeActionRu": "Отдельно проверьте нарушения, статус OOS водителя и машины, затем выполните указания отчета и процедуру перевозчика.",
    },
}


DOCUMENT_INSTANCE_BLUEPRINTS = {
    "document:commercial-drivers-license": {
        "answerLabel": "License number", "sampleB": {"License number": "TRAINING-B0002"},
    },
    "document:medical-examiner-certificate": {
        "answerLabel": "Expiration date", "sampleB": {"Exam date": "08/02/2026", "Expiration date": "08/01/2027"},
    },
    "document:spe-certificate": {
        "answerLabel": "Certificate number", "sampleB": {"Certificate number": "SPE-TRAINING-002"},
    },
    "document:tractor-registration-irp": {
        "answerLabel": "Unit number", "sampleB": {"Unit number": "T-318", "Plate": "SAMPLE318"},
    },
    "document:trailer-registration": {
        "answerLabel": "Trailer number", "sampleB": {"Trailer number": "TR-744", "Plate": "SAMPLE744"},
    },
    "document:proof-of-insurance": {
        "answerLabel": "Policy number", "sampleB": {"Policy number": "POLICY-NOT-VALID-002"},
    },
    "document:periodic-inspection-package": {
        "answerLabel": "Inspection date", "sampleB": {"Inspection date": "05/12/2026"},
    },
    "document:driver-vehicle-inspection-report": {
        "answerLabel": "Date", "sampleB": {"Date": "08/21/2026", "Tractor": "T-318", "Trailer": "TR-744"},
    },
    "document:eld-user-manual-locator": {
        "answerLabel": "Registration ID", "sampleB": {"Registration ID": "TEST002"},
    },
    "document:eld-transfer-instructions": {
        "answerLabel": "Supported transfer set in this sample",
        "sampleAValue": "Web Services or Email on this registered telematics ELD",
        "sampleB": {"Supported transfer set in this sample": "USB 2.0 or Bluetooth on this registered local-transfer ELD"},
    },
    "document:eld-malfunction-instructions": {
        "answerLabel": "Malfunction code", "sampleB": {"Malfunction code": "E, training example", "Detected": "08/21/2026 07:40 ET", "Carrier notified": "08/21/2026 07:55 ET"},
    },
    "document:blank-paper-rods": {
        "answerLabel": "Date", "sampleAValue": "08/20/2026, TRAINING ENTRY", "sampleB": {"Date": "08/21/2026, TRAINING ENTRY"},
    },
    "document:eld-roadside-screen": {
        "answerLabel": "Driving available", "sampleB": {"Driving available": "07:21", "Shift available": "09:05"},
    },
    "document:bill-of-lading": {
        "answerLabel": "Load number", "sampleB": {"Load number": "LOAD-008204", "Pieces": "20 pallets", "Weight": "36,800 lb"},
    },
    "document:scale-ticket": {
        "answerLabel": "Gross weight", "sampleB": {"Tractor": "T-318", "Trailer": "TR-744", "Trailer axles": "33,840 lb", "Gross weight": "77,940 lb"},
    },
    "document:ifta-license-copy": {
        "answerLabel": "IFTA account", "sampleB": {"IFTA account": "IFTA-NOT-VALID-002"},
    },
    "document:hazmat-shipping-paper": {
        "answerLabel": "Total quantity", "sampleB": {"Total quantity": "360 gal, synthetic training value", "Number and type of packages": "6 drums, synthetic training value"},
    },
    "document:oversize-overweight-permit": {
        "answerLabel": "Gross weight", "sampleB": {"Tractor": "T-318", "Trailer": "TR-744", "Gross weight": "90,500 lb"},
    },
    "document:roadside-inspection-report": {
        "answerLabel": "Inspection number", "sampleB": {"Inspection number": "INSPECTION-TRAINING-002", "Tractor": "T-318", "Trailer": "TR-744"},
    },
    "document:proof-of-delivery-osd": {
        "answerLabel": "Delivery date", "sampleB": {"BOL number": "TRAINING-BOL-3061", "Delivery date": "08/22/2026", "Pieces received": "20 pallets"},
    },
    "document:pickup-and-trailer-rating-record": {
        "answerLabel": "Combination rating", "sampleB": {"Trailer GVWR": "24,500 LB", "Combination rating": "38,500 LB", "Trailer VIN": "TRAINING-HS0002"},
    },
    "document:vehicle-condition-report": {
        "answerLabel": "Existing damage", "sampleB": {"Vehicle": "2021 TRAINING COUPE", "VIN": "TRAININGVIN0000003", "Existing damage": "DENT, RIGHT FRONT FENDER", "Pickup time": "08/21/2026 10:15"},
    },
    "document:vehicle-release-form": {
        "answerLabel": "Stock number", "sampleB": {"Auction lot": "721", "Stock number": "STK-7442"},
    },
    "document:hotshot-proof-of-delivery": {
        "answerLabel": "Condition exception", "sampleB": {"Vehicle": "2021 TRAINING COUPE", "Condition exception": "SMALL CHIP, WINDSHIELD", "Signed": "08/21/2026 17:05"},
    },
}


def build_document_training_instances(document):
    blueprint = DOCUMENT_INSTANCE_BLUEPRINTS.get(document["id"])
    if not blueprint:
        raise ValueError(f"Missing document instance blueprint: {document['id']}")
    fields = [dict(field) for field in document.get("fields", [])]
    if not fields:
        fields = [{"label": blueprint["answerLabel"], "value": blueprint["sampleAValue"]}]
    elif "sampleAValue" in blueprint:
        for field in fields:
            if field.get("label") == blueprint["answerLabel"]:
                field["value"] = blueprint["sampleAValue"]
    transfer_fields = [{**field, "value": blueprint["sampleB"].get(field.get("label"), field.get("value"))} for field in fields]
    label = blueprint["answerLabel"]
    primary_by_label = {field["label"]: field["value"] for field in fields}
    transfer_by_label = {field["label"]: field["value"] for field in transfer_fields}
    if label not in primary_by_label or label not in transfer_by_label:
        raise ValueError(f"Document assessment label not found: {document['id']} {label}")
    values = [primary_by_label[label], transfer_by_label[label]]
    if values[0] == values[1]:
        raise ValueError(f"Document assessment keys collide: {document['id']} {label}")
    instances = []
    for offset, (instance_id, instance_fields) in enumerate((("sample-a", fields), ("sample-b", transfer_fields))):
        answer = {field["label"]: field["value"] for field in instance_fields}[label]
        alternate = values[1 - offset]
        instance_instructions = [dict(row) for row in document.get("instructions", [])]
        instance_notes = list(document.get("notes", []))
        if document["id"] == "document:eld-transfer-instructions":
            method_pairs = {
                "sample-a": {
                    "methodsEn": "Web Services or Email",
                    "methodsRu": "Web Services или Email",
                    "deviceEn": "registered telematics ELD",
                    "deviceRu": "зарегистрированное телематическое ELD",
                },
                "sample-b": {
                    "methodsEn": "USB 2.0 or Bluetooth",
                    "methodsRu": "USB 2.0 или Bluetooth",
                    "deviceEn": "registered local-transfer ELD",
                    "deviceRu": "зарегистрированное ELD с локальной передачей",
                },
            }
            pair = method_pairs[instance_id]
            for instruction in instance_instructions:
                if instruction.get("order") == 4:
                    instruction["text"] = f"Select `{pair['methodsEn'].replace(' or ', '` or `')}` as directed."
                    instruction["textRu"] = f"Выберите {pair['methodsRu']} по указанию сотрудника безопасности."
            instance_notes = [
                f"This training sample uses a {pair['deviceEn']} and supports {pair['methodsEn']}. Use only a method supported by the specific registered device.",
                f"Этот учебный образец использует {pair['deviceRu']} и поддерживает {pair['methodsRu']}. Используйте только способ, поддерживаемый конкретным зарегистрированным устройством.",
            ]
        instances.append({
            "id": f"{document['id']}:{instance_id}",
            "watermark": "TRAINING SAMPLE, NOT VALID",
            "visibleStimulus": {
                "title": document["title"],
                "fields": instance_fields,
                "instructions": instance_instructions,
                "notes": instance_notes,
            },
            "promptEn": f"According to the visible training sample, what is the value for {label}?",
            "promptRu": f"Какое значение указано в видимом учебном образце в поле «{label}»?",
            "answerKey": answer,
            "distractors": [alternate, "Not shown in this sample", "A value from a different training record"],
        })
    return instances


def attach_document_assessment(document):
    instances = build_document_training_instances(document)
    document["trainingInstances"] = instances
    document["assessmentBlueprint"] = {
        "construct": "visible-document-reading",
        "visibleFullStimulusRequired": True,
        "answerKeyByInstanceId": {instance["id"]: instance["answerKey"] for instance in instances},
        "differentInstanceForMasteryConfirmation": True,
        "minimumDistinctInstances": 2,
        "modelAnswerHiddenUntilImmutableResult": True,
    }
    return document


def parse_document_narrative(lines):
    instructions = []
    notes = []
    source_refs = []
    in_table = False
    for line in lines:
        stripped = line.strip()
        source_refs.extend(re.findall(r"https://[^\s)]+", stripped))
        if stripped.startswith("|"):
            in_table = True
            continue
        if in_table and not stripped:
            in_table = False
            continue
        if in_table or not stripped or stripped.startswith("#"):
            continue
        match = re.match(r"(\d+)\.\s+(.+)", stripped)
        if match:
            instructions.append({"order": int(match.group(1)), "text": match.group(2)})
            continue
        if stripped.startswith(("Practice answer:", "Practice phrase:", "Primary source:", "Primary sources:", "- https://")):
            continue
        if stripped in {"Training sequence:"}:
            continue
        notes.append(stripped)
    return instructions, notes, list(dict.fromkeys(source_refs))


def parse_documents():
    docs = []
    conditional_indexes = {1, 2, 7, 8, 9, 10, 11, 12, 15, 16, 17}
    trip_specific_indexes = {13, 14, 18, 19}
    files = sorted((EDITION / "document-samples").glob("[0-2][0-9]_*.md"))[:20]
    for index, path in enumerate(files):
        content_key = re.sub(r"^\d+_", "", path.stem).replace("_", "-")
        metadata = DOCUMENT_META[content_key]
        lines = path.read_text(encoding="utf-8").splitlines()
        instructions, notes, inline_source_refs = parse_document_narrative(lines)
        title = next(line[3:] for line in lines if line.startswith("## "))
        fields = []
        practice = ""
        for line in lines:
            if line.startswith("| ") and not line.startswith("|---"):
                parts = table_parts(line)
                if len(parts) == 2 and parts[0] not in {"Field", "Synthetic value", "Required practice field", "Entry", "Scenario field"}:
                    fields.append({"label": parts[0], "value": parts[1]})
            if line.startswith("Practice answer:") or line.startswith("Practice phrase:"):
                practice = line.split(":", 1)[1].strip().strip("`")
        record = {
            "id": f"document:{content_key}",
            "legacyId": f"doc-{index + 1:02d}",
            "audioSourceId": f"doc-{index + 1:02d}",
            "title": title,
            "titleRu": DOC_RU[index],
            "file": path.name,
            "status": metadata.get("status", "trip-specific" if index in trip_specific_indexes else "conditional" if index in conditional_indexes else "carry-or-trip"),
            "fields": fields,
            "practice": practice,
            "instructions": instructions,
            "notes": notes,
            "verifiedOn": "2026-08-21",
            **metadata,
        }
        record["sourceRefs"] = list(dict.fromkeys(metadata.get("sourceRefs", []) + inline_source_refs))
        if content_key in COMPLIANCE_DOCUMENT_RU:
            record.update(COMPLIANCE_DOCUMENT_RU[content_key])
            translated_steps = record.get("instructionsRu", [])
            if translated_steps and len(translated_steps) != len(record["instructions"]):
                raise ValueError(f"Russian compliance instruction count mismatch: {content_key}")
            for step, text_ru in zip(record["instructions"], translated_steps):
                step["textRu"] = text_ru
        docs.append(attach_document_assessment(record))
    if len(docs) != 20:
        raise ValueError(f"Expected 20 documents, got {len(docs)}")
    return docs


SIGN_ROWS = """
regulatory|STOP|Стоп. Полная остановка.|Come to a complete stop.
regulatory|YIELD|Уступите дорогу.|Yield to traffic with the right of way.
regulatory|DO NOT ENTER|Въезд запрещен.|Do not enter this roadway.
regulatory|WRONG WAY|Вы движетесь против направления.|Stop safely and correct your direction.
regulatory|ONE WAY|Одностороннее движение.|Travel only in the arrow direction.
regulatory|SPEED LIMIT 50|Максимальная скорость 50 mph.|Do not exceed 50 miles per hour.
regulatory|NO TURN ON RED|Поворот на красный запрещен.|Wait for a green signal before turning.
regulatory|KEEP RIGHT|Держитесь справа от разделителя.|Keep to the right.
regulatory|LEFT LANE MUST TURN LEFT|Из левой полосы только налево.|Turn left from this lane.
regulatory|NO U-TURN|Разворот запрещен.|Do not make a U-turn.
regulatory|DO NOT PASS|Обгон запрещен.|Stay behind the vehicle ahead.
regulatory|PASS WITH CARE|Обгон разрешен с осторожностью.|Pass only when it is safe.
regulatory|SLOWER TRAFFIC KEEP RIGHT|Более медленный транспорт держится справа.|Move right if you are traveling slower.
regulatory|MOVE OVER OR REDUCE SPEED|Перестройтесь или снизьте скорость рядом с остановившейся аварийной машиной.|Move over when safe or reduce speed.
truck|TRUCK ROUTE|Установленный маршрут для грузовиков.|Use the designated truck route.
truck|NO TRUCKS|Движение грузовиков запрещено.|Do not enter with a truck.
truck|TRUCKS USE RIGHT LANE|Грузовикам использовать правую полосу.|Move to and remain in the right lane.
truck|ALL TRUCKS NEXT RIGHT|Всем грузовикам повернуть на следующем съезде справа.|Take the next right.
truck|TRUCKS OVER 5 TONS PROHIBITED|Движение грузовиков тяжелее 5 тонн запрещено.|Use another legal route.
truck|NO ENGINE BRAKE|Использование моторного тормоза запрещено.|Do not use the engine brake here.
truck|TRUCK SPEED LIMIT 55|Ограничение скорости грузовиков: 55 миль в час.|Keep the truck at or below 55 mph.
truck|WEIGHT LIMIT 10 TONS|Ограничение полной массы: 10 тонн.|Do not enter if the vehicle exceeds the limit.
truck|AXLE WEIGHT LIMIT 5 TONS|Ограничение нагрузки на ось: 5 тонн.|Check axle weights before entering.
truck|LENGTH LIMIT 65 FT|Ограничение длины: 65 футов.|Use another route if the combination is longer.
truck|WIDTH LIMIT 8 FT 6 IN|Ограничение ширины: 8 футов 6 дюймов.|Do not enter if the load is wider.
truck|HEIGHT LIMIT 13 FT 6 IN|Ограничение высоты: 13 футов 6 дюймов.|Confirm vehicle height before entering.
truck|TRUCKS USE LOWER GEAR|Грузовикам использовать пониженную передачу.|Select a safe low gear.
truck|HAZMAT PROHIBITED|Опасные грузы запрещены.|Use the approved hazmat route.
truck|TRUCK DETOUR|Объезд для грузовиков.|Follow the posted truck detour.
truck|TRUCK CROSSING|Место пересечения дороги грузовиками.|Watch for trucks crossing the roadway.
warning|LOW CLEARANCE 12 FT 6 IN|Низкий проезд 12 ft 6 in.|Do not continue if the vehicle is too high.
warning|STEEP GRADE 6% NEXT 5 MILES|Крутой уклон 6 процентов на протяжении следующих 5 миль.|Reduce speed and select a safe gear.
warning|HILL|Впереди спуск или подъем.|Prepare for the grade.
warning|GUSTY WINDS AREA|Участок с сильными порывами ветра.|Reduce speed and maintain control.
warning|FALLEN ROCKS|На дороге могут лежать упавшие камни.|Watch the roadway and do not stop unnecessarily.
warning|SOFT SHOULDER|Мягкая обочина.|Keep heavy wheels off the shoulder.
warning|SLIPPERY WHEN WET|Скользко при мокрой дороге.|Reduce speed in wet conditions.
warning|BRIDGE ICES BEFORE ROAD|Мост обледеневает раньше дороги.|Use extra caution on the bridge.
warning|NARROW BRIDGE|Узкий мост.|Center carefully within your lane.
warning|DIVIDED HIGHWAY ENDS|Конец разделенной дороги.|Prepare for opposing traffic.
warning|MERGE|Слияние потоков.|Adjust speed and merge safely.
warning|RIGHT LANE ENDS|Правая полоса заканчивается.|Merge left when safe.
warning|STOP AHEAD|Впереди знак STOP.|Prepare to stop.
warning|CURVES NEXT 3 MILES|Серия поворотов на протяжении следующих 3 миль.|Reduce speed before the curves.
work-zone|ROAD WORK AHEAD|Впереди дорожные работы.|Slow down and watch for workers.
work-zone|RIGHT LANE CLOSED AHEAD|Правая полоса впереди закрыта.|Merge left before the closure.
work-zone|LEFT LANE CLOSED AHEAD|Левая полоса впереди закрыта.|Merge right before the closure.
work-zone|ONE LANE ROAD AHEAD|Впереди одна полоса на оба направления.|Prepare to stop and follow traffic control.
work-zone|FLAGGER AHEAD|Впереди регулировщик.|Obey the flagger's signal.
work-zone|DETOUR AHEAD|Впереди объезд.|Follow the marked detour.
work-zone|END ROAD WORK|Конец зоны дорожных работ.|Resume normal driving when legal and safe.
work-zone|FINES DOUBLE|Штрафы удваиваются.|Obey the reduced speed and all controls.
work-zone|BE PREPARED TO STOP|Будьте готовы остановиться.|Reduce speed and prepare for a full stop.
work-zone|RIGHT SHOULDER CLOSED AHEAD|Правая обочина впереди закрыта.|Do not use the right shoulder.
service|WEIGH STATION AHEAD|Впереди весовой пункт.|Watch for the open or closed signal.
service|ALL TRUCKS MUST ENTER|Все грузовики обязаны заехать.|Enter the weigh station.
service|OPEN|Пункт открыт.|Enter when the sign applies to your vehicle.
service|CLOSED|Пункт закрыт.|Continue on the main roadway.
service|TRUCK INSPECTION|Проверка грузовиков.|Follow the inspection-lane directions.
service|BRAKE CHECK AREA|Площадка проверки тормозов.|Stop and check the brakes when required.
service|TRUCK PARKING|Стоянка для грузовиков.|Use the designated truck spaces.
service|NO PARKING ANY TIME|Стоянка запрещена в любое время.|Do not park in this area.
service|REST AREA 2 MILES|Зона отдыха через 2 мили.|Use the exit if you need the rest area.
service|NEXT SERVICES 23 MILES|Следующие сервисные пункты через 23 мили.|Plan fuel and rest needs now.
dynamic|CRASH AHEAD USE CAUTION|Впереди авария, будьте осторожны.|Slow down and watch for stopped traffic.
dynamic|ALL LANES CLOSED|Все полосы закрыты.|Exit or follow the official detour.
dynamic|LEFT 2 LANES CLOSED|Две левые полосы закрыты.|Merge right early.
dynamic|RIGHT LANE BLOCKED|Правая полоса заблокирована.|Merge left when safe.
dynamic|ROAD CLOSED AT EXIT 24|Дорога закрыта у съезда 24.|Leave the route before the closure.
dynamic|DETOUR USE EXIT 18|Для объезда используйте съезд 18.|Take exit 18.
dynamic|HIGH WINDS USE CAUTION|Сильный ветер, соблюдайте осторожность.|Reduce speed and maintain lane control.
dynamic|ICY CONDITIONS|Обледенение.|Reduce speed and increase following distance.
dynamic|FOG AHEAD SLOW DOWN|Впереди туман, снизьте скорость.|Slow down and use appropriate lights.
dynamic|FLOODING AHEAD|Впереди подтопление.|Do not drive into standing water.
dynamic|TRUCKS USE EXIT 12|Грузовикам использовать съезд 12.|Take exit 12.
dynamic|WEIGH STATION OPEN|Весовой пункт открыт.|Enter if your vehicle must report.
dynamic|CHAINS REQUIRED|Требуются цепи.|Do not continue without required chains.
dynamic|OVERHEIGHT VEHICLE EXIT NOW|Машине с превышением высоты немедленно съехать.|Take the indicated exit immediately.
dynamic|STOPPED TRAFFIC AHEAD|Впереди остановившийся поток.|Slow down and prepare to stop.
dynamic|NO PARKING ON SHOULDER|Стоянка на обочине запрещена.|Continue to a legal parking area.
""".strip()

OFFICIAL_SIGN_ASSETS = {
    1: ("R1-1", "assets/signs/R1-1.svg"),
    2: ("R1-2", "assets/signs/R1-2.svg"),
    3: ("R5-1", "assets/signs/R5-1.svg"),
    4: ("R5-1a", "assets/signs/R5-1a.svg"),
    5: ("R6-1", "assets/signs/R6-1.svg"),
    6: ("R2-1", "assets/signs/R2-1-50.svg"),
    7: ("R10-11", "assets/signs/R10-11.svg"),
    8: ("R4-7", "assets/signs/R4-7.svg"),
    9: ("R3-7", "assets/signs/R3-7L.svg"),
    10: ("R3-4", "assets/signs/R3-4.svg"),
    11: ("R4-1", "assets/signs/R4-1.svg"),
    12: ("R4-2", "assets/signs/R4-2.svg"),
    13: ("R4-3", "assets/signs/R4-3.svg"),
    14: ("R16-3", "assets/signs/R16-3.svg"),
    15: ("R14-1", "assets/signs/R14-1.svg"),
    16: ("R5-2", "assets/signs/R5-2.svg"),
    17: ("R4-5", "assets/signs/R04-05.svg"),
    22: ("R12-1", "assets/signs/R12-01.svg"),
    23: ("R12-2", "assets/signs/R12-02.svg"),
    27: ("W7-2bP", "assets/signs/W07-02bP.svg"),
    28: ("R14-3", "assets/signs/R14-03.svg"),
    30: ("W8-6", "assets/signs/W08-06.svg"),
    31: ("W12-2", "assets/signs/W12-02.svg"),
    33: ("W7-1", "assets/signs/W07-01.svg"),
    34: ("W8-21", "assets/signs/W08-21.svg"),
    35: ("W8-14", "assets/signs/W08-14.svg"),
    36: ("W8-4", "assets/signs/W08-04.svg"),
    37: ("W8-5", "assets/signs/W08-05.svg"),
    38: ("W8-13", "assets/signs/W08-13.svg"),
    39: ("W5-2", "assets/signs/W05-02.svg"),
    40: ("W6-2", "assets/signs/W06-02.svg"),
    41: ("W4-1R", "assets/signs/W04-01R.svg"),
    42: ("W4-2R", "assets/signs/W04-02R.svg"),
    43: ("W3-1", "assets/signs/W03-01.svg"),
    45: ("W20-1", "assets/signs/W20-01.svg"),
    46: ("W20-5R", "assets/signs/W20-05R.svg"),
    47: ("W20-5L", "assets/signs/W20-05L.svg"),
    48: ("W20-4", "assets/signs/W20-04.svg"),
    49: ("W20-7a", "assets/signs/W20-07a.svg"),
    50: ("W20-2", "assets/signs/W20-02.svg"),
    51: ("G20-2", "assets/signs/G20-02.svg"),
    52: ("R2-6aP", "assets/signs/R02-06aP.svg"),
    53: ("W3-4", "assets/signs/W03-04.svg"),
    54: ("W21-5bR", "assets/signs/W21-05bR.svg"),
    55: ("D8-1a", "assets/signs/D08-01a.svg"),
    61: ("D9-16", "assets/signs/D09-16.svg"),
    62: ("R7-1", "assets/signs/R07-01.svg"),
    63: ("D5-1", "assets/signs/D05-01.svg"),
    64: ("D9-17P", "assets/signs/D09-17P.svg"),
}

CORRECTED_SIGN_INDEXES = {23, 27, 30, 34, 35, 52, 54, 55, 62, 63, 64}

SIGN_ACTION_PRIORITY_DISPLAYS = [
    "STOP", "YIELD", "DO NOT ENTER", "WRONG WAY", "KEEP RIGHT", "MOVE OVER OR REDUCE SPEED",
    "TRUCK ROUTE", "NO TRUCKS", "TRUCKS USE RIGHT LANE", "ALL TRUCKS NEXT RIGHT",
    "TRUCKS OVER 5 TONS PROHIBITED", "NO ENGINE BRAKE", "TRUCK SPEED LIMIT 55",
    "WEIGHT LIMIT 10 TONS", "AXLE WEIGHT LIMIT 5 TONS", "LENGTH LIMIT 65 FT",
    "WIDTH LIMIT 8 FT 6 IN", "HEIGHT LIMIT 13 FT 6 IN", "TRUCKS USE LOWER GEAR",
    "HAZMAT PROHIBITED", "TRUCK DETOUR", "TRUCK CROSSING", "LOW CLEARANCE 12 FT 6 IN",
    "STEEP GRADE 6% NEXT 5 MILES", "HILL", "GUSTY WINDS AREA", "FALLEN ROCKS",
    "SOFT SHOULDER", "SLIPPERY WHEN WET", "BRIDGE ICES BEFORE ROAD", "NARROW BRIDGE", "MERGE",
    "RIGHT LANE ENDS", "ROAD WORK AHEAD", "RIGHT LANE CLOSED AHEAD", "LEFT LANE CLOSED AHEAD",
    "ONE LANE ROAD AHEAD", "FLAGGER AHEAD", "BE PREPARED TO STOP", "RIGHT SHOULDER CLOSED AHEAD",
    "WEIGH STATION AHEAD", "ALL TRUCKS MUST ENTER",
]

SIGN_ACTION_TRANSLATIONS_RU = {
    "STOP": "Полностью остановитесь.",
    "YIELD": "Уступите дорогу транспорту, у которого есть преимущество.",
    "DO NOT ENTER": "Не въезжайте на эту дорогу.",
    "WRONG WAY": "Безопасно остановитесь и вернитесь на правильное направление движения.",
    "KEEP RIGHT": "Продолжайте движение справа от разделителя.",
    "MOVE OVER OR REDUCE SPEED": "Перестройтесь дальше от остановившейся машины или снизьте скорость, как требует местный закон.",
    "TRUCK ROUTE": "Следуйте по обозначенному маршруту для грузовиков.",
    "NO TRUCKS": "Не въезжайте сюда на грузовике.",
    "TRUCKS USE RIGHT LANE": "Перестройтесь в правую полосу и оставайтесь в ней.",
    "ALL TRUCKS NEXT RIGHT": "Поверните направо на следующем съезде.",
    "TRUCKS OVER 5 TONS PROHIBITED": "Если масса грузовика превышает пять тонн, выберите другой разрешенный маршрут.",
    "NO ENGINE BRAKE": "Не используйте здесь моторный тормоз.",
    "TRUCK SPEED LIMIT 55": "Не превышайте на грузовике 55 миль в час.",
    "WEIGHT LIMIT 10 TONS": "Не въезжайте, если масса машины превышает указанное ограничение.",
    "AXLE WEIGHT LIMIT 5 TONS": "Перед въездом проверьте нагрузки на оси.",
    "LENGTH LIMIT 65 FT": "Если автопоезд длиннее 65 футов, выберите другой маршрут.",
    "WIDTH LIMIT 8 FT 6 IN": "Не въезжайте, если груз шире указанного ограничения.",
    "HEIGHT LIMIT 13 FT 6 IN": "Перед въездом подтвердите высоту машины.",
    "TRUCKS USE LOWER GEAR": "Выберите безопасную пониженную передачу.",
    "HAZMAT PROHIBITED": "Используйте разрешенный маршрут для опасного груза.",
    "TRUCK DETOUR": "Следуйте по обозначенному объезду для грузовиков.",
    "TRUCK CROSSING": "Следите за грузовиками, пересекающими дорогу.",
    "LOW CLEARANCE 12 FT 6 IN": "Не продолжайте движение, если машина выше указанного габарита.",
    "STEEP GRADE 6% NEXT 5 MILES": "Снизьте скорость и выберите безопасную передачу до уклона.",
    "HILL": "Подготовьтесь к подъему или спуску.",
    "GUSTY WINDS AREA": "Снизьте скорость и сохраняйте контроль над машиной.",
    "FALLEN ROCKS": "Следите за проезжей частью и не останавливайтесь без необходимости.",
    "SOFT SHOULDER": "Не заезжайте тяжелыми колесами на мягкую обочину.",
    "SLIPPERY WHEN WET": "На мокрой дороге снизьте скорость.",
    "BRIDGE ICES BEFORE ROAD": "На мосту соблюдайте повышенную осторожность.",
    "NARROW BRIDGE": "Осторожно держите машину в пределах своей полосы.",
    "MERGE": "Подберите скорость и безопасно встройтесь в поток.",
    "RIGHT LANE ENDS": "Безопасно перестройтесь влево.",
    "ROAD WORK AHEAD": "Снизьте скорость и следите за рабочими.",
    "RIGHT LANE CLOSED AHEAD": "Перестройтесь влево до закрытого участка.",
    "LEFT LANE CLOSED AHEAD": "Перестройтесь вправо до закрытого участка.",
    "ONE LANE ROAD AHEAD": "Будьте готовы остановиться и следуйте временным указаниям.",
    "FLAGGER AHEAD": "Выполняйте сигналы регулировщика.",
    "BE PREPARED TO STOP": "Снизьте скорость и подготовьтесь к полной остановке.",
    "RIGHT SHOULDER CLOSED AHEAD": "Не используйте правую обочину.",
    "WEIGH STATION AHEAD": "Следите за сигналом, открыт или закрыт весовой пункт.",
    "ALL TRUCKS MUST ENTER": "Заедьте на весовой пункт.",
}

SIGN_CONDITIONS_BY_DISPLAY = {
    "HAZMAT PROHIBITED": ["hazmat"],
    "WEIGHT LIMIT 10 TONS": ["dimension-or-weight-applicable"],
    "AXLE WEIGHT LIMIT 5 TONS": ["dimension-or-weight-applicable"],
    "LENGTH LIMIT 65 FT": ["dimension-or-weight-applicable"],
    "WIDTH LIMIT 8 FT 6 IN": ["dimension-or-weight-applicable"],
    "HEIGHT LIMIT 13 FT 6 IN": ["dimension-or-weight-applicable"],
    "LOW CLEARANCE 12 FT 6 IN": ["dimension-or-weight-applicable"],
    "OVERHEIGHT MUST EXIT": ["dimension-or-weight-applicable"],
    "CHAINS REQUIRED": ["chains-required"],
}


def sign_conditions(display):
    return list(SIGN_CONDITIONS_BY_DISPLAY.get(display, []))


def build_signs():
    signs = []
    for index, line in enumerate(SIGN_ROWS.splitlines(), 1):
        category, display, meaning, action = line.split("|", 3)
        legacy_id = f"sign-{index:02d}"
        official = OFFICIAL_SIGN_ASSETS.get(index)
        if official:
            asset_code, asset_path = official
            content_id = f"sign:mutcd:{slug(asset_code)}"
            provenance = "fhwa-mutcd-shs"
        elif index >= 65:
            asset_code = None
            asset_path = None
            content_id = f"sign:dms:{slug(display)}"
            provenance = "training-dms"
        else:
            asset_code = None
            asset_path = None
            content_id = f"sign:variable:{slug(display)}"
            provenance = "variable-local"
        record = {
            "id": content_id,
            "legacyId": legacy_id,
            "audioSourceId": None if index in CORRECTED_SIGN_INDEXES else legacy_id,
            "category": category,
            "display": display,
            "meaningRu": meaning,
            "actionEn": action,
            "actionTranslationRu": SIGN_ACTION_TRANSLATIONS_RU.get(display) or natural_translation(action, "Действуйте по указанию знака."),
            "profiles": ALL_PROFILES,
            "conditions": sign_conditions(display),
            "provenance": provenance,
            "isOfficialSvg": bool(official),
            "englishBearing": bool(index >= 65 or index in ELP_STEP_TWO_ENGLISH_BEARING_OFFICIAL_INDEXES),
            "readinessCredit": "elp-step-2-reading" if index >= 65 or index in ELP_STEP_TWO_ENGLISH_BEARING_OFFICIAL_INDEXES else "familiarization-only",
        }
        if official:
            record.update({
                "assetCode": asset_code,
                "assetPath": asset_path,
                "assetAlt": f"Official MUTCD {asset_code}: {display}",
                "sourceUrl": FHWA_SHS_SOURCE,
            })
        elif provenance == "training-dms":
            record["assetAlt"] = f"TRAINING DMS: {display}"
        else:
            record["assetAlt"] = f"Training sign card: {display}"
        if index in CORRECTED_SIGN_INDEXES:
            record["audioFallback"] = "browser-speech-exact-text"
        signs.append(record)
    if len(signs) != 80:
        raise ValueError(f"Expected 80 signs, got {len(signs)}")
    provenance_counts = {value: sum(item["provenance"] == value for item in signs) for value in {item["provenance"] for item in signs}}
    if provenance_counts != {"fhwa-mutcd-shs": 49, "variable-local": 15, "training-dms": 16}:
        raise ValueError(f"Unexpected sign provenance counts: {provenance_counts}")
    if len(SIGN_ACTION_PRIORITY_DISPLAYS) != 42 or len(set(SIGN_ACTION_PRIORITY_DISPLAYS)) != 42:
        raise ValueError("Sign action priority must contain 42 unique displays")
    if set(SIGN_ACTION_TRANSLATIONS_RU) != set(SIGN_ACTION_PRIORITY_DISPLAYS):
        raise ValueError("Every sign-action unit needs a reviewed Russian action translation")
    official_indexes = set(OFFICIAL_SIGN_ASSETS)
    if ELP_STEP_TWO_ENGLISH_BEARING_OFFICIAL_INDEXES | ELP_STEP_TWO_SYMBOL_FAMILIARIZATION_INDEXES != official_indexes:
        raise ValueError("English-bearing review must classify all 49 official SVG signs")
    if ELP_STEP_TWO_ENGLISH_BEARING_OFFICIAL_INDEXES & ELP_STEP_TWO_SYMBOL_FAMILIARIZATION_INDEXES:
        raise ValueError("Official sign readiness classes overlap")
    return signs


LESSONS = [
    ("Identity and unit numbers", "Представиться и назвать компанию, номера тягача и прицепа", ["My name is Alex Example.", "I drive for Training Carrier.", "The tractor is T-204.", "The trailer is TR-518."]),
    ("Spelling on the phone", "Продиктовать имя и идентификатор", ["A as in Alpha.", "Please confirm the last letter.", "The code is T-R-five-one-eight."]),
    ("Dates, times and appointments", "Понять назначенное окно времени", ["My appointment is at 9:30 a.m.", "I arrived at 8:55.", "The delivery is tomorrow morning."]),
    ("Load and reference numbers", "Слышать и повторять длинные номера", ["The load number is zero-zero-zero-five-one-eight.", "Please repeat the last four digits.", "The BOL number is 2048."]),
    ("Origin and destination", "Коротко объяснить маршрут", ["I picked up in Columbus, Ohio.", "I am delivering in Nashville, Tennessee.", "My final destination is Atlanta, Georgia."]),
    ("Cargo, pieces, weight and seal", "Описать груз", ["I am hauling packaged food.", "The load has 22 pallets.", "The seal number is 000845."]),
    ("Gate, yard and dock directions", "Понять движение по территории и погрузочной площадке", ["Proceed to gate two.", "Park in row C.", "Back into dock door 18."]),
    ("Duty status and available hours", "Объяснить HOS", ["I am on duty, not driving.", "I have four hours and eighteen minutes left.", "My logs are current and certified."]),
    ("Defect report", "Описать деталь, неисправность, место и серьезность", ["The right rear marker light is out.", "I found an air leak near the trailer axle.", "I will not move until it is checked."]),
    ("Delay and updated ETA", "Сообщить причину и новое время", ["Traffic is stopped because of a crash.", "My new ETA is 4:30 p.m.", "I will update you after the detour."]),
    ("Clarification and repair phrases", "Управлять непониманием", ["Could you repeat that more slowly?", "Could you rephrase the question?", "May I repeat the instruction to confirm it?"]),
    ("Driver and vehicle documents", "Различать основные документы", ["Here is my CDL.", "Here is the tractor registration.", "The periodic inspection report is on the vehicle."]),
    ("Level I and Level II commands", "Выполнять команды инспектора", ["The parking brake is set.", "The headlights are on.", "I am applying and holding the service brake."]),
    ("Level III representative questions", "Отвечать о документах, рейсе и HOS", ["I drive for Training Carrier.", "I picked up in Columbus.", "I have four hours and eighteen minutes left."]),
    ("State trooper traffic stop", "Отличать остановку полицией от инспекции", ["May I reach for the document folder?", "I am delivering to Nashville.", "I will stay in the vehicle."]),
    ("Full ELP rehearsal", "Пройти интервью только на английском и распознавание знаков", ["I am hauling packaged food.", "The sign means trucks must use this exit.", "Would you like me to show or transfer the records?"]),
]


DIALOGUES = [
    [("Inspector", "Pull into the inspection lane and stop at the white line.", "Заедьте на полосу проверки и остановитесь у белой линии."), ("Driver", "Understood. I will stop at the white line.", "Понял. Я остановлюсь у белой линии."), ("Inspector", "Set the parking brake and turn off the engine.", "Установите стояночный тормоз и выключите двигатель."), ("Driver", "The parking brake is set, and the engine is off.", "Стояночный тормоз установлен, двигатель выключен.")],
    [("Trooper", "License, registration and insurance, please.", "Права, регистрацию и страховку, пожалуйста."), ("Driver", "They are in my document folder. May I reach for it?", "Они в папке с документами. Можно мне ее взять?"), ("Trooper", "Yes. Stay in the vehicle.", "Да. Оставайтесь в машине."), ("Driver", "Understood. I will stay in the vehicle.", "Понял. Я останусь в машине.")],
    [("Inspector", "Where are you coming from, and where are you going?", "Откуда вы едете и куда направляетесь?"), ("Driver", "I picked up in Columbus, Ohio, and I am delivering in Nashville, Tennessee.", "Я забрал груз в Коламбусе, Огайо, и доставляю в Нэшвилл, Теннесси."), ("Inspector", "What are you hauling?", "Что вы перевозите?"), ("Driver", "I am hauling 22 pallets of packaged food.", "Я везу 22 палеты упакованных продуктов.")],
    [("Inspector", "May I see your CDL and shipping papers?", "Покажите CDL и документы на груз."), ("Driver", "Yes. Here is my CDL, and here is the bill of lading.", "Да. Вот мои права и транспортная накладная."), ("Inspector", "What is the listed weight?", "Какой вес указан?"), ("Driver", "The listed weight is 38,200 pounds.", "Указанный вес 38 200 фунтов.")],
    [("Inspector", "What is your current duty status?", "Какой у вас текущий рабочий статус?"), ("Driver", "I am on duty, not driving.", "Я на работе, но не за рулем."), ("Inspector", "Show me today and the previous seven days.", "Покажите сегодняшний день и предыдущие семь дней."), ("Driver", "I am opening roadside inspection mode now.", "Я сейчас открываю режим дорожной проверки.")],
    [("Inspector", "Who do you drive for?", "На какого перевозчика вы работаете?"), ("Driver", "I drive for Training Carrier.", "Я работаю на Training Carrier."), ("Inspector", "Are your logs current and certified?", "Ваши журналы актуальны и подтверждены?"), ("Driver", "Yes. My logs are current and certified.", "Да. Мои журналы актуальны и подтверждены.")],
    [("Inspector", "Turn on the headlights and the four-way flashers.", "Включите фары и аварийные огни."), ("Driver", "The headlights and four-way flashers are on.", "Фары и аварийные огни включены."), ("Inspector", "Apply and hold the service brake.", "Нажмите и удерживайте рабочий тормоз."), ("Driver", "I am applying and holding the service brake.", "Я нажимаю и удерживаю рабочий тормоз.")],
    [("Inspector", "Release the tractor brakes and keep the trailer brakes set.", "Отпустите тормоза тягача, тормоза прицепа оставьте установленными."), ("Driver", "Tractor brakes released, trailer brakes set.", "Тормоза тягача отпущены, тормоза прицепа установлены."), ("Inspector", "Fan the brakes down and tell me when the warning activates.", "Снижайте давление тормозами и сообщите, когда включится предупреждение."), ("Driver", "The low-air warning activated at 58 psi.", "Предупреждение о низком давлении включилось при 58 фунтах на квадратный дюйм.")],
    [("Inspector", "What does this message mean: RIGHT LANE CLOSED AHEAD?", "Что означает сообщение RIGHT LANE CLOSED AHEAD?"), ("Driver", "The right lane is closed ahead.", "Правая полоса впереди закрыта."), ("Inspector", "What should you do?", "Что вы должны сделать?"), ("Driver", "I should merge left when it is safe.", "Я должен перестроиться влево, когда это безопасно.")],
    [("Inspector", "Open the hood and turn on the left signal.", "Откройте капот и включите левый поворотник."), ("Driver", "The hood is open, and the left signal is on.", "Капот открыт, левый поворотник включен."), ("Inspector", "Show me the warning triangles.", "Покажите предупреждающие треугольники."), ("Driver", "They are secured in the side box.", "Они закреплены в боковом ящике.")],
    [("Inspector", "This vehicle is out of service because of a brake defect.", "Эта машина выведена из эксплуатации из-за неисправности тормозов."), ("Driver", "Understood. I will not move the vehicle.", "Понял. Я не буду двигать машину."), ("Inspector", "Contact your carrier and arrange a repair.", "Свяжитесь с перевозчиком и организуйте ремонт."), ("Driver", "What is the next required step after the repair?", "Какой обязательный шаг после ремонта?")],
    [("Inspector", "Is the ELD malfunctioning?", "ELD неисправен?"), ("Driver", "Yes. The malfunction began at 7:40 a.m., and I notified the carrier.", "Да. Неисправность началась в 7:40, и я уведомил перевозчика."), ("Inspector", "Show me the reconstructed records.", "Покажите восстановленные записи."), ("Driver", "Here are the paper logs for the required period.", "Вот бумажные журналы за требуемый период.")],
    [("Inspector", "The unit number does not match this registration.", "Номер машины не совпадает с регистрацией."), ("Driver", "I see the mismatch. The document shows unit T-205.", "Я вижу расхождение. В документе указан T-205."), ("Inspector", "Contact carrier safety.", "Свяжитесь с отделом безопасности перевозчика."), ("Driver", "Understood. I will contact carrier safety now.", "Понял. Я сейчас свяжусь с отделом безопасности.")],
    [("Officer", "All trucks must enter the weigh station.", "Все грузовики должны заехать на весовой пункт."), ("Driver", "Understood. I will enter the scale lane.", "Понял. Я заеду на весовую полосу."), ("Clerk", "Your trailer axles are 34,200 pounds.", "Оси прицепа весят 34 200 фунтов."), ("Driver", "Do I need to reweigh after moving the tandems?", "Мне нужно повторно взвеситься после перемещения тележки осей?")],
    [("911", "What is your emergency?", "Что у вас случилось?"), ("Driver", "I was involved in a crash on I-75 northbound.", "Я попал в аварию на I-75 в северном направлении."), ("911", "Are there any injuries or hazards?", "Есть пострадавшие или опасности?"), ("Driver", "No reported injuries. One lane is blocked.", "О травмах не сообщается. Одна полоса заблокирована.")],
    [("Roadside", "What is your location and unit number?", "Где вы находитесь и какой номер машины?"), ("Driver", "I am on I-71 southbound near mile marker 42. The unit is T-204.", "Я на I-71 в южном направлении у отметки 42-й мили. Машина T-204."), ("Roadside", "What safety steps have you taken?", "Какие меры безопасности вы приняли?"), ("Driver", "The hazard flashers are on immediately. Within ten minutes, I will place the warning devices 10, 100 and 200 feet toward approaching traffic on this divided road.", "Я сразу включил аварийную сигнализацию. В течение десяти минут на этой разделенной дороге я выставлю устройства на расстоянии 10, 100 и 200 футов в сторону приближающегося транспорта.")],
    [("Dispatcher", "Your pickup is at Sample Foods at 2 p.m.", "Погрузка назначена в Sample Foods на 14:00."), ("Driver", "Please confirm the load and trailer numbers.", "Подтвердите номера груза и прицепа."), ("Dispatcher", "Load 000518, trailer TR-518.", "Груз 000518, прицеп TR-518."), ("Driver", "Confirmed. I will update you after check-in.", "Подтверждаю. Я сообщу после регистрации на месте.")],
    [("Clerk", "Your appointment window is 9 to 10 a.m.", "Ваше окно назначения с 9 до 10 утра."), ("Driver", "My ETA is 9:20 a.m.", "Мое расчетное время прибытия 9:20."), ("Clerk", "Call if you are delayed.", "Позвоните, если задерживаетесь."), ("Driver", "Understood. I will call with an updated ETA.", "Понял. Я сообщу новое расчетное время прибытия.")],
    [("Guard", "Company name and pickup number?", "Название компании и номер погрузки?"), ("Driver", "Training Carrier. Pickup number 000518.", "Training Carrier. Номер погрузки 000518."), ("Guard", "Proceed to gate two and park in staging row C.", "Следуйте к воротам два и припаркуйтесь в зоне ожидания, ряд C."), ("Driver", "Gate two, staging row C. Thank you.", "Ворота два, ряд C. Спасибо.")],
    [("Clerk", "Are you here for pickup or delivery?", "Вы приехали на погрузку или доставку?"), ("Driver", "I am here for pickup. The load number is 000518.", "Я приехал на погрузку. Номер груза 000518."), ("Clerk", "Use dock door 18.", "Подъезжайте к погрузочным воротам 18."), ("Driver", "Please confirm, dock door one-eight?", "Подтвердите: погрузочные ворота один-восемь?")],
    [("Spotter", "Go straight, turn left at row B, then back into door 18.", "Езжайте прямо, поверните налево у ряда B, затем сдайте назад к воротам 18."), ("Driver", "Straight, left at row B, then door 18.", "Прямо, налево у ряда B, затем ворота 18."), ("Spotter", "Stop before the crosswalk.", "Остановитесь перед переходом."), ("Driver", "Understood. I will stop before the crosswalk.", "Понял. Я остановлюсь перед переходом.")],
    [("Dispatcher", "Drop trailer TR-518 in row D and hook TR-602.", "Оставьте TR-518 в ряду D и прицепите TR-602."), ("Driver", "Please confirm the seal and loaded status of TR-602.", "Подтвердите пломбу и статус загрузки TR-602."), ("Dispatcher", "It is loaded, seal 000962.", "Он загружен, пломба 000962."), ("Driver", "Confirmed. I will inspect it before moving.", "Подтверждаю. Я проверю его перед движением.")],
    [("Loader", "The load has 22 pallets and weighs 38,200 pounds.", "В грузе 22 палеты, вес 38 200 фунтов."), ("Driver", "I see one damaged outer carton.", "Я вижу одну поврежденную внешнюю коробку."), ("Clerk", "I will note it on the BOL. The seal is 000845.", "Я отмечу это в BOL. Пломба 000845."), ("Driver", "The count, weight and seal are confirmed.", "Количество, вес и пломба подтверждены.")],
    [("Scale Clerk", "Your trailer axles are over the allowed weight.", "Оси прицепа превышают разрешенный вес."), ("Driver", "The trailer axles are 34,780 pounds.", "Оси прицепа весят 34 780 фунтов."), ("Dispatcher", "Return to the shipper for rework.", "Вернитесь к отправителю для перераспределения груза."), ("Driver", "Understood. I will request rework and reweigh.", "Понял. Я запрошу переработку груза и повторное взвешивание.")],
    [("Driver", "I arrived at 1:45 p.m., but loading has not started.", "Я прибыл в 13:45, но погрузка не началась."), ("Dispatcher", "What is the delay reason and current ETA?", "Какова причина задержки и текущее расчетное время прибытия?"), ("Driver", "The dock is unavailable. The new ETA is 5 p.m.", "Погрузочные ворота недоступны. Новое расчетное время прибытия 17:00."), ("Dispatcher", "Document the arrival and departure times.", "Зафиксируйте время прибытия и отправления.")],
    [("Receiver", "Back into door 12 and bring the paperwork inside.", "Сдайте назад к воротам 12 и принесите документы внутрь."), ("Driver", "Door 12. I will bring the BOL.", "Ворота 12. Я принесу BOL."), ("Receiver", "Unloading is complete. Please review the POD.", "Разгрузка завершена. Проверьте POD."), ("Driver", "The count is correct. Please sign here.", "Количество правильное. Подпишите здесь, пожалуйста.")],
    [("Receiver", "Two cartons are damaged, and one pallet is short.", "Две коробки повреждены, одной палеты не хватает."), ("Driver", "Please note the damage and shortage on the POD.", "Отметьте повреждение и недостачу в POD."), ("Dispatcher", "Send the signed document and wait for instructions.", "Отправьте подписанный документ и ждите инструкций."), ("Driver", "Understood. I will not leave until you confirm.", "Понял. Я не уеду, пока вы не подтвердите.")],
    [("Driver", "I found a cut on the right trailer tire.", "Я обнаружил порез на правой шине прицепа."), ("Maintenance", "Is the tire losing air?", "Шина теряет воздух?"), ("Driver", "Yes. The pressure is dropping.", "Да. Давление падает."), ("Maintenance", "Do not move. We will send roadside service.", "Не двигайтесь. Мы отправим дорожную техпомощь.")],
    [("Cashier", "Tractor fuel, DEF or both?", "Топливо для тягача, DEF или оба?"), ("Driver", "Both, please. Tractor T-204.", "Оба, пожалуйста. Тягач T-204."), ("Cashier", "Pump 14 is active.", "Колонка 14 активирована."), ("Driver", "Thank you. I also need a printed receipt.", "Спасибо. Мне также нужен бумажный чек.")],
    [("Driver", "Is overnight truck parking available?", "Доступна ночная стоянка грузовиков?"), ("Staff", "Yes, rows E through H are open.", "Да, ряды E-H открыты."), ("Driver", "Is reserved parking required?", "Требуется резервирование?"), ("Staff", "No. Park only in a marked truck space.", "Нет. Паркуйтесь только на обозначенном месте для грузовика.")],
    [("Driver", "The road is closed because of snow, and I have 40 minutes left.", "Дорога закрыта из-за снега, у меня осталось 40 минут."), ("Dispatcher", "Can you reach a legal parking area safely?", "Вы можете безопасно доехать до разрешенной стоянки?"), ("Driver", "Yes. The rest area is five miles ahead.", "Да. Зона отдыха через пять миль."), ("Dispatcher", "Park safely and send an updated plan.", "Безопасно припаркуйтесь и отправьте обновленный план.")],
    [("Inspector", "Show me the permit and the authorized route.", "Покажите разрешение и разрешенный маршрут."), ("Driver", "Here is the permit. It is valid through August twenty-first.", "Вот разрешение. Оно действительно до 21 августа."), ("Inspector", "What travel restriction applies?", "Какое ограничение движения действует?"), ("Driver", "Daylight travel is required in this scenario.", "В этом сценарии движение разрешено только днем.")],
]


EXTRA_PHRASES = [
    ("inspection", "Please show me where to park.", "Покажите, пожалуйста, где припарковаться."),
    ("inspection", "I am ready for the inspection.", "Я готов к проверке."),
    ("inspection", "The defect was reported before dispatch.", "Неисправность была сообщена до отправки."),
    ("inspection", "The repair is documented here.", "Ремонт зафиксирован здесь."),
    ("inspection", "Does this order apply to the driver or the vehicle?", "Этот запрет относится к водителю или машине?"),
    ("police", "I pulled over at the first safe location.", "Я остановился в первом безопасном месте."),
    ("police", "My hazard lights are on.", "Моя аварийная сигнализация включена."),
    ("police", "The trailer is fully off the travel lane.", "Прицеп полностью вне полосы движения."),
    ("documents", "The VIN matches the registration.", "VIN совпадает с регистрацией."),
    ("documents", "The expiration date is listed here.", "Дата окончания указана здесь."),
    ("documents", "This document applies to the current trip.", "Этот документ относится к текущему рейсу."),
    ("documents", "This permit does not apply to this load.", "Это разрешение не относится к этому грузу."),
    ("eld", "My ELD records are available on the screen.", "Мои записи ELD доступны на экране."),
    ("eld", "There are no active malfunctions.", "Активных неисправностей нет."),
    ("eld", "I certified today's log.", "Я подтвердил сегодняшний журнал."),
    ("eld", "I added an annotation to the edit.", "Я добавил пояснение к исправлению."),
    ("vehicle", "The fifth wheel is locked.", "Седельно-сцепное устройство заблокировано."),
    ("vehicle", "The landing gear is fully raised.", "Опорные стойки полностью подняты."),
    ("vehicle", "The air lines are connected and secure.", "Воздушные линии подключены и закреплены."),
    ("vehicle", "The cargo is secured and the seal is intact.", "Груз закреплен, пломба цела."),
    ("dispatch", "Please send the pickup address.", "Пришлите адрес погрузки, пожалуйста."),
    ("dispatch", "Please confirm the appointment time.", "Подтвердите время назначения, пожалуйста."),
    ("dispatch", "I accepted the load information.", "Я принял информацию о грузе."),
    ("dispatch", "I will call after I am loaded.", "Я позвоню после загрузки."),
    ("dock", "Which dock door should I use?", "К каким погрузочным воротам мне подъехать?"),
    ("dock", "Is the trailer ready for pickup?", "Прицеп готов к выдаче?"),
    ("dock", "Where is the staging area?", "Где находится зона ожидания?"),
    ("dock", "The trailer is empty and clean.", "Прицеп пустой и чистый."),
    ("cargo", "The pallet count matches the BOL.", "Количество палет совпадает с BOL."),
    ("cargo", "The seal does not match the paperwork.", "Пломба не совпадает с документами."),
    ("cargo", "Please note the damage before I leave.", "Отметьте повреждение до моего отъезда."),
    ("cargo", "The load needs to be reworked.", "Груз нужно перераспределить."),
    ("scale", "I need a certified reweigh.", "Мне нужно подтвержденное повторное взвешивание."),
    ("scale", "The gross weight is within the limit.", "Общий вес находится в пределах лимита."),
    ("scale", "The drive axles are overweight.", "Ведущие оси перегружены."),
    ("scale", "I will slide the tandems and reweigh.", "Я сдвину тележку осей и повторно взвешусь."),
    ("emergency", "There are no injuries that I can see.", "Я не вижу пострадавших."),
    ("emergency", "Fuel is leaking from the right tank.", "Топливо течет из правого бака."),
    ("emergency", "The road is blocked in one direction.", "Дорога заблокирована в одном направлении."),
    ("emergency", "I need police and medical assistance.", "Мне нужна полиция и медицинская помощь."),
    ("delivery", "The receiver signed the POD.", "Получатель подписал POD."),
    ("delivery", "The load was refused.", "Груз отказались принять."),
    ("delivery", "One pallet is short.", "Не хватает одной палеты."),
    ("delivery", "I am waiting for disposition instructions.", "Я жду инструкций по дальнейшим действиям."),
]


INSPECTION_LEVELS = [
    {"level": "I", "name": "North American Standard Inspection", "scope": "Driver, credentials, HOS, documents and a full vehicle inspection, including under-vehicle items.", "focus": "Full command sequence, brake and coupling language."},
    {"level": "II", "name": "Walk-Around Driver/Vehicle Inspection", "scope": "Driver, documents and vehicle items visible without physically going under the vehicle.", "focus": "Lights, brakes, steering, cargo and visible defects."},
    {"level": "III", "name": "Driver/Credential/Administrative Inspection", "scope": "CDL, medical status if applicable, RODS, HOS, reports and carrier identity.", "focus": "Fast factual answers and document retrieval."},
    {"level": "IV", "name": "Special Inspections", "scope": "A one-time examination of a specific item, usually for a study or trend.", "focus": "Understand the exact subject and follow directions."},
    {"level": "V", "name": "Vehicle-Only Inspection", "scope": "Level I vehicle items without the driver present.", "focus": "Recognition and result vocabulary."},
    {"level": "VI", "name": "North American Standard Inspection for Transuranic Waste and Highway Route Controlled Quantities (HRCQ) of Radioactive Material", "scope": "Enhanced Level I for specified radioactive shipments.", "focus": "Conditional specialist pack only."},
    {"level": "VII", "name": "Jurisdictional Mandated Commercial Vehicle Inspection", "scope": "A jurisdiction-specific program outside the other levels.", "focus": "Recognize jurisdiction-specific instructions."},
    {"level": "VIII", "name": "North American Standard Electronic Inspection", "scope": "Electronic identity, license, medical, RODS, HOS, registration, authority, UCR and OOS checks.", "focus": "Electronic screening and result vocabulary."},
]


def normalize_unit(value):
    value = value.lower().strip()
    value = re.sub(r"\[[^]]+\]", "[slot]", value)
    value = re.sub(r"\s+", " ", value)
    return value.rstrip(".?!")


TRACTOR_ONLY_TRUCK_UNIT_IDS = {
    "t:term:tractor", "t:term:power-unit", "t:term:semitrailer", "t:term:fifth-wheel",
    "t:term:kingpin", "t:term:locking-jaws", "t:term:release-handle", "t:term:trailer-apron",
    "t:term:gladhand", "t:term:service-air-line", "t:term:emergency-air-line", "t:term:landing-gear",
    "t:term:brake-chamber", "t:term:pushrod", "t:term:slack-adjuster", "t:term:brake-adjustment",
    "t:term:trailer-emergency-brake", "t:term:low-air-warning", "t:term:air-pressure-gauge",
    "t:term:air-loss-rate", "t:term:tractor-protection-system", "t:term:steering-wheel-lash",
    "t:term:sleeper-berth", "t:professional:the-fifth-wheel-is-locked",
    "t:professional:the-landing-gear-is-fully-raised", "t:professional:the-air-lines-are-connected-and-secure",
    "t:required:here-is-the-tractor-registration",
    "t:required:are-you-asking-for-the-tractor-or-trailer-registration",
    "t:question:where-is-the-periodic-inspection-documentation:answer",
    "t:question:when-was-the-tractor-last-inspected:prompt",
}


def professional_profiles(content_id):
    return ["tractor"] if content_id in TRACTOR_ONLY_TRUCK_UNIT_IDS else ALL_PROFILES


QUESTION_PROFILES = {
    23: ["tractor"],
    25: ["tractor"],
    37: ["tractor"],
    62: ["tractor"],
    63: ["tractor"],
    64: ["tractor"],
}


def question_profiles(index):
    return list(QUESTION_PROFILES.get(index, ALL_PROFILES))


QUESTION_CONDITIONS = {
    17: ["cdl-required"], 18: ["cdl-required"], 19: ["cdl-required"], 20: ["cdl-required"],
    24: ["medical-variance-or-spe-applicable"],
    28: ["periodic-inspection-proof-applicable"], 29: ["periodic-inspection-proof-applicable"],
    32: ["permit-applicable"],
    33: ["trip-specific"], 34: ["trip-specific"], 35: ["trip-specific"], 36: ["trip-specific"],
    37: ["trip-specific", "dry-van-load"], 38: ["trip-specific", "hazmat"],
    39: ["trip-specific"], 40: ["trip-specific", "scale-ticket-issued"],
    42: ["eld-or-rods-applicable"], 43: ["eld-or-rods-applicable"], 44: ["eld-or-rods-applicable"],
    45: ["eld-or-rods-applicable"], 46: ["eld-or-rods-applicable"], 47: ["eld-or-rods-applicable"],
    48: ["eld-or-rods-applicable"], 49: ["eld-or-rods-applicable"], 50: ["eld-or-rods-applicable"],
    51: ["eld-required", "eld-malfunction"], 52: ["eld-or-rods-applicable"],
    62: ["air-brakes"], 63: ["air-brakes"], 64: ["air-brakes"],
    66: ["cargo-securement"],
}


def question_conditions(index):
    return list(QUESTION_CONDITIONS.get(index, []))


AUDIO_CHANGED_QUESTIONS = {11, 14, 16, 19, 20, 22, 27, 29, 34, 35, 36, 37, 39, 42, 43, 47, 50, 51, 64, 66}
DRIVER_ANSWER_LISTENING_LEGACY_IDS = {"question-15", "question-37", "question-42", "question-64", "question-71"}


def securement_question_materializations():
    source_128 = "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-393/subpart-I/section-393.128"
    source_130 = "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-393/subpart-I/section-393.130"
    rows = {
        "transported-automobile-or-light-truck-at-most-10000-lb": {
            "branchId": "vehicle-at-most-10000-lb",
            "regulation": "49 CFR 393.128",
            "visibleStimulus": {"individualVehicleWeightLb": 8600, "cargoType": "automobile", "trainingSample": True},
            "prompt": "This transported automobile weighs 8,600 pounds. What is the section-specific minimum securement under 49 CFR 393.128?",
            "promptRu": "Перевозимый автомобиль весит 8 600 фунтов. Каков минимальный способ крепления по 49 CFR 393.128?",
            "answer": "This 8,600-pound automobile is in the 393.128 branch. The minimum is two tiedowns with restraint at both the front and rear.",
            "answerRu": "Автомобиль массой 8 600 фунтов относится к ветке 393.128. Минимум составляет два средства крепления с удержанием и спереди, и сзади.",
            "slots": [
                {"name": "vehicle-weight", "type": "weight-cardinal", "display": "8,600 pounds", "spoken": "eight thousand six hundred pounds"},
                {"name": "minimum-tiedowns", "type": "count-cardinal", "display": "2 tiedowns", "spoken": "two tiedowns"},
                {"name": "regulation-branch", "type": "statement", "display": "393.128", "spoken": "three ninety-three point one twenty-eight"},
            ],
            "responseRubric": {
                "minTokens": 8,
                "requiredRatio": 1,
                "requiredGroups": [["393.128"], ["minimum"], ["two", "2"], ["tiedowns"], ["front"], ["rear"]],
                "branchConflictPolicy": {
                    "exclusiveConditionId": "transported-automobile-or-light-truck-at-most-10000-lb",
                    "requiredRegulation": "393.128",
                    "requiredMinimumTiedowns": 2,
                    "forbiddenRegulation": "393.130",
                    "forbiddenMinimumTiedowns": 4,
                    "minimumAnswerStrict": True,
                    "rejectOtherBranch": True,
                },
            },
            "sourceRefs": [source_128],
        },
        "transported-automobile-or-light-truck-over-10000-lb": {
            "branchId": "vehicle-over-10000-lb",
            "regulation": "49 CFR 393.130",
            "visibleStimulus": {"individualVehicleWeightLb": 12400, "cargoType": "heavy wheeled vehicle", "trainingSample": True},
            "prompt": "This transported wheeled vehicle weighs 12,400 pounds. What securement and preparation does 49 CFR 393.130 require?",
            "promptRu": "Перевозимая колесная машина весит 12 400 фунтов. Какое крепление и подготовку требует 49 CFR 393.130?",
            "answer": "This 12,400-pound vehicle is in the 393.130 branch. Use at least four tiedowns near the front and rear or at designed mounting points, lower and secure accessory equipment, and prevent articulation when applicable.",
            "answerRu": "Машина массой 12 400 фунтов относится к ветке 393.130. Используйте минимум четыре средства крепления у передней и задней части либо в предназначенных точках, опустите и закрепите навесное оборудование и при необходимости исключите складывание сочлененной машины.",
            "slots": [
                {"name": "vehicle-weight", "type": "weight-cardinal", "display": "12,400 pounds", "spoken": "twelve thousand four hundred pounds"},
                {"name": "minimum-tiedowns", "type": "count-cardinal", "display": "4 tiedowns", "spoken": "four tiedowns"},
                {"name": "regulation-branch", "type": "statement", "display": "393.130", "spoken": "three ninety-three point one thirty"},
            ],
            "responseRubric": {
                "minTokens": 12,
                "requiredRatio": 1,
                "requiredGroups": [["393.130"], ["four", "4"], ["tiedowns"], ["front"], ["rear"], ["accessory"], ["articulation", "articulated"]],
                "branchConflictPolicy": {
                    "exclusiveConditionId": "transported-automobile-or-light-truck-over-10000-lb",
                    "requiredRegulation": "393.130",
                    "requiredMinimumTiedowns": 4,
                    "forbiddenRegulation": "393.128",
                    "forbiddenMinimumTiedowns": 2,
                    "minimumAnswerStrict": True,
                    "rejectOtherBranch": True,
                },
            },
            "sourceRefs": [source_130],
        },
    }
    for condition_id, row in rows.items():
        row["conditionId"] = condition_id
        row["profiles"] = list(HOTSHOT_PROFILES)
        row["conditions"] = ["vehicle-transport", "cargo-securement", condition_id]
        row["promptSpoken"] = row["prompt"]
        row["promptDisplay"] = row["prompt"]
        row["answerSpoken"] = row["answer"]
        row["answerDisplay"] = row["answer"]
    return rows

DOCUMENT_TRAINING_PHRASES = {
    "document:commercial-drivers-license": ("My commercial driver's license is ready for inspection.", "Мои коммерческие водительские права готовы к проверке."),
    "document:medical-examiner-certificate": ("Here is my medical examiner's certificate.", "Вот мое медицинское свидетельство."),
    "document:spe-certificate": ("Here is my SPE certificate.", "Вот мой сертификат SPE."),
    "document:tractor-registration-irp": ("Here are the tractor registration and IRP cab card.", "Вот регистрация тягача и карточка IRP."),
    "document:trailer-registration": ("Here is the trailer registration.", "Вот регистрация прицепа."),
    "document:proof-of-insurance": ("The proof of insurance is in this folder.", "Подтверждение страхования находится в этой папке."),
    "document:periodic-inspection-package": ("Here are the periodic inspection records.", "Вот документы о периодической проверке."),
    "document:driver-vehicle-inspection-report": ("Here is the driver vehicle inspection report.", "Вот отчет водителя о состоянии машины."),
    "document:eld-user-manual-locator": ("The ELD user manual is optional device help, not a federally required onboard item.", "Руководство ELD является необязательной помощью по устройству, а не обязательным федеральным документом на борту."),
    "document:eld-transfer-instructions": ("Here are the ELD data transfer instructions.", "Вот инструкция по передаче данных ELD."),
    "document:eld-malfunction-instructions": ("Here are the ELD malfunction instructions.", "Вот инструкция на случай неисправности ELD."),
    "document:blank-paper-rods": ("Here are my blank paper logs.", "Вот мои чистые бумажные бланки журнала."),
    "document:eld-roadside-screen": ("My ELD records are available on this screen.", "Мои записи ELD доступны на этом экране."),
    "document:bill-of-lading": ("Here is the bill of lading.", "Вот транспортная накладная."),
    "document:scale-ticket": ("Here is the scale ticket.", "Вот весовой талон."),
    "document:ifta-license-copy": ("Here is the IFTA license copy.", "Вот копия лицензии IFTA."),
    "document:hazmat-shipping-paper": ("Here is the hazardous materials shipping paper.", "Вот транспортный документ на опасный груз."),
    "document:oversize-overweight-permit": ("Here is the oversize or overweight permit.", "Вот разрешение на негабаритный или тяжеловесный груз."),
    "document:roadside-inspection-report": ("Here is the roadside inspection report.", "Вот отчет о дорожной проверке."),
    "document:proof-of-delivery-osd": ("Here are the proof of delivery and the OS&D record.", "Вот подтверждение доставки и отчет OS&D."),
}


def build_questions(inspection):
    questions = []
    ids = set()
    for index, item in enumerate(inspection, 1):
        content_id = stable_id("question", item["promptTemplate"])
        if content_id in ids:
            raise ValueError(f"Duplicate semantic question id: {content_id}")
        ids.add(content_id)
        legacy_id = f"question-{index:02d}"
        record = {
            **item,
            "id": content_id,
            "legacyId": legacy_id,
            "audioSourceId": None if index in AUDIO_CHANGED_QUESTIONS else legacy_id,
            "promptRole": "inspector",
            "answerRole": "driver",
            "audioProfilesAvailable": ["clean", "phone", "roadside"],
            "driverAnswerListeningAvailable": legacy_id in DRIVER_ANSWER_LISTENING_LEGACY_IDS,
            "profiles": question_profiles(index),
            "conditions": question_conditions(index),
            "corpus": "representative-training-prompts",
            "sourceLabel": "Representative training prompt, not an official standardized question",
        }
        if index in AUDIO_CHANGED_QUESTIONS:
            record["audioFallback"] = "browser-speech-exact-text"
        if index == 12:
            record["profileMaterializations"] = {
                "tractor": {
                    "answer": "I am hauling packaged food.",
                    "answerRu": "Я везу упакованные продукты.",
                    "slots": [{"name": "commodity", "type": "cargo-description", "display": "packaged food", "spoken": "packaged food", "accepted": ["packaged food", "food products"]}],
                },
                "hotshot-open": {
                    "answer": "I am hauling vehicles.",
                    "answerRu": "Я везу автомобили.",
                    "slots": [{
                        "name": "commodity", "type": "cargo-description", "display": "vehicles", "spoken": "vehicles",
                        "accepted": ["vehicles", "cars", "automobiles"],
                        "category": "transported-vehicles", "countRequired": False,
                        "rejectedCategories": ["packaged-food"],
                    }],
                    "responseRubric": {
                        "minTokens": 3,
                        "requiredGroups": [
                            ["hauling", "carrying", "haul", "carry", "transport", "transporting"],
                            ["vehicles", "vehicle", "cars", "car", "automobiles", "automobile"],
                        ],
                        "requiredRatio": 1,
                        "taskRelation": "cargo-from-expected",
                        "cargoCategory": "transported-vehicles", "countRequired": False,
                        "rejectCargoCategories": ["packaged-food"],
                    },
                },
                "hotshot-enclosed": {
                    "answer": "I am hauling a passenger vehicle.",
                    "answerRu": "Я везу легковой автомобиль.",
                    "slots": [{
                        "name": "commodity", "type": "cargo-description", "display": "a passenger vehicle", "spoken": "a passenger vehicle",
                        "accepted": ["a passenger vehicle", "passenger vehicle", "one vehicle", "a car", "one car", "car", "automobile"],
                        "category": "transported-vehicles",
                        "rejectedCategories": ["packaged-food"],
                    }],
                    "responseRubric": {
                        "minTokens": 3,
                        "requiredGroups": [
                            ["hauling", "carrying", "haul", "carry", "transport", "transporting"],
                            ["passenger vehicle", "vehicle", "car", "automobile"],
                        ],
                        "requiredRatio": 1,
                        "taskRelation": "cargo-from-expected",
                        "cargoCategory": "transported-vehicles",
                        "rejectCargoCategories": ["packaged-food"],
                    },
                },
            }
        if index == 16:
            record["profileMaterializations"] = {
                "tractor": {
                    "prompt": record["prompt"], "promptRu": record["promptRu"],
                    "answer": record["answer"], "answerRu": record["answerRu"], "slots": record["slots"],
                },
                "hotshot-open": {
                    "prompt": "What are your pickup and trailer numbers?", "promptRu": "Назовите номера пикапа и прицепа.",
                    "answer": "The pickup is P two zero four and the trailer is H S five one eight.",
                    "answerDisplay": "The pickup is P-204 and the trailer is HS-518.",
                    "answerRu": "Номер пикапа P-204, номер прицепа HS-518.",
                    "slots": [
                        {"name": "power-unit-id", "type": "equipment-identifier", "display": "P-204", "spoken": "P two zero four"},
                        {"name": "trailer-unit-id", "type": "equipment-identifier", "display": "HS-518", "spoken": "H S five one eight"},
                    ],
                },
                "hotshot-enclosed": {
                    "prompt": "What are your pickup and trailer numbers?", "promptRu": "Назовите номера пикапа и прицепа.",
                    "answer": "The pickup is P two zero four and the trailer is H E five one eight.",
                    "answerDisplay": "The pickup is P-204 and the trailer is HE-518.",
                    "answerRu": "Номер пикапа P-204, номер прицепа HE-518.",
                    "slots": [
                        {"name": "power-unit-id", "type": "equipment-identifier", "display": "P-204", "spoken": "P two zero four"},
                        {"name": "trailer-unit-id", "type": "equipment-identifier", "display": "HE-518", "spoken": "H E five one eight"},
                    ],
                },
            }
        if index == 28:
            record["profileMaterializations"] = {
                "tractor": {"prompt": record["prompt"], "promptRu": record["promptRu"], "answer": record["answer"], "answerRu": record["answerRu"], "slots": record["slots"]},
                "hotshot-open": {"prompt": record["prompt"], "promptRu": record["promptRu"], "answer": "The pickup report is here, and the open-trailer report is here.", "answerRu": "Документы о проверке пикапа и открытого прицепа находятся на машине.", "slots": []},
                "hotshot-enclosed": {"prompt": record["prompt"], "promptRu": record["promptRu"], "answer": "The pickup report is here, and the enclosed-trailer report is here.", "answerRu": "Документы о проверке пикапа и закрытого прицепа находятся на машине.", "slots": []},
            }
        if index == 29:
            record["profileMaterializations"] = {
                "tractor": {"prompt": record["prompt"], "promptRu": record["promptRu"], "answer": record["answer"], "answerRu": record["answerRu"], "slots": record["slots"]},
                "hotshot-open": {"prompt": "When were the pickup and open trailer last inspected?", "promptRu": "Когда в последний раз проверяли пикап и открытый прицеп?", "answer": "They were inspected on August first, twenty twenty-six.", "answerDisplay": "They were inspected on August 1, 2026.", "answerRu": "Их проверили 1 августа 2026 года.", "slots": record["slots"]},
                "hotshot-enclosed": {"prompt": "When were the pickup and enclosed trailer last inspected?", "promptRu": "Когда в последний раз проверяли пикап и закрытый прицеп?", "answer": "They were inspected on August first, twenty twenty-six.", "answerDisplay": "They were inspected on August 1, 2026.", "answerRu": "Их проверили 1 августа 2026 года.", "slots": record["slots"]},
            }
        if index == 66:
            record["profileMaterializations"] = {
                "tractor": {"answer": record["answer"], "answerRu": record["answerRu"], "slots": record["slots"]},
                "hotshot-open": {
                    "answer": "Each vehicle is secured at the front and rear. I rechecked every tiedown after departure.",
                    "answerRu": "Каждый автомобиль закреплен спереди и сзади. Я повторно проверил каждое средство крепления после начала рейса.",
                    "slots": [
                        {"name": "securement-method", "type": "securement-method", "display": "front and rear", "spoken": "front and rear"},
                    ],
                },
                "hotshot-enclosed": {
                    "answer": "The vehicle is secured at the front and rear. I rechecked every tiedown after departure.",
                    "answerRu": "Автомобиль закреплен спереди и сзади. Я повторно проверил каждое средство крепления после начала рейса.",
                    "slots": [
                        {"name": "securement-method", "type": "securement-method", "display": "front and rear", "spoken": "front and rear"},
                    ],
                },
            }
            record["conditionMaterializations"] = securement_question_materializations()
        for overlay in record.get("profileMaterializations", {}).values():
            prompt_spoken = overlay.get("prompt", record["prompt"])
            answer_spoken = overlay.get("answer", record["answer"])
            overlay["promptSpoken"] = prompt_spoken
            overlay["answerSpoken"] = answer_spoken
            overlay["promptDisplay"] = overlay.get(
                "promptDisplay",
                record["promptDisplay"] if prompt_spoken == record["prompt"] else prompt_spoken,
            )
            overlay["answerDisplay"] = overlay.get(
                "answerDisplay",
                record["answerDisplay"] if answer_spoken == record["answer"] else answer_spoken,
            )
        questions.append(record)
    return questions


ELP_STEP_ONE_IDS = [
    "question:pull-into-the-inspection-lane",
    "question:what-is-your-truck-and-trailer-number",
    "question:where-are-you-coming-from",
    "question:where-are-you-going",
    "question:what-are-you-hauling",
    "question:who-do-you-drive-for",
    "question:what-is-your-current-duty-status",
]

ELP_STEP_ONE_FUNCTIONS = [
    {"id": "safe-command", "questionId": "question:pull-into-the-inspection-lane", "labelRu": "Безопасное выполнение команды"},
    {"id": "unit-identification", "questionId": "question:what-is-your-truck-and-trailer-number", "labelRu": "Идентификация машины и прицепа"},
    {"id": "origin", "questionId": "question:where-are-you-coming-from", "labelRu": "Место отправления"},
    {"id": "destination", "questionId": "question:where-are-you-going", "labelRu": "Пункт назначения"},
    {"id": "cargo", "questionId": "question:what-are-you-hauling", "labelRu": "Груз"},
    {"id": "carrier", "questionId": "question:who-do-you-drive-for", "labelRu": "Перевозчик или работодатель"},
    {"id": "duty-status", "questionId": "question:what-is-your-current-duty-status", "labelRu": "Рабочий статус или HOS"},
]

DIAGNOSTIC_ITEM_ROWS = [
    ("a-vocabulary-lane", "A", "vocabulary", "a-vocabulary-lane-v1", "vocabulary-lane"),
    ("a-vocabulary-shoulder", "A", "vocabulary", "a-vocabulary-shoulder-v1", "vocabulary-shoulder"),
    ("a-vocabulary-oos", "A", "vocabulary", "a-vocabulary-oos-v1", "vocabulary-oos"),
    ("a-vocabulary-clearance", "A", "vocabulary", "a-vocabulary-clearance-v1", "vocabulary-clearance"),
    ("a-vocabulary-seal", "A", "vocabulary", "a-vocabulary-seal-v1", "vocabulary-seal"),
    ("a-listening-lane", "A", "listening", "a-pull-inspection-lane-v1", "listening-lane"),
    ("a-listening-right", "A", "listening", "a-stay-cab-v1", "listening-stop-b"),
    ("a-listening-time", "A", "listening", "a-appointment-0930-aug20-v1", "listening-time"),
    ("a-listening-weight", "A", "listening", "a-weight-38200-v1", "listening-weight"),
    ("a-listening-pressure", "A", "listening", "a-pressure-60-v1", "listening-pressure-a"),
    ("a-elp-origin", "A", "elp", "a-elp-origin-v1", "elp-origin"),
    ("a-elp-destination", "A", "elp", "a-elp-destination-v1", "elp-destination"),
    ("a-elp-carrier", "A", "elp", "a-elp-carrier-v1", "elp-carrier"),
    ("a-elp-cargo", "A", "elp", "a-elp-cargo-v1", "elp-cargo"),
    ("a-elp-clarify", "A", "elp", "a-elp-clarify-v1", "elp-clarify"),
    ("a-inspection-oos", "A", "inspection", "a-inspection-oos-v1", "inspection-oos"),
    ("a-inspection-insurance", "A", "inspection", "a-inspection-insurance-v1", "inspection-document"),
    ("a-inspection-command", "A", "inspection", "a-inspection-command-v1", "inspection-command"),
    ("a-inspection-lane", "A", "inspection", "a-inspection-lane-v1", "inspection-stop"),
    ("a-inspection-cdl", "A", "inspection", "a-inspection-cdl-v1", "inspection-paper"),
    ("b-vocabulary-detour", "B", "vocabulary", "b-vocabulary-detour-v1", "vocabulary-detour"),
    ("b-vocabulary-reweigh", "B", "vocabulary", "b-vocabulary-reweigh-v1", "vocabulary-reweigh"),
    ("b-vocabulary-securement", "B", "vocabulary", "b-vocabulary-securement-v1", "vocabulary-securement"),
    ("b-vocabulary-merge", "B", "vocabulary", "b-vocabulary-merge-v1", "vocabulary-merge"),
    ("b-vocabulary-overage", "B", "vocabulary", "b-vocabulary-overage-v1", "vocabulary-overage"),
    ("b-listening-cone", "B", "listening", "b-stop-white-line-v1", "listening-stop-b"),
    ("b-listening-route", "B", "listening", "b-final-destination-v1", "listening-route"),
    ("b-listening-time", "B", "listening", "b-duration-4h18-v1", "listening-duration"),
    ("b-listening-oos", "B", "listening", "b-oos-rest-complete-v1", "listening-oos-condition"),
    ("b-listening-pressure", "B", "listening", "b-release-tractor-brakes-v1", "listening-pressure-b"),
    ("b-elp-origin", "B", "elp", "b-elp-origin-v1", "elp-origin"),
    ("b-elp-destination", "B", "elp", "b-elp-destination-v1", "elp-destination"),
    ("b-elp-employer", "B", "elp", "b-elp-employer-v1", "elp-carrier"),
    ("b-elp-cargo", "B", "elp", "b-elp-cargo-v1", "elp-cargo"),
    ("b-elp-duty", "B", "elp", "b-elp-duty-v1", "elp-duty"),
    ("b-inspection-repeat", "B", "inspection", "b-inspection-repeat-v1", "inspection-repeat"),
    ("b-inspection-hazards", "B", "inspection", "b-inspection-hazards-v1", "inspection-stop"),
    ("b-inspection-registration", "B", "inspection", "b-inspection-registration-v1", "inspection-document"),
    ("b-inspection-wait", "B", "inspection", "b-inspection-wait-v1", "inspection-command"),
    ("b-inspection-securement", "B", "inspection", "b-inspection-securement-v1", "inspection-paper"),
]


def build_diagnostic_contract():
    inventory = [
        {
            "id": item_id,
            "form": form,
            "category": category,
            "stimulusVersion": stimulus_version,
            "recoveryTargetId": recovery_target_id,
        }
        for item_id, form, category, stimulus_version, recovery_target_id in DIAGNOSTIC_ITEM_ROWS
    ]
    targets = []
    aliases = {}
    seen_targets = set()
    for item in inventory:
        aliases[item["id"]] = item["recoveryTargetId"]
        aliases[item["recoveryTargetId"]] = item["recoveryTargetId"]
        if item["recoveryTargetId"] in seen_targets:
            continue
        seen_targets.add(item["recoveryTargetId"])
        targets.append({"id": item["recoveryTargetId"], "category": item["category"]})
    return inventory, targets, dict(sorted(aliases.items()))

CARGO_SECUREMENT_TRUCK_UNIT_IDS = {
    "t:term:cargo-securement",
    "t:term:tie-down-strap",
    "t:professional:the-cargo-is-secured-and-the-seal-is-intact",
}

PROFILE_NEUTRAL_TERM_EXAMPLES = {
    "t:term:vehicle-registration": "The registration matches the current unit identification number.",
    "t:term:bill-of-lading-bol": "The driver checked the shipment reference on the BOL.",
    "t:term:cargo-weight": "The listed cargo weight matches the current shipping document.",
}


def build_truck_units(terms, phrases, questions, docs, signs):
    units = []
    seen = set()

    def add(content_id, english, translation, example, theme, kind, source, source_ref,
            profiles=None, conditions=None, word_role="driver", example_role="driver", extra=None):
        english = english.strip()
        key = normalize_unit(english)
        if not english or key in seen:
            return False
        seen.add(key)
        translation = natural_translation(english, translation.strip())
        item_conditions = list(conditions or [])
        if content_id in CARGO_SECUREMENT_TRUCK_UNIT_IDS:
            item_conditions.append("cargo-securement")
        if content_id in AIR_BRAKE_TRUCK_UNIT_IDS:
            item_conditions.append("air-brakes")
        if content_id in ELD_TRUCK_UNIT_IDS:
            item_conditions.append("eld-required")
        record = {
            "id": content_id,
            "word": english,
            "translation": translation,
            "translationRu": translation,
            "pron": pronounce_ru(english),
            "pronRu": pronounce_ru(english),
            "example": example.strip(),
            "theme": theme,
            "kind": kind,
            "source": source,
            "sourceRef": source_ref,
            "profiles": list(profiles or ALL_PROFILES),
            "conditions": list(dict.fromkeys(item_conditions)),
            "wordRole": word_role,
            "exampleRole": example_role,
        }
        if extra:
            record.update(extra)
        units.append(record)
        return True

    for index, item in enumerate(terms, 1):
        content_id = stable_id("t:term", item["english"])
        example = PROFILE_NEUTRAL_TERM_EXAMPLES.get(content_id, item["example"])
        add(content_id, item["english"], item["translation"], example,
            item["theme"], "term", "terminology", f"term:{index:03d}", professional_profiles(content_id))
    for index, item in enumerate(phrases, 1):
        content_id = stable_id("t:required", item["template"])
        extra = {"wordTemplate": item["template"], "wordDisplay": item["display"], "slots": item["slots"]}
        if content_id == "t:required:i-am-hauling-commodity":
            commodity_profiles = {
                "tractor": (
                    "I am hauling packaged food.", "Я везу упакованные продукты.",
                    "At the roadside inspection, the officer asked about the sealed dry-van load.", "packaged food",
                ),
                "hotshot-open": (
                    "I am hauling two vehicles.", "Я везу два автомобиля.",
                    "At the auction, the release forms list both vehicles on the open trailer.", "two vehicles",
                ),
                "hotshot-enclosed": (
                    "I am hauling a passenger vehicle.", "Я везу легковой автомобиль.",
                    "At pickup, the VIN on the passenger vehicle matches the enclosed-trailer order.", "a passenger vehicle",
                ),
            }
            extra["profileMaterializations"] = {
                profile: {
                    "word": word,
                    "wordDisplay": word,
                    "translation": translation,
                    "translationRu": translation,
                    "pron": pronounce_ru(word),
                    "pronRu": pronounce_ru(word),
                    "example": example,
                    "slots": [{
                        "name": "commodity", "type": "cargo-description",
                        "display": commodity, "spoken": commodity,
                    }],
                }
                for profile, (word, translation, example, commodity) in commodity_profiles.items()
            }
        add(content_id, item["english"], item["translation"],
            f"During the roadside check, the driver said: {item['english']}",
            item["theme"], "phrase", "required-phrase", f"required:{index:02d}", professional_profiles(content_id), [],
            extra=extra)
    for item in questions:
        question_key = item["id"].split(":", 1)[1]
        common = {"profiles": item["profiles"], "conditions": item["conditions"]}
        unit_profile_materializations = {"prompt": {}, "answer": {}}
        for profile, overlay in item.get("profileMaterializations", {}).items():
            prompt = overlay.get("promptSpoken", overlay.get("prompt", item["prompt"]))
            answer = overlay.get("answerSpoken", overlay.get("answer", item["answer"]))
            prompt_display = overlay.get("promptDisplay", prompt)
            answer_display = overlay.get("answerDisplay", answer)
            prompt_ru = overlay.get("promptRu", item["promptRu"])
            answer_ru = overlay.get("answerRu", item["answerRu"])
            slots = overlay.get("slots", item["slots"])
            unit_profile_materializations["prompt"][profile] = {
                "word": prompt, "wordDisplay": prompt_display, "translation": prompt_ru, "translationRu": prompt_ru,
                "pron": pronounce_ru(prompt), "pronRu": pronounce_ru(prompt), "example": answer, "slots": slots,
            }
            unit_profile_materializations["answer"][profile] = {
                "word": answer, "wordDisplay": answer_display, "translation": answer_ru, "translationRu": answer_ru,
                "pron": pronounce_ru(answer), "pronRu": pronounce_ru(answer), "example": prompt, "slots": slots,
            }
        prompt_extra = {"wordTemplate": item["promptTemplate"], "wordDisplay": item["promptDisplay"], "slots": item["slots"], "questionId": item["id"]}
        answer_extra = {"wordTemplate": item["answerTemplate"], "wordDisplay": item["answerDisplay"], "slots": item["slots"], "questionId": item["id"]}
        if unit_profile_materializations["prompt"]:
            prompt_extra["profileMaterializations"] = unit_profile_materializations["prompt"]
            answer_extra["profileMaterializations"] = unit_profile_materializations["answer"]
        add(f"t:question:{question_key}:prompt", item["prompt"], item["promptRu"], item["answer"], item["category"],
            "training-prompt", "representative-inspection-bank", f"{item['legacyId']}:prompt",
            common["profiles"], common["conditions"], "inspector", "driver",
            prompt_extra)
        add(f"t:question:{question_key}:answer", item["answer"], item["answerRu"], item["prompt"], item["category"],
            "training-answer", "representative-inspection-bank", f"{item['legacyId']}:answer",
            common["profiles"], common["conditions"], "driver", "inspector",
            answer_extra)
    for doc in docs:
        english, translation = DOCUMENT_TRAINING_PHRASES[doc["id"]]
        add(f"t:document:{doc['id'].split(':', 1)[1]}", english,
            translation, doc["practice"] or "The document is available for inspection.",
            "Documents", "document-phrase", "document-pack", doc["legacyId"], doc["profiles"], doc["conditions"])
    for index, (theme, english, translation) in enumerate(EXTRA_PHRASES, 1):
        content_id = stable_id("t:professional", english)
        add(content_id, english, translation, f"In the work conversation, the driver said: {english}", theme, "phrase", "extra-phrase",
            f"extra:{index:02d}", professional_profiles(content_id))
    priority_signs = {item["display"]: item for item in signs}
    for display in SIGN_ACTION_PRIORITY_DISPLAYS:
        sign = priority_signs[display]
        add(f"t:sign:{sign['id'].split(':', 1)[1]}:action", sign["actionEn"], sign["actionTranslationRu"],
            f"The sign says: {sign['display']}.", "Traffic signs and route language", "sign-action", "sign-bank",
            sign["legacyId"], sign["profiles"], sign["conditions"], "driver", "driver", {"signId": sign["id"]})
    expected_groups = {"terminology": 120, "required-phrase": 30, "representative-inspection-bank": 144,
                       "document-pack": 20, "extra-phrase": 44, "sign-bank": 42}
    actual_groups = {source: sum(item["source"] == source for item in units) for source in expected_groups}
    if actual_groups != expected_groups or len(units) != 400:
        raise ValueError(f"Explicit professional quota failed: {actual_groups}, total={len(units)}")
    if len({item["id"] for item in units}) != 400:
        raise ValueError("Duplicate semantic Truck unit ids")
    return units


def build_core():
    source = json.loads(SOURCE_CORE.read_text(encoding="utf-8"))
    selected = []
    for item in source[:700]:
        selected.append({
            "id": f"c:{slug(item['english'])}",
            "word": item["english"],
            "translation": item.get("translation", ""),
            "pron": item.get("ruPron", ""),
            "pronRu": item.get("ruPron", ""),
            "example": item.get("example", ""),
            "theme": item.get("theme", "General English"),
            "kind": "general-core",
            "source": "english-basic-core",
            "profiles": ALL_PROFILES,
            "conditions": [],
            "wordRole": "driver",
            "exampleRole": "driver",
        })
    if len(selected) != 700:
        raise ValueError("General Core selection failed")
    return len(source), selected


def situation_audio_profile(index, mechanic):
    value = mechanic.lower()
    if "phone" in value:
        return "phone"
    if "roadside" in value:
        return "roadside"
    if index in {16, 17, 18, 25, 31, 32}:
        return "phone"
    if 1 <= index <= 15:
        return "roadside"
    return "clean"


TRACTOR_ONLY_SITUATION_INDEXES = {4, 7, 8, 14, 17, 19, 20, 21, 22, 23, 24, 26, 29}


def base_situation_profiles(index):
    return ["tractor"] if index in TRACTOR_ONLY_SITUATION_INDEXES else ALL_PROFILES


BASE_SITUATION_CONDITIONS = {
    4: ["trip-specific", "dry-van-load"],
    5: ["eld-required"],
    7: ["air-brakes"],
    8: ["air-brakes"],
    12: ["eld-required", "eld-malfunction"],
    14: ["scale-ticket-issued"],
    17: ["trip-specific", "dry-van-load"],
    19: ["trip-specific", "dry-van-load"],
    20: ["trip-specific", "dry-van-load"],
    21: ["trip-specific", "dry-van-load"],
    22: ["trip-specific", "dry-van-load"],
    23: ["trip-specific", "dry-van-load"],
    24: ["trip-specific", "dry-van-load", "scale-ticket-issued"],
    26: ["trip-specific", "dry-van-load", "delivery"],
    27: ["trip-specific", "delivery"],
    29: [],
    32: ["permit-applicable"],
}


def base_situation_conditions(index):
    return list(BASE_SITUATION_CONDITIONS.get(index, []))


SITUATION_GOALS_RU = [
    "Безопасно остановиться, выключить двигатель и подтвердить понятую команду.",
    "Безопасно остановиться, понять причину контакта и передать запрошенные документы.",
    "Назвать место отправления, место назначения, груз и факты текущего рейса.",
    "Найти и передать права, регистрацию, транспортную накладную и запрошенный сопроводительный документ.",
    "Объяснить текущий рабочий статус и показать записи ELD.",
    "Пройти проверку прав, медицинского статуса, RODS, перевозчика и отчетов.",
    "Выполнить команды по световым приборам, тормозам, рулевому управлению и видимому оборудованию.",
    "Подготовить тягач к полной проверке и выполнить команды в кабине и при проверке тормозов.",
    "Объяснить смысл дорожного знака или электронного сообщения.",
    "Понять, что нужно открыть, включить или показать инспектору.",
    "Понять нарушение и ограничение, получить отчет и уточнить следующий разрешенный шаг.",
    "Объяснить неисправность ELD, показать восстановленные RODS и инструкцию.",
    "Точно назвать расхождение в документе и запросить следующую инструкцию.",
    "Заехать на весы, сообщить проблему с нагрузкой на ось и получить повторное взвешивание.",
    "Сообщить местоположение, травмы, транспортные средства и опасности после аварии.",
    "Назвать местоположение, номер машины, неисправность и безопасное положение на дороге.",
    "Подтвердить место погрузки, доставки, оборудование и время назначения.",
    "Подтвердить время назначения или сообщить задержку и новое расчетное время прибытия.",
    "Назвать компанию, номер погрузки и цель въезда.",
    "Получить номер погрузочных ворот или указание по зоне ожидания.",
    "Найти ряд, ворота и зону ожидания, затем повторить направление движения.",
    "Найти нужный прицеп, подтвердить пломбу, статус загрузки и место.",
    "Подтвердить количество мест, вес, повреждение и номер пломбы.",
    "Сообщить нагрузки на оси и запросить перераспределение груза.",
    "Зафиксировать время прибытия, причину задержки и новое расчетное время прибытия.",
    "Получить ворота, результат разгрузки, подпись и подтверждение доставки.",
    "Описать недостачу, повреждение или отказ и получить дальнейшую инструкцию.",
    "Назвать деталь, неисправность, место, серьезность и решение не начинать движение.",
    "Активировать колонку, назвать тягач и рефрижераторную установку и получить чек.",
    "Найти разрешенную стоянку и уточнить правила ночной парковки.",
    "Сообщить об опасных условиях и согласовать безопасный новый план.",
    "Найти разрешение, проверить маршрут, ограничения и срок действия.",
    "Назвать тип автопоезда, весовые рейтинги и показать сцепное устройство.",
    "Найти автомобиль и сверить VIN до погрузки.",
    "Уточнить состояние автомобиля и безопасно использовать лебедку.",
    "Объяснить крепление каждого автомобиля спереди и сзади.",
    "Запросить нагрузки на отдельные оси и исправить распределение груза.",
    "Провести совместный осмотр автомобиля и получить подпись.",
    "Проверить угол рампы и внутренние зазоры при ограниченном обзоре.",
    "Подтвердить крепление автомобиля и закрытие всех дверей прицепа.",
]

SITUATION_WORKPLACE_OUTCOMES_EN = [
    "The vehicle is safely stopped with the parking brake set and the engine off.",
    "The requested documents are ready, and the driver remains safely in the vehicle.",
    "The inspector received the route and cargo facts for the current trip.",
    "The requested driver, registration, shipping and supporting documents were identified.",
    "The current duty status and the required records were presented.",
    "The driver, carrier and log information were confirmed for the credential inspection.",
    "The requested light, brake and steering checks were completed.",
    "The tractor and trailer brake inspection sequence was completed safely.",
    "The lane closure was understood and the safe merge direction was confirmed.",
    "The requested hood, signal and emergency-equipment checks were completed.",
    "The vehicle remained out of service and the repair follow-up was confirmed.",
    "The ELD malfunction, carrier notice and reconstructed records were documented.",
    "The document mismatch was identified and carrier safety was contacted.",
    "The vehicle entered the correct scale lane and the reweigh plan was confirmed.",
    "Emergency services received the location, injury and roadway-hazard facts.",
    "The vehicle location was confirmed, hazards were activated immediately and warning devices were placed for the road type within ten minutes.",
    "The pickup assignment, load number and trailer number were confirmed.",
    "The appointment window, ETA and delay-update plan were confirmed.",
    "The carrier, pickup reference and assigned staging location were confirmed.",
    "The load reference and assigned dock or waiting location were confirmed.",
    "The yard route, row, dock and safe backing direction were confirmed.",
    "The correct trailer, seal, load status and drop location were confirmed.",
    "The piece count, cargo weight, damage note and seal were confirmed on the record.",
    "The axle-weight issue and the corrective load-distribution plan were confirmed.",
    "The arrival time, delay reason and updated ETA were documented.",
    "The unloading result, signed paperwork and delivery completion were confirmed.",
    "The shortage or damage was documented, and the driver waited for disposition instructions.",
    "The defect, its location and the decision not to move were documented.",
    "The correct fuel island, unit and refrigeration information were confirmed on the receipt.",
    "The permitted overnight parking location and its rules were confirmed.",
    "The unsafe road condition was reported and a legal, rested alternative plan was confirmed.",
    "The permit, route restrictions and validity period were checked before movement.",
    "The commercial combination, ratings and coupling information were confirmed.",
    "The assigned vehicle was found and its VIN was verified before loading.",
    "The vehicle condition and the safe winching procedure were confirmed before movement.",
    "Each transported vehicle was secured at the front and rear and the method was confirmed.",
    "The individual axle weights and the required load correction were confirmed.",
    "The existing damage, delivery inspection and signed condition report were confirmed.",
    "The ramp angle, clearances and spotter instructions were confirmed before loading.",
    "The vehicle securement and every trailer-door lock were confirmed for travel.",
]

SITUATION_CHOICE_DISTRACTORS_RU = [
    (
        "Продолжить движение к инспектору, не останавливаясь у указанной линии и не включая стояночный тормоз.",
        "Остановиться у линии и повторить команду, но оставить двигатель включенным во время проверки.",
    ),
    (
        "Выйти навстречу сотруднику с документами, хотя водитель должен безопасно оставаться в машине.",
        "Передать только права, не уточнив причину остановки и не подготовив регистрацию со страховкой.",
    ),
    (
        "Назвать прежний маршрут и груз из прошлой поездки вместо фактов текущего рейса.",
        "Сообщить отправление и назначение, но не назвать фактический груз текущей поездки.",
    ),
    (
        "Передать случайную папку без проверки, что в ней есть все документы, которые запросил инспектор.",
        "Показать права и регистрацию, но пропустить накладную или запрошенный сопроводительный документ.",
    ),
    (
        "Начать движение, не подтвердив текущий рабочий статус и не показав доступные записи ELD.",
        "Назвать рабочий статус устно, но не открыть соответствующие записи ELD для проверки.",
    ),
    (
        "Показать только водительские права и отказаться от проверки медицинского статуса и RODS.",
        "Передать личные документы, но не подтвердить перевозчика и относящиеся к машине отчеты.",
    ),
    (
        "Покинуть место проверки после теста фар, не выполнив команды по тормозам и рулевому управлению.",
        "Включить световые приборы и тормоза, но пропустить запрошенную проверку рулевого управления.",
    ),
    (
        "Начать тормозную проверку с отпущенными тормозами до безопасной подготовки тягача и прицепа.",
        "Выполнить команды в кабине, но не закончить требуемую последовательность проверки тормозов.",
    ),
    (
        "Перестроиться в полосу, которую электронный знак объявляет закрытой, не проверив безопасный путь.",
        "Повторить текст знака, но не назвать требуемое направление безопасного перестроения.",
    ),
    (
        "Открыть капот и выйти в поток без подтвержденной команды и безопасного положения автомобиля.",
        "Показать только один сигнал, пропустив запрошенное оборудование или аварийный комплект.",
    ),
    (
        "Продолжить рейс на автомобиле, который инспектор оставил вне эксплуатации до ремонта.",
        "Принять отчет о нарушении, но не уточнить, какой следующий шаг разрешен после ремонта.",
    ),
    (
        "Продолжать пользоваться неисправным ELD без уведомления перевозчика и восстановления записей.",
        "Сообщить о сбое ELD, но не показать восстановленные RODS и инструкцию для проверки.",
    ),
    (
        "Самостоятельно изменить документ, скрыв расхождение, вместо обращения в отдел безопасности.",
        "Назвать расхождение в документе, но не запросить у перевозчика следующую безопасную инструкцию.",
    ),
    (
        "Объехать весы и продолжить движение с известной проблемой нагрузки на ось.",
        "Заехать на весы и назвать проблему, но не получить план коррекции и повторного взвешивания.",
    ),
    (
        "Переместить машины после аварии до сообщения о пострадавших, опасностях и точном месте.",
        "Вызвать помощь, но сообщить только дорогу без травм, автомобилей и опасностей для движения.",
    ),
    (
        "Оставить неисправную машину без аварийной сигнализации и предупреждающих устройств у потока.",
        "Включить аварийную сигнализацию, но не выставить устройства вовремя и по схеме этой дороги.",
    ),
    (
        "Принять другой прицеп по похожему номеру, не сверив место, оборудование и назначенное время.",
        "Подтвердить место погрузки и доставки, но не сверить оборудование или время назначения.",
    ),
    (
        "Скрыть ожидаемую задержку и оставить получателя со старым временем прибытия.",
        "Сообщить о задержке, но не назвать новое расчетное время прибытия и время назначения.",
    ),
    (
        "Заехать на территорию без регистрации, не назвав компанию, номер погрузки и цель визита.",
        "Назвать компанию и цель въезда, но не сообщить номер погрузки для проверки назначения.",
    ),
    (
        "Самовольно занять свободные ворота без назначения диспетчера двора или разрешения на ожидание.",
        "Получить номер ворот, но не подтвердить, нужно ехать к ним или ждать в указанной зоне.",
    ),
    (
        "Начать движение задним ходом, не проверив ряд, ворота, зону ожидания и безопасное направление.",
        "Найти нужный ряд и ворота, но не повторить направление движения перед маневром.",
    ),
    (
        "Забрать похожий прицеп без сверки номера, пломбы, загрузки и места постановки.",
        "Сверить прицеп и пломбу, но не подтвердить статус загрузки или место доставки прицепа.",
    ),
    (
        "Подписать грузовую запись без фиксации повреждения, количества, веса и номера пломбы.",
        "Подтвердить количество и вес, но пропустить повреждение либо номер пломбы в записи.",
    ),
    (
        "Продолжить движение с превышением нагрузки на ось, не запрашивая перераспределение груза.",
        "Запросить коррекцию груза, но не сообщить фактические нагрузки на отдельные оси.",
    ),
    (
        "Изменить время прибытия в записи, чтобы скрыть задержку и ее реальную причину.",
        "Сообщить новое время прибытия, но не зафиксировать фактическое прибытие или причину задержки.",
    ),
    (
        "Уехать после разгрузки без результата, подписи и подтверждения доставки в документах.",
        "Получить подпись, но не сверить результат разгрузки и окончательное подтверждение доставки.",
    ),
    (
        "Покинуть объект с недостачей или повреждением без документа и инструкции по дальнейшим действиям.",
        "Записать расхождение, но не дождаться решения получателя или диспетчера о следующем шаге.",
    ),
    (
        "Начать движение с известной неисправностью, не оценив ее место и серьезность.",
        "Назвать неисправную деталь, но не указать место, серьезность или решение не двигаться.",
    ),
    (
        "Заправить другой тягач или рефрижераторную установку, не сверив номера перед включением колонки.",
        "Активировать нужную колонку, но не проверить номера тягача и установки в итоговом чеке.",
    ),
    (
        "Остановиться на запрещенной обочине вместо разрешенного места для ночной стоянки.",
        "Найти разрешенную стоянку, но не уточнить ограничения и правила ночного размещения.",
    ),
    (
        "Продолжить путь через опасные условия без законного времени и без безопасного запасного плана.",
        "Сообщить об опасности, но предложить маршрут, который нарушает ограничения или режим отдыха.",
    ),
    (
        "Начать движение до проверки разрешения, утвержденного маршрута и действующих ограничений.",
        "Найти разрешение, но не сверить маршрут, ограничения либо срок его действия.",
    ),
    (
        "Назвать комбинацию некоммерческой, не сверив рейтинги и сцепное устройство перед поездкой.",
        "Назвать тип автопоезда, но не показать рейтинги массы или фактическое сцепное устройство.",
    ),
    (
        "Погрузить похожий автомобиль по цвету и номеру места, не сверив полный VIN.",
        "Найти назначенный автомобиль, но сверить только часть VIN перед началом погрузки.",
    ),
    (
        "Начать тянуть автомобиль лебедкой до осмотра состояния и подтверждения безопасной процедуры.",
        "Описать состояние автомобиля, но начать лебедку без согласованной безопасной последовательности.",
    ),
    (
        "Закрепить каждый автомобиль только с одной стороны или использовать неподходящие точки крепления.",
        "Сказать, что автомобили закреплены, но не подтвердить крепление спереди и сзади каждого.",
    ),
    (
        "Переместить груз наугад без значений отдельных осей и без контрольного взвешивания.",
        "Запросить осевые нагрузки, но не выполнить нужную коррекцию распределения груза.",
    ),
    (
        "Подписать отчет о состоянии без совместного осмотра и фиксации существующего повреждения.",
        "Осмотреть автомобиль вместе, но оставить повреждение без записи или требуемой подписи.",
    ),
    (
        "Начать погрузку без проверки угла рампы, внутренних зазоров и помощи наблюдающего.",
        "Проверить угол рампы, но не подтвердить боковые и верхние зазоры при ограниченном обзоре.",
    ),
    (
        "Начать движение с незапертой дверью прицепа или непроверенным креплением автомобиля.",
        "Проверить двери прицепа, но не подтвердить крепление автомобиля спереди и сзади.",
    ),
]

SITUATION_VARIABLE_SPECS = [
    ("stop-point", "location", "white line", "yellow cone"),
    ("document-set", "document-set", "License, registration and insurance", "License and registration"),
    ("origin", "location", "Columbus, Ohio", "Dayton, Ohio"),
    ("requested-document", "document", "bill of lading", "trailer registration"),
    ("duty-status", "duty-status", "on duty, not driving", "off duty"),
    ("carrier", "organization", "Training Carrier", "Sample Logistics"),
    ("light-command", "equipment-action", "headlights", "high beams"),
    ("warning-pressure", "pressure", "58 psi", "62 psi"),
    ("sign-legend", "sign-legend", "RIGHT LANE CLOSED AHEAD", "LEFT LANE CLOSED AHEAD"),
    ("signal", "equipment-action", "left signal", "right signal"),
    ("oos-defect", "defect", "brake defect", "tire defect"),
    ("malfunction-time", "time", "7:40 a.m.", "8:15 a.m."),
    ("document-unit", "equipment-identifier", "T-205", "T-318"),
    ("scale-lane", "location", "scale lane", "reweigh lane"),
    ("crash-location", "location", "I-75 northbound", "I-40 westbound"),
    ("breakdown-location", "location", "I-71 southbound near mile marker 42", "a two-lane road near a blind curve at mile marker 126"),
    ("pickup-appointment", "appointment", "Sample Foods at 2 p.m.", "Training Produce at 4:30 p.m."),
    ("eta", "time", "9:20 a.m.", "9:45 a.m."),
    ("pickup-number", "identifier-digits", "000518", "008204"),
    ("load-number", "identifier-digits", "000518", "008204"),
    ("dock-door", "location", "door 18", "door 24"),
    ("trailer-id", "equipment-identifier", "TR-602", "TR-744"),
    ("cargo-weight", "weight-cardinal", "38,200 pounds", "41,600 pounds"),
    ("trailer-axle-weight", "weight-cardinal", "34,780 pounds", "35,120 pounds"),
    ("arrival-time", "time", "1:45 p.m.", "3:10 p.m."),
    ("delivery-door", "location", "door 12", "door 27"),
    ("cargo-discrepancy", "cargo-discrepancy", "Two cartons are damaged, and one pallet is short", "Three cartons are wet, and two pallets are short"),
    ("defect-location", "defect", "right trailer tire", "left rear trailer tire"),
    ("tractor-id", "equipment-identifier", "T-204", "T-318"),
    ("parking-rows", "location", "rows E through H", "rows J through M"),
    ("driving-time-left", "duration-minutes", "40 minutes", "25 minutes"),
    ("permit-expiration", "date", "August twenty-first", "August twenty-third"),
    ("commercial-purpose", "operation", "vehicles for hire", "one vehicle for a customer"),
    ("auction-vehicle", "identifier-and-vehicle", "four eighteen, a silver sedan", "seven twenty-one, a blue pickup"),
    ("inoperable-condition", "equipment-state", "steering is unlocked and the brakes release", "transmission is in neutral and the brakes release"),
    ("securement-method", "securement", "front and rear with rated tiedowns", "four rated attachment points"),
    ("weight-request", "lexical-request", "pickup and trailer axle weights separately", "individual axle weights separately"),
    ("damage-location", "defect", "left rear door", "right front fender"),
    ("clearance-check", "equipment-clearance", "roof or mirrors", "front bumper or mirrors"),
    ("door-status", "equipment-state", "every door is locked", "the rear ramp and side door are locked"),
]

SITUATION_VARIABLE_VALUES_RU = [
    ("белой линии", "желтого конуса"),
    ("Права, регистрацию и страховку", "Права и регистрацию"),
    ("Коламбусе, Огайо", "Дейтоне, Огайо"),
    ("транспортная накладная", "регистрация прицепа"),
    ("на работе, но не за рулем", "не на работе"),
    ("Training Carrier", "Sample Logistics"),
    ("фары", "дальний свет"),
    ("58 фунтах на квадратный дюйм", "62 фунтах на квадратный дюйм"),
    ("RIGHT LANE CLOSED AHEAD", "LEFT LANE CLOSED AHEAD"),
    ("левый поворотник", "правый поворотник"),
    ("неисправности тормозов", "неисправности шины"),
    ("7:40", "8:15"),
    ("T-205", "T-318"),
    ("весовую полосу", "полосу повторного взвешивания"),
    ("I-75 в северном направлении", "I-40 в западном направлении"),
    ("I-71 в южном направлении у отметки 42-й мили", "двухполосной дороге у закрытого поворота и отметки 126-й мили"),
    ("Sample Foods на 14:00", "Training Produce на 16:30"),
    ("9:20", "9:45"),
    ("000518", "008204"),
    ("000518", "008204"),
    ("18", "24"),
    ("TR-602", "TR-744"),
    ("38 200 фунтов", "41 600 фунтов"),
    ("34 780 фунтов", "35 120 фунтов"),
    ("13:45", "15:10"),
    ("12", "27"),
    ("Две коробки повреждены, одной палеты не хватает", "Три коробки намокли, двух палет не хватает"),
    ("правой шине прицепа", "левой задней шине прицепа"),
    ("T-204", "T-318"),
    ("ряды E-H", "ряды J-M"),
    ("40 минут", "25 минут"),
    ("21 августа", "23 августа"),
    ("автомобили за плату", "один автомобиль для клиента"),
    ("Лот четыреста восемнадцать, серебристый седан", "Лот семьсот двадцать один, синий пикап"),
    ("руль разблокирован и тормоза отпускают", "коробка передач в нейтральном положении и тормоза отпускают"),
    ("спереди и сзади расчетными средствами крепления", "в четырех расчетных точках крепления"),
    ("веса осей пикапа и прицепа", "нагрузки на отдельные оси"),
    ("левой задней двери", "правом переднем крыле"),
    ("крыша или зеркала", "передний бампер или зеркала"),
    ("все двери заперты", "задняя рампа и боковая дверь заперты"),
]

SITUATION_REQUIRED_CONCEPTS = [
    [["stop"], ["understood", "will"]], [["document", "folder"], ["reach"]], [["picked", "origin"], ["delivering", "destination"]],
    [["cdl", "license"], ["bill", "registration", "paper"]], [["duty"], ["driving", "off"]], [["drive", "carrier"], ["training", "sample"]],
    [["headlights", "beams"], ["on"]], [["brakes"], ["released", "set"]], [["lane"], ["closed"]], [["hood"], ["signal"], ["open", "on"]],
    [["not", "will not"], ["move"]], [["malfunction"], ["notified"], ["carrier"]], [["mismatch"], ["document", "unit"]], [["enter"], ["lane", "scale"]],
    [["crash"], ["northbound", "westbound"]], [["unit"], ["marker", "mile", "location"]], [["confirm"], ["load", "trailer"]], [["eta"], ["nine", "9"]],
    [["carrier", "training"], ["pickup", "number"]], [["pickup"], ["load", "number"]], [["straight"], ["left"], ["door"]], [["confirm"], ["seal"], ["loaded"]],
    [["damaged", "damage"], ["carton"]], [["axle"], ["pounds"]], [["arrived"], ["loading", "delay"]], [["door"], ["bol", "paperwork"]],
    [["damage"], ["shortage", "short"], ["pod"]], [["cut"], ["tire"]], [["both"], ["tractor"]], [["overnight"], ["parking"]],
    [["closed", "snow"], ["minutes", "time"]], [["permit"], ["valid"]], [["transporting"], ["hire", "customer"]], [["lot"], ["vehicle", "sedan", "pickup"], ["vin"]],
    [["yes"], ["steering", "transmission"], ["brakes"]], [["vehicle"], ["secured", "restrained", "tiedown"], ["front", "attachment"]],
    [["print"], ["axle"], ["separately"]], [["inspect"], ["sign"], ["report"]], [["tell"], ["close"], ["roof", "bumper", "mirror"]],
    [["vehicle"], ["tied", "secured"], ["door", "ramp"]],
]


SITUATION_SAFETY_CRITICAL_INDEXES = {
    1, 2, 7, 8, 9, 10, 11, 12, 14, 15, 16, 21, 24, 27, 28, 31, 32, 35, 36, 37, 38, 39, 40,
}

ELP_SITUATION_CARGO_BY_PROFILE = {
    "tractor": {
        "primary": "22 pallets of packaged food", "transfer": "20 pallets of bottled water",
        "primaryRu": "22 палеты упакованных продуктов", "transferRu": "20 палет бутилированной воды",
    },
    "hotshot-open": {
        "primary": "two vehicles", "transfer": "three vehicles",
        "primaryRu": "два автомобиля", "transferRu": "три автомобиля",
    },
    "hotshot-enclosed": {
        "primary": "one passenger vehicle", "transfer": "one SUV",
        "primaryRu": "один легковой автомобиль", "transferRu": "один внедорожник",
    },
}


DIAGNOSTIC_PROFILE_CARGO_MATERIALIZATIONS = {
    "version": "cycle3-profile-cargo-v2",
    "responseTarget": "commodity-only",
    "visibleTrailerTypeIsContextOnly": True,
    "trailerTypeResponseRequired": False,
    "profiles": {
        "tractor": {
            "visibleContextEn": "Training manifest: packaged food. Vehicle context: tractor-trailer.",
            "visibleContextRu": "Учебный манифест: упакованные продукты. Контекст машины: седельный автопоезд.",
            "trailerType": "tractor-trailer",
            "model": "I am hauling packaged food.",
            "slots": [{
                "name": "commodity", "type": "cargo-description", "display": "packaged food", "spoken": "packaged food",
                "accepted": ["packaged food", "food products"],
                "category": "packaged-food", "rejectedCategories": ["transported-vehicles"],
            }],
            "rubric": {
                "minTokens": 3,
                "requiredGroups": [
                    ["hauling", "carrying", "haul", "carry", "transport", "transporting"],
                    ["packaged food", "food products"],
                ],
                "requiredRatio": 1,
                "taskRelation": "cargo-from-expected",
                "trailerTypeResponseRequired": False,
            },
        },
        "hotshot-open": {
            "visibleContextEn": "Training manifest: transported vehicles. Trailer context: open car hauler.",
            "visibleContextRu": "Учебный манифест: перевозимые автомобили. Контекст прицепа: открытый автовоз.",
            "trailerType": "open-car-hauler",
            "model": "I am hauling vehicles.",
            "slots": [{
                "name": "commodity", "type": "cargo-description", "display": "vehicles", "spoken": "vehicles",
                "accepted": ["vehicles", "cars", "automobiles"],
                "category": "transported-vehicles", "countRequired": False,
                "rejectedCategories": ["packaged-food"],
            }],
            "rubric": {
                "minTokens": 3,
                "requiredGroups": [
                    ["hauling", "carrying", "haul", "carry", "transport", "transporting"],
                    ["vehicles", "vehicle", "cars", "car", "automobiles", "automobile"],
                ],
                "requiredRatio": 1,
                "taskRelation": "cargo-from-expected",
                "cargoCategory": "transported-vehicles",
                "countRequired": False,
                "rejectCargoCategories": ["packaged-food"],
                "trailerTypeResponseRequired": False,
            },
        },
        "hotshot-enclosed": {
            "visibleContextEn": "Training manifest: a passenger vehicle. Trailer context: enclosed car hauler.",
            "visibleContextRu": "Учебный манифест: легковой автомобиль. Контекст прицепа: закрытый автовоз.",
            "trailerType": "enclosed-car-hauler",
            "model": "I am hauling a passenger vehicle.",
            "slots": [{
                "name": "commodity", "type": "cargo-description", "display": "a passenger vehicle", "spoken": "a passenger vehicle",
                "accepted": ["a passenger vehicle", "passenger vehicle", "one vehicle", "a car", "one car", "car", "automobile"],
                "category": "transported-vehicles",
                "rejectedCategories": ["packaged-food"],
            }],
            "rubric": {
                "minTokens": 3,
                "requiredGroups": [
                    ["hauling", "carrying", "haul", "carry", "transport", "transporting"],
                    ["passenger vehicle", "vehicle", "car", "automobile"],
                ],
                "requiredRatio": 1,
                "taskRelation": "cargo-from-expected",
                "cargoCategory": "transported-vehicles",
                "rejectCargoCategories": ["packaged-food"],
                "trailerTypeResponseRequired": False,
            },
        },
    },
}


def _critical_concept_groups(model_answer):
    stop_words = {
        "a", "an", "and", "are", "at", "be", "for", "from", "here", "i", "in", "is", "it", "me",
        "my", "of", "on", "please", "that", "the", "this", "to", "understood", "will", "yes", "you",
    }
    tokens = re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)?", model_answer.casefold())
    concepts = []
    for token in tokens:
        if token in stop_words or len(token) < 2 or token in concepts:
            continue
        concepts.append(token)
    return [[token] for token in concepts[:6]] or [["understood"]]


OUTCOME_NATURAL_EQUIVALENTS = {
    "activated": ["switched", "turned"],
    "assigned": ["designated", "given"],
    "axle-weight": ["axleweight", "overweight"],
    "before": ["prior", "beforehand"],
    "cargo": ["load", "freight"],
    "carrier": ["company", "employer"],
    "checks": ["inspections", "tests"],
    "contacted": ["called", "notified"],
    "correct": ["right", "assigned"],
    "current": ["active", "latest", "today's"],
    "devices": ["triangles", "markers"],
    "documents": ["paperwork", "records"],
    "driver": ["operator", "i"],
    "delay-update": ["update", "revised"],
    "emergency-equipment": ["equipment", "triangles"],
    "engine": ["motor"],
    "entered": ["pulled into", "drove into"],
    "facts": ["details", "information"],
    "found": ["located"],
    "follow-up": ["followup", "next"],
    "hazards": ["flashers", "signals"],
    "identified": ["found", "located", "verified"],
    "immediately": ["promptly", "right"],
    "information": ["details"],
    "inspection": ["check", "examination"],
    "inspector": ["officer", "official"],
    "instructions": ["directions", "orders"],
    "lane": ["traffic lane"],
    "malfunction": ["failure", "problem"],
    "load-distribution": ["redistribution", "rework"],
    "mismatch": ["discrepancy", "conflict"],
    "move": ["drive", "operate"],
    "not": ["never", "no"],
    "notice": ["notification", "notified"],
    "off": ["shut", "turned", "stopped"],
    "out": ["oos"],
    "paperwork": ["documents", "records"],
    "placed": ["deployed", "positioned"],
    "plan": ["procedure", "steps", "actions"],
    "ready": ["available", "prepared"],
    "received": ["got", "given", "provided"],
    "reconstructed": ["recreated", "rebuilt", "paper"],
    "records": ["logs", "paperwork"],
    "remained": ["stayed", "kept"],
    "remains": ["stays", "stayed"],
    "repair": ["fix", "maintenance"],
    "reported": ["communicated", "called in"],
    "requested": ["required", "asked for"],
    "road": ["roadway"],
    "roadway-hazard": ["hazard", "hazards", "blocked"],
    "safe": ["safely"],
    "safely": ["safe"],
    "secured": ["restrained", "tied down"],
    "sequence": ["procedure", "steps"],
    "service": ["oos"],
    "set": ["engaged", "applied"],
    "signed": ["signature"],
    "stopped": ["pulled", "stationary"],
    "trailer-door": ["door", "doors"],
    "trip": ["run"],
    "type": ["layout", "configuration"],
    "unloading": ["unloaded", "discharge"],
    "updated": ["new", "revised"],
    "vehicle": ["truck", "unit", "combination", "automobile"],
    "verified": ["checked", "matched"],
    "waited": ["stayed", "remained"],
    "weights": ["readings", "values"],
}


def _outcome_semantic_content(model_answer):
    """Return every observable content token with curated natural alternatives."""
    stop_words = {
        "a", "an", "and", "are", "at", "be", "been", "both", "by", "each", "every",
        "for", "from", "here", "i", "in", "is", "it", "its", "my", "of", "on", "or",
        "that", "the", "this", "to", "was", "were", "will", "with", "you",
        "complete", "completed", "completion", "confirm", "confirmed", "documented",
        "outcome", "result", "task", "workplace",
    }
    tokens = re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)?", model_answer.casefold())
    concepts = []
    for token in tokens:
        if token in stop_words or len(token) < 2 or token in concepts:
            continue
        concepts.append(token)
    if not concepts:
        return [{"canonical": "safe", "accepted": ["safe", "ready", "resolved"]}]
    rows = [
        {
            "canonical": token,
            "accepted": list(dict.fromkeys([token, *OUTCOME_NATURAL_EQUIVALENTS.get(token, [])])),
        }
        for token in concepts
    ]
    contextual_overrides = {}
    if model_answer == SITUATION_WORKPLACE_OUTCOMES_EN[0]:
        contextual_overrides["stopped"] = ["vehicle stopped", "truck pulled over", "unit stationary"]
    if model_answer == SITUATION_WORKPLACE_OUTCOMES_EN[4]:
        contextual_overrides["current"] = ["current duty status", "current records", "today's duty status"]
    for row in rows:
        if row["canonical"] in contextual_overrides:
            row["accepted"] = contextual_overrides[row["canonical"]]
            row["contextRequired"] = True
    return rows


def _outcome_concept_groups(model_answer):
    return [row["accepted"] for row in _outcome_semantic_content(model_answer)]


def _materialize_situation_dialogue(dialogue, primary, transfer, primary_ru, transfer_ru, index):
    result = []
    for line in dialogue:
        english = re.sub(re.escape(primary), transfer, line["english"], flags=re.IGNORECASE)
        translation = re.sub(re.escape(primary_ru), transfer_ru, line["translation"], flags=re.IGNORECASE)
        if index == 9:
            english = re.sub(r"\bthe right lane is closed ahead\b", "The left lane is closed ahead", english, flags=re.IGNORECASE)
            english = english.replace("merge left when it is safe", "merge right when it is safe")
            translation = re.sub(r"\bПравая полоса впереди закрыта\b", "Левая полоса впереди закрыта", translation, flags=re.IGNORECASE)
            translation = translation.replace("перестроиться влево", "перестроиться вправо")
        if index == 16:
            english = english.replace(
                "Within ten minutes, I will place the warning devices 10, 100 and 200 feet toward approaching traffic on this divided road.",
                "Within ten minutes, I will place the near warning devices and put the far device 100 feet to 500 feet toward the blind curve so approaching traffic is warned.",
            )
            translation = translation.replace(
                "В течение десяти минут на этой разделенной дороге я выставлю устройства на расстоянии 10, 100 и 200 футов в сторону приближающегося транспорта.",
                "В течение десяти минут я выставлю ближние устройства, а дальнее размещу на расстоянии от 100 до 500 футов в сторону закрытого поворота, чтобы заранее предупредить приближающийся транспорт.",
            )
        result.append({**line, "english": english, "translation": translation})
    payload = json.dumps(result, ensure_ascii=False).casefold()
    if transfer.casefold() not in payload:
        raise ValueError(f"Situation transfer value is unused: {index}")
    if primary.casefold() in payload:
        raise ValueError(f"Situation transfer retained its primary value: {index}")
    if primary_ru.casefold() in payload or transfer_ru.casefold() not in payload:
        raise ValueError(f"Situation bilingual transfer value is inconsistent: {index}")
    return result


def build_situation_practice(index, dialogue, goal, additional_variant_specs=None):
    name, slot_type, primary, transfer = SITUATION_VARIABLE_SPECS[index - 1]
    primary_ru, transfer_ru = SITUATION_VARIABLE_VALUES_RU[index - 1]
    transfer_dialogue = _materialize_situation_dialogue(dialogue, primary, transfer, primary_ru, transfer_ru, index)
    slot_specs = [{
        "name": name, "type": slot_type, "primary": primary, "transfer": transfer,
        "primaryRu": primary_ru, "transferRu": transfer_ru,
    }]
    for extra in additional_variant_specs or []:
        slot_specs.append(dict(extra))
        materialized = []
        for line in transfer_dialogue:
            materialized.append({
                **line,
                "english": re.sub(re.escape(extra["primary"]), extra["transfer"], line["english"], flags=re.IGNORECASE),
                "translation": re.sub(re.escape(extra["primaryRu"]), extra["transferRu"], line["translation"], flags=re.IGNORECASE),
            })
        payload = json.dumps(materialized, ensure_ascii=False).casefold()
        if extra["primary"].casefold() in payload or extra["transfer"].casefold() not in payload:
            raise ValueError(f"Situation extra transfer value is inconsistent: {index} {extra['name']}")
        if extra["primaryRu"].casefold() in payload or extra["transferRu"].casefold() not in payload:
            raise ValueError(f"Situation extra bilingual transfer is inconsistent: {index} {extra['name']}")
        transfer_dialogue = materialized
    fact_labels = {
        "appointment": "The appointment is", "date": "The date is", "defect": "The reported condition is",
        "document": "The requested document is", "document-set": "The requested document set is",
        "duty-status": "The duty status is", "equipment-action": "The requested equipment action is",
        "equipment-clearance": "The clearance check is for", "equipment-identifier": "The equipment identifier is",
        "equipment-state": "The equipment condition is", "identifier-and-vehicle": "The vehicle reference is",
        "identifier-digits": "The reference number is", "location": "The assigned location is",
        "operation": "The operation is", "organization": "The organization is", "pressure": "The reported pressure is", "securement": "The securement method is",
        "sign-legend": "The sign message is", "time": "The time is", "duration-minutes": "The remaining time is",
        "weight-cardinal": "The recorded value is", "lexical-request": "The requested wording is",
        "cargo-discrepancy": "The reported discrepancy is", "cargo-description": "The cargo is",
    }

    def complete_driver_answer(materialized_dialogue, value_key):
        model = next(line["english"] for line in materialized_dialogue if line["speaker"].casefold() == "driver")
        for spec in slot_specs:
            value = spec[value_key]
            if value.casefold() in model.casefold():
                continue
            punctuation = "" if value.rstrip().endswith((".", "?", "!")) else "."
            model = f"{model} {fact_labels[spec['type']]} {value}{punctuation}"
        return model

    primary_prompt = next(line["english"] for line in dialogue if line["speaker"].casefold() != "driver")
    transfer_prompt = next(line["english"] for line in transfer_dialogue if line["speaker"].casefold() != "driver")
    primary_model = complete_driver_answer(dialogue, "primary")
    transfer_model = complete_driver_answer(transfer_dialogue, "transfer")
    primary_slots = [{
        "name": spec["name"], "type": spec["type"], "display": spec["primary"],
        "spoken": spec["primary"], "displayRu": spec["primaryRu"],
    } for spec in slot_specs]
    transfer_slots = [{
        "name": spec["name"], "type": spec["type"], "display": spec["transfer"],
        "spoken": spec["transfer"], "displayRu": spec["transferRu"],
    } for spec in slot_specs]
    variants = [
        {"id": "primary", "prompt": primary_prompt, "modelAnswer": primary_model, "dialogue": dialogue, "slotValues": primary_slots},
        {"id": "transfer", "prompt": transfer_prompt, "modelAnswer": transfer_model, "dialogue": transfer_dialogue, "slotValues": transfer_slots},
    ]

    def variant_driver_turns(variant):
        turns = []
        for line_index, line in enumerate(variant["dialogue"]):
            if line["speaker"].casefold() != "driver":
                continue
            prompt_line = variant["dialogue"][line_index - 1] if line_index else variant["dialogue"][min(1, len(variant["dialogue"]) - 1)]
            prompt_role = prompt_line["voicePreset"]
            prompt_sources = dict(sorted(LOCAL_AUDIO_LOOKUP.get(f"{prompt_role}\0{prompt_line['english']}", {}).items()))
            relevant_slots = [
                slot for slot in variant["slotValues"]
                if str(slot["display"]).casefold() in line["english"].casefold()
            ]
            turn_id = f"turn-{len(turns) + 1}"
            rubric = {
                "requiredConceptGroups": _critical_concept_groups(line["english"]),
                "rejectPromptEcho": True,
                "rejectAffirmationOnly": True,
                "rejectContradiction": True,
                "rejectRefusal": True,
                "minimumEnglishWords": 3,
            }
            turns.append({
                "id": turn_id,
                "prompt": prompt_line["english"],
                "promptRole": prompt_role,
                "promptAudio": {
                    "eligible": bool(prompt_sources),
                    "qualificationPolicy": "exact-local-file-only",
                    "sources": prompt_sources,
                    "exclusionReason": None if prompt_sources else "no-exact-local-file",
                },
                "modelAnswer": line["english"],
                "requiredAssertions": [clause.strip() for clause in re.split(r"[.;]", line["english"]) if clause.strip()],
                "semanticRubric": rubric,
                "slotValues": relevant_slots,
                "relevantSlotNames": [slot["name"] for slot in relevant_slots],
            })
        return turns

    for variant in variants:
        variant["criticalTurns"] = variant_driver_turns(variant)
        for slot in variant["slotValues"]:
            slot["turnIds"] = [
                turn["id"] for turn in variant["criticalTurns"]
                if slot["name"] in turn["relevantSlotNames"]
            ]
    if index == 16:
        breakdown_branch_contracts = {
            "primary": {
                "branchId": "divided-or-one-way",
                "requiredGroups": [
                    ["hazard", "flashers"], ["immediately"], ["within"], ["ten", "10"], ["minutes"],
                    ["place", "warning", "devices"], ["10", "ten"], ["100", "hundred"],
                    ["200", "two hundred"], ["divided"],
                ],
                "requiredDistanceValuesFeet": [10, 100, 200],
                "distanceMode": "exact-set",
                "requiredBranchCues": ["divided road", "one-way road"],
                "forbiddenBranchCues": ["blind curve", "hill", "ordinary road"],
                "slots": [
                    {"name": "warning-deadline", "type": "duration-minutes", "display": "10 minutes", "spoken": "ten minutes"},
                    {"name": "warning-placement", "type": "distance-placement-sequence", "display": "10, 100 and 200 feet", "spoken": "ten, one hundred and two hundred feet"},
                    {"name": "road-branch", "type": "statement", "display": "this divided road", "spoken": "this divided road"},
                ],
            },
            "transfer": {
                "branchId": "hill-or-curve",
                "requiredGroups": [
                    ["hazard", "flashers"], ["immediately"], ["within"], ["ten", "10"], ["minutes"],
                    ["place", "warning", "devices"], ["100", "hundred"], ["500", "five hundred"],
                    ["blind", "hill"], ["curve"],
                ],
                "requiredDistanceValuesFeet": [100, 500],
                "distanceMode": "range-endpoints",
                "requiredBranchCues": ["blind curve", "hill"],
                "forbiddenBranchCues": ["divided road", "one-way road", "ordinary road", "10, 100 and 200 feet"],
                "slots": [
                    {"name": "warning-deadline", "type": "duration-minutes", "display": "10 minutes", "spoken": "ten minutes"},
                    {"name": "warning-placement", "type": "distance-placement-range", "display": "100 feet to 500 feet", "spoken": "one hundred feet to five hundred feet"},
                    {"name": "road-branch", "type": "statement", "display": "blind curve", "spoken": "blind curve"},
                ],
            },
        }
        for variant in variants:
            branch = breakdown_branch_contracts[variant["id"]]
            safety_turn = variant["criticalTurns"][1]
            branch_slots = [{**slot, "turnIds": [safety_turn["id"]]} for slot in branch["slots"]]
            safety_turn["slotValues"] = branch_slots
            safety_turn["relevantSlotNames"] = [slot["name"] for slot in branch_slots]
            safety_turn["requiredAssertions"] = [
                "Activate the hazard warning flashers immediately.",
                "Place the warning devices within ten minutes.",
                f"Use the {branch['branchId']} placement for the current road.",
            ]
            safety_turn["semanticRubric"] = {
                **safety_turn["semanticRubric"],
                "requiredConceptGroups": branch["requiredGroups"],
                "requiredRatio": 1,
                "safetyCritical": True,
                "missingPlacementFails": True,
                "branchConflictPolicy": {
                    "exclusiveBranchId": branch["branchId"],
                    "requiredDistanceValuesFeet": branch["requiredDistanceValuesFeet"],
                    "distanceMode": branch["distanceMode"],
                    "rejectUnexpectedDistanceValues": True,
                    "requiredBranchCues": branch["requiredBranchCues"],
                    "forbiddenBranchCues": branch["forbiddenBranchCues"],
                },
            }
    critical_turns = []
    primary_turns = variants[0]["criticalTurns"]
    transfer_turns = variants[1]["criticalTurns"]
    if len(primary_turns) != len(transfer_turns):
        raise ValueError(f"Situation {index} variant driver-turn counts differ")
    for primary_turn, transfer_turn in zip(primary_turns, transfer_turns):
        turn_id = primary_turn["id"]
        critical_turns.append({
            "id": turn_id,
            "prompt": primary_turn["prompt"],
            "modelAnswer": primary_turn["modelAnswer"],
            "required": True,
            "typedOutcomeRequired": True,
            "preRevealRequired": True,
            "requiredAssertions": primary_turn["requiredAssertions"],
            "semanticRubric": primary_turn["semanticRubric"],
            "relevantSlotNames": primary_turn["relevantSlotNames"],
            "variantTurns": {
                "primary": primary_turn,
                "transfer": transfer_turn,
            },
        })
    if len(critical_turns) < 2:
        raise ValueError(f"Situation {index} must contain at least two critical driver turns")
    semantic_corpus = []
    for variant in variants:
        for turn in variant["criticalTurns"]:
            semantic_corpus.append({
                "id": f"{variant['id']}:{turn['id']}",
                "variantId": variant["id"],
                "turnId": turn["id"],
                "informationGap": turn["prompt"],
                "expected": turn["modelAnswer"],
                "typedSlots": turn["slotValues"],
                "responseRubric": {
                    **turn["semanticRubric"],
                    "minTokens": turn["semanticRubric"]["minimumEnglishWords"],
                    "requiredGroups": turn["semanticRubric"]["requiredConceptGroups"],
                    "requiredRatio": 1,
                },
            })
    primary_answer = primary_model
    outcome_prompt_en = "Summarize the completed workplace result and include every fact from the current scenario."
    outcome_prompt_ru = "Подведите итог рабочего сценария и назовите каждый факт текущего варианта."
    outcome_rows = {}
    for variant in variants:
        base_outcome_model = SITUATION_WORKPLACE_OUTCOMES_EN[index - 1]
        outcome_model = base_outcome_model
        for slot in variant["slotValues"]:
            value = str(slot["display"])
            if value.casefold() in outcome_model.casefold():
                continue
            punctuation = "" if value.rstrip().endswith((".", "?", "!")) else "."
            outcome_model = f"{outcome_model} {fact_labels[slot['type']]} {value}{punctuation}"
        outcome_slots = [
            {**slot, "requiredInOutcome": True}
            for slot in variant["slotValues"]
        ]
        outcome_rows[variant["id"]] = {
            "modelAnswer": outcome_model,
            "canonicalNaturalAnswer": outcome_model,
            "baseFactualOutcome": base_outcome_model,
            "semanticContent": _outcome_semantic_content(base_outcome_model),
            "slotValues": outcome_slots,
            "responseRubric": {
                "minTokens": 5,
                "requiredGroups": _outcome_concept_groups(SITUATION_WORKPLACE_OUTCOMES_EN[index - 1]),
                "requiredRatio": 1,
                "requiredSlotNames": [slot["name"] for slot in variant["slotValues"]],
                "rejectExactCriticalTurnReplay": True,
            },
        }
    eligible_turn_refs = []
    excluded_turn_refs = []
    for variant in variants:
        for turn in variant["criticalTurns"]:
            turn_ref = f"{variant['id']}:{turn['id']}"
            (eligible_turn_refs if turn["promptAudio"]["eligible"] else excluded_turn_refs).append(turn_ref)
    correct_id = f"situation-{index:02d}-correct"
    unsafe_text, near_miss_text = SITUATION_CHOICE_DISTRACTORS_RU[index - 1]
    options = [
        {"id": correct_id, "text": goal, "result": "success", "safe": True},
        {
            "id": f"situation-{index:02d}-unsafe", "text": unsafe_text,
            "result": "unsafe-failure", "safe": False, "distractorType": "unsafe-action",
        },
        {
            "id": f"situation-{index:02d}-near-miss", "text": near_miss_text,
            "result": "irrelevant", "safe": False, "distractorType": "critical-step-omission",
        },
    ]
    shift = index % len(options)
    options = options[shift:] + options[:shift]
    contract = {
        "variants": variants,
        "informationGap": {
            "factSlot": name,
            "instructionRu": "Используйте значение текущего варианта и не открывайте модель до ответа.",
        },
        "criticalTurns": critical_turns,
        "semanticCorpus": semantic_corpus,
        "typedDriverTurn": {
            "required": True,
            "preRevealRequired": True,
            "prompt": primary_prompt,
            "modelAnswer": primary_answer,
            "semanticRubric": {**critical_turns[0]["semanticRubric"], "requiredVariantSlot": name},
        },
        "observableSuccessConditionRu": goal,
        "workplaceOutcome": {
            "required": True,
            "typed": True,
            "promptEn": outcome_prompt_en,
            "promptRu": outcome_prompt_ru,
            "descriptionRu": goal,
            "modelAnswer": outcome_rows["primary"]["modelAnswer"],
            "expectedByVariant": outcome_rows,
            "semanticRubric": {
                "evaluateAgainst": "current-variant-workplace-outcome",
                "rejectExactCriticalTurnReplay": True,
                "rejectContradiction": True,
                "rejectRefusal": True,
                "minimumEnglishWords": 5,
            },
            "allCriticalTurnsRequired": True,
            "safetyCritical": index in SITUATION_SAFETY_CRITICAL_INDEXES,
        },
        "listeningBlueprint": {
            "qualificationAudioPolicy": "exact-local-file-only",
            "webSpeechQualifying": False,
            "excludeUnsupportedFromSelector": True,
            "eligibleTurnRefs": eligible_turn_refs,
            "excludedTurnRefs": excluded_turn_refs,
        },
        "completionBlueprint": {
            "requiredCriticalTurnIds": [turn["id"] for turn in critical_turns],
            "requiredSemanticCorpusIds": [row["id"] for row in semantic_corpus],
            "requireDifferentVariantForConfirmation": True,
            "requireSafeChoice": True,
            "requireTypedWorkplaceOutcome": True,
            "failIfAnyCriticalTurnMissing": True,
        },
        "failureBranch": {
            "result": "retry-required",
            "feedbackRu": "Ответ не передает обязательный рабочий факт или действие. Повторите слепую попытку с новым значением.",
            "drill": "typed-semantic-retrieval",
        },
        "transferVariant": {"variantId": "transfer", "availableAfter": "corrected-retrieval"},
        "choiceCheck": {
            "options": options,
            "correctOptionId": correct_id,
            "shufflePolicy": "seeded-per-attempt",
            "shuffleSeed": f"situation-{index:02d}",
        },
        "safetyDecision": {
            "randomizeOptions": True,
            "unsafeOptionId": f"situation-{index:02d}-unsafe",
            "nearMissOptionId": f"situation-{index:02d}-near-miss",
            "unsafeResult": "attempt-failed",
            "missingSafetyStepResult": "attempt-failed",
        },
        "branchingPractice": True,
    }
    if index == 16:
        contract["breakdownPlacementTask"] = {
            "required": True,
            "randomizeScenario": True,
            "qualificationRequired": True,
            "currentScenarioByPracticeVariant": {
                "primary": "divided-or-one-way",
                "transfer": "hill-or-curve",
            },
            "scenarioVariants": [dict(row) for row in BREAKDOWN_WARNING_PROGRAM["placementVariants"]],
            "requiredSequence": [dict(row) for row in BREAKDOWN_WARNING_PROGRAM["sequence"]],
            "missingSequenceOrPlacementFails": True,
            "sourceRef": BREAKDOWN_WARNING_PROGRAM["sourceRefs"][0],
        }
    return contract


def build_base_situations(rows):
    result = []
    for index, situation in enumerate(rows, 1):
        legacy_id = f"situation-{index:02d}"
        dialogue = [
            enrich_dialogue_line({
                "speaker": speaker,
                "english": english,
                "translation": natural_translation(english, translation),
            })
            for speaker, english, translation in DIALOGUES[index - 1]
        ]
        goal = SITUATION_GOALS_RU[index - 1]
        practice_contract = build_situation_practice(index, dialogue, goal)
        profile_materializations = None
        if index == 3:
            profile_materializations = {}
            for profile, cargo in ELP_SITUATION_CARGO_BY_PROFILE.items():
                profile_dialogue = []
                for line in dialogue:
                    profile_dialogue.append({
                        **line,
                        "english": line["english"].replace("22 pallets of packaged food", cargo["primary"]),
                        "translation": line["translation"].replace("22 палеты упакованных продуктов", cargo["primaryRu"]),
                    })
                cargo_spec = {
                    "name": "commodity", "type": "cargo-description",
                    "primary": cargo["primary"], "transfer": cargo["transfer"],
                    "primaryRu": cargo["primaryRu"], "transferRu": cargo["transferRu"],
                }
                profile_materializations[profile] = {
                    "dialogue": profile_dialogue,
                    "practiceContract": build_situation_practice(index, profile_dialogue, goal, [cargo_spec]),
                }
            dialogue = profile_materializations["tractor"]["dialogue"]
            practice_contract = profile_materializations["tractor"]["practiceContract"]
        elif index == 16:
            profile_materializations = {}
            unit_values = {
                "tractor": ("T-204", "T-318"),
                "hotshot-open": ("P-204", "P-318"),
                "hotshot-enclosed": ("P-204", "P-318"),
            }
            for profile, (primary_unit, transfer_unit) in unit_values.items():
                profile_dialogue = [{
                    **line,
                    "english": line["english"].replace("T-204", primary_unit),
                    "translation": line["translation"].replace("T-204", primary_unit),
                } for line in dialogue]
                unit_spec = {
                    "name": "unit-id", "type": "equipment-identifier",
                    "primary": primary_unit, "transfer": transfer_unit,
                    "primaryRu": primary_unit, "transferRu": transfer_unit,
                }
                profile_materializations[profile] = {
                    "dialogue": profile_dialogue,
                    "practiceContract": build_situation_practice(index, profile_dialogue, goal, [unit_spec]),
                }
            dialogue = profile_materializations["tractor"]["dialogue"]
            practice_contract = profile_materializations["tractor"]["practiceContract"]
        record = {
            **situation,
            "id": stable_id("situation", situation["title"]),
            "legacyId": legacy_id,
            "audioSourceId": legacy_id,
            "titleRu": SITUATION_TITLES_RU[index - 1],
            "goal": goal,
            "dialogue": dialogue,
            "profiles": base_situation_profiles(index),
            "conditions": base_situation_conditions(index),
            "audioProfile": situation_audio_profile(index, situation["mechanic"]),
            "practiceContract": practice_contract,
        }
        if profile_materializations:
            record["profileMaterializations"] = profile_materializations
        result.append(record)
    return result


OPEN_ONLY_HOTSHOT_UNITS = {"h:open-car-hauler", "h:deck", "h:drive-over-fender", "h:rub-rail", "h:stake-pocket"}
ENCLOSED_ONLY_HOTSHOT_UNITS = {"h:enclosed-car-trailer"}
CARGO_SECUREMENT_ENCLOSED_UNIT_IDS = {"h:e-track", "h:soft-loop", "h:wheel-chock"}


def hotshot_unit_profiles(item):
    if item.get("profiles"):
        return item["profiles"]
    if item["id"] in OPEN_ONLY_HOTSHOT_UNITS:
        return ["hotshot-open"]
    if item["id"] in ENCLOSED_ONLY_HOTSHOT_UNITS:
        return ["hotshot-enclosed"]
    if item["theme"].startswith("H6."):
        return ["hotshot-enclosed"]
    return HOTSHOT_PROFILES


def hotshot_unit_conditions(item):
    conditions = list(item.get("conditions", []))
    if item["theme"].startswith("H4."):
        conditions.append("cargo-securement")
    if item["theme"].startswith("H6."):
        conditions.append("enclosed-trailer")
    if item["id"] in CARGO_SECUREMENT_ENCLOSED_UNIT_IDS:
        conditions.append("cargo-securement")
    return list(dict.fromkeys(conditions))


def build_hotshot_units(module):
    result = []
    for item in module["units"]:
        translation = natural_translation(item["word"], item["translation"])
        computed_pronunciation = pronounce_ru(item["word"])
        record = {
            **item,
            "translation": translation,
            "translationRu": translation,
            "pron": item.get("pronRu") or computed_pronunciation,
            "pronRu": item.get("pronRu") or computed_pronunciation,
            "source": "hotshot-module",
            "sourceRef": item["id"],
            "profiles": hotshot_unit_profiles(item),
            "conditions": hotshot_unit_conditions(item),
            "wordRole": item.get("wordRole", "driver"),
            "exampleRole": item.get("exampleRole", "driver"),
        }
        if item["theme"].startswith("H4."):
            record.update({
                "securementBranchIds": ["vehicle-at-most-10000-lb", "vehicle-over-10000-lb"],
                "sourceRefs": [
                    "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-393/subpart-I/section-393.128",
                    "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-393/subpart-I/section-393.130",
                ],
            })
        if item["theme"].startswith("H6."):
            record["sourceRefs"] = [
                "https://www.fmcsa.dot.gov/safety/do-rules-protection-against-shifting-or-falling-cargo-apply-cmvs-enclosed-cargo-areas"
            ]
        result.append(record)
    if len(result) != 100 or len({item["id"] for item in result}) != 100:
        raise ValueError("Hotshot unit count or ids are invalid")
    return result


def hotshot_profiles_for_legacy_id(legacy_id):
    if legacy_id in {"hotshot-situation-04"}:
        return ["hotshot-open"]
    if legacy_id in {"hotshot-situation-07", "hotshot-situation-08"}:
        return ["hotshot-enclosed"]
    return HOTSHOT_PROFILES


def build_hotshot_situations(module):
    result = []
    for offset, item in enumerate(module["situations"], 33):
        legacy_id = item["id"]
        profiles = item.get("profiles") or hotshot_profiles_for_legacy_id(legacy_id)
        conditions = list(item.get("conditions", ["vehicle-transport"]))
        if legacy_id in {"hotshot-situation-04", "hotshot-situation-08"}:
            conditions.append("cargo-securement")
        dialogue = [
            enrich_dialogue_line({**line, "translation": natural_translation(line["english"], line["translation"])})
            for line in item["dialogue"]
        ]
        goal = SITUATION_GOALS_RU[offset - 1]
        result.append({
            **item,
            "id": stable_id("situation", item["title"]),
            "legacyId": legacy_id,
            "audioSourceId": legacy_id,
            "titleRu": SITUATION_TITLES_RU[offset - 1],
            "goal": goal,
            "dialogue": dialogue,
            "profiles": profiles,
            "conditions": list(dict.fromkeys(conditions)),
            "audioProfile": item.get("audioProfile") or situation_audio_profile(33, item["mechanic"]),
            "practiceContract": build_situation_practice(offset, dialogue, goal),
        })
    return result


def build_hotshot_documents(module):
    result = []
    for item in module["documents"]:
        legacy_id = item["id"]
        explicit_conditions = {
            "hotshot-doc-01": ["cdl-required"],
            "hotshot-doc-02": ["vehicle-transport"],
            "hotshot-doc-03": ["vehicle-transport"],
            "hotshot-doc-04": ["vehicle-transport", "delivery"],
        }
        conditions = list(explicit_conditions[legacy_id])
        if item["status"] == "trip-specific" and "trip-specific" not in conditions:
            conditions.append("trip-specific")
        sample_lines = (EDITION / "document-samples" / item["file"]).read_text(encoding="utf-8").splitlines()
        instructions, notes, inline_source_refs = parse_document_narrative(sample_lines)
        record = {
            **item,
            "id": stable_id("document", item["title"]),
            "legacyId": legacy_id,
            "audioSourceId": legacy_id,
            "profiles": item.get("profiles", HOTSHOT_PROFILES),
            "conditions": conditions,
            "instructions": instructions,
            "notes": notes,
            "verifiedOn": "2026-08-21",
            "sourceRefs": list(dict.fromkeys(item.get("sourceRefs", []) + inline_source_refs)),
            "federallyRequiredOnboard": False,
            "effectiveDateContext": "Operational training record. Applicability depends on the trip, customer and jurisdiction; it is not presented as a universal federal onboard document.",
            "applicabilityRu": "Учебный операционный документ. Применимость зависит от профиля, конкретного рейса, клиента и юрисдикции.",
            "dateContextRu": "Проверяйте дату и условия фактического рейса. Образец не является действительным документом.",
            "safeActionRu": "Сверьте VIN, номер записи, состояние машины и подписи по видимому документу.",
        }
        result.append(attach_document_assessment(record))
    return result


BASE_LESSON_PROFILES = {index: ALL_PROFILES for index in range(1, 17)}
BASE_LESSON_PROFILES[13] = ["tractor"]
BASE_LESSON_CONDITIONS = {13: ["air-brakes"]}


def base_lesson_profiles(index):
    return list(BASE_LESSON_PROFILES[index])


def lesson_assessment_blueprint(phrases, meanings_ru, goal, interaction_spec):
    phrase_ids = [f"phrase-{index}" for index in range(1, len(phrases) + 1)]
    if len(phrases) != len(meanings_ru):
        raise ValueError("Lesson phrase and Russian meaning counts differ")
    prompt_en, prompt_ru, required_indexes = interaction_spec
    required_response_ids = [f"phrase-{index}" for index in required_indexes]
    if not set(required_response_ids).issubset(phrase_ids):
        raise ValueError("Lesson interaction response key references an unknown phrase")
    return {
        "constructs": ["reception", "typed-production", "workplace-interaction"],
        "reception": {
            "requiredPhraseIds": phrase_ids,
            "localAudioExposureRequired": True,
            "answerHiddenDuringAudio": True,
            "typedMeaningCheckRequired": True,
            "meaningKeyByPhraseId": dict(zip(phrase_ids, meanings_ru)),
        },
        "production": {
            "requiredPhraseIds": phrase_ids,
            "preRevealTypedResponseRequired": True,
            "allPhrasesAssessed": True,
        },
        "interaction": {
            "required": True,
            "typedWorkplaceOutcomeRequired": True,
            "promptAndResponseBothAssessed": True,
            "promptEn": prompt_en,
            "promptRu": prompt_ru,
            "requiredResponsePhraseIds": required_response_ids,
            "responseKeySource": "materialized-lesson-phrases",
            "semanticRubric": {
                "goalRu": goal,
                "evaluateAgainst": "materialized-required-response-phrases",
                "requiredResponseCoverage": 1,
                "minimumEnglishWords": 3,
                "rejectPromptEcho": True,
                "rejectAffirmationOnly": True,
                "rejectContradiction": True,
                "rejectRefusal": True,
            },
        },
        "completion": {
            "requiredSpacedConstructVariants": ["reception-only", "production-interaction"],
            "minimumHoursBetweenConstructs": 24,
            "sameAttemptMayQualifyBothConstructVariants": False,
            "requirementsApplyAcrossSpacedConstructVariants": True,
            "constructVariantContracts": {
                "reception-only": {
                    "requiredSubcontracts": ["reception"],
                    "mustBeFirst": True,
                    "localAudioRequired": True,
                    "priorRussianProductionCueAllowed": False,
                    "productionOrInteractionRequired": False,
                },
                "production-interaction": {
                    "requiredSubcontracts": ["production", "interaction"],
                    "requiresPriorVariant": "reception-only",
                    "localAudioAllowed": False,
                    "minimumHoursAfterPriorVariant": 24,
                },
            },
            "allReceptionTasksRequired": True,
            "allProductionTasksRequired": True,
            "interactionRequired": True,
            "modelRevealMakesAttemptIneligible": True,
        },
    }


def profile_lesson_interaction_materializations(index, lesson):
    base_interaction = lesson["assessmentBlueprint"]["interaction"]
    result = {}
    for profile, phrases in lesson.get("profilePhrases", {}).items():
        prompt_en, prompt_ru, required_indexes = PROFILE_LESSON_INTERACTION_OVERRIDES.get(index, {}).get(
            profile,
            LESSON_INTERACTION_BLUEPRINTS[index - 1],
        )
        required_ids = [f"phrase-{position}" for position in required_indexes]
        available_ids = {f"phrase-{position}" for position in range(1, len(phrases) + 1)}
        if not set(required_ids).issubset(available_ids):
            raise ValueError(f"Profile lesson interaction references an unknown phrase: lesson {index}, {profile}")
        result[profile] = {
            **base_interaction,
            "promptEn": prompt_en,
            "promptRu": prompt_ru,
            "requiredResponsePhraseIds": required_ids,
            "responseKeySource": "materialized-profile-lesson-phrases",
            "profile": profile,
            "semanticRubric": {
                **base_interaction["semanticRubric"],
                "evaluateAgainst": "materialized-profile-required-response-phrases",
            },
        }
    return result


def securement_lesson_materializations():
    question_rows = securement_question_materializations()
    statements = {
        "transported-automobile-or-light-truck-at-most-10000-lb": {
            "referenceStatementsEn": [
                "The visible training vehicle weighs 8,600 pounds.",
                "Under 49 CFR 393.128, restrain it at the front and rear with a minimum of two tiedowns.",
                "A wheel tiedown must restrain lateral, longitudinal and vertical movement.",
            ],
            "referenceStatementsRu": [
                "Видимый учебный автомобиль весит 8 600 фунтов.",
                "По 49 CFR 393.128 удерживайте его спереди и сзади минимум двумя средствами крепления.",
                "Крепление за колесо должно препятствовать поперечному, продольному и вертикальному перемещению.",
            ],
        },
        "transported-automobile-or-light-truck-over-10000-lb": {
            "referenceStatementsEn": [
                "The visible training vehicle weighs 12,400 pounds.",
                "Under 49 CFR 393.130, use a minimum of four tiedowns near the front and rear or at designed mounting points.",
                "Lower and secure accessory equipment and prevent articulation when applicable.",
            ],
            "referenceStatementsRu": [
                "Видимая учебная машина весит 12 400 фунтов.",
                "По 49 CFR 393.130 используйте минимум четыре средства крепления у передней и задней части либо в предназначенных точках.",
                "Опустите и закрепите навесное оборудование и при необходимости исключите складывание сочлененной машины.",
            ],
        },
    }
    result = {}
    for condition_id, question in question_rows.items():
        result[condition_id] = {
            "conditionId": condition_id,
            "branchId": question["branchId"],
            "profiles": list(HOTSHOT_PROFILES),
            "conditions": list(question["conditions"]),
            "visibleStimulus": dict(question["visibleStimulus"]),
            **statements[condition_id],
            "interaction": {
                "promptEn": question["prompt"],
                "promptRu": question["promptRu"],
                "modelResponse": question["answer"],
                "modelResponseRu": question["answerRu"],
                "responseSlots": [dict(slot) for slot in question["slots"]],
                "semanticRubric": dict(question["responseRubric"]),
            },
            "assessmentBlueprint": {
                "construct": "condition-specific-securement-selection",
                "visibleWeightRequired": True,
                "preRevealTypedResponseRequired": True,
                "allBranchAssertionsRequired": True,
                "crossBranchResponseFails": True,
                "localAudioDoesNotQualifyBranchKnowledge": True,
            },
            "sourceRefs": list(question["sourceRefs"]),
        }
    return result


def build_lessons(module):
    lessons = []
    for index, (title, goal, phrases) in enumerate(LESSONS, 1):
        legacy_id = f"lesson-{index:02d}"
        lesson_id = stable_id("lesson", title)
        meanings_ru = LESSON_PHRASE_MEANINGS_RU[index - 1]
        lessons.append({
            "id": lesson_id,
            "legacyId": legacy_id,
            "audioSourceId": legacy_id,
            "title": title,
            "titleRu": LESSON_TITLES_RU_BY_ID[lesson_id],
            "goal": goal,
            "phrases": phrases,
            "phraseMeaningsRu": meanings_ru,
            "profiles": base_lesson_profiles(index),
            "conditions": list(BASE_LESSON_CONDITIONS.get(index, [])),
            "audioProfile": "phone" if index in {2, 3, 4, 10} else "clean",
            "assessmentBlueprint": lesson_assessment_blueprint(phrases, meanings_ru, goal, LESSON_INTERACTION_BLUEPRINTS[index - 1]),
        })
        if index == 1:
            lessons[-1]["profilePhrases"] = {
                "tractor": phrases,
                "hotshot-open": ["My name is Alex Example.", "I drive for Training Carrier.", "I operate a heavy-duty pickup with a gooseneck trailer.", "The trailer is TR-518."],
                "hotshot-enclosed": ["My name is Alex Example.", "I drive for Training Carrier.", "I operate a heavy-duty pickup with a car-hauler trailer.", "The trailer number is TR-518, and the plate is SAMPLE518."],
            }
        if index == 6:
            lessons[-1]["profilePhrases"] = {
                "tractor": phrases,
                "hotshot-open": ["This car-hauler trailer carries three vehicles.", "I matched the VIN to the transport order.", "I checked the combination and axle weights.", "Each vehicle is secured at the front and rear."],
                "hotshot-enclosed": ["The vehicle is secured inside the enclosed trailer.", "I matched the VIN to the transport order.", "I checked the combination and axle weights.", "Both ramp door latches are closed and pinned."],
            }
        if index == 9:
            lessons[-1]["profilePhrases"] = {
                "tractor": phrases,
                "hotshot-open": ["The right rear marker light is out.", "I found a cut on the right trailer tire.", "I will not move until it is checked.", "Yes. The pressure is dropping."],
                "hotshot-enclosed": ["The right rear marker light is out.", "I found a cut on the right trailer tire.", "I will not move until it is checked.", "Both ramp door latches are closed and pinned."],
            }
        if index == 16:
            lessons[-1]["profilePhrases"] = {
                "tractor": phrases,
                "hotshot-open": ["This car-hauler trailer carries three vehicles.", "The sign means trucks must use this exit.", "Would you like me to show or transfer the records?"],
                "hotshot-enclosed": ["The vehicle is secured inside the enclosed trailer.", "The sign means trucks must use this exit.", "Would you like me to show or transfer the records?"],
            }
        if index == 12:
            lessons[-1]["profilePhrases"] = {
                "tractor": phrases,
                "hotshot-open": ["Here is the proof of insurance.", "Here is the trailer registration.", "The periodic inspection documentation is on the vehicle."],
                "hotshot-enclosed": ["Here is the proof of insurance.", "Here is the trailer registration.", "The periodic inspection documentation is on the vehicle."],
            }
        if index in PROFILE_LESSON_PHRASE_MEANINGS_RU:
            lessons[-1]["profilePhraseMeaningsRu"] = PROFILE_LESSON_PHRASE_MEANINGS_RU[index]
            if any(len(lessons[-1]["profilePhrases"][profile]) != len(meanings) for profile, meanings in lessons[-1]["profilePhraseMeaningsRu"].items()):
                raise ValueError(f"Profile phrase and Russian meaning counts differ: lesson {index}")
        if lessons[-1].get("profilePhrases"):
            lessons[-1]["profileInteractionMaterializations"] = profile_lesson_interaction_materializations(index, lessons[-1])
    for item in module["lessons"]:
        legacy_id = item["id"]
        lesson_index = len(lessons)
        lesson_id = stable_id("lesson", item["title"])
        meanings_ru = LESSON_PHRASE_MEANINGS_RU[lesson_index]
        if legacy_id == "hotshot-lesson-03":
            profiles = ["hotshot-open"]
        elif legacy_id == "hotshot-lesson-05":
            profiles = ["hotshot-enclosed"]
        else:
            profiles = HOTSHOT_PROFILES
        conditions = list(item.get("conditions", ["vehicle-transport"]))
        if legacy_id == "hotshot-lesson-03":
            conditions.append("cargo-securement")
        lessons.append({
            **item,
            "id": lesson_id,
            "legacyId": legacy_id,
            "audioSourceId": legacy_id,
            "titleRu": LESSON_TITLES_RU_BY_ID[lesson_id],
            "phraseMeaningsRu": meanings_ru,
            "profiles": item.get("profiles", profiles),
            "conditions": list(dict.fromkeys(conditions)),
            "audioProfile": item.get("audioProfile", "clean"),
            "assessmentBlueprint": lesson_assessment_blueprint(item["phrases"], meanings_ru, item["goal"], LESSON_INTERACTION_BLUEPRINTS[lesson_index]),
        })
        if legacy_id == "hotshot-lesson-03":
            lessons[-1]["securementBranchIds"] = ["vehicle-at-most-10000-lb", "vehicle-over-10000-lb"]
            lessons[-1]["conditionMaterializations"] = securement_lesson_materializations()
            lessons[-1]["assessmentBlueprint"]["conditionSpecificInteraction"] = {
                "required": True,
                "materializationsField": "conditionMaterializations",
                "selectByActiveCondition": True,
                "visibleWeightRequired": True,
                "crossBranchResponseFails": True,
                "modelRevealMakesAttemptIneligible": True,
            }
    generated_ids = {item["id"] for item in lessons}
    configured_ids = set(LESSON_TITLES_RU_BY_ID)
    if generated_ids != configured_ids:
        missing = sorted(generated_ids - configured_ids)
        extra = sorted(configured_ids - generated_ids)
        raise ValueError(f"Russian lesson title inventory mismatch: missing={missing}, extra={extra}")
    return lessons


def load_id_migrations():
    path = APP / "data" / "content-id-migrations.json"
    if not path.exists():
        return {"version": 1, "count": 0, "migrations": {}}
    payload = json.loads(path.read_text(encoding="utf-8"))
    migrations = payload.get("migrations", {})
    if payload.get("count") != len(migrations):
        raise ValueError("content-id-migrations count does not match migrations")
    return payload


def attach_legacy_ids(collections, migration_payload):
    by_id = {}
    for records in collections.values():
        for record in records:
            by_id[record["id"]] = record
    reverse = {}
    for old_id, migration in migration_payload.get("migrations", {}).items():
        target = migration["id"]
        if target not in by_id:
            raise ValueError(f"Migration target does not exist: {old_id} -> {target}")
        reverse.setdefault(target, []).append(old_id)
    for target, old_ids in reverse.items():
        record = by_id[target]
        existing = [record["legacyId"]] if record.get("legacyId") else []
        record["legacyIds"] = sorted(set(existing + old_ids))


def remap_visual_assets(assets, migration_payload):
    migrations = migration_payload.get("migrations", {})
    result = []
    for asset in assets:
        item = dict(asset)
        item["contentRefs"] = [migrations.get(ref, {}).get("id", ref) for ref in asset.get("contentRefs", [])]
        result.append(item)
    return result


FOUNDATION_CURRICULUM_IDS = {
    "lesson:identity-and-unit-numbers",
    "lesson:clarification-and-repair-phrases",
    "lesson:state-trooper-traffic-stop",
    "situation:roadside-stop",
    "situation:traffic-stop-by-state-trooper",
    "situation:inspection-result-and-out-of-service-order",
    "question:pull-into-the-inspection-lane",
    "question:this-vehicle-is-out-of-service",
    "question:the-driver-is-out-of-service-until-oos-condition",
}
ADVANCED_CURRICULUM_IDS = {
    "t:term:record-of-duty-status-rods",
    "t:term:data-transfer",
    "t:term:scale-house",
    "t:document:eld-transfer-instructions",
    "h:tongue-weight",
    "lesson:duty-status-and-available-hours",
    "situation:hours-and-eld-inspection",
    "situation:eld-malfunction-and-paper-logs",
    "situation:weigh-station-and-scale",
    "situation:scale-and-axle-weights",
}
FOUNDATION_PREREQUISITES = [
    "lesson:identity-and-unit-numbers",
    "lesson:clarification-and-repair-phrases",
    "situation:roadside-stop",
    "situation:inspection-result-and-out-of-service-order",
]


def attach_curriculum_metadata(collections):
    sequence = 0
    for collection_name in ("lessons", "situations", "questions", "words", "documents", "signs"):
        for item in collections[collection_name]:
            sequence += 1
            item_id = item["id"]
            if item_id in FOUNDATION_CURRICULUM_IDS:
                phase, priority, prerequisites = "foundation", 10, []
            elif item_id in ADVANCED_CURRICULUM_IDS:
                phase, priority, prerequisites = "advanced-after-foundation", 90, FOUNDATION_PREREQUISITES
            else:
                phase, priority, prerequisites = "controlled-interleaving", 50, []
            item["curriculum"] = {
                "sequence": sequence,
                "phase": phase,
                "priority": priority,
                "prerequisiteIds": list(prerequisites),
                "firstSessionEligible": phase == "foundation",
            }


def build_applicability_inventory(collections):
    inventory = {}
    for collection_name, records in collections.items():
        inventory[collection_name] = {
            item["id"]: {"profiles": list(item["profiles"]), "equipment": list(item["equipment"]), "conditions": list(item["conditions"])}
            for item in records
        }
    return inventory


EQUIPMENT_VALUES = {"tractor-trailer", "hotshot", "pickup", "gooseneck", "open-trailer", "enclosed-trailer", "air-brakes", "dry-van", "load-bars"}
CONDITION_VALUES = {
    "cdl-required", "medical-variance-or-spe-applicable", "periodic-inspection-proof-applicable",
    "permit-applicable", "trip-specific", "hazmat", "eld-or-rods-applicable", "eld-malfunction",
    "medical-status-proof", "spe-variance", "dvir-applicable", "eld-required", "scale-ticket-issued",
    "ifta-applicable", "oversize-or-overweight", "post-inspection", "delivery",
    "dimension-or-weight-applicable", "transported-automobile-or-light-truck-at-most-10000-lb",
    "transported-automobile-or-light-truck-over-10000-lb", "vehicle-transport", "chains-required",
    "registration-required", "cargo", "cargo-securement", "road-not-divided", "road-divided",
    "hill-or-curve-obstructed",
}
EQUIPMENT_CONDITION_MIGRATIONS = {
    "air-brakes": ["tractor-trailer", "air-brakes"],
    "dry-van-load": ["tractor-trailer", "dry-van"],
    "enclosed-trailer": ["enclosed-trailer"],
}
EXPLICIT_EQUIPMENT_BY_ITEM_ID = {
    "t:term:load-bar": ["tractor-trailer", "dry-van", "load-bars"],
    "t:question:how-is-the-cargo-secured:answer": ["tractor-trailer", "dry-van", "load-bars"],
    "t:term:pallet": ["tractor-trailer", "dry-van"],
    "t:professional:the-pallet-count-matches-the-bol": ["tractor-trailer", "dry-van"],
    "t:professional:one-pallet-is-short": ["tractor-trailer", "dry-van"],
}


def materialize_equipment_requirements(collections):
    for records in collections.values():
        for item in records:
            equipment = list(item.get("equipment", []))
            conditions = []
            for condition in item.get("conditions", []):
                migrated = EQUIPMENT_CONDITION_MIGRATIONS.get(condition)
                if migrated:
                    equipment.extend(migrated)
                else:
                    conditions.append(condition)
            if item.get("profiles") == ["tractor"]:
                equipment.append("tractor-trailer")
            equipment.extend(EXPLICIT_EQUIPMENT_BY_ITEM_ID.get(item["id"], []))
            item["equipment"] = list(dict.fromkeys(equipment))
            item["conditions"] = list(dict.fromkeys(conditions))
            unknown_equipment = set(item["equipment"]) - EQUIPMENT_VALUES
            unknown_conditions = set(item["conditions"]) - CONDITION_VALUES
            if unknown_equipment or unknown_conditions:
                raise ValueError(f"Unknown applicability metadata on {item['id']}: equipment={sorted(unknown_equipment)} conditions={sorted(unknown_conditions)}")


CARGO_SECUREMENT_PROGRAMS = [
    {
        "id": "vehicle-at-most-10000-lb",
        "titleEn": "Transported vehicle weighing 10,000 lb or less",
        "titleRu": "Перевозимый автомобиль массой не более 10 000 фунтов",
        "profiles": HOTSHOT_PROFILES,
        "equipment": [],
        "conditions": ["vehicle-transport", "cargo-securement", "transported-automobile-or-light-truck-at-most-10000-lb"],
        "regulation": "49 CFR 393.128",
        "requirementsEn": [
            "Restrain the vehicle at both the front and rear with a minimum of two tiedowns total.",
            "If a tiedown attaches to the vehicle structure, use a mounting point specifically designed for that purpose.",
            "If a tiedown fits over or around a wheel, provide lateral, longitudinal and vertical restraint.",
        ],
        "requirementsRu": [
            "Удерживайте автомобиль и спереди, и сзади минимум двумя средствами крепления в общей сложности.",
            "Если средство крепления присоединяется к конструкции автомобиля, используйте точку, специально предназначенную для этого.",
            "Если средство крепления проходит поверх колеса или вокруг него, исключите поперечное, продольное и вертикальное перемещение.",
        ],
        "assessmentBlueprint": {"visibleWeightRequired": True, "typedProcedureRequired": True, "minimumTiedowns": 2, "frontAndRearRestraintRequired": True, "allRequirementsRequired": True, "crossBranchResponseFails": True},
        "sourceRefs": ["https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-393/subpart-I/section-393.128"],
    },
    {
        "id": "vehicle-over-10000-lb",
        "titleEn": "Transported heavy vehicle, equipment or machinery over 10,000 lb",
        "titleRu": "Перевозимая тяжелая машина, оборудование или техника массой более 10 000 фунтов",
        "profiles": HOTSHOT_PROFILES,
        "equipment": [],
        "conditions": ["vehicle-transport", "cargo-securement", "transported-automobile-or-light-truck-over-10000-lb"],
        "regulation": "49 CFR 393.130",
        "requirementsEn": [
            "Lower and secure accessory equipment such as hydraulic shovels before transport unless the rule's exception applies.",
            "Prevent articulated vehicles from articulating in transit.",
            "Use at least four tiedowns, as close as practicable to the front and rear or at mounting points designed for that purpose.",
        ],
        "requirementsRu": [
            "Перед перевозкой опустите и закрепите навесное оборудование, если не применяется указанное в правиле исключение.",
            "Исключите складывание или поворот сочлененной машины в пути.",
            "Используйте минимум четыре средства крепления как можно ближе к передней и задней части либо в предназначенных для этого точках.",
        ],
        "assessmentBlueprint": {"visibleWeightRequired": True, "typedProcedureRequired": True, "minimumTiedowns": 4, "accessoryAndArticulationChecksRequired": True, "allRequirementsRequired": True},
        "sourceRefs": ["https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-393/subpart-I/section-393.130"],
    },
]

REINSPECTION_VARIANT_CONTENT_FIELDS = (
    "visibleStimulus",
    "promptEn",
    "promptRu",
    "modelAnswer",
    "modelAnswerRu",
    "slots",
    "responseRubric",
)


def _reinspection_practice_variant(task, variant_id, overrides=None):
    variant = {
        field: json.loads(json.dumps(task[field], ensure_ascii=False))
        for field in REINSPECTION_VARIANT_CONTENT_FIELDS
    }
    variant.update(json.loads(json.dumps(overrides or {}, ensure_ascii=False)))
    variant["id"] = variant_id
    variant["variantId"] = variant_id
    variant["responseMode"] = "typed-pre-reveal"
    fingerprint_payload = {
        field: variant[field]
        for field in REINSPECTION_VARIANT_CONTENT_FIELDS
    }
    variant["semanticFingerprint"] = hashlib.sha256(
        json.dumps(fingerprint_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return variant


def _validate_reinspection_practice_variants(task_id, variants):
    if set(variants) != {"primary", "transfer"}:
        raise ValueError(f"Cargo reinspection variants must be primary and transfer: {task_id}")
    primary = variants["primary"]
    transfer = variants["transfer"]
    for variant_id, variant in variants.items():
        if variant.get("id") != variant_id or variant.get("variantId") != variant_id:
            raise ValueError(f"Cargo reinspection variant key mismatch: {task_id} {variant_id}")
        if variant.get("responseMode") != "typed-pre-reveal":
            raise ValueError(f"Cargo reinspection variant is not typed: {task_id} {variant_id}")
        if variant.get("visibleStimulus", {}).get("trainingSample") is not True:
            raise ValueError(f"Cargo reinspection variant lacks training label: {task_id} {variant_id}")
        if not variant.get("promptEn") or not variant.get("modelAnswer") or not variant.get("slots") or not variant.get("responseRubric"):
            raise ValueError(f"Cargo reinspection variant is incomplete: {task_id} {variant_id}")
    for field in REINSPECTION_VARIANT_CONTENT_FIELDS:
        if json.dumps(primary[field], ensure_ascii=False, sort_keys=True) == json.dumps(transfer[field], ensure_ascii=False, sort_keys=True):
            raise ValueError(f"Cargo reinspection variants reuse {field}: {task_id}")
    if primary["semanticFingerprint"] == transfer["semanticFingerprint"]:
        raise ValueError(f"Cargo reinspection variants share semantic evidence: {task_id}")


def cargo_reinspection_scored_tasks():
    source_ref = "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-392/section-392.9"
    tasks = [{
        "id": "first-50-miles",
        "construct": "initial-reinspection-deadline",
        "visibleStimulus": {
            "tripStartOdometerMiles": 120000,
            "currentOdometerMiles": 120042,
            "exceptionApplies": False,
            "trainingSample": True,
        },
        "promptEn": "No exception applies. By what odometer reading must the first cargo and securement inspection occur?",
        "promptRu": "Исключение не применяется. До какого показания одометра нужно провести первую проверку груза и крепления?",
        "modelAnswer": "I must inspect by odometer 120,050, within the first 50 miles after beginning the trip.",
        "modelAnswerRu": "Проверку нужно провести не позднее показания 120 050 миль, в пределах первых 50 миль после начала рейса.",
        "slots": [
            {"name": "first-inspection-distance", "type": "distance-miles", "display": "50 miles", "spoken": "fifty miles"},
            {"name": "due-odometer", "type": "odometer-miles", "display": "120,050", "spoken": "one hundred twenty thousand fifty"},
        ],
        "responseRubric": {
            "minTokens": 7,
            "requiredRatio": 1,
            "requiredGroups": [["inspect", "inspection"], ["within", "by", "no later"], ["50", "fifty"], ["miles"], ["120050", "120,050"]],
            "computationPolicy": {"operation": "trip-start-plus-deadline", "deadlineMiles": 50, "expectedOdometerMiles": 120050, "genericRuleStatementFails": True},
        },
        "sourceRefs": [source_ref],
    }]
    next_due_rows = [
        {
            "id": "next-due-duty-status-change",
            "visibleStimulus": {"lastInspectionTime": "9:00 a.m.", "lastInspectionOdometerMiles": 50000, "nextDutyStatusChangeTime": "10:10 a.m.", "threeHourDeadlineTime": "12:00 p.m.", "projected150MileTime": "11:30 a.m.", "projected150MileOdometer": 50150},
            "expectedEventId": "duty-status-change", "expectedTime": "10:10 a.m.",
            "modelAnswer": "The next inspection is due at the duty-status change at 10:10 a.m. because that event occurs first.",
            "modelAnswerRu": "Следующая проверка нужна при смене рабочего статуса в 10:10, потому что это событие наступит первым.",
        },
        {
            "id": "next-due-three-hours",
            "visibleStimulus": {"lastInspectionTime": "8:00 a.m.", "lastInspectionOdometerMiles": 60000, "nextDutyStatusChangeTime": "12:30 p.m.", "threeHourDeadlineTime": "11:00 a.m.", "projected150MileTime": "11:45 a.m.", "projected150MileOdometer": 60150},
            "expectedEventId": "three-hours", "expectedTime": "11:00 a.m.",
            "modelAnswer": "The next inspection is due after three hours of driving at 11:00 a.m. because that event occurs first.",
            "modelAnswerRu": "Следующая проверка нужна после трех часов движения в 11:00, потому что это событие наступит первым.",
        },
        {
            "id": "next-due-150-miles",
            "visibleStimulus": {"lastInspectionTime": "9:30 a.m.", "lastInspectionOdometerMiles": 70000, "nextDutyStatusChangeTime": "1:00 p.m.", "threeHourDeadlineTime": "12:30 p.m.", "projected150MileTime": "11:20 a.m.", "projected150MileOdometer": 70150},
            "expectedEventId": "one-hundred-fifty-miles", "expectedTime": "11:20 a.m.",
            "modelAnswer": "The next inspection is due at 150 miles, projected for 11:20 a.m., because that event occurs first.",
            "modelAnswerRu": "Следующая проверка нужна после 150 миль, ориентировочно в 11:20, потому что это событие наступит первым.",
        },
    ]
    event_language = {
        "duty-status-change": [["duty"], ["status"], ["change"]],
        "three-hours": [["three", "3"], ["hours"]],
        "one-hundred-fifty-miles": [["150", "one hundred fifty"], ["miles"]],
    }
    for row in next_due_rows:
        tasks.append({
            **row,
            "construct": "next-reinspection-earliest-event",
            "promptEn": "Which single reinspection event is due next? Use the visible times and mileage and choose whichever occurs first.",
            "promptRu": "Какое одно событие задает следующую проверку? Используйте видимые время и пробег и выберите то, которое наступит первым.",
            "slots": [
                {"name": "next-due-event", "type": "statement", "display": row["expectedEventId"], "spoken": row["expectedEventId"].replace("-", " ")},
                {"name": "next-due-time", "type": "time", "display": row["expectedTime"], "spoken": row["expectedTime"]},
            ],
            "responseRubric": {
                "minTokens": 8,
                "requiredRatio": 1,
                "requiredGroups": event_language[row["expectedEventId"]] + [["first", "earliest"], [row["expectedTime"]]],
                "earliestEventPolicy": {
                    "candidateEventIds": ["duty-status-change", "three-hours", "one-hundred-fifty-miles"],
                    "expectedEventId": row["expectedEventId"],
                    "mustChooseExactlyOne": True,
                    "rejectAndAsDeadlineLogic": True,
                    "missingEarliestEventFails": True,
                },
            },
            "sourceRefs": [source_ref],
        })
    exception_rows = [
        {
            "id": "exception-sealed-and-ordered-not-to-open",
            "visibleStimulus": {"cmvSealed": True, "driverOrderedNotToOpen": True, "cargoInspectionImpracticable": False},
            "expectedDecision": "exception-applies",
            "modelAnswer": "The exception applies because the CMV is sealed and the driver was ordered not to open it.",
            "modelAnswerRu": "Исключение применяется, потому что машина опломбирована и водителю приказано не открывать ее.",
            "requiredGroups": [["exception"], ["applies"], ["sealed"], ["ordered"], ["not"], ["open"]],
        },
        {
            "id": "exception-inspection-impracticable",
            "visibleStimulus": {"cmvSealed": False, "driverOrderedNotToOpen": False, "cargoInspectionImpracticable": True},
            "expectedDecision": "exception-applies",
            "modelAnswer": "The exception applies because the cargo was loaded in a way that makes inspection impracticable.",
            "modelAnswerRu": "Исключение применяется, потому что груз размещен так, что его осмотр практически невозможен.",
            "requiredGroups": [["exception"], ["applies"], ["inspection"], ["impracticable"]],
        },
        {
            "id": "seal-alone-is-not-universal-exception",
            "visibleStimulus": {"cmvSealed": True, "driverOrderedNotToOpen": False, "cargoInspectionImpracticable": False},
            "expectedDecision": "exception-does-not-apply",
            "modelAnswer": "The exception does not apply merely because a seal is present; the driver was not ordered not to open it and inspection is practicable.",
            "modelAnswerRu": "Исключение не применяется только из-за наличия пломбы: водителю не запрещали открывать машину, а осмотр практически возможен.",
            "requiredGroups": [["exception"], ["not"], ["apply"], ["seal"], ["ordered"], ["inspection"], ["practicable"]],
        },
    ]
    for row in exception_rows:
        tasks.append({
            **row,
            "construct": "paragraph-b4-exception-decision",
            "promptEn": "Does the 49 CFR 392.9(b)(4) exception apply to this visible scenario, and why?",
            "promptRu": "Применяется ли исключение 49 CFR 392.9(b)(4) к этому видимому сценарию и почему?",
            "slots": [{"name": "exception-decision", "type": "statement", "display": row["expectedDecision"], "spoken": row["expectedDecision"].replace("-", " ")}],
            "responseRubric": {
                "minTokens": 8,
                "requiredRatio": 1,
                "requiredGroups": row["requiredGroups"],
                "exceptionDecisionPolicy": {
                    "expectedDecision": row["expectedDecision"],
                    "sealedRequiresOrderedNotToOpen": True,
                    "impracticableInspectionIsIndependentException": True,
                    "rejectUniversalSealedException": True,
                    "genericExceptionStatementFails": True,
                },
            },
            "sourceRefs": [source_ref],
        })
    task_by_id = {task["id"]: task for task in tasks}
    primary_overrides = {
        "first-50-miles": {
            "promptEn": "The visible trip began at odometer 120,000. No exception applies. By what odometer reading must the first cargo and securement inspection occur?",
            "promptRu": "Видимый рейс начался при показании одометра 120 000. Исключение не применяется. До какого показания нужно провести первую проверку груза и крепления?",
        },
        "next-due-duty-status-change": {
            "visibleStimulus": {**task_by_id["next-due-duty-status-change"]["visibleStimulus"], "trainingSample": True},
            "promptEn": "The last cargo inspection shown was at 9:00 a.m. and odometer 50,000. Which single reinspection event is due next? Choose the earliest visible event.",
            "promptRu": "Последняя видимая проверка груза была в 9:00 при показании одометра 50 000. Какое одно событие задает следующую проверку? Выберите самое раннее видимое событие.",
        },
        "next-due-three-hours": {
            "visibleStimulus": {**task_by_id["next-due-three-hours"]["visibleStimulus"], "trainingSample": True},
            "promptEn": "The last cargo inspection shown was at 8:00 a.m. and odometer 60,000. Which single reinspection event is due next? Choose the earliest visible event.",
            "promptRu": "Последняя видимая проверка груза была в 8:00 при показании одометра 60 000. Какое одно событие задает следующую проверку? Выберите самое раннее видимое событие.",
        },
        "next-due-150-miles": {
            "visibleStimulus": {**task_by_id["next-due-150-miles"]["visibleStimulus"], "trainingSample": True},
            "promptEn": "The last cargo inspection shown was at 9:30 a.m. and odometer 70,000. Which single reinspection event is due next? Give the earliest event, projected time and due odometer.",
            "promptRu": "Последняя видимая проверка груза была в 9:30 при показании одометра 70 000. Какое одно событие задает следующую проверку? Назовите самое раннее событие, расчетное время и показание одометра.",
            "modelAnswer": "The next inspection is due at 150 miles, projected for 11:20 a.m. and odometer 70,150, because that event occurs first.",
            "modelAnswerRu": "Следующая проверка нужна после 150 миль, ориентировочно в 11:20 при показании одометра 70 150, потому что это событие наступит первым.",
            "slots": [
                {"name": "next-due-event", "type": "statement", "display": "one-hundred-fifty-miles", "spoken": "one hundred fifty miles"},
                {"name": "next-due-time", "type": "time", "display": "11:20 a.m.", "spoken": "11:20 a.m."},
                {"name": "next-due-odometer", "type": "odometer-miles", "display": "70,150", "spoken": "seventy thousand one hundred fifty"},
            ],
            "responseRubric": {
                "minTokens": 10,
                "requiredRatio": 1,
                "requiredGroups": [["150", "one hundred fifty"], ["miles"], ["first", "earliest"], ["11:20 a.m."], ["70150", "70,150"]],
                "earliestEventPolicy": {
                    "candidateEventIds": ["duty-status-change", "three-hours", "one-hundred-fifty-miles"],
                    "expectedEventId": "one-hundred-fifty-miles",
                    "mustChooseExactlyOne": True,
                    "rejectAndAsDeadlineLogic": True,
                    "missingEarliestEventFails": True,
                },
            },
        },
        "exception-sealed-and-ordered-not-to-open": {
            "visibleStimulus": {
                "cmvSealed": True,
                "driverOrderedNotToOpen": True,
                "cargoInspectionImpracticable": False,
                "cargoType": "sealed dry van, written order not to open",
                "trainingSample": True,
            },
            "promptEn": "For the visible sealed dry-van sample with a written order not to open it, does the 49 CFR 392.9(b)(4) exception apply, and why?",
            "promptRu": "Для видимого учебного примера с опломбированным сухим фургоном и письменным запретом на открытие применяется ли исключение 49 CFR 392.9(b)(4) и почему?",
            "modelAnswer": "The exception applies because the dry van is sealed and the driver was ordered not to open it in writing.",
            "modelAnswerRu": "Исключение применяется, потому что сухой фургон опломбирован, а водителю письменно приказано не открывать его.",
            "slots": [
                {"name": "exception-decision", "type": "statement", "display": "exception-applies", "spoken": "exception applies"},
                {"name": "sealed-cmv-type", "type": "statement", "display": "dry van", "spoken": "dry van"},
                {"name": "order-source", "type": "statement", "display": "ordered not to open it in writing", "spoken": "ordered not to open it in writing"},
            ],
            "responseRubric": {
                "minTokens": 8,
                "requiredRatio": 1,
                "requiredGroups": [["exception"], ["applies"], ["sealed"], ["ordered"], ["not"], ["open"], ["dry van"], ["writing", "written"]],
                "exceptionDecisionPolicy": {
                    "expectedDecision": "exception-applies",
                    "sealedRequiresOrderedNotToOpen": True,
                    "impracticableInspectionIsIndependentException": True,
                    "rejectUniversalSealedException": True,
                    "genericExceptionStatementFails": True,
                },
            },
        },
        "exception-inspection-impracticable": {
            "visibleStimulus": {
                "cmvSealed": False,
                "driverOrderedNotToOpen": False,
                "cargoInspectionImpracticable": True,
                "cargoType": "floor-to-ceiling unitized freight blocks access",
                "trainingSample": True,
            },
            "promptEn": "For the visible floor-to-ceiling unitized load, does the 49 CFR 392.9(b)(4) exception apply, and why?",
            "promptRu": "Для видимой загрузки пакетированным грузом от пола до потолка применяется ли исключение 49 CFR 392.9(b)(4) и почему?",
            "modelAnswer": "The exception applies because floor-to-ceiling unitized freight blocks access, making cargo inspection impracticable.",
            "modelAnswerRu": "Исключение применяется, потому что пакетированный груз от пола до потолка перекрывает доступ и делает осмотр практически невозможным.",
            "slots": [
                {"name": "exception-decision", "type": "statement", "display": "exception-applies", "spoken": "exception applies"},
                {"name": "load-configuration", "type": "statement", "display": "floor-to-ceiling unitized freight", "spoken": "floor to ceiling unitized freight"},
            ],
            "responseRubric": {
                "minTokens": 8,
                "requiredRatio": 1,
                "requiredGroups": [["exception"], ["applies"], ["inspection"], ["impracticable"], ["floor"], ["ceiling"], ["unitized"], ["access"]],
                "exceptionDecisionPolicy": {
                    "expectedDecision": "exception-applies",
                    "sealedRequiresOrderedNotToOpen": True,
                    "impracticableInspectionIsIndependentException": True,
                    "rejectUniversalSealedException": True,
                    "genericExceptionStatementFails": True,
                },
            },
        },
        "seal-alone-is-not-universal-exception": {
            "visibleStimulus": {
                "cmvSealed": True,
                "driverOrderedNotToOpen": False,
                "cargoInspectionImpracticable": False,
                "cargoType": "sealed packaged-food load, cargo accessible",
                "trainingSample": True,
            },
            "promptEn": "The visible packaged-food load has a seal, but the driver has no order prohibiting inspection and the cargo is accessible. Does the 49 CFR 392.9(b)(4) exception apply, and why?",
            "promptRu": "На видимом грузе с упакованными продуктами есть пломба, запрета на открытие нет, груз доступен. Применяется ли исключение 49 CFR 392.9(b)(4) и почему?",
            "modelAnswer": "The exception does not apply to the sealed packaged-food load: the driver was not ordered not to open it, and the cargo can be inspected.",
            "modelAnswerRu": "Исключение не применяется к опломбированному грузу с упакованными продуктами: водителю не запрещали открывать машину, и груз можно осмотреть.",
            "slots": [
                {"name": "exception-decision", "type": "statement", "display": "exception-does-not-apply", "spoken": "exception does not apply"},
                {"name": "cargo-example", "type": "statement", "display": "does not apply to the sealed packaged-food load", "spoken": "does not apply to the sealed packaged food load"},
                {"name": "inspection-access", "type": "statement", "display": "cargo can be inspected", "spoken": "cargo can be inspected"},
            ],
            "responseRubric": {
                "minTokens": 8,
                "requiredRatio": 1,
                "requiredGroups": [["exception"], ["not"], ["apply"], ["seal"], ["ordered"], ["packaged food"], ["practicable", "can be inspected"]],
                "exceptionDecisionPolicy": {
                    "expectedDecision": "exception-does-not-apply",
                    "sealedRequiresOrderedNotToOpen": True,
                    "impracticableInspectionIsIndependentException": True,
                    "rejectUniversalSealedException": True,
                    "genericExceptionStatementFails": True,
                },
            },
        },
    }
    transfer_overrides = {
        "first-50-miles": {
            "visibleStimulus": {
                "tripStartOdometerMiles": 184275,
                "currentOdometerMiles": 184312,
                "exceptionApplies": False,
                "trainingSample": True,
            },
            "promptEn": "This visible training trip began at odometer 184,275. No exception applies. By what odometer reading must the first cargo and securement inspection occur?",
            "promptRu": "В этом видимом учебном примере рейс начался при показании одометра 184 275. Исключение не применяется. До какого показания нужно провести первую проверку груза и крепления?",
            "modelAnswer": "I must inspect by odometer 184,325, within the first 50 miles after beginning the trip.",
            "modelAnswerRu": "Проверку нужно провести не позднее показания 184 325 миль, в пределах первых 50 миль после начала рейса.",
            "slots": [
                {"name": "first-inspection-distance", "type": "distance-miles", "display": "50 miles", "spoken": "fifty miles"},
                {"name": "due-odometer", "type": "odometer-miles", "display": "184,325", "spoken": "one hundred eighty-four thousand three hundred twenty-five"},
            ],
            "responseRubric": {
                "minTokens": 7,
                "requiredRatio": 1,
                "requiredGroups": [["inspect", "inspection"], ["within", "by", "no later"], ["50", "fifty"], ["miles"], ["184325", "184,325"]],
                "computationPolicy": {"operation": "trip-start-plus-deadline", "deadlineMiles": 50, "expectedOdometerMiles": 184325, "genericRuleStatementFails": True},
            },
        },
        "next-due-duty-status-change": {
            "visibleStimulus": {
                "lastInspectionTime": "2:15 p.m.",
                "lastInspectionOdometerMiles": 84620,
                "nextDutyStatusChangeTime": "3:05 p.m.",
                "threeHourDeadlineTime": "5:15 p.m.",
                "projected150MileTime": "4:35 p.m.",
                "projected150MileOdometer": 84770,
                "trainingSample": True,
            },
            "promptEn": "The last cargo inspection shown was at 2:15 p.m. and odometer 84,620. Which single reinspection event is due next? Choose the earliest visible event.",
            "promptRu": "Последняя видимая проверка груза была в 14:15 при показании одометра 84 620. Какое одно событие задает следующую проверку? Выберите самое раннее видимое событие.",
            "modelAnswer": "The next inspection is due at the duty-status change at 3:05 p.m. because that event occurs first.",
            "modelAnswerRu": "Следующая проверка нужна при смене рабочего статуса в 15:05, потому что это событие наступит первым.",
            "slots": [
                {"name": "next-due-event", "type": "statement", "display": "duty-status-change", "spoken": "duty status change"},
                {"name": "next-due-time", "type": "time", "display": "3:05 p.m.", "spoken": "3:05 p.m."},
            ],
            "responseRubric": {
                "minTokens": 8,
                "requiredRatio": 1,
                "requiredGroups": [["duty"], ["status"], ["change"], ["first", "earliest"], ["3:05 p.m."]],
                "earliestEventPolicy": {
                    "candidateEventIds": ["duty-status-change", "three-hours", "one-hundred-fifty-miles"],
                    "expectedEventId": "duty-status-change",
                    "mustChooseExactlyOne": True,
                    "rejectAndAsDeadlineLogic": True,
                    "missingEarliestEventFails": True,
                },
            },
        },
        "next-due-three-hours": {
            "visibleStimulus": {
                "lastInspectionTime": "1:20 p.m.",
                "lastInspectionOdometerMiles": 91240,
                "nextDutyStatusChangeTime": "5:15 p.m.",
                "threeHourDeadlineTime": "4:20 p.m.",
                "projected150MileTime": "4:50 p.m.",
                "projected150MileOdometer": 91390,
                "trainingSample": True,
            },
            "promptEn": "The last cargo inspection shown was at 1:20 p.m. and odometer 91,240. Which single reinspection event is due next? Choose the earliest visible event.",
            "promptRu": "Последняя видимая проверка груза была в 13:20 при показании одометра 91 240. Какое одно событие задает следующую проверку? Выберите самое раннее видимое событие.",
            "modelAnswer": "The next inspection is due after three hours of driving at 4:20 p.m. because that event occurs first.",
            "modelAnswerRu": "Следующая проверка нужна после трех часов движения в 16:20, потому что это событие наступит первым.",
            "slots": [
                {"name": "next-due-event", "type": "statement", "display": "three-hours", "spoken": "three hours"},
                {"name": "next-due-time", "type": "time", "display": "4:20 p.m.", "spoken": "4:20 p.m."},
            ],
            "responseRubric": {
                "minTokens": 8,
                "requiredRatio": 1,
                "requiredGroups": [["three", "3"], ["hours"], ["first", "earliest"], ["4:20 p.m."]],
                "earliestEventPolicy": {
                    "candidateEventIds": ["duty-status-change", "three-hours", "one-hundred-fifty-miles"],
                    "expectedEventId": "three-hours",
                    "mustChooseExactlyOne": True,
                    "rejectAndAsDeadlineLogic": True,
                    "missingEarliestEventFails": True,
                },
            },
        },
        "next-due-150-miles": {
            "visibleStimulus": {
                "lastInspectionTime": "2:40 p.m.",
                "lastInspectionOdometerMiles": 88400,
                "nextDutyStatusChangeTime": "6:10 p.m.",
                "threeHourDeadlineTime": "5:40 p.m.",
                "projected150MileTime": "4:25 p.m.",
                "projected150MileOdometer": 88550,
                "trainingSample": True,
            },
            "promptEn": "The last cargo inspection shown was at 2:40 p.m. and odometer 88,400. Which single reinspection event is due next? Give the earliest event, projected time and due odometer.",
            "promptRu": "Последняя видимая проверка груза была в 14:40 при показании одометра 88 400. Какое одно событие задает следующую проверку? Назовите самое раннее событие, расчетное время и показание одометра.",
            "modelAnswer": "The next inspection is due at 150 miles, projected for 4:25 p.m. and odometer 88,550, because that event occurs first.",
            "modelAnswerRu": "Следующая проверка нужна после 150 миль, ориентировочно в 16:25 при показании одометра 88 550, потому что это событие наступит первым.",
            "slots": [
                {"name": "next-due-event", "type": "statement", "display": "one-hundred-fifty-miles", "spoken": "one hundred fifty miles"},
                {"name": "next-due-time", "type": "time", "display": "4:25 p.m.", "spoken": "4:25 p.m."},
                {"name": "next-due-odometer", "type": "odometer-miles", "display": "88,550", "spoken": "eighty-eight thousand five hundred fifty"},
            ],
            "responseRubric": {
                "minTokens": 10,
                "requiredRatio": 1,
                "requiredGroups": [["150", "one hundred fifty"], ["miles"], ["first", "earliest"], ["4:25 p.m."], ["88550", "88,550"]],
                "earliestEventPolicy": {
                    "candidateEventIds": ["duty-status-change", "three-hours", "one-hundred-fifty-miles"],
                    "expectedEventId": "one-hundred-fifty-miles",
                    "mustChooseExactlyOne": True,
                    "rejectAndAsDeadlineLogic": True,
                    "missingEarliestEventFails": True,
                },
            },
        },
        "exception-sealed-and-ordered-not-to-open": {
            "visibleStimulus": {
                "cmvSealed": True,
                "driverOrderedNotToOpen": True,
                "cargoInspectionImpracticable": False,
                "cargoType": "sealed intermodal container, dispatcher order not to open",
                "trainingSample": True,
            },
            "promptEn": "For the visible sealed intermodal-container sample with a dispatcher order not to open it, does the 49 CFR 392.9(b)(4) exception apply, and why?",
            "promptRu": "Для видимого учебного примера с опломбированным интермодальным контейнером и запретом диспетчера на открытие применяется ли исключение 49 CFR 392.9(b)(4) и почему?",
            "modelAnswer": "The exception applies because the intermodal container is sealed and the driver was ordered not to open it by the dispatcher.",
            "modelAnswerRu": "Исключение применяется, потому что интермодальный контейнер опломбирован, а диспетчер приказал водителю не открывать его.",
            "slots": [
                {"name": "exception-decision", "type": "statement", "display": "exception-applies", "spoken": "exception applies"},
                {"name": "sealed-cmv-type", "type": "statement", "display": "intermodal container", "spoken": "intermodal container"},
                {"name": "order-source", "type": "statement", "display": "ordered not to open it by the dispatcher", "spoken": "ordered not to open it by the dispatcher"},
            ],
            "responseRubric": {
                "minTokens": 8,
                "requiredRatio": 1,
                "requiredGroups": [["exception"], ["applies"], ["sealed"], ["ordered"], ["not"], ["open"], ["intermodal"], ["container"], ["dispatcher"]],
                "exceptionDecisionPolicy": {
                    "expectedDecision": "exception-applies",
                    "sealedRequiresOrderedNotToOpen": True,
                    "impracticableInspectionIsIndependentException": True,
                    "rejectUniversalSealedException": True,
                    "genericExceptionStatementFails": True,
                },
            },
        },
        "exception-inspection-impracticable": {
            "visibleStimulus": {
                "cmvSealed": False,
                "driverOrderedNotToOpen": False,
                "cargoInspectionImpracticable": True,
                "cargoType": "fixed bulkhead blocks access to loaded cargo",
                "trainingSample": True,
            },
            "promptEn": "For the visible load behind a fixed bulkhead that blocks access, does the 49 CFR 392.9(b)(4) exception apply, and why?",
            "promptRu": "Для видимого груза за неподвижной перегородкой, перекрывающей доступ, применяется ли исключение 49 CFR 392.9(b)(4) и почему?",
            "modelAnswer": "The exception applies because a fixed bulkhead blocks access to the loaded cargo, making inspection impracticable.",
            "modelAnswerRu": "Исключение применяется, потому что неподвижная перегородка перекрывает доступ к загруженному грузу и делает осмотр практически невозможным.",
            "slots": [
                {"name": "exception-decision", "type": "statement", "display": "exception-applies", "spoken": "exception applies"},
                {"name": "load-configuration", "type": "statement", "display": "fixed bulkhead", "spoken": "fixed bulkhead"},
            ],
            "responseRubric": {
                "minTokens": 8,
                "requiredRatio": 1,
                "requiredGroups": [["exception"], ["applies"], ["inspection"], ["impracticable"], ["fixed"], ["bulkhead"], ["access"]],
                "exceptionDecisionPolicy": {
                    "expectedDecision": "exception-applies",
                    "sealedRequiresOrderedNotToOpen": True,
                    "impracticableInspectionIsIndependentException": True,
                    "rejectUniversalSealedException": True,
                    "genericExceptionStatementFails": True,
                },
            },
        },
        "seal-alone-is-not-universal-exception": {
            "visibleStimulus": {
                "cmvSealed": True,
                "driverOrderedNotToOpen": False,
                "cargoInspectionImpracticable": False,
                "cargoType": "sealed paper-roll load, cargo accessible",
                "trainingSample": True,
            },
            "promptEn": "The visible paper-roll load has a seal, but the driver has no order prohibiting inspection and the cargo is accessible. Does the 49 CFR 392.9(b)(4) exception apply, and why?",
            "promptRu": "На видимом грузе с бумажными рулонами есть пломба, запрета на открытие нет, груз доступен. Применяется ли исключение 49 CFR 392.9(b)(4) и почему?",
            "modelAnswer": "The exception does not apply to the sealed paper-roll load: the driver was not ordered not to open it, and the cargo can be inspected.",
            "modelAnswerRu": "Исключение не применяется к опломбированному грузу с бумажными рулонами: водителю не запрещали открывать машину, и груз можно осмотреть.",
            "slots": [
                {"name": "exception-decision", "type": "statement", "display": "exception-does-not-apply", "spoken": "exception does not apply"},
                {"name": "cargo-example", "type": "statement", "display": "does not apply to the sealed paper-roll load", "spoken": "does not apply to the sealed paper roll load"},
                {"name": "inspection-access", "type": "statement", "display": "cargo can be inspected", "spoken": "cargo can be inspected"},
            ],
            "responseRubric": {
                "minTokens": 8,
                "requiredRatio": 1,
                "requiredGroups": [["exception"], ["not"], ["apply"], ["seal"], ["ordered"], ["paper"], ["roll"], ["practicable", "can be inspected"]],
                "exceptionDecisionPolicy": {
                    "expectedDecision": "exception-does-not-apply",
                    "sealedRequiresOrderedNotToOpen": True,
                    "impracticableInspectionIsIndependentException": True,
                    "rejectUniversalSealedException": True,
                    "genericExceptionStatementFails": True,
                },
            },
        },
    }
    for task in tasks:
        task_id = task["id"]
        primary = _reinspection_practice_variant(task, "primary", primary_overrides[task_id])
        transfer = _reinspection_practice_variant(task, "transfer", transfer_overrides[task_id])
        variants = {"primary": primary, "transfer": transfer}
        _validate_reinspection_practice_variants(task_id, variants)
        for field in REINSPECTION_VARIANT_CONTENT_FIELDS:
            task[field] = json.loads(json.dumps(primary[field], ensure_ascii=False))
        task["practiceContract"] = {
            "schemaVersion": "cycle3-regulatory-typed-v1",
            "variantsField": "practiceVariants",
            "variantKey": "id",
            "variantIds": ["primary", "transfer"],
            "defaultVariantId": "primary",
            "responseMode": "typed-pre-reveal",
            "requireDifferentVariantForConfirmation": True,
            "visibleStimulusRequired": True,
            "modelRevealMakesAttemptIneligible": True,
        }
        task["practiceVariants"] = variants
    return tasks


def cargo_reinspection_scored_questions(tasks):
    """Expose each regulatory task through the existing typed-question contract."""
    questions = []
    for question_index, task in enumerate(tasks, 1):
        prompt = task["promptEn"]
        answer = task["modelAnswer"]
        category = (
            "H. Result, violation and completion"
            if task["construct"] == "paragraph-b4-exception-decision"
            else "G. Vehicle, equipment and visible defects"
        )
        task_copy = json.loads(json.dumps(task, ensure_ascii=False))
        practice_variants = {}
        for variant_id, task_variant in task["practiceVariants"].items():
            practice_variants[variant_id] = {
                "id": variant_id,
                "variantId": variant_id,
                "sourceTaskVariantId": variant_id,
                "responseMode": task_variant["responseMode"],
                "semanticFingerprint": task_variant["semanticFingerprint"],
                "prompt": task_variant["promptEn"],
                "promptRu": task_variant["promptRu"],
                "promptDisplay": task_variant["promptEn"],
                "promptSpoken": task_variant["promptEn"],
                "answer": task_variant["modelAnswer"],
                "answerRu": task_variant["modelAnswerRu"],
                "answerDisplay": task_variant["modelAnswer"],
                "answerSpoken": task_variant["modelAnswer"],
                "visibleStimulus": json.loads(json.dumps(task_variant["visibleStimulus"], ensure_ascii=False)),
                "slots": json.loads(json.dumps(task_variant["slots"], ensure_ascii=False)),
                "responseRubric": json.loads(json.dumps(task_variant["responseRubric"], ensure_ascii=False)),
            }
        questions.append({
            "id": f"question:cargo-reinspection:{task['id']}",
            "legacyId": None,
            "audioSourceId": None,
            "regulatoryProgramId": "cargo-reinspection-49-cfr-392-9",
            "scoredTaskId": task["id"],
            "category": category,
            "construct": task["construct"],
            "prompt": prompt,
            "promptRu": task["promptRu"],
            "promptTemplate": prompt,
            "promptDisplay": prompt,
            "promptSpoken": prompt,
            "answer": answer,
            "answerRu": task["modelAnswerRu"],
            "answerTemplate": answer,
            "answerDisplay": answer,
            "answerSpoken": answer,
            "visibleStimulus": json.loads(json.dumps(task["visibleStimulus"], ensure_ascii=False)),
            "slots": json.loads(json.dumps(task["slots"], ensure_ascii=False)),
            "responseRubric": json.loads(json.dumps(task["responseRubric"], ensure_ascii=False)),
            "profiles": list(ALL_PROFILES),
            "equipment": [],
            "conditions": ["cargo-securement"],
            "corpus": "regulatory-scored-training-task",
            "sourceLabel": "Visible typed training task keyed to 49 CFR 392.9(b)(2)-(4)",
            "sourceRefs": list(task["sourceRefs"]),
            "promptRole": "inspector",
            "answerRole": "driver",
            "audioProfilesAvailable": [],
            "driverAnswerListeningAvailable": False,
            "audioFallback": "none-for-qualification",
            "practiceContract": json.loads(json.dumps(task["practiceContract"], ensure_ascii=False)),
            "practiceVariants": practice_variants,
            "assessmentBlueprint": {
                "visibleStimulusRequired": True,
                "preRevealTypedResponseRequired": True,
                "selfScoreAllowed": False,
                "modelRevealMakesAttemptIneligible": True,
                "practiceVariantsField": "practiceVariants",
                "requiredPracticeVariantIds": ["primary", "transfer"],
                "requireDifferentPracticeVariantForConfirmation": True,
            },
            "curriculum": {
                "sequence": 900 + question_index,
                "phase": "advanced-after-foundation",
                "priority": 85,
                "prerequisiteIds": list(FOUNDATION_PREREQUISITES),
                "firstSessionEligible": False,
            },
            "sourceTask": task_copy,
        })
    return questions


CARGO_REINSPECTION_PROGRAM = {
    "id": "cargo-reinspection-49-cfr-392-9",
    "profiles": ALL_PROFILES,
    "equipment": [],
    "conditions": ["cargo-securement"],
    "regulation": "49 CFR 392.9(b)(2)-(4)",
    "firstInspection": {"deadlineMiles": 50, "textEn": "Inspect the cargo and securement within the first 50 miles after beginning a trip.", "textRu": "Осмотрите груз и крепление в течение первых 50 миль после начала рейса."},
    "subsequentEvents": [
        {"id": "duty-status-change", "textRu": "После изменения рабочего статуса водителя."},
        {"id": "three-hours", "maximumElapsedMinutes": 180, "textRu": "После трех часов движения."},
        {"id": "one-hundred-fifty-miles", "maximumMiles": 150, "textRu": "После 150 миль движения."},
    ],
    "nextDuePolicy": "At each reinspection, the next due event is the earliest applicable duty-status change, three hours or 150 miles.",
    "nextDuePolicyRu": "После каждой проверки следующий срок наступает при первом из событий: смена рабочего статуса, три часа или 150 миль.",
    "exceptions": [
        {"id": "sealed-cmv", "textRu": "Исключение для опломбированной машины, которую водителю запретили открывать."},
        {"id": "impracticable-to-inspect", "textRu": "Исключение для груза, осмотр которого практически невозможен."},
    ],
    "scoredTasks": cargo_reinspection_scored_tasks(),
    "assessmentBlueprint": {
        "calculateNextDueEvent": True,
        "exceptionsAssessed": True,
        "typedSafetyActionRequired": True,
        "visibleStimulusRequired": True,
        "scoredTaskIdsField": "scoredTasks",
        "requiredTaskIds": [
            "first-50-miles",
            "next-due-duty-status-change",
            "next-due-three-hours",
            "next-due-150-miles",
            "exception-sealed-and-ordered-not-to-open",
            "exception-inspection-impracticable",
            "seal-alone-is-not-universal-exception",
        ],
        "allTaskFamiliesRequired": True,
        "genericRuleStatementFails": True,
        "andInsteadOfEarliestFails": True,
        "universalSealedExceptionFails": True,
        "modelRevealMakesAttemptIneligible": True,
        "practiceVariantsField": "practiceVariants",
        "requiredPracticeVariantIds": ["primary", "transfer"],
        "requireDifferentPracticeVariantForConfirmation": True,
        "practiceVariantSchemaVersion": "cycle3-regulatory-typed-v1",
    },
    "sourceRefs": ["https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-392/section-392.9"],
}
CARGO_REINSPECTION_SCORED_QUESTIONS = cargo_reinspection_scored_questions(CARGO_REINSPECTION_PROGRAM["scoredTasks"])
CARGO_REINSPECTION_PROGRAM["scoredQuestionIds"] = [item["id"] for item in CARGO_REINSPECTION_SCORED_QUESTIONS]
CARGO_REINSPECTION_PROGRAM["scoredQuestions"] = json.loads(
    json.dumps(CARGO_REINSPECTION_SCORED_QUESTIONS, ensure_ascii=False)
)
CARGO_REINSPECTION_PROGRAM["assessmentBlueprint"]["scoredQuestionIdsField"] = "scoredQuestionIds"

BREAKDOWN_WARNING_PROGRAM = {
    "id": "stopped-cmv-warning-devices-49-cfr-392-22",
    "profiles": ALL_PROFILES,
    "equipment": [],
    "conditions": [],
    "regulation": "49 CFR 392.22",
    "sequence": [
        {"order": 1, "deadline": "immediately", "actionEn": "Activate the vehicular hazard warning signal flashers.", "actionRu": "Немедленно включите аварийную световую сигнализацию."},
        {"order": 2, "deadlineMinutes": 10, "actionEn": "Place the required warning devices.", "actionRu": "В течение десяти минут выставьте требуемые предупреждающие устройства."},
    ],
    "placementVariants": [
        {"id": "ordinary-road", "distancesFeet": [10, 100, 100], "descriptionRu": "На обычной дороге: одно устройство у машины со стороны приближающегося транспорта, два других примерно в 100 футах впереди и позади."},
        {"id": "divided-or-one-way", "distancesFeet": [10, 100, 200], "descriptionRu": "На дороге с разделением направлений или односторонним движением: 10 футов позади и 100 и 200 футов в сторону приближающегося транспорта."},
        {"id": "hill-or-curve", "distanceRangeFeet": [100, 500], "descriptionRu": "За холмом, поворотом или другим препятствием добавьте устройство в сторону препятствия на расстоянии от 100 до 500 футов, чтобы обеспечить предупреждение."},
    ],
    "assessmentBlueprint": {"hazardsImmediateRequired": True, "warningDevicesWithinTenMinutesRequired": True, "placementVariantRequired": True, "missingStepFails": True},
    "sourceRefs": ["https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-392/section-392.22"],
}


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def build_fhwa_provenance(signs, built_on):
    source = json.loads((EDITION / "data" / "fhwa-sign-provenance-source.json").read_text(encoding="utf-8"))
    rows = source.get("files", [])
    official = [item for item in signs if item.get("isOfficialSvg")]
    if not (len(rows) == len(official) == 49):
        raise ValueError("FHWA provenance source must contain exactly 49 official SVG rows")
    by_path = {item["assetPath"]: item for item in official}
    if set(by_path) != {item.get("assetPath") for item in rows}:
        raise ValueError("FHWA provenance paths do not match the official sign inventory")
    output_rows = []
    for row in rows:
        sign = by_path[row["assetPath"]]
        if row.get("assetCode") != sign.get("assetCode"):
            raise ValueError(f"FHWA provenance code mismatch: {row.get('assetPath')}")
        archive = source["releaseArchives"].get(row.get("archive"))
        if not archive:
            raise ValueError(f"Unknown FHWA release archive: {row.get('archive')}")
        local_path = APP / row["assetPath"]
        local_sha = file_sha256(local_path)
        if local_sha != row.get("upstreamSha256"):
            raise ValueError(f"FHWA SVG hash differs from upstream archive: {row['assetPath']}")
        output_rows.append({
            **row,
            "releaseDate": archive["releaseDate"],
            "archiveFile": archive["archiveFile"],
            "archiveUrl": archive["archiveUrl"],
            "localSha256": local_sha,
            "verified": True,
        })
    return {
        "version": 1,
        "builtOn": built_on,
        "reviewedOn": source["reviewedOn"],
        "sourceIndex": source["sourceIndex"],
        "policy": "Offline runtime verification uses the local SHA-256 values. Network access is not required by the application.",
        "fileCount": len(output_rows),
        "files": output_rows,
    }


def main(built_on=None):
    built_on = resolve_build_date(built_on)
    hotshot_module = json.loads((EDITION / "data" / "hotshot-module.json").read_text(encoding="utf-8"))
    terms = parse_terminology()
    phrases = parse_required_phrases()
    inspection = parse_inspection_bank()
    questions = build_questions(inspection)
    situation_rows = parse_situations()
    docs = parse_documents()
    signs = build_signs()
    fhwa_sign_provenance = build_fhwa_provenance(signs, built_on)
    diagnostic_inventory, diagnostic_targets, diagnostic_aliases = build_diagnostic_contract()
    visual_manifest = json.loads((APP / "data" / "visual-assets.json").read_text(encoding="utf-8"))
    if len(DIALOGUES) != len(situation_rows):
        raise ValueError(f"Expected {len(situation_rows)} dialogues, got {len(DIALOGUES)}")
    situations = build_base_situations(situation_rows) + build_hotshot_situations(hotshot_module)
    source_count, core = build_core()
    truck = build_truck_units(terms, phrases, questions, docs, signs)
    hotshot = build_hotshot_units(hotshot_module)
    if len(truck) + len(hotshot) != 500:
        raise ValueError("Professional unit count must be 500")
    docs.extend(build_hotshot_documents(hotshot_module))
    lessons = build_lessons(hotshot_module)
    id_migrations = load_id_migrations()
    collections = {
        "words": core + truck + hotshot,
        "questions": questions,
        "situations": situations,
        "signs": signs,
        "documents": docs,
        "lessons": lessons,
    }
    materialize_equipment_requirements(collections)
    attach_curriculum_metadata(collections)
    attach_legacy_ids(collections, id_migrations)
    expected_counts = {"core": 700, "truck": 400, "hotshot": 100, "questions": 75, "situations": 40, "signs": 80, "documents": 24, "lessons": 21}
    actual_counts = {
        "core": len(core), "truck": len(truck), "hotshot": len(hotshot), "questions": len(questions),
        "situations": len(situations), "signs": len(signs), "documents": len(docs), "lessons": len(lessons),
    }
    if actual_counts != expected_counts:
        raise ValueError(f"Course count invariant failed: {actual_counts}")
    data = {
        "version": 3,
        "contentVersion": id_migrations.get("targetContentVersion", 2),
        "builtOn": built_on,
        "sourceCoreCount": source_count,
        "corpusLabel": "Representative training prompts",
        "applicabilityProfiles": [
            {"id": "tractor", "label": "Tractor-trailer"},
            {"id": "hotshot-open", "label": "Hotshot open"},
            {"id": "hotshot-enclosed", "label": "Hotshot enclosed"},
        ],
        "elpStepOneIds": ELP_STEP_ONE_IDS,
        "elpStepOneBlueprint": {
            "version": "seven-functions-v1",
            "construct": "roadside-communication-functions",
            "requiredResponses": len(ELP_STEP_ONE_FUNCTIONS),
            "functions": ELP_STEP_ONE_FUNCTIONS,
            "profileMaterializationRequired": True,
            "officialAssessment": False,
        },
        "diagnosticFormVersion": "cycle3-12x4-v1",
        "diagnosticRecoveryContractVersion": "form-independent-v1",
        "diagnosticItemInventory": diagnostic_inventory,
        "diagnosticRecoveryTargets": diagnostic_targets,
        "diagnosticRecoveryAliases": diagnostic_aliases,
        "elpStepTwoEnglishBearingIds": [item["id"] for item in signs if item["englishBearing"]],
        "elpStepTwoFamiliarizationOnlyIds": [item["id"] for item in signs if not item["englishBearing"]],
        "elpStepTwoCompletionBlueprint": {
            "construct": "english-sign-and-message-reading",
            "eligibleStimulusIdsField": "elpStepTwoEnglishBearingIds",
            "officialEnglishBearingCount": sum(item["isOfficialSvg"] and item["englishBearing"] for item in signs),
            "trainingDmsEnglishBearingCount": sum(item["provenance"] == "training-dms" and item["englishBearing"] for item in signs),
            "requiredScoredAttempts": 12,
            "requiredOfficialSvgAttempts": 8,
            "requiredTrainingDmsAttempts": 4,
            "differentStimulusIdsRequired": True,
            "audioBeforeResultMakesAttemptIneligible": True,
            "modelRevealBeforeResultMakesAttemptIneligible": True,
            "symbolOnlyCards": "unscored-familiarization",
        },
        "fhwaSignProvenance": {
            "manifest": "data/fhwa-sign-provenance.json",
            "fileCount": fhwa_sign_provenance["fileCount"],
            "runtimeNetworkRequired": False,
        },
        "professionalUnits": {
            "count": 500,
            "label": "500 professional units",
            "unitPolicy": "A unit is a learning task, not necessarily a unique surface term.",
            "duplicatePolicy": "Exact normalized surface duplicates are not allowed. Related concepts remain separate only when equipment context or retrieval objective differs.",
            "resolvedConceptPairs": [
                {"baseId": "t:term:trailer-axle", "specializedId": "h:trailer-axle", "specializedForm": "Hotshot trailer axle"},
                {"baseId": "t:term:axle-weight", "specializedId": "h:axle-weight", "specializedForm": "individual axle weight"},
            ],
        },
        "documentWalletAdditions": [
            {
                "id": "wallet:pickup-registration",
                "titleRu": "Регистрация пикапа",
                "profiles": HOTSHOT_PROFILES,
                "conditions": ["registration-required"],
                "status": "carry-or-trip",
            },
        ],
        "eldInformationPacket": {
            "effectiveFrom": "2026-07-22",
            "conditions": ["eld-required"],
            "requiredDocumentIds": [
                "document:eld-transfer-instructions",
                "document:eld-malfunction-instructions",
                "document:blank-paper-rods",
            ],
            "minimumBlankGraphGridDays": 8,
            "optionalDeviceHelpDocumentIds": ["document:eld-user-manual-locator"],
            "summaryEn": "Federal onboard packet: data transfer instructions, malfunction instructions, and enough blank graph grids for at least eight days. The ELD user manual is optional device help, not a federally required onboard item.",
            "summaryRu": "Федеральный комплект на борту: инструкция по передаче данных, инструкция при неисправности и чистые графические сетки минимум на восемь дней. Руководство ELD является необязательной помощью по устройству.",
            "sourceRefs": [
                "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-B/section-395.22",
                "https://www.federalregister.gov/documents/2026/06/22/2026-12448/rescinding-the-requirement-for-electronic-logging-device-operators-manual-located-in-commercial",
            ],
        },
        "cdlApplicabilityPolicy": {
            "rule": "49 CFR 383.91(a)(1)",
            "groupAThreshold": "GCWR of 26,001 pounds or more when the towed unit has a GVWR over 10,000 pounds",
            "ruleRu": "Для группы A порог составляет GCWR не менее 26 001 фунта при GVWR буксируемой единицы более 10 000 фунтов.",
            "hotshotTrainingCombinationRatingLb": 39900,
            "requiredCondition": "cdl-required",
            "sourceRefs": ["https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-383/subpart-F/section-383.91"],
        },
        "cargoSecurementPrograms": CARGO_SECUREMENT_PROGRAMS,
        "cargoReinspectionProgram": CARGO_REINSPECTION_PROGRAM,
        "diagnosticProfileCargoMaterializations": DIAGNOSTIC_PROFILE_CARGO_MATERIALIZATIONS,
        "regulatoryScoredQuestions": CARGO_REINSPECTION_SCORED_QUESTIONS,
        "breakdownWarningProgram": BREAKDOWN_WARNING_PROGRAM,
        "curriculumPlan": {
            "policy": "Foundation before advanced compliance detail, with controlled interleaving after prerequisites.",
            "policyRu": "Сначала личные данные, уточнение, безопасная остановка и запрет эксплуатации. Затем постепенно добавляются журналы, передача данных ELD, весовая и нагрузка на сцепку.",
            "foundationIds": sorted(FOUNDATION_CURRICULUM_IDS),
            "advancedIds": sorted(ADVANCED_CURRICULUM_IDS),
            "requiredBeforeAdvanced": FOUNDATION_PREREQUISITES,
            "firstSessionMaximumAdvancedItems": 0,
        },
        "applicabilityInventory": {
            **build_applicability_inventory(collections),
            "regulatoryScoredQuestions": {
                item["id"]: {
                    "profiles": list(item["profiles"]),
                    "equipment": list(item["equipment"]),
                    "conditions": list(item["conditions"]),
                }
                for item in CARGO_REINSPECTION_SCORED_QUESTIONS
            },
        },
        "idMigrations": id_migrations,
        "core": core,
        "truck": truck,
        "hotshot": hotshot,
        "inspectionLevels": INSPECTION_LEVELS,
        "inspectionQuestions": questions,
        "situations": situations,
        "signs": signs,
        "documents": docs,
        "lessons": lessons,
        "visualAssets": remap_visual_assets(visual_manifest["assets"], id_migrations),
        "stats": {
            "generalCore": len(core),
            "truckTrack": len(truck),
            "hotshotTrack": len(hotshot),
            "professionalUnits": len(truck) + len(hotshot),
            "inspectionQuestions": len(questions),
            "regulatoryScoredQuestions": len(CARGO_REINSPECTION_SCORED_QUESTIONS),
            "situations": len(situations),
            "signs": len(signs),
            "officialSignSvgs": sum(item["provenance"] == "fhwa-mutcd-shs" for item in signs),
            "variableLocalSigns": sum(item["provenance"] == "variable-local" for item in signs),
            "trainingDms": sum(item["provenance"] == "training-dms" for item in signs),
            "documents": len(docs),
            "lessons": len(lessons),
            "legacyIdMigrations": len(id_migrations.get("migrations", {})),
        },
    }
    out = APP / "data" / "course-data.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (APP / "data" / "course-data.js").write_text(
        "window.COURSE_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    (APP / "data" / "fhwa-sign-provenance.json").write_text(
        json.dumps(fhwa_sign_provenance, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    report = {
        "builtOn": built_on,
        "sourceCore": source_count,
        "selectedCore": len(core),
        "excludedCore": source_count - len(core),
        "truckUnits": len(truck),
        "hotshotUnits": len(hotshot),
        "professionalUnits": len(truck) + len(hotshot),
        "inspectionQuestions": len(questions),
        "regulatoryScoredQuestions": len(CARGO_REINSPECTION_SCORED_QUESTIONS),
        "situations": len(situations),
        "signs": len(signs),
        "officialSignSvgs": data["stats"]["officialSignSvgs"],
        "variableLocalSigns": data["stats"]["variableLocalSigns"],
        "trainingDms": data["stats"]["trainingDms"],
        "documents": len(docs),
        "lessons": len(lessons),
        "legacyIdMigrations": data["stats"]["legacyIdMigrations"],
        "truckSelection": {
            "terminology": 120,
            "requiredPhrases": 30,
            "representativePromptAndAnswerUnits": 144,
            "documentPhrases": 20,
            "professionalPriorityPhrases": 44,
            "signActions": 42,
        },
        "pronunciationReview": json.loads((EDITION / "data" / "pronunciation-lexicon.json").read_text(encoding="utf-8")).get("review", {}),
    }
    (APP / "data" / "build-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--built-on", help="Deterministic build date in YYYY-MM-DD. SOURCE_DATE_EPOCH is also supported.")
    arguments = parser.parse_args()
    main(arguments.built_on)
