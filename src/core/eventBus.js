'use strict';

class EventBus {
  constructor() {
    this.listeners = {};
  }

  on(event, handler) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
    return this;
  }

  off(event, handler) {
    if (!this.listeners[event]) return this;
    this.listeners[event] = this.listeners[event].filter(h => h !== handler);
    return this;
  }

  once(event, handler) {
    const wrapped = (...args) => {
      this.off(event, wrapped);
      handler(...args);
    };
    return this.on(event, wrapped);
  }

  emit(event, ...args) {
    if (!this.listeners[event]) return false;
    // Copy the array to avoid modification issues during execution
    const handlers = [...this.listeners[event]];
    handlers.forEach(handler => {
      try {
        handler(...args);
      } catch (err) {
        console.error(`Error in event listener for "${event}":`, err);
      }
    });
    return true;
  }
}

// Export singleton instance and the class itself
const instance = new EventBus();
instance.EventBus = EventBus;
module.exports = instance;
