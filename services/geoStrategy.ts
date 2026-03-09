
import { ProcessedRecord, GeoConfig, LogEntry, ComparisonEvidence, GeoResult } from '../types';
import { AmapService, AmapResult } from './amapService';
import { BaiduService } from './baiduService';
import { getDistance } from '../utils';

type LogFn = (level: LogEntry['level'], message: string) => void;
type KeyFn = (type: 'AMAP' | 'BAIDU') => string | null;
type ReportKeyFailFn = (key: string, type: 'AMAP' | 'BAIDU') => void;

interface StrategyContext {
    config: GeoConfig;
    invalidKeys: Set<string>;
    getKey: KeyFn;
    log: LogFn;
    markKeyCooldown?: ReportKeyFailFn;
}

// --- Generic Retry Executor ---
const executeWithRetry = async (
    type: 'AMAP' | 'BAIDU',
    operation: (key: string) => Promise<AmapResult>,
    ctx: StrategyContext
): Promise<AmapResult> => {
    let attempts = 0;
    const maxAttempts = type === 'AMAP' ? ctx.config.apiKeys.length : ctx.config.baiduApiKeys.length;
    
    if (maxAttempts === 0) return { success: false, error: 'No Keys Configured' };

    while (attempts <= maxAttempts) {
        const key = ctx.getKey(type);
        if (!key) return { success: false, error: 'Keys Exhausted/Cooling', invalidKey: true };

        const result = await operation(key);

        if (result.success) return result;

        if (result.invalidKey) {
            if (!ctx.invalidKeys.has(key)) {
                ctx.invalidKeys.add(key);
                ctx.log('warning', `${type} Key (***${key.slice(-4)}) 失效，已熔断。`);
            }
        } else if (result.isQpsLimit) {
            if (ctx.markKeyCooldown) {
                ctx.markKeyCooldown(key, type);
                ctx.log('warning', `${type} Key (***${key.slice(-4)}) QPS超限，冷却中。`);
            }
        } else {
            return result;
        }
        attempts++;
    }
    return { success: false, error: 'Retry Failed' };
};

// --- Single Provider Wrappers ---
const queryProvider = async (
    provider: 'AMAP' | 'BAIDU',
    method: 'GEO' | 'SEARCH',
    query: string,
    city: string,
    ctx: StrategyContext
): Promise<AmapResult> => {
    if (provider === 'AMAP') {
        return method === 'GEO' 
            ? executeWithRetry('AMAP', k => AmapService.geocode(query, city, k), ctx)
            : executeWithRetry('AMAP', k => AmapService.searchPois(query, city, k), ctx);
    } else {
        // P1: 传递逆地理编码开关
        const enableReverseGeo = ctx.config.enableBaiduReverseGeo || false;
        return method === 'GEO'
            ? executeWithRetry('BAIDU', k => BaiduService.geocode(query, city, k, enableReverseGeo), ctx)
            : executeWithRetry('BAIDU', k => BaiduService.searchPois(query, city, k), ctx);
    }
};

// --- Scoring Logic ---
const getLevelScore = (level: string = ''): number => {
    if (['兴趣点', '门牌号', 'POI'].includes(level)) return 100;
    if (['道路交叉路口', '热点区域', '商圈'].includes(level)) return 80;
    if (['道路', '街道'].includes(level)) return 60;
    if (['村庄', '乡镇'].includes(level)) return 40;
    if (['区县', '市', '省'].includes(level)) return 20;
    return 0;
};

// --- Region Validation Logic ---
const validateRegion = (
    result: AmapResult, 
    targetRegion: string
): { isValid: boolean; reason?: string } => {
    if (!targetRegion) return { isValid: true };
    
    // Normalize target: remove suffixes like 市, 省 (e.g. "北京市" -> "北京")
    const normalizedTarget = targetRegion.replace(/[省市区县]/g, '');
    if (normalizedTarget.length < 2) return { isValid: true }; // Too short to validate accurately

    const resProvince = (result.province || '').replace(/[省市区县]/g, '');
    // 直辖市特殊处理：北京、上海、天津、重庆的 city 字段可能为空
    const directMunicipalities = ['北京', '上海', '天津', '重庆'];
    const isDirectMunicipality = directMunicipalities.some(m => normalizedTarget.includes(m) || resProvince.includes(m));
    
    // 对于直辖市，city 可能为空数组或空字符串，使用 province 代替
    let resCity = '';
    if (result.city) {
        resCity = typeof result.city === 'string' ? result.city.replace(/[省市区县]/g, '') : '';
    }
    // 直辖市时，如果 city 为空，用 province 作为 city
    if (isDirectMunicipality && !resCity) {
        resCity = resProvince;
    }
    
    const resDistrict = (result.district || '').replace(/[省市区县]/g, '');

    // Check if target appears in any of the returned administrative fields
    const match = resProvince.includes(normalizedTarget) || 
                  normalizedTarget.includes(resProvince) ||
                  resCity.includes(normalizedTarget) || 
                  normalizedTarget.includes(resCity) ||
                  resDistrict.includes(normalizedTarget);

    if (!match) {
        return { 
            isValid: false, 
            reason: `区域不匹配: 预期[${targetRegion}]，实际[${result.province || ''}${resCity || ''}]` 
        };
    }
    return { isValid: true };
};


// --- Main Process ---
export const processRecordStrategy = async (
    record: ProcessedRecord,
    ctx: StrategyContext
): Promise<ProcessedRecord> => {
    const { providerMode, city: defaultRegion } = ctx.config;
    const logPrefix = `[${record.mainKeyword}]`;
    const forceStrategy = record.forceStrategy || 'AUTO';

    const main = record.mainKeyword.trim();
    const sub = record.subKeyword ? record.subKeyword.trim() : '';
    const region = defaultRegion.trim();
    
    // Helper: Prevent duplication (e.g., "北京市" + "北京市朝阳区" -> "北京市朝阳区")
    const combineQuery = (reg: string, kw: string) => {
        if (!reg) return kw;
        if (kw.startsWith(reg)) return kw;
        return reg + kw;
    };

    // --- STRATEGY EXECUTION HELPER ---
    // This function implements the "Permutation Strategy" (Smart Fallback)
    const runIntelligentStrategy = async (provider: 'AMAP' | 'BAIDU'): Promise<AmapResult> => {
        // S3: 使用配置的POI关键词列表进行智能识别
        const poiKeywords = ctx.config.poiKeywords || ['公司', '店', '苑', '大厦', '局', '委'];
        const isPoi = poiKeywords.some(kw => main.includes(kw));

        // 1. Forced Strategies
        if (forceStrategy === 'FORCE_SEARCH') {
            return queryProvider(provider, 'SEARCH', combineQuery(region, sub ? sub + main : main), region, ctx);
        }
        if (forceStrategy === 'FORCE_GEO') {
            return queryProvider(provider, 'GEO', combineQuery(region, sub ? sub + main : main), region, ctx);
        }
        if (forceStrategy === 'SIMPLE_MAIN') {
            // 仅使用主关键词，不加区域限制，直接POI搜索
            return queryProvider(provider, 'SEARCH', main, '', ctx);
        }

        // 2. Intelligent Composite Strategy
        let res: AmapResult;

        // Attempt 1: Full Composite (Region + Sub + Main)
        const attempt1Query = combineQuery(region, sub ? sub + main : main);
        // For Baidu POI-like keywords, prefer Search. For Amap, Geo is usually good enough.
        const method1 = (provider === 'BAIDU' || isPoi) ? 'SEARCH' : 'GEO';
        
        res = await queryProvider(provider, method1, attempt1Query, region, ctx);
        
        // If Attempt 1 failed or result is low quality (e.g. matched City level), try fallback
        if (!res.success || getLevelScore(res.level) < 40) {
            
            // Attempt 2: Clean Composite (Region + Main) - Remove Sub keyword noise
            if (sub) {
                const attempt2Query = combineQuery(region, main);
                const method2 = (provider === 'BAIDU' || isPoi) ? 'SEARCH' : 'GEO';
                
                const res2 = await queryProvider(provider, method2, attempt2Query, region, ctx);
                
                // If attempt 2 is better, take it
                if (res2.success && getLevelScore(res2.level) > getLevelScore(res.level)) {
                    res = res2;
                }
            }

            // Attempt 3: Pure Main Keyword (let API handle region)
            // Only if we still don't have a good result
            if (!res.success || getLevelScore(res.level) < 40) {
                const res3 = await queryProvider(provider, 'SEARCH', main, region, ctx);
                if (res3.success && getLevelScore(res3.level) > getLevelScore(res.level)) {
                    res = res3;
                }
            }
        }

        return res;
    };

    // --- EXECUTION MODES ---

    let amapRes: AmapResult | null = null;
    let baiduRes: AmapResult | null = null;
    const tasks: Promise<void>[] = [];

    // 并发模式：同时查询两个服务
    if (providerMode === 'CONCURRENT_BIDDING') {
        tasks.push((async () => {
             amapRes = await runIntelligentStrategy('AMAP');
        })());
        tasks.push((async () => {
             baiduRes = await runIntelligentStrategy('BAIDU');
        })());
        await Promise.all(tasks);
    }
    // 仅高德
    else if (providerMode === 'AMAP_ONLY') {
        amapRes = await runIntelligentStrategy('AMAP');
    }
    // 仅百度
    else if (providerMode === 'BAIDU_ONLY') {
        baiduRes = await runIntelligentStrategy('BAIDU');
    }
    // 高德优先瀑布
    else if (providerMode === 'WATERFALL_AMAP_FIRST') {
        amapRes = await runIntelligentStrategy('AMAP');
        if (!amapRes?.success || getLevelScore(amapRes.level) < 60) {
            ctx.log('info', `${logPrefix} 高德结果不佳，触发百度兜底...`);
            baiduRes = await runIntelligentStrategy('BAIDU');
        }
    }
    // 百度优先瀑布
    else if (providerMode === 'WATERFALL_BAIDU_FIRST') {
        baiduRes = await runIntelligentStrategy('BAIDU');
        if (!baiduRes?.success || getLevelScore(baiduRes.level) < 60) {
            ctx.log('info', `${logPrefix} 百度结果不佳，触发高德兜底...`);
            amapRes = await runIntelligentStrategy('AMAP');
        }
    }

    // --- ARBITRATION & VALIDATION ---
    
    // Apply Region Validation
    if (amapRes?.success) {
        const check = validateRegion(amapRes, region);
        if (!check.isValid) {
            // Downgrade precision/score if region mismatches
            amapRes.level = `(异地) ${amapRes.level}`;
            amapRes.error = check.reason;
        }
    }
    if (baiduRes?.success) {
        const check = validateRegion(baiduRes, region);
        if (!check.isValid) {
             baiduRes.level = `(异地) ${baiduRes.level}`;
             baiduRes.error = check.reason;
        }
    }

    const comparison: ComparisonEvidence = {};
    if (amapRes?.success && amapRes.location) {
        comparison.amap = {
            lng: amapRes.location.lng,
            lat: amapRes.location.lat,
            address: amapRes.formattedAddress || '',
            level: amapRes.level || ''
        };
    }
    if (baiduRes?.success && baiduRes.location) {
        comparison.baidu = {
            lng: baiduRes.location.lng,
            lat: baiduRes.location.lat,
            address: baiduRes.formattedAddress || '',
            level: baiduRes.level || ''
        };
    }

    if (comparison.amap && comparison.baidu) {
        comparison.distance = getDistance(comparison.amap.lng, comparison.amap.lat, comparison.baidu.lng, comparison.baidu.lat);
    }

    let winner: 'AMAP' | 'BAIDU' | null = null;
    let finalRes: AmapResult | null = null;

    // Check for "Foreign" (drift) markers to penalize score
    const getAdjustedScore = (res: AmapResult | null) => {
        if (!res?.success) return 0;
        let score = getLevelScore(res.level);
        if (res.level?.includes('异地')) score -= 50; // Heavy penalty for drift
        return Math.max(0, score);
    };

    const scoreAmap = getAdjustedScore(amapRes);
    const scoreBaidu = getAdjustedScore(baiduRes);

    if (scoreAmap === 0 && scoreBaidu === 0) {
        const isInvalid = amapRes?.invalidKey || baiduRes?.invalidKey;
        // If both failed due to region mismatch
        const errorMsg = (amapRes?.error && amapRes.error.includes('区域不匹配')) 
            ? amapRes.error 
            : '所有地图服务均未找到结果';

        return { 
            ...record, 
            status: 'Fail', 
            errorMsg,
            comparison,
            invalidKey: isInvalid
        };
    }

    // Smart Arbitration
    if (scoreAmap > scoreBaidu) {
        winner = 'AMAP';
        comparison.winnerReason = `高德精度更高 (${amapRes?.level} vs ${baiduRes?.level || '无'})`;
    } else if (scoreBaidu > scoreAmap) {
        winner = 'BAIDU';
        comparison.winnerReason = `百度精度更高 (${baiduRes?.level} vs ${amapRes?.level || '无'})`;
    } else {
        // Tie-breaker
        if (comparison.distance && comparison.distance > 500) {
            winner = 'AMAP';
            comparison.winnerReason = `精度相同，优先采用高德 (注意：两者偏差 ${Math.round(comparison.distance)}米)`;
        } else {
            winner = 'AMAP'; 
            comparison.winnerReason = '精度相同，默认采用高德';
        }
    }

    finalRes = winner === 'AMAP' ? amapRes : baiduRes;

    if (!finalRes || !finalRes.location) return { ...record, status: 'Fail', errorMsg: 'Logic Error' };

    let status: GeoResult['status'] = 'Success';
    let errorMsg: string | undefined = undefined;

    // Soft Fail on drift
    if (finalRes.level?.includes('异地')) {
        status = 'Fail';
        errorMsg = finalRes.error || '区域不匹配';
    } else if (comparison.distance && comparison.distance > 500) {
        status = 'Fail'; // Soft Fail
        errorMsg = `存在争议: 两大地图偏差 ${Math.round(comparison.distance)}米`;
    }

    return {
        ...record,
        lng: finalRes.location.lng,
        lat: finalRes.location.lat,
        formattedAddress: finalRes.formattedAddress,
        matchLevel: finalRes.level,
        matchedBy: finalRes.pois ? 'POI Search' : 'Main Keyword',
        source: winner as 'AMAP' | 'BAIDU',
        status,
        errorMsg,
        comparison,
        forceStrategy: undefined,
        invalidKey: finalRes.invalidKey // Propagate invalidKey status
    };
};
