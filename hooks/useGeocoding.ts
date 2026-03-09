
import { useState, useRef, useEffect, useCallback } from 'react';
import { ProcessStatus, GeoConfig, ProcessedRecord, LogEntry, AnalyticsData, InputRecord, RetryStrategy } from '../types';
import { DEFAULT_CONFIG, STORAGE_KEY_CONFIG, STORAGE_KEY_RECORDS } from '../constants';
import { generateId } from '../utils';
import { processRecordStrategy } from '../services/geoStrategy';

// Constants for circuit breaker and stability
const CONSECUTIVE_SUCCESS_THRESHOLD = 5;
const AVALANCHE_SAFETY_MULTIPLIER = 3;
const MIN_SAFETY_THRESHOLD = 5;
const UI_UPDATE_INTERVAL = 200;

export const useGeocoding = () => {
  // State
  const [config, setConfig] = useState<GeoConfig>(DEFAULT_CONFIG);
  const [records, setRecords] = useState<ProcessedRecord[]>([]);
  const [status, setStatus] = useState<ProcessStatus>(ProcessStatus.IDLE);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  
  // Performance Metrics State
  const [rps, setRps] = useState(0);
  const [eta, setEta] = useState(0); // in seconds
  
  // --- AIMD Dynamic Concurrency State ---
  // We use a ref to track the "real" concurrency limit which adjusts automatically
  const dynamicConcurrencyRef = useRef<number>(1); 

  // Refs for processing logic
  const recordsRef = useRef<ProcessedRecord[]>([]);
  const configRef = useRef<GeoConfig>(DEFAULT_CONFIG);
  const statusRef = useRef<ProcessStatus>(ProcessStatus.IDLE);
  
  // Key Rotation Refs - Separate for Amap and Baidu
  const amapKeyIndexRef = useRef(0);
  const baiduKeyIndexRef = useRef(0);
  const invalidKeysRef = useRef<Set<string>>(new Set()); 
  const keyCooldownsRef = useRef<Map<string, number>>(new Map()); 
  
  // Safety Circuit Breaker
  const consecutiveKeyErrorsRef = useRef(0);
  const consecutiveSuccessRef = useRef(0); // Track successful streak for AIMD

  const activeRequestsRef = useRef(0);
  const pendingQueueRef = useRef<number[]>([]); 
  const targetProcessIdsRef = useRef<Set<string> | null>(null); 
  const resultsBufferRef = useRef<{index: number, record: ProcessedRecord}[]>([]); 
  const uiUpdateTimerRef = useRef<any>(null);
  
  const startTimeRef = useRef<number>(0);
  const processedCountRef = useRef<number>(0);
  const totalTaskCountRef = useRef<number>(0);

  // Sync refs
  useEffect(() => { recordsRef.current = records; }, [records]);
  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { statusRef.current = status; }, [status]);

  // Reset circuit breaker when keys change in settings
  useEffect(() => {
    invalidKeysRef.current.clear();
    keyCooldownsRef.current.clear();
    amapKeyIndexRef.current = 0;
    baiduKeyIndexRef.current = 0;
    consecutiveKeyErrorsRef.current = 0;
    // Reset dynamic concurrency to config value when user manually changes it
    dynamicConcurrencyRef.current = config.concurrency || 1;
  }, [config.apiKeys, config.baiduApiKeys, config.concurrency]);

  // --- Persistence Logic (使用 IndexedDB) ---
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  
  // 加载配置
  useEffect(() => {
    const loadData = async () => {
      try {
        const { db } = await import('../services/db');
        
        // 从 IndexedDB 加载配置
        const savedConfig = await db.getConfig<GeoConfig>(STORAGE_KEY_CONFIG);
        if (savedConfig) {
          setConfig(prev => ({ 
            ...prev, 
            ...savedConfig,
            concurrency: savedConfig.concurrency || 3,
            highPrecisionMode: savedConfig.highPrecisionMode !== undefined ? savedConfig.highPrecisionMode : true,
            providerMode: savedConfig.providerMode || 'CONCURRENT_BIDDING',
            baiduApiKeys: savedConfig.baiduApiKeys || []
          }));
        }

        // 从 IndexedDB 加载记录
        const savedRecords = await db.getConfig<ProcessedRecord[]>(STORAGE_KEY_RECORDS);
        if (savedRecords && Array.isArray(savedRecords) && savedRecords.length > 0) {
          setRecords(savedRecords);
          recordsRef.current = savedRecords;
          addLog('info', `已恢复上次会话的 ${savedRecords.length} 条数据。`);
        }
        
        setIsConfigLoaded(true);
      } catch (e) {
        console.error("Failed to load persistence data from IndexedDB", e);
        // 回退到 localStorage
        try {
          const savedConfig = localStorage.getItem(STORAGE_KEY_CONFIG);
          if (savedConfig) {
            const parsed = JSON.parse(savedConfig);
            setConfig(prev => ({ ...prev, ...parsed }));
          }
          const savedRecords = localStorage.getItem(STORAGE_KEY_RECORDS);
          if (savedRecords) {
            const parsedRecords = JSON.parse(savedRecords);
            if (Array.isArray(parsedRecords) && parsedRecords.length > 0) {
              setRecords(parsedRecords);
              recordsRef.current = parsedRecords;
            }
          }
        } catch (e2) {
          console.error("localStorage fallback also failed", e2);
        }
        setIsConfigLoaded(true);
      }
    };
    
    loadData();
  }, []);

  // 保存配置到 IndexedDB
  useEffect(() => {
    if (!isConfigLoaded) return; // 等待初始加载完成
    
    const saveConfig = async () => {
      try {
        const { db } = await import('../services/db');
        await db.setConfig(STORAGE_KEY_CONFIG, config);
        // 同时保存到 localStorage 作为备份
        localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
      } catch (e) {
        console.warn("Config Storage Error", e);
        // 回退到 localStorage
        try {
          localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
        } catch (e2) {
          console.warn("localStorage fallback failed", e2);
        }
      }
    };
    
    saveConfig();
  }, [config, isConfigLoaded]);

  // 保存记录到 IndexedDB
  useEffect(() => {
    if (!isConfigLoaded) return;
    
    const timer = setTimeout(async () => {
      try {
        const { db } = await import('../services/db');
        if (records.length > 0) {
          await db.setConfig(STORAGE_KEY_RECORDS, records);
          localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(records));
        } else {
          await db.deleteConfig(STORAGE_KEY_RECORDS);
          localStorage.removeItem(STORAGE_KEY_RECORDS);
        }
      } catch (e) {
        console.warn("Records Storage Error", e);
        try {
          if (records.length > 0) {
            localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(records));
          } else {
            localStorage.removeItem(STORAGE_KEY_RECORDS);
          }
        } catch (e2) {
          console.warn("localStorage fallback failed", e2);
        }
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [records, isConfigLoaded]);

  // --- Helpers ---

  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    setLogs(prev => [...prev.slice(-100), {
      id: generateId('log'),
      timestamp: new Date(),
      level,
      message
    }]);
  }, []);

  const markKeyCooldown = (key: string, type: 'AMAP' | 'BAIDU') => {
      // S4: 指数退避 - 根据连续失败次数增加冷却时间
      const currentCooldowns = Array.from(keyCooldownsRef.current.entries())
          .filter(([k, _]) => k === key).length;
      const backoffMultiplier = Math.min(Math.pow(2, currentCooldowns), 8); // 最大8倍
      const cooldownTime = 60000 * backoffMultiplier; // 基础60秒 * 退避倍数
      
      keyCooldownsRef.current.set(key, Date.now() + cooldownTime);
      
      if (backoffMultiplier > 1) {
          addLog('warning', `${type} Key 冷却时间延长至 ${Math.round(cooldownTime / 1000)}秒 (指数退避)`);
      }
  };

  const getNextKey = (type: 'AMAP' | 'BAIDU') => {
    const keys = type === 'AMAP' ? configRef.current.apiKeys : (configRef.current.baiduApiKeys || []);
    if (keys.length === 0) return null;

    const now = Date.now();
    
    const validKeys = keys.filter(k => {
        if (invalidKeysRef.current.has(k)) return false;
        const cooldown = keyCooldownsRef.current.get(k);
        return !cooldown || cooldown < now;
    });
    
    if (validKeys.length === 0) return null;

    // Use separate indices for rotation
    const currentIndex = type === 'AMAP' ? amapKeyIndexRef.current : baiduKeyIndexRef.current;
    const key = validKeys[currentIndex % validKeys.length];
    
    if (type === 'AMAP') amapKeyIndexRef.current++;
    else baiduKeyIndexRef.current++;

    return key;
  };

  // --- New Sliding Window Engine ---

  const flushResultsBuffer = () => {
    if (resultsBufferRef.current.length === 0) return;

    const updates = [...resultsBufferRef.current];
    resultsBufferRef.current = [];

    setRecords(prev => {
      const next = [...prev];
      updates.forEach(({ index, record }) => {
        if (index >= 0 && index < next.length) {
          next[index] = record;
        }
      });
      return next;
    });

    processedCountRef.current += updates.length;
    const progress = Math.min(100, Math.round((processedCountRef.current / totalTaskCountRef.current) * 100));
    setProgress(progress);

    const now = Date.now();
    const elapsedSeconds = (now - startTimeRef.current) / 1000;
    if (elapsedSeconds > 1) {
       const rpsVal = processedCountRef.current / elapsedSeconds;
       setRps(Number(rpsVal.toFixed(1)));
       const remaining = totalTaskCountRef.current - processedCountRef.current;
       setEta(Math.ceil(remaining / (rpsVal || 1)));
    }
  };

  const processNextItem = async () => {
    if (statusRef.current !== ProcessStatus.PROCESSING) return;
    if (pendingQueueRef.current.length === 0) {
      if (activeRequestsRef.current === 0) {
        finishProcessing();
      }
      return;
    }

    // --- Dynamic Concurrency Check ---
    // Instead of fixed config.concurrency, use the adaptive dynamicConcurrencyRef
    if (activeRequestsRef.current >= dynamicConcurrencyRef.current) {
      return;
    }

    const index = pendingQueueRef.current.shift();
    if (index === undefined) return;

    activeRequestsRef.current++;
    const record = recordsRef.current[index];

    try {
      if (!record) throw new Error("Record not found in ref"); 
      
      const getKeyWithTracking = (type: 'AMAP' | 'BAIDU') => {
        const key = getNextKey(type);
        if (!key) {
           consecutiveKeyErrorsRef.current++;
        }
        return key;
      };

      const resultRecord = await processRecordStrategy(record, {
          config: configRef.current,
          invalidKeys: invalidKeysRef.current,
          getKey: getKeyWithTracking,
          log: addLog,
          markKeyCooldown: markKeyCooldown 
      });
      
      // --- AIMD & Avalanche Protection Logic ---
      
      if (resultRecord.status === 'Success') {
        // AI: Additive Increase
        consecutiveKeyErrorsRef.current = 0;
        consecutiveSuccessRef.current++;
        
        // If we have N successful requests in a row, try to increase concurrency
        // But do not exceed user-defined max concurrency
        if (consecutiveSuccessRef.current > CONSECUTIVE_SUCCESS_THRESHOLD && dynamicConcurrencyRef.current < (configRef.current.concurrency || 1)) {
            dynamicConcurrencyRef.current++;
            consecutiveSuccessRef.current = 0; // Reset streak
            // console.log("Increasing concurrency to", dynamicConcurrencyRef.current);
        }

      } else {
        consecutiveSuccessRef.current = 0;
        
        // QPS Limit Handling -> MD: Multiplicative Decrease
        // Check internal error or result logic for QPS hints (usually hidden in geoStrategy wrappers but propagated via cooldowns)
        // If we detect heavy load (e.g. many active requests failed), reduce concurrency
        
        if (resultRecord.invalidKey) {
             consecutiveKeyErrorsRef.current++;
        }
        
        // If specific error indicates too fast, slash concurrency immediately
        if (resultRecord.errorMsg && (resultRecord.errorMsg.includes('QPS') || resultRecord.errorMsg.includes('Fast'))) {
             const newC = Math.max(1, Math.floor(dynamicConcurrencyRef.current / 2));
             if (newC < dynamicConcurrencyRef.current) {
                 dynamicConcurrencyRef.current = newC;
                 addLog('warning', `检测到 QPS 限制，自动降低并发至 ${newC}`);
             }
        }
        
        // Avalanche Circuit Breaker
        const safetyThreshold = Math.max(MIN_SAFETY_THRESHOLD, (configRef.current.concurrency || 1) * AVALANCHE_SAFETY_MULTIPLIER);
        if (consecutiveKeyErrorsRef.current > safetyThreshold) {
            setStatus(ProcessStatus.PAUSED);
            addLog('error', '🚨 严重警告：检测到可用 Key 耗尽或持续失效，为防止数据雪崩，任务已自动暂停。');
            
            resultsBufferRef.current.push({ index, record: resultRecord });
            recordsRef.current[index] = resultRecord;
            activeRequestsRef.current--;
            return; 
        }
      }

      resultsBufferRef.current.push({ index, record: resultRecord });
      recordsRef.current[index] = resultRecord;

    } catch (e: any) {
      console.error("Worker Error", e);
      addLog('error', `系统异常 [${record?.mainKeyword || 'Unknown'}]: ${e.message}`);
      
      const failedRecord = {
          ...record,
          status: 'Fail' as const,
          errorMsg: `Internal Error: ${e.message}`
      };
      
      resultsBufferRef.current.push({ index, record: failedRecord });
      recordsRef.current[index] = failedRecord;

    } finally {
      activeRequestsRef.current--;
      
      if (statusRef.current === ProcessStatus.PROCESSING) {
          const delay = configRef.current.requestInterval || 0;
          if (delay > 0) {
              setTimeout(() => processNextItem(), delay);
          } else {
              processNextItem(); 
          }
      }
    }
  };

  const startPipeline = () => {
     // Start with 1 to test waters, then AIMD will ramp it up
     const initialBatch = Math.min(2, configRef.current.concurrency || 1);
     dynamicConcurrencyRef.current = initialBatch; 
     
     consecutiveKeyErrorsRef.current = 0;
     consecutiveSuccessRef.current = 0;
     
     for (let i = 0; i < initialBatch; i++) {
         processNextItem();
     }
  };

  const finishProcessing = () => {
    flushResultsBuffer(); 
    setStatus(ProcessStatus.COMPLETED);
    targetProcessIdsRef.current = null; 
    setRps(0);
    setEta(0);
    addLog('info', '处理任务完成。');
    if (uiUpdateTimerRef.current) clearInterval(uiUpdateTimerRef.current);
    
    // U4: 浏览器通知
    sendCompletionNotification();
  };

  // U4: 发送完成通知
  const sendCompletionNotification = () => {
    if (!('Notification' in window)) return;
    
    if (Notification.permission === 'granted') {
      const successCount = recordsRef.current.filter(r => r.status === 'Success').length;
      const failCount = recordsRef.current.filter(r => r.status === 'Fail').length;
      
      new Notification('GeoMapper Pro 处理完成', {
        body: `成功: ${successCount} 条，失败: ${failCount} 条`,
        icon: '/favicon.ico',
        tag: 'geomapper-complete'
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  };

  useEffect(() => {
    if (status === ProcessStatus.PROCESSING) {
      addLog('info', `启动引擎 (最大并发: ${config.concurrency}, 智能流控: 开启)...`);
      
      const allRecords = recordsRef.current;
      const pendingIndices = allRecords
        .map((r, i) => {
            if (r.status !== 'Pending') return -1;
            if (targetProcessIdsRef.current) {
                return targetProcessIdsRef.current.has(r.id) ? i : -1;
            }
            return i;
        })
        .filter(i => i !== -1);
      
      if (pendingIndices.length === 0) {
        addLog('info', '没有待处理的任务。');
        setStatus(ProcessStatus.IDLE);
        return;
      }

      pendingQueueRef.current = pendingIndices;
      totalTaskCountRef.current = pendingIndices.length;
      processedCountRef.current = 0;
      startTimeRef.current = Date.now();
      resultsBufferRef.current = [];
      activeRequestsRef.current = 0;
      consecutiveKeyErrorsRef.current = 0; 

      uiUpdateTimerRef.current = setInterval(flushResultsBuffer, UI_UPDATE_INTERVAL);
      startPipeline();

    } else {
      if (uiUpdateTimerRef.current) {
         clearInterval(uiUpdateTimerRef.current);
         uiUpdateTimerRef.current = null;
         flushResultsBuffer(); 
      }
    }

    return () => {
      // Explicit cleanup on unmount
      if (uiUpdateTimerRef.current) clearInterval(uiUpdateTimerRef.current);
    };
  }, [status]);


  // --- Public Actions ---

  const importRecords = (newInputRecords: InputRecord[], appendMode: boolean, sourceName?: string) => {
    const newRecords: ProcessedRecord[] = newInputRecords.map(p => ({
      ...p,
      lng: null,
      lat: null,
      matchedBy: null,
      status: 'Pending'
    }));

    if (appendMode) {
      setRecords(prev => [...prev, ...newRecords]);
      addLog('info', `已追加 ${sourceName ? `从 ${sourceName} ` : ''}导入的 ${newInputRecords.length} 条记录`);
    } else {
      setRecords(newRecords);
      addLog('info', `已加载 ${newInputRecords.length} 条记录 (覆盖旧数据)`);
    }
    setStatus(ProcessStatus.IDLE);
    setProgress(0);
  };

  const addRecord = (record: InputRecord) => {
    const newRecord: ProcessedRecord = {
      ...record,
      lng: null,
      lat: null,
      matchedBy: null,
      status: 'Pending'
    };
    setRecords(prev => [...prev, newRecord]);
    addLog('info', `手动添加记录：${record.mainKeyword}`);
  };
  
  const deleteRecords = (ids: string[]) => {
      if (ids.length === 0) return;
      setRecords(prev => prev.filter(r => !ids.includes(r.id)));
      addLog('info', `已删除 ${ids.length} 条记录`);
  };

  const updateRecordField = (id: string, field: 'mainKeyword' | 'subKeyword', value: string) => {
    setRecords(prev => prev.map(r => {
      if (r.id === id) {
        return { ...r, [field]: value };
      }
      return r;
    }));
  };

  // 手动更新记录坐标（用于地图模式手动定位）
  const updateRecordCoordinates = (id: string, lng: number, lat: number, address?: string) => {
    setRecords(prev => prev.map(r => {
      if (r.id === id) {
        return { 
          ...r, 
          lng, 
          lat, 
          formattedAddress: address || r.formattedAddress,
          status: 'Success' as const,
          source: 'MANUAL' as const,
          matchLevel: '手动定位',
          errorMsg: undefined
        };
      }
      return r;
    }));
    addLog('success', `已手动更新坐标: ${lng.toFixed(6)}, ${lat.toFixed(6)}`);
  };

  const retryFailedRecords = (strategy: RetryStrategy = 'AUTO') => {
    const hasFailed = records.some(r => r.status === 'Fail');
    if (!hasFailed) {
      addLog('info', '没有失败的记录需要重试。');
      return;
    }
    
    const strategyText = strategy === 'AUTO' ? '默认' : strategy;
    
    setRecords(prev => prev.map(r => 
        r.status === 'Fail' 
        ? { ...r, status: 'Pending', errorMsg: undefined, forceStrategy: strategy, source: undefined, comparison: undefined } 
        : r
    ));
    
    addLog('info', `已重置所有失败记录，策略: [${strategyText}]，准备重试...`);
    if (status !== ProcessStatus.PROCESSING) {
      targetProcessIdsRef.current = null;
      setStatus(ProcessStatus.PROCESSING);
    }
  };

  const retrySelectedRecords = (selectedIds: string[], strategy: RetryStrategy = 'AUTO') => {
      if (selectedIds.length === 0) return;
      
      const strategyText = strategy === 'AUTO' ? '默认' : strategy;

      setRecords(prev => prev.map(r => {
          if (selectedIds.includes(r.id)) {
              return { ...r, status: 'Pending', errorMsg: undefined, forceStrategy: strategy, source: undefined, comparison: undefined };
          }
          return r;
      }));
      addLog('info', `已将 ${selectedIds.length} 条选中记录标记为重试队列，策略: [${strategyText}]。`);
      if (status !== ProcessStatus.PROCESSING) {
          targetProcessIdsRef.current = new Set(selectedIds);
          setStatus(ProcessStatus.PROCESSING);
      }
  };

  const handleSingleRetry = async (id: string) => {
    const record = records.find(r => r.id === id);
    if (!record) return;

    addLog('info', `正在单条重试：${record.mainKeyword}...`);

    // 先标记为 Pending 状态
    setRecords(prev => prev.map(r => 
      r.id === id 
        ? { ...r, status: 'Pending' as const, errorMsg: undefined, forceStrategy: 'AUTO' as const, source: undefined, comparison: undefined }
        : r
    ));

    const tempRecord: ProcessedRecord = { 
      ...record, 
      status: 'Pending', 
      errorMsg: undefined, 
      forceStrategy: 'AUTO',
      source: undefined,
      comparison: undefined
    };
    
    try {
      const resultRecord = await processRecordStrategy(tempRecord, {
            config: configRef.current,
            invalidKeys: invalidKeysRef.current,
            getKey: getNextKey,
            log: addLog,
            markKeyCooldown: markKeyCooldown
      });
      
      // 使用 id 匹配更新，而不是 index
      setRecords(prev => prev.map(r => r.id === id ? resultRecord : r));
      
      if (resultRecord.status === 'Success') {
        addLog('success', `单条重试成功：${record.mainKeyword}`);
      } else {
        addLog('warning', `单条重试完成但未成功：${record.mainKeyword} - ${resultRecord.errorMsg || '未知原因'}`);
      }
    } catch (e: any) {
      addLog('error', `单条重试异常：${e.message}`);
      setRecords(prev => prev.map(r => 
        r.id === id 
          ? { ...r, status: 'Fail' as const, errorMsg: `重试异常: ${e.message}` }
          : r
      ));
    }
  };

  const toggleProcessing = (targetIds?: string[]) => {
    if (config.apiKeys.length === 0 && config.baiduApiKeys?.length === 0) {
      alert("请在设置中至少配置一个高德或百度 API Key。");
      return;
    }
    if (records.length === 0) {
      alert("请先添加数据。");
      return;
    }

    if (status === ProcessStatus.PROCESSING) {
      setStatus(ProcessStatus.PAUSED);
      addLog('info', '用户已暂停处理。');
    } else {
      if (targetIds && targetIds.length > 0) {
          targetProcessIdsRef.current = new Set(targetIds);
          addLog('info', `用户启动处理：仅处理选中的 ${targetIds.length} 条记录`);
      } else {
          targetProcessIdsRef.current = null;
          addLog('info', `用户启动处理：处理所有待处理任务`);
      }
      setStatus(ProcessStatus.PROCESSING);
    }
  };

  const stats: AnalyticsData = {
    total: records.length,
    success: records.filter(r => r.status === 'Success').length,
    failed: records.filter(r => r.status === 'Fail').length,
    pending: records.filter(r => r.status === 'Pending').length,
    avgTimePerRequest: config.requestInterval,
    rps: rps,
    eta: eta
  };

  return {
    config, setConfig, records, status, logs, progress, stats,
    actions: {
      importRecords, addRecord, deleteRecords, updateRecordField, updateRecordCoordinates,
      retryFailedRecords, retrySelectedRecords, handleSingleRetry,
      toggleProcessing
    }
  };
};
