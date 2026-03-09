
import React from 'react';
import { ActivityIcon, AlertTriangleIcon, SparklesIcon, RefreshCwIcon } from './Icons';
import { useGeocodingStore } from '../contexts/GeocodingContext';

export const StatsCards: React.FC = () => {
  const { stats } = useGeocodingStore();
  const successRate = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : '0.0';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {/* Total Card */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">总任务数</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{stats.total}</p>
        </div>
        <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-600 transition-colors">
          <ActivityIcon className="w-5 h-5" />
        </div>
      </div>

      {/* Success Card */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
        <div>
          <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">成功处理</p>
          <div className="flex items-end gap-2 mt-1">
             <p className="text-2xl font-bold text-slate-800">{stats.success}</p>
             <span className="text-xs font-medium text-emerald-600 mb-1 bg-emerald-50 px-1.5 py-0.5 rounded-full">{successRate}%</span>
          </div>
        </div>
        <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 group-hover:bg-emerald-100 transition-colors">
          <SparklesIcon className="w-5 h-5" />
        </div>
      </div>

      {/* Pending Card */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
        <div>
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">等待中</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{stats.pending}</p>
        </div>
        <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 group-hover:bg-amber-100 transition-colors">
          <RefreshCwIcon className="w-5 h-5" />
        </div>
      </div>

      {/* Failed Card */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
        <div>
          <p className="text-xs font-medium text-rose-600 uppercase tracking-wider">失败</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{stats.failed}</p>
        </div>
        <div className="h-10 w-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 group-hover:bg-rose-100 transition-colors">
          <AlertTriangleIcon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
