
import { db } from './db';
import { AmapResult } from './amapService';

interface BaiduResponse {
  status: number;
  message?: string;
  result?: {
    location: { lng: number; lat: number };
    precise: number;
    confidence: number;
    comprehension: number;
    level: string;
    formatted_address?: string; // This is the structured address from Reverse Geo
    sematic_description?: string; // "Behind XX building"
  };
  results?: Array<{
    name: string;
    location: { lat: number; lng: number };
    address: string;
    province: string;
    city: string;
    area: string;
    detail: number;
  }>;
}

export class BaiduService {
  private static BASE_URL_GEO = "https://api.map.baidu.com/geocoding/v3/";
  private static BASE_URL_REVERSE_GEO = "https://api.map.baidu.com/reverse_geocoding/v3/";
  private static BASE_URL_SEARCH = "https://api.map.baidu.com/place/v2/search";

  // --- 1. Geocoding (Baidu) with Verification Enhancement ---
  static async geocode(
    address: string,
    city: string,
    apiKey: string,
    enableReverseGeo: boolean = false // P1: 逆地理编码开关
  ): Promise<AmapResult> {
    const cacheKey = `bd_geo_v2|${address}|${city}`;
    const cached = await db.get<AmapResult>(cacheKey);
    if (cached) return cached;

    try {
      const url = new URL(this.BASE_URL_GEO);
      url.searchParams.append('address', address);
      url.searchParams.append('output', 'json');
      url.searchParams.append('ak', apiKey);
      if (city) url.searchParams.append('city', city);
      url.searchParams.append('ret_coordtype', 'gcj02ll'); 

      const data = await this.fetchBaiduJsonp(url.toString());
      
      let result: AmapResult;
      
      if (data.status === 0 && data.result && data.result.location) {
        const item = data.result;
        const lng = item.location.lng;
        const lat = item.location.lat;

        let displayAddress = item.formatted_address || address;
        
        // P1: 仅在开启时调用逆地理编码
        if (enableReverseGeo) {
            await new Promise(r => setTimeout(r, 200));
            const reverseData = await this.reverseGeocode(lng, lat, apiKey);
            if (reverseData) {
                displayAddress = reverseData;
            }
        }

        result = {
          success: true,
          location: { lng, lat },
          formattedAddress: displayAddress,
          level: this.mapBaiduLevel(item.level), 
          province: '', 
          city: '',
          district: ''
        };
        await db.set(cacheKey, result);
      } else {
        if (this.isKeyError(data.status)) {
           return { success: false, error: data.message || 'Invalid Key', invalidKey: true };
        }
        if (this.isQpsError(data.status)) {
           return { success: false, error: data.message || 'QPS Limit', isQpsLimit: true };
        }
        result = { success: false, error: data.message || 'No results' };
        if (data.status === 1) { 
             await db.set(cacheKey, result);
        }
      }
      return result;
    } catch (error: any) {
      return { success: false, error: error.message || 'Baidu Network Error' };
    }
  }

  // --- 2. Place Search (Baidu) ---
  static async searchPois(
    query: string,
    region: string,
    apiKey: string
  ): Promise<AmapResult> {
      const cacheKey = `bd_search|${query}|${region}`;
      const cached = await db.get<AmapResult>(cacheKey);
      if (cached) return cached;

      const url = new URL(this.BASE_URL_SEARCH);
      url.searchParams.append('query', query);
      url.searchParams.append('region', region || '全国');
      url.searchParams.append('output', 'json');
      url.searchParams.append('ak', apiKey);
      url.searchParams.append('page_size', '1');
      url.searchParams.append('page_num', '0');
      url.searchParams.append('city_limit', 'true');
      url.searchParams.append('ret_coordtype', 'gcj02ll');

      try {
          const data = await this.fetchBaiduJsonp(url.toString());
          let result: AmapResult;

          if (data.status === 0 && data.results && data.results.length > 0) {
              const best = data.results[0];
              
              // Formatting Optimization: Show "Name (Address)" to be more descriptive
              const formattedAddress = (best.address && best.address.length > 0) 
                ? `${best.name} (${best.address})`
                : best.name;

              result = { 
                  success: true, 
                  location: { lng: best.location.lng, lat: best.location.lat },
                  pois: data.results,
                  province: best.province,
                  city: best.city,
                  district: best.area,
                  formattedAddress: formattedAddress,
                  level: '兴趣点'
              };
              await db.set(cacheKey, result);
              return result;
          }
          
          if (this.isKeyError(data.status)) return { success: false, error: data.message, invalidKey: true };
          if (this.isQpsError(data.status)) return { success: false, error: data.message, isQpsLimit: true };
          
          result = { success: false, error: 'No Baidu POIs found' };
          await db.set(cacheKey, result);
          return result;
      } catch (e: any) {
          return { success: false, error: e.message };
      }
  }

  // --- Helpers ---

  /**
   * Internal Helper: Perform Reverse Geocoding to get human-readable address from coordinates
   * Returns null if failed, so main flow isn't interrupted.
   */
  private static async reverseGeocode(lng: number, lat: number, apiKey: string): Promise<string | null> {
    try {
        const url = new URL(this.BASE_URL_REVERSE_GEO);
        url.searchParams.append('location', `${lat},${lng}`);
        url.searchParams.append('output', 'json');
        url.searchParams.append('coordtype', 'gcj02ll');
        url.searchParams.append('ak', apiKey);

        // Note: Reverse geocoding consumes quota too.
        const data = await this.fetchBaiduJsonp(url.toString());
        if (data.status === 0 && data.result) {
            const addr = data.result.formatted_address;
            const desc = data.result.sematic_description;
            // Return composite description if semantic exists (e.g. "Inside Park")
            return desc ? `${addr} (${desc})` : addr;
        }
    } catch (e) {
        // Ignore reverse geo errors, fall back to original
        // console.warn("Baidu Reverse Geo Failed", e);
    }
    return null;
  }
  
  private static async fetchBaiduJsonp(urlStr: string): Promise<BaiduResponse> {
      return new Promise((resolve, reject) => {
          // Fix: Use a more unique callback name to prevent race conditions in high concurrency
          const uniqueId = Math.random().toString(36).substring(2, 9);
          const timestamp = Date.now();
          const callbackName = `baidu_cb_${timestamp}_${uniqueId}`;
          
          const script = document.createElement('script');
          const url = new URL(urlStr);
          url.searchParams.set('callback', callbackName);
          script.src = url.toString();
          
          // Timeout Protection against hanging requests (10秒超时)
          const timeoutId = setTimeout(() => {
              cleanup();
              reject(new Error('请求超时 (10s)'));
          }, 10000);

          const cleanup = () => {
              if (document.body.contains(script)) {
                  document.body.removeChild(script);
              }
              try {
                delete (window as any)[callbackName];
              } catch (e) {}
              clearTimeout(timeoutId);
          };

          script.onerror = (e) => {
              cleanup();
              // "Script error." is usually caused by CORS or blocked scripts
              reject(new Error('Network/Script Error: Could not load Baidu API script.'));
          };

          (window as any)[callbackName] = (data: any) => {
              cleanup();
              resolve(data);
          };

          document.body.appendChild(script);
      });
  }

  private static isKeyError(status: number): boolean {
      return [200, 210, 211, 220, 240, 250, 251, 252, 260, 261].includes(status);
  }

  private static isQpsError(status: number): boolean {
      return status === 302 || status === 401 || status === 402;
  }

  private static mapBaiduLevel(level: string): string {
      const map: Record<string, string> = {
          'No': '无',
          '省': '省',
          '城市': '市',
          '区县': '区县',
          '商圈': '热点区域',
          '道路': '道路',
          '地产小区': '兴趣点',
          '公司企业': '兴趣点',
          '政府机构': '兴趣点',
          '美食': '兴趣点',
          '酒店': '兴趣点',
          '购物': '兴趣点',
          '生活服务': '兴趣点',
          '旅游景点': '兴趣点',
          '交通设施': '兴趣点',
          '教育': '兴趣点',
          '医疗': '兴趣点',
          '门址': '门牌号',
          '乡镇': '乡镇',
          '村庄': '村庄'
      };
      return map[level] || '兴趣点';
  }
}
