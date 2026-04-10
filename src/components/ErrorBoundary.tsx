import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
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

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = "An unexpected error occurred.";
      let isFirestoreError = false;

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error && parsed.operationType) {
            isFirestoreError = true;
            errorMessage = `Database Error: ${parsed.error} during ${parsed.operationType} on ${parsed.path || 'unknown path'}`;
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full card space-y-6 text-center border-2 border-danger/20">
            <div className="h-16 w-16 bg-danger/10 rounded-full flex items-center justify-center mx-auto text-danger">
              <AlertCircle className="h-8 w-8" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-primary tracking-tight">Something went wrong</h2>
              <p className="text-secondary font-medium text-sm leading-relaxed">
                {errorMessage}
              </p>
            </div>

            {isFirestoreError && (
              <div className="bg-accent/5 border border-accent/10 rounded-xl p-4 text-left">
                <p className="text-[10px] font-bold uppercase text-accent tracking-widest mb-1">Technical Details</p>
                <p className="text-[10px] text-secondary font-mono break-all">
                  {this.state.error?.message}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 pt-4">
              <button
                onClick={this.handleGoHome}
                className="btn-secondary flex items-center justify-center space-x-2"
              >
                <Home className="h-4 w-4" />
                <span>Go Home</span>
              </button>
              <button
                onClick={this.handleReset}
                className="btn-primary flex items-center justify-center space-x-2"
              >
                <RefreshCcw className="h-4 w-4" />
                <span>Retry</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
