'use strict';

/**
 * A lightweight Dependency Injection container to manage the lifecycle
 * and resolution of core platform services.
 */
class Container {
  constructor() {
    this.services = new Map();
  }

  /** Registers a service instance or a factory function. */
  register(name, service) {
    this.services.set(name, service);
  }

  /** Resolves a service by name. Throws if not found. */
  resolve(name) {
    if (!this.services.has(name)) {
      throw new Error(`Service ${name} not found in container`);
    }
    const service = this.services.get(name);
    // If the service is a function, treat it as a factory and execute it
    return typeof service === 'function' ? service() : service;
  }

  /** Returns all registered service names. */
  list() {
    return Array.from(this.services.keys());
  }

  /** Returns all registered services as an object. */
  getAll() {
    const result = {};
    for (const name of this.services.keys()) {
      result[name] = this.resolve(name);
    }
    return result;
  }
}

module.exports = new Container(); // Export as a singleton