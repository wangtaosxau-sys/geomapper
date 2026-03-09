
import React, { useState, useRef, useEffect } from 'react';
import { ProcessStatus, RetryStrategy, ProviderMode } from '../types';
import { PlayIcon, PauseIcon, DownloadIcon, UploadCloudIcon, PlusIcon, RefreshCwIcon, TrashIcon, FileTextIcon, MapPinIcon } from './Icons';
import { useGeocodingStore } from '../contexts/GeocodingContext';
import { useUIStore } from '../contexts/UIContext';
import { downloadCSV, downloadExcel, downloadGeoJSON } from '../utils';

export const ActionToolbar: React.FC = () => {
  // Contexts
  const { records, status, logs, progress, stats, actions, config, setConfig } = useGeocodingStore();
  const { 
    appendMode, setAppendMode, 
    setManualEntryOpen, handleFileUpload, 
    selectedIds, clearSelection,
    viewMode, setViewMode
  } = useUIStore();

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showRetryMenu, setShowRetryMenu] = useState(false);
  const [showStrategyMenu, setShowStrategyMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const retryMenuRef = useRef<HTMLDivElement>(null);
  const strategyMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) setShowExportMenu(false);
      if (retryMenuRef.current && !retryMenuRef.current.contains(event.target as Node)) setShowRetryMenu(false);
      if (strategyMenuRef.current && !strategyMenuRef.current.contains(event.target as Node)) setShowStrategyMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const STRATEGY_OPTIONS: { value: ProviderMode; label: string; icon: string; desc: string }[] = [
    { value: 'CONCURRENT_BIDDING', label: '双向竞价', icon: '🌟', desc: '高德+百度同时查询，精度最高' },
    { value: 'WATERFALL_BAIDU_FIRST', label: '百度优先', icon: '🔴', desc: '优先百度，失败时高德补充' },
    { value: 'WATERFALL_AMAP_FIRST', label: '高德优先', icon: '🔷', desc: '优先高德，失败时百度补充' },
    { value: 'BAIDU_ONLY', label: '仅百度', icon: '⭕', desc: '只使用百度地图服务' },
    { value: 'AMAP_ONLY', label: '仅高德', icon: '🔹', desc: '只使用高德地图服务' },
  ];

  const currentStrategy = STRATEGY_OPTIONS.find(s => s.value === config.providerMode) || STRATEGY_OPTIONS[0];

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const isProcessing = status === ProcessStatus.PROCESSING;
  const selectedCount = selectedIds.size;

  const handleRetry = (strategy: RetryStrategy) => {
      setShowRetryMenu(false);
      if (selectedCount > 0) {
          actions.retrySelectedRecords(Array.from(selectedIds), strategy);
      } else {
          actions.retryFailedRecords(strategy);
      }
  };

  const handleToggleProcessing = () => {
      const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
      actions.toggleProcessing(targetIds);
  };

  const handleDeleteSelected = () => {
      if (selectedCount === 0) return;
      actions.deleteRecords(Array.from(selectedIds));
      clearSelection();
  };

  return (
    <div className="flex flex-col gap-4">
      {status === ProcessStatus.PAUSED && logs.length > 0 && logs[logs.length-1].level === 'error' && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 w-full rounded-r-lg animate-fade-in shadow-sm">
            <div className="flex">
                <p className="text-sm text-red-700 font-bold flex items-center gap-2">
                    <span className="text-lg">⚠️</span> 任务已自动暂停
                </p>
            </div>
            <p className="text-xs text-red-600 mt-1 pl-7">系统检测到连续的 API 密钥失效或网络错误。为保护您的数据和配额，处理已停止。请检查日志和配置后重新开始。</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col lg:flex-row gap-4 items-center justify-between transition-all">
        {/* Left: Inputs */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* View Toggle - Enhanced Visibility */}
          <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200 mr-2 shadow-sm">
             <button 
                onClick={() => setViewMode('list')} 
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${viewMode === 'list' ? 'bg-white text-brand-700 shadow ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
             >
                <FileTextIcon className="w-4 h-4" /> 列表模式
             </button>
             <button 
                onClick={() => setViewMode('map')} 
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${viewMode === 'map' ? 'bg-white text-emerald-600 shadow ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
             >
                <MapPinIcon className="w-4 h-4" /> 地图模式
             </button>
          </div>

          <div className="h-8 w-px bg-slate-200 mx-1 hidden md:block"></div>

          <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button onClick={() => setAppendMode(true)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${appendMode ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>追加</button>
            <button onClick={() => setAppendMode(false)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!appendMode ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>覆盖</button>
          </div>

          <div className="h-8 w-px bg-slate-200 mx-1 hidden md:block"></div>

          <button onClick={() => setManualEntryOpen(true)} className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors text-sm font-medium">
            <PlusIcon className="w-4 h-4" /> 手动
          </button>
          
          <label className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700">
            <UploadCloudIcon className="w-4 h-4 text-brand-600" /> 导入
            <input type="file" accept=".csv, .xlsx, .xls" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
          {records.length > 0 && (
            <>
              {isProcessing && (
                <div className="flex items-center gap-4 mr-2">
                  <div className="flex flex-col items-end">
                    <div className="text-[10px] text-slate-400 font-mono flex gap-2">
                         {stats && stats.rps > 0 && <span><span className="text-slate-500 font-bold">{stats.rps}</span> req/s</span>}
                         {stats && stats.eta > 0 && <span>ETA: <span className="text-slate-500 font-bold">{formatTime(stats.eta)}</span></span>}
                    </div>
                    <div className="w-32 bg-slate-100 rounded-full h-1.5 overflow-hidden mt-1">
                      <div className="h-full transition-all duration-300 bg-amber-500" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </div>
              )}

              {selectedCount > 0 && !isProcessing && (
                  <button onClick={handleDeleteSelected} className="flex items-center gap-1 px-3 py-2 bg-white border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 hover:border-rose-300 transition-colors shadow-sm text-sm font-medium">
                    <TrashIcon className="w-4 h-4" /> 删除 ({selectedCount})
                  </button>
              )}

              {!isProcessing && (
                 <div className="relative" ref={retryMenuRef}>
                   <button onClick={() => setShowRetryMenu(!showRetryMenu)} className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors shadow-sm text-sm font-medium border ${selectedCount > 0 ? 'bg-white border-brand-200 text-brand-600 hover:bg-brand-50' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                      <RefreshCwIcon className="w-4 h-4" />
                      {selectedCount > 0 ? `重试选中 (${selectedCount})` : '重试失败项'}
                      <span className="ml-1 text-[10px] opacity-50">▼</span>
                   </button>

                   {showRetryMenu && (
                      <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-slate-100 z-50 overflow-hidden animate-fade-in divide-y divide-slate-50">
                          <button onClick={() => handleRetry('AUTO')} className="w-full text-left px-4 py-3 hover:bg-slate-50 text-xs text-slate-700">
                               <span className="block font-bold mb-0.5">智能自动 (默认)</span>
                               <span className="text-slate-400">综合使用多策略组合与防漂移检测</span>
                          </button>
                          <button onClick={() => handleRetry('FORCE_GEO')} className="w-full text-left px-4 py-3 hover:bg-slate-50 text-xs text-slate-700">
                               <span className="block font-bold mb-0.5 text-blue-600">强制地理编码</span>
                               <span className="text-slate-400">仅使用地址解析，忽略 POI</span>
                          </button>
                          <button onClick={() => handleRetry('FORCE_SEARCH')} className="w-full text-left px-4 py-3 hover:bg-slate-50 text-xs text-slate-700">
                               <span className="block font-bold mb-0.5 text-indigo-600">强制 POI 搜索</span>
                               <span className="text-slate-400">仅搜索兴趣点，适合纯商户名</span>
                          </button>
                          <button onClick={() => handleRetry('SIMPLE_MAIN')} className="w-full text-left px-4 py-3 hover:bg-slate-50 text-xs text-slate-700">
                               <span className="block font-bold mb-0.5 text-slate-600">仅主关键词</span>
                               <span className="text-slate-400">忽略地区和副词，仅查主词</span>
                          </button>
                      </div>
                   )}
                 </div>
              )}

              {/* 调度策略选择器 - 移到右侧 */}
              <div className="relative" ref={strategyMenuRef}>
                <button 
                  onClick={() => setShowStrategyMenu(!showStrategyMenu)}
                  className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg hover:from-indigo-100 hover:to-purple-100 transition-all text-sm font-medium text-indigo-700 shadow-sm"
                >
                  <span>{currentStrategy.icon}</span>
                  <span>{currentStrategy.label}</span>
                  <span className="text-[10px] opacity-60">▼</span>
                </button>

                {showStrategyMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-fade-in">
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">调度策略</span>
                    </div>
                    {STRATEGY_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setConfig(prev => ({ ...prev, providerMode: opt.value }));
                          setShowStrategyMenu(false);
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3 ${config.providerMode === opt.value ? 'bg-indigo-50' : ''}`}
                      >
                        <span className="text-lg">{opt.icon}</span>
                        <div className="flex-1">
                          <div className={`text-sm font-medium ${config.providerMode === opt.value ? 'text-indigo-700' : 'text-slate-700'}`}>
                            {opt.label}
                            {config.providerMode === opt.value && <span className="ml-2 text-[10px] bg-indigo-200 text-indigo-700 px-1.5 py-0.5 rounded">当前</span>}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">{opt.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button 
                onClick={handleToggleProcessing}
                disabled={status === ProcessStatus.COMPLETED && records.every(r => r.status === 'Success')}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg font-medium text-white transition-all shadow-md hover:shadow-lg text-sm ${status === ProcessStatus.PROCESSING ? 'bg-amber-500 hover:bg-amber-600' : 'bg-brand-600 hover:bg-brand-700'}`}
              >
                {status === ProcessStatus.PROCESSING ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
                {status === ProcessStatus.PROCESSING ? '暂停' : (selectedCount > 0 ? `开始处理选中 (${selectedCount})` : '开始全部处理')}
              </button>

              <div className="relative" ref={exportMenuRef}>
                <button onClick={() => setShowExportMenu(!showExportMenu)} className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors text-sm font-medium">
                  <DownloadIcon className="w-4 h-4" /> 导出
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-100 z-50 overflow-hidden animate-fade-in">
                    <button onClick={() => { downloadCSV(records, 'geocoded_results.csv', 'utf-8'); setShowExportMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm text-slate-700 border-b border-slate-50 flex items-center gap-2">
                      <span className="font-mono text-xs bg-slate-100 text-slate-500 px-1 rounded">CSV</span> 通用格式 (UTF-8)
                    </button>
                    <button onClick={() => { downloadExcel(records, 'geocoded_results.xlsx'); setShowExportMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm text-slate-700 border-b border-slate-50 flex items-center gap-2">
                       <span className="font-mono text-xs bg-green-100 text-green-700 px-1 rounded">XLSX</span> Excel 表格
                    </button>

                    <button onClick={() => { downloadGeoJSON(records, 'geocoded_results.json'); setShowExportMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2">
                      <span className="font-mono text-xs bg-indigo-100 text-indigo-700 px-1 rounded">JSON</span> GeoJSON (GIS)
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
