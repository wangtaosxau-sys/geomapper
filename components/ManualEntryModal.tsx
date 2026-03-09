
import React, { useState } from 'react';
import { generateId } from '../utils';
import { useGeocodingStore } from '../contexts/GeocodingContext';
import { useUIStore } from '../contexts/UIContext';

export const ManualEntryModal: React.FC = () => {
  const { actions } = useGeocodingStore();
  const { isManualEntryOpen, setManualEntryOpen } = useUIStore();
  
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [mainKeyword, setMainKeyword] = useState('');
  const [subKeyword, setSubKeyword] = useState('');
  const [batchText, setBatchText] = useState('');

  if (!isManualEntryOpen) return null;

  const onClose = () => {
    setManualEntryOpen(false);
    setMode('single');
    setMainKeyword('');
    setSubKeyword('');
    setBatchText('');
  };

  // 解析批量文本，提取公司名称中的地址信息
  const parseAddressFromText = (text: string): string[] => {
    const addresses: string[] = [];
    
    // 按行分割或按公司名称分割
    const lines = text.split(/[\n\r]+/).filter(line => line.trim());
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      // 提取地址关键词的正则表达式
      const addressPatterns = [
        // 省市区县模式
        /([^a-zA-Z]*?(?:省|市|区|县|旗|盟)[^a-zA-Z]*?(?:省|市|区|县|旗|盟|街道|镇|乡)[^a-zA-Z]*)/g,
        // 直辖市模式
        /([^a-zA-Z]*?(?:北京|上海|天津|重庆)[^a-zA-Z]*?(?:市|区|县)[^a-zA-Z]*)/g,
        // 特殊行政区
        /([^a-zA-Z]*?(?:香港|澳门|台湾)[^a-zA-Z]*)/g,
        // 包含地名的公司名称
        /([^a-zA-Z]*?(?:山西|河北|河南|山东|江苏|浙江|安徽|福建|江西|湖北|湖南|广东|广西|海南|四川|贵州|云南|陕西|甘肃|青海|内蒙古|新疆|西藏|宁夏|黑龙江|吉林|辽宁)[^a-zA-Z]*)/g
      ];
      
      let foundAddress = false;
      
      // 尝试各种模式提取地址
      for (const pattern of addressPatterns) {
        const matches = trimmedLine.match(pattern);
        if (matches && matches.length > 0) {
          // 取最长的匹配作为地址
          const longestMatch = matches.reduce((a, b) => a.length > b.length ? a : b);
          if (longestMatch.length > 2) { // 至少3个字符
            addresses.push(longestMatch.trim());
            foundAddress = true;
            break;
          }
        }
      }
      
      // 如果没有找到明确的地址模式，尝试提取公司名称前缀
      if (!foundAddress) {
        // 提取公司名称中可能的地址前缀
        const prefixMatch = trimmedLine.match(/^([^a-zA-Z]{2,8}?)(?:集团|公司|企业|有限|股份|建设|投资|开发|工程|设计|研究|学院|大学)/);
        if (prefixMatch && prefixMatch[1]) {
          const prefix = prefixMatch[1].trim();
          // 检查是否包含地名特征
          if (prefix.match(/(?:省|市|区|县|旗|盟|山西|河北|河南|山东|江苏|浙江|安徽|福建|江西|湖北|湖南|广东|广西|海南|四川|贵州|云南|陕西|甘肃|青海|内蒙古|新疆|西藏|宁夏|黑龙江|吉林|辽宁|北京|上海|天津|重庆|晋城|太原|大同|阳泉|长治|晋中|运城|临汾|朔州|忻州|吕梁)/)) {
            addresses.push(prefix);
            foundAddress = true;
          }
        }
      }
      
      // 如果仍然没有找到，使用整行作为地址（截取前20个字符）
      if (!foundAddress && trimmedLine.length > 0) {
        const shortAddress = trimmedLine.substring(0, 20);
        addresses.push(shortAddress);
      }
    }
    
    // 去重并过滤
    return [...new Set(addresses)].filter(addr => addr && addr.length >= 2);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (mode === 'single') {
      if (!mainKeyword.trim()) return;
      
      actions.addRecord({
        id: generateId('manual'),
        mainKeyword: mainKeyword.trim(),
        subKeyword: subKeyword.trim(),
        originalIndex: -1
      });
    } else {
      if (!batchText.trim()) return;
      
      const addresses = parseAddressFromText(batchText);
      
      if (addresses.length === 0) {
        alert('未能从文本中解析出有效地址，请检查输入格式');
        return;
      }
      
      // 批量添加记录
      addresses.forEach((address, index) => {
        actions.addRecord({
          id: generateId('batch'),
          mainKeyword: address,
          subKeyword: '',
          originalIndex: -1
        });
      });
      
      alert(`成功解析并添加了 ${addresses.length} 个地址`);
    }
    
    setMainKeyword('');
    setSubKeyword('');
    setBatchText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="font-semibold text-slate-800">手动添加地址</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        
        {/* 模式切换 */}
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <div className="flex space-x-1 bg-slate-200 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                mode === 'single' 
                  ? 'bg-white text-brand-600 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              单个添加
            </button>
            <button
              type="button"
              onClick={() => setMode('batch')}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                mode === 'batch' 
                  ? 'bg-white text-brand-600 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              批量添加
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {mode === 'single' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">主关键词 / 地址 <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  required
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="例如：北京市朝阳区..."
                  value={mainKeyword}
                  onChange={(e) => setMainKeyword(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">副关键词 (可选)</label>
                <input 
                  type="text" 
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="例如：辅助定位信息"
                  value={subKeyword}
                  onChange={(e) => setSubKeyword(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                批量文本 <span className="text-red-500">*</span>
                <span className="text-xs text-slate-500 ml-2">系统将自动解析文本中的地址信息</span>
              </label>
              <textarea
                required
                rows={8}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-mono text-sm"
                placeholder="请粘贴包含地址信息的文本，例如：
青城市丹河新城建设投资有限公司
华夏大学建筑设计研究院（集团）有限公司
青城宏圣建筑工程有限公司
江南泫氏实业集团有限公司
江南铭基房地产开发有限公司
...

系统会自动提取其中的地址关键词"
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                autoFocus
              />
              <div className="mt-2 text-xs text-slate-500">
                <p>• 支持按行分割的公司名称或地址列表</p>
                <p>• 系统会智能提取地名、省市区县等地址信息</p>
                <p>• 建议每行一个条目，系统会自动去重</p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg">取消</button>
            <button type="submit" className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg shadow-sm">
              {mode === 'single' ? '添加' : '批量添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
