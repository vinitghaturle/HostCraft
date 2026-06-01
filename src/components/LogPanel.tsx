import React, { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

export default function LogPanel() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unlisten: () => void;
    
    const setupListener = async () => {
      unlisten = await listen<string>("papermc-log", (event) => {
        setLogs(prev => {
          const newLogs = [...prev, event.payload];
          return newLogs.slice(-200); // Keep last 200 lines to avoid memory leak
        });
      });
    };
    
    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    if (isExpanded && endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isExpanded]);

  if (!isExpanded) {
    return (
      <button 
        onClick={() => setIsExpanded(true)}
        className="w-full mt-6 bg-[#0F172A] border border-slate-700 hover:border-slate-500 text-slate-400 p-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
      >
        <span className="text-base">📋</span> Show Server Logs
      </button>
    );
  }

  return (
    <div className="mt-6 border border-slate-700 bg-[#080B10] rounded-xl overflow-hidden flex flex-col h-64">
      <div className="flex items-center justify-between px-4 py-2 bg-[#0F172A] border-b border-slate-700">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Server Logs (PaperMC)</h3>
        <button 
          onClick={() => setIsExpanded(false)}
          className="text-slate-500 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] sm:text-xs text-slate-300 space-y-1">
        {logs.length === 0 ? (
          <p className="text-slate-600 italic">Waiting for output...</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="break-all">{log}</div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
