import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import clsx from 'clsx';
import {
  ArrowLeft,
  BellPlus,
  CheckCheck,
  Inbox,
  Mail,
  MailOpen,
  Paperclip,
  Search,
  Send,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { db } from '@/db/database';
import type { Message } from '@/models/types';

type TabFilter = 'inbox' | 'sent' | 'unread';

/** Formats message date for the list row ("Dzisiaj 07:45", "Wczoraj", "14 lis"). */
function formatListDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const msgDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((todayStart - msgDayStart) / 86_400_000);

  if (diffDays === 0) {
    return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Wczoraj';
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Full date-time string for the message detail header. */
function formatFullDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pl-PL', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Extracts 1–2 initials from a teacher/sender display name. */
function getInitials(sender: string): string {
  const cleaned = sender
    .replace(/\b(mgr|inż\.|dr|ks\.|prof\.|dyrektor|pedagog|szkolny)\b/gi, '')
    .replace(/\([^)]*\)/g, '')
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function MessagesPage() {
  const { session, openMessage, simulateIncomingMessage } = useApp();
  const { messageId } = useParams<{ messageId?: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabFilter>('inbox');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(messageId ?? null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Sync URL param `/messages/:messageId` if navigated via notification tap
  useEffect(() => {
    if (messageId) setSelectedId(messageId);
  }, [messageId]);

  // Live query of all messages from Dexie sorted newest first
  const allMessages = useLiveQuery(
    () => db.messages.orderBy('dateSent').reverse().toArray(),
    [],
    [] as Message[],
  );

  const unreadInboxCount = useMemo(
    () => allMessages.filter((m) => m.folder === 'inbox' && !m.isRead).length,
    [allMessages],
  );

  // Filtered messages according to active tab + search input
  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allMessages.filter((m) => {
      if (activeTab === 'inbox' && m.folder !== 'inbox') return false;
      if (activeTab === 'sent' && m.folder !== 'sent') return false;
      if (activeTab === 'unread' && (m.folder !== 'inbox' || m.isRead)) return false;

      if (!q) return true;
      return (
        m.sender.toLowerCase().includes(q) ||
        m.subject.toLowerCase().includes(q) ||
        m.content.toLowerCase().includes(q)
      );
    });
  }, [allMessages, activeTab, searchQuery]);

  // Currently opened message (reactive from Dexie so read status & fetched body update live)
  const selectedMessage = useMemo(
    () => (selectedId ? allMessages.find((m) => m.id === selectedId) ?? null : null),
    [allMessages, selectedId],
  );

  const handleSelectMessage = (msg: Message) => {
    setSelectedId(msg.id);
    void openMessage(msg.id);
  };

  const handleCloseDetail = () => {
    setSelectedId(null);
    if (messageId) navigate('/messages', { replace: true });
  };

  const handleSimulateIncoming = async () => {
    if (isSimulating) return;
    setIsSimulating(true);
    try {
      await simulateIncomingMessage();
      if (activeTab === 'sent') setActiveTab('inbox');
    } finally {
      setIsSimulating(false);
    }
  };

  // ───────────────────── Detail View (Full-screen Slide-over) ─────────────────────
  if (selectedMessage) {
    return (
      <div className="flex min-h-full flex-col bg-white dark:bg-slate-900">
        {/* Detail Toolbar */}
        <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/90">
          <button
            type="button"
            onClick={handleCloseDetail}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200/80 hover:bg-slate-100 active:scale-95 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-700"
          >
            <ArrowLeft size={16} />
            <span>Wróć do listy</span>
          </button>

          <div className="flex items-center gap-2">
            <span
              className={clsx(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                selectedMessage.folder === 'inbox'
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/70 dark:text-brand-300'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
              )}
            >
              {selectedMessage.folder === 'inbox' ? 'Odebrane' : 'Wysłane'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCheck size={12} />
              Przeczytana
            </span>
          </div>
        </div>

        {/* Detail Content */}
        <article className="flex-1 p-4">
          <h1 className="selectable text-lg font-bold leading-snug text-slate-900 dark:text-white">
            {selectedMessage.subject}
          </h1>

          {/* Sender card */}
          <div className="mt-3.5 flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-xs font-bold text-white shadow-sm">
              {getInitials(selectedMessage.sender)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <User size={12} />
                <span>{selectedMessage.folder === 'inbox' ? 'Od:' : 'Do:'}</span>
              </div>
              <p className="selectable truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {selectedMessage.sender}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {formatFullDate(selectedMessage.dateSent)}
              </p>
            </div>
          </div>

          {/* Attachments */}
          {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Załączniki ({selectedMessage.attachments.length})
              </p>
              {selectedMessage.attachments.map((att, idx) => (
                <a
                  key={`${att.name}-${idx}`}
                  href={att.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-brand-600 transition hover:bg-brand-50 dark:border-slate-800 dark:bg-slate-800/80 dark:text-brand-400"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Paperclip size={14} className="shrink-0" />
                    <span className="truncate">{att.name}</span>
                  </div>
                  {att.size && (
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {formatFileSize(att.size)}
                    </span>
                  )}
                </a>
              ))}
            </div>
          )}

          {/* Full Message Body (Offline Ready) */}
          <div className="selectable mt-4 rounded-2xl border border-slate-200/70 bg-white p-4 text-sm leading-relaxed text-slate-800 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
            {selectedMessage.content ? (
              <p className="whitespace-pre-line">{selectedMessage.content}</p>
            ) : (
              <p className="italic text-slate-400">
                Treść wiadomości jest pobierana lub niedostępna w trybie offline…
              </p>
            )}
          </div>
        </article>
      </div>
    );
  }

  // ───────────────────── List View ─────────────────────
  return (
    <div className="flex flex-col gap-3 p-3.5">
      {/* Demo Mode Simulation Button */}
      {session.mode === 'mock' && (
        <div className="rounded-2xl border border-violet-200/90 bg-gradient-to-r from-violet-50 via-indigo-50 to-brand-50 p-3 shadow-sm dark:border-violet-900/60 dark:from-violet-950/50 dark:via-indigo-950/40 dark:to-slate-900">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold text-violet-800 dark:text-violet-300">
                <Sparkles size={14} />
                <span>Tryb testowy (Demo)</span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                Przetestuj silnik Diff &amp; Notify oraz bazę offline jednym kliknięciem.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSimulateIncoming()}
            disabled={isSimulating}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.99] disabled:opacity-60"
          >
            <BellPlus size={16} />
            <span>
              {isSimulating
                ? 'Generowanie wiadomości…'
                : 'Symuluj nową wiadomość i powiadomienie'}
            </span>
          </button>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Szukaj nadawcy, tematu lub treści…"
          className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-800 dark:bg-slate-800/90 dark:text-slate-100"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Wyczyść wyszukiwanie"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Folder / Filter Tabs */}
      <div
        role="tablist"
        aria-label="Filtry wiadomości"
        className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800/90"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'inbox'}
          onClick={() => setActiveTab('inbox')}
          className={clsx(
            'flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition',
            activeTab === 'inbox'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
          )}
        >
          <Inbox size={14} />
          <span>Odebrane</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'unread'}
          onClick={() => setActiveTab('unread')}
          className={clsx(
            'flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition',
            activeTab === 'unread'
              ? 'bg-white text-brand-600 shadow-sm dark:bg-slate-900 dark:text-brand-400'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
          )}
        >
          <Mail size={14} />
          <span>Nieprzeczytane</span>
          {unreadInboxCount > 0 && (
            <span className="rounded-full bg-rose-600 px-1.5 py-0.2 text-[10px] font-bold text-white">
              {unreadInboxCount}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'sent'}
          onClick={() => setActiveTab('sent')}
          className={clsx(
            'flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition',
            activeTab === 'sent'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
          )}
        >
          <Send size={14} />
          <span>Wysłane</span>
        </button>
      </div>

      {/* Messages List */}
      {filteredMessages.length === 0 ? (
        <div className="my-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 p-8 text-center dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <MailOpen size={24} />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            {searchQuery
              ? 'Brak wiadomości pasujących do wyszukiwania'
              : activeTab === 'unread'
                ? 'Wszystkie wiadomości zostały przeczytane!'
                : 'Brak wiadomości w tej skrzynce'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Wszystkie pobrane wiadomości są zapisywane w pamięci offline.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:divide-slate-800/80 dark:border-slate-800 dark:bg-slate-900">
          {filteredMessages.map((msg) => {
            const isUnread = !msg.isRead && msg.folder === 'inbox';
            const hasAttachments = Boolean(msg.attachments && msg.attachments.length > 0);
            return (
              <li key={msg.id}>
                <button
                  type="button"
                  onClick={() => handleSelectMessage(msg)}
                  className={clsx(
                    'flex w-full items-start gap-3 px-3.5 py-3 text-left transition active:bg-slate-100 dark:active:bg-slate-800',
                    isUnread
                      ? 'bg-brand-50/50 hover:bg-brand-50/80 dark:bg-brand-950/25 dark:hover:bg-brand-950/40'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                  )}
                >
                  {/* Avatar + Unread dot */}
                  <div className="relative mt-0.5 shrink-0">
                    <div
                      className={clsx(
                        'flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold',
                        isUnread
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                      )}
                    >
                      {getInitials(msg.sender)}
                    </div>
                    {isUnread && (
                      <span
                        title="Nieprzeczytana"
                        className="absolute -left-1 -top-1 h-3 w-3 rounded-full bg-brand-600 ring-2 ring-white dark:ring-slate-900"
                      />
                    )}
                  </div>

                  {/* Sender, Subject & Snippet */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={clsx(
                          'truncate text-xs',
                          isUnread
                            ? 'font-bold text-slate-900 dark:text-white'
                            : 'font-medium text-slate-600 dark:text-slate-300',
                        )}
                      >
                        {msg.sender}
                      </span>
                      <span
                        className={clsx(
                          'shrink-0 text-[11px]',
                          isUnread
                            ? 'font-semibold text-brand-600 dark:text-brand-400'
                            : 'text-slate-400 dark:text-slate-500',
                        )}
                      >
                        {formatListDate(msg.dateSent)}
                      </span>
                    </div>

                    <div className="mt-0.5 flex items-center gap-1.5">
                      <p
                        className={clsx(
                          'truncate text-sm',
                          isUnread
                            ? 'font-bold text-slate-900 dark:text-white'
                            : 'font-medium text-slate-800 dark:text-slate-200',
                        )}
                      >
                        {msg.subject}
                      </p>
                      {hasAttachments && (
                        <Paperclip
                          size={13}
                          className="shrink-0 text-slate-400"
                          aria-label="Posiada załącznik"
                        />
                      )}
                    </div>

                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      {msg.content || 'Kliknij, aby wczytać pełną treść wiadomości…'}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default MessagesPage;
