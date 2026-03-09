
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ProcessedRecord } from '../types';
import { RefreshCwIcon, TrashIcon, CopyIcon, CheckIcon, ExternalLinkIcon, MapPinIcon } from './Icons';
import { useGeocodingStore } from '../contexts/GeocodingContext';
import { useUIStore } from '../contexts/UIContext';

const DEFAULT_COL_WIDTHS = {
  select: 40,
  index: 50,
  mainKeyword: 220,
  subKeyword: 160,
  level: 100, 
  result: 300, 
  source: 70, 
  status: 90,
  action: 80
};

const COL_WIDTHS_STORAGE_KEY = 'geoMapperColWidths'; // U1: 列宽持久化

const ROW_HEIGHT = 60;
const HEADER_HEIGHT = 48;

type SortConfig = {
  key: keyof ProcessedRecord | 'index';
  direction: 'asc' | 'desc';
} | null;

const SortIcon = React.memo(({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) => (
  <span className={`ml-1 inline-block text-[10px] ${active ? 'text-brand-600' : 'text-slate-300'}`}>
    {active ? (direction === 'asc' ? '▲' : '▼') : '↕'}
  </span>
));

export const DataTable: React.FC = () => {
  const { records, actions } = useGeocodingStore();
  const { selectedIds, toggleSelect, toggleAll, clearSelection, triggerManualLocate } = useUIStore();

  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  
  // U1: 从 localStorage 加载列宽
  const [colWidths, setColWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(COL_WIDTHS_STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_COL_WIDTHS, ...JSON.parse(saved) };
      }
    } catch (e) {}
    return DEFAULT_COL_WIDTHS;
  });
  
  const resizingRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // U1: 保存列宽到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(COL_WIDTHS_STORAGE_KEY, JSON.stringify(colWidths));
    } catch (e) {}
  }, [colWidths]);

  // Sorting Logic
  const sortedRecords = useMemo(() => {
    if (!sortConfig) return records;
    return [...records].sort((a, b) => {
      let aValue: any = sortConfig.key === 'index' ? a.originalIndex : a[sortConfig.key];
      let bValue: any = sortConfig.key === 'index' ? b.originalIndex : b[sortConfig.key];
      
      if (typeof aValue === 'string') aValue = aValue.toLowerCase();
      if (typeof bValue === 'string') bValue = bValue.toLowerCase();

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [records, sortConfig]);

  // Virtual Scrolling
  const totalHeight = sortedRecords.length * ROW_HEIGHT;
  const BUFFER = 5; 
  const containerHeight = containerRef.current?.clientHeight || 600;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
  const endIndex = Math.min(sortedRecords.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER);
  
  const visibleRecords = sortedRecords.slice(startIndex, endIndex).map((record, index) => ({
    ...record,
    virtualIndex: startIndex + index 
  }));

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
    if (headerRef.current) {
      headerRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const isAllSelected = records.length > 0 && selectedIds.size === records.length;
  const isIndeterminate = selectedIds.size > 0 && selectedIds.size < records.length;

  const handleToggleAll = (checked: boolean) => {
      toggleAll(checked, records.map(r => r.id));
  };

  const handleCopy = (e: React.MouseEvent, text: string, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
    });
  };

  // Resize Handlers
  const startResize = (e: React.MouseEvent, col: string) => {
    e.preventDefault();
    resizingRef.current = {
      col,
      startX: e.clientX,
      startWidth: colWidths[col as keyof typeof colWidths]
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { col, startX, startWidth } = resizingRef.current;
    const newWidth = Math.max(30, startWidth + (e.clientX - startX)); 
    setColWidths(prev => ({ ...prev, [col]: newWidth }));
  };

  const handleMouseUp = () => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'default';
  };

  const handleSort = (key: keyof ProcessedRecord | 'index') => {
    setSortConfig(current => {
      if (current?.key === key) {
        return current.direction === 'asc' ? { key, direction: 'desc' } : null;
      }
      return { key, direction: 'asc' };
    });
  };

  const getLevelBadgeClass = (level?: string) => {
      if (!level) return 'bg-slate-50 text-slate-400 border-slate-100';
      if (['兴趣点', '门牌号'].includes(level)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      if (['道路', '道路交叉路口'].includes(level)) return 'bg-blue-50 text-blue-700 border-blue-200';
      if (['村庄', '热点区域'].includes(level)) return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      return 'bg-amber-50 text-amber-700 border-amber-200';
  };

  const gridTemplateColumns = `${colWidths.select}px ${colWidths.index}px ${colWidths.mainKeyword}px ${colWidths.subKeyword}px ${colWidths.level}px ${colWidths.result}px ${colWidths.source}px ${colWidths.status}px ${colWidths.action}px`;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full transition-all hover:shadow-md">
      
      {/* Top Bar */}
      <div className="p-4 border-b border-slate-100 bg-white/50 backdrop-blur-sm flex justify-between items-center z-20 shrink-0">
        <h3 className="font-bold text-slate-700 flex items-center gap-2">
          数据列表 
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-normal">{records.length}</span>
          {selectedIds.size > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-xs font-medium animate-fade-in">
              已选 {selectedIds.size} 项
            </span>
          )}
        </h3>
        <div className="flex items-center gap-3 text-xs text-slate-400">
           <span>拖拽表头调整列宽</span>
           <span>•</span>
           <span>点击表头排序</span>
        </div>
      </div>
      
      {/* Header */}
      <div 
        ref={headerRef}
        className="bg-slate-50 border-b border-slate-200 select-none overflow-hidden shrink-0"
        style={{ height: HEADER_HEIGHT, minWidth: '100%' }}
      >
        <div 
           className="grid items-center h-full text-xs uppercase text-slate-500 font-semibold tracking-wider relative"
           style={{ gridTemplateColumns, width: 'fit-content' }}
        >
          <div className="px-3 h-full flex items-center justify-center border-r border-transparent">
            <input 
              type="checkbox"
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
              checked={isAllSelected}
              ref={input => { if(input) input.indeterminate = isIndeterminate; }}
              onChange={(e) => handleToggleAll(e.target.checked)}
            />
          </div>

          {[
            { id: 'index', label: 'No.' },
            { id: 'mainKeyword', label: '主关键词' },
            { id: 'subKeyword', label: '副关键词' },
            { id: 'matchLevel', label: '级别' },
            { id: 'formattedAddress', label: '匹配结果 / 坐标' },
            { id: 'source', label: '来源' },
            { id: 'status', label: '状态' },
            { id: 'action', label: '操作' }
          ].map((col) => (
            <div 
              key={col.id} 
              className="px-4 h-full flex items-center relative group hover:bg-slate-100 cursor-pointer border-r border-transparent hover:border-slate-200 transition-colors"
              onClick={() => col.id !== 'action' && handleSort(col.id as any)}
            >
              <span className="truncate" title={col.label}>{col.label}</span>
              {col.id !== 'action' && (
                <SortIcon active={sortConfig?.key === col.id} direction={sortConfig?.direction || 'asc'} />
              )}
              <div 
                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-brand-400 z-10"
                onMouseDown={(e) => startResize(e, col.id === 'matchLevel' ? 'level' : (col.id === 'formattedAddress' ? 'result' : col.id))}
                onClick={(e) => e.stopPropagation()} 
              />
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div 
        ref={containerRef}
        className="flex-grow overflow-auto relative custom-scrollbar bg-white"
        onScroll={handleScroll}
      >
        <div className="relative" style={{ height: totalHeight, minWidth: 'fit-content' }}>
          {visibleRecords.map((row) => {
            const top = row.virtualIndex * ROW_HEIGHT;
            const isSelected = selectedIds.has(row.id);
            const hasData = !!row.formattedAddress;
            const isFallback = row.status === 'Fail' && hasData; // Drift alert or low confidence
            const hasDrift = row.errorMsg?.includes('偏差');
            
            // Generate Verification Map URL (Use Amap Web for GCJ02 as it's most compatible)
            const verifyUrl = hasData && row.lng && row.lat 
                ? `https://uri.amap.com/marker?position=${row.lng},${row.lat}&name=${encodeURIComponent(row.formattedAddress || '')}&coordinate=gcj02`
                : '#';

            return (
              <div 
                key={row.id}
                className={`grid items-center absolute left-0 right-0 border-b border-slate-50 transition-colors group
                   ${isSelected ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : 'hover:bg-slate-50/80'}
                `}
                style={{ top, height: ROW_HEIGHT, gridTemplateColumns }}
                onClick={() => { 
                   clearSelection();
                   toggleSelect(row.id);
                }}
              >
                <div className="px-3 h-full flex items-center justify-center relative z-10">
                  <input 
                    type="checkbox"
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    checked={isSelected}
                    onChange={(e) => { e.stopPropagation(); toggleSelect(row.id); }}
                  />
                </div>

                <div className="px-4 text-slate-400 font-mono text-xs truncate">{row.originalIndex}</div>

                <div className="px-4 h-full flex items-center">
                   <input 
                    type="text" 
                    className="w-full bg-transparent border border-transparent hover:border-slate-300 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 px-2 py-0.5 rounded transition-all text-slate-700 font-medium text-sm"
                    value={row.mainKeyword} 
                    onChange={(e) => actions.updateRecordField(row.id, 'mainKeyword', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                   />
                </div>

                <div className="px-4 h-full flex items-center">
                    <input 
                      type="text" 
                      className={`w-full bg-transparent border border-transparent hover:border-slate-300 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 px-2 py-1 placeholder-slate-300 rounded transition-all text-sm text-slate-600`}
                      value={row.subKeyword || ''} 
                      onChange={(e) => actions.updateRecordField(row.id, 'subKeyword', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="--"
                    />
                </div>

                <div className="px-4 h-full flex flex-col justify-center overflow-hidden gap-1">
                     {hasData && row.matchLevel ? (
                         <>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border w-fit ${isFallback && !hasDrift ? 'bg-orange-50 text-orange-800 border-orange-200' : getLevelBadgeClass(row.matchLevel)}`} title={row.matchLevel}>
                                {row.matchLevel}
                            </span>
                            {hasDrift && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 w-fit" title={row.errorMsg}>
                                   点位偏移
                                </span>
                            )}
                         </>
                     ) : (
                         <span className="text-slate-300 text-xs">-</span>
                     )}
                </div>

                <div className="px-4 overflow-hidden h-full flex flex-col justify-center">
                  {hasData ? (
                    <div className="flex flex-col gap-1 w-full">
                      <div className="flex items-center gap-2 w-full">
                         <span className="text-slate-800 text-sm font-medium truncate" title={row.formattedAddress}>
                           {row.formattedAddress}
                         </span>
                         {row.matchedBy === 'Composite' && (
                           <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 rounded border border-blue-100 shrink-0">组合</span>
                         )}
                      </div>
                      
                      <div className="flex items-center gap-2 group/coords">
                        <a 
                           href={verifyUrl}
                           target="_blank"
                           rel="noreferrer"
                           className="flex items-center gap-1 text-[11px] text-slate-500 font-mono bg-slate-100 hover:bg-brand-50 hover:text-brand-600 hover:border-brand-200 px-1.5 py-0.5 rounded border border-slate-200 truncate transition-colors cursor-pointer"
                           title="点击在地图中查看 (高德坐标系)"
                           onClick={(e) => e.stopPropagation()}
                        >
                          {row.lng?.toFixed(6)}, {row.lat?.toFixed(6)}
                          <ExternalLinkIcon className="w-3 h-3 ml-0.5" />
                        </a>
                        <button 
                            onClick={(e) => handleCopy(e, `${row.lng?.toFixed(6)},${row.lat?.toFixed(6)}`, row.id)}
                            className="text-slate-300 hover:text-brand-600 opacity-0 group-hover/coords:opacity-100 transition-all p-0.5"
                            title="复制 GCJ02 坐标"
                        >
                            {copiedId === row.id ? <CheckIcon className="w-3.5 h-3.5 text-emerald-500" /> : <CopyIcon className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-300 text-xs">-</span>
                  )}
                </div>

                {/* Source Column with Hover Evidence Tooltip */}
                <div className="px-4 flex items-center relative group/source">
                    {row.source === 'AMAP' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200 cursor-help">高德</span>
                    )}
                    {row.source === 'BAIDU' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 cursor-help">百度</span>
                    )}

                    {/* Verification Tooltip for Concurrent Bidding Evidence */}
                    {row.comparison && (row.comparison.amap || row.comparison.baidu) && (
                        <div className="absolute left-0 bottom-full mb-2 w-72 bg-slate-800 text-slate-200 text-xs rounded-lg shadow-xl p-3 z-50 opacity-0 invisible group-hover/source:opacity-100 group-hover/source:visible transition-all duration-200 pointer-events-none">
                            <div className="font-bold text-slate-100 mb-2 pb-2 border-b border-slate-700">竞价详情对比</div>
                            
                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    <div className="w-8 shrink-0 font-bold text-blue-400">高德</div>
                                    {row.comparison.amap ? (
                                        <div className="flex-1">
                                            <div className="text-white">{row.comparison.amap.address}</div>
                                            <div className="text-slate-400 mt-0.5 flex justify-between">
                                                <span>{row.comparison.amap.level}</span>
                                                <span className="font-mono">{row.comparison.amap.lng.toFixed(5)}, {row.comparison.amap.lat.toFixed(5)}</span>
                                            </div>
                                        </div>
                                    ) : <span className="text-slate-500">无结果</span>}
                                </div>

                                <div className="flex gap-2">
                                    <div className="w-8 shrink-0 font-bold text-red-400">百度</div>
                                    {row.comparison.baidu ? (
                                        <div className="flex-1">
                                            <div className="text-white">{row.comparison.baidu.address}</div>
                                            <div className="text-slate-400 mt-0.5 flex justify-between">
                                                <span>{row.comparison.baidu.level}</span>
                                                <span className="font-mono">{row.comparison.baidu.lng.toFixed(5)}, {row.comparison.baidu.lat.toFixed(5)}</span>
                                            </div>
                                        </div>
                                    ) : <span className="text-slate-500">无结果</span>}
                                </div>
                                
                                {row.comparison.distance !== undefined && (
                                    <div className="pt-2 border-t border-slate-700 text-center">
                                        <span className="text-slate-400">两者偏差距离: </span>
                                        <span className={`font-bold ${row.comparison.distance > 500 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                            {Math.round(row.comparison.distance)} 米
                                        </span>
                                    </div>
                                )}
                                
                                {row.comparison.winnerReason && (
                                    <div className="text-[10px] text-slate-500 italic text-center mt-1">
                                        决策理由: {row.comparison.winnerReason}
                                    </div>
                                )}
                            </div>
                            
                            <div className="absolute left-4 -bottom-1 w-2 h-2 bg-slate-800 rotate-45"></div>
                        </div>
                    )}
                </div>

                <div className="px-4">
                  {row.status === 'Success' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">成功</span>}
                  {row.status === 'Fail' && (
                    <div className="flex items-center gap-1">
                        {isFallback ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-200 truncate max-w-[90px]" title={row.errorMsg}>需复核</span>
                        ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 border border-rose-200 truncate max-w-[90px]" title={row.errorMsg}>失败</span>
                        )}
                    </div>
                  )}
                  {row.status === 'Pending' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">待处理</span>}
                </div>

                <div className="px-4 text-center flex items-center justify-center gap-1 relative z-10">
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      triggerManualLocate({ 
                        id: row.id, 
                        keyword: row.mainKeyword,
                        address: row.formattedAddress || undefined
                      }); 
                    }} 
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all active:scale-95" 
                    title="手动定位"
                  >
                    <MapPinIcon className="w-4 h-4" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); actions.handleSingleRetry(row.id); }} className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-all active:scale-95" title="重试"><RefreshCwIcon className="w-4 h-4" /></button>
                  <button onClick={(e) => { e.stopPropagation(); actions.deleteRecords([row.id]); }} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all active:scale-95" title="删除"><TrashIcon className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
