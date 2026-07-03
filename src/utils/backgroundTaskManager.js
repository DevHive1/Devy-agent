'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class BackgroundTaskManager {
  constructor({ logDir } = {}) {
    this.logDir = logDir || path.resolve(process.cwd(), '.devy-agent', 'tasks');
    const fsRef = require('fs');
    fsRef.mkdirSync(this.logDir, { recursive: true });
    this.tasks = new Map(); // id -> { process, command, stdout, stderr, status, exitCode, startTime, endTime }
  }

  startTask(command, args = [], cwd = process.cwd()) {
    const taskId = 'bg-' + Math.random().toString(36).substring(2, 10);
    const logPath = `${this.logDir}/${taskId}.log`;
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });

    // In a termux/linux shell, we can run shell commands
    const child = spawn(command, args, {
      cwd,
      shell: true,
      env: { ...process.env, PAGER: 'cat' }
    });

    const taskInfo = {
      id: taskId,
      command: `${command} ${args.join(' ')}`.trim(),
      status: 'running',
      exitCode: null,
      startTime: new Date().toISOString(),
      endTime: null,
      logPath,
      stdoutTail: '',
      stderrTail: '',
      process: child
    };

    this.tasks.set(taskId, taskInfo);

    child.stdout.on('data', (data) => {
      const text = data.toString();
      logStream.write(text);
      taskInfo.stdoutTail = (taskInfo.stdoutTail + text).slice(-4000);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      logStream.write(text);
      taskInfo.stderrTail = (taskInfo.stderrTail + text).slice(-4000);
    });

    child.on('close', (code) => {
      taskInfo.status = 'completed';
      taskInfo.exitCode = code;
      taskInfo.endTime = new Date().toISOString();
      logStream.end();
    });

    child.on('error', (err) => {
      taskInfo.status = 'failed';
      taskInfo.exitCode = -1;
      taskInfo.endTime = new Date().toISOString();
      logStream.write(`\nError spawning process: ${err.message}\n`);
      logStream.end();
    });

    return { taskId, command: taskInfo.command, status: taskInfo.status };
  }

  sendInput(taskId, input) {
    const task = this.tasks.get(taskId);
    if (!task) return { error: 'Task not found' };
    if (task.status !== 'running') return { error: 'Task is not running' };
    try {
      task.process.stdin.write(input + '\n');
      return { success: true };
    } catch (e) {
      return { error: `Failed to write input: ${e.message}` };
    }
  }

  killTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return { error: 'Task not found' };
    if (task.status !== 'running') return { error: 'Task is not running' };
    try {
      task.process.kill();
      task.status = 'killed';
      task.endTime = new Date().toISOString();
      return { success: true };
    } catch (e) {
      return { error: `Failed to kill task: ${e.message}` };
    }
  }

  getTaskStatus(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    return {
      id: task.id,
      command: task.command,
      status: task.status,
      exitCode: task.exitCode,
      startTime: task.startTime,
      endTime: task.endTime,
      logPath: task.logPath,
      stdout: task.stdoutTail,
      stderr: task.stderrTail
    };
  }

  listTasks() {
    return Array.from(this.tasks.values()).map(t => ({
      id: t.id,
      command: t.command,
      status: t.status,
      exitCode: t.exitCode,
      startTime: t.startTime
    }));
  }
}

module.exports = { BackgroundTaskManager };
