export type AgentDefinition = {
  id: string;
  name: string;
  description?: string;
  instructions: string;
  model?: string;
  tools?: string[] | Record<string, boolean>;
  tags?: string[];
  enabled?: boolean;
  // OpenCode-specific fields (optional for backwards compatibility)
  mode?: "primary" | "subagent" | "all";
  permission?: Record<string, unknown>;
  temperature?: number;
  topP?: number;
  prompt?: string;
  steps?: number;
  hidden?: boolean;
  color?: string;
};
