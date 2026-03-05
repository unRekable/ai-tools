import { BaseSkillAdapter } from "./base.js";
import { registry } from "./registry.js";
import type { SkillDefinition, GeneratedFile } from "../types/index.js";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

class OpenCodeSkillAdapter extends BaseSkillAdapter {
  readonly id = "opencode";
  readonly name = "OpenCode";
  readonly nativeSupport = true;
  readonly configDir = ".opencode/skills";
  readonly command = "opencode";

  async generate(skills: SkillDefinition[]): Promise<GeneratedFile[]> {
    return skills.map((skill) => ({
      path: `${this.configDir}/${skill.id}/SKILL.md`,
      content: this.formatSkill(skill),
      format: "md" as const,
    }));
  }

  async import(cwd?: string): Promise<SkillDefinition[]> {
    const dir = cwd ?? process.cwd();
    const skillsDir = resolve(dir, this.configDir);
    if (!existsSync(skillsDir)) return [];

    const entries = await readdir(skillsDir, { withFileTypes: true });
    const skills: SkillDefinition[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const skillFile = resolve(skillsDir, entry.name, "SKILL.md");
      if (!existsSync(skillFile)) continue;

      const content = await readFile(skillFile, "utf-8");
      skills.push(this.parseSkill(entry.name, content));
    }

    return skills;
  }

  private formatSkill(skill: SkillDefinition): string {
    let md = "---\n";
    md += `name: ${skill.name}\n`;
    if (skill.description) md += `description: ${skill.description}\n`;
    if (skill.license) md += `license: ${skill.license}\n`;
    if (skill.compatibility) md += `compatibility: ${skill.compatibility}\n`;
    if (skill.metadata && Object.keys(skill.metadata).length > 0) {
      md += "metadata:\n";
      for (const [key, value] of Object.entries(skill.metadata)) {
        md += `  ${key}: ${value}\n`;
      }
    }
    md += "---\n\n";
    md += skill.content + "\n";
    return md;
  }

  private parseSkill(id: string, raw: string): SkillDefinition {
    const skill: SkillDefinition = { id, name: id, content: "" };

    if (raw.startsWith("---")) {
      const endIdx = raw.indexOf("---", 3);
      if (endIdx !== -1) {
        const fm = raw.slice(3, endIdx).trim();
        const body = raw.slice(endIdx + 3).trim();

        // Parse frontmatter
        const lines = fm.split("\n");
        for (const line of lines) {
          const colonIdx = line.indexOf(":");
          if (colonIdx !== -1) {
            const key = line.slice(0, colonIdx).trim();
            const value = line.slice(colonIdx + 1).trim();
            
            if (key === "name" && value) skill.name = value;
            if (key === "description" && value) skill.description = value;
            if (key === "license" && value) skill.license = value;
            if (key === "compatibility" && value) skill.compatibility = value;
          }
        }

        skill.content = body;
      }
    } else {
      // No frontmatter, use entire content
      skill.content = raw.trim();
    }

    return skill;
  }
}

const adapter = new OpenCodeSkillAdapter();
registry.register(adapter);
export { OpenCodeSkillAdapter };
export default adapter;
