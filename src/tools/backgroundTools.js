'use strict';

function buildBackgroundTools(taskManager) {
  return {
    start_background_command: {
      description: 'Start a command running in the background. Returns immediately with a task ID. Use this for servers, compilation, tests, or commands that run forever or take a long time.',
      params: {
        command: 'string (required, the terminal command)',
        args: 'array of strings (optional, arguments for command)'
      },
      handler: async ({ command, args }) => {
        if (!command) return { error: 'Missing required parameter: "command"' };
        try {
          return taskManager.startTask(command, args || []);
        } catch (e) {
          return { error: `Failed to start background task: ${e.message}` };
        }
      }
    },
    get_background_command_status: {
      description: 'Get the status, exit code, execution times, and output tails of a running or completed background task.',
      params: {
        task_id: 'string (required)'
      },
      handler: async ({ task_id }) => {
        if (!task_id) return { error: 'Missing required parameter: "task_id"' };
        const status = taskManager.getTaskStatus(task_id);
        if (!status) return { error: `No background task found with ID: ${task_id}` };
        return status;
      }
    },
    send_input_to_background_command: {
      description: 'Send input to stdin of a running background task.',
      params: {
        task_id: 'string (required)',
        input: 'string (required, text to send)'
      },
      handler: async ({ task_id, input }) => {
        if (!task_id || input === undefined) return { error: 'Missing required parameters: "task_id" or "input"' };
        return taskManager.sendInput(task_id, input);
      }
    },
    kill_background_command: {
      description: 'Terminate/kill a running background task process.',
      params: {
        task_id: 'string (required)'
      },
      handler: async ({ task_id }) => {
        if (!task_id) return { error: 'Missing required parameter: "task_id"' };
        return taskManager.killTask(task_id);
      }
    },
    list_background_commands: {
      description: 'List all background tasks started during this session.',
      params: {},
      handler: async () => {
        return { tasks: taskManager.listTasks() };
      }
    }
  };
}

module.exports = { buildBackgroundTools };
