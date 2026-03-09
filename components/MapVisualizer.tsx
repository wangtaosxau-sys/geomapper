import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as AMapLoaderModule from '@amap/amap-jsapi-loader';
import { useUIStore } from '../contexts/UIContext';
import { useGeocodingStore } from '../contexts/GeocodingContext';
import { ProcessedRecord } from '../types';

// Module-level cache
let loaderPromise: Promise<any> | null = null;
let cachedMapInstance: any = null;
let cachedContainerId: string | null = null;

// 常量
const CLUSTER_THRESHOLD = 50;
const CLUSTER_GRID_SIZE = 60;

// 筛选类型
type FilterType = 'all' | 'normal' | 'warning';
// 图层类型
type LayerType = 'standard' | 'satellite';
// 搜索模式
type SearchMode = 'marker' | 'poi';

export const MapVisualizer: React.FC = () => {
  const { records, config, actions } = useGeocodingStore();
  const { locateTarget, setLocateTarget } = useUIStore();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const containerWrapperRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const clusterRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const satelliteLayerRef = useRef<any>(null);
  const poiMarkerRef = useRef<any>(null); // POI搜索结果标记
  const pendingLocateIdRef = useRef<string | null>(null); // 待定位的记录ID
  const draggableMarkerRef = useRef<any>(null); // 可拖拽的编辑标记
  
  const [error, setError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [useCluster, setUseCluster] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [layerType, setLayerType] = useState<LayerType>('standard');
  const [searchMode, setSearchMode] = useState<SearchMode>('marker');
  const [poiKeyword, setPoiKeyword] = useState('');
  const [poiResults, setPoiResults] = useState<any[]>([]);
  const [showPoiDropdown, setShowPoiDropdown] = useState(false);
  const [isSearchingPoi, setIsSearchingPoi] = useState(false);
  const [selectedPoi, setSelectedPoi] = useState<any>(null); // 当前选中的POI
  const [editingPoint, setEditingPoint] = useState<(ProcessedRecord & { lng: number; lat: number }) | null>(null); // 正在拖拽编辑的点位

  // 判断点位是否异常
  const isPointWarning = useCallback((p: ProcessedRecord) => {
    return p.status === 'Fail' || p.errorMsg?.includes('偏差') || p.matchLevel?.includes('异地');
  }, []);

  // 基础有效点位
  const allValidPoints = useMemo(() => records.filter(
    (r): r is ProcessedRecord & { lng: number; lat: number } => 
      r.lng !== null && r.lat !== null && typeof r.lng === 'number'
  ), [records]);

  // 筛选后的点位（仅在marker搜索模式下应用关键词筛选）
  const filteredPoints = useMemo(() => {
    let points = allValidPoints;
    
    // 按状态筛选
    if (filterType === 'normal') {
      points = points.filter(p => !isPointWarning(p));
    } else if (filterType === 'warning') {
      points = points.filter(p => isPointWarning(p));
    }
    
    // 按关键词搜索（仅marker模式）
    if (searchMode === 'marker' && searchKeyword.trim()) {
      const kw = searchKeyword.trim().toLowerCase();
      points = points.filter(p => 
        p.mainKeyword.toLowerCase().includes(kw) ||
        p.formattedAddress?.toLowerCase().includes(kw)
      );
    }
    
    return points;
  }, [allValidPoints, filterType, searchKeyword, isPointWarning, searchMode]);

  // 统计数据
  const stats = useMemo(() => ({
    total: allValidPoints.length,
    normal: allValidPoints.filter(p => !isPointWarning(p)).length,
    warning: allValidPoints.filter(p => isPointWarning(p)).length,
    filtered: filteredPoints.length
  }), [allValidPoints, filteredPoints, isPointWarning]);

  // POI搜索
  const searchPoi = useCallback((keyword: string) => {
    if (!keyword.trim() || !mapInstanceRef.current || !(window as any).AMap) {
      console.log('POI search skipped:', { keyword, map: !!mapInstanceRef.current, AMap: !!(window as any).AMap });
      return;
    }
    
    const AMap = (window as any).AMap;
    setIsSearchingPoi(true);
    setPoiResults([]);
    
    // 动态加载 PlaceSearch 插件
    AMap.plugin(['AMap.PlaceSearch'], () => {
      try {
        const placeSearch = new AMap.PlaceSearch({
          city: config.city || '',
          citylimit: false,
          pageSize: 10,
        });
        
        placeSearch.search(keyword, (status: string, result: any) => {
          console.log('PlaceSearch result:', status, result);
          setIsSearchingPoi(false);
          // 高德返回的结构是 result.poiList.pois
          const pois = result?.poiList?.pois || [];
          console.log('POIs found:', pois.length, pois);
          if (status === 'complete' && pois.length > 0) {
            setPoiResults(pois);
            setShowPoiDropdown(true);
          } else {
            setPoiResults([]);
            setShowPoiDropdown(false);
          }
        });
      } catch (e) {
        console.error('PlaceSearch error:', e);
        setIsSearchingPoi(false);
      }
    });
  }, [config.city]);

  // 选择POI结果，定位到该位置
  const selectPoiResult = useCallback((poi: any) => {
    if (!mapInstanceRef.current || !(window as any).AMap) return;
    
    const AMap = (window as any).AMap;
    const position = [poi.location.lng, poi.location.lat];
    
    // 清除旧的POI标记
    if (poiMarkerRef.current) {
      mapInstanceRef.current.remove(poiMarkerRef.current);
    }
    
    // 保存选中的POI
    setSelectedPoi(poi);
    
    // 创建新的POI标记（蓝色，区别于数据点）
    const poiContent = `
      <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
        <div style="
          padding: 3px 8px;
          background-color: #3b82f6;
          border: 1px solid #2563eb;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
          color: white;
          white-space: nowrap;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          margin-bottom: 4px;
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
        ">${poi.name}</div>
        <div style="
          width: 14px; height: 14px; 
          background-color: #3b82f6; 
          border: 2px solid white; 
          border-radius: 50%; 
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        "></div>
      </div>
    `;
    
    const marker = new AMap.Marker({
      position,
      content: poiContent,
      anchor: 'bottom-center',
      offset: new AMap.Pixel(0, 7),
      zIndex: 200,
    });
    
    mapInstanceRef.current.add(marker);
    poiMarkerRef.current = marker;
    
    // 定位到该位置
    mapInstanceRef.current.setZoomAndCenter(16, position);
    
    // 关闭下拉
    setShowPoiDropdown(false);
    setPoiKeyword(poi.name);
  }, []);

  // 清除POI标记
  const clearPoiMarker = useCallback(() => {
    if (poiMarkerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.remove(poiMarkerRef.current);
      poiMarkerRef.current = null;
    }
    setPoiKeyword('');
    setPoiResults([]);
    setShowPoiDropdown(false);
  }, []);

  // 处理从列表模式跳转过来的手动定位请求
  useEffect(() => {
    if (locateTarget && isLoaded) {
      // 保存待定位的记录ID
      pendingLocateIdRef.current = locateTarget.id;
      // 切换到POI搜索模式
      setSearchMode('poi');
      // 设置搜索关键词
      setPoiKeyword(locateTarget.keyword);
      // 自动触发搜索
      setTimeout(() => {
        searchPoi(locateTarget.keyword);
      }, 100);
      // 清除目标，避免重复触发
      setLocateTarget(null);
    }
  }, [locateTarget, isLoaded, searchPoi, setLocateTarget]);

  // 采用选中的POI定位到现有记录
  const applyPoiToRecord = useCallback(() => {
    if (!selectedPoi || !pendingLocateIdRef.current) return;
    
    actions.updateRecordCoordinates(
      pendingLocateIdRef.current,
      selectedPoi.location.lng,
      selectedPoi.location.lat,
      selectedPoi.address || selectedPoi.name
    );
    
    // 清理状态
    clearPoiMarker();
    setSelectedPoi(null);
    pendingLocateIdRef.current = null;
  }, [selectedPoi, actions, clearPoiMarker]);

  // 将选中的POI添加为新点位
  const addPoiAsNewRecord = useCallback(() => {
    if (!selectedPoi) return;
    
    // 创建新记录
    const newRecord = {
      id: `manual-${Date.now()}`,
      originalIndex: records.length,
      mainKeyword: selectedPoi.name,
      subKeyword: selectedPoi.address || '',
    };
    
    actions.addRecord(newRecord);
    
    // 更新新记录的坐标
    setTimeout(() => {
      actions.updateRecordCoordinates(
        newRecord.id,
        selectedPoi.location.lng,
        selectedPoi.location.lat,
        selectedPoi.address || selectedPoi.name
      );
    }, 50);
    
    // 清理状态
    clearPoiMarker();
    setSelectedPoi(null);
    pendingLocateIdRef.current = null;
  }, [selectedPoi, records.length, actions, clearPoiMarker]);

  // 取消POI选择
  const cancelPoiSelection = useCallback(() => {
    clearPoiMarker();
    setSelectedPoi(null);
    pendingLocateIdRef.current = null;
  }, [clearPoiMarker]);

  // 触发重新定位（从InfoWindow调用）
  const triggerRelocate = useCallback((id: string, keyword: string) => {
    // 关闭InfoWindow
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }
    // 保存待定位的记录ID
    pendingLocateIdRef.current = id;
    // 切换到POI搜索模式
    setSearchMode('poi');
    // 设置搜索关键词并搜索
    setPoiKeyword(keyword);
    setTimeout(() => searchPoi(keyword), 100);
  }, [searchPoi]);

  // 启动拖拽移动模式
  const startDragMove = useCallback((point: ProcessedRecord & { lng: number; lat: number }) => {
    if (!mapInstanceRef.current || !(window as any).AMap) return;
    
    const AMap = (window as any).AMap;
    
    // 关闭InfoWindow
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }
    
    // 清除旧的拖拽标记
    if (draggableMarkerRef.current) {
      mapInstanceRef.current.remove(draggableMarkerRef.current);
    }
    
    // 保存当前编辑的点位（使用state触发UI更新）
    setEditingPoint(point);
    
    // 创建可拖拽的标记（红色，醒目）
    const dragContent = `
      <div style="display: flex; flex-direction: column; align-items: center;">
        <div style="
          padding: 3px 8px;
          background-color: #ef4444;
          border: 1px solid #dc2626;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
          color: white;
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(239,68,68,0.4);
          margin-bottom: 4px;
        ">拖动到新位置</div>
        <div style="
          width: 16px; height: 16px; 
          background-color: #ef4444; 
          border: 3px solid white; 
          border-radius: 50%; 
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          cursor: move;
        "></div>
      </div>
    `;
    
    const marker = new AMap.Marker({
      position: [point.lng, point.lat],
      content: dragContent,
      anchor: 'bottom-center',
      offset: new AMap.Pixel(0, 8),
      draggable: true,
      zIndex: 300,
    });
    
    mapInstanceRef.current.add(marker);
    draggableMarkerRef.current = marker;
  }, []);

  // 确认拖拽位置
  const confirmDragPosition = useCallback(() => {
    if (!draggableMarkerRef.current || !editingPoint) return;
    
    const position = draggableMarkerRef.current.getPosition();
    const lng = position.lng;
    const lat = position.lat;
    
    // 更新记录坐标
    actions.updateRecordCoordinates(
      editingPoint.id,
      lng,
      lat
    );
    
    // 清理
    if (mapInstanceRef.current && draggableMarkerRef.current) {
      mapInstanceRef.current.remove(draggableMarkerRef.current);
    }
    draggableMarkerRef.current = null;
    setEditingPoint(null);
  }, [actions, editingPoint]);

  // 取消拖拽
  const cancelDragMove = useCallback(() => {
    if (mapInstanceRef.current && draggableMarkerRef.current) {
      mapInstanceRef.current.remove(draggableMarkerRef.current);
    }
    draggableMarkerRef.current = null;
    setEditingPoint(null);
  }, []);

  // 将函数暴露到window对象供InfoWindow调用
  useEffect(() => {
    (window as any).__mapRelocate = triggerRelocate;
    (window as any).__mapStartDrag = startDragMove;
    return () => {
      delete (window as any).__mapRelocate;
      delete (window as any).__mapStartDrag;
    };
  }, [triggerRelocate, startDragMove]);

  // 点击处理 - 存储点位数据供拖拽使用
  const handleMarkerClick = useCallback((point: ProcessedRecord & { lng: number; lat: number }, position: [number, number]) => {
    if (!mapInstanceRef.current || !infoWindowRef.current) return;
    
    // 存储当前点击的点位数据到window对象
    (window as any).__currentClickedPoint = point;
    
    const isWarning = isPointWarning(point);
    const infoContent = `
      <div class="text-sm font-sans" style="min-width: 220px;">
        <div style="font-weight: bold; color: #1e293b; margin-bottom: 4px;">${point.mainKeyword}</div>
        <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">${point.formattedAddress || '无地址'}</div>
        <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 10px;">
          <span style="padding: 2px 6px; border-radius: 4px; background: #f1f5f9; color: #475569; font-size: 10px;">${point.matchLevel || '未知精度'}</span>
          ${isWarning ? '<span style="padding: 2px 6px; border-radius: 4px; background: #fef3c7; color: #92400e; font-size: 10px;">疑似异常</span>' : ''}
        </div>
        <div style="display: flex; gap: 6px;">
          <button 
            onclick="window.__mapStartDrag && window.__mapStartDrag(window.__currentClickedPoint)"
            style="
              flex: 1;
              padding: 6px 8px;
              background: #f97316;
              color: white;
              border: none;
              border-radius: 6px;
              font-size: 11px;
              font-weight: 500;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 3px;
            "
            onmouseover="this.style.background='#ea580c'"
            onmouseout="this.style.background='#f97316'"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>
            </svg>
            移动
          </button>
          <button 
            onclick="window.__mapRelocate && window.__mapRelocate('${point.id}', '${point.mainKeyword.replace(/'/g, "\\'")}')"
            style="
              flex: 1;
              padding: 6px 8px;
              background: #3b82f6;
              color: white;
              border: none;
              border-radius: 6px;
              font-size: 11px;
              font-weight: 500;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 3px;
            "
            onmouseover="this.style.background='#2563eb'"
            onmouseout="this.style.background='#3b82f6'"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35"/>
            </svg>
            搜索
          </button>
        </div>
      </div>
    `;
    infoWindowRef.current.setContent(infoContent);
    infoWindowRef.current.open(mapInstanceRef.current, position);
  }, [isPointWarning]);

  // 全屏切换
  const toggleFullscreen = useCallback(() => {
    if (!containerWrapperRef.current) return;
    
    if (!isFullscreen) {
      if (containerWrapperRef.current.requestFullscreen) {
        containerWrapperRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }, [isFullscreen]);

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 图层切换
  const toggleLayer = useCallback(() => {
    if (!mapInstanceRef.current || !(window as any).AMap) return;
    const AMap = (window as any).AMap;
    
    if (layerType === 'standard') {
      // 切换到卫星图
      if (!satelliteLayerRef.current) {
        satelliteLayerRef.current = new AMap.TileLayer.Satellite();
      }
      mapInstanceRef.current.add(satelliteLayerRef.current);
      setLayerType('satellite');
    } else {
      // 切换回标准图
      if (satelliteLayerRef.current) {
        mapInstanceRef.current.remove(satelliteLayerRef.current);
      }
      setLayerType('standard');
    }
  }, [layerType]);

  // 定位到搜索结果
  const locateToFiltered = useCallback(() => {
    if (!mapInstanceRef.current || filteredPoints.length === 0) return;
    try {
      mapInstanceRef.current.setFitView(markersRef.current, false, [60, 60, 60, 60]);
    } catch (e) {
      console.warn("Fit view failed", e);
    }
  }, [filteredPoints.length]);

  // 初始化地图
  useEffect(() => {
    if (!config.amapJsKey) {
      setError("请在设置中配置 [高德 JS API Key] 以启用地图预览。");
      return;
    }
    if (!config.amapSecurityCode) {
      setError("请在设置中配置 [安全密钥] 以启用地图预览。");
      return;
    }
    setError(null);

    (window as any)._AMapSecurityConfig = {
      securityJsCode: config.amapSecurityCode,
    };

    let isUnmounted = false;

    const initMap = (AMap: any) => {
      if (isUnmounted || !mapContainerRef.current) return;
      
      const containerId = mapContainerRef.current.id || 'map-container';
      if (cachedMapInstance && cachedContainerId === containerId) {
        mapInstanceRef.current = cachedMapInstance;
        try {
          cachedMapInstance.setContainer(mapContainerRef.current);
        } catch (e) {
          cachedMapInstance = null;
        }
      }
      
      if (mapInstanceRef.current) {
        setIsLoaded(true);
        return;
      }

      try {
        const map = new AMap.Map(mapContainerRef.current, {
          viewMode: "2D",
          zoom: 11,
          center: [116.397428, 39.90923],
          resizeEnable: true,
        });

        map.addControl(new AMap.Scale());
        map.addControl(new AMap.ToolBar({ position: 'RT' }));

        infoWindowRef.current = new AMap.InfoWindow({
          offset: new AMap.Pixel(0, -30),
          closeWhenClickMap: true
        });

        mapInstanceRef.current = map;
        cachedMapInstance = map;
        cachedContainerId = containerId;
        setIsLoaded(true);
      } catch (initError: any) {
        console.error("AMap Init Error:", initError);
        if (!isUnmounted) setError(`地图初始化失败: ${initError.message}`);
      }
    };

    if ((window as any).AMap?.Map) {
      initMap((window as any).AMap);
      return;
    }

    const loaderFn = (AMapLoaderModule as any).load || (AMapLoaderModule as any).default?.load || (AMapLoaderModule as any).default;
    if (typeof loaderFn !== 'function') {
      setError("无法加载地图模块");
      return;
    }

    if (!loaderPromise) {
      loaderPromise = loaderFn({
        key: config.amapJsKey,
        version: "2.0",
        plugins: ["AMap.Scale", "AMap.ToolBar", "AMap.MarkerCluster", "AMap.PlaceSearch"],
      });
    }

    loaderPromise!
      .then((AMap: any) => initMap(AMap))
      .catch((e: any) => {
        console.error("Map Load Error:", e);
        if (!isUnmounted) {
          const msg = e?.message === 'Script error.' 
            ? '地图脚本加载被拦截，请检查网络或广告拦截插件' 
            : (e?.message || '未知错误');
          setError(`加载失败: ${msg}`);
          loaderPromise = null;
        }
      });

    return () => {
      isUnmounted = true;
      if (clusterRef.current) {
        clusterRef.current.setMap(null);
        clusterRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.clearMap();
      }
      if (infoWindowRef.current) {
        infoWindowRef.current.close();
      }
      if (satelliteLayerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.remove(satelliteLayerRef.current);
      }
      markersRef.current = [];
      mapInstanceRef.current = null;
      setIsLoaded(false);
    };
  }, [config.amapJsKey, config.amapSecurityCode]);

  // 渲染标记
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded || !(window as any).AMap) return;
    
    const map = mapInstanceRef.current;
    const AMap = (window as any).AMap;
    
    if (clusterRef.current) {
      clusterRef.current.setMap(null);
      clusterRef.current = null;
    }
    map.clearMap();
    markersRef.current = [];

    // 重新添加卫星图层（如果启用）
    if (layerType === 'satellite' && satelliteLayerRef.current) {
      map.add(satelliteLayerRef.current);
    }

    if (filteredPoints.length === 0) return;

    if (!infoWindowRef.current) {
      infoWindowRef.current = new AMap.InfoWindow({
        offset: new AMap.Pixel(0, -30),
        closeWhenClickMap: true
      });
    }

    const markers: any[] = [];
    const shouldUseCluster = useCluster && filteredPoints.length >= CLUSTER_THRESHOLD;

    filteredPoints.forEach((point) => {
      const isWarning = isPointWarning(point);
      const position: [number, number] = [point.lng, point.lat];
      const labelText = point.mainKeyword.length > 8 
        ? point.mainKeyword.substring(0, 8) + '...' 
        : point.mainKeyword;
      
      let marker: any;
      
      // 圆点样式（统一）- 圆点中心始终对准坐标位置
      const circleStyle = `
        width: 12px; height: 12px; 
        background-color: ${isWarning ? '#f59e0b' : '#10b981'}; 
        border: 2px solid white; 
        border-radius: 50%; 
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        cursor: pointer;
      `;

      if (shouldUseCluster || !showLabels) {
        // 简单圆点（无标签）- 圆点中心对准坐标
        const circleContent = `<div style="${circleStyle}"></div>`;
        marker = new AMap.Marker({
          position,
          content: circleContent,
          anchor: 'center',
          extData: { id: point.id, point }
        });
      } else {
        // 带标签：标签在圆点上方，圆点中心仍对准坐标
        const content = `
          <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
            <div style="
              padding: 2px 6px;
              background-color: ${isWarning ? '#fef3c7' : '#d1fae5'};
              border: 1px solid ${isWarning ? '#f59e0b' : '#10b981'};
              border-radius: 4px;
              font-size: 11px;
              font-weight: 500;
              color: ${isWarning ? '#92400e' : '#065f46'};
              white-space: nowrap;
              box-shadow: 0 1px 3px rgba(0,0,0,0.2);
              margin-bottom: 4px;
            ">${labelText}</div>
            <div style="${circleStyle}"></div>
          </div>
        `;
        // 使用 anchor: 'bottom-center' 让整个容器底部中心对准坐标
        // 但圆点在容器底部，所以圆点中心会偏上6px（圆点半径）
        // 需要用 offset 向下移动6px来补偿
        marker = new AMap.Marker({
          position,
          content,
          anchor: 'bottom-center',
          offset: new AMap.Pixel(0, 6), // 向下偏移圆点半径，使圆点中心对准坐标
          extData: { id: point.id, point }
        });
      }

      marker.on('click', () => handleMarkerClick(point, position));
      markers.push(marker);
    });

    markersRef.current = markers;

    if (shouldUseCluster && AMap.MarkerCluster) {
      const cluster = new AMap.MarkerCluster(map, markers, {
        gridSize: CLUSTER_GRID_SIZE,
        renderClusterMarker: (context: any) => {
          const count = context.count;
          const div = document.createElement('div');
          div.style.cssText = `
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            border-radius: 50%;
            color: white;
            font-size: 12px;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
            border: 2px solid white;
            cursor: pointer;
          `;
          const size = Math.min(50, Math.max(30, 20 + Math.log(count) * 8));
          div.style.width = size + 'px';
          div.style.height = size + 'px';
          div.innerHTML = count > 99 ? '99+' : String(count);
          context.marker.setContent(div);
          context.marker.setAnchor('center');
        }
      });
      clusterRef.current = cluster;
    } else {
      map.add(markers);
    }

    try {
      map.setFitView(markers, false, [60, 60, 60, 60]);
    } catch (e) {
      console.warn("Fit view failed", e);
    }
  }, [isLoaded, filteredPoints, useCluster, showLabels, handleMarkerClick, isPointWarning, layerType]);

  if (error) {
    return (
      <div className="w-full h-full min-h-[400px] bg-slate-50 flex flex-col items-center justify-center rounded-2xl border border-slate-200 p-8 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-4">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">地图加载遇到问题</h3>
        <p className="text-slate-600 max-w-md mb-6">{error}</p>
      </div>
    );
  }

  return (
    <div 
      ref={containerWrapperRef}
      className={`w-full h-full min-h-[400px] relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`}
    >
      {/* 顶部工具栏 */}
      {isLoaded && (allValidPoints.length > 0 || searchMode === 'poi') && (
        <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap gap-2 items-center">
          {/* 搜索模式切换 + 搜索框 */}
          <div className="flex-1 min-w-[280px] max-w-[400px] relative">
            <div className="flex bg-white/95 backdrop-blur-sm rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {/* 模式切换 */}
              <div className="flex border-r border-slate-200">
                <button
                  onClick={() => { setSearchMode('marker'); clearPoiMarker(); }}
                  title="搜索标注点"
                  className={`px-2 py-1.5 text-xs font-medium transition-colors ${searchMode === 'marker' ? 'bg-brand-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  📍
                </button>
                <button
                  onClick={() => { setSearchMode('poi'); setSearchKeyword(''); }}
                  title="搜索地点(POI)"
                  className={`px-2 py-1.5 text-xs font-medium transition-colors ${searchMode === 'poi' ? 'bg-blue-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  🔍
                </button>
              </div>
              
              {/* 搜索输入框 */}
              <div className="flex-1">
                {searchMode === 'marker' ? (
                  <>
                    <input
                      type="text"
                      placeholder="搜索标注点..."
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      className="w-full pl-3 pr-14 py-1.5 text-xs border-0 focus:ring-0 bg-transparent"
                    />
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                      {searchKeyword && filteredPoints.length > 0 && (
                        <button 
                          onClick={locateToFiltered}
                          title="定位到搜索结果"
                          className="p-1 text-blue-500 hover:text-blue-600"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          </svg>
                        </button>
                      )}
                      {searchKeyword && (
                        <button 
                          onClick={() => setSearchKeyword('')}
                          className="p-1 text-slate-400 hover:text-slate-600"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="搜索地点定位..."
                      value={poiKeyword}
                      onChange={(e) => setPoiKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && searchPoi(poiKeyword)}
                      onFocus={() => poiResults.length > 0 && setShowPoiDropdown(true)}
                      className="w-full pl-3 pr-16 py-1.5 text-xs border-0 focus:ring-0 bg-transparent"
                    />
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                      {poiKeyword && (
                        <button 
                          onClick={clearPoiMarker}
                          className="p-1 text-slate-400 hover:text-slate-600"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                      <button 
                        onClick={() => searchPoi(poiKeyword)}
                        disabled={isSearchingPoi}
                        className="px-2 py-0.5 text-[10px] bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                      >
                        {isSearchingPoi ? '...' : '搜索'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            
            {/* POI搜索结果下拉 - 放在外层relative容器内 */}
            {searchMode === 'poi' && showPoiDropdown && poiResults.length > 0 && (
              <div 
                className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-200 max-h-[250px] overflow-y-auto"
                style={{ zIndex: 9999 }}
              >
                {poiResults.map((poi, idx) => (
                  <button
                    key={poi.id || idx}
                    onClick={() => selectPoiResult(poi)}
                    className="w-full px-3 py-2 text-left hover:bg-blue-50 border-b border-slate-100 last:border-0"
                  >
                    <div className="text-xs font-medium text-slate-800 truncate">{poi.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">{poi.address || poi.cityname || ''}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 筛选按钮组 */}
          <div className="flex bg-white/95 backdrop-blur-sm rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${filterType === 'all' ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              全部 ({stats.total})
            </button>
            <button
              onClick={() => setFilterType('normal')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-slate-200 ${filterType === 'normal' ? 'bg-emerald-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              正常 ({stats.normal})
            </button>
            <button
              onClick={() => setFilterType('warning')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-slate-200 ${filterType === 'warning' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              异常 ({stats.warning})
            </button>
          </div>
        </div>
      )}

      {/* 右下角工具按钮 - 避免与地图控件重叠 */}
      {isLoaded && (
        <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
          {/* 图层切换 */}
          <button
            onClick={toggleLayer}
            title={layerType === 'standard' ? '切换卫星图' : '切换标准图'}
            className={`p-2 rounded-lg shadow-lg border transition-colors ${layerType === 'satellite' ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          
          {/* 全屏 */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? '退出全屏' : '全屏显示'}
            className="p-2 bg-white rounded-lg shadow-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {isFullscreen ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            )}
          </button>
        </div>
      )}

      {/* 地图容器 */}
      <div ref={mapContainerRef} className="w-full h-full" />
      
      {/* 加载状态 */}
      {!isLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/80 backdrop-blur-sm">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-600">正在加载地图...</p>
        </div>
      )}
      
      {/* 无数据提示 - POI搜索模式下不遮挡 */}
      {isLoaded && allValidPoints.length === 0 && !selectedPoi && searchMode !== 'poi' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/60 backdrop-blur-sm pointer-events-none">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-sm text-slate-500">暂无可显示的坐标点</p>
          <button 
            onClick={() => setSearchMode('poi')}
            className="mt-2 text-xs text-blue-600 hover:underline pointer-events-auto"
          >
            使用POI搜索添加点位
          </button>
        </div>
      )}

      {/* 筛选结果为空提示 */}
      {isLoaded && allValidPoints.length > 0 && filteredPoints.length === 0 && !editingPoint && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/60 backdrop-blur-sm pointer-events-none">
          <p className="text-sm text-slate-500">没有符合条件的点位</p>
          <button 
            onClick={() => { setFilterType('all'); setSearchKeyword(''); }}
            className="mt-2 text-xs text-brand-600 hover:underline pointer-events-auto"
          >
            清除筛选
          </button>
        </div>
      )}

      {/* 拖拽移动操作面板 */}
      {editingPoint && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-2xl border border-orange-200 p-4 z-20 min-w-[280px]">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 flex-shrink-0 animate-pulse">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-800 truncate">{editingPoint.mainKeyword}</div>
              <div className="text-xs text-slate-500">拖动红色标记到新位置</div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={confirmDragPosition}
              className="flex-1 px-3 py-2 bg-orange-500 text-white text-xs font-medium rounded-lg hover:bg-orange-600 transition-colors"
            >
              ✓ 确认位置
            </button>
            <button
              onClick={cancelDragMove}
              className="flex-1 px-3 py-2 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-200 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}
      
      {/* POI操作面板 - 选中POI后显示 */}
      {selectedPoi && !editingPoint && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 z-20 min-w-[280px]">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-800 truncate">{selectedPoi.name}</div>
              <div className="text-xs text-slate-500 truncate">{selectedPoi.address || selectedPoi.cityname || ''}</div>
              <div className="text-[10px] text-slate-400 mt-1">
                {selectedPoi.location?.lng?.toFixed(6)}, {selectedPoi.location?.lat?.toFixed(6)}
              </div>
            </div>
            <button 
              onClick={cancelPoiSelection}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="flex gap-2">
            {pendingLocateIdRef.current && (
              <button
                onClick={applyPoiToRecord}
                className="flex-1 px-3 py-2 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors"
              >
                ✓ 采用此定位
              </button>
            )}
            <button
              onClick={addPoiAsNewRecord}
              className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                pendingLocateIdRef.current 
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' 
                  : 'bg-emerald-500 text-white hover:bg-emerald-600'
              }`}
            >
              + 添加为新点位
            </button>
          </div>
        </div>
      )}

      {/* 底部图例和控制 */}
      {isLoaded && (allValidPoints.length > 0 || searchMode === 'poi') && (
        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 text-xs">
          <div className="font-medium text-slate-700 mb-2">显示控制</div>
          
          {/* 标签开关 */}
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input 
              type="checkbox" 
              checked={showLabels} 
              onChange={(e) => setShowLabels(e.target.checked)}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-slate-600">显示标签</span>
          </label>
          
          {/* 聚合开关 */}
          {filteredPoints.length >= CLUSTER_THRESHOLD && (
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input 
                type="checkbox" 
                checked={useCluster} 
                onChange={(e) => setUseCluster(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-slate-600">点聚合</span>
            </label>
          )}

          <div className="pt-2 border-t border-slate-200 mt-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow" />
              <span className="text-slate-600">正常</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500 border-2 border-white shadow" />
              <span className="text-slate-600">异常</span>
            </div>
          </div>
          
          {/* 当前显示数量 */}
          <div className="pt-2 border-t border-slate-200 mt-2 text-slate-500">
            显示 {filteredPoints.length} / {allValidPoints.length} 点
          </div>
        </div>
      )}
    </div>
  );
};
