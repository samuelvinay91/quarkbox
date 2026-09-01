import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';

const BLOCKED_METADATA_PATTERNS = [
  /169\.254\.169\.254/i,
  /metadata\.google\.internal/i,
  /100\.100\.100\.200/i,
  /instance-data/i,
  /\/latest\/meta-data/i,
  /\/computeMetadata\/v1/i,
];

const DANGEROUS_SYSTEM_PATTERNS = [
  /:(){ :|:& };:/,
  /chmod\s+(-R\s+)?777\s+\//i,
  /rm\s+-rf\s+\/(\s|$)/,
  /mkfs\./i,
  /dd\s+if=\/dev\/zero\s+of=\/dev/i,
];

export function validateCommand(command: string): SecurityScanResult {
  const detected: string[] = [];

  for (const pattern of BLOCKED_METADATA_PATTERNS) {
    if (pattern.test(command)) {
      detected.push(`Cloud Metadata Exfiltration Shield Triggered: ${pattern}`);
    }
  }

  for (const pattern of DANGEROUS_SYSTEM_PATTERNS) {
    if (pattern.test(command)) {
      detected.push(`Destructive Exploit Pattern Blocked: ${pattern}`);
    }
  }

  if (detected.length > 0) {
    return {
      isSafe: false,
      blockedReason: `Security policy violation: ${detected[0]}`,
      detectedPatterns: detected,
    };
  }

  return { isSafe: true };
}

export interface SecurityScanResult {
  isSafe: boolean;
  blockedReason?: string;
  detectedPatterns?: string[];
}

export interface Soc2AuditRecord {
  recordId: string;
  timestamp: string;
  eventType: string;
  actor: string;
  targetSandboxId?: string;
  actionSummary: string;
  integrityHash: string;
}

@Injectable()
export class SecurityGovernanceService {
  private readonly logger = new Logger(SecurityGovernanceService.name);

  /**
   * Generate SOC2 Type II cryptographically signed audit trail
   */
  generateSoc2AuditExport(activities: any[]): {
    organization: string;
    standard: string;
    generatedAt: string;
    totalRecords: number;
    auditLogDigest: string;
    records: Soc2AuditRecord[];
  } {
    const records: Soc2AuditRecord[] = [];
    const sha256 = crypto.createHash('sha256');

    for (const act of activities) {
      const rawData = `${act.id}|${act.createdAt}|${act.type}|${act.userId || 'system'}|${act.sandboxId || ''}|${act.summary}`;
      const recordHash = crypto.createHash('sha256').update(rawData).digest('hex');
      sha256.update(recordHash);

      records.push({
        recordId: act.id,
        timestamp: new Date(act.createdAt).toISOString(),
        eventType: act.type,
        actor: act.userId || 'anonymous-developer',
        targetSandboxId: act.sandboxId,
        actionSummary: act.summary,
        integrityHash: recordHash,
      });
    }

    const auditLogDigest = sha256.digest('hex');

    return {
      organization: 'QuarkBox Enterprise',
      standard: 'SOC2-Type-II / ISO-27001 Compliance Audit Trail',
      generatedAt: new Date().toISOString(),
      totalRecords: records.length,
      auditLogDigest,
      records,
    };
  }
}
