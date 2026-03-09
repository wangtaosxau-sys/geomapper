
import { db } from './db';

interface AmapResponse {
  status: string;
  info: string;
  infocode: string;
  count: string;
  geocodes?: Array<{
    formatted_address: string;
    location: string;
    level: string;
    province?: string;
    city?: string;
    district?: string;
  }>;
  pois?: Array<{
    id: string;
    name: string;
    type: string;
    location: string;
    address: string;
    pname: string;
    cityname: string;
    adname: string;
  }>;
}

export interface AmapResult {
    success: boolean;
    location?: { lng: number; lat: number };
    formattedAddress?: string;
    level?: string;
    // New fields for validation
    province?: string;
    city?: string;
    district?: string;
    
    pois?: any[]; // For raw POI return if needed
    error?: string;
    invalidKey?: boolean;
    isQpsLimit?: boolean;
}

export class AmapService {
  private static BASE_URL_GEO = "https://restapi.amap.com/v3/geocode/geo";
  private static BASE_URL_SEARCH = "https://restapi.amap.com/v3/place/text";

  // --- 1. Geocoding (Basic) ---
  static async geocode(
    address: string,
    city: string,
    apiKey: string
  ): Promise<AmapResult> {
    const cacheKey = `geo|${address}|${city}`;
    
    // Check DB Cache (Async)
    const cached = await db.get<AmapResult>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const url = new URL(this.BASE_URL_GEO);
      url.searchParams.append('address', address);
      url.searchParams.append('output', 'json');
      url.searchParams.append('key', apiKey);
      if (city) url.searchParams.append('city', city);

      const data = await this.fetchAmap(url.toString());
      
      let result: AmapResult;
      if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
        const item = data.geocodes[0];
        const locationStr = item.location;
        const [lng, lat] = locationStr.split(',').map(Number);
        
        result = {
          success: true,
          location: { lng, lat },
          formattedAddress: item.formatted_address,
          level: typeof item.level === 'string' ? item.level : '', // Safety check
          province: item.province,
          city: typeof item.city === 'string' ? item.city : '', // API sometimes returns [] for empty city
          district: typeof item.district === 'string' ? item.district : ''
        };
        // Save to DB
        await db.set(cacheKey, result);
      } else {
        if (this.isKeyError(data)) {
           return { success: false, error: data.info, invalidKey: true };
        }
        if (this.isQpsError(data)) {
           return { success: false, error: data.info, isQpsLimit: true };
        }
        
        result = { success: false, error: data.info || 'No results found' };
        
        // Cache empty results too to save quota, unless it's a system error
        if (data.info === 'No results found' || data.count === '0') {
             await db.set(cacheKey, result);
        }
      }
      return result;
    } catch (error: any) {
      return { success: false, error: error.message || 'Network Error' };
    }
  }

  // --- 2. Keyword Search (Fallback) ---
  static async searchPois(
    keywords: string,
    city: string,
    apiKey: string
  ): Promise<AmapResult> {
      const cacheKey = `search|${keywords}|${city}`;

      const cached = await db.get<AmapResult>(cacheKey);
      if (cached) {
          return cached;
      }

      const url = new URL(this.BASE_URL_SEARCH);
      url.searchParams.append('keywords', keywords);
      url.searchParams.append('key', apiKey);
      url.searchParams.append('offset', '1');
      url.searchParams.append('page', '1');
      if (city) url.searchParams.append('city', city);
      
      try {
          const data = await this.fetchAmap(url.toString());
          let result: AmapResult;
          if (data.status === '1' && data.pois && data.pois.length > 0) {
              const best = data.pois[0];
              // Extract logic similar to Geo
              result = { 
                  success: true, 
                  pois: data.pois,
                  // We extract the first POI's admin info for the top-level result validation
                  province: best.pname,
                  city: best.cityname,
                  district: best.adname,
                  formattedAddress: best.address || best.name,
                  level: '兴趣点' // Explicitly set level for POI results so they aren't treated as 'undefined'
              };
              await db.set(cacheKey, result);
              return result;
          }
          if (this.isKeyError(data)) return { success: false, error: data.info, invalidKey: true };
          if (this.isQpsError(data)) return { success: false, error: data.info, isQpsLimit: true };
          
          result = { success: false, error: 'No POIs found' };
          await db.set(cacheKey, result);
          return result;
      } catch (e: any) {
          return { success: false, error: e.message };
      }
  }

  // --- Helpers ---
  private static async fetchAmap(url: string): Promise<AmapResponse> {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
      
      try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return await response.json();
      } catch (error: any) {
          clearTimeout(timeoutId);
          if (error.name === 'AbortError') {
              throw new Error('请求超时 (10s)');
          }
          throw error;
      }
  }

  private static isKeyError(data: AmapResponse): boolean {
      // 10001: Invalid Key, 10003: Daily Limit (Hard stop for day)
      return data.info === 'INVALID_USER_KEY' || data.infocode === '10001' || data.infocode === '10003' || data.info === 'USER_DAILY_QUERY_OVER_LIMIT';
  }

  private static isQpsError(data: AmapResponse): boolean {
      // 10014: QPS Limit, 10021: Concurrency?
      return data.infocode === '10014' || data.info.includes('QPS') || data.info.includes('Too Fast');
  }

  static async clearCache() {
    await db.clear();
    console.log("[AmapService] Cache cleared from IndexedDB.");
  }
}
