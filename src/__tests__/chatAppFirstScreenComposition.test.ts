import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ChatApp first screen composition", () => {
  it("does not load random assistant recommendations for the empty chat screen", () => {
    const chatApp = readFileSync(
      resolve(process.cwd(), "src/components/app/ChatApp.tsx"),
      "utf8",
    );
    const chatAppShell = readFileSync(
      resolve(process.cwd(), "src/components/app/ChatAppShell.tsx"),
      "utf8",
    );
    const chatSurface = `${chatApp}\n${chatAppShell}`;

    expect(chatSurface).not.toContain("AssistantList");
    expect(chatSurface).not.toContain("getRandomAgents");
    expect(chatSurface).not.toContain("getAgents(false, locale)");
    expect(chatSurface).not.toContain("recommendedAgents");
    expect(chatSurface).toContain("emptyChatSurface");
    expect(chatSurface).not.toContain('src="/logo.png"');
    expect(chatSurface).toContain(
      'import { Logo } from "@/components/ui/Icons";',
    );
    expect(chatSurface).toContain('t("productName")');
    expect(chatSurface).not.toContain('t("productSlogan")');
    expect(chatSurface).toContain("neoChatWordmark");
    expect(chatSurface).toContain(
      "bg-[linear-gradient(to_right,#00DEB9,#03B2DE,#1D88E1)]",
    );
    expect(chatSurface).not.toContain("emptyChatSurface flex-1 flex flex-col");
    expect(chatSurface).toContain("bottom-[40vh]");
    expect(chatSurface).toContain("messageInputVariant");
    expect(chatSurface).toContain("variant={messageInputVariant}");
    expect(chatSurface).toContain(
      'welcomeState === "visible" ? "max-w-2xl" : "max-w-3xl"',
    );
    expect(chatSurface).not.toContain("max-w-xl");
    expect(chatSurface).toContain("shouldShowChatTitleBar");
    expect(chatSurface).toContain("shouldShowChatTitleBar &&");
    expect(chatSurface).toContain("text-[1.75rem]");
    expect(chatSurface).toContain("font-bold");
    expect(chatSurface).not.toContain("text-[2rem] font-black");
    expect(chatSurface).not.toContain("md:text-[2.5rem]");
  });
});
