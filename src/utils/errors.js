'use strict';

class AgentError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ProtocolError extends AgentError {
  // Errors related to LLM response formatting or protocol violations
}

class NetworkError extends AgentError {
  // Errors related to API connectivity or timeouts
}

class ToolError extends AgentError {
  // Errors occurring during the execution of a specific tool
}

module.exports = {
  AgentError,
  ProtocolError,
  NetworkError,
  ToolError
};