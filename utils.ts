
import { InputRecord, ProcessedRecord } from './types';
import * as XLSX from 'xlsx';

// Helper to generate unique ID with collision resistance
export const generateId = (prefix: string = 'rec'): string => {
  const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID() 
    : `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
  return `${prefix}-${randomPart}`;
};

// Return type for Raw File Parsing
export interface RawFileData {
  headers: string[];
  rows: any[][];
}

// --- Coordinate Transformation Algorithms (GCJ-02 to WGS84) ---
const PI = 3.1415926535897932384626;
const a = 6378245.0;
const ee = 0.00669342162296594323;

function outOfChina(lng: number, lat: number): boolean {
  if (lng < 72.004 || lng > 137.8347) return true;
  if (lat < 0.8293 || lat > 55.8271) return true;
  return false;
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLon(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
}

/**
 * Convert GCJ-02 (Amap/Tencent) to WGS84 (GPS/Google Earth/GeoJSON)
 * @param lng GCJ-02 Longitude
 * @param lat GCJ-02 Latitude
 * @returns [wgs_lng, wgs_lat]
 */
export const gcj02towgs84 = (lng: number, lat: number): [number, number] => {
  if (outOfChina(lng, lat)) {
    return [lng, lat];
  }
  let dlat = transformLat(lng - 105.0, lat - 35.0);
  let dlng = transformLon(lng - 105.0, lat - 35.0);
  const radlat = lat / 180.0 * PI;
  const magic = Math.sin(radlat);
  const magicSquared = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magicSquared);
  dlat = (dlat * 180.0) / ((a * (1 - ee)) / (magicSquared * sqrtMagic) * PI);
  dlng = (dlng * 180.0) / (a / sqrtMagic * Math.cos(radlat) * PI);
  const mglat = lat + dlat;
  const mglng = lng + dlng;
  return [lng * 2 - mglng, lat * 2 - mglat];
};

/**
 * Calculate distance between two points in meters using Haversine formula
 */
export const getDistance = (lng1: number, lat1: number, lng2: number, lat2: number): number => {
    const R = 6371000; // Radius of the earth in m
    const dLat = (lat2 - lat1) * PI / 180;
    const dLon = (lng2 - lng1) * PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * PI / 180) * Math.cos(lat2 * PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; // Distance in meters
};

// --- End Algorithms ---


export const readRawCSV = (content: string): RawFileData => {
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(line => 
    line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
  );

  return { headers, rows };
};

export const readRawExcel = (buffer: ArrayBuffer): RawFileData => {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  // Convert sheet to array of arrays
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

  if (jsonData.length < 2) return { headers: [], rows: [] };

  const headers = jsonData[0].map(h => String(h || '').trim());
  const rows = jsonData.slice(1).filter(row => row && row.length > 0);

  return { headers, rows };
};

export const mapRawToRecords = (
  rawData: RawFileData, 
  mainKeyField: string, 
  subKeyField: string
): InputRecord[] => {
  const { headers, rows } = rawData;
  const mainIndex = headers.indexOf(mainKeyField);
  const subIndex = headers.indexOf(subKeyField);

  if (mainIndex === -1) return []; // Should not happen if UI is correct

  return rows.map((row, idx) => {
    const record: InputRecord = {
      id: generateId('row'),
      originalIndex: idx + 1, // Store 1-based index
      mainKeyword: row[mainIndex] ? String(row[mainIndex]).trim() : '',
      subKeyword: (subIndex !== -1 && row[subIndex]) ? String(row[subIndex]).trim() : '',
    };

    // Keep other columns data
    headers.forEach((header, i) => {
      if (i !== mainIndex && i !== subIndex) {
        record[header] = row[i] ? String(row[i]).trim() : '';
      }
    });

    return record;
  });
};

const HEADER_MAP: Record<string, string> = {
  id: 'ID',
  originalIndex: '序号', 
  mainKeyword: '主关键词',
  subKeyword: '副关键词',
  lng: '经度_GCJ02',
  lat: '纬度_GCJ02',
  lng_wgs84: '经度_WGS84',
  lat_wgs84: '纬度_WGS84',
  formattedAddress: '标准化地址',
  matchedBy: '匹配方式',
  matchLevel: '匹配精度', 
  source: '数据来源',
  status: '状态',
  errorMsg: '错误/备注信息',
  'comparison_diff': '源偏差(米)',
  // New columns for export details
  'comp_amap_addr': '高德_候选结果',
  'comp_baidu_addr': '百度_候选结果',
  'comp_dist': '竞价偏差(米)'
};

// Prepare data for export, calculating WGS84 on the fly
const getExportData = (data: ProcessedRecord[]) => {
  if (data.length === 0) return { headers: [], rows: [] };

  const processedData = data.map(row => {
    let wgs84: [number, number] | null = null;
    if (row.lng && row.lat) {
      wgs84 = gcj02towgs84(row.lng, row.lat);
    }
    
    // Safely calculate distance for export
    const dist = (row.comparison?.distance !== undefined && row.comparison?.distance !== null) 
        ? Math.round(row.comparison.distance) 
        : '';

    return {
      ...row,
      lng_wgs84: wgs84 ? wgs84[0] : null,
      lat_wgs84: wgs84 ? wgs84[1] : null,
      // comparison_diff is kept for backward compat if needed, but comp_dist is the new standard
      comparison_diff: dist,
      
      // Flatten comparison details for CSV/Excel
      comp_amap_addr: row.comparison?.amap?.address || '',
      comp_baidu_addr: row.comparison?.baidu?.address || '',
      comp_dist: dist
    };
  });

  const first = processedData[0];
  
  // Custom columns from the input file
  const customKeys = Object.keys(first).filter(k => 
    !['lng', 'lat', 'lng_wgs84', 'lat_wgs84', 'matchedBy', 'matchLevel', 'status', 'errorMsg', 'formattedAddress', 'id', 'originalIndex', 'mainKeyword', 'subKeyword', 'source', 'comparison', 'forceStrategy', 'comparison_diff', 'comp_amap_addr', 'comp_baidu_addr', 'comp_dist'].includes(k) &&
    !k.startsWith('ai_')
  );
  
  const finalKeys = [
    'originalIndex', 
    'mainKeyword', 
    'subKeyword',
    ...customKeys, 
    'formattedAddress', 
    'lng', 
    'lat', 
    'lng_wgs84', 
    'lat_wgs84', 
    'matchLevel', 
    'source',
    'comp_amap_addr', // New
    'comp_baidu_addr', // New
    'comp_dist',      // New
    'matchedBy', 
    'status', 
    'errorMsg'
  ];

  const headers = finalKeys.map(k => HEADER_MAP[k] || k);
  
  return { finalKeys, headers, processedData };
};

export const downloadCSV = (data: ProcessedRecord[], filename: string, encoding: 'utf-8' | 'gbk' = 'utf-8') => {
  if (data.length === 0) return;
  const { finalKeys, headers, processedData } = getExportData(data);

  const csvContent = [
    headers.join(','),
    ...processedData.map((row: any) => finalKeys.map(fieldName => {
      const val = row[fieldName];
      let stringVal = '';
      
      if (fieldName === 'matchedBy') {
        if (val === 'Main Keyword') stringVal = '主关键词';
        else if (val === 'Sub Keyword') stringVal = '副关键词';
        else if (val === 'Composite') stringVal = '组合高精';
        else stringVal = String(val || '');
      } else if (fieldName === 'status') {
         if (val === 'Success') stringVal = '成功';
         else if (val === 'Fail') {
             if (row.lng && row.lat) stringVal = '需人工复核';
             else stringVal = '失败';
         }
         else stringVal = '等待中';
      } else if (typeof val === 'number') {
        if (fieldName.includes('lng') || fieldName.includes('lat')) {
             stringVal = val.toFixed(6); 
        } else {
             stringVal = String(val);
        }
      } else {
        stringVal = val === null || val === undefined ? '' : String(val);
      }
      return `"${stringVal.replace(/"/g, '""')}"`;
    }).join(','))
  ].join('\n');

  // 浏览器环境统一使用 UTF-8 with BOM，兼容性最好
  // GBK 编码在现代浏览器中支持有限，Excel 可以正确识别带 BOM 的 UTF-8
  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });

  triggerDownload(blob, filename);
};

export const downloadExcel = (data: ProcessedRecord[], filename: string) => {
  if (data.length === 0) return;
  
  const { finalKeys, headers, processedData } = getExportData(data);
  
  const formattedData = processedData.map((row: any) => {
    const obj: any = {};
    finalKeys.forEach((key, index) => {
      let val = row[key];
       if (key === 'status') {
         if (val === 'Success') val = '成功';
         else if (val === 'Fail') {
             if (row.lng && row.lat) val = '需人工复核';
             else val = '失败';
         }
       }
      obj[headers[index]] = val;
    });
    return obj;
  });

  const worksheet = XLSX.utils.json_to_sheet(formattedData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Results");
  XLSX.writeFile(workbook, filename);
};

// Helper for GeoJSON generation
const getGeoJSONData = (data: ProcessedRecord[]) => {
  const features = data
    .filter(row => (row.status === 'Success' || (row.status === 'Fail' && row.lng !== null && row.lat !== null)) && row.lng && row.lat)
    .map(row => {
      // GeoJSON coordinates should be WGS84 for standard GIS compatibility
      const [wgsLng, wgsLat] = gcj02towgs84(row.lng!, row.lat!);
      
      const props: any = {
        id: row.id,
        orig_idx: row.originalIndex,
        name: row.mainKeyword,
        sub_name: row.subKeyword || '',
        address: row.formattedAddress || '',
        lng_gcj: row.lng,
        lat_gcj: row.lat,
        source: row.source || '',
        status: row.status,
        match_type: row.matchedBy || '',
        match_lv: row.matchLevel || '',
        note: row.status === 'Fail' ? (row.errorMsg || '') : ''
      };

      Object.keys(row).forEach(key => {
        if (!['id', 'originalIndex', 'mainKeyword', 'subKeyword', 'formattedAddress', 'lng', 'lat', 'matchedBy', 'matchLevel', 'status', 'errorMsg', 'source', 'comparison', 'forceStrategy'].includes(key) && !key.startsWith('ai_')) {
             const val = row[key];
             if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
                 props[key.substring(0, 10)] = val;
             }
        }
      });

      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [wgsLng, wgsLat]
        },
        properties: props
      };
    });

  return {
    type: "FeatureCollection",
    features: features
  };
};

export const downloadGeoJSON = (data: ProcessedRecord[], filename: string) => {
  if (data.length === 0) return;
  const geoJSON = getGeoJSONData(data);
  const blob = new Blob([JSON.stringify(geoJSON, null, 2)], { type: 'application/json' });
  triggerDownload(blob, filename);
};

const triggerDownload = (blob: Blob, filename: string) => {
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
