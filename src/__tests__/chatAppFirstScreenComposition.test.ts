import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ChatApp first screen composition", () => {
  it("does not load random assistant recommendations for the empty chat screen", () => {
    const chatApp = readFileSync(
      resolve(process.cwd(), "src/components/app/ChatApp.tsx"),
      "utf8",
    );

    expect(chatApp).not.toContain("AssistantList");
    expect(chatApp).not.toContain("getRandomAgents");
    expect(chatApp).not.toContain("getAgents(false, locale)");
    expect(chatApp).not.toContain("recommendedAgents");
    expect(chatApp).toContain("emptyChatSurface");
    expect(chatApp).not.toContain('src="/logo.png"');
    expect(chatApp).toContain('import { Logo } from "@/components/ui/Icons";');
    expect(chatApp).toContain('t("productName")');
    expect(chatApp).not.toContain('t("productSlogan")');
    expect(chatApp).toContain("neoChatWordmark");
    expect(chatApp).toContain(
      "bg-[linear-gradient(to_right,#00DEB9,#03B2DE,#1D88E1)]",
    );
    expect(chatApp).not.toContain("emptyChatSurface flex-1 flex flex-col");
    expect(chatApp).toContain("bottom-[40vh]");
    expect(chatApp).toContain("messageInputVariant");
    expect(chatApp).toContain("variant={messageInputVariant}");
    expect(chatApp).toContain(
      'welcomeState === "visible" ? "max-w-2xl" : "max-w-3xl"',
    );
    expect(chatApp).not.toContain("max-w-xl");
    expect(chatApp).toContain("shouldShowChatTitleBar");
    expect(chatApp).toContain("shouldShowChatTitleBar &&");
    expect(chatApp).toContain("text-[1.75rem]");
    expect(chatApp).toContain("font-bold");
    expect(chatApp).not.toContain("text-[2rem] font-black");
    expect(chatApp).not.toContain("md:text-[2.5rem]");
  });
});
