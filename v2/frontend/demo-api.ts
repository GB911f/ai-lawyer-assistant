import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

type DemoField = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  default?: string;
};

const field = (
  name: string,
  label: string,
  defaultValue = "",
  type = "text",
  required = false,
): DemoField => ({ name, label, default: defaultValue, type, required });

const itemFields = [
  field("наименование", "Наименование", "Комплект поставки", "text", true),
  field("артикул", "Артикул / код", "DEMO-01"),
  field("единица", "Ед.", "шт"),
  field("количество", "Кол-во", "2", "text", true),
  field("цена", "Цена", "125000", "text", true),
];

const orgFields = [
  field("название_организации", "Организация", "ООО «Север»", "text", true),
  field("полное_наименование_организации", "Полное наименование", "Общество с ограниченной ответственностью «Север»"),
  field("огрн_организации", "ОГРН", "1000000000000"),
  field("инн_организации", "ИНН организации", "7700000000", "text", true),
  field("кпп_организации", "КПП организации", "770001001"),
  field("адрес_организации", "Юридический адрес", "г. Москва, ул. Примерная, д. 1", "textarea"),
  field("телефон", "Телефон", "+7 (900) 000-00-00"),
  field("email", "Адрес электронной почты", "office@example.test"),
  field("банк", "Банк", "Демонстрационный банк"),
  field("бик", "БИК", "040000000"),
  field("расчетный_счет", "Расчётный счёт", "40700000000000000000"),
  field("корр_счет", "Корр. счёт", "30100000000000000000"),
];

const schemas = {
  kommercheskoe_predlozhenie: {
    template_type: "kommercheskoe_predlozhenie",
    title: "Коммерческое предложение",
    description: "Синтетический демонстрационный шаблон.",
    supports_images: true,
    fields: [
      ...orgFields,
      field("правый_адресат_шапки", "Получатель в правом блоке шапки", "ООО «Партнёр»\nОтдел закупок", "textarea"),
      field("номер_документа", "Исх. № / № КП", "DEMO-12", "text", true),
      field("дата_документа", "Дата", "05.08.2026", "date", true),
      field("обращение", "Обращение", "Уважаемые коллеги!"),
      field("тема", "Текст предложения", "Предлагаем рассмотреть поставку демонстрационной партии продукции на условиях, указанных ниже.", "textarea", true),
      field("условия", "Условия / примечания", "Срок поставки — 20 рабочих дней. Предложение действительно 30 дней.", "textarea"),
      field("приложение_текст", "Текст приложения", "1. Спецификация продукции."),
      field("подписант_должность", "Должность подписанта", "Генеральный директор"),
      field("подписант_фио", "ФИО подписанта", "И.И. Иванов"),
    ],
    item_fields: itemFields,
  },
  dogovor_izgotovlenie_postavka: {
    template_type: "dogovor_izgotovlenie_postavka",
    title: "Договор на изготовление и поставку товара",
    description: "Синтетический договор с приложением-спецификацией.",
    supports_images: false,
    fields: [
      field("номер_документа", "№ договора", "DEMO-18/2026", "text", true),
      field("место_заключения", "Место заключения", "г. Москва", "text", true),
      field("дата_документа", "Дата договора", "05.08.2026", "date", true),
      field("заказчик_полное", "Заказчик — полное наименование", "ООО «Партнёр»", "textarea", true),
      field("заказчик_краткое", "Заказчик — кратко", "ООО «Партнёр»", "text", true),
      field("заказчик_основание", "Основание Заказчика", "Устав"),
      field("заказчик_инн", "ИНН Заказчика", "7700000001"),
      field("заказчик_огрн", "ОГРН Заказчика", "1000000000001"),
      field("заказчик_адрес", "Адрес Заказчика", "г. Москва, ул. Тестовая, д. 2", "textarea"),
      field("заказчик_банк", "Банк Заказчика", "Демонстрационный банк"),
      field("заказчик_рс", "Р/с Заказчика", "40700000000000000001"),
      field("заказчик_кс", "К/с Заказчика", "30100000000000000001"),
      field("заказчик_бик", "БИК Заказчика", "040000001"),
      field("заказчик_email", "E-mail Заказчика", "partner@example.test"),
      field("заказчик_подписант", "Подписант Заказчика", "П.П. Петров"),
      field("исполнитель_полное", "Исполнитель — полное наименование", "ООО «Север»", "textarea", true),
      field("исполнитель_краткое", "Исполнитель — кратко", "ООО «Север»", "text", true),
      field("исполнитель_основание", "Основание Исполнителя", "Устав"),
      field("исполнитель_инн", "ИНН Исполнителя", "7700000000"),
      field("исполнитель_огрн", "ОГРН Исполнителя", "1000000000000"),
      field("исполнитель_свидетельство", "Свидетельство", "Демонстрационные данные"),
      field("исполнитель_адрес", "Адрес Исполнителя", "г. Москва, ул. Примерная, д. 1", "textarea"),
      field("исполнитель_налогообложение", "Налогообложение", "ОСНО"),
      field("исполнитель_рс", "Р/с Исполнителя", "40700000000000000000"),
      field("исполнитель_банк", "Банк Исполнителя", "Демонстрационный банк"),
      field("исполнитель_бик", "БИК Исполнителя", "040000000"),
      field("исполнитель_кс", "К/с Исполнителя", "30100000000000000000"),
      field("исполнитель_телефон", "Телефон Исполнителя", "+7 (900) 000-00-00"),
      field("исполнитель_email", "E-mail Исполнителя", "office@example.test"),
      field("исполнитель_подписант", "Подписант Исполнителя", "И.И. Иванов"),
      field("предмет_товара", "Предмет / тип товара", "оборудования", "textarea"),
      field("срок_действия_договора", "Действует до", "31.12.2026 г."),
    ],
    item_fields: itemFields,
  },
  doverennost: {
    template_type: "doverennost",
    title: "Доверенность",
    description: "Синтетический шаблон доверенности.",
    supports_images: false,
    fields: [
      ...orgFields,
      field("гриф", "Гриф", "Демонстрационный образец"),
      field("дата_прописью", "Дата прописью", "Пятое августа две тысячи двадцать шестого года", "text", true),
      field("город", "Город", "Город Москва", "text", true),
      field("номер_документа", "№ доверенности", "DEMO-1", "text", true),
      field("директор_фио", "Генеральный директор", "Ивана Ивановича Иванова", "text", true),
      field("директор_инициалы", "Подпись директора", "И.И. Иванов", "text", true),
      field("представитель_фио", "Представитель ФИО", "Петра Петровича Петрова", "text", true),
      field("представитель_фио_именительный", "Представитель для подписи", "П.П. Петров", "text", true),
      field("паспорт_серия", "Паспорт серия", "00 00"),
      field("паспорт_номер", "Паспорт №", "000000"),
      field("паспорт_выдан", "Кем/когда выдан", "Демонстрационные данные", "textarea"),
      field("код_подразделения", "Код подразделения", "000-000"),
      field("контрагент_по_тс", "Контрагент по ТС", "ООО «Авто-Демо»", "textarea"),
      field("марка_модель", "Марка модель ТС", "DEMO VAN"),
      field("vin", "VIN", "DEMO0000000000000"),
      field("тип_тс", "Тип ТС", "N1"),
      field("год_выпуска", "Год выпуска", "2026"),
      field("категория", "Категория", "B"),
      field("шасси", "Шасси", "Отсутствует"),
      field("эптс", "Выписка из ЭПТС", "DEMO-ЭПТС"),
      field("срок_доверенности", "Срок действия", "31 декабря 2026 г."),
      field("год_подписания", "Год в строке подписи", "2026"),
    ],
    item_fields: [],
  },
};

const demoDocuments = [
  { id: "demo-1", name: "Договор_поставки_DEMO-18.pdf", type: "contracts", file_path: "/demo/contract-18.pdf", size_bytes: 428_000 },
  { id: "demo-2", name: "Акт_приёма-передачи_DEMO-7.docx", type: "acts", file_path: "/demo/acceptance-7.docx", size_bytes: 84_000 },
  { id: "demo-3", name: "Претензия_контрагенту_DEMO.pdf", type: "letters", file_path: "/demo/claim.pdf", size_bytes: 192_000 },
];

function json(res: ServerResponse, value: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", () => resolve(body));
  });
}

function sendChatDemo(res: ServerResponse) {
  const citations = [
    {
      document_name: "Гражданский кодекс РФ — общие положения о поставке",
      document_type: "legal",
      file_path: "/demo/legal-corpus/supply.md",
      chunk_text: "Демонстрационный фрагмент правового источника о сроках поставки, ответственности сторон и порядке предъявления требований.",
      cited_text: "Срок исполнения и последствия просрочки должны быть определены договором.",
      relevance_score: 0.94,
    },
    {
      document_name: "Обзор договорных рисков",
      document_type: "web",
      file_path: "",
      url: "https://example.com/legal-review",
      chunk_text: "Демонстрационный веб-источник.",
      cited_text: "Проверьте порядок приёмки, уведомлений и ограничения ответственности.",
      relevance_score: 0.88,
    },
  ];
  const answer = "## Коротко\n\nВ проекте договора стоит усилить три блока: **срок поставки**, **порядок приёмки** и **ответственность за просрочку**.\n\n### Красные флаги\n\n- нет точного события, от которого считается срок;\n- не установлен срок направления мотивированных замечаний;\n- ответственность поставщика ограничена без встречного ограничения заказчика.\n\n### Практически\n\nЗакрепите календарную дату поставки, пятидневный срок приёмки и отдельную неустойку за каждый день просрочки. Перед подписанием документ должен проверить юрист.";
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.write(`event: tool_start\ndata: ${JSON.stringify({ name: "mcp__legal__search_kp" })}\n\n`);
  res.write(`event: tool_end\ndata: ${JSON.stringify({ name: "mcp__legal__search_kp" })}\n\n`);
  res.write(`event: tool_start\ndata: ${JSON.stringify({ name: "WebSearch" })}\n\n`);
  res.write(`event: tool_end\ndata: ${JSON.stringify({ name: "WebSearch" })}\n\n`);
  res.write(`event: text\ndata: ${JSON.stringify({ delta: answer })}\n\n`);
  res.write(`event: citations\ndata: ${JSON.stringify({ items: citations })}\n\n`);
  res.write(`event: done\ndata: ${JSON.stringify({ citations })}\n\n`);
  res.end();
}

export default function demoApi(): Plugin {
  return {
    name: "jarvis-safe-demo-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://127.0.0.1:5173");
        const path = url.pathname;

        if (path === "/auth/me" || path === "/auth/login") {
          return json(res, { user: { id: 1, username: "demo", full_name: "Демо-пользователь", role: "admin" } });
        }
        if (path === "/auth/logout" || path === "/frontend-error") return json(res, { ok: true });
        if (path === "/index/status") return json(res, { total_documents: 1248, by_type: { legal: 1120, contracts: 48, acts: 80 } });
        if (path === "/documents/") return json(res, demoDocuments);
        if (path === "/documents/summary/stats") return json(res, { total: 3, done: 3, pending: 0, running: 0, failed: 0, skipped: 0, not_started: 0 });
        if (path === "/documents/summary/enqueue-all") return json(res, { enqueued: 0, total_candidates: 3 });
        if (path === "/documents/summary/enqueue" || path === "/documents/summary") {
          return json(res, {
            file_path: url.searchParams.get("path") || "/demo/document.pdf",
            summary: "Документ определяет предмет поставки, срок исполнения и порядок расчётов. Для демонстрации отмечены риски по приёмке, ответственности и уведомлениям.",
            model: "demo-local-model",
            status: "done",
            analyzed_at: "2026-08-05T12:00:00Z",
            error: null,
          });
        }
        if (path === "/documents/content") {
          return json(res, {
            title: "Демонстрационный правовой источник",
            file_name: "supply.md",
            document_type: "legal",
            file_path: url.searchParams.get("path") || "/demo/legal-corpus/supply.md",
            content: "# Поставка и ответственность сторон\n\nЭто синтетический фрагмент источника для безопасной демонстрации интерфейса. Он не является юридической консультацией.",
            is_html: false,
          });
        }
        if (path === "/documents/deep-analyze/stream") {
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          res.write(`event: tool_start\ndata: ${JSON.stringify({ name: "Read" })}\n\n`);
          res.write(`event: tool_end\ndata: ${JSON.stringify({ name: "Read" })}\n\n`);
          res.write(`event: text\ndata: ${JSON.stringify({ delta: "## Глубокая аналитика\n\nОбнаружены потенциальные риски в сроках поставки, порядке приёмки и формулировке ответственности. Данные в этой демоверсии полностью синтетические." })}\n\n`);
          res.write(`event: done\ndata: {}\n\n`);
          return res.end();
        }
        if (path === "/templates/schemas") return json(res, schemas);
        if (path === "/templates/generate") {
          const raw = await readBody(req);
          let body: Record<string, any> = {};
          try { body = JSON.parse(raw || "{}"); } catch { /* demo fallback */ }
          const items = Array.isArray(body.items) ? body.items : [];
          const total = items.reduce((sum: number, item: Record<string, string>) => {
            return sum + (Number(String(item.количество || "0").replace(",", ".")) || 0) * (Number(String(item.цена || "0").replace(",", ".")) || 0);
          }, 0);
          return json(res, {
            template_type: body.template_type || "kommercheskoe_predlozhenie",
            fields: body.fields || {},
            items,
            images: body.images || [],
            total,
            markdown: "# Демонстрационный документ\n\nДокумент сформирован из синтетического шаблона.",
          });
        }
        if (path.startsWith("/templates/export/")) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/octet-stream");
          res.setHeader("Content-Disposition", "attachment; filename=jarvis-demo-document.txt");
          return res.end("Jarvis safe demo document — synthetic data only.");
        }
        if (path === "/chat/direct/stream" || path === "/chat/with-files/stream") return sendChatDemo(res);
        if (path === "/gdrive/status") return json(res, { connected: false, email: null });
        if (path === "/health") return json(res, { status: "demo" });

        next();
      });
    },
  };
}
