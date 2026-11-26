import React, { useRef, useState } from 'react';
import {
  FileText,
  Upload,
  Play,
  AlertCircle,
  Check,
  FileCode2,
} from 'lucide-react';
import type { DefaultDocumentResponse } from '../types/validation';

export type InputMode = 'default' | 'upload' | 'paste';

interface DocumentWorkspaceProps {
  defaultDoc: DefaultDocumentResponse | null;
  loadingDefault: boolean;
  defaultError: string | null;
  inputMode: InputMode;
  onInputModeChange: (mode: InputMode) => void;
  selectedFile: File | null;
  onSelectFile: (file: File | null) => void;
  customName: string;
  onCustomNameChange: (name: string) => void;
  customContent: string;
  onCustomContentChange: (content: string) => void;
  isValidating: boolean;
  validationError: string | null;
  onRunValidation: () => void;
  onOpenSourceDoc: () => void;
}

export const DocumentWorkspace: React.FC<DocumentWorkspaceProps> = ({
  defaultDoc,
  loadingDefault,
  defaultError,
  inputMode,
  onInputModeChange,
  selectedFile,
  onSelectFile,
  customName,
  onCustomNameChange,
  customContent,
  onCustomContentChange,
  isValidating,
  validationError,
  onRunValidation,
  onOpenSourceDoc,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileChange = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onSelectFile(files[0]);
    onInputModeChange('upload');
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    handleFileChange(e.dataTransfer.files);
  };

  const canRun =
    !isValidating &&
    ((inputMode === 'default' && Boolean(defaultDoc)) ||
      (inputMode === 'upload' && Boolean(selectedFile)) ||
      (inputMode === 'paste' && customContent.trim().length > 0));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Статическая проверка документа с требованиями
        </h1>
        <p className="mt-2 text-sm text-slate-600 max-w-3xl leading-relaxed">
          Агент выделяет отдельные требования, оценивает каждое по критериям
          ISO/IEC/IEEE 29148:2018 (п. 5.2.5), проверяет весь набор целиком по
          ISO/IEC/IEEE 29148:2018 (п. 5.2.6) и IEEE Std 830-1998 (п. 4.3) и
          формирует отчёт с привязкой дефектов к конкретным цитатам документа.
        </p>
      </div>

      {validationError && (
        <div
          role="alert"
          className="border border-red-200 bg-red-50 px-4 py-3 rounded-lg flex items-start gap-3 text-sm text-red-900"
        >
          <AlertCircle className="w-4 h-4 text-red-700 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div className="font-medium">Ошибка выполнения проверки</div>
            <div className="text-red-800">{validationError}</div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Источник требований
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Выберите исходный документ репозитория, загрузите PDF/Markdown/TXT
              или вставьте текст вручную
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Режим выбора документа"
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
          >
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'default'}
              onClick={() => onInputModeChange('default')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                inputMode === 'default'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Документ задания
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'upload'}
              onClick={() => onInputModeChange('upload')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                inputMode === 'upload'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Загрузить файл
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'paste'}
              onClick={() => onInputModeChange('paste')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                inputMode === 'paste'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Вставить текст
            </button>
          </div>
        </div>

        <div className="p-5">
          {inputMode === 'default' && (
            <div>
              {loadingDefault ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-5 w-64 bg-slate-200 rounded" />
                  <div className="h-4 w-96 bg-slate-100 rounded" />
                  <div className="h-24 w-full bg-slate-100 rounded" />
                </div>
              ) : defaultError ? (
                <div className="text-sm text-red-700">{defaultError}</div>
              ) : defaultDoc ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                        <span className="text-base font-semibold text-slate-900">
                          {defaultDoc.title}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                        <span>{defaultDoc.filename}</span>
                        <span aria-hidden="true">·</span>
                        <span>{defaultDoc.lineCount} строк</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {(defaultDoc.sizeBytes / 1024).toFixed(1)} КБ
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={onOpenSourceDoc}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                    >
                      Открыть текст документа
                    </button>
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <div className="text-xs font-medium text-slate-500 mb-2">
                      Фрагмент документа
                    </div>
                    <pre className="text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-md p-3.5 overflow-x-auto max-h-56 leading-relaxed whitespace-pre-wrap">
                      {defaultDoc.content.slice(0, 1400)}
                      {defaultDoc.content.length > 1400 ? '\n...' : ''}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {inputMode === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  dragActive
                    ? 'border-blue-600 bg-blue-50/40'
                    : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.md,.markdown,.txt"
                  onChange={(e) => handleFileChange(e.target.files)}
                  className="hidden"
                />
                <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2.5" />
                <div className="text-sm font-medium text-slate-900">
                  Нажмите для выбора файла или перетащите документ сюда
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Поддерживаются форматы PDF, Markdown (.md) и обычный текст
                  (.txt) до 15 МБ
                </div>
              </div>

              {selectedFile && (
                <div className="flex items-center justify-between gap-4 border border-slate-200 rounded-md px-4 py-3 bg-slate-50">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {selectedFile.name}
                      </div>
                      <div className="text-xs text-slate-500 font-mono tabular-nums">
                        {(selectedFile.size / 1024).toFixed(1)} КБ
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectFile(null)}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
                  >
                    Удалить
                  </button>
                </div>
              )}
            </div>
          )}

          {inputMode === 'paste' && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="custom-doc-name"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Название документа
                </label>
                <input
                  id="custom-doc-name"
                  type="text"
                  value={customName}
                  onChange={(e) => onCustomNameChange(e.target.value)}
                  placeholder="requirements-draft.md"
                  className="w-full max-w-md px-3 py-2 text-sm border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-500 font-mono"
                />
              </div>

              <div>
                <label
                  htmlFor="custom-doc-content"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Текст требований (Markdown или текст)
                </label>
                <textarea
                  id="custom-doc-content"
                  rows={10}
                  value={customContent}
                  onChange={(e) => onCustomContentChange(e.target.value)}
                  placeholder="Вставьте спецификацию требований для статической проверки..."
                  className="w-full px-3.5 py-2.5 text-xs font-mono border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-500 leading-relaxed"
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-4 rounded-b-lg">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <FileCode2 className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              Выходные разделы: паспорт прогона · нарезка · проверка требований
              · проверка набора · сводка · итог
            </span>
          </div>

          <button
            type="button"
            disabled={!canRun}
            onClick={onRunValidation}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isValidating ? 'Идёт анализ...' : 'Запустить проверку'}</span>
          </button>
        </div>
      </div>

      {isValidating && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">
              Выполняется статический анализ документа
            </div>
            <div className="text-xs font-mono text-slate-500">
              ISO/IEC/IEEE 29148:2018 · IEEE 830
            </div>
          </div>
          <p className="text-xs text-slate-600">
            Модель анализирует структуру, выполняет нарезку требований, проверяет
            каждое требование и весь набор целиком, формируя доказательные
            цитаты. Это обычно занимает 15–35 секунд.
          </p>
          <div className="space-y-2.5 animate-pulse pt-1">
            <div className="h-4 bg-slate-100 rounded w-3/4" />
            <div className="h-4 bg-slate-100 rounded w-5/6" />
            <div className="h-4 bg-slate-100 rounded w-2/3" />
          </div>
        </div>
      )}
    </div>
  );
};
