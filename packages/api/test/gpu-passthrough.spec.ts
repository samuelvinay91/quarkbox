import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DockerProvider } from '../src/runtime/docker.provider';

describe('DockerProvider - GPU Passthrough', () => {
  let provider: DockerProvider;
  let mockDocker: any;

  beforeEach(() => {
    mockDocker = {
      createContainer: vi.fn().mockResolvedValue({
        start: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockResolvedValue({
          Id: 'container-gpu-123',
          NetworkSettings: { Networks: { bridge: { IPAddress: '172.17.0.5' } } },
        }),
      }),
      listContainers: vi.fn().mockResolvedValue([]),
      listImages: vi.fn().mockResolvedValue([]),
      pull: vi.fn(),
      getNetwork: vi.fn().mockReturnValue({ inspect: vi.fn().mockResolvedValue({}) }),
    };

    provider = new DockerProvider();
    (provider as any).docker = mockDocker;
    provider.pullImage = vi.fn().mockResolvedValue(undefined);
  });

  it('configures NVIDIA DeviceRequests when gpu is true', async () => {
    await provider.create({
      name: 'pytorch-gpu-sandbox',
      image: 'pytorch/pytorch:latest',
      cpuLimit: 4,
      memoryLimit: '8g',
      gpu: true,
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          DeviceRequests: [
            {
              Driver: 'nvidia',
              Count: -1,
              Capabilities: [['gpu']],
            },
          ],
        }),
      }),
    );
  });

  it('configures custom GPU count and capabilities when gpu is object', async () => {
    await provider.create({
      name: 'multi-gpu-sandbox',
      image: 'nvidia/cuda:12.0.0-base-ubuntu22.04',
      cpuLimit: 8,
      memoryLimit: '16g',
      gpu: { count: 2, capabilities: [['compute', 'utility']] },
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          DeviceRequests: [
            {
              Driver: 'nvidia',
              Count: 2,
              Capabilities: [['compute', 'utility']],
            },
          ],
        }),
      }),
    );
  });

  it('omits DeviceRequests when gpu is false or not provided', async () => {
    await provider.create({
      name: 'cpu-only-sandbox',
      image: 'alpine:latest',
      cpuLimit: 1,
      memoryLimit: '512m',
    });

    const callArgs = mockDocker.createContainer.mock.calls[0][0];
    expect(callArgs.HostConfig.DeviceRequests).toBeUndefined();
  });
});
