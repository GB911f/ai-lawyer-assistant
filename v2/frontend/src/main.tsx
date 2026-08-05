const _BUILD="1778714026";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Screen = "dashboard" | "researcher" | "constructor" | "search" | "analytics" | "settings";
type TemplateType = "kommercheskoe_predlozhenie" | "dogovor_izgotovlenie_postavka" | "doverennost";
// Пустой API_BASE → same-origin: фронт ходит на тот же хост, с которого его открыли.
// Это позволяет LAN-доступ (192.168.0.x:8000) и cloudflare-туннель работать без перебилда.
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

type AuthUser = { id: number; username: string; full_name: string | null; role: string };
const AuthContext = React.createContext<{ user: AuthUser | null; setUser: (u: AuthUser | null) => void }>({
  user: null,
  setUser: () => {},
});

const nav = [
  ["dashboard", "dashboard", "Панель управления", true],
  ["researcher", "account_tree", "Исследователь", true],
  ["constructor", "architecture", "Конструктор", true],
  ["search", "search", "Внутренний поиск", true],
  ["analytics", "rule", "Аналитика", false],
  ["settings", "settings", "Настройки", false],
] as const;

const templateLabels: Record<TemplateType, string> = {
  kommercheskoe_predlozhenie: "Коммерческое предложение",
  dogovor_izgotovlenie_postavka: "Договор на изготовление и поставку товара",
  doverennost: "Доверенность",
};

type Citation = {
  document_name: string;
  document_type?: string;  // "legal" — КП, "web" — веб-результат
  document_subtype?: string;
  file_path: string;
  chunk_text: string;
  relevance_score?: number;
  metadata?: Record<string, any>;
  cited_text?: string; // Claude Citations API: exact quoted passage
  url?: string;        // для веб-результатов
  page_age?: string | null;
};
type DownloadItem = { name: string; url: string; size?: number };
type ToolStep = { name: string; status: "running" | "done" };
type Message = { role: "user" | "assistant"; content: string; citations?: Citation[]; createdAt: string; downloads?: DownloadItem[]; attachedFiles?: {name: string; size: number}[]; tools?: ToolStep[] };

const TOOL_LABELS: Record<string, string> = {
  Read: "Читает файл",
  Write: "Создаёт файл",
  Edit: "Редактирует файл",
  Bash: "Запускает код",
  Glob: "Ищет файлы",
  Grep: "Поиск в текстах",
  WebSearch: "Поиск в интернете",
  WebFetch: "Открывает страницу",
  mcp__legal__search_kp: "Ищет в КонсультантПлюс",
  mcp__legal__search_kp_regional_moscow: "КП Москва (по номеру)",
};
function toolLabel(name: string): string {
  return TOOL_LABELS[name] || name;
}
type Attachment = { name: string; size: number; type: string };
type SessionFile = { file_id: string; name: string; mime_type: string };
type Session = { id: string; title: string; messages: Message[]; attachments: Attachment[]; fileIds?: SessionFile[]; updatedAt: string };
type FieldSpec = { name: string; label: string; type: string; required?: boolean; placeholder?: string; default?: any };
type TemplateSchema = { template_type: TemplateType; title: string; supports_images: boolean; fields: FieldSpec[]; item_fields: FieldSpec[] };
type ImagePayload = { name: string; data_url: string };
type GeneratedDoc = { template_type: TemplateType; fields: Record<string, any>; items: Record<string, any>[]; images: ImagePayload[]; total: number; markdown: string };
type IndexStatus = { total_documents?: number; by_type?: Record<string, number> };
type DriveFile = {
  id: string; name: string; mime_type: string; is_folder: boolean;
  size_bytes: number | null; modified_at: string | null;
  web_view_link: string | null; icon_link: string | null;
};
type DriveStatus = { connected: boolean; email?: string | null; error?: string | null };
type DocumentContent = { title: string; file_name: string; document_type?: string; content: string; file_path: string; is_html?: boolean };
type DocumentInfo = { id: string; name: string; type: string; file_path: string; size_bytes: number };
type AnalysisResponse = { answer: string; citations: Citation[]; document_text?: string; file_name?: string };
type OutgoingDoc = { id: string; title: string; type: TemplateType; createdAt: string; generated: GeneratedDoc };

type FilesBySession = Record<string, File[]>;
type ContractWizardData = {
  templateType: TemplateType;
  contractNumber: string;
  templateDocx: File | null;
  customerCard: File | null;
  executorCard: File | null;
};

function cx(...xs: (string | false | null | undefined)[]) { return xs.filter(Boolean).join(" "); }
function api(path: string) { return `${API_BASE}${path}`; }

// Все запросы к API идут через apiFetch — добавляет credentials и эмитит событие при 401,
// чтобы AuthGate показал страницу логина.
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(api(path), { credentials: "include", ...init });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent("jarvis:unauthorized"));
  }
  return res;
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}
function Icon({ name }: { name: string }) { return <span className="material-symbols-outlined">{name}</span>; }
function SparklesIcon({ className = "" }: { className?: string }) {
  return <svg className={cx("sparkles-icon", className)} viewBox="0 0 64 64" aria-hidden="true">
    <path d="M25.5 4.5 31.2 20l15.6 5.7-15.6 5.8-5.7 15.5-5.8-15.5L4.2 25.7 19.7 20 25.5 4.5Z"/>
    <path d="M48.5 4.5 52 14l9.5 3.5L52 21l-3.5 9.5L45 21l-9.5-3.5L45 14l3.5-9.5Z"/>
    <path d="M47 35.5 51.3 47l11.5 4.3-11.5 4.2L47 67l-4.2-11.5-11.6-4.2L42.8 47 47 35.5Z"/>
  </svg>;
}
function uuid(): string { const b = new Uint8Array(16); crypto.getRandomValues(b); b[6]=(b[6]&0x0f)|0x40; b[8]=(b[8]&0x3f)|0x80; return [...b].map((v,i)=>([4,6,8,10].includes(i)?'-':'')+v.toString(16).padStart(2,'0')).join(''); }
function now() { return new Date().toISOString(); }
function time(iso: string) { return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }); }
function truncate(s: string, n = 48) { const x = (s || "").replace(/\s+/g, " ").trim(); return x.length > n ? x.slice(0, n - 1) + "…" : x; }
// Цитаты КП весят ~3-4 KB на штуку (chunk_text + cited_text по 1800 символов). На длинных
// чатах localStorage (5-10 МБ) переполняется и setItem кидает QuotaExceededError. Поэтому
// при сохранении укорачиваем тяжёлые поля до 400 символов — для отображения хватит.
const _CIT_CAP = 400;
function _compactCitations(citations: Citation[] | undefined): Citation[] | undefined {
  if (!citations || !citations.length) return citations;
  return citations.map(c => ({
    ...c,
    chunk_text: typeof c.chunk_text === "string" && c.chunk_text.length > _CIT_CAP ? c.chunk_text.slice(0, _CIT_CAP) + "…" : c.chunk_text,
    cited_text: typeof c.cited_text === "string" && c.cited_text.length > _CIT_CAP ? c.cited_text.slice(0, _CIT_CAP) + "…" : c.cited_text,
  }));
}
function _compactSessionsForStorage(sessions: Session[]): Session[] {
  return sessions.map(s => ({
    ...s,
    messages: s.messages.map(m => ({
      ...m,
      citations: _compactCitations(m.citations),
      // blob: URL после перезагрузки страницы недействительны — выкидываем
      downloads: undefined,
    })),
  }));
}
function loadSessions(): Session[] {
  try { return JSON.parse(localStorage.getItem("jarvis_chats") || "[]"); }
  catch { return []; }
}
function saveSessions(s: Session[]) {
  try {
    localStorage.setItem("jarvis_chats", JSON.stringify(s));
    return;
  } catch (e: any) {
    if (e?.name !== "QuotaExceededError" && !String(e).includes("Quota") && !String(e).includes("exceeded")) {
      throw e;
    }
  }
  // Шаг 1: укорачиваем тяжёлые поля цитат
  let compact = _compactSessionsForStorage(s);
  try { localStorage.setItem("jarvis_chats", JSON.stringify(compact)); return; } catch { /* fall through */ }
  // Шаг 2: оставляем только последние 20 чатов
  compact = compact.slice(0, 20);
  try { localStorage.setItem("jarvis_chats", JSON.stringify(compact)); return; } catch { /* fall through */ }
  // Шаг 3: только последние 5
  compact = compact.slice(0, 5);
  try { localStorage.setItem("jarvis_chats", JSON.stringify(compact)); return; } catch { /* fall through */ }
  // Шаг 4: совсем сдаёмся — очищаем (юзер всё равно ничего не увидит из памяти, лучше чем краш)
  try { localStorage.removeItem("jarvis_chats"); } catch { /* ignore */ }
}
function loadOutgoing(): OutgoingDoc[] { try { return JSON.parse(localStorage.getItem("jarvis_outgoing_docs") || "[]"); } catch { return []; } }
function saveOutgoing(items: OutgoingDoc[]) { localStorage.setItem("jarvis_outgoing_docs", JSON.stringify(items)); }
function loadArchiveAnalysis(): Record<string, string> { try { return JSON.parse(localStorage.getItem("jarvis_archive_ai") || "{}"); } catch { return {}; } }
function saveArchiveAnalysis(x: Record<string, string>) { localStorage.setItem("jarvis_archive_ai", JSON.stringify(x)); }
function loadSignedDocs(): Record<string, boolean> { try { return JSON.parse(localStorage.getItem("jarvis_signed_docs") || "{}"); } catch { return {}; } }
function saveSignedDocs(x: Record<string, boolean>) { localStorage.setItem("jarvis_signed_docs", JSON.stringify(x)); }
function formatBytes(n = 0) { if (!n) return "—"; const units = ["Б", "КБ", "МБ", "ГБ"]; let i = 0; let value = n; while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; } return `${value >= 100 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`; }
function fileExt(name: string) { const m = String(name || "").match(/\.([^.]+)$/); return (m?.[1] || "doc").toUpperCase(); }
function cleanAnswer(text: string) {
  return (text || "")
    .replace(/\[doc:\d+\]/g, "")
    .replace(/document_id|chunk_index|relevance_score|file_path/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function dedupeCitations(citations: Citation[]) {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const c of citations || []) {
    const key = `${c.file_path}::${c.metadata?.section || ""}::${c.chunk_text?.slice(0, 70) || ""}`;
    if (!seen.has(key)) { seen.add(key); out.push(c); }
  }
  return out;
}

/* ── Toast system ─────────────────────────────────────────────────────── */
type ToastItem = { id: string; message: string; type: "success" | "error" | "info" };

function ToastContainer({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: string) => void }) {
  return <div className="toast-container">
    {toasts.map(t => (
      <div key={t.id} className={`toast ${t.type}`}>
        <Icon name={t.type === "success" ? "check_circle" : t.type === "error" ? "error" : "info"} />
        <span style={{flex:1, fontSize:13}}>{t.message}</span>
        <button className="toast-dismiss" onClick={() => dismiss(t.id)}>✕</button>
      </div>
    ))}
  </div>;
}

function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, type: ToastItem["type"] = "info") => {
    const id = uuid();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);
  const dismiss = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  return { toasts, show, dismiss };
}

function App() {
  // Восстанавливаем экран и открытый чат из localStorage — чтобы F5 не сбрасывал
  // юзера на «researcher».
  const initialScreen: Screen = (() => {
    try {
      const s = localStorage.getItem("jarvis_screen");
      const valid: Screen[] = ["dashboard", "researcher", "constructor", "search", "analytics", "settings"];
      if (s && (valid as string[]).includes(s)) return s as Screen;
    } catch {}
    return "researcher";
  })();
  const initialActiveId: string | null = (() => {
    try { return localStorage.getItem("jarvis_active_chat"); } catch { return null; }
  })();

  const [screen, setScreenInner] = useState<Screen>(initialScreen);
  const [sessions, setSessions] = useState<Session[]>(loadSessions);
  const [activeId, setActiveIdInner] = useState<string | null>(
    (initialActiveId && sessions.some(s => s.id === initialActiveId)) ? initialActiveId : (sessions[0]?.id || null)
  );
  const setScreen = (s: Screen) => { setScreenInner(s); try { localStorage.setItem("jarvis_screen", s); } catch {} };
  const setActiveId = (id: string | null) => { setActiveIdInner(id); try { id ? localStorage.setItem("jarvis_active_chat", id) : localStorage.removeItem("jarvis_active_chat"); } catch {} };
  const [filesBySession, setFilesBySession] = useState<FilesBySession>({});
  const [outgoing, setOutgoing] = useState<OutgoingDoc[]>(loadOutgoing);
  const { toasts, show: showToast, dismiss: dismissToast } = useToast();
  useEffect(() => saveSessions(sessions), [sessions]);
  useEffect(() => saveOutgoing(outgoing), [outgoing]);

  const patchSession = (id: string, patch: Partial<Session> | ((s: Session) => Session)) => {
    setSessions(prev => prev.map(s => s.id === id ? (typeof patch === "function" ? patch(s) : { ...s, ...patch }) : s));
  };
  const deleteChat = (id: string) => setSessions(prev => {
    const next = prev.filter(s => s.id !== id);
    if (activeId === id) setActiveId(next[0]?.id || null);
    return next;
  });
  const newChat = (seed?: string) => {
    const id = uuid();
    const s: Session = { id, title: seed ? truncate(seed) : "Новый чат", messages: [], attachments: [], updatedAt: now() };
    setSessions(prev => [s, ...prev]);
    setActiveId(id);
    setScreen("researcher");
    return id;
  };
  const addOutgoing = (generated: GeneratedDoc) => {
    const title = `${templateLabels[generated.template_type]} №${generated.fields?.номер_документа || "без номера"}`;
    setOutgoing(prev => [{ id: uuid(), title, type: generated.template_type, createdAt: now(), generated }, ...prev]);
  };

  return <div className="app-shell">
    <SideNav screen={screen} setScreen={setScreen} />
    {screen === "dashboard" && <Dashboard key="dashboard" sessions={sessions} setScreen={setScreen} setActiveId={setActiveId} newChat={newChat} />}
    {screen === "researcher" && <Researcher key="researcher" sessions={sessions} activeId={activeId} setActiveId={setActiveId} newChat={newChat} patchSession={patchSession} deleteChat={deleteChat} filesBySession={filesBySession} setFilesBySession={setFilesBySession} showToast={showToast} />}
    {screen === "constructor" && <Constructor key="constructor" addOutgoing={addOutgoing} />}
    {screen === "search" && <SearchArchive key="search" outgoing={outgoing} setScreen={setScreen} />}
    {!["dashboard", "researcher", "constructor", "search"].includes(screen) && <InDev key={screen} screen={screen} />}
    <ToastContainer toasts={toasts} dismiss={dismissToast} />
  </div>;
}

function SideNav({ screen, setScreen }: { screen: Screen; setScreen: (s: Screen) => void }) {
  const { user, setUser } = React.useContext(AuthContext);
  const displayName = user?.full_name || user?.username || "";
  const initial = (displayName || "?").trim().charAt(0).toUpperCase();
  function pick(s: Screen) { setScreen(s); document.body.classList.remove("nav-open"); }
  async function logout() {
    try { await fetch(api("/auth/logout"), { method: "POST", credentials: "include" }); } catch { /* ignore */ }
    setUser(null);
  }
  return <aside className="side-nav">
    <div className="brand"><h1>Джарвис-Юрист</h1><p>Legal AI Agent</p></div>
    <nav>{nav.map(([id, icon, label, enabled]) => <button key={id} disabled={!enabled} onClick={() => enabled && pick(id as Screen)} className={cx("nav-item", screen === id && "active", !enabled && "disabled")}><Icon name={icon} /><span>{label}</span>{!enabled && <em>в разработке</em>}</button>)}</nav>
    <div className="profile">
      <div className="avatar">{initial}</div>
      <div><b>{displayName}</b><span>{user?.role === "admin" ? "Администратор" : "Юридический отдел"}</span></div>
      <button className="logout-btn" onClick={logout} title="Выйти" aria-label="Выйти"><Icon name="logout"/></button>
    </div>
  </aside>;
}
function TopBarAvatar() {
  const { user } = React.useContext(AuthContext);
  const initial = ((user?.full_name || user?.username || "?")).trim().charAt(0).toUpperCase();
  return <div className="top-icons"><Icon name="notifications" /><Icon name="help_outline" /><div className="avatar small">{initial}</div></div>;
}
function TopBar() {
  function toggleMobileNav() {
    const opened = document.body.classList.toggle("nav-open");
    if (opened) {
      // Закрытие по клику на backdrop
      const close = () => { document.body.classList.remove("nav-open"); document.removeEventListener("click", onDocClick, true); };
      const onDocClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest(".side-nav") || target.closest(".mobile-nav-toggle")) return;
        close();
      };
      setTimeout(() => document.addEventListener("click", onDocClick, true), 50);
    }
  }
  return <header className="topbar">
    <button className="mobile-nav-toggle" onClick={toggleMobileNav} aria-label="Меню"><Icon name="menu"/></button>
    <div></div>
    <TopBarAvatar/>
  </header>;
}


// Иконка + цвет + лейбл по расширению файла
function fileTypeStyle(name: string): { icon: string; color: string; label: string } {
  const ext = (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]) || "";
  switch (ext) {
    case "docx": case "doc": case "odt": case "rtf":
                              return { icon: "description",     color: "#3b82f6", label: "Документ" };
    case "pdf":               return { icon: "picture_as_pdf",  color: "#ef4444", label: "PDF" };
    case "xlsx": case "xls": case "ods":
                              return { icon: "table_chart",     color: "#16a34a", label: "Таблица" };
    case "csv": case "tsv":   return { icon: "table_chart",     color: "#22c55e", label: "CSV" };
    case "pptx": case "ppt": case "odp":
                              return { icon: "slideshow",       color: "#f97316", label: "Презентация" };
    case "zip": case "rar": case "7z": case "tar": case "gz":
                              return { icon: "folder_zip",      color: "#eab308", label: "Архив" };
    case "png": case "jpg": case "jpeg": case "gif": case "webp": case "bmp": case "svg":
                              return { icon: "image",           color: "#a855f7", label: "Изображение" };
    case "txt": case "md": case "log":
                              return { icon: "article",         color: "#64748b", label: "Текст" };
    case "json": case "yaml": case "yml":
                              return { icon: "data_object",     color: "#0ea5e9", label: ext.toUpperCase() };
    case "html": case "htm": case "xml":
                              return { icon: "code",            color: "#f59e0b", label: ext.toUpperCase() };
    case "epub": case "mobi": case "fb2":
                              return { icon: "menu_book",       color: "#7c3aed", label: "Книга" };
    case "mp3": case "wav": case "m4a": case "ogg": case "flac":
                              return { icon: "graphic_eq",      color: "#ec4899", label: "Аудио" };
    case "mp4": case "mov": case "avi": case "mkv": case "webm":
                              return { icon: "movie",           color: "#db2777", label: "Видео" };
    case "eml": case "msg":   return { icon: "mail",            color: "#0891b2", label: "Письмо" };
    default:                  return { icon: "draft",           color: "#64748b", label: ext.toUpperCase() || "Файл" };
  }
}

type FileCardProps = {
  name: string;
  size?: number;
  href?: string;
  onRemove?: () => void;
};
function FileCard({ name, size, href, onRemove }: FileCardProps) {
  const s = fileTypeStyle(name);
  const meta = typeof size === "number" && size > 0 ? `${s.label} · ${formatBytes(size)}` : s.label;
  const inner = <>
    <span className="file-card-icon" style={{ backgroundColor: s.color }}>
      <Icon name={s.icon}/>
    </span>
    <span className="file-card-text">
      <b>{name}</b>
      <span>{meta}</span>
    </span>
  </>;
  if (href) {
    return <a className="file-card" href={href} download={name} title={name}>
      {inner}
      <span className="file-card-download-hint"><Icon name="download"/></span>
    </a>;
  }
  return <div className="file-card" title={name}>
    {inner}
    {onRemove && <button className="file-card-remove" onClick={onRemove} aria-label="Убрать">
      <Icon name="close"/>
    </button>}
  </div>;
}


function autoDownloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return url;
}
function downloadFilenameFromResponse(res: Response, fallback: string) {
  const cd = res.headers.get("Content-Disposition") || "";
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try { return decodeURIComponent(star[1]); } catch {}
  }
  const simple = cd.match(/filename="?([^";]+)"?/i);
  return simple?.[1] || fallback;
}

function deriveDashboardRisks(sessions: Session[]) {
  const text = sessions.flatMap(s => s.messages.map(m => m.content)).join(" ").toLowerCase();
  const risks: {title:string; norm:string; hint:string; question:string}[] = [];
  if (/(неустой|просроч|поставк)/.test(text)) risks.push({title:"Неустойка и просрочка поставки", norm:"ГК РФ ст. 330, 333, 521", hint:"Проверьте срок, договорный размер неустойки и риск снижения судом.", question:"Что говорит ГК РФ про неустойку за просрочку поставки?"});
  if (/(растор|изменен|односторон|отказ)/.test(text)) risks.push({title:"Изменение или расторжение договора", norm:"ГК РФ ст. 450–452", hint:"Проверьте существенность нарушения, форму уведомления и порядок направления предложения.", question:"Какие могут быть основания для расторжения договора?"});
  return risks;
}

function Dashboard({ sessions, setScreen, setActiveId, newChat }: { sessions: Session[]; setScreen: (s: Screen)=>void; setActiveId: (id: string)=>void; newChat: (seed?: string)=>string }) {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const { user } = React.useContext(AuthContext);
  const displayName = user?.full_name || user?.username || "";
  useEffect(() => { jsonFetch<IndexStatus>("/index/status").then(setStatus).catch(() => setStatus(null)); }, []);
  const total = status?.total_documents ?? 0;
  const risks = deriveDashboardRisks(sessions);
  return <main className="main"><TopBar /><section className="dashboard">
    <div className="kicker">Панель управления</div><h1>Добро пожаловать{displayName ? `, ${displayName}` : ""}</h1>
    <div className="metrics">
      <Metric label="Всего документов" value={total || "—"} hint="документы и нормативная база" />
      <Metric label="Проанализировано" value={total || "—"} hint="доступно агентам" />
      <Metric label="Ожидают подписи" value={0} hint="черновики конструктора" button="Перейти" onClick={() => setScreen("constructor")} />
      <Metric label="Возможные риски" value={risks.length} hint="по последним чатам" />
    </div>
    <div className="dash-grid">
      <div className="panel"><div className="panel-head"><h2>Последние чаты</h2><button onClick={() => setScreen("researcher")}>Открыть</button></div>{sessions.length === 0 ? <div className="empty">Чатов пока нет</div> : sessions.slice(0,5).map(s => <button className="activity" key={s.id} onClick={() => { setActiveId(s.id); setScreen("researcher"); }}><Icon name="forum" /><div><b>{s.title}</b><span>{s.messages.length} сообщений · {time(s.updatedAt)}</span></div></button>)}</div>
      <div className="panel"><h2>Возможные риски</h2>{risks.length === 0 ? <div className="empty">Появятся после анализа документов или юридических вопросов.</div> : risks.map(r => <button key={r.title} className="risk" onClick={() => { newChat(r.question); }}><span>{r.norm}</span><b>{r.title}</b><p>{r.hint}</p></button>)}</div>
    </div>
  </section></main>;
}
function Metric({ label, value, hint, button, onClick }: any) { return <div className="metric"><p>{label}</p><strong>{value}</strong><span>{hint}</span>{button && <button onClick={onClick}>{button}</button>}</div>; }

function Researcher({ sessions, activeId, setActiveId, newChat, patchSession, deleteChat, filesBySession, setFilesBySession, showToast }: { sessions: Session[]; activeId: string | null; setActiveId: (id: string)=>void; newChat: (seed?: string)=>string; patchSession: any; deleteChat: (id:string)=>void; filesBySession: FilesBySession; setFilesBySession: React.Dispatch<React.SetStateAction<FilesBySession>>; showToast: (msg: string, type?: "success"|"error"|"info") => void }) {
  const active = sessions.find(s => s.id === activeId) || null;
  const activeFiles = active ? (filesBySession[active.id] || []) : [];
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [streamingTs, setStreamingTs] = useState<string | null>(null);
  const [docModal, setDocModal] = useState<DocumentContent | null>(null);
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const [contractWizardOpen, setContractWizardOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [gdrivePickerOpen, setGdrivePickerOpen] = useState(false);
  const [useKP, setUseKP] = useState(false);
  const [useWeb, setUseWeb] = useState(false);

  const [contractWizard, setContractWizard] = useState<ContractWizardData>({
    templateType: "dogovor_izgotovlenie_postavka",
    contractNumber: "",
    templateDocx: null,
    customerCard: null,
    executorCard: null,
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [active?.messages.length, loading, activeId]);
  const legalCitations = useMemo(() => dedupeCitations((active?.messages || []).flatMap(m => m.citations || []).filter(c => ["legal", "web"].includes(c.document_type || ""))), [active]);

  async function ask(seed?: string) {
    const text = (seed || query).trim();
    if (!text) return;
    const id = active?.id || newChat(text);
    const current = sessions.find(s => s.id === id) || active;
    const hist = current?.messages || [];
    const attachedFiles = filesBySession[id] || [];
    setFilesBySession(prev => ({ ...prev, [id]: [] }));
    patchSession(id, (s: Session) => ({ ...s, title: s.title === "Новый чат" ? truncate(text) : s.title, messages: [...s.messages, { role:"user", content:text, attachedFiles: attachedFiles.map(f => ({name: f.name, size: f.size})), createdAt: now() }], updatedAt: now() }));
    setQuery(""); setError(""); setLoading(true);
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
    const startedAt = Date.now();
    try {
      // SSE streaming — bubble создаём ТОЛЬКО когда придёт первая текстовая дельта,
      // чтобы не показывать пустой прямоугольник под user-сообщением.
      // Цитаты копим и применяем ОДНИМ кадром в конце, чтобы они шли ПОСЛЕ текста.
      const priorFiles = (current?.fileIds || []);
      let resp: Response;
      // Если в чате уже накапливались файлы — продолжаем дергать /with-files/stream,
      // даже если в этом сообщении пользователь не приложил новых. Так Claude видит
      // полный набор файлов чата, а не только текущий аплоад.
      if (attachedFiles.length > 0 || priorFiles.length > 0) {
        const fd = new FormData();
        fd.append("message", text);
        fd.append("history", JSON.stringify(hist.map(m => ({ role: m.role, content: m.content }))));
        fd.append("prior_files", JSON.stringify(priorFiles));
        fd.append("use_kp", String(useKP));
        fd.append("use_web", String(useWeb));
        fd.append("chat_id", id);
        for (const f of attachedFiles) fd.append("files", f);
        resp = await apiFetch("/chat/with-files/stream", { method: "POST", body: fd });
      } else {
        resp = await apiFetch("/chat/direct/stream", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ message: text, history: hist.map(m=>({role:m.role, content:m.content})), use_kp: useKP, use_web: useWeb, chat_id: id }) });
      }
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}: ${await resp.text().catch(()=>"")}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumContent = "";
      let accumCitations: Citation[] = [];
      let accumDownloads: DownloadItem[] = [];
      let accumTools: ToolStep[] = [];
      let ts = "";
      let bubbleCreated = false;
      // Текст ДО первого вызова инструмента — это «преамбула» Claude'а («Сейчас изучу...»).
      // Мы её НЕ показываем (только три точки). Если инструмент так и не вызвался —
      // значит это был финальный ответ и мы перенесём его в bubble на done.
      let hasToolFired = false;
      let preambleAccum = "";

      const ensureBubble = () => {
        if (bubbleCreated) return;
        ts = now();
        patchSession(id, (s: Session) => ({ ...s, messages: [...s.messages, { role:"assistant", content: "", citations: [], createdAt: ts }], updatedAt: ts }));
        bubbleCreated = true;
      };

      const applyToBubble = (patch: Partial<Message>) => {
        if (!bubbleCreated) return;
        patchSession(id, (s: Session) => {
          const msgs = [...s.messages];
          const lastIdx = msgs.length - 1;
          const last = msgs[lastIdx];
          if (last && last.role === "assistant" && last.createdAt === ts) {
            msgs[lastIdx] = { ...last, ...patch };
          }
          return { ...s, messages: msgs };
        });
      };

      while (true) {
        let done = false, value: Uint8Array | undefined;
        try {
          ({ done, value } = await reader.read());
        } catch (e) {
          console.error("[jarvis] reader.read error:", e);
          break;
        }
        if (done) break;
        // Нормализуем CRLF → LF (sse-starlette использует \r\n\r\n, мы парсим по \n\n)
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (!chunk.trim()) continue;
          let eventName = "message";
          let dataStr = "";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trimStart();
          }
          let data: any = {};
          try { data = JSON.parse(dataStr || "{}"); } catch {}

          try {
          if (eventName === "text") {
            const delta = data.delta || "";
            if (!delta) continue;
            if (hasToolFired) {
              // После любого инструмента — это реальный ответ, льём в bubble
              ensureBubble();
              accumContent += delta;
              applyToBubble({ content: accumContent });
            } else {
              // До первого инструмента — копим в буфер, никуда не показываем (только точки)
              preambleAccum += delta;
            }
          } else if (eventName === "uploaded_files") {
            // Сохраняем file_id новых аплоадов в сессию, чтобы Claude видел их в следующих сообщениях
            if (Array.isArray(data.items) && data.items.length) {
              patchSession(id, (s: Session) => {
                const existing = s.fileIds || [];
                const seen = new Set(existing.map(f => f.file_id));
                const merged = [...existing];
                for (const item of data.items) {
                  if (item && item.file_id && !seen.has(item.file_id)) {
                    merged.push({ file_id: item.file_id, name: item.name || "file", mime_type: item.mime_type || "application/octet-stream" });
                    seen.add(item.file_id);
                  }
                }
                return { ...s, fileIds: merged };
              });
            }
          } else if (eventName === "tool_start") {
            hasToolFired = true;
            preambleAccum = ""; // отбрасываем — это была преамбула перед работой
            const name = (data.name || "").toString();
            // Внутренние тулзы SDK не показываем (ToolSearch — discovery, не делает работы).
            if (name && name !== "ToolSearch") {
              ensureBubble();
              accumTools = [...accumTools, { name, status: "running" }];
              applyToBubble({ tools: accumTools });
            }
          } else if (eventName === "tool_end") {
            const name = (data.name || "").toString();
            if (name && name !== "ToolSearch") {
              const lastRunningIdx = (() => {
                for (let i = accumTools.length - 1; i >= 0; i--) {
                  if (accumTools[i].name === name && accumTools[i].status === "running") return i;
                }
                return -1;
              })();
              if (lastRunningIdx !== -1) {
                accumTools = accumTools.map((t, i) => i === lastRunningIdx ? { ...t, status: "done" } : t);
                applyToBubble({ tools: accumTools });
              }
            }
          } else if (eventName === "citations") {
            // Накапливаем в буфер, НЕ применяем сейчас — чтобы цитаты не появились раньше текста.
            if (Array.isArray(data.items)) {
              accumCitations = [...accumCitations, ...data.items];
            }
          } else if (eventName === "downloads") {
            if (Array.isArray(data.items)) {
              ensureBubble();
              // НЕ авто-скачиваем: программный a.click() на blob-URL в Safari
              // навигирует страницу → React-стейт обнуляется, "чёрный экран".
              // FileCard в сообщении сам по себе кликабельный — юзер скачает руками.
              accumDownloads = data.items.map((d: any) => {
                const byteStr = atob(d.b64);
                const buf = new Uint8Array(byteStr.length);
                for (let i = 0; i < byteStr.length; i++) buf[i] = byteStr.charCodeAt(i);
                const blob = new Blob([buf], { type: d.mime_type || "application/octet-stream" });
                return { name: d.name, url: URL.createObjectURL(blob), size: d.size };
              });
              applyToBubble({ downloads: accumDownloads });
            }
          } else if (eventName === "done") {
            // Edge case: инструменты не вызывались, весь ответ остался в preamble — переносим в bubble
            if (!hasToolFired && preambleAccum && !accumContent) {
              accumContent = preambleAccum;
            }
            ensureBubble();
            if (accumContent.trim()) applyToBubble({ content: accumContent });
            else applyToBubble({ content: "(пустой ответ)" });
            const finalCitations = (Array.isArray(data.citations) && data.citations.length) ? data.citations : accumCitations;
            if (finalCitations.length) applyToBubble({ citations: finalCitations });
          } else if (eventName === "error") {
            throw new Error(data.detail || "Ошибка стрима");
          }
          } catch (innerErr) {
            // Не позволяем одному кривому событию убить весь стрим: логируем, продолжаем.
            // Кроме явных error-событий — их пробрасываем дальше в outer catch.
            if (eventName === "error") throw innerErr;
            console.error("[jarvis] SSE event handler error:", innerErr, "event:", eventName, "data preview:", String(dataStr).slice(0, 200));
          }
        }
      }
    } catch(e) { setError(String(e)); showToast("Ошибка при обработке запроса", "error"); }
    finally { setLoading(false); }
  }
  const [docHighlight, setDocHighlight] = useState<string>("");
  async function openDoc(c: Citation) {
    // Веб-источник → открываем в новой вкладке
    if (c.document_type === "web" && c.url) {
      window.open(c.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!c.file_path) { ask(c.chunk_text); return; }
    try {
      const doc = await jsonFetch<DocumentContent>(`/documents/content?path=${encodeURIComponent(c.file_path)}`);
      setDocHighlight((c.cited_text || c.chunk_text || "").trim());
      setDocModal(doc);
    } catch(e) { setError(String(e)); }
  }
  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const id = active?.id || newChat();
    const fileArr = Array.from(files);
    const meta = fileArr.map(f => ({ name:f.name, size:f.size, type:f.type }));
    setFilesBySession(prev => ({ ...prev, [id]: [...(prev[id] || []), ...fileArr] }));
    patchSession(id, (s: Session) => ({ ...s, attachments: [...s.attachments, ...meta], updatedAt: now() }));
  }
  function removeFile(index: number) {
    if (!active) return;
    const id = active.id;
    setFilesBySession(prev => { const files = [...(prev[id] || [])]; files.splice(index, 1); return { ...prev, [id]: files }; });
    patchSession(id, (s: Session) => ({ ...s, attachments: s.attachments.filter((_, i) => i !== index) }));
  }
  async function runContractWizard() {
    const id = active?.id || newChat("Генерация договора");
    if (contractWizard.templateType !== "dogovor_izgotovlenie_postavka") { setError("На этой итерации в чате поддержан только договор на изготовление и поставку товара."); return; }
    if (!contractWizard.contractNumber.trim()) { setError("Укажите номер договора."); return; }
    if (!contractWizard.templateDocx) { setError("Прикрепите DOCX-договор-шаблон."); return; }
    if (!contractWizard.customerCard) { setError("Прикрепите карточку предприятия заказчика."); return; }
    if (!contractWizard.executorCard) { setError("Прикрепите карточку предприятия исполнителя."); return; }
    setError("");
    setLoading(true);
    const startedAt = Date.now();
    const userText = `Генерация договора: ${templateLabels[contractWizard.templateType]}. Номер договора: ${contractWizard.contractNumber}. Заказчик: ${contractWizard.customerCard.name}. Исполнитель: ${contractWizard.executorCard.name}.`;
    patchSession(id, (s: Session) => ({ ...s, title: s.title === "Новый чат" ? "Генерация договора" : s.title, messages: [...s.messages, { role:"user", content:userText, createdAt: now() }], attachments: [...s.attachments, { name: contractWizard.templateDocx!.name, size: contractWizard.templateDocx!.size, type: contractWizard.templateDocx!.type }, { name: contractWizard.customerCard!.name, size: contractWizard.customerCard!.size, type: contractWizard.customerCard!.type }, { name: contractWizard.executorCard!.name, size: contractWizard.executorCard!.size, type: contractWizard.executorCard!.type }], updatedAt: now() }));
    try {
      const fd = new FormData();
      fd.append("contract_type", contractWizard.templateType);
      fd.append("contract_number", contractWizard.contractNumber.trim());
      fd.append("template_docx", contractWizard.templateDocx);
      fd.append("customer_card", contractWizard.customerCard);
      fd.append("executor_card", contractWizard.executorCard);
      const res = await apiFetch("/documents/generate-contract-from-cards", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const fileName = downloadFilenameFromResponse(res, "jarvis_contract.docx");
      const url = autoDownloadBlob(blob, fileName);
      const minDelay = 1200 - (Date.now() - startedAt);
      if (minDelay > 0) await new Promise(r => setTimeout(r, minDelay));
      const content = `## Готово\n\nСформировал DOCX-договор по приложенному шаблону.\n\n- Тип: **${templateLabels[contractWizard.templateType]}**\n- Номер договора: **${contractWizard.contractNumber}**\n- Заказчик взят из файла: **${contractWizard.customerCard.name}**\n- Исполнитель взят из файла: **${contractWizard.executorCard.name}**\n\nФайл автоматически скачан. Если скачивание не началось, нажмите кнопку ниже.`;
      patchSession(id, (s: Session) => ({ ...s, messages: [...s.messages, { role:"assistant", content, citations: [], downloads: [{ name: fileName, url, size: blob.size }], createdAt: now() }], updatedAt: now() }));
    } catch(e) { setError(String(e)); showToast("Ошибка генерации договора", "error"); }
    finally { setLoading(false); }
  }

  return <main className="main researcher"><div className="research-grid">
    <aside className="history"><div className="history-top"><h2>История чатов</h2><button onClick={() => newChat()}><Icon name="add" />Новый чат</button></div>{sessions.length === 0 ? <div className="empty">Чатов пока нет</div> : sessions.map(s => <div key={s.id} className={cx("chat-card-wrap", active?.id === s.id && "active")}><button className="chat-card-main" onClick={() => setActiveId(s.id)}><b>{s.title}</b></button><button className="chat-delete" title="Удалить чат" onClick={(e)=>{e.stopPropagation(); deleteChat(s.id);}}><Icon name="delete"/></button></div>)}</aside>
    <section className="chat"><TopBar /><div className="chat-scroll" ref={scrollRef}>{!active ? <div className="welcome"><h1>Нейроюрист</h1><p>Создайте новый чат, задайте правовой вопрос или приложите документ для анализа.</p></div> : active.messages.length === 0 ? <div className="welcome"><h1>Новый чат</h1><p>Введите юридический запрос ниже или приложите документ.</p></div> : active.messages.map((m, i) => <div key={i} className={cx("msg", m.role)}><div className="bubble"><small>{m.role === "user" ? "Пользователь" : "Нейроюрист"}</small>{m.role === "user" && m.attachedFiles?.length ? <div className="file-card-row">{m.attachedFiles.map((f,i)=><FileCard key={i} name={f.name} size={f.size}/>)}</div> : null}{m.role === "assistant" && (m.tools?.length || 0) > 0 ? <div className="agent-steps">{m.tools!.map((t, ti)=><span key={ti} className={cx("agent-step", t.status)} title={t.name}><span className="agent-step-dot"/>{toolLabel(t.name)}</span>)}</div> : null}<Markdown text={m.content} />{m.downloads?.length ? <div className="file-card-row">{m.downloads.map(d => <FileCard key={d.name} name={d.name} size={d.size} href={d.url}/>)}</div> : null}{m.role === "assistant" && (m.citations?.length || 0) > 0 && <div className="inline-sources"><h4>Источники ответа</h4>{dedupeCitations(m.citations || []).map((c, idx)=><button key={idx} className={cx(c.document_type === "web" && "web-src")} onClick={()=>openDoc(c)}><b>{c.document_type === "web" && <Icon name="travel_explore"/>}{niceSourceTitle(c)}{c.document_type === "web" && <Icon name="open_in_new"/>}</b>{c.cited_text ? <blockquote className="citation-quote">{c.cited_text}</blockquote> : c.url ? <span className="src-url">{c.url}</span> : <span>{truncate(c.chunk_text, 280)}</span>}</button>)}</div>}</div></div>)}{loading && (() => { const last = active?.messages[active.messages.length - 1]; const hasStreamingText = last && last.role === "assistant" && (last.content || "").trim().length > 0; return !hasStreamingText; })() && <div className="thinking"><div className="thinking-dots"><span className="thinking-dot"/><span className="thinking-dot"/><span className="thinking-dot"/></div></div>}{error && <div className="error">{error}</div>}</div><div className="inputbar">{activeFiles.length > 0 && <div className="file-card-row inputbar-files">{activeFiles.map((f, i) => <FileCard key={i} name={f.name} size={f.size} onRemove={()=>removeFile(i)}/>)}</div>}<div className="chat-input"><textarea ref={textareaRef} value={query} rows={1} onChange={e=>{setQuery(e.target.value); const el=e.target; el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,200)+'px';}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask();}}} placeholder="Введите ваш юридический запрос..." /><div className="chat-input-controls"><div className="chat-input-controls-left"><div className="tool-menu-wrap"><button type="button" className="tool-plus" onClick={()=>setToolMenuOpen(!toolMenuOpen)}><Icon name="add"/></button>{toolMenuOpen && <div className="tool-menu"><button onClick={()=>{setToolMenuOpen(false); setTimeout(()=>fileInputRef.current?.click(), 50);}}><Icon name="attach_file"/><span>Прикрепить файл</span></button><button onClick={()=>{setGdrivePickerOpen(true); setToolMenuOpen(false);}}><Icon name="add_to_drive"/><span>Файл из Google Drive</span></button><div className="tool-menu-sep"/><button className={cx("tool-toggle", useKP && "active")} onClick={()=>{setUseKP(!useKP); setToolMenuOpen(false);}}><Icon name="gavel"/><span>КонсультантПлюс</span></button><button className={cx("tool-toggle", useWeb && "active")} onClick={()=>{setUseWeb(!useWeb); setToolMenuOpen(false);}}><Icon name="travel_explore"/><span>Веб-поиск</span></button></div>}<input ref={fileInputRef} type="file" multiple style={{display:"none"}} onChange={e=>{addFiles(e.target.files); e.target.value="";}} /></div>{useKP && <button className="tool-chip kp" onClick={()=>setUseKP(false)} title="Отключить поиск по КонсультантПлюс"><Icon name="gavel"/><span>КонсультантПлюс</span></button>}{useWeb && <button className="tool-chip web" onClick={()=>setUseWeb(false)} title="Отключить веб-поиск"><Icon name="travel_explore"/><span>Веб-поиск</span></button>}</div><button className="chat-send" disabled={loading} onClick={()=>ask()}><Icon name="arrow_upward"/></button></div></div></div>{gdrivePickerOpen && <GDrivePickerModal onPick={async (fileId, fileName, mimeType) => {
    try {
      // Качаем оригинальный файл (PDF/DOCX/изображение) и передаём как есть —
      // Anthropic vision/document блоки сами разберутся с содержимым.
      const params = new URLSearchParams({file_id: fileId, name: fileName, mime_type: mimeType});
      const res = await apiFetch("/gdrive/export?" + params);
      if (!res.ok) throw new Error("Не удалось скачать файл из Google Drive: " + (await res.text()).slice(0,200));
      const blob = await res.blob();
      // Имя файла: при экспорте Google Docs → DOCX добавляется расширение
      let finalName = fileName;
      if (mimeType === "application/vnd.google-apps.document" && !/\.docx?$/i.test(finalName)) finalName += ".docx";
      else if (mimeType === "application/vnd.google-apps.spreadsheet" && !/\.xlsx?$/i.test(finalName)) finalName += ".xlsx";
      else if (mimeType === "application/vnd.google-apps.presentation" && !/\.pptx?$/i.test(finalName)) finalName += ".pptx";
      const finalType = blob.type || mimeType || "application/octet-stream";
      const file = new File([blob], finalName, { type: finalType });
      const dt = new DataTransfer();
      dt.items.add(file);
      addFiles(dt.files);
      setGdrivePickerOpen(false);
    } catch(e: any) { alert(e?.message || String(e)); }
  }} onClose={() => setGdrivePickerOpen(false)} />}</section>
    <aside className="right-panel"><section><h3>Прикрепленные документы</h3>{active?.attachments.length ? active.attachments.map(a => <div className="mini" key={a.name}><Icon name="description"/><div><b>{a.name}</b><span>{Math.round(a.size/1024)} KB</span></div></div>) : <div className="empty dashed">Документы не прикреплены</div>}</section><section><h3>Источники</h3>{legalCitations.length === 0 ? <div className="empty dashed">Источники появятся здесь по мере ответов</div> : legalCitations.slice(0,8).map((c, i) => <button className={cx("legal", c.document_type === "web" && "web-source")} key={i} onClick={()=>openDoc(c)}><Icon name={c.document_type === "web" ? "travel_explore" : "gavel"}/><div><b>{niceSourceTitle(c)}</b><span>{truncate(c.url || c.cited_text || c.chunk_text, 140)}</span></div></button>)}</section></aside>
  </div>{docModal && <DocModal doc={docModal} highlight={docHighlight} onClose={()=>{setDocModal(null); setDocHighlight("");}} />}</main>;
}
function FilePick({ label, accept, file, onChange }: { label: string; accept: string; file: File | null; onChange: (f: File | null)=>void }) {
  return <label className="wizard-file"><span>{label}</span><input type="file" accept={accept} onChange={e=>onChange(e.target.files?.[0] || null)} />{file ? <b>{file.name}</b> : <em>Файл не выбран</em>}</label>;
}
function ContractGenerationWizard({ data, setData, loading, onSubmit, onClose }: { data: ContractWizardData; setData: (d: ContractWizardData)=>void; loading: boolean; onSubmit: ()=>void; onClose: ()=>void }) {
  const disabled = data.templateType !== "dogovor_izgotovlenie_postavka";
  return <div className="contract-wizard">
    <div className="wizard-head"><div><Icon name="contract_edit"/><b>Генерация договоров</b></div><button onClick={onClose}>×</button></div>
    <div className="wizard-step"><span>1</span><div><h4>Тип договора</h4><div className="wizard-options">
      {(Object.entries(templateLabels) as [TemplateType,string][]).map(([key,label]) => <button key={key} className={cx(data.templateType===key && "active")} onClick={()=>setData({...data, templateType:key})}>{label}</button>)}
    </div>{disabled && <p>Пока в чат-сценарии подключён только договор на изготовление и поставку товара. КП и доверенность оставлены для следующего шага.</p>}</div></div>
    <div className="wizard-step"><span>2</span><div><h4>Укажите номер договора</h4><input value={data.contractNumber} onChange={e=>setData({...data, contractNumber:e.target.value})} placeholder="Например: ИПР-2704-1/2026" /></div></div>
    <div className="wizard-step"><span>3</span><div><h4>Прикрепите сам договор</h4><p>DOCX-шаблон нужен, чтобы сохранить все формулировки, главы, таблицы, жирность/курсив и отступы. Джарвис меняет только стороны, реквизиты и номер договора.</p><FilePick label="DOCX-договор" accept=".docx" file={data.templateDocx} onChange={f=>setData({...data, templateDocx:f})}/></div></div>
    <div className="wizard-step"><span>4</span><div><h4>Карточка предприятия заказчика</h4><FilePick label="Карточка заказчика" accept=".docx,.pdf,.png,.jpg,.jpeg,.txt,.md" file={data.customerCard} onChange={f=>setData({...data, customerCard:f})}/></div></div>
    <div className="wizard-step"><span>5</span><div><h4>Карточка предприятия исполнителя</h4><FilePick label="Карточка исполнителя" accept=".docx,.pdf,.png,.jpg,.jpeg,.txt,.md" file={data.executorCard} onChange={f=>setData({...data, executorCard:f})}/></div></div>
    <div className="wizard-actions"><button className="outline" onClick={onClose}>Отмена</button><button className="primary" disabled={loading || disabled} onClick={onSubmit}>{loading ? "Формирую DOCX…" : "Сформировать DOCX"}</button></div>
  </div>;
}

function niceSourceTitle(c: Citation) {
  const docName = String(c.document_name || "").trim();
  if (docName && docName !== "Источник") return docName.replace(/\.(html?|md|txt|docx?|pdf|rtf)$/i, "");
  const section = String(c.metadata?.section || "").replace(/^#+\s*/, "").trim();
  if (section) return section;
  const m = String(c.chunk_text || "").match(/Статья\s+\d+(?:\.\d+)?/);
  if (m) return m[0];
  return "Источник";
}
function formatSourcesOnlyAnswer(citations: Citation[]) {
  const cs = dedupeCitations(citations || []).slice(0,4);
  if (!cs.length) return "## Ответ не сформирован\n\nНе удалось найти достаточные источники по запросу. Уточните формулировку или приложите документ.";
  return ["## Найдены релевантные нормы", "", "### Что проверить", ...cs.map(c => `- **${niceSourceTitle(c)}**: ${truncate(c.chunk_text, 220)}`)].join("\n");
}
function inline(s: string): React.ReactNode {
  // Bold: **text**, italic: *text*, inline code: `code`
  const parts = s.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return <>{parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <b key={i}>{p.slice(2, -2)}</b>;
    if (p.startsWith("*") && p.endsWith("*")) return <em key={i}>{p.slice(1, -1)}</em>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={i} className="inline-code">{p.slice(1, -1)}</code>;
    return <React.Fragment key={i}>{p}</React.Fragment>;
  })}</>;
}

function StreamedMarkdown({ text, stream, onDone }: { text: string; stream: boolean; onDone?: () => void }) {
  const [shown, setShown] = useState(stream ? 0 : text.length);
  const doneRef = useRef(false);
  useEffect(() => {
    if (!stream) { setShown(text.length); return; }
    const total = text.length;
    setShown(0);
    doneRef.current = false;
    // адаптивная скорость: короткие — 300 cps, длинные — до 1500 cps
    const cps = Math.max(300, Math.min(1500, total * 0.6));
    const intervalMs = 20;
    const step = Math.max(2, Math.round(cps * intervalMs / 1000));
    let i = 0;
    const id = setInterval(() => {
      i = Math.min(total, i + step);
      setShown(i);
      // мягко прокручиваем чат вниз пока текст растёт
      const sc = document.querySelector('.chat-scroll') as HTMLElement | null;
      if (sc) sc.scrollTop = sc.scrollHeight;
      if (i >= total) {
        clearInterval(id);
        if (!doneRef.current) { doneRef.current = true; onDone?.(); }
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [text, stream]);
  return <Markdown text={text.slice(0, shown)} />;
}

function Markdown({ text }: { text: string }) {
  const lines = text.split(/\n/);
  const out: React.ReactNode[] = [];
  let ul: string[] = [];
  let ol: string[] = [];
  let tableRows: string[][] = [];
  let inTable = false;

  function flushUl(k: number) {
    if (ul.length) { out.push(<ul key={`ul${k}`}>{ul.map((x, i) => <li key={i}>{inline(x)}</li>)}</ul>); ul = []; }
  }
  function flushOl(k: number) {
    if (ol.length) { out.push(<ol key={`ol${k}`}>{ol.map((x, i) => <li key={i}>{inline(x)}</li>)}</ol>); ol = []; }
  }
  function flushTable(k: number) {
    if (tableRows.length) {
      const head = tableRows[0];
      const body = tableRows.slice(1).filter(r => !r.every(c => /^-+$/.test(c.trim())));
      out.push(
        <div key={`tw${k}`} className="md-table-wrap">
          <table key={`t${k}`} className="md-table">
            {head.length > 0 && <thead><tr>{head.map((c, ci) => <th key={ci}>{inline(c.trim())}</th>)}</tr></thead>}
            <tbody>{body.map((row, ri) => <tr key={ri}>{row.map((c, ci) => <td key={ci}>{inline(c.trim())}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      tableRows = [];
      inTable = false;
    }
  }
  function flushAll(k: number) { flushUl(k); flushOl(k); flushTable(k); }

  lines.forEach((l, i) => {
    const s = l.trimEnd();
    const st = s.trim();

    // Table row (contains | )
    if (/\|/.test(st)) {
      flushUl(i); flushOl(i);
      inTable = true;
      const cells = st.split("|").map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1 || arr.length === 1);
      tableRows.push(cells.length ? cells : [st]);
      return;
    }
    if (inTable) { flushTable(i); }

    if (!st) { flushAll(i); return; }

    // Headings
    const hm = st.match(/^(#{1,6})\s+(.+)/);
    if (hm) {
      flushAll(i);
      const lvl = hm[1].length;
      const htxt = inline(hm[2]);
      if (lvl === 1) out.push(<h1 key={i} className="md-h1">{htxt}</h1>);
      else if (lvl === 2) out.push(<h2 key={i}>{htxt}</h2>);
      else if (lvl === 3) out.push(<h3 key={i}>{htxt}</h3>);
      else out.push(<h4 key={i}>{htxt}</h4>);
      return;
    }

    // Horizontal rule
    if (/^---+$/.test(st)) { flushAll(i); out.push(<hr key={i} className="md-hr"/>); return; }

    // Numbered list
    const nm = st.match(/^(\d+)[.)]\s+(.+)/);
    if (nm) { flushUl(i); flushTable(i); ol.push(nm[2]); return; }

    // Unordered list
    const ulm = st.match(/^[-•*]\s+(.+)/);
    if (ulm) { flushOl(i); flushTable(i); ul.push(ulm[1]); return; }

    // Blockquote — styled note
    if (st.startsWith(">")) {
      flushAll(i);
      out.push(<blockquote key={i} className="md-quote">{inline(st.slice(1).trim())}</blockquote>);
      return;
    }

    // Normal paragraph
    flushOl(i); flushUl(i);
    out.push(<p key={i}>{inline(st)}</p>);
  });
  flushAll(99999);
  return <div className="md">{out}</div>;
}

function DocModal({ doc, onClose, highlight }: { doc: DocumentContent; onClose: ()=>void; highlight?: string }) {
  const title = doc.title.replace(/^#+\s*/, "").trim();
  // Якорный фрагмент для поиска и подсветки — обрезаем до первых 200 символов,
  // т.к. длинные строки маловероятно встретятся целиком в HTML/PDF-конверсии
  const anchor = (highlight || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const htmlWithHighlight = useMemo(() => {
    if (!doc.is_html || !anchor) return doc.content;
    const target = JSON.stringify(anchor);
    const inject = `
<style>
  .jarvis-hl { background: rgba(255,210,80,0.35); outline: 1px solid rgba(255,210,80,0.6); padding: 2px 1px; border-radius: 3px; }
  body { padding-bottom: 80vh; }
</style>
<script>
(function() {
  function tryHighlight() {
    var target = ${target};
    if (!target) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node;
    while (node = walker.nextNode()) {
      var txt = (node.textContent || '').replace(/\\s+/g, ' ');
      var idx = txt.indexOf(target);
      if (idx >= 0) {
        try {
          var raw = node.textContent || '';
          var rawIdx = raw.indexOf(target);
          if (rawIdx < 0) { rawIdx = idx; }
          var range = document.createRange();
          range.setStart(node, rawIdx);
          range.setEnd(node, Math.min(rawIdx + target.length, raw.length));
          var span = document.createElement('span');
          span.className = 'jarvis-hl';
          range.surroundContents(span);
          setTimeout(function(){ span.scrollIntoView({behavior:'smooth', block:'center'}); }, 60);
          return;
        } catch(e) {}
      }
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryHighlight);
  } else { tryHighlight(); }
})();
</script>`;
    return doc.content + inject;
  }, [doc.content, doc.is_html, anchor]);

  return (
    <div className="modal-back" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="doc-modal">
        <div className="doc-modal-header">
          <div>
            <h2>{title}</h2>
            <span className="doc-modal-meta">{doc.file_name}</span>
          </div>
          <button className="close" onClick={onClose}><Icon name="close"/></button>
        </div>
        {highlight && <div className="doc-modal-highlight">
          <Icon name="format_quote"/>
          <div>
            <span>Цитата из ответа Джарвиса</span>
            <blockquote>{highlight.slice(0, 600)}{highlight.length > 600 && "…"}</blockquote>
          </div>
        </div>}
        <div className="doc-modal-body">
          {doc.is_html
            ? <iframe
                srcDoc={htmlWithHighlight}
                sandbox="allow-same-origin allow-popups allow-scripts"
                style={{ width:"100%", height:"100%", border:"none", minHeight:"70vh", background:"transparent" }}
                title={title}
              />
            : <Markdown text={doc.content} />
          }
        </div>
      </div>
    </div>
  );
}

function Constructor({ addOutgoing }: { addOutgoing: (g: GeneratedDoc)=>void }) {
  const [schemas, setSchemas] = useState<Record<string, TemplateSchema>>({});
  const [template, setTemplate] = useState<TemplateType>("kommercheskoe_predlozhenie");
  const schema = schemas[template];
  const [fields, setFields] = useState<Record<string, any>>({});
  const [items, setItems] = useState<Record<string, any>[]>([{ наименование:"", артикул:"", единица:"шт", количество:"1", цена:"0" }]);
  const [images, setImages] = useState<ImagePayload[]>([]);
  const [generated, setGenerated] = useState<GeneratedDoc | null>(null);
  const [error, setError] = useState("");
  useEffect(()=>{ jsonFetch<Record<string, TemplateSchema>>("/templates/schemas").then(s=>{setSchemas(s); const first=s[template]; if(first) setFields(defaultFields(first));}).catch(e=>setError(String(e))); }, []);
  useEffect(()=>{ if(schema){ setFields(defaultFields(schema)); setGenerated(null); if(!schema.supports_images) setImages([]); if((schema.item_fields || []).length === 0) setItems([]); else setItems([{ наименование:"", артикул:"", единица:"шт", количество:"1", цена:"0" }]); } }, [template, !!schema]);
  const hasItems = !!schema?.item_fields?.length;
  const previewItems = items.map((it, idx)=>{ const qty=parseNum(it.количество); const price=parseNum(it.цена); return { no:idx+1, name:String(it.наименование||""), art:String(it.артикул||""), unit:String(it.единица||"шт"), qty, price, sum:qty*price }; });
  const total = previewItems.reduce((a,b)=>a+b.sum,0);
  async function generate() { setError(""); try { const res = await jsonFetch<GeneratedDoc>("/templates/generate", { method:"POST", body: JSON.stringify({ template_type:template, fields, items, images }) }); setGenerated(res); addOutgoing(res); } catch(e){ setError(String(e)); } }
  async function exportFile(kind:"docx"|"pdf") { try { const res = await apiFetch(`/templates/export/${kind}`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ template_type:template, fields, items, images })}); if(!res.ok) throw new Error(await res.text()); const blob=await res.blob(); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`${template}.${kind}`; a.click(); } catch(e){ setError(String(e)); } }
  async function generateAndExport(kind: "docx" | "pdf") {
    try {
      await generate();
      await exportFile(kind);
    } catch(e) { setError(String(e)); }
  }
  async function addImages(files: FileList | null) { if(!files) return; const arr: ImagePayload[]=[]; for (const f of Array.from(files)) arr.push(await readImage(f)); setImages(prev=>[...prev,...arr]); }
  if(!schema) return <main className="main"><TopBar/><div className="constructor-page"><div className="error">Не удалось загрузить схемы шаблонов</div></div></main>;
  return <main className="main"><TopBar/><div className="constructor-page"><section className="constructor-form"><h1>Конструктор документов</h1><label className="field full"><span>Шаблон документа</span><select value={template} onChange={e=>setTemplate(e.target.value as TemplateType)}>{Object.entries(templateLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><div className="fields">{schema.fields.map(f=><DynamicField key={f.name} spec={f} value={fields[f.name] ?? ""} onChange={v=>setFields({...fields,[f.name]:v})}/>)}</div>{hasItems && <><h3>{template === "dogovor_izgotovlenie_postavka" ? "Позиции спецификации" : "Позиции"}</h3>{items.map((it,idx)=><div className="item-row item-row-5" key={idx}><input placeholder="Наименование" value={it.наименование||""} onChange={e=>{const n=[...items]; n[idx]={...n[idx],наименование:e.target.value}; setItems(n)}}/><input placeholder="Артикул / код" value={it.артикул||""} onChange={e=>{const n=[...items]; n[idx]={...n[idx],артикул:e.target.value}; setItems(n)}}/><input value={it.единица||"шт"} onChange={e=>{const n=[...items]; n[idx]={...n[idx],единица:e.target.value}; setItems(n)}}/><input inputMode="decimal" type="text" value={it.количество ?? ""} onChange={e=>{const n=[...items]; n[idx]={...n[idx],количество:e.target.value}; setItems(n)}}/><input inputMode="decimal" type="text" value={it.цена ?? ""} onChange={e=>{const n=[...items]; n[idx]={...n[idx],цена:e.target.value}; setItems(n)}}/><button onClick={()=>setItems(items.filter((_,i)=>i!==idx))}>×</button></div>)}<button className="outline" onClick={()=>setItems([...items,{наименование:"",артикул:"",единица:"шт",количество:"1",цена:"0"}])}>+ Добавить позицию</button></>}{schema.supports_images && <label className="upload"><Icon name="image"/> Приложить фотографии<input type="file" multiple accept="image/*" onChange={e=>addImages(e.target.files)}/></label>}{images.length>0&&<div className="chips">{images.map(i=><span key={i.name}>{i.name}</span>)}</div>}{error && <div className="error">{error}</div>}<div className="constructor-form-actions"><button className="outline wide icon-btn" onClick={()=>generateAndExport("docx")}><Icon name="description"/>Сформировать .docx</button><button className="primary wide icon-btn" onClick={()=>generateAndExport("pdf")}><Icon name="picture_as_pdf"/>Сформировать .pdf</button></div></section><section className="doc-preview"><div className="preview-actions"><button onClick={()=>exportFile("docx")}>Скачать .docx</button><button onClick={()=>exportFile("pdf")}>Скачать .pdf</button></div><DocumentPreview template={template} fields={fields} items={previewItems} total={total} images={images}/></section></div></main>;
}
function defaultFields(schema: TemplateSchema) { const x: Record<string, any>={}; schema.fields.forEach(f=>x[f.name]=f.default ?? ""); return x; }


function DynamicField({ spec, value, onChange }: { spec: FieldSpec; value: any; onChange: (v:any)=>void }) { const wide = spec.type === "textarea" || spec.name.includes("адрес") || spec.name.includes("полное") || spec.name.includes("основание") || spec.name.includes("правый") || spec.name === "тема" || spec.name.includes("паспорт_выдан") || spec.name.includes("контрагент"); return <label className={cx("field", wide && "full")}><span>{spec.label}{spec.required?" *":""}</span>{wide ? <textarea value={value} placeholder={spec.placeholder} onChange={e=>onChange(e.target.value)} rows={spec.name === "тема" ? 4 : 3}/> : <input type="text" value={value} placeholder={spec.placeholder || (spec.type === "date" ? "дд.мм.гггг" : "")} onChange={e=>onChange(e.target.value)}/>}</label>; }
function parseNum(v:any){ const s=String(v ?? "0").replace(/\s/g, "").replace(",", "."); const n=Number(s); return Number.isFinite(n) ? n : 0; }
function money(n:number){return new Intl.NumberFormat("ru-RU",{minimumFractionDigits:2, maximumFractionDigits:2}).format(n||0)}
function dateDoc(v:any){ if(!v) return ""; const raw=String(v).trim().replace(/\s*г\.?$/i, ""); const m=raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if(m) return `${m[1].padStart(2,"0")}.${m[2].padStart(2,"0")}.${m[3]} г.`; const d=new Date(raw); if(Number.isNaN(d.getTime())) return raw; return d.toLocaleDateString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric"})+" г."; }
function dateLong(v:any){ const s=dateDoc(v).replace(" г.", ""); const m=s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/); if(!m) return s; const months=["","января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"]; return `«${m[1]}» ${months[Number(m[2])]} ${m[3]} г`; }
function DocumentPreview({template, fields, items, total, images}: any){return <div className="paper white-paper">{template==="kommercheskoe_predlozhenie"&&<KPPaper fields={fields} items={items} total={total} images={images}/>} {template==="dogovor_izgotovlenie_postavka"&&<PreciseContractPaper fields={fields} items={items} total={total}/>} {template==="doverennost"&&<PreciseDoverennostPaper fields={fields}/>}</div>}
function orgHeader(f:any){return <><b>РОССИЙСКАЯ ФЕДЕРАЦИЯ</b><br/><b>ЦЕНТРАЛЬНЫЙ ФЕДЕРАЛЬНЫЙ ОКРУГ</b><br/>{f.полное_наименование_организации || 'Общество с ограниченной ответственностью «Север» (ООО «Север»)'}<br/>{f.огрн_организации ? <>ОГРН {f.огрн_организации} ИНН {f.инн_организации}<br/></> : null}<br/>{f.банк || 'Демонстрационный банк'},<br/>БИК {f.бик}, к/с {f.корр_счет}, р/с {f.расчетный_счет}.<br/>Юридический адрес: {f.адрес_организации}<br/>тел. {f.телефон}<br/>Адрес электронной почты: {f.email}</>}
function appTitle(text:any){ const s=String(text||"1. Фотографии.").trim(); return /^\d+\./.test(s) ? s.replace(/^\d+\.\s*/, "") : s; }
function KPPaper({fields:f,items,total,images}:any){return <div className="scan kp-scan"><div className="kp-head"><div>{orgHeader(f)}</div><div className="kp-recipient-top">{String(f.правый_адресат_шапки||'Государственное бюджетное учреждение').split('\n').map((x,i)=><React.Fragment key={i}>{x}<br/></React.Fragment>)}</div></div><p className="kp-date">Исх. № {f.номер_документа||'__'} от {dateDoc(f.дата_документа)||'__.__.____ г.'}</p><p className="center"><b>{f.обращение||'Уважаемые коллеги!'}</b></p><p className="indent">{f.тема}</p><PreviewTable template="kp" items={items}/>{f.условия&&<p className="kp-conditions">{f.условия}</p>}<p className="kp-appendix">Приложение:<br/>{f.приложение_текст}</p><p className="kp-sign"><b>{f.подписант_должность||'Генеральный директор'}</b><br/><b>{f.подписант_фио||'И.И. Иванов'}</b></p>{images?.length>0 && <div className="page-break-preview"><p className="app-title">Приложение № 1 к Коммерческому<br/>предложению № {f.номер_документа} от {dateDoc(f.дата_документа)}</p><h3 className="photo-title">{appTitle(f.приложение_текст)}</h3><div className="photo-grid">{images.slice(0,4).map((img:any)=><img key={img.name} src={img.data_url}/>)}</div></div>}</div>}
function ContractPaper({fields:f,items,total}:any){return <div className="scan contract-scan"><h2>ДОГОВОР № {f.номер_документа}</h2><h3>на изготовление и поставку товара</h3><div className="contract-meta"><span>{f.место_заключения}</span><span>{dateLong(f.дата_документа)}</span></div><p className="indent">{f.заказчик_полное}, действующий на основании {f.заказчик_основание}, именуемый в дальнейшем «Заказчик», с одной стороны, и {f.исполнитель_полное}, именуемое в дальнейшем «Исполнитель», действующего на основании {f.исполнитель_основание} ИНН {f.исполнитель_инн}, с другой стороны, совместно именуемые в дальнейшем «Стороны», заключили настоящий Договор о нижеследующем:</p>{['1. ПРЕДМЕТ ДОГОВОРА','2. СТОИМОСТЬ ТОВАРА И ПОРЯДОК РАСЧЕТОВ','3. СРОК ИЗГОТОВЛЕНИЯ И ПОСТАВКИ ТОВАРА','4. ПРАВА И ОБЯЗАННОСТИ СТОРОН','5. ИЗГОТОВЛЕНИЕ И ПРИЕМКА ТОВАРА','6. ОТВЕТСТВЕННОСТЬ СТОРОН','7. ФОРС-МАЖОР','8. ПОРЯДОК РАЗРЕШЕНИЯ СПОРОВ'].map((h,i)=><section key={h}><h4>{h}</h4><p className="indent">{i===0?`Исполнитель обязуется по индивидуальному заданию Заказчика выполнить работы по изготовлению ${f.предмет_товара||'товара'}, а Заказчик обязуется принять Результат работ и оплатить цену.`:i===1?'Общая стоимость Товара и порядок расчётов согласовываются Сторонами в Спецификации. Оплата осуществляется путем перечисления денежных средств на расчетный счет Исполнителя.':i===2?'Общий срок изготовления Товара указывается в Спецификации. Датой поставки является дата приемки Товара, подтвержденная УПД или ТОРГ-12.':i===3?'Заказчик предоставляет исходные данные, согласовывает Спецификацию и принимает Товар. Исполнитель изготавливает Товар надлежащего качества и устраняет недостатки.':i===4?'Приемка подтверждается подписанием УПД или товарной накладной. При выявлении дефектов составляется Акт обнаружения дефектов.':i===5?'За нарушение сроков выполнения Работ Заказчик вправе требовать пени 0,1% за каждый день просрочки, но не более 10% стоимости невыполненного объема.':i===6?'Стороны освобождаются от ответственности за обстоятельства непреодолимой силы при своевременном уведомлении другой Стороны.':'Споры рассматриваются в Арбитражном суде города Москвы. Претензионный порядок обязателен.'}</p></section>)}<h4>11. БАНКОВСКИЕ РЕКВИЗИТЫ, АДРЕСА И ПОДПИСИ СТОРОН</h4><div className="contract-signs"><div><b>Заказчик:</b><br/>{f.заказчик_полное}<br/>ИНН {f.заказчик_инн}<br/>ОГРНИП {f.заказчик_огрн}<br/>{f.заказчик_адрес}<br/>Банк {f.заказчик_банк}<br/>Р/счет {f.заказчик_рс}<br/><br/>______________________/ {f.заказчик_подписант}/<br/>М.П.</div><div><b>Исполнитель:</b><br/>{f.исполнитель_полное}<br/>ИНН {f.исполнитель_инн}<br/>ОГРНИП {f.исполнитель_огрн}<br/>{f.исполнитель_адрес}<br/>Банк {f.исполнитель_банк}<br/>Р/счет {f.исполнитель_рс}<br/><br/>__________________________/ {f.исполнитель_подписант}/<br/>М.П.</div></div><div className="page-break-preview"><p className="app-title">Приложение № 1<br/>к Договору № {f.номер_документа} от {dateDoc(f.дата_документа)}</p><h3 className="center">Спецификация №_____</h3><PreviewTable template="spec" items={items}/></div></div>}
function DoverennostPaper({fields:f}:any){return <div className="scan power-scan"><p>{f.гриф}</p><p className="center"><b>{f.полное_наименование_организации}</b><br/>{f.адрес_организации}<br/>ОГРН {f.огрн_организации}<br/>ИНН {f.инн_организации} КПП {f.кпп_организации}<br/>р/с {f.расчетный_счет}<br/>Банк {f.банк}<br/>к/с {f.корр_счет} БИК {f.бик}</p><p>{f.дата_прописью}<br/>{f.город}</p><h2>Доверенность № {f.номер_документа}</h2><p className="indent">{f.полное_наименование_организации}, в лице Генерального директора {f.директор_фио}, действующего на основании Устава, наделяет {f.представитель_фио}, паспорт серия {f.паспорт_серия} № {f.паспорт_номер} {f.паспорт_выдан}, код подразделения {f.код_подразделения}, правом управления принадлежащим Обществу транспортным средством и быть представителем в ГИБДД, страховых компаниях, СТОА, сервисных центрах по ремонту ТС, с правом сдачи ТС на ремонт, получения ТС из ремонта, подписи, передачи и получения любых документов.</p><p>Марка модель ТС: {f.марка_модель}<br/>VIN: {f.vin}<br/>Тип ТС: {f.тип_тс}<br/>Год выпуска: {f.год_выпуска}<br/>Категория: {f.категория}<br/>Шасси: {f.шасси}<br/>Выписка из ЭПТС: {f.эптс}</p><p>без права передоверия и продажи указанного транспортного средства.</p><p>Доверенность выдана сроком до {f.срок_доверенности}.</p><p>Доверенность мною прочитана, её смысл и значение мне разъяснены и понятны.</p><p>Подпись {f.представитель_фио_именительный} ____________ удостоверяю</p><p className="right">Генеральный Директор ____________ {f.директор_инициалы}<br/>«___» ___________ {f.год_подписания} г.<br/>М.П</p></div>}
function PreviewTable({template, items}: any){if(template==='kp')return <table className="doc-table kp-table"><thead><tr><th>№<br/>п/п</th><th>Наименование</th><th>Артикул<br/>товара</th><th>Ед.<br/>изм.</th><th>Стоимость, руб.,<br/>(без НДС)</th></tr></thead><tbody>{items.map((it:any)=><tr key={it.no}><td>{it.no}.</td><td>{it.name}</td><td>{it.art}</td><td>{it.unit}</td><td>{money(it.sum||it.price)}</td></tr>)}</tbody></table>;
if(template==='spec')return <table className="doc-table spec-table"><thead><tr><th>№ п/п</th><th>Наименование</th><th>Кол-во, шт</th><th>Стоимость с НДС/шт., руб.</th><th>Сумма с НДС, руб</th></tr></thead><tbody>{(items.length?items:[{no:1,name:'',qty:'',price:0,sum:0},{no:2,name:'',qty:'',price:0,sum:0}]).map((it:any)=><tr key={it.no}><td>{it.no}</td><td>{it.name}</td><td>{it.qty}</td><td>{it.price?money(it.price):''}</td><td>{it.sum?money(it.sum):''}</td></tr>)}</tbody></table>;
return <table className="doc-table"><thead><tr><th>№</th><th>Наименование</th><th>Количество</th><th>Ед.</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>{items.map((it:any)=><tr key={it.no}><td>{it.no}</td><td>{it.name}</td><td>{it.qty}</td><td>{it.unit}</td><td>{money(it.price)}</td><td>{money(it.sum)}</td></tr>)}</tbody></table>}
function readImage(file: File): Promise<ImagePayload>{return new Promise((res,rej)=>{const r=new FileReader(); r.onload=()=>res({name:file.name,data_url:String(r.result)}); r.onerror=rej; r.readAsDataURL(file);});}

// ============================================================
// Google Drive — отдельный компонент
// ============================================================
const FOLDER_MIME = "application/vnd.google-apps.folder";
const GDOCS_MIMES: Record<string, string> = {
  "application/vnd.google-apps.document": "Google Документ",
  "application/vnd.google-apps.spreadsheet": "Google Таблица",
  "application/vnd.google-apps.presentation": "Google Презентация",
  "application/vnd.google-apps.form": "Google Форма",
};
function driveIcon(f: DriveFile): string {
  if (f.is_folder) return "folder";
  const m = f.mime_type;
  if (m.includes("pdf")) return "picture_as_pdf";
  if (m.includes("word") || m.includes("document")) return "description";
  if (m.includes("sheet") || m.includes("spreadsheet")) return "table_chart";
  if (m.includes("image")) return "image";
  return "insert_drive_file";
}
function GDrivePickerModal({ onPick, onClose }: {
  onPick: (fileId: string, fileName: string, mimeType: string) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folderStack, setFolderStack] = useState<{id:string;name:string}[]>([{id:"root",name:"Мой диск"}]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const currentFolder = folderStack[folderStack.length - 1];

  useEffect(() => { jsonFetch<DriveStatus>("/gdrive/status").then(setStatus).catch(() => setStatus({connected:false})); }, []);
  useEffect(() => { if (status?.connected) loadFiles(currentFolder.id); }, [status?.connected, currentFolder.id]);

  async function loadFiles(folderId: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ folder_id: folderId, page_size: "200", ...(q ? {q} : {}) });
      const res = await jsonFetch<{files: DriveFile[]}>("/gdrive/files?" + params);
      setFiles(res.files);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }

  const folders = files.filter(f => f.is_folder);
  const docs = files.filter(f => !f.is_folder);

  return (
    <div className="modal-back" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gdrive-picker-modal">
        <div className="gdrive-picker-header">
          <h3>Выберите файл из Google Drive</h3>
          <button className="close" onClick={onClose}><Icon name="close"/></button>
        </div>
        {status === null ? (
          <div className="gdrive-picker-empty">Проверяю подключение к Google Drive…</div>
        ) : !status.connected ? (
          <div className="gdrive-picker-empty">
            <p>Google Drive не подключён</p>
            <button className="primary" onClick={async () => {
              try {
                const res = await jsonFetch<{auth_url:string}>("/gdrive/auth");
                const popup = window.open(res.auth_url, "gdrive_auth", "width=520,height=620");
                const onMsg = (e: MessageEvent) => {
                  if (e.data === "gdrive_connected") {
                    window.removeEventListener("message", onMsg);
                    popup?.close();
                    jsonFetch<DriveStatus>("/gdrive/status").then(setStatus);
                  }
                };
                window.addEventListener("message", onMsg);
              } catch(e) { console.error(e); }
            }}>Подключить Google Drive</button>
          </div>
        ) : (
          <>
            <div className="gdrive-picker-nav">
              <div className="gdrive-breadcrumb">
                {folderStack.map((f, i) => (
                  <span key={f.id}>
                    {i > 0 && <span className="sep">›</span>}
                    <button onClick={() => setFolderStack(prev => prev.slice(0, i+1))} className={i === folderStack.length-1 ? "active" : ""}>{f.name}</button>
                  </span>
                ))}
              </div>
              <div className="gdrive-search" style={{maxWidth:200}}>
                <Icon name="search"/>
                <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Поиск..." onKeyDown={e=>{if(e.key==="Enter") loadFiles(currentFolder.id)}}/>
              </div>
            </div>
            {loading && <div className="gdrive-progress"><div className="gdrive-progress-bar"/></div>}
            <div className="gdrive-picker-list">
              {folders.map(f => (
                <button key={f.id} className="gdrive-picker-item folder" onClick={() => { setFolderStack(prev => [...prev, {id:f.id, name:f.name}]); setQ(""); }}>
                  <Icon name="folder"/><span>{f.name}</span>
                </button>
              ))}
              {docs.map(f => (
                <button key={f.id} className="gdrive-picker-item file" onClick={() => onPick(f.id, f.name, f.mime_type)}>
                  <Icon name={driveIcon(f)}/><span>{f.name}</span><small>{f.size_bytes ? formatBytes(f.size_bytes) : ""}</small>
                </button>
              ))}
              {!loading && folders.length === 0 && docs.length === 0 && <div className="gdrive-picker-empty">Папка пуста</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GDrivePanel({ setDocModal }: { setDocModal: (d: any) => void }) {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folderStack, setFolderStack] = useState<{id: string; name: string}[]>([{id:"root", name:"Мой диск"}]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [nextToken, setNextToken] = useState<string|null>(null);
  const [docLoading, setDocLoading] = useState<string|null>(null);

  const currentFolder = folderStack[folderStack.length - 1];

  useEffect(() => {
    jsonFetch<DriveStatus>("/gdrive/status").then(setStatus).catch(() => setStatus({connected: false}));
  }, []);

  useEffect(() => {
    if (status?.connected) loadFiles(currentFolder.id, "", null);
  }, [status?.connected, currentFolder.id]);

  async function loadFiles(folderId: string, search: string, pageToken: string | null) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        folder_id: folderId,
        page_size: "200",
        ...(search ? {q: search} : {}),
        ...(pageToken ? {page_token: pageToken} : {}),
      });
      const res = await jsonFetch<{files: DriveFile[]; next_page_token?: string}>(`/gdrive/files?${params}`);
      if (pageToken) setFiles(prev => [...prev, ...res.files]);
      else setFiles(res.files);
      setNextToken(res.next_page_token || null);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }

  function openFolder(f: DriveFile) {
    setFolderStack(prev => [...prev, {id: f.id, name: f.name}]);
    setQ("");
  }
  function navTo(idx: number) {
    setFolderStack(prev => prev.slice(0, idx + 1));
    setQ("");
  }
  async function openFile(f: DriveFile) {
    setDocLoading(f.id);
    try {
      const params = new URLSearchParams({file_id: f.id, name: f.name, mime_type: f.mime_type});
      const res = await jsonFetch<{content: string; is_html: boolean; title: string}>(`/gdrive/file-content?${params}`);
      setDocModal({title: res.title || f.name, file_name: f.name, content: res.content, is_html: res.is_html, file_path: f.id});
    } catch(e: any) {
      alert(e?.detail || String(e));
    } finally { setDocLoading(null); }
  }
  async function connect() {
    const res = await jsonFetch<{auth_url: string}>("/gdrive/auth");
    const popup = window.open(res.auth_url, "gdrive_auth", "width=520,height=620");
    const onMsg = (e: MessageEvent) => {
      if (e.data === "gdrive_connected") {
        window.removeEventListener("message", onMsg);
        popup?.close();
        jsonFetch<DriveStatus>("/gdrive/status").then(setStatus);
      }
    };
    window.addEventListener("message", onMsg);
  }
  async function disconnect() {
    if (!confirm("Отключить Google Drive?")) return;
    await jsonFetch("/gdrive/disconnect", {method:"POST"});
    setStatus({connected: false}); setFiles([]);
  }

  if (!status) return <div className="gdrive-loading"><span>Проверяем подключение…</span></div>;

  if (!status.connected) return (
    <div className="gdrive-connect">
      <div className="gdrive-connect-inner">
        <Icon name="add_to_drive"/>
        <h3>Google Drive не подключён</h3>
        {status.error && <p className="error-text">{status.error}</p>}
        <p>Подключи Google Drive — и все папки и файлы появятся здесь</p>
        <button className="primary" onClick={connect}>Подключить Google Drive</button>
      </div>
    </div>
  );

  const visible = q
    ? files.filter(f => f.name.toLowerCase().includes(q.toLowerCase()))
    : files;
  const folders = visible.filter(f => f.is_folder);
  const docs = visible.filter(f => !f.is_folder);

  return (
    <div className="gdrive-panel">
      <div className="gdrive-toolbar">
        <div className="gdrive-breadcrumb">
          {folderStack.map((folder, idx) => (
            <span key={folder.id}>
              {idx > 0 && <span className="sep">›</span>}
              <button onClick={() => navTo(idx)} className={idx === folderStack.length-1 ? "active" : ""}>{folder.name}</button>
            </span>
          ))}
        </div>
        <div className="gdrive-search">
          <Icon name="search"/>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск в папке..."/>
          {q && <button onClick={() => setQ("")}>×</button>}
        </div>
        <button className="gdrive-disconnect" onClick={disconnect} title={`Подключён как ${status.email}`}>
          <Icon name="cloud_done"/>
          <span>{status.email}</span>
        </button>
      </div>
      {loading && <div className="gdrive-progress"><div className="gdrive-progress-bar"/></div>}
      <div className="gdrive-files">
        {folders.length === 0 && docs.length === 0 && !loading && (
          <div className="empty">Папка пуста</div>
        )}
        {folders.length > 0 && (
          <div className="gdrive-section">
            <div className="gdrive-section-label">Папки</div>
            <div className="gdrive-grid">
              {folders.map(f => (
                <button key={f.id} className="gdrive-folder-card" onClick={() => openFolder(f)}>
                  <Icon name="folder"/>
                  <span>{f.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {docs.length > 0 && (
          <div className="gdrive-section">
            <div className="gdrive-section-label">Файлы</div>
            <div className="gdrive-file-list">
              {docs.map(f => (
                <button key={f.id} className={cx("gdrive-file-row", docLoading===f.id&&"loading")} onClick={() => openFile(f)} disabled={docLoading===f.id}>
                  <Icon name={driveIcon(f)}/>
                  <div className="gdrive-file-info">
                    <b>{f.name}</b>
                    <span>{GDOCS_MIMES[f.mime_type] || f.mime_type.split("/").pop()} {f.size_bytes ? "· "+formatBytes(f.size_bytes) : ""}</span>
                  </div>
                  {f.web_view_link && <a href={f.web_view_link} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="gdrive-ext-link" title="Открыть в Drive"><Icon name="open_in_new"/></a>}
                  {docLoading===f.id && <span className="gdrive-spinner"/>}
                </button>
              ))}
            </div>
          </div>
        )}
        {nextToken && (
          <button className="outline gdrive-load-more" onClick={() => loadFiles(currentFolder.id, q, nextToken)}>
            Загрузить ещё…
          </button>
        )}
      </div>
    </div>
  );
}

type SummaryInfo = { file_path: string; summary: string | null; model: string; status: string; analyzed_at: string | null; error: string | null };

function SearchArchive({ outgoing, setScreen }: { outgoing: OutgoingDoc[]; setScreen: (s: Screen)=>void }) {
  const [docs, setDocs] = useState<DocumentInfo[]>([]);
  const [tab, setTab] = useState<"incoming"|"outgoing"|"gdrive">("incoming");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<DocumentInfo | OutgoingDoc | null>(null);
  const [analysisCache, setAnalysisCache] = useState<Record<string, string>>(loadArchiveAnalysis);
  const [signedDocs, setSignedDocs] = useState<Record<string, boolean>>(loadSignedDocs);
  const [docModal, setDocModal] = useState<DocumentContent | null>(null);
  const [analysis, setAnalysis] = useState("");
  const [error, setError] = useState("");
  // Быстрая аналитика (локальная Ollama) — статус из бэкенда, polling
  const [summary, setSummary] = useState<SummaryInfo | null>(null);
  // оставлено для совместимости — больше не используется (стрим вместо очереди)
  // Глубокая аналитика (Claude Agent SDK) — стрим текст и тулзы
  const [deepText, setDeepText] = useState("");
  const [deepTools, setDeepTools] = useState<ToolStep[]>([]);
  const [deepStreaming, setDeepStreaming] = useState(false);
  const deepAbortRef = useRef<AbortController | null>(null);
  // Массовая переиндексация и прогресс
  const [reindexBusy, setReindexBusy] = useState(false);
  const [reindexInfo, setReindexInfo] = useState<string>("");
  const [stats, setStats] = useState<{total:number; done:number; pending:number; running:number; failed:number; skipped:number; not_started:number} | null>(null);

  useEffect(() => saveArchiveAnalysis(analysisCache), [analysisCache]);
  useEffect(() => saveSignedDocs(signedDocs), [signedDocs]);
  useEffect(()=>{ jsonFetch<DocumentInfo[]>("/documents/").then(items=>{ const incoming=items.filter(d=>d.type!=="legal"); setDocs(incoming); setSelected(prev => prev || incoming[0] || null); }).catch(e=>setError(String(e))); }, []);

  // Polling статистики индексации каждые 4 сек
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fetchStats = async () => {
      try {
        const data = await jsonFetch<typeof stats extends null ? never : NonNullable<typeof stats>>("/documents/summary/stats");
        if (!stopped) setStats(data as any);
      } catch {}
      if (!stopped) timer = setTimeout(fetchStats, 4000);
    };
    fetchStats();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, []);

  const incoming = docs.filter(d => d.name.toLowerCase().includes(q.toLowerCase()) || d.type.toLowerCase().includes(q.toLowerCase()));
  const outgoingFiltered = outgoing.filter(d => d.title.toLowerCase().includes(q.toLowerCase()));
  const visible = tab === "incoming" ? incoming : outgoingFiltered;
  const keyOf = (doc: DocumentInfo | OutgoingDoc | null) => !doc ? "" : ("file_path" in doc ? `in:${doc.file_path}` : `out:${doc.id}`);
  const metaOf = (doc: DocumentInfo | OutgoingDoc | null) => {
    if (!doc) return { format: "—", size: "—", status: "—", signed: false, downloadExt: "" };
    const signed = !!signedDocs[keyOf(doc)];
    const status = signed ? "Подписан" : "Не подписан";
    if ("file_path" in doc) {
      const ext = fileExt(doc.name);
      return { format: ext, size: formatBytes(doc.size_bytes), status, signed, downloadExt: ext };
    }
    return { format: "PDF / DOCX", size: formatBytes(new Blob([JSON.stringify(doc.generated)]).size), status, signed, downloadExt: "PDF" };
  };
  function toggleSigned() {
    if (!selected) return;
    const k = keyOf(selected);
    setSignedDocs(prev => ({ ...prev, [k]: !prev[k] }));
  }

  useEffect(() => {
    if (!selected && visible.length) { setSelected(visible[0] as any); return; }
    if (selected && !visible.some((d:any) => keyOf(d) === keyOf(selected))) setSelected(visible[0] as any || null);
  }, [tab, q, docs.length, outgoing.length]);

  useEffect(() => {
    const key = keyOf(selected);
    setAnalysis(key ? (analysisCache[key] || "") : "");
    // Сброс deep-аналитики при смене документа
    setDeepText("");
    setDeepTools([]);
    if (deepAbortRef.current) { try { deepAbortRef.current.abort(); } catch {} deepAbortRef.current = null; }
    setDeepStreaming(false);
  }, [selected]);

  // Загрузка быстрого саммари при выборе incoming-документа + polling если pending/running
  useEffect(() => {
    if (!selected || !("file_path" in selected)) { setSummary(null); return; }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fetchOnce = async () => {
      try {
        const data = await jsonFetch<SummaryInfo>(`/documents/summary?path=${encodeURIComponent(selected.file_path)}`);
        if (stopped) return;
        setSummary(data);
        if (data.status === "pending" || data.status === "running") {
          timer = setTimeout(fetchOnce, 2500);
        }
      } catch (e) {
        if (!stopped) setError(String(e));
      }
    };
    fetchOnce();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [selected]);

  async function reindexAll() {
    setError(""); setReindexBusy(true); setReindexInfo("");
    try {
      const data = await jsonFetch<{enqueued: number; total_candidates: number}>("/documents/summary/enqueue-all", { method: "POST" });
      setReindexInfo(`Поставлено в очередь: ${data.enqueued} из ${data.total_candidates}`);
      // Перезагрузим текущий summary, если выбран документ
      if (selected && "file_path" in selected) {
        try {
          const s = await jsonFetch<SummaryInfo>(`/documents/summary?path=${encodeURIComponent(selected.file_path)}`);
          setSummary(s);
        } catch {}
      }
    } catch (e) { setError(String(e)); }
    finally { setReindexBusy(false); }
  }

  async function runQuickAnalysis() {
    if (!selected || !("file_path" in selected)) return;
    setError("");
    // Тихо переводим в pending — фоновый воркер подхватит, polling обновит UI
    setSummary(prev => prev ? { ...prev, summary: null, status: "pending", error: null } : { file_path: selected.file_path, summary: null, model: "", status: "pending", analyzed_at: null, error: null });
    try {
      const data = await jsonFetch<SummaryInfo>(`/documents/summary/enqueue?path=${encodeURIComponent(selected.file_path)}`, { method: "POST" });
      setSummary(data);
    } catch (e) { setError(String(e)); }
  }

  async function runDeepAnalysis() {
    if (!selected) return;
    if (!("file_path" in selected)) {
      // Для исходящих — оставляем старую заглушку
      const next = `## ИИ-резюме\n\nДокумент **${selected.title}** сформирован в конструкторе. Ниже — быстрая проверка перед отправкой или подписанием.\n\n### Ключевые проверки\n- Сверьте реквизиты сторон, номер и дату документа.\n- Проверьте табличную часть: позиции, суммы, единицы измерения и приложения.\n- Убедитесь, что формулировки соответствуют шаблону и деловой цели документа.`;
      setAnalysisCache(prev => ({ ...prev, [keyOf(selected)]: next }));
      return;
    }
    setError(""); setDeepText(""); setDeepTools([]); setDeepStreaming(true);
    const ctrl = new AbortController();
    deepAbortRef.current = ctrl;
    try {
      const resp = await apiFetch(`/documents/deep-analyze/stream?path=${encodeURIComponent(selected.file_path)}`, { method: "POST", signal: ctrl.signal });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}: ${await resp.text().catch(()=>"")}`);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let toolsAcc: ToolStep[] = [];
      let lastToolName = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
          if (!chunk.trim()) continue;
          let eventName = "message", dataStr = "";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trimStart();
          }
          let data: any = {}; try { data = JSON.parse(dataStr || "{}"); } catch {}
          if (eventName === "text") {
            acc += (data.delta || "");
            setDeepText(acc);
          } else if (eventName === "tool_start") {
            lastToolName = (data.name || "").toString();
            if (lastToolName && lastToolName !== "ToolSearch") {
              toolsAcc = [...toolsAcc, { name: lastToolName, status: "running" }];
              setDeepTools([...toolsAcc]);
            }
          } else if (eventName === "tool_end") {
            const name = (data.name || lastToolName || "").toString();
            if (name && name !== "ToolSearch") {
              for (let i = toolsAcc.length - 1; i >= 0; i--) {
                if (toolsAcc[i].name === name && toolsAcc[i].status === "running") {
                  toolsAcc = toolsAcc.map((t, j) => j === i ? { ...t, status: "done" } : t);
                  break;
                }
              }
              setDeepTools([...toolsAcc]);
            }
          } else if (eventName === "error") {
            setError(data.detail || "ошибка глубокой аналитики");
          } else if (eventName === "done") {
            // ничего, цикл просто завершится
          }
        }
      }
      // Кэшируем результат, чтобы при возврате юрист видел его
      if (acc.trim()) setAnalysisCache(prev => ({ ...prev, [keyOf(selected)]: acc }));
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(String(e));
    } finally {
      setDeepStreaming(false);
      deepAbortRef.current = null;
    }
  }

  async function downloadSelected() {
    if (!selected) return;
    try {
      if ("file_path" in selected) {
        const res = await apiFetch(`/documents/download?path=${encodeURIComponent(selected.file_path)}`);
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = selected.name;
        a.click();
      } else {
        const res = await apiFetch(`/templates/export/pdf`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ template_type:selected.generated.template_type, fields:selected.generated.fields, items:selected.generated.items, images:selected.generated.images }) });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${selected.title}.pdf`;
        a.click();
      }
    } catch(e) { setError(String(e)); }
  }

  const selectedMeta = metaOf(selected);
  const isIncoming = selected && "file_path" in selected;
  const quickBusy = summary?.status === "pending" || summary?.status === "running";
  const quickLabel = (() => {
    if (!isIncoming) return "Быстрая аналитика";
    if (summary?.status === "running" && !summary?.summary) return "Запускаю…";
    if (summary?.status === "pending") return "В очереди…";
    if (summary?.status === "running") return "Анализирую…";
    if (summary?.status === "done") return "Быстрая аналитика";
    if (summary?.status === "failed") return "Повторить";
    if (summary?.status === "skipped") return "Попробовать снова";
    return "Быстрая аналитика";
  })();
  const deepLabel = deepStreaming ? "Анализирую…" : "Глубокая аналитика";
  const showQuickBox = isIncoming && summary && (summary.summary || summary.status === "running" || summary.status === "pending" || summary.status === "failed" || summary.status === "skipped");
  const showDeepBox = deepStreaming || deepText || (!isIncoming && analysis);

  return <main className="main"><TopBar/><section className="archive-page"><div className="archive-top"><div><h1>Архив документов</h1><p>Входящие сканы и исходящие документы конструктора</p>{reindexInfo && <p className="reindex-info">{reindexInfo}</p>}{stats && stats.total > 0 && (() => { const queued = stats.pending + stats.running; const processed = stats.done + stats.failed + stats.skipped; const pct = Math.max(0, Math.min(100, Math.round(100 * processed / stats.total))); return (<div className="index-progress"><div className="index-progress-row"><span>Проиндексировано: {processed} из {stats.total}</span>{queued > 0 && <span className="index-progress-active">{queued} в работе</span>}</div><div className="index-progress-bar"><div className="index-progress-bar-fill" style={{ width: pct + "%" }}/></div></div>); })()}</div><div className="archive-top-actions"><button className="outline" disabled={reindexBusy} onClick={reindexAll} title="Поставить все входящие документы в очередь быстрой аналитики. Также запускается автоматически каждую ночь в 00:00.">{reindexBusy ? "Ставлю в очередь…" : "Проиндексировать всё"}</button><div className="archive-search"><Icon name="search"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Поиск по документам компании..."/></div></div></div><div className="archive-tabs"><button className={cx(tab==='incoming'&&'active')} onClick={()=>setTab('incoming')}>Входящие документы</button><button className={cx(tab==='outgoing'&&'active')} onClick={()=>setTab('outgoing')}>Исходящие документы</button><button className={cx(tab==='gdrive'&&'active','gdrive-tab')} onClick={()=>setTab('gdrive')}><Icon name="add_to_drive"/>Google Drive</button></div><div className={tab==="gdrive" ? "archive-grid gdrive-mode" : "archive-grid"}>{tab !== "gdrive" ? <><div className="doc-cards">{visible.length===0 ? <div className="empty">Документы не найдены</div> : visible.map((d:any)=><button key={d.id || d.file_path} className={cx("doc-card", keyOf(selected)===keyOf(d) && "active")} onClick={()=>setSelected(d)}><Icon name={tab==='incoming'?"description":"outbox"}/><b>{'name' in d ? d.name : d.title}</b><span>{'type' in d ? humanType(d.type) : templateLabels[d.type as TemplateType]}</span><small>{fileExt('name' in d ? d.name : `${d.title}.pdf`)} • {'size_bytes' in d ? formatBytes(d.size_bytes) : formatBytes(new Blob([JSON.stringify(d.generated)]).size)}</small></button>)}</div><aside className="doc-detail"><h3>Детали документа</h3>{selected ? <><h2>{'name' in selected ? selected.name : selected.title}</h2><div className="detail-chips"><span className="chip">{selectedMeta.format}</span><span className="chip">{selectedMeta.size}</span><span className={cx("chip", selectedMeta.status === 'Подписан' && 'ok')}>{selectedMeta.status}</span></div>{isIncoming && (<><div className="detail-subhead"><span><SparklesIcon/>Быстрая аналитика</span>{(summary?.status === "running" || summary?.status === "pending") && <span className="ai-progress"><span className="thinking-dot"/><span className="thinking-dot"/><span className="thinking-dot"/></span>}</div><div className="ai-box">{showQuickBox ? (summary?.summary ? <><Markdown text={summary.summary}/><small className="ai-footer">Быстрая аналитика</small></> : <p className="ai-status-line">{summary?.status === "running" ? "Анализирую документ…" : summary?.status === "pending" ? "Документ в очереди на анализ." : summary?.status === "failed" ? `Не получилось: ${summary?.error || "неизвестная ошибка"}` : summary?.status === "skipped" ? `Пропущено: ${summary?.error || "слишком короткий текст"}` : "Анализ ещё не запускался."}</p>) : <p>Все входящие документы анализируются автоматически. Если ничего нет — нажмите кнопку ниже.</p>}</div></>)}{showDeepBox && (<><div className="detail-subhead"><span><SparklesIcon/>Глубокая аналитика</span>{deepStreaming && <span className="ai-progress"><span className="thinking-dot"/><span className="thinking-dot"/><span className="thinking-dot"/></span>}</div>{deepTools.length > 0 && <div className="agent-steps">{deepTools.map((t, ti)=><span key={ti} className={cx("agent-step", t.status)} title={t.name}><span className="agent-step-dot"/>{toolLabel(t.name)}</span>)}</div>}<div className="ai-box">{deepText ? <Markdown text={deepText}/> : (analysis ? <Markdown text={analysis}/> : <p className="ai-status-line">Готовлю развёрнутый анализ…</p>)}</div></>)}<div className="archive-actions">{isIncoming && <button className="wide outline" disabled={quickBusy} onClick={runQuickAnalysis}>{quickLabel}</button>}<button className="primary wide" disabled={deepStreaming} onClick={runDeepAnalysis}>{deepLabel}</button><button className={cx("wide icon-btn", selectedMeta.signed ? "outline" : "outline sign-btn")} onClick={toggleSigned}><Icon name={selectedMeta.signed ? "remove_done" : "draw"}/>{selectedMeta.signed ? "Отменить подпись" : "Подписать"}</button><button className="outline wide icon-btn" onClick={downloadSelected}><Icon name="download"/>Скачать {selectedMeta.downloadExt || selectedMeta.format}</button></div>{error && <div className="error">{error}</div>}</> : <div className="empty">Выберите документ</div>}</aside></> : <GDrivePanel setDocModal={setDocModal}/>}</div>
{docModal && <DocModal doc={docModal} onClose={()=>setDocModal(null)}/>}
</section></main>;
}
function humanType(t:string){ const m:Record<string,string>={acts:"Акт", commercial_offers:"Коммерческое предложение", letters:"Письмо", invoices:"Счёт", ttn:"ТТН", upd:"УПД", legal:"Нормативная база"}; return m[t] || t; }
function InDev({screen}:{screen:Screen}){return <main className="main"><TopBar/><div className="in-dev"><Icon name="construction"/><h1>Раздел в разработке</h1><p>{screen}</p></div></main>}


function PreciseContractPaper({fields:f,items,total}:any){
  const partyIntro = `${f.заказчик_полное}, действующий на основании ${f.заказчик_основание}, именуемый в дальнейшем «Заказчик», с одной стороны, и ${f.исполнитель_полное}, именуемое в дальнейшем «Исполнитель», действующего на основании ${f.исполнитель_основание} ИНН${f.исполнитель_инн}, с другой стороны, совместно именуемые в дальнейшем «Стороны», заключили настоящий Договор о нижеследующем:`;
  const clauses = [
    ['1. ПРЕДМЕТ ДОГОВОРА', [`1.1. По настоящему Договору Исполнитель обязуется по индивидуальному заданию Заказчика, в установленный Договором срок выполнить указанные в п. 1.2. работы (далее по тексту - Работы), по изготовлению - ${f.предмет_товара || 'металлических изделий'}, согласно спецификации (форма согласована в приложении № 1 к настоящему Договору) (далее по тексту - Товар или Результат работ), а Заказчик обязуется принять Результат работ (Товар) и оплатить обусловленную Договором цену.`, '1.2. Работы выполняются в соответствии со Спецификациями, являющимися неотъемлемой частью настоящего Договора. Объем, перечень, цена и сроки выполнения Работ определяются в соответствии со Спецификациями, которые оформляется в виде приложений к настоящему Договору, и являются его неотъемлемой частью.', '1.3. Образец Спецификации согласован Сторонами в Приложении № 1 к настоящему Договору.']],
    ['2. СТОИМОСТЬ ТОВАРА И ПОРЯДОК РАСЧЕТОВ', ['2.1. Общая стоимость Товара и порядок расчётов согласовываются Сторонами в Спецификации.', '2.2. Оплата осуществляется в следующем порядке: 75 % от общей стоимости спецификации оплачивается в момент ее согласования; 25 % оплачивается после получения Заказчиком от Исполнителя видеоматериала о готовности партии к отгрузке.', '2.3. Оплата осуществляется путем перечисления денежных средств на расчетный счет Исполнителя. В платёжном поручении в основании платежа указывается номер, дата Счета и Договора.']],
    ['3. СРОК ИЗГОТОВЛЕНИЯ И ПОСТАВКИ ТОВАРА', ['3.1. Общий срок изготовления Товара указывается в Спецификации. Датой начала изготовления Товара Стороны определили дату, следующую после согласования Заказчиком Спецификации и оплаты 75 % от общей стоимости Товара по спецификации.', '3.6. Датой поставки Товара является дата приемки Товара Покупателем в месте поставки, что подтверждается подписанием Заказчиком УПД или товарной накладной по форме ТОРГ-12.']],
    ['4. ПРАВА И ОБЯЗАННОСТИ СТОРОН', ['4.1. Заказчик обязуется предоставить Исполнителю исходные данные для формирования Спецификации, согласовать Спецификацию, принять Товар и подписать УПД, ТН, акты и иные документы в рамках Договора.', '4.4. Исполнитель обязуется изготовить Товар в соответствии со Спецификацией надлежащего качества, обеспечить готовность Товара в сроки и своевременно устранить недостатки.']],
    ['5. ИЗГОТОВЛЕНИЕ И ПРИЕМКА ТОВАРА', ['5.3. Приемка Товара подтверждается подписанием Сторонами УПД и оформляется в порядке, предусмотренном Договором.', '5.4. При одностороннем отказе Исполнителя от составления или подписания Акта обнаружения дефектов Заказчик составляет односторонний акт.']],
    ['6. ОТВЕТСТВЕННОСТЬ СТОРОН', ['6.1. Стороны несут ответственность за неисполнение или ненадлежащее исполнение своих обязательств в соответствии с действующим законодательством РФ.', '6.3. В случае нарушения установленного срока выполнения Работ Заказчик вправе требовать от Исполнителя уплаты пени 0,1% за каждый день просрочки, но не более 10% от стоимости невыполненного объема.']],
    ['7. ФОРС-МАЖОР', ['7.1. Ни одна из Сторон не несет ответственности за невыполнение обязательств, обусловленных обстоятельствами непреодолимой силы.']],
    ['8. ПОРЯДОК РАЗРЕШЕНИЯ СПОРОВ', ['8.1. Все споры разрешаются путем переговоров. При невозможности разрешения разногласий они подлежат рассмотрению в Арбитражном суде города Москвы. Претензионный порядок обязателен.']],
    ['9. КОНФИДЕНЦИАЛЬНОСТЬ', ['9.1. Вся информация, переданная Заказчиком Исполнителю по настоящему Договору, является конфиденциальной и не подлежит передаче третьим лицам без письменного согласия.']],
    ['10. ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ', [`10.1. Настоящий Договор составлен в двух экземплярах и действует до ${f.срок_действия_договора || '31.12.2026 г.'}.`, '10.11. Вся электронная переписка между Сторонами имеет юридическую силу наравне с документами, оформленными на бумажном носителе.']],
  ];
  return <div className="scan contract-scan precise-contract"><h2>ДОГОВОР № {f.номер_документа}</h2><h3>на изготовление и поставку товара</h3><div className="contract-meta"><span>{f.место_заключения}</span><span>{dateLong(f.дата_документа)}</span></div><p className="indent">{partyIntro}</p>{clauses.map(([h,ps]:any)=><section key={h}><h4>{h}</h4>{ps.map((p:string)=><p className="indent" key={p}>{p}</p>)}</section>)}<h4>11. БАНКОВСКИЕ РЕКВИЗИТЫ, АДРЕСА И ПОДПИСИ СТОРОН</h4><table className="contract-requisites"><tbody><tr><td><b><u>Заказчик:</u></b><br/><br/><b>{f.заказчик_полное}</b><br/><br/>ИНН {f.заказчик_инн}<br/>ОГРНИП {f.заказчик_огрн}<br/>Адрес {f.заказчик_адрес}<br/>Банк {f.заказчик_банк}<br/>Р/счет {f.заказчик_рс}<br/>Кор./счет {f.заказчик_кс}<br/>БИК {f.заказчик_бик}<br/>E-mail {f.заказчик_email}<br/><br/><br/><br/>______________________/ {f.заказчик_подписант}/<br/><br/>М.П.</td><td><b><u>Исполнитель:</u></b><br/><br/><b>{f.исполнитель_полное}</b><br/><br/>ИНН {f.исполнитель_инн}<br/>ОГРНИП {f.исполнитель_огрн}<br/>Свидетельство {f.исполнитель_свидетельство}<br/>Адрес {f.исполнитель_адрес}<br/>Налогообложение {f.исполнитель_налогообложение}<br/><b>Расчетный счет</b><br/>Номер счета {f.исполнитель_рс}<br/>Банк {f.исполнитель_банк}<br/>БИК {f.исполнитель_бик}<br/>Корр. счет {f.исполнитель_кс}<br/>Контакты<br/>Телефон {f.исполнитель_телефон}<br/>Электронная почта {f.исполнитель_email}<br/><br/>__________________________/ {f.исполнитель_подписант}/<br/>М.П.</td></tr></tbody></table><div className="page-break-preview"><p className="app-title">Приложение № 1<br/>к Договору № {f.номер_документа} от {dateDoc(f.дата_документа)}<br/>ОБРАЗЕЦ</p><h3 className="center">Спецификация №_____</h3><PreviewTable template="spec" items={items}/></div></div>
}

function PreciseDoverennostPaper({fields:f}:any){
  return <div className="scan power-scan precise-power"><p className="poa-label">{f.гриф}</p><div className="poa-org-header"><b>{String(f.полное_наименование_организации||'').replace(' (ООО «Север»)','')}</b><br/>{f.адрес_организации}<br/>ОГРН {f.огрн_организации}<br/>ИНН {f.инн_организации} КПП {f.кпп_организации}<br/>р/с {f.расчетный_счет}<br/>Банк {f.банк}<br/>к/с {f.корр_счет} БИК {f.бик}</div><p className="poa-date">{f.дата_прописью}</p><p>{f.город}</p><h2>Доверенность № {f.номер_документа}</h2><p className="indent"><b>{String(f.полное_наименование_организации||'Общество').replace(' (ООО «Север»)','')}</b>, в лице Генерального директора <b>{f.директор_фио}</b>, действующего на основании Устава, наделяет <b>{f.представитель_фио}</b>, паспорт серия {f.паспорт_серия} № {f.паспорт_номер} {f.паспорт_выдан}, код подразделения {f.код_подразделения}, правом управления принадлежащим Обществу транспортным средством и быть представителем в ГИБДД, страховых компаниях, СТОА, сервисных центрах по ремонту ТС, с правом сдачи ТС на ремонт, получения ТС из ремонта, подписи, передачи и получения любых документов, представлять интересы ООО «Север» в отношении с {f.контрагент_по_тс} по вопросу получения транспортного средства, а именно приемка автомобиля, подписание договора поставки, договора купли-продажи, акта приема-передачи ТС, товарных накладных и иных документов, имеющих отношение к указанному автомобилю, выполнять иные необходимые действия, связанные с эксплуатацией и обслуживанием ТС:</p><p className="poa-list">Марка модель ТС: {f.марка_модель}<br/>VIN: {f.vin}<br/>Тип ТС: {f.тип_тс}<br/>Год выпуска: {f.год_выпуска}<br/>Категория: {f.категория}<br/>Шасси: {f.шасси}<br/>Выписка из ЭПТС: {f.эптс}</p><p>без права передоверия и продажи указанного транспортного средства.</p><p>Доверенность выдана сроком до {f.срок_доверенности}.</p><p>Доверенность мною прочитана, её смысл и значение мне разъяснены и понятны.</p><p>Подпись {f.представитель_фио_именительный} ____________ удостоверяю</p><p className="right">Генеральный Директор ____________ {f.директор_инициалы}<br/>«___» ___________ {f.год_подписания} г.<br/>М.П</p></div>
}

function LoginPage({ onSuccess }: { onSuccess: (u: AuthUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(api("/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) {
        if (res.status === 401) setError("Неверный логин или пароль");
        else setError(`Ошибка входа (${res.status})`);
        return;
      }
      const data = await res.json();
      onSuccess(data.user as AuthUser);
    } catch (e: any) {
      setError("Не удалось связаться с сервером");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-title">Джарвис-Юрист</div>
        <div className="login-subtitle">Войдите, чтобы продолжить</div>
        <label className="login-label">Логин
          <input className="login-input" type="text" autoComplete="username" autoFocus
                 value={username} onChange={e => setUsername(e.target.value)} required />
        </label>
        <label className="login-label">Пароль
          <input className="login-input" type="password" autoComplete="current-password"
                 value={password} onChange={e => setPassword(e.target.value)} required />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button className="login-button" type="submit" disabled={busy || !username || !password}>
          {busy ? "Вход…" : "Войти"}
        </button>
      </form>
    </div>
  );
}

function AuthGate() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(api("/auth/me"), { credentials: "include" });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setUser(data.user);
        }
      } catch { /* ignore — покажем логин */ }
      finally { if (!cancelled) setChecking(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onUnauth = () => setUser(null);
    window.addEventListener("jarvis:unauthorized", onUnauth);
    return () => window.removeEventListener("jarvis:unauthorized", onUnauth);
  }, []);

  if (checking) return <div className="login-screen"><div className="login-card" style={{textAlign:"center"}}>Загрузка…</div></div>;
  if (!user) return <LoginPage onSuccess={setUser} />;

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <App />
    </AuthContext.Provider>
  );
}

type ErrorBoundaryState = { hasError: boolean; error: Error | null };
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[jarvis] render error caught:", error, info);
    try {
      fetch("/frontend-error", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "render", msg: String(error), stack: (error.stack || "").slice(0, 4000), info: (info.componentStack || "").slice(0, 4000) }) }).catch(() => {});
    } catch { /* ignore */ }
  }
  reset = () => this.setState({ hasError: false, error: null });
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, maxWidth: 720, margin: "40px auto", background: "#161a23", border: "1px solid #5b2530", borderRadius: 12, color: "#f4b3b3", fontFamily: "Inter, system-ui, sans-serif" }}>
          <h2 style={{ color: "#e6e9f0", marginTop: 0 }}>Что-то пошло не так в интерфейсе</h2>
          <p style={{ color: "#c5cbd7" }}>Чат не упал — данные не потеряны. Нажмите «Перезагрузить страницу», чат восстановится из локальной памяти.</p>
          <pre style={{ background: "#0f131c", padding: 12, borderRadius: 8, overflow: "auto", color: "#8a91a1", fontSize: 12 }}>{String(this.state.error)}</pre>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 16px", background: "#4d6fec", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>Перезагрузить страницу</button>
        </div>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

// Глобальный лог любых не пойманных ошибок — и в консоль, и на сервер.
function reportFeError(payload: { kind: string; msg: string; stack?: string; extra?: any }) {
  try {
    fetch("/frontend-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: payload.kind,
        msg: (payload.msg || "").slice(0, 500),
        stack: (payload.stack || "").slice(0, 4000),
        extra: payload.extra,
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
}
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    console.error("[jarvis] window.error:", e.error || e.message, e.filename, e.lineno);
    reportFeError({ kind: "window.error", msg: String(e.message || e.error), stack: e.error?.stack || "", extra: { file: e.filename, line: e.lineno } });
  });
  window.addEventListener("unhandledrejection", (e) => {
    console.error("[jarvis] unhandledrejection:", e.reason);
    const reason: any = e.reason;
    reportFeError({ kind: "unhandledrejection", msg: String(reason?.message || reason), stack: reason?.stack || "" });
  });
}

createRoot(document.getElementById("root")!).render(<ErrorBoundary><AuthGate /></ErrorBoundary>);

