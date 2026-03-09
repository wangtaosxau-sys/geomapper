
import React, { useState, useEffect } from 'react';
import { useUIStore } from '../contexts/UIContext';

export const ImportMappingModal: React.FC = () => {
  const { isImportMappingOpen, setImportMappingOpen, confirmImport, pendingRawData, pendingFileName } = useUIStore();
  
  const [mainKeyField, setMainKeyField] = useState('');
  const [subKeyField, setSubKeyField] = useState('');

  useEffect(() => {
    if (pendingRawData && pendingRawData.headers.length > 0) {
      const { headers } = pendingRawData;
      const mainGuess = headers.find(h => h.includes('主关键词') || h.includes('名称') || h.includes('Company') || h.includes('Name')) || headers[0];
      const subGuess = headers.find(h => h.includes('副关键词') || h.includes('地址') || h.includes('Address')) || (headers[1] || '');
      setMainKeyField(mainGuess);
      setSubKeyField(subGuess);
    }
  }, [pendingRawData]);

  if (!isImportMappingOpen || !pendingRawData) return null;

  const handleConfirm = () => {
    if (!mainKeyField) {
      alert("请至少选择“主关键词”列");
      return;
    }
    confirmImport(mainKeyField, subKeyField);
  };

  const previewRows = pendingRawData.rows.slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden max-h-[90vh]">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800">导入设置</h2>
            <p className="text-xs text-slate-500 mt-1">文件: {pendingFileName}</p>
          </div>
          <button onClick={() => setImportMappingOpen(false)} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-brand-50 p-4 rounded-lg border border-brand-100">
              <label className="block text-sm font-bold text-brand-800 mb-2">1. 选择“主关键词”列 <span className="text-red-500">*</span></label>
              <select value={mainKeyField} onChange={(e) => setMainKeyField(e.target.value)} className="w-full p-2 border border-brand-300 rounded focus:ring-2 focus:ring-brand-500">
                {pendingRawData.headers.map(h => (<option key={h} value={h}>{h}</option>))}
              </select>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <label className="block text-sm font-bold text-slate-700 mb-2">2. 选择“副关键词”列 (可选)</label>
              <select value={subKeyField} onChange={(e) => setSubKeyField(e.target.value)} className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-slate-400">
                <option value="">(不使用)</option>
                {pendingRawData.headers.map(h => (<option key={h} value={h}>{h}</option>))}
              </select>
            </div>
          </div>

          <div>
             <h3 className="text-sm font-bold text-slate-700 mb-3">数据预览 (前 5 行)</h3>
             <div className="border border-slate-200 rounded-lg overflow-x-auto">
               <table className="w-full text-sm text-left whitespace-nowrap">
                 <thead className="bg-slate-100 text-slate-500 font-medium text-xs uppercase">
                   <tr>
                     {pendingRawData.headers.map(h => (
                       <th key={h} className={`px-4 py-2 border-b border-slate-200 ${h === mainKeyField ? 'bg-brand-100 text-brand-700' : ''} ${h === subKeyField ? 'bg-indigo-50 text-indigo-700' : ''}`}>
                         {h}
                         {h === mainKeyField && <span className="ml-1 text-[10px] bg-brand-200 px-1 rounded">主</span>}
                         {h === subKeyField && <span className="ml-1 text-[10px] bg-indigo-200 px-1 rounded">副</span>}
                       </th>
                     ))}
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {previewRows.map((row, rIdx) => (
                     <tr key={rIdx} className="hover:bg-slate-50">
                       {row.map((cell, cIdx) => (
                         <td key={cIdx} className="px-4 py-2 text-slate-700 border-r border-transparent last:border-0">{cell}</td>
                       ))}
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button onClick={() => setImportMappingOpen(false)} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors">取消</button>
          <button onClick={handleConfirm} className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg shadow-sm">确认导入</button>
        </div>
      </div>
    </div>
  );
};
