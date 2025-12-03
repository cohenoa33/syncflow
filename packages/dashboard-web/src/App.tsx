import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

interface Event {
  id: string;
  type: 'express' | 'mongoose';
  operation: string;
  timestamp: number;
  duration?: number;
  data?: any;
  error?: string;
  appName: string;
  receivedAt: number;
}

interface Agent {
  appName: string;
  socketId: string;
}

function App() {
  const [events, setEvents] = useState<Event[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState<'all' | 'express' | 'mongoose'>('all');

  useEffect(() => {
    const socket = io('http://localhost:5050');
    
    socket.on('connect', () => {
      console.log('Connected to dashboard server');
      setConnected(true);
      socket.emit('getEvents');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from dashboard server');
      setConnected(false);
    });

    socket.on('event', (event: Event) => {
      setEvents((prev) => [event, ...prev].slice(0, 1000));
    });

    socket.on('eventHistory', (history: Event[]) => {
      setEvents(history.reverse());
    });

    socket.on('agents', (agentList: Agent[]) => {
      setAgents(agentList);
    });

    return () => {
      socket.close();
    };
  }, []);

  const filteredEvents = events.filter((event) => 
    filter === 'all' || event.type === filter
  );

  const getEventColor = (type: string) => {
    return type === 'express' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">SyncFlow Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">
                Real-time monitoring for MERN applications
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm text-gray-600">
                  {connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                {agents.length} agent{agents.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Connected Agents */}
        {agents.length > 0 && (
          <div className="bg-white rounded-lg shadow mb-6 p-4">
            <h2 className="text-lg font-semibold mb-3">Connected Applications</h2>
            <div className="flex flex-wrap gap-2">
              {agents.map((agent) => (
                <span
                  key={agent.socketId}
                  className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium"
                >
                  {agent.appName}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Events ({events.length})
            </button>
            <button
              onClick={() => setFilter('express')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'express'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Express ({events.filter(e => e.type === 'express').length})
            </button>
            <button
              onClick={() => setFilter('mongoose')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'mongoose'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Mongoose ({events.filter(e => e.type === 'mongoose').length})
            </button>
            <button
              onClick={() => setEvents([])}
              className="ml-auto px-4 py-2 rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Events List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Live Events</h2>
          </div>
          <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
            {filteredEvents.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="text-lg font-medium mb-2">No events yet</p>
                <p className="text-sm">
                  Start your instrumented application to see events here
                </p>
              </div>
            ) : (
              filteredEvents.map((event) => (
                <div key={event.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getEventColor(event.type)}`}>
                          {event.type}
                        </span>
                        <span className="text-xs text-gray-500">{event.appName}</span>
                        {event.duration && (
                          <span className="text-xs text-gray-500">
                            {event.duration}ms
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-sm text-gray-900 mb-2">
                        {event.operation}
                      </p>
                      {event.data && (
                        <pre className="text-xs text-gray-600 bg-gray-50 p-2 rounded overflow-x-auto">
                          {JSON.stringify(event.data, null, 2)}
                        </pre>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 whitespace-nowrap">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
