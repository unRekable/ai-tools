export type SkillDefinition = {
  id: string;
  name: string;
  description?: string;
  content: string;
  tags?: string[];
  enabled?: boolean;
  // OpenCode-specific fields
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
};
