from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class FieldSpec:
    name: str
    label: str
    type: str = "text"
    required: bool = False
    placeholder: str = ""
    default: Any = ""


@dataclass(frozen=True)
class TemplateSchema:
    template_type: str
    title: str
    description: str
    supports_images: bool = False
    fields: list[FieldSpec] = field(default_factory=list)
    item_fields: list[FieldSpec] = field(default_factory=list)


def text(name: str, label: str, default: str = "", *, required: bool = False) -> FieldSpec:
    return FieldSpec(name=name, label=label, default=default, required=required)


def area(name: str, label: str, default: str = "", *, required: bool = False) -> FieldSpec:
    return FieldSpec(name=name, label=label, type="textarea", default=default, required=required)


ORG_FIELDS = [
    text("название_организации", "Организация", "ООО «Север»", required=True),
    text("полное_наименование_организации", "Полное наименование", "Общество с ограниченной ответственностью «Север»"),
    text("огрн_организации", "ОГРН", "1000000000000"),
    text("инн_организации", "ИНН организации", "7700000000", required=True),
    text("кпп_организации", "КПП организации", "770001001"),
    area("адрес_организации", "Юридический адрес", "г. Москва, ул. Примерная, д. 1"),
    text("телефон", "Телефон", "+7 (900) 000-00-00"),
    text("email", "Адрес электронной почты", "office@example.test"),
    text("банк", "Банк", "Демонстрационный банк"),
    text("бик", "БИК", "040000000"),
    text("расчетный_счет", "Расчётный счёт", "40700000000000000000"),
    text("корр_счет", "Корр. счёт", "30100000000000000000"),
]

ITEM_FIELDS = [
    text("наименование", "Наименование", "Комплект демонстрационного оборудования", required=True),
    text("артикул", "Артикул / код", "DEMO-01"),
    text("единица", "Ед.", "шт"),
    text("количество", "Кол-во", "2", required=True),
    text("цена", "Цена", "125000", required=True),
]


def get_template_schemas() -> dict[str, TemplateSchema]:
    return {
        "kommercheskoe_predlozhenie": TemplateSchema(
            template_type="kommercheskoe_predlozhenie",
            title="Коммерческое предложение",
            description="Синтетическое коммерческое предложение с табличной частью.",
            supports_images=True,
            fields=[
                *ORG_FIELDS,
                area("правый_адресат_шапки", "Получатель", "ООО «Партнёр»\nОтдел закупок"),
                text("номер_документа", "Исх. № / № КП", "DEMO-12", required=True),
                FieldSpec("дата_документа", "Дата", type="date", required=True, default="05.08.2026"),
                text("обращение", "Обращение", "Уважаемые коллеги!"),
                area(
                    "тема",
                    "Текст предложения",
                    "Предлагаем рассмотреть поставку демонстрационной партии продукции на условиях, указанных ниже.",
                    required=True,
                ),
                area("условия", "Условия / примечания", "Срок поставки — 20 рабочих дней. Предложение действительно 30 дней."),
                text("приложение_текст", "Текст приложения", "1. Спецификация продукции."),
                text("подписант_должность", "Должность подписанта", "Генеральный директор"),
                text("подписант_фио", "ФИО подписанта", "И.И. Иванов"),
            ],
            item_fields=ITEM_FIELDS,
        ),
        "dogovor_izgotovlenie_postavka": TemplateSchema(
            template_type="dogovor_izgotovlenie_postavka",
            title="Договор на изготовление и поставку товара",
            description="Синтетический договор с приложением-спецификацией.",
            fields=[
                text("номер_документа", "№ договора", "DEMO-18/2026", required=True),
                text("место_заключения", "Место заключения", "г. Москва", required=True),
                FieldSpec("дата_документа", "Дата договора", type="date", required=True, default="05.08.2026"),
                area("заказчик_полное", "Заказчик — полное наименование", "ООО «Партнёр»", required=True),
                text("заказчик_краткое", "Заказчик — кратко", "ООО «Партнёр»", required=True),
                text("заказчик_основание", "Основание Заказчика", "Устав"),
                text("заказчик_инн", "ИНН Заказчика", "7700000001"),
                text("заказчик_огрн", "ОГРН Заказчика", "1000000000001"),
                area("заказчик_адрес", "Адрес Заказчика", "г. Москва, ул. Тестовая, д. 2"),
                text("заказчик_банк", "Банк Заказчика", "Демонстрационный банк"),
                text("заказчик_рс", "Р/с Заказчика", "40700000000000000001"),
                text("заказчик_кс", "К/с Заказчика", "30100000000000000001"),
                text("заказчик_бик", "БИК Заказчика", "040000001"),
                text("заказчик_email", "E-mail Заказчика", "partner@example.test"),
                text("заказчик_подписант", "Подписант Заказчика", "П.П. Петров"),
                area("исполнитель_полное", "Исполнитель — полное наименование", "ООО «Север»", required=True),
                text("исполнитель_краткое", "Исполнитель — кратко", "ООО «Север»", required=True),
                text("исполнитель_основание", "Основание Исполнителя", "Устав"),
                text("исполнитель_инн", "ИНН Исполнителя", "7700000000"),
                text("исполнитель_огрн", "ОГРН Исполнителя", "1000000000000"),
                text("исполнитель_свидетельство", "Свидетельство", "Демонстрационные данные"),
                area("исполнитель_адрес", "Адрес Исполнителя", "г. Москва, ул. Примерная, д. 1"),
                text("исполнитель_налогообложение", "Налогообложение", "ОСНО"),
                text("исполнитель_рс", "Р/с Исполнителя", "40700000000000000000"),
                text("исполнитель_банк", "Банк Исполнителя", "Демонстрационный банк"),
                text("исполнитель_бик", "БИК Исполнителя", "040000000"),
                text("исполнитель_кс", "К/с Исполнителя", "30100000000000000000"),
                text("исполнитель_телефон", "Телефон Исполнителя", "+7 (900) 000-00-00"),
                text("исполнитель_email", "E-mail Исполнителя", "office@example.test"),
                text("исполнитель_подписант", "Подписант Исполнителя", "И.И. Иванов"),
                area("предмет_товара", "Предмет / тип товара", "оборудования"),
                text("срок_действия_договора", "Действует до", "31.12.2026 г."),
            ],
            item_fields=ITEM_FIELDS,
        ),
        "doverennost": TemplateSchema(
            template_type="doverennost",
            title="Доверенность",
            description="Синтетическая доверенность на представителя.",
            fields=[
                *ORG_FIELDS,
                text("гриф", "Гриф", "Демонстрационный образец"),
                text("дата_прописью", "Дата прописью", "Пятое августа две тысячи двадцать шестого года", required=True),
                text("город", "Город", "Город Москва", required=True),
                text("номер_документа", "№ доверенности", "DEMO-1", required=True),
                text("директор_фио", "Генеральный директор", "Ивана Ивановича Иванова", required=True),
                text("директор_инициалы", "Подпись директора", "И.И. Иванов", required=True),
                text("представитель_фио", "Представитель ФИО", "Петра Петровича Петрова", required=True),
                text("представитель_фио_именительный", "Представитель для подписи", "П.П. Петров", required=True),
                text("паспорт_серия", "Паспорт серия", "00 00"),
                text("паспорт_номер", "Паспорт №", "000000"),
                area("паспорт_выдан", "Кем/когда выдан", "Демонстрационные данные"),
                text("код_подразделения", "Код подразделения", "000-000"),
                area("контрагент_по_тс", "Контрагент по ТС", "ООО «Авто-Демо»"),
                text("марка_модель", "Марка модель ТС", "DEMO VAN"),
                text("vin", "VIN", "DEMO0000000000000"),
                text("тип_тс", "Тип ТС", "N1"),
                text("год_выпуска", "Год выпуска", "2026"),
                text("категория", "Категория", "B"),
                text("шасси", "Шасси", "Отсутствует"),
                text("эптс", "Выписка из ЭПТС", "DEMO-ЭПТС"),
                text("срок_доверенности", "Срок действия", "31 декабря 2026 г."),
                text("год_подписания", "Год в строке подписи", "2026"),
            ],
        ),
    }


def schemas_as_dict() -> dict[str, dict[str, Any]]:
    return {
        key: {
            "template_type": schema.template_type,
            "title": schema.title,
            "description": schema.description,
            "supports_images": schema.supports_images,
            "fields": [asdict(item) for item in schema.fields],
            "item_fields": [asdict(item) for item in schema.item_fields],
        }
        for key, schema in get_template_schemas().items()
    }
