import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

interface SourceDocumentViewProps {
  filename: string;
  title: string;
  content: string;
  onRunValidation: () => void;
  isValidating: boolean;
}

export const SourceDocumentView: React.FC<SourceDocumentViewProps> = ({
  filename,
  title,
  content,
  onRunValidation,
  isValidating,
}) => {
  const [query, setQuery] = useState('');

  const lines = useMemo(() => content.split(/\r?\n/), [content]);

  const filteredLines = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return lines.map((text, idx) => ({ lineNo: idx + 1, text }));
    }
    return lines
      .map((text, idx) => ({ lineNo: idx + 1, text }))
      .filter((item) => item.text.toLowerCase().includes(q));
  }, [lines, query]);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="border-b border-slate-200 pb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
            <span>{filename}</span>
            <span aria-hidden="true">·</span>
            <span>{lines.length} строк</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по тексту..."
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-500 w-56"
            />
          </div>

          <button
            type="button"
            disabled={isValidating}
            onClick={onRunValidation}
            className="px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            {isValidating ? 'Идёт анализ...' : 'Проверить документ'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {filteredLines.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            По запросу «{query}» совпадений не найдено.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full border-collapse font-mono text-xs">
              <tbody>
                {filteredLines.map((row) => (
                  <tr
                    key={row.lineNo}
                    className="hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                  >
                    <td className="select-none text-right text-slate-400 tabular-nums px-3 py-1 border-r border-slate-200 w-12 align-top bg-slate-50/50">
                      {row.lineNo}
                    </td>
                    <td className="px-4 py-1 text-slate-800 whitespace-pre-wrap break-words leading-relaxed">
                      {row.text || ' '}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
