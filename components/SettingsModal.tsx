import React, { useState, useEffect } from 'react';
import { GeoConfig, ProviderMode } from '../types';
import { SettingsIcon, AlertTriangleIcon, TrashIcon, DownloadIcon, UploadCloudIcon } from './Icons';
import { AmapService } from '../services/amapService';
import { useGeocodingStore } from '../contexts/GeocodingContext';
import { useUIStore } from '../contexts/UIContext';

export const SettingsModal: React.FC = () => {
  const { config, setConfig } = useGeocodingStore();
  const { isSettingsOpen, setSettingsOpen } = useUIStore();
  
  const [localConfig, setLocalConfig] = useState<GeoConfig>(config);
  const [rawAmapKeys, setRawAmapKeys] = useState('');
  const [rawBaiduKeys, setRawBaiduKeys] = useState('');
  const [activeTab, setActiveTab] = useState<'service' | 'map' | 'about'>('service');
  
  // Sync when opening
  useEffect(() => {
    if (isSettingsOpen) {
        setLocalConfig(config);
        setRawAmapKeys(config.apiKeys.join('\n'));
        setRawBaiduKeys((config.baiduApiKeys || []).join('\n'));
    }
  }, [isSettingsOpen, config]);

  if (!isSettingsOpen) return null;

  const onClose = () => setSettingsOpen(false);

  const handleSave = () => {
    setConfig(localConfig);
    // 显示保存成功提示
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg z-[100] animate-fade-in';
    toast.textContent = '✓ 配置已保存';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
    onClose();
  };

  const handleAmapKeysChange = (val: string) => {
    setRawAmapKeys(val);
    const keys = val.split('\n').map(k => k.trim()).filter(k => k);
    setLocalConfig(prev => ({ ...prev, apiKeys: keys }));
  };

  const handleBaiduKeysChange = (val: string) => {
    setRawBaiduKeys(val);
    const keys = val.split('\n').map(k => k.trim()).filter(k => k);
    setLocalConfig(prev => ({ ...prev, baiduApiKeys: keys }));
  };

  const handleClearCache = () => {
      if (confirm('确定要清除所有本地地理编码缓存吗？这会导致下次查询重新消耗 API 配额。')) {
          AmapService.clearCache();
          alert('缓存已清除');
      }
  };

  const handleExportConfig = () => {
    const dataStr = JSON.stringify(localConfig, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "geomapper_config.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json) {
             setLocalConfig(prev => ({...prev, ...json}));
             setRawAmapKeys((json.apiKeys || []).join('\n'));
             setRawBaiduKeys((json.baiduApiKeys || []).join('\n'));
             alert('配置已成功导入');
        }
      } catch (err) {
        alert('解析配置文件失败');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
          <div className="flex items-center gap-2 text-slate-800">
            <SettingsIcon className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-bold">系统设置</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50">
           <button 
             onClick={() => setActiveTab('service')}
             className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'service' ? 'border-brand-600 text-brand-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
           >
             核心服务
           </button>
           <button 
             onClick={() => setActiveTab('map')}
             className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'map' ? 'border-brand-600 text-brand-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
           >
             地图可视化
           </button>
           <button 
             onClick={() => setActiveTab('about')}
             className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'about' ? 'border-brand-600 text-brand-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
           >
             关于软件
           </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
            
            {activeTab === 'service' && (
            <>
            {/* Mode Selection */}
            <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg">
                <label className="block text-sm font-bold text-indigo-900 mb-2">调度策略 (Provider Strategy)</label>
                <select 
                    className="w-full p-2 border border-indigo-200 rounded text-sm text-indigo-900 bg-white"
                    value={localConfig.providerMode || 'CONCURRENT_BIDDING'}
                    onChange={(e) => setLocalConfig({...localConfig, providerMode: e.target.value as ProviderMode})}
                >
                    <option value="CONCURRENT_BIDDING">🌟 双向竞价 (Concurrent) - 精度最高，保留双份证据</option>
                    <option value="WATERFALL_BAIDU_FIRST">🔴 百度优先 (Waterfall) - 优先百度，失败查高德</option>
                    <option value="WATERFALL_AMAP_FIRST">🔷 高德优先 (Waterfall) - 优先高德，失败查百度</option>
                    <option value="BAIDU_ONLY">⭕ 仅使用百度 (Baidu Only)</option>
                    <option value="AMAP_ONLY">🔹 仅使用高德 (Amap Only)</option>
                </select>
                <p className="text-xs text-indigo-600 mt-2">
                    双向竞价模式会同时消耗两边的配额，但能自动通过交叉验证发现点位漂移，适合对精度要求极高的场景。
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Amap Keys */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-bold text-slate-800">高德 Web服务 Keys</label>
                    <a href="https://console.amap.com/dev/key/app" target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline">申请Web服务Key</a>
                  </div>
                  <textarea 
                    className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 font-mono text-xs whitespace-nowrap overflow-x-auto"
                    placeholder="每行一个 Key..."
                    value={rawAmapKeys}
                    onChange={(e) => handleAmapKeysChange(e.target.value)}
                    spellCheck={false}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">用于后台地理编码，必须勾选 <b>[Web服务]</b> 平台</p>
                </div>

                {/* Baidu Keys */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-bold text-slate-800">百度 服务端 Keys</label>
                    <a href="https://lbsyun.baidu.com/apiconsole/key/create" target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline">申请服务端AK</a>
                  </div>
                  <textarea 
                    className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 font-mono text-xs whitespace-nowrap overflow-x-auto"
                    placeholder="每行一个 AK..."
                    value={rawBaiduKeys}
                    onChange={(e) => handleBaiduKeysChange(e.target.value)}
                    spellCheck={false}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">用于辅助验证，需开启 <b>[服务端]</b> 权限</p>
                </div>
            </div>

            {/* General Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
               <div className="col-span-1 md:col-span-2 flex items-start gap-3 bg-white p-3 border border-slate-200 rounded-lg">
                   <input 
                     type="checkbox" 
                     id="highPrecisionMode"
                     className="mt-1 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                     checked={localConfig.highPrecisionMode !== false}
                     onChange={(e) => setLocalConfig({...localConfig, highPrecisionMode: e.target.checked})}
                   />
                   <div>
                      <label htmlFor="highPrecisionMode" className="block text-sm font-bold text-slate-700">启用高精度智能兜底 (推荐)</label>
                      <p className="text-xs text-slate-500 mt-1">当API返回的精度较低时，自动尝试使用"关键词搜索"功能进行二次确认。</p>
                   </div>
                </div>

               <div className="col-span-1 md:col-span-2 flex items-start gap-3 bg-white p-3 border border-slate-200 rounded-lg">
                   <input 
                     type="checkbox" 
                     id="enableBaiduReverseGeo"
                     className="mt-1 rounded border-slate-300 text-red-600 focus:ring-red-500"
                     checked={localConfig.enableBaiduReverseGeo !== false}
                     onChange={(e) => setLocalConfig({...localConfig, enableBaiduReverseGeo: e.target.checked})}
                   />
                   <div>
                      <label htmlFor="enableBaiduReverseGeo" className="block text-sm font-bold text-slate-700">启用百度逆地理编码</label>
                      <p className="text-xs text-slate-500 mt-1">开启后百度会额外调用逆地理编码获取详细地址，会消耗更多配额但结果更完整。</p>
                   </div>
                </div>

               <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">POI 关键词识别</label>
                  <input 
                    type="text" 
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 text-sm"
                    placeholder="学校、医院、银行、超市..."
                    value={(localConfig.poiKeywords || []).join('、')}
                    onChange={(e) => {
                      const keywords = e.target.value.split(/[,，、]/).map(k => k.trim()).filter(k => k);
                      setLocalConfig({...localConfig, poiKeywords: keywords});
                    }}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">用顿号或逗号分隔，当地址包含这些关键词时会自动使用 POI 搜索策略提高精度。</p>
               </div>

              <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">默认地区 / 首级关键词</label>
                  <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500" value={localConfig.city} onChange={(e) => setLocalConfig({...localConfig, city: e.target.value})} placeholder="例如：北京市 或 浙江省"/>
              </div>
               <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">并发请求数 (Concurrency)</label>
                <input type="number" min="1" max="10" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500" value={localConfig.concurrency || 1} onChange={(e) => setLocalConfig({...localConfig, concurrency: Math.max(1, Number(e.target.value))})}/>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">请求间隔 (ms)</label>
                <input type="number" className="w-full p-2 border border-slate-300 rounded-lg" value={localConfig.requestInterval} onChange={(e) => setLocalConfig({...localConfig, requestInterval: Number(e.target.value)})}/>
              </div>
              <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-1">最大重试次数</label>
                <input type="number" className="w-full p-2 border border-slate-300 rounded-lg" value={localConfig.maxRetries} onChange={(e) => setLocalConfig({...localConfig, maxRetries: Number(e.target.value)})}/>
              </div>
            </div>
            </>
            )}

            {activeTab === 'map' && (
                <div className="space-y-6">
                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-lg flex gap-3">
                        <div className="text-emerald-500 mt-0.5"><AlertTriangleIcon className="w-5 h-5" /></div>
                        <div>
                            <h4 className="font-bold text-emerald-900 text-sm">为什么要单独配置？</h4>
                            <p className="text-xs text-emerald-700 mt-1">
                                高德地图 JS API（用于地图展示）和 Web 服务（用于地理编码数据）是两个独立的服务。
                                它们需要申请不同类型的 Key，且 JS API 强制要求配置安全密钥 (Security Code)。
                            </p>
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-1">
                           <label className="block text-sm font-bold text-slate-800">高德 JS API Key</label>
                           <a href="https://console.amap.com/dev/key/app" target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline">申请Web端(JSAPI) Key</a>
                        </div>
                        <input 
                           type="text"
                           className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 font-mono text-sm"
                           placeholder="输入您的 JS API Key..."
                           value={localConfig.amapJsKey || ''}
                           onChange={(e) => setLocalConfig({...localConfig, amapJsKey: e.target.value})}
                        />
                         <p className="text-[10px] text-slate-400 mt-1">请确保在高德控制台申请 Key 时勾选 <b>[Web端 (JSAPI)]</b> 平台。</p>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-1">
                           <label className="block text-sm font-bold text-slate-800">安全密钥 (Security Code)</label>
                        </div>
                        <input 
                           type="text"
                           className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 font-mono text-sm"
                           placeholder="输入对应的安全密钥..."
                           value={localConfig.amapSecurityCode || ''}
                           onChange={(e) => setLocalConfig({...localConfig, amapSecurityCode: e.target.value})}
                        />
                         <p className="text-[10px] text-slate-400 mt-1">2021年12月02日以后申请的key必须配合安全密钥使用。</p>
                    </div>
                </div>
            )}

            {activeTab === 'about' && (
                <div className="space-y-6">
                    {/* 软件信息 */}
                    <div className="text-center pb-4 border-b border-slate-100">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl text-white shadow-lg shadow-brand-500/30 mb-3">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800">GeoMapper Pro</h3>
                        <p className="text-sm text-slate-500 mt-1">专业级批量地理编码工具</p>
                        <p className="text-xs text-slate-400 mt-2">版本 1.0.0</p>
                    </div>

                    {/* 功能介绍 */}
                    <div>
                        <h4 className="text-sm font-bold text-slate-700 mb-3">✨ 核心功能</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="bg-slate-50 rounded-lg p-3">
                                <div className="font-medium text-slate-700 text-sm mb-1">🔄 双源竞价验证</div>
                                <p className="text-xs text-slate-500">同时调用高德、百度双引擎，交叉验证确保坐标精准</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                                <div className="font-medium text-slate-700 text-sm mb-1">📊 批量处理</div>
                                <p className="text-xs text-slate-500">支持 Excel/CSV 导入导出，智能列映射，一键处理</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                                <div className="font-medium text-slate-700 text-sm mb-1">🗺️ 地图可视化</div>
                                <p className="text-xs text-slate-500">实时预览点位分布，支持聚合、筛选、卫星图切换</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                                <div className="font-medium text-slate-700 text-sm mb-1">📍 手动定位</div>
                                <p className="text-xs text-slate-500">POI搜索、拖拽移动，灵活修正异常点位</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                                <div className="font-medium text-slate-700 text-sm mb-1">⚡ 智能调度</div>
                                <p className="text-xs text-slate-500">多Key轮询、自动限流、指数退避，稳定高效</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                                <div className="font-medium text-slate-700 text-sm mb-1">💾 本地缓存</div>
                                <p className="text-xs text-slate-500">查询结果自动缓存，避免重复消耗API配额</p>
                            </div>
                        </div>
                    </div>

                    {/* 赞助区域 */}
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5">
                        <div className="text-center mb-4">
                            <h4 className="text-base font-bold text-amber-900 mb-2">☕ 请作者喝杯咖啡</h4>
                            <p className="text-sm text-amber-800 leading-relaxed">
                                GeoMapper Pro 是一款完全免费的开源工具，由作者利用业余时间独立开发维护。
                                如果这个工具帮助您节省了时间、提高了工作效率，欢迎请作者喝杯咖啡以示鼓励！
                                您的支持是我持续更新和优化的最大动力 💪
                            </p>
                        </div>
                        
                        {/* 二维码区域 */}
                        <div className="flex justify-center gap-6 mt-4">
                            <div className="text-center">
                                <div className="w-36 h-36 bg-white rounded-lg border border-green-200 overflow-hidden shadow-sm">
                                    <img 
                                        src="/wechat-pay.png" 
                                        alt="微信赞赏码"
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                        }}
                                    />
                                    <div className="hidden w-full h-full flex items-center justify-center text-slate-400 text-xs">
                                        请放入 wechat-pay.png
                                    </div>
                                </div>
                                <p className="text-xs text-green-600 mt-2 font-medium">微信扫一扫</p>
                            </div>
                            <div className="text-center">
                                <div className="w-36 h-36 bg-white rounded-lg border border-blue-200 overflow-hidden shadow-sm">
                                    <img 
                                        src="/alipay.png" 
                                        alt="支付宝赞赏码"
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                        }}
                                    />
                                    <div className="hidden w-full h-full flex items-center justify-center text-slate-400 text-xs">
                                        请放入 alipay.png
                                    </div>
                                </div>
                                <p className="text-xs text-blue-600 mt-2 font-medium">支付宝扫一扫</p>
                            </div>
                        </div>
                        
                        <p className="text-center text-xs text-amber-600 mt-4">
                            感谢每一位支持者，你们的鼓励让开源更有温度 ❤️
                        </p>
                    </div>

                    {/* 版权信息 */}
                    <div className="text-center text-xs text-slate-400 pt-2">
                        <p>© 2024 GeoMapper Pro. 基于 MIT 协议开源</p>
                        <p className="mt-1">Powered by React + TypeScript + 高德/百度地图 API</p>
                    </div>
                </div>
            )}
            
            {/* Footer Actions - 仅在配置选项卡显示 */}
            {activeTab !== 'about' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">缓存管理</label>
                    <button onClick={handleClearCache} className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 hover:text-rose-600 hover:border-rose-300 text-xs transition-colors shadow-sm"><TrashIcon className="w-3 h-3" /> 清除 API 缓存</button>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">配置备份</label>
                    <div className="flex gap-2">
                        <button onClick={handleExportConfig} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 hover:text-brand-600 hover:border-brand-300 text-xs transition-colors shadow-sm"><DownloadIcon className="w-3 h-3" /> 导出</button>
                        <label className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 hover:text-brand-600 hover:border-brand-300 text-xs transition-colors shadow-sm cursor-pointer"><UploadCloudIcon className="w-3 h-3" /> 导入 <input type="file" accept=".json" className="hidden" onChange={handleImportConfig} /></label>
                    </div>
                </div>
            </div>
            )}
        </div>
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors">
            {activeTab === 'about' ? '关闭' : '取消'}
          </button>
          {activeTab !== 'about' && (
            <button onClick={handleSave} className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg shadow-sm">保存配置</button>
          )}
        </div>
      </div>
    </div>
  );
};
