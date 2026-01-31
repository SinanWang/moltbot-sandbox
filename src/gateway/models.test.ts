import { describe, it, expect } from 'vitest';
import { createMockSandbox, createMockProcess } from '../test-utils';
import { getCurrentDefaultModel, listConfigModels, updateDefaultModel } from './models';

describe('gateway models helpers', () => {
  it('reads the current default model from config', async () => {
    const config = {
      agents: {
        defaults: {
          model: {
            primary: 'openai/deepseek-v3.2',
          },
        },
      },
    };

    const { sandbox, startProcessMock } = createMockSandbox();
    startProcessMock.mockResolvedValue(createMockProcess(JSON.stringify(config)));

    const model = await getCurrentDefaultModel(sandbox);
    expect(model).toBe('openai/deepseek-v3.2');
  });

  it('updates the default model in config', async () => {
    const { sandbox, startProcessMock } = createMockSandbox();
    startProcessMock.mockResolvedValue(createMockProcess('ok'));

    await updateDefaultModel(sandbox, 'openai/deepseek-v3.2');

    expect(startProcessMock).toHaveBeenCalledTimes(1);
    const [command] = startProcessMock.mock.calls[0];
    expect(command).toContain('deepseek-v3.2');
  });

  it('lists models from config allowlist', async () => {
    const config = {
      agents: {
        defaults: {
          models: {
            'openai/deepseek-v3.2': { alias: 'DeepSeek V3.2' },
            'openai/gpt-4o-mini': { alias: 'GPT-4o Mini' },
          },
        },
      },
    };

    const { sandbox, startProcessMock } = createMockSandbox();
    startProcessMock.mockResolvedValue(createMockProcess(JSON.stringify(config)));

    const models = await listConfigModels(sandbox);
    expect(models.map((m) => m.id)).toContain('openai/deepseek-v3.2');
    expect(models.map((m) => m.id)).toContain('openai/gpt-4o-mini');
  });
});
