import type { Sandbox } from '@cloudflare/sandbox';
import { MOLTBOT_PORT } from '../config';
import { waitForProcess } from './utils';

export interface GatewayModel {
  id: string;
  name?: string;
  provider?: string;
  contextWindow?: number;
}

type ConfigModelEntry = {
  alias?: string;
};

type MoltbotConfig = {
  agents?: {
    defaults?: {
      model?: {
        primary?: string;
        manual?: boolean;
      };
      models?: Record<string, ConfigModelEntry>;
    };
  };
  models?: {
    providers?: Record<string, { models?: Array<{ id?: string; name?: string; contextWindow?: number }> }>;
  };
};

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
    const config = JSON.parse(raw) as MoltbotConfig;
    return config?.agents?.defaults?.model?.primary || null;
  } catch {
    return null;
  }
}

export async function listConfigModels(sandbox: Sandbox): Promise<GatewayModel[]> {
  const proc = await sandbox.startProcess('cat /root/.clawdbot/clawdbot.json 2>/dev/null || echo ""');
  await waitForProcess(proc, 5000);
  const logs = await proc.getLogs();
  const raw = logs.stdout?.trim();
  if (!raw) return [];

  try {
    const config = JSON.parse(raw) as MoltbotConfig;
    const models: GatewayModel[] = [];

    if (config.agents?.defaults?.models) {
      for (const [id, entry] of Object.entries(config.agents.defaults.models)) {
        models.push({ id, name: entry?.alias });
      }
    }

    if (models.length > 0) return models;

    const providers = config.models?.providers || {};
    for (const [provider, providerConfig] of Object.entries(providers)) {
      const providerModels = providerConfig.models || [];
      for (const model of providerModels) {
        if (model?.id) {
          models.push({ id: model.id, name: model.name, provider, contextWindow: model.contextWindow });
        }
      }
    }

    return models;
  } catch {
    return [];
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
config.agents.defaults.model.manual = true;

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