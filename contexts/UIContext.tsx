
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { RawFileData, readRawCSV, readRawExcel, mapRawToRecords } from '../utils';
import { useGeocodingStore } from './GeocodingContext';

export type ViewMode = 'list' | 'map';

// 手动定位目标记录
export interface LocateTarget {
  id: string;
  keyword: string;
  address?: string;
}

interface UIContextType {
  // View Control
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Manual Locate
  locateTarget: LocateTarget | null;
  setLocateTarget: (target: LocateTarget | null) => void;
  triggerManualLocate: (target: LocateTarget) => void;

  // Modals
  isSettingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  isManualEntryOpen: boolean;
  setManualEntryOpen: (open: boolean) => void;
  isImportMappingOpen: boolean;
  setImportMappingOpen: (open: boolean) => void;
  
  // Settings
  appendMode: boolean;
  setAppendMode: (mode: boolean) => void;

  // Import Logic
  pendingRawData: RawFileData | null;
  pendingFileName: string;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  confirmImport: (mainKey: string, subKey: string) => void;

  // Selection Logic
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  toggleAll: (selectAll: boolean, allIds: string[]) => void;
  clearSelection: () => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { actions } = useGeocodingStore();

  // View State
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [locateTarget, setLocateTarget] = useState<LocateTarget | null>(null);

  // 触发手动定位：切换到地图模式并设置目标
  const triggerManualLocate = (target: LocateTarget) => {
    setLocateTarget(target);
    setViewMode('map');
  };

  // Modal States
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isManualEntryOpen, setManualEntryOpen] = useState(false);
  const [isImportMappingOpen, setImportMappingOpen] = useState(false);
  
  // Logic States
  const [appendMode, setAppendMode] = useState(true);
  const [pendingRawData, setPendingRawData] = useState<RawFileData | null>(null);
  const [pendingFileName, setPendingFileName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // --- Import Handlers ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPendingFileName(file.name);
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const reader = new FileReader();

    const onLoad = (raw: RawFileData) => {
       if (raw.headers.length === 0) {
           alert('文件解析失败：未找到列头');
           return;
       }
       setPendingRawData(raw);
       setImportMappingOpen(true);
    };

    if (isExcel) {
        reader.onload = (evt) => {
            try {
                const raw = readRawExcel(evt.target?.result as ArrayBuffer);
                onLoad(raw);
            } catch (e) { console.error(e); alert('Excel 解析失败'); }
        };
        reader.readAsArrayBuffer(file);
    } else {
        reader.onload = (evt) => {
            try {
                const raw = readRawCSV(evt.target?.result as string);
                onLoad(raw);
            } catch (e) { console.error(e); alert('CSV 解析失败'); }
        };
        reader.readAsText(file);
    }
    e.target.value = '';
  };

  const confirmImport = (mainKey: string, subKey: string) => {
    if (pendingRawData) {
      const mappedRecords = mapRawToRecords(pendingRawData, mainKey, subKey);
      actions.importRecords(mappedRecords, appendMode, pendingFileName);
    }
    setImportMappingOpen(false);
    setPendingRawData(null);
  };

  // --- Selection Handlers ---
  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleAll = (selectAll: boolean, allIds: string[]) => {
    if (selectAll) setSelectedIds(new Set(allIds));
    else setSelectedIds(new Set());
  };

  const clearSelection = () => setSelectedIds(new Set());

  return (
    <UIContext.Provider value={{
      viewMode, setViewMode,
      locateTarget, setLocateTarget, triggerManualLocate,
      isSettingsOpen, setSettingsOpen,
      isManualEntryOpen, setManualEntryOpen,
      isImportMappingOpen, setImportMappingOpen,
      appendMode, setAppendMode,
      pendingRawData, pendingFileName, handleFileUpload, confirmImport,
      selectedIds, toggleSelect, toggleAll, clearSelection
    }}>
      {children}
    </UIContext.Provider>
  );
};

export const useUIStore = () => {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUIStore must be used within a UIProvider');
  }
  return context;
};
