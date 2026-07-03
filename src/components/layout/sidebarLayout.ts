export interface SidebarPaneHeightInput {
  availableHeight: number;
  workspaceContentHeight: number;
  chatContentHeight: number;
  gap?: number;
}

export interface SidebarPaneHeights {
  workspace: number;
  chat: number;
}

const clampHeight = (value: number) => Math.max(0, value);

export function calculateSidebarPaneHeights({
  availableHeight,
  workspaceContentHeight,
  chatContentHeight,
  gap = 0,
}: SidebarPaneHeightInput): SidebarPaneHeights {
  const usableHeight = clampHeight(availableHeight - gap);
  const workspaceNaturalHeight = clampHeight(workspaceContentHeight);
  const chatNaturalHeight = clampHeight(chatContentHeight);

  if (usableHeight === 0) {
    return { workspace: 0, chat: 0 };
  }

  if (workspaceNaturalHeight + chatNaturalHeight <= usableHeight) {
    return {
      workspace: workspaceNaturalHeight,
      chat: chatNaturalHeight,
    };
  }

  const halfHeight = usableHeight / 2;
  let workspace = Math.min(workspaceNaturalHeight, halfHeight);
  let chat = Math.min(chatNaturalHeight, halfHeight);
  const remainingHeight = usableHeight - workspace - chat;

  if (remainingHeight > 0) {
    if (workspaceNaturalHeight > workspace && chatNaturalHeight <= chat) {
      workspace = Math.min(workspaceNaturalHeight, workspace + remainingHeight);
    } else if (
      chatNaturalHeight > chat &&
      workspaceNaturalHeight <= workspace
    ) {
      chat = Math.min(chatNaturalHeight, chat + remainingHeight);
    }
  }

  return { workspace, chat };
}
