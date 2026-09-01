import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { SandboxService } from '../sandbox/sandbox.service';
import Dockerode from 'dockerode';
import { ConfigService } from '@nestjs/config';

interface TerminalSession {
  stream?: NodeJS.ReadWriteStream;
  exec?: Dockerode.Exec;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  },
  namespace: '/terminal',
})
export class TerminalGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TerminalGateway.name);
  private readonly docker: Dockerode;
  private readonly sessions = new Map<string, TerminalSession>();

  constructor(
    @Inject(SandboxService)
    private readonly sandboxService: SandboxService,
    private readonly jwtService: JwtService,
    private readonly config?: ConfigService,
  ) {
    const socketPath =
      this.config?.get<string>('DOCKER_SOCKET') ||
      process.env.DOCKER_SOCKET ||
      '/var/run/docker.sock';
    this.docker = new Dockerode({ socketPath });
  }

  handleConnection(client: Socket) {
    const token = (client.handshake.auth?.token as string) || (client.handshake.query?.token as string);
    if (!token) {
      client.emit('error', 'Authentication required');
      client.disconnect();
      return;
    }
    try {
      this.jwtService.verify(token);
    } catch {
      client.emit('error', 'Invalid token');
      client.disconnect();
      return;
    }
    this.logger.log(`Client connected to terminal gateway: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from terminal gateway: ${client.id}`);
    const session = this.sessions.get(client.id);
    if (session?.stream) {
      try {
        session.stream.end();
        (session.stream as any).destroy?.();
      } catch (e) {
        this.logger.warn(`Error closing stream for ${client.id}: ${e}`);
      }
    }
    this.sessions.delete(client.id);
  }

  @SubscribeMessage('attach')
  async handleAttach(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sandboxId: string; shell?: string },
  ) {
    try {
      const sandbox = await this.sandboxService.findOne(data.sandboxId);
      if (!sandbox.containerId) {
        client.emit('error', 'Sandbox container is not running');
        return;
      }

      const container = this.docker.getContainer(sandbox.containerId);
      const cmd = data.shell
        ? [data.shell, '-l']
        : ['sh', '-c', 'if [ -x /bin/bash ]; then exec /bin/bash -l; elif [ -x /bin/zsh ]; then exec /bin/zsh -l; else exec /bin/sh -l; fi'];

      // Create exec instance with TTY
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Env: ['TERM=xterm-256color', 'COLORTERM=truecolor'],
      });

      const stream = await exec.start({
        hijack: true,
        stdin: true,
        Tty: true,
      });

      this.sessions.set(client.id, { stream, exec });

      // Forward terminal output to socket
      stream.on('data', (chunk: Buffer) => {
        client.emit('output', chunk.toString('utf-8'));
      });

      stream.on('end', () => {
        client.emit('exit', 'Session terminated');
        this.sessions.delete(client.id);
      });

      stream.on('error', (err) => {
        client.emit('error', `Terminal stream error: ${err.message}`);
        this.sessions.delete(client.id);
      });

      client.emit('ready', { sandboxId: data.sandboxId });
    } catch (err: any) {
      this.logger.error(`Attach failed for ${client.id}: ${err.message}`);
      client.emit('error', `Failed to attach to terminal: ${err.message}`);
    }
  }

  @SubscribeMessage('input')
  handleInput(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { input: string },
  ) {
    const session = this.sessions.get(client.id);
    if (session?.stream) {
      session.stream.write(data.input);
    }
  }

  @SubscribeMessage('resize')
  async handleResize(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { cols: number; rows: number },
  ) {
    const session = this.sessions.get(client.id);
    if (session?.exec) {
      try {
        await session.exec.resize({ h: data.rows, w: data.cols });
      } catch {
        // Ignore resize error on closed streams
      }
    }
  }
}
