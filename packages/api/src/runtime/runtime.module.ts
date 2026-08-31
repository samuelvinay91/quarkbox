import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DockerProvider } from './docker.provider';
import { ContainerdProvider } from './containerd.provider';
import { FirecrackerProvider } from './firecracker.provider';
import { RUNTIME_PROVIDER } from './runtime.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    DockerProvider,
    ContainerdProvider,
    FirecrackerProvider,
    {
      provide: RUNTIME_PROVIDER,
      useExisting: DockerProvider, // Default runtime; easily swapped via DI
    },
  ],
  exports: [
    RUNTIME_PROVIDER,
    DockerProvider,
    ContainerdProvider,
    FirecrackerProvider,
  ],
})
export class RuntimeModule {}
