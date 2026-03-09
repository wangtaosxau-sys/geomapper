
import React from 'react';
import { UploadCloudIcon, PlusIcon } from './Icons';
import { useUIStore } from '../contexts/UIContext';

export const EmptyState: React.FC = () => {
  const { handleFileUpload, setManualEntryOpen } = useUIStore();

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] bg-white rounded-2xl border border-slate-200 border-dashed shadow-sm p-8 text-center animate-fade-in">
      <div className="w-20 h-20 bg-brand-50 rounded-full flex items-center justify-center mb-6">
        <UploadCloudIcon className="w-10 h-10 text-brand-500" />
      </div>
      
      <h2 className="text-2xl font-bold text-slate-800 mb-2">开始您的地理编码任务</h2>
      <p className="text-slate-500 max-w-md mb-8">
        支持批量上传 CSV / Excel 文件。
      </p>

      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-lg justify-center">
        <label className="flex-1 flex flex-col items-center justify-center gap-3 p-6 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-brand-300 hover:shadow-md cursor-pointer transition-all group">
          <UploadCloudIcon className="w-6 h-6 text-slate-400 group-hover:text-brand-500 transition-colors" />
          <div>
            <span className="block font-semibold text-slate-700 group-hover:text-brand-700">上传表格文件</span>
            <span className="text-xs text-slate-400">支持 .csv / .xlsx / .xls</span>
          </div>
          <input type="file" accept=".csv, .xlsx, .xls" className="hidden" onChange={handleFileUpload} />
        </label>
      </div>

      <button 
        onClick={() => setManualEntryOpen(true)}
        className="mt-6 text-sm text-slate-400 hover:text-brand-600 flex items-center gap-1 transition-colors"
      >
        <PlusIcon className="w-4 h-4" />
        或者手动录入单条数据
      </button>
    </div>
  );
};
