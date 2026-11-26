import React from 'react';
import { INDIVIDUAL_CRITERIA, SET_CRITERIA } from '../data/standards';

export const StandardsView: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Критерии оценки качества требований
        </h1>
        <p className="mt-2 text-sm text-slate-600 max-w-3xl leading-relaxed">
          Методика статического ревью основана на стандартах ISO/IEC/IEEE
          29148:2018 (п. 5.2.5 и 5.2.6) и IEEE Std 830-1998 (п. 4.3).
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          01. Критерии отдельного требования (ISO/IEC/IEEE 29148:2018, п. 5.2.5)
        </h2>
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4 w-24">Пункт</th>
                  <th className="py-2.5 px-4 w-56">Критерий</th>
                  <th className="py-2.5 px-4">Определение</th>
                  <th className="py-2.5 px-4">Что проверяет агент</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs text-slate-700">
                {INDIVIDUAL_CRITERIA.map((item) => (
                  <tr key={item.code} className="hover:bg-slate-50/70 align-top">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                      {item.code}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {item.name}
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        {item.englishName}
                      </div>
                    </td>
                    <td className="py-3 px-4 leading-relaxed">
                      {item.description}
                    </td>
                    <td className="py-3 px-4 leading-relaxed text-slate-600">
                      {item.whatAgentChecks}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          02. Критерии набора требований целиком (п. 5.2.6 / IEEE Std 830-1998 п. 4.3)
        </h2>
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4 w-24">Пункт</th>
                  <th className="py-2.5 px-4 w-56">Критерий</th>
                  <th className="py-2.5 px-4">Определение</th>
                  <th className="py-2.5 px-4">Что проверяет агент</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs text-slate-700">
                {SET_CRITERIA.map((item) => (
                  <tr key={item.code} className="hover:bg-slate-50/70 align-top">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                      {item.code}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {item.name}
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        {item.standard}
                      </div>
                    </td>
                    <td className="py-3 px-4 leading-relaxed">
                      {item.description}
                    </td>
                    <td className="py-3 px-4 leading-relaxed text-slate-600">
                      {item.whatAgentChecks}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};
