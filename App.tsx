
import React from 'react';
import { MapPinIcon, SettingsIcon } from './components/Icons';
import { LogConsole } from './components/LogConsole';
import { ManualEntryModal } from './components/ManualEntryModal';
import { ImportMappingModal } from './components/ImportMappingModal';
import { SettingsModal } from './components/SettingsModal';
import { DataTable } from './components/DataTable';
import { ActionToolbar } from './components/ActionToolbar';
import { StatsCards } from './components/StatsCards';
import { EmptyState } from './components/EmptyState';
import { MapVisualizer } from './components/MapVisualizer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GeocodingProvider, useGeocodingStore } from './contexts/GeocodingContext';
import { UIProvider, useUIStore } from './contexts/UIContext';

// Inner component where hooks can be used
const AppLayout = () => {
  const { records, logs } = useGeocodingStore();
  const { setSettingsOpen, viewMode } = useUIStore();

  return (
    <div className="h-screen bg-slate-50/50 flex flex-col font-sans relative overflow-hidden">
      
      {/* Global Modals */}
      <ManualEntryModal />
      <ImportMappingModal />
      <SettingsModal />

      {/* Top Navigation / Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 shrink-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-brand-500 to-brand-700 p-2 rounded-lg text-white shadow-lg shadow-brand-500/20">
              <MapPinIcon className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">GeoMapper <span className="text-brand-600">Pro</span></h1>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <SettingsIcon className="w-4 h-4" />
              <span className="hidden sm:inline">配置中心</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow w-full max-w-[1600px] mx-auto p-4 sm:p-6 flex flex-col gap-6 overflow-hidden">
        
        {records.length === 0 ? (
          <div className="flex-grow flex flex-col justify-center animate-fade-in-up overflow-auto">
             <EmptyState />
          </div>
        ) : (
          <>
            {/* Top Dashboard: Stats & Toolbar */}
            <div className="flex flex-col gap-6 animate-fade-in shrink-0">
                <StatsCards />
                <ActionToolbar />
            </div>

            {/* Split View */}
            <div className="flex-grow flex gap-6 min-h-0 relative">
                
                {/* Main Area: Table or Map */}
                <div className="flex flex-col h-full w-full lg:w-3/4 transition-all duration-300 ease-in-out">
                   {viewMode === 'list' ? (
                       <DataTable />
                   ) : (
                       <MapVisualizer />
                   )}
                </div>

                {/* Right Column: Logs */}
                <div className="hidden lg:flex flex-col h-full lg:w-1/4 min-w-[300px]">
                     <LogConsole logs={logs} />
                </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

// Root App Component
function App() {
  return (
    <ErrorBoundary>
      <GeocodingProvider>
        <UIProvider>
          <AppLayout />
        </UIProvider>
      </GeocodingProvider>
    </ErrorBoundary>
  );
}

export default App;
