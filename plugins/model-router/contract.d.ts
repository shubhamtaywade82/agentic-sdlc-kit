// plugins/model-router/contract.d.ts
//
// Type contract for the Claude Code host: names the state keys this
// plugin reads on $.state. Self-contained by host rule (no imports); the
// shape inlines RoutingPolicy from @agentic-sdlc-kit/contracts.
declare module 'claude-code' {
  interface PluginState {
    'model-router': {
      policy:
        | {
            schemaVersion: 1;
            id: string;
            version: string;
            rules: Array<{
              id: string;
              taskType: string;
              complexity: string;
              risk: string;
              model: string;
              effort: string;
              verification:
                'none' | 'structural' | 'tests' | 'independent-review' | 'mandatory-security';
              reason: string;
            }>;
            defaultModel: string;
            defaultEffort: string;
            suggestOnly: boolean;
          }
        | undefined;
    };
  }
}
