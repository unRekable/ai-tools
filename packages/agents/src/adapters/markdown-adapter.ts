import { BaseAgentAdapter } from "./base.js";
import { registry } from "./registry.js";
import type { AgentDefinition, GeneratedFile } from "../types/index.js";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { resolve, basename } from "node:path";

export type MarkdownAdapterConfig = {
  id: string;
  name: string;
  configDir: string;
  command?: string;
};

export function createMarkdownAdapter(config: MarkdownAdapterConfig) {
  class MarkdownAgentAdapter extends BaseAgentAdapter {
    readonly id = config.id;
    readonly name = config.name;
    readonly nativeSupport = true;
    readonly configDir = config.configDir;
    override readonly command = config.command;

    async generate(agents: AgentDefinition[]): Promise<GeneratedFile[]> {
      return agents.map((agent) => ({
        path: `${this.configDir}/${agent.id}.md`,
        content: formatAgent(agent),
        format: "md" as const,
      }));
    }

    async import(cwd?: string): Promise<AgentDefinition[]> {
      const dir = cwd ?? process.cwd();
      const agentsDir = resolve(dir, this.configDir);
      if (!existsSync(agentsDir)) return [];

      const files = await readdir(agentsDir);
      const agents: AgentDefinition[] = [];

      for (const file of files) {
        if (!file.endsWith(".md")) continue;
        const content = await readFile(resolve(agentsDir, file), "utf-8");
        const id = basename(file, ".md");
        agents.push(parseAgent(id, content));
      }

      return agents;
    }
  }

  const adapter = new MarkdownAgentAdapter();
  registry.register(adapter);
  return {
    Adapter: MarkdownAgentAdapter as unknown as typeof BaseAgentAdapter,
    adapter: adapter as BaseAgentAdapter,
  };
}

function formatAgent(agent: AgentDefinition): string {
  const frontmatter: Record<string, unknown> = {};
  if (agent.description) frontmatter.description = agent.description;
  if (agent.tools) {
    // Support both array (Claude Code) and object (OpenCode) formats
    if (Array.isArray(agent.tools) && agent.tools.length > 0) {
      frontmatter.tools = agent.tools;
    } else if (typeof agent.tools === "object" && Object.keys(agent.tools).length > 0) {
      frontmatter.tools = agent.tools;
    }
  }
  if (agent.model) frontmatter.model = agent.model;
  // OpenCode-specific fields
  if (agent.mode) frontmatter.mode = agent.mode;
  if (agent.permission) frontmatter.permission = agent.permission;
  if (agent.temperature !== undefined) frontmatter.temperature = agent.temperature;
  if (agent.topP !== undefined) frontmatter.topP = agent.topP;
  if (agent.prompt) frontmatter.prompt = agent.prompt;
  if (agent.steps !== undefined) frontmatter.steps = agent.steps;
  if (agent.hidden !== undefined) frontmatter.hidden = agent.hidden;
  if (agent.color) frontmatter.color = agent.color;

  let md = "---\n";
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      md += `${key}:\n`;
      for (const item of value) {
        md += `  - ${item}\n`;
      }
    } else if (typeof value === "object" && value !== null) {
      md += formatYamlObject(key, value as Record<string, unknown>, 0);
    } else {
      md += `${key}: ${value}\n`;
    }
  }
  md += "---\n\n";
  md += `# ${agent.name}\n\n`;
  md += agent.instructions + "\n";
  return md;
}

function formatYamlObject(key: string, obj: Record<string, unknown>, indent: number): string {
  const prefix = "  ".repeat(indent);
  let yaml = `${key}:\n`;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      yaml += prefix + formatYamlObject(k, v as Record<string, unknown>, indent + 1);
    } else if (Array.isArray(v)) {
      yaml += `${prefix}  ${k}:\n`;
      for (const item of v) {
        yaml += `${prefix}    - ${item}\n`;
      }
    } else {
      yaml += `${prefix}  ${k}: ${v}\n`;
    }
  }
  return yaml;
}

function parseAgent(id: string, raw: string): AgentDefinition {
  const agent: AgentDefinition = { id, name: id, instructions: "" };

  if (raw.startsWith("---")) {
    const endIdx = raw.indexOf("---", 3);
    if (endIdx !== -1) {
      const fm = raw.slice(3, endIdx).trim();
      const body = raw.slice(endIdx + 3).trim();

      // Parse frontmatter
      const parsed = parseYamlFrontmatter(fm);
      
      if (parsed.description && typeof parsed.description === "string") agent.description = parsed.description;
      if (parsed.model && typeof parsed.model === "string") agent.model = parsed.model;
      if (parsed.mode && typeof parsed.mode === "string") agent.mode = parsed.mode as AgentDefinition["mode"];
      if (parsed.tools) agent.tools = parsed.tools as AgentDefinition["tools"];
      if (parsed.permission && typeof parsed.permission === "object") agent.permission = parsed.permission as Record<string, unknown>;
      if (parsed.temperature !== undefined && typeof parsed.temperature === "number") agent.temperature = parsed.temperature;
      if (parsed.topP !== undefined && typeof parsed.topP === "number") agent.topP = parsed.topP;
      if (parsed.steps !== undefined && typeof parsed.steps === "number") agent.steps = parsed.steps;
      if (parsed.prompt && typeof parsed.prompt === "string") agent.prompt = parsed.prompt;
      if (parsed.hidden !== undefined) agent.hidden = Boolean(parsed.hidden);
      if (parsed.color && typeof parsed.color === "string") agent.color = parsed.color;

      // Parse body
      const bodyLines = body.split("\n");
      let contentStart = 0;
      if (bodyLines[0]?.startsWith("# ")) {
        agent.name = bodyLines[0].slice(2).trim();
        contentStart = 1;
        if (bodyLines[contentStart]?.trim() === "") contentStart++;
      }
      agent.instructions = bodyLines.slice(contentStart).join("\n").trim();
    }
  } else {
    // No frontmatter, try to parse just body
    const bodyLines = raw.split("\n");
    let contentStart = 0;
    if (bodyLines[0]?.startsWith("# ")) {
      agent.name = bodyLines[0].slice(2).trim();
      contentStart = 1;
      if (bodyLines[contentStart]?.trim() === "") contentStart++;
    }
    agent.instructions = bodyLines.slice(contentStart).join("\n").trim();
  }

  return agent;
}

function parseYamlFrontmatter(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line || line.trim().startsWith("#")) {
      i++;
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    // Check if next lines are indented (object or array)
    if (!value && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      if (nextLine && (nextLine.startsWith("  ") || nextLine.startsWith("\t"))) {
        // It's an object or array
        const { parsed, newIndex } = parseYamlValue(lines, i + 1, 0);
        result[key] = parsed;
        i = newIndex;
        continue;
      }
    }

    // Simple value
    if (value) {
      result[key] = parseScalarValue(value);
    }
    i++;
  }

  return result;
}

function parseYamlValue(
  lines: string[],
  startIndex: number,
  baseIndent: number
): { parsed: unknown; newIndex: number } {
  const isArray = lines[startIndex]?.trim().startsWith("- ");
  const arr: string[] = [];
  const obj: Record<string, unknown> = {};

  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || !line.trim()) {
      i++;
      continue;
    }

    const currentIndent = line.search(/\S/);
    if (currentIndent === -1 || currentIndent <= baseIndent) {
      break;
    }

    const trimmed = line.trim();

    if (isArray && trimmed.startsWith("- ")) {
      arr.push(trimmed.slice(2).trim());
      i++;
    } else if (!isArray) {
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx !== -1) {
        const key = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim();

        if (!value && i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          if (nextLine) {
            const nextIndent = nextLine.search(/\S/);
            if (nextIndent !== -1 && nextIndent > currentIndent) {
              const { parsed, newIndex } = parseYamlValue(lines, i + 1, currentIndent);
              obj[key] = parsed;
              i = newIndex;
              continue;
            }
          }
        }

        if (value) {
          obj[key] = parseScalarValue(value);
        }
        i++;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  return { parsed: isArray ? arr : obj, newIndex: i };
}

function parseScalarValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;

  const num = Number(value);
  if (!isNaN(num)) return num;

  // Remove quotes if present
  if ((value.startsWith('"') && value.endsWith('"')) || 
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}
