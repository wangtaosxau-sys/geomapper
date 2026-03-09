import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="bg-white p-8 rounded-xl shadow-lg max-w-lg w-full border border-rose-100">
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mb-6 mx-auto">
              <svg className="w-8 h-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-800 text-center mb-2">应用遇到意外错误</h1>
            <p className="text-slate-500 text-center text-sm mb-6">
              很抱歉，处理过程中发生了未知错误。这可能是由于数据格式异常或网络问题引起的。
            </p>
            
            <div className="bg-slate-100 p-4 rounded-lg text-xs font-mono text-slate-600 mb-6 overflow-auto max-h-40">
              {this.state.error?.message}
            </div>

            <div className="flex gap-3 justify-center">
                <button
                  onClick={() => window.location.reload()}
                  className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors font-medium"
                >
                  刷新页面
                </button>
                <button
                  onClick={() => {
                      localStorage.clear();
                      window.location.reload();
                  }}
                  className="px-6 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors font-medium"
                >
                  清除缓存并重试
                </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}