
import { GeoConfig } from './types';

export const DEFAULT_CONFIG: GeoConfig = {
  apiKeys: [],
  amapJsKey: '',
  amapSecurityCode: '',
  baiduApiKeys: [],
  providerMode: 'CONCURRENT_BIDDING', // Default to the most robust mode
  city: '北京市',
  requestInterval: 300,
  maxRetries: 3,
  concurrency: 3,
  highPrecisionMode: true,
  enableBaiduReverseGeo: false, // P1: 默认关闭，节省配额
  poiKeywords: ['公司', '店', '苑', '大厦', '局', '委', '厂', '院', '馆', '中心', '广场', '酒店', '银行', '医院', '学校', '超市'], // S3: 默认POI关键词
};

export const STORAGE_KEY_CONFIG = 'geoMapperConfig_v3'; 
export const STORAGE_KEY_RECORDS = 'geoMapperRecords_v3';
