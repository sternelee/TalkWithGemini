// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import ToolCallBlock from "@/components/content/ToolCallBlock";
import type { ToolCall } from "@/types";
import contentMessages from "@/i18n/locales/en/Content.json";

afterEach(cleanup);

function renderBlock(
  toolCall: ToolCall,
  handlers: {
    onDecision?: (toolCallId: string, decision: string) => void;
    onRevoke?: (toolCall: ToolCall) => void;
  } = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ Content: contentMessages }}>
      <ToolCallBlock
        toolCalls={[toolCall]}
        onConfirmationDecision={handlers.onDecision}
        onRevokeSessionApproval={handlers.onRevoke}
      />
    </NextIntlClientProvider>,
  );
}

const awaitingWriteCall: ToolCall = {
  id: "call-1",
  name: "create_issue",
  pluginId: "tracker",
  pluginTitle: "Issue Tracker",
  functionFingerprint: "fingerprint-1",
  risk: "write",
  args: { title: "Bug", apiKey: "do-not-display" },
  status: "awaiting_confirmation",
  confirmation: { required: true, state: "pending" },
};

describe("ToolCallBlock confirmation controls", () => {
  it("shows redacted write confirmation and returns the selected decision", async () => {
    const onDecision = vi.fn();
    renderBlock(awaitingWriteCall, { onDecision });

    expect(screen.getByText("Allow once")).toBeTruthy();
    expect(screen.getByText("Allow for this chat")).toBeTruthy();
    expect(screen.queryByText("do-not-display")).toBeNull();

    await userEvent.click(screen.getByText("Allow for this chat"));
    expect(onDecision).toHaveBeenCalledWith("call-1", "allow_session");
  });

  it("does not offer session permission for destructive calls", () => {
    renderBlock(
      {
        ...awaitingWriteCall,
        id: "call-destructive",
        risk: "destructive",
      },
      { onDecision: vi.fn() },
    );

    expect(screen.getByText("Allow once")).toBeTruthy();
    expect(screen.queryByText("Allow for this chat")).toBeNull();
  });

  it("allows an existing session permission to be revoked", async () => {
    const onRevoke = vi.fn();
    const approvedCall: ToolCall = {
      ...awaitingWriteCall,
      status: "success",
      result: { ok: true },
      confirmation: {
        required: true,
        state: "approved",
        decision: "allow_session",
        decidedAt: Date.now(),
      },
    };
    renderBlock(approvedCall, { onRevoke });

    await userEvent.click(screen.getByText("Revoke permission for this chat"));
    expect(onRevoke).toHaveBeenCalledWith(
      expect.objectContaining({
        id: approvedCall.id,
        pluginId: approvedCall.pluginId,
        functionFingerprint: approvedCall.functionFingerprint,
        risk: approvedCall.risk,
      }),
    );
  });

  it("distinguishes one-time approval from session approval", () => {
    renderBlock({
      ...awaitingWriteCall,
      status: "success",
      result: { ok: true },
      confirmation: {
        required: true,
        state: "approved",
        decision: "allow_once",
        decidedAt: Date.now(),
      },
    });

    expect(screen.getByText("Allowed once")).toBeTruthy();
    expect(screen.queryByText("Allowed for this chat")).toBeNull();
  });

  it("shows interrupted confirmation separately from user denial", () => {
    renderBlock({
      ...awaitingWriteCall,
      status: "error",
      errorInfo: {
        code: "CONFIRMATION_INTERRUPTED",
        message: "Approval was interrupted",
      },
      confirmation: {
        required: true,
        state: "interrupted",
        decidedAt: Date.now(),
      },
    });

    expect(screen.getByText("Approval interrupted")).toBeTruthy();
    expect(screen.queryByText("Denied")).toBeNull();
  });
});
