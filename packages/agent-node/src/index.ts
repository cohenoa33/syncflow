import { io, Socket } from 'socket.io-client';

export interface SyncFlowAgentOptions {
  dashboardUrl?: string;
  appName?: string;
}

export interface Event {
  type: 'express' | 'mongoose';
  operation: string;
  timestamp: number;
  duration?: number;
  data?: any;
  error?: string;
}

// Mongoose operations to track
const MONGOOSE_OPERATIONS = [
  'find', 
  'findOne', 
  'findOneAndUpdate', 
  'findOneAndDelete',
  'updateOne', 
  'updateMany', 
  'deleteOne', 
  'deleteMany', 
  'save'
] as const;

export class SyncFlowAgent {
  private socket: Socket | null = null;
  private dashboardUrl: string;
  private appName: string;
  private connected: boolean = false;

  constructor(options: SyncFlowAgentOptions = {}) {
    this.dashboardUrl = options.dashboardUrl || 'http://localhost:5050';
    this.appName = options.appName || 'unnamed-app';
  }

  /**
   * Connect to the SyncFlow dashboard
   */
  connect(): void {
    if (this.connected) {
      console.log('[SyncFlow] Already connected');
      return;
    }

    this.socket = io(this.dashboardUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.log('[SyncFlow] Connected to dashboard at', this.dashboardUrl);
      this.connected = true;
      this.socket?.emit('register', { appName: this.appName });
    });

    this.socket.on('disconnect', () => {
      console.log('[SyncFlow] Disconnected from dashboard');
      this.connected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('[SyncFlow] Connection error:', error.message);
    });
  }

  /**
   * Disconnect from the dashboard
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  /**
   * Emit an event to the dashboard
   */
  private emitEvent(event: Event): void {
    if (this.socket && this.connected) {
      this.socket.emit('event', { ...event, appName: this.appName });
    }
  }

  /**
   * Instrument an Express application
   */
  instrumentExpress(app: any): void {
    if (!app || typeof app.use !== 'function') {
      console.error('[SyncFlow] Invalid Express app provided');
      return;
    }

    // Add middleware to capture all requests
    app.use((req: any, res: any, next: any) => {
      const startTime = Date.now();
      const originalSend = res.send;
      const agent = this;

      res.send = function (this: any, data: any) {
        const duration = Date.now() - startTime;
        res.send = originalSend;
        
        const result = originalSend.call(this, data);

        // Emit event after response is sent
        const event: Event = {
          type: 'express',
          operation: `${req.method} ${req.path}`,
          timestamp: startTime,
          duration,
          data: {
            method: req.method,
            path: req.path,
            query: req.query,
            statusCode: res.statusCode,
          },
        };

        agent.emitEvent(event);
        return result;
      };

      next();
    });

    console.log('[SyncFlow] Express instrumentation enabled');
  }

  /**
   * Instrument Mongoose for database operations
   */
  instrumentMongoose(mongoose: any): void {
    if (!mongoose || typeof mongoose.plugin !== 'function') {
      console.error('[SyncFlow] Invalid Mongoose instance provided');
      return;
    }

    const agent = this;

    // Add a global plugin to track all operations
    mongoose.plugin((schema: any) => {
      MONGOOSE_OPERATIONS.forEach((op) => {
        schema.pre(op, function (this: any) {
          this._syncflowStartTime = Date.now();
        });

        schema.post(op, function (this: any, doc: any) {
          const duration = Date.now() - (this._syncflowStartTime || Date.now());
          const modelName = this.model?.modelName || this.constructor?.modelName || 'Unknown';
          
          const event: Event = {
            type: 'mongoose',
            operation: op,
            timestamp: Date.now(),
            duration,
            data: {
              modelName: modelName,
              operation: op,
            },
          };

          agent.emitEvent(event);
        });
      });
    });

    console.log('[SyncFlow] Mongoose instrumentation enabled');
  }
}

export default SyncFlowAgent;
