
export enum ProcessStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export type RetryStrategy = 'AUTO' | 'FORCE_GEO' | 'FORCE_SEARCH' | 'SIMPLE_MAIN';
export type ProviderMode = 'AMAP_ONLY' | 'BAIDU_ONLY' | 'CONCURRENT_BIDDING' | 'WATERFALL_AMAP_FIRST' | 'WATERFALL_BAIDU_FIRST';

export interface GeoConfig {
  apiKeys: string[]; // Amap Web Service Keys (Data)
  amapJsKey?: string; // Amap JS API Key (Visualization)
  amapSecurityCode?: string; // Amap JS Security Code
  baiduApiKeys: string[]; // Baidu Keys
  providerMode: ProviderMode; 
  city: string;
  requestInterval: number; // in ms
  maxRetries: number;
  concurrency: number; 
  highPrecisionMode: boolean;
  enableBaiduReverseGeo: boolean; // P1: 百度逆地理编码开关
  poiKeywords: string[]; // S3: POI关键词列表
}

export interface InputRecord {
  id: string;
  originalIndex: number; 
  mainKeyword: string;
  subKeyword?: string;
  [key: string]: any; 
}

export interface GeoResult {
  lng: number | null; // Always GCJ-02 in memory
  lat: number | null; // Always GCJ-02 in memory
  matchedBy: 'Main Keyword' | 'Sub Keyword' | 'POI Search' | 'Composite' | null;
  matchLevel?: string; 
  status: 'Success' | 'Fail' | 'Pending';
  errorMsg?: string;
  formattedAddress?: string;
  source?: 'AMAP' | 'BAIDU' | 'MANUAL'; 
  invalidKey?: boolean; 
}

export interface ComparisonEvidence {
  amap?: { lng: number; lat: number; address: string; level: string };
  baidu?: { lng: number; lat: number; address: string; level: string };
  distance?: number; 
  winnerReason?: string;
}

export interface ProcessedRecord extends InputRecord, GeoResult {
  forceStrategy?: RetryStrategy; 
  comparison?: ComparisonEvidence; 
}

export interface AnalyticsData {
  total: number;
  success: number;
  failed: number;
  pending: number;
  avgTimePerRequest: number;
  rps: number; 
  eta: number; 
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
}
