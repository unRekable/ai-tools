import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./registry.js", () => ({
  registry: { register: vi.fn() },
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
  stat: vi.fn(),
}));

import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { OpenCodeSkillAdapter } from "./opencode.js";
import type { SkillDefinition } from "../types/index.js";

describe("OpenCodeSkillAdapter", () => {
  let adapter: OpenCodeSkillAdapter;

  const testSkill: SkillDefinition = {
    id: "review",
    name: "Code Review",
    description: "Review code for best practices",
    content:
      "Please review the selected code for:\n- Security issues\n- Performance\n- Best practices",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new OpenCodeSkillAdapter();
  });

  describe("metadata", () => {
    it("has correct id", () => expect(adapter.id).toBe("opencode"));
    it("has correct name", () => expect(adapter.name).toBe("OpenCode"));
    it("has native support", () => expect(adapter.nativeSupport).toBe(true));
    it("has correct config dir", () => expect(adapter.configDir).toBe(".opencode/skills"));
  });

  describe("generate", () => {
    it("generates one file per skill with correct path structure", async () => {
      const files = await adapter.generate([testSkill]);
      expect(files).toHaveLength(1);
      expect(files[0]?.path).toBe(".opencode/skills/review/SKILL.md");
      expect(files[0]?.format).toBe("md");
    });

    it("formats skill with YAML frontmatter and content", async () => {
      const files = await adapter.generate([testSkill]);
      expect(files[0]?.content).toContain("---");
      expect(files[0]?.content).toContain("name: Code Review");
      expect(files[0]?.content).toContain("description: Review code for best practices");
      expect(files[0]?.content).toContain("Security issues");
    });

    it("handles empty skills array", async () => {
      const files = await adapter.generate([]);
      expect(files).toHaveLength(0);
    });

    it("handles multiple skills", async () => {
      const skills = [testSkill, { ...testSkill, id: "debug", name: "Debug" }];
      const files = await adapter.generate(skills);
      expect(files).toHaveLength(2);
      expect(files[0]?.path).toBe(".opencode/skills/review/SKILL.md");
      expect(files[1]?.path).toBe(".opencode/skills/debug/SKILL.md");
    });

    it("handles skill without description", async () => {
      const skill: SkillDefinition = { id: "test", name: "Test", content: "Content here" };
      const files = await adapter.generate([skill]);
      expect(files[0]?.content).toContain("name: Test");
      expect(files[0]?.content).toContain("Content here");
      expect(files[0]?.content).not.toContain("description:");
    });
  });

  describe("import", () => {
    it("returns empty array when dir does not exist", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const result = await adapter.import("/test");
      expect(result).toEqual([]);
    });

    it("imports skills from SKILL.md files in subdirectories", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      
      // Mock readdir to return directories
      vi.mocked(readdir).mockResolvedValue([
        { name: "review", isDirectory: () => true, isFile: () => false },
        { name: "debug", isDirectory: () => true, isFile: () => false },
      ] as never);
      
      // Mock stat for directory check
      vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as never);
      
      // Mock existsSync for SKILL.md check (first call is for skills dir, second for SKILL.md)
      let existsCallCount = 0;
      vi.mocked(existsSync).mockImplementation(() => {
        existsCallCount++;
        return true;
      });
      
      // Mock readFile to return skill content
      vi.mocked(readFile).mockResolvedValue("---\nname: Code Review\n---\n\nReview the code");
      
      const result = await adapter.import("/test");
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe("review");
      expect(result[0]?.name).toBe("Code Review");
    });

    it("skips files in root directory", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      
      // Mock readdir to return both files and directories
      vi.mocked(readdir).mockResolvedValue([
        { name: "readme.txt", isDirectory: () => false, isFile: () => true },
        { name: "review", isDirectory: () => true, isFile: () => false },
      ] as never);
      
      vi.mocked(stat).mockResolvedValue({ isDirectory: () => false } as never);
      
      let existsCallCount = 0;
      vi.mocked(existsSync).mockImplementation(() => {
        existsCallCount++;
        if (existsCallCount === 1) return true; // skills dir exists
        if (existsCallCount === 2) return false; // readme.txt/SKILL.md doesn't exist
        return true; // review/SKILL.md exists
      });
      
      vi.mocked(readFile).mockResolvedValue("---\nname: Code Review\n---\n\nContent");
      
      const result = await adapter.import("/test");
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("review");
    });

    it("skips directories without SKILL.md", async () => {
      vi.mocked(existsSync).mockReturnValueOnce(true);
      
      vi.mocked(readdir).mockResolvedValue([
        { name: "review", isDirectory: () => true, isFile: () => false },
      ] as never);
      
      vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as never);
      
      // First call for skills dir, second for SKILL.md (returns false)
      let existsCallCount = 0;
      vi.mocked(existsSync).mockImplementation(() => {
        existsCallCount++;
        return existsCallCount === 1;
      });
      
      const result = await adapter.import("/test");
      expect(result).toHaveLength(0);
    });

    it("imports skill without frontmatter", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      
      vi.mocked(readdir).mockResolvedValue([
        { name: "plain", isDirectory: () => true, isFile: () => false },
      ] as never);
      
      vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as never);
      
      let existsCallCount = 0;
      vi.mocked(existsSync).mockImplementation(() => {
        existsCallCount++;
        return true;
      });
      
      vi.mocked(readFile).mockResolvedValue("Just content, no frontmatter");
      
      const result = await adapter.import("/test");
      expect(result[0]?.id).toBe("plain");
      expect(result[0]?.name).toBe("plain");
      expect(result[0]?.content).toBe("Just content, no frontmatter");
    });

    it("imports without cwd argument", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const result = await adapter.import();
      expect(result).toEqual([]);
    });
  });
});
