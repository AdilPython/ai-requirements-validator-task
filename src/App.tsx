import React, { useEffect, useState } from 'react';
import {
  FileCheck2,
  FileSearch,
  BookOpen,
  ClipboardList,
  Menu,
  X,
} from 'lucide-react';
import type {
  DefaultDocumentResponse,
  ValidationReport,
} from './types/validation';
import {
  DocumentWorkspace,
  type InputMode,
} from './components/DocumentWorkspace';
import { ReportView } from './components/ReportView';
import { SourceDocumentView } from './components/SourceDocumentView';
import { StandardsView } from './components/StandardsView';

type ActiveView = 'workspace' | 'report' | 'source' | 'standards';

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>('workspace');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [defaultDoc, setDefaultDoc] = useState<DefaultDocumentResponse | null>(
    null
  );
  const [loadingDefault, setLoadingDefault] = useState(true);
  const [defaultError, setDefaultError] = useState<string | null>(null);

  const [inputMode, setInputMode] = useState<InputMode>('default');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customName, setCustomName] = useState('requirements-draft.md');
  const [customContent, setCustomContent] = useState('');

  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [reports, setReports] = useState<ValidationReport[]>([]);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDefaultDoc() {
      setLoadingDefault(true);
      setDefaultError(null);
      try {
        const res = await fetch('/api/default-document');
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Не удалось загрузить документ');
        }
        if (!cancelled) {
          setDefaultDoc(data as DefaultDocumentResponse);
        }
      } catch (err) {
        if (!cancelled) {
          setDefaultError(
            err instanceof Error ? err.message : 'Ошибка загрузки документа'
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingDefault(false);
        }
      }
    }
    loadDefaultDoc();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeReport =
    reports.find((r) => r.id === activeReportId) ?? reports[0] ?? null;

  const handleRunValidation = async (forceDefault = false) => {
    setIsValidating(true);
    setValidationError(null);

    try {
      let response: Response;

      if (!forceDefault && inputMode === 'upload' && selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        response = await fetch('/api/validate', {
          method: 'POST',
          body: formData,
        });
      } else if (!forceDefault && inputMode === 'paste') {
        response = await fetch('/api/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentName: customName.trim() || 'custom-requirements.md',
            content: customContent,
          }),
        });
      } else {
        response = await fetch('/api/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ useDefault: true }),
        });
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка сервера при проверке');
      }

      const report = data as ValidationReport;
      setReports((prev) => [report, ...prev]);
      setActiveReportId(report.id);
      setActiveView('report');
    } catch (err) {
      setValidationError(
        err instanceof Error
          ? err.message
          : 'Не удалось выполнить проверку документа'
      );
      setActiveView('workspace');
    } finally {
      setIsValidating(false);
    }
  };

  const navItems: {
    id: ActiveView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'workspace', label: 'Проверка документа', icon: FileSearch },
    { id: 'report', label: 'Отчёт о проверке', icon: ClipboardList },
    { id: 'source', label: 'Исходный документ', icon: FileCheck2 },
    { id: 'standards', label: 'Критерии стандарта', icon: BookOpen },
  ];

  const viewTitleMap: Record<ActiveView, string> = {
    workspace: 'Проверка документа',
    report: 'Отчёт о проверке',
    source: 'Исходный документ',
    standards: 'Критерии стандарта',
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between shrink-0">
        <span className="text-sm font-semibold tracking-tight text-slate-900 whitespace-nowrap">
          Агент требований
        </span>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1 text-slate-500 hover:text-slate-900"
          aria-label="Закрыть меню"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveView(item.id);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-slate-900 text-white font-medium'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {reports.length > 0 && (
        <div className="mt-4 px-3 pt-4 border-t border-slate-200 flex-1 overflow-y-auto">
          <div className="px-2 text-xs font-semibold text-slate-500 mb-2">
            История прогонов
          </div>
          <div className="space-y-1">
            {reports.map((rep) => {
              const selected =
                activeView === 'report' && activeReport?.id === rep.id;
              return (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => {
                    setActiveReportId(rep.id);
                    setActiveView('report');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-colors ${
                    selected
                      ? 'bg-slate-100 text-slate-900 font-medium'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="truncate font-mono">
                    {rep.passport.documentName}
                  </div>
                  <div className="text-slate-400 font-mono tabular-nums mt-0.5 truncate">
                    Находок: {rep.summary.totalFindings} · Critical:{' '}
                    {rep.summary.severityCounts.Critical}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 bg-white border-r border-slate-200 shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/30"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-50 w-64 bg-white border-r border-slate-200 h-full">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 -ml-1.5 text-slate-600 hover:text-slate-900"
              aria-label="Открыть меню"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-500 whitespace-nowrap shrink-0">
              <span>Ревью требований</span>
              <span aria-hidden="true">/</span>
              <span className="font-medium text-slate-900">
                {viewTitleMap[activeView]}
              </span>
            </div>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              disabled={isValidating}
              onClick={() => handleRunValidation(activeView === 'source')}
              className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {isValidating ? 'Идёт анализ...' : 'Запустить проверку'}
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
          {activeView === 'workspace' && (
            <DocumentWorkspace
              defaultDoc={defaultDoc}
              loadingDefault={loadingDefault}
              defaultError={defaultError}
              inputMode={inputMode}
              onInputModeChange={setInputMode}
              selectedFile={selectedFile}
              onSelectFile={setSelectedFile}
              customName={customName}
              onCustomNameChange={setCustomName}
              customContent={customContent}
              onCustomContentChange={setCustomContent}
              isValidating={isValidating}
              validationError={validationError}
              onRunValidation={() => handleRunValidation(false)}
              onOpenSourceDoc={() => setActiveView('source')}
            />
          )}

          {activeView === 'report' && (
            <ReportView
              report={activeReport}
              onGoToRun={() => setActiveView('workspace')}
            />
          )}

          {activeView === 'source' && defaultDoc && (
            <SourceDocumentView
              filename={defaultDoc.filename}
              title={defaultDoc.title}
              content={defaultDoc.content}
              onRunValidation={() => handleRunValidation(true)}
              isValidating={isValidating}
            />
          )}

          {activeView === 'standards' && <StandardsView />}
        </main>
      </div>
    </div>
  );
}

export default App;
