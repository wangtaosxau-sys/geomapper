
import React, { createContext, useContext, ReactNode } from 'react';
import { useGeocoding } from '../hooks/useGeocoding';
import { ProcessStatus, GeoConfig, ProcessedRecord, LogEntry, AnalyticsData, InputRecord, RetryStrategy } from '../types';

interface GeocodingContextType {
  config: GeoConfig;
  setConfig: React.Dispatch<React.SetStateAction<GeoConfig>>;
  records: ProcessedRecord[];
  status: ProcessStatus;
  logs: LogEntry[];
  progress: number;
  stats: AnalyticsData;
  actions: {
    importRecords: (newInputRecords: InputRecord[], appendMode: boolean, sourceName?: string) => void;
    addRecord: (record: InputRecord) => void;
    deleteRecords: (ids: string[]) => void;
    updateRecordField: (id: string, field: 'mainKeyword' | 'subKeyword', value: string) => void;
    updateRecordCoordinates: (id: string, lng: number, lat: number, address?: string) => void;
    retryFailedRecords: (strategy?: RetryStrategy) => void;
    retrySelectedRecords: (ids: string[], strategy?: RetryStrategy) => void;
    handleSingleRetry: (id: string) => Promise<void>;
    toggleProcessing: (targetIds?: string[]) => void;
  };
}

const GeocodingContext = createContext<GeocodingContextType | undefined>(undefined);

export const GeocodingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const geocodingData = useGeocoding();

  return (
    <GeocodingContext.Provider value={geocodingData}>
      {children}
    </GeocodingContext.Provider>
  );
};

export const useGeocodingStore = () => {
  const context = useContext(GeocodingContext);
  if (context === undefined) {
    throw new Error('useGeocodingStore must be used within a GeocodingProvider');
  }
  return context;
};
