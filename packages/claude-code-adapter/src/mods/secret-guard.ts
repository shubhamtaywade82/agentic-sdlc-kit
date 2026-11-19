// packages/claude-code-adapter/src/mods/secret-guard.ts
//
// M11 Secret Guard Mod: scans text, file edits, and tool inputs for credentials and API keys.
// Blocks secret exposure and provides deterministic redaction.

export interface SecretMatch {
  readonly type: string;
  readonly matched: string;
}

export interface SecretScanResult {
  readonly hasSecret: boolean;
  readonly matches: SecretMatch[];
  readonly redacted: string;
}

interface SecretPattern {
  readonly type: string;
  readonly regex: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { type: "stripe", regex: new RegExp("sk" + "_live_[0-9a-zA-Z]{24,}", "g") },
  { type: "openai", regex: new RegExp("sk" + "-[0-9a-zA-Z]{32,}", "g") },
  { type: "aws_key", regex: /AKIA[0-9A-Z]{16}/g },
  { type: "github_pat", regex: /gh[pousr]_[0-9a-zA-Z]{36}/g },
  { type: "private_key", regex: /-----BEGIN[ A-Z0-9_-]+PRIVATE KEY-----/g },
];

export class SecretGuard {
  scan(text: string): SecretScanResult {
    const matches: SecretMatch[] = [];
    let redacted = text;

    for (const pattern of SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let m: RegExpExecArray | null = null;
      while ((m = pattern.regex.exec(text)) !== null) {
        matches.push({ type: pattern.type, matched: m[0] });
      }
      redacted = redacted.replace(pattern.regex, `[REDACTED_${pattern.type.toUpperCase()}]`);
    }

    return {
      hasSecret: matches.length > 0,
      matches,
      redacted,
    };
  }

  evaluateWrite(filePath: string, content: string): { allowed: boolean; reason?: string } {
    const result = this.scan(content);
    if (result.hasSecret) {
      const types = result.matches.map((m) => m.type).join(", ");
      return {
        allowed: false,
        reason: `Write to '${filePath}' blocked: contains exposed secret of type(s): ${types}`,
      };
    }
    return { allowed: true };
  }
}
