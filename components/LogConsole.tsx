
import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';

interface LogConsoleProps {
  logs: LogEntry[];
}

// Optimization: Use React.memo to prevent re-renders unless 'logs' prop actually changes.
export const LogConsole = React.memo<LogConsoleProps>(({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="bg-[#1e293b] text-slate-200 rounded-2xl shadow-lg border border-slate-700 flex flex-col overflow-hidden h-full max-h-full min-h-0 ring-4 ring-slate-100">
      {/* Terminal Header */}
      <div className="px-4 py-2 bg-[#0f172a] border-b border-slate-700 flex justify-between items-center shrink-0">
        <span className="text-slate-400 text-[10px] font-mono tracking-widest uppercase">System Output</span>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></div>
        </div>
      </div>
      
      {/* Terminal Body */}
      <div className="flex-grow overflow-y-auto p-4 font-mono text-xs space-y-1.5 custom-scrollbar bg-[#1e293b] min-h-0">
        {logs.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2 opacity-50">
             <div className="w-2 h-4 bg-slate-500 animate-pulse"></div>
             <span>System Ready...</span>
          </div>
        )}
        
        {logs.map((log) => (
          <div key={log.id} className="flex gap-3 leading-relaxed animate-fade-in-up">
            <span className="text-slate-500 shrink-0 select-none">
              {log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <div className="flex-grow break-all">
              <span className={`font-bold mr-2 uppercase text-[10px] tracking-wide
                ${log.level === 'error' ? 'text-rose-400' : ''}
                ${log.level === 'warning' ? 'text-amber-400' : ''}
                ${log.level === 'success' ? 'text-emerald-400' : ''}
                ${log.level === 'info' ? 'text-blue-400' : ''}
              `}>
                [{log.level}]
              </span>
              <span className="text-slate-300">{log.message}</span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
});

LogConsole.displayName = 'LogConsole';
