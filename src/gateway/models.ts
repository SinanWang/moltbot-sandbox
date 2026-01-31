import type { Sandbox } from '@cloudflare/sandbox';
import { MOLTBOT_PORT } from '../config';
import { waitForProcess } from './utils';

export interface GatewayModel {
  id: string;
  name?: string;
  provider?: string;
  contextWindow?: number;
}

function extractModels(payload: unknown): GatewayModel[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is GatewayModel => typeof item?.id === 'string');
  }
  if (payload && typeof payload === 'object' && Array.isArray((payload as { models?: unknown }).models)) {
    return (payload as { models: unknown[] }).models.filter(
      (item): item is GatewayModel => typeof (item as GatewayModel)?.id === 'string'
    );
  }
  return [];
}

export async function fetchGatewayModels(sandbox: Sandbox): Promise<GatewayModel[]> {
  const url = `http://localhost:${MOLTBOT_PORT}/models`;
  const response = await sandbox.containerFetch(new Request(url), MOLTBOT_PORT);
  if (!response.ok) {
    throw new Error(`Gateway /models failed: ${response.status}`);
  }
  const data = await response.json();
  return extractModels(data);
}

export async function getCurrentDefaultModel(sandbox: Sandbox): Promise<string | null> {
  const proc = await sandbox.startProcess('cat /root/.clawdbot/clawdbot.json 2>/dev/null || echo ""');
  await waitForProcess(proc, 5000);
  const logs = await proc.getLogs();
  const raw = logs.stdout?.trim();
  if (!raw) return null;
  try {
    const config = JSON.parse(raw);
    return config?.agents?.defaults?.model?.primary || null;
  } catch {
    return null;
  }
}

export async function updateDefaultModel(sandbox: Sandbox, modelId: string): Promise<void> {
  const command = `node << 'EOFNODE'
const fs = require('fs');
const configPath = '/root/.clawdbot/clawdbot.json';
const modelId = ${JSON.stringify(modelId)};
let config = {};

try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  config = {};
}

config.agents = config.agents || {};
config.agents.defaults = config.agents.defaults || {};
config.agents.defaults.model = config.agents.defaults.model || {};
config.agents.defaults.models = config.agents.defaults.models || {};

if (!config.agents.defaults.models[modelId]) {
  const alias = modelId.split('/').pop() || modelId;
  config.agents.defaults.models[modelId] = { alias };
}

config.agents.defaults.model.primary = modelId;

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Default model updated:', modelId);
EOFNODE`;

  const proc = await sandbox.startProcess(command);
  await waitForProcess(proc, 10000);
  const logs = await proc.getLogs();
  if (proc.exitCode && proc.exitCode !== 0) {
    throw new Error(logs.stderr || 'Failed to update default model');
  }
}