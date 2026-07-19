import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

async function setIndexedDbValue(page: Page, key: string, value: unknown) {
  await page.evaluate(
    async ({ key, value }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("neo-chat");
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("app_data")) {
            request.result.createObjectStore("app_data");
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("app_data", "readwrite");
        transaction.objectStore("app_data").put(value, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    },
    { key, value },
  );
}

async function getIndexedDbValue(page: Page, key: string) {
  return page.evaluate(async (storageKey) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("neo-chat");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const value = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction("app_data", "readonly");
      const request = transaction.objectStore("app_data").get(storageKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return value;
  }, key);
}

async function writeOpfsFile(page: Page, path: string, content: string) {
  await page.evaluate(
    async ({ path: filePath, content: fileContent }) => {
      const segments = filePath.split("/");
      const fileName = segments.pop();
      if (!fileName) throw new Error("An OPFS file name is required.");

      let directory = await navigator.storage.getDirectory();
      for (const segment of segments) {
        directory = await directory.getDirectoryHandle(segment, {
          create: true,
        });
      }
      const file = await directory.getFileHandle(fileName, { create: true });
      const writable = await file.createWritable();
      await writable.write(fileContent);
      await writable.close();
    },
    { path, content },
  );
}

async function readOpfsFile(page: Page, url: string) {
  return page.evaluate(async (opfsUrl) => {
    if (!opfsUrl.startsWith("opfs://")) return null;
    const segments = opfsUrl.slice("opfs://".length).split("/");
    const fileName = segments.pop();
    if (!fileName) return null;

    let directory = await navigator.storage.getDirectory();
    for (const segment of segments) {
      directory = await directory.getDirectoryHandle(segment);
    }
    const file = await directory.getFileHandle(fileName);
    return (await file.getFile()).text();
  }, url);
}

async function clearBrowserAppData(page: Page) {
  await page.evaluate(async () => {
    localStorage.clear();

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("neo-chat");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (database.objectStoreNames.contains("app_data")) {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("app_data", "readwrite");
        transaction.objectStore("app_data").clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }
    database.close();

    const root =
      (await navigator.storage.getDirectory()) as FileSystemDirectoryHandle & {
        keys(): AsyncIterableIterator<string>;
      };
    for await (const entryName of root.keys()) {
      await root.removeEntry(entryName, { recursive: true });
    }
  });
}

function persistedState(state: Record<string, unknown>) {
  return JSON.stringify({ state, version: 5 });
}

function sseBody(events: unknown[]) {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
}

async function sendChatMessage(page: Page, text: string) {
  await page.locator('textarea[name="message"]').fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
}

async function openSearchWithKeyboard(page: Page) {
  await expect
    .poll(
      async () => {
        await page.keyboard.press("Control+k");
        return new URL(page.url()).searchParams.get("panel");
      },
      { timeout: 15_000 },
    )
    .toBe("search");
}

async function openPanel(page: Page, buttonName: string, panel: string) {
  const button = page.getByRole("button", { name: buttonName });
  await expect(button).toBeVisible();
  await expect
    .poll(
      async () => {
        await button.click();
        return new URL(page.url()).searchParams.get("panel");
      },
      { timeout: 15_000 },
    )
    .toBe(panel);
}

async function expectNoPageHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test("loads the local chat shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('textarea[name="message"]')).toBeVisible();
});

test("applies stable gutters to the primary app scroll regions", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });

  for (const path of [
    "/",
    "/?panel=search",
    "/?panel=assistants",
    "/?panel=skills",
    "/?panel=plugins",
    "/?panel=knowledge",
    "/?panel=settings&settingsTab=system",
  ]) {
    await page.goto(path);
    const scrollers = page.locator(
      'main [class~="overflow-y-auto"], main [class~="overflow-auto"]',
    );
    await expect(scrollers.first()).toBeVisible();
    expect(
      await scrollers.evaluateAll((elements) =>
        elements.every(
          (element) =>
            getComputedStyle(element).scrollbarGutter === "stable both-edges",
        ),
      ),
    ).toBe(true);
    await expectNoPageHorizontalOverflow(page);
  }

  await page.goto("/");
  await expect(page.locator('textarea[name="message"]')).toBeVisible();
  expect(
    await page
      .locator("html")
      .evaluate((element) => getComputedStyle(element).scrollbarGutter),
  ).toBe("stable both-edges");
  expect(
    await page
      .locator('textarea[name="message"]')
      .evaluate((element) => getComputedStyle(element).scrollbarGutter),
  ).toBe("stable both-edges");

  await page.goto("/?panel=settings&settingsTab=system");
  const desktopSettingsNavigation = page.locator(
    '[class~="md:overflow-y-auto"]',
  );
  await expect(desktopSettingsNavigation).toBeVisible();
  expect(
    await desktopSettingsNavigation.evaluate(
      (element) => getComputedStyle(element).scrollbarGutter,
    ),
  ).toBe("stable both-edges");
});

test("keeps centered content fixed while vertical overflow changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?panel=search");
  await expect(page.locator("#global-search-title")).toBeVisible();
  await page.waitForTimeout(400);

  const searchScroller = page.locator('main [class~="scrollbar-gutter-both"]');
  await expect(searchScroller).toBeVisible();

  const measurements = await searchScroller.evaluate(async (scroller) => {
    const centered = scroller.firstElementChild;
    if (!(centered instanceof HTMLElement)) {
      throw new Error("Global search content container is missing.");
    }
    const nextFrame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const measure = () => {
      const contentRect = centered.getBoundingClientRect();
      return {
        clientWidth: scroller.clientWidth,
        contentLeft: contentRect.left,
        contentWidth: contentRect.width,
        overflowing: scroller.scrollHeight > scroller.clientHeight,
      };
    };

    await nextFrame();
    const before = measure();
    const filler = document.createElement("div");
    filler.style.height = `${scroller.clientHeight + 200}px`;
    centered.append(filler);
    await nextFrame();
    const during = measure();
    filler.remove();
    await nextFrame();
    const restored = measure();
    const gutter = getComputedStyle(scroller).scrollbarGutter;

    return { before, during, gutter, restored };
  });

  expect(measurements.gutter).toBe("stable both-edges");
  expect(measurements.before.overflowing).toBe(false);
  expect(measurements.during.overflowing).toBe(true);
  expect(measurements.restored.overflowing).toBe(false);
  for (const key of ["clientWidth", "contentLeft", "contentWidth"] as const) {
    expect(measurements.during[key]).toBeCloseTo(measurements.before[key], 5);
    expect(measurements.restored[key]).toBeCloseTo(measurements.before[key], 5);
  }
});

test("avoids page-level horizontal overflow on mobile panels", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const path of [
    "/",
    "/?panel=search",
    "/?panel=assistants",
    "/?panel=skills",
    "/?panel=plugins",
    "/?panel=knowledge",
    "/?panel=settings&settingsTab=system",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    await expectNoPageHorizontalOverflow(page);
  }

  await page.goto("/?panel=settings&settingsTab=system");
  const mobileSettingsNavigation = page.locator(
    '[class~="md:overflow-y-auto"]',
  );
  await expect(mobileSettingsNavigation).toBeVisible();
  expect(
    await mobileSettingsNavigation.evaluate(
      (element) => getComputedStyle(element).scrollbarGutter,
    ),
  ).toBe("auto");
});

test("renders the destructive confirmation setting across themes and viewports", async ({
  page,
}) => {
  await page.goto("/manifest.webmanifest");
  await page.evaluate(
    (value) => localStorage.setItem("neo-chat-core-settings", value),
    persistedState({ theme: "light", language: "en" }),
  );
  await setIndexedDbValue(
    page,
    "neo-chat-settings",
    persistedState({
      system: { enableDestructiveToolConfirmation: false },
    }),
  );

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?panel=settings&settingsTab=system");

  const confirmationToggle = page.getByLabel(
    "Require confirmation for destructive tool calls",
  );
  const themeControl = page.getByRole("group", { name: "Appearance theme" });
  await expect(confirmationToggle).toBeVisible();
  await expect(confirmationToggle).not.toBeChecked();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await themeControl.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.setViewportSize({ width: 390, height: 844 });
  await confirmationToggle.scrollIntoViewIfNeeded();
  await expect(confirmationToggle).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await confirmationToggle.press("Space");
  await expect(confirmationToggle).toBeChecked();
  await themeControl.getByRole("button", { name: "Light" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("opens and closes the global search center with the keyboard", async ({
  page,
}) => {
  await page.goto("/");

  await openSearchWithKeyboard(page);
  await expect(page.locator("#global-search-title")).toBeVisible();
  await expect(page).toHaveURL(/(?:\?|&)panel=search(?:&|$)/);

  await page.keyboard.press("Escape");
  await expect(page.locator('textarea[name="message"]')).toBeVisible();
  await expect(page).not.toHaveURL(/(?:\?|&)panel=search(?:&|$)/);
});

test("opens global search from the sidebar and exposes compact controls", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Open search" }).click();
  await expect(page).toHaveURL(/(?:\?|&)panel=search(?:&|$)/);

  const sourceGroup = page.getByRole("group", { name: "Source" });
  const knowledgeSource = sourceGroup.getByRole("button", {
    name: "Knowledge",
  });
  await knowledgeSource.click();
  await expect(knowledgeSource).toHaveAttribute("aria-pressed", "true");

  const filtersButton = page.getByRole("button", {
    name: "Filters and sort",
  });
  await filtersButton.click();
  await expect(page.getByLabel("Role")).toBeVisible();
  await page.getByLabel("Role").selectOption("model");
  await expect(
    page.getByRole("button", { name: /1 active option/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore defaults" }).click();
  await expect(page.getByLabel("Role")).toHaveValue("all");

  const searchInput = page.locator(
    'input[aria-controls="global-search-results"]',
  );
  await searchInput.fill("temporary query");
  await page.getByRole("button", { name: "Clear search query" }).click();
  await expect(searchInput).toHaveValue("");
});

test("keeps global search usable in the mobile sidebar flow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page
    .getByRole("main")
    .getByRole("button", { name: "Open sidebar" })
    .click();
  await page.getByRole("button", { name: "Open search" }).click();
  await expect(page.locator("#global-search-title")).toBeVisible();
  await expect(page).toHaveURL(/(?:\?|&)panel=search(?:&|$)/);
  await expect(page.getByRole("button", { name: "Open search" })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.getByRole("button", { name: "Filters and sort" }).click();
  await expect(
    page.getByRole("combobox", { name: "Sort", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("global search indexes only the active chat branch", async ({ page }) => {
  await page.goto("/manifest.webmanifest");
  const sessionId = "search-fixture";
  await setIndexedDbValue(
    page,
    "neo-chat-storage",
    JSON.stringify({
      state: {
        sessions: [
          {
            id: sessionId,
            title: "Branch search fixture",
            messageCount: 2,
            updatedAt: Date.now(),
            model: "",
          },
        ],
        workspaces: [],
        currentSessionId: sessionId,
        selectedModel: "",
        chatConfig: {},
      },
      version: 5,
    }),
  );
  await setIndexedDbValue(page, `session_messages_${sessionId}`, {
    nodesById: {
      root: {
        id: "root",
        message: {
          id: "root",
          role: "user",
          content: "active-branch-query-root",
          timestamp: Date.now() - 2,
        },
        childMessageIds: ["hidden", "active"],
        activeChildMessageId: "active",
      },
      hidden: {
        id: "hidden",
        message: {
          id: "hidden",
          role: "model",
          content: "hidden-branch-never-index",
          timestamp: Date.now() - 1,
        },
        parentMessageId: "root",
        childMessageIds: [],
      },
      active: {
        id: "active",
        message: {
          id: "active",
          role: "model",
          content: "active-branch-visible-result",
          timestamp: Date.now(),
        },
        parentMessageId: "root",
        childMessageIds: [],
      },
    },
    rootMessageIds: ["root"],
    activeRootMessageId: "root",
  });
  await page.goto("/");

  await openSearchWithKeyboard(page);
  const searchInput = page.locator(
    'input[aria-controls="global-search-results"]',
  );
  await searchInput.fill("active-branch-visible-result");
  await expect(page.locator('[id^="global-search-result-"]')).toHaveCount(1);

  await searchInput.fill("hidden-branch-never-index");
  await expect(page.locator('[id^="global-search-result-"]')).toHaveCount(0);

  await searchInput.fill("active-branch-visible-result");
  const activeResult = page.locator('[id^="global-search-result-"]');
  await expect(activeResult).toHaveCount(1);
  await searchInput.press("ArrowDown");
  await expect(activeResult).toHaveAttribute("aria-selected", "true");
  await searchInput.press("Enter");
  await expect(page).not.toHaveURL(/(?:\?|&)panel=search(?:&|$)/);
  await expect(page.getByText("active-branch-visible-result")).toBeVisible();
});

test("a failed plugin market request is not rendered as an empty market", async ({
  page,
}) => {
  await page.route("**/api/plugins/list", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "market unavailable" }),
    });
  });

  await page.goto("/");
  await openPanel(page, "Open Plugins", "plugins");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("plugin-market-empty")).toHaveCount(0);
});

test("preserves a PDF original and extracted text across cancel and retry", async ({
  page,
}) => {
  let parseStarts = 0;
  let cancelledJobs = 0;
  await page.route("**/api/doc-parse**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());

    if (request.method() === "DELETE") {
      cancelledJobs += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    if (request.method() === "GET" && pathname.includes("/jobs/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "pending" }),
      });
      return;
    }

    if (request.method() === "POST" && pathname === "/api/doc-parse") {
      parseStarts += 1;
      if (parseStarts === 1) {
        await route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({
            jobId: "cancel-job",
            jobSecret: "cancel-secret",
            status: "pending",
          }),
        });
        return;
      }
      if (parseStarts === 2) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "parser unavailable" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ markdown: "Extracted retry PDF text" }),
      });
      return;
    }

    await route.abort();
  });

  await page.goto("/manifest.webmanifest");
  await setIndexedDbValue(
    page,
    "neo-chat-settings",
    persistedState({
      rag: {
        enabled: false,
        url: "",
        token: "",
        topK: 10,
        chunkSize: 512,
        documentParseProvider: "mineru",
        mineruApiToken: "",
        llamaParseApiKey: "",
        useDefaultVectorStore: false,
        useDefaultDocumentProcessing: false,
      },
    }),
  );
  await page.goto("/");
  await openPanel(page, "Open Knowledge Base", "knowledge");
  await page.getByRole("button", { name: "Create New Collection" }).click();
  const collectionDialog = page.getByRole("dialog");
  await collectionDialog.getByLabel("Name").fill("E2E Knowledge");
  await collectionDialog.getByRole("button", { name: "Save" }).click();
  await page
    .getByRole("button", { name: "Open collection E2E Knowledge" })
    .click();

  const fileInput = page.getByLabel("Knowledge files");
  const pendingParseResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/doc-parse" &&
      response.request().method() === "POST",
  );
  await fileInput.setInputFiles({
    name: "cancel.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 cancel fixture"),
  });
  await pendingParseResponse;
  await expect.poll(() => parseStarts).toBe(1);
  await page.waitForTimeout(100);
  await page
    .getByRole("button", { name: "Cancel processing cancel.pdf" })
    .click();
  await expect(page.getByText("cancel.pdf")).toHaveCount(0);
  await expect.poll(() => cancelledJobs).toBe(1);

  await fileInput.setInputFiles({
    name: "retry.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 retry fixture"),
  });
  const retryButton = page.getByRole("button", {
    name: "Retry processing retry.pdf",
  });
  await expect(retryButton).toBeVisible();
  await retryButton.click();

  const downloadOriginal = page.getByRole("button", {
    name: "Download the original retry.pdf",
  });
  await expect(downloadOriginal).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await downloadOriginal.click();
  const originalDownload = await downloadPromise;
  expect(originalDownload.suggestedFilename()).toBe("retry.pdf");

  await page.getByRole("button", { name: "Open retry.pdf" }).click();
  await expect(page.getByLabel("File content")).toHaveValue(
    "Extracted retry PDF text",
  );

  await expect
    .poll(async () => {
      const raw = await getIndexedDbValue(page, "knowledge-storage");
      const persisted =
        typeof raw === "string" ? JSON.parse(raw) : (raw as any);
      const file = persisted?.state?.collections?.[0]?.files?.[0];
      return file
        ? {
            contentKind: file.contentKind,
            distinctPaths: file.sourcePath !== file.contentPath,
            indexStatus: file.indexStatus,
            storageStatus: file.storageStatus,
          }
        : null;
    })
    .toEqual({
      contentKind: "extracted_text",
      distinctPaths: true,
      indexStatus: "not_indexed",
      storageStatus: "saved",
    });
  expect(parseStarts).toBe(3);
});

test("requires one-time approval for destructive tools", async ({ page }) => {
  const sessionId = "tool-permission-session";
  const sensitiveToolArg = "tool-auth-secret-never-render";
  await page.goto("/manifest.webmanifest");
  await page.evaluate(
    (value) => {
      localStorage.setItem("neo-chat-core-settings", value);
    },
    persistedState({
      theme: "light",
      language: "en",
      providers: [
        {
          id: "e2e-provider",
          name: "E2E Provider",
          type: "OpenAI Compatible",
          baseUrl: "https://model.example.test/v1",
          apiKey: "",
          enabled: true,
          models: ["e2e-model"],
          modelsList: ["e2e-model"],
        },
      ],
      defaultModels: {},
    }),
  );
  await setIndexedDbValue(
    page,
    "neo-chat-settings",
    persistedState({
      system: {
        enableAutoTitle: false,
        enableRelatedQuestions: false,
        enableAutoCompression: false,
        enableDestructiveToolConfirmation: true,
      },
      customModelMetadata: {
        "e2e-model": {
          id: "e2e-model",
          name: "E2E Model",
          tool_call: true,
        },
      },
      activePlugins: ["e2e-deleter"],
      installedPlugins: [
        {
          id: "e2e-deleter",
          title: "E2E Deleter",
          description: "Deletes a test record.",
          logoUrl: "",
          manifestUrl: "https://plugins.example.test/writer.json",
          baseUrl: "https://plugins.example.test",
          source: "openapi",
          auth: { type: "none" },
          functions: [
            {
              name: "delete_record",
              description: "Delete a record.",
              method: "DELETE",
              path: "/records/{id}",
              risk: "destructive",
              parameters: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  auth_token: { type: "string" },
                },
              },
            },
          ],
        },
      ],
      pluginConfigs: {
        "e2e-deleter": { enabledFunctions: ["delete_record"] },
      },
    }),
  );
  await setIndexedDbValue(
    page,
    "neo-chat-storage",
    persistedState({
      sessions: [
        {
          id: sessionId,
          title: "Tool permission fixture",
          messageCount: 0,
          updatedAt: Date.now(),
          model: "e2e-provider:e2e-model",
          config: {
            activePlugins: ["e2e-deleter"],
            toolApprovals: [],
          },
        },
      ],
      workspaces: [],
      currentSessionId: sessionId,
      selectedModel: "e2e-provider:e2e-model",
      chatConfig: {
        useSearch: false,
        useReasoning: false,
        reasoningMode: "off",
        useRAG: false,
        temperature: 1,
      },
    }),
  );
  await setIndexedDbValue(page, `session_messages_${sessionId}`, {
    nodesById: {},
    rootMessageIds: [],
  });
  await setIndexedDbValue(
    page,
    "neo-chat-memory",
    persistedState({
      settings: {
        enabled: false,
        searchEnabled: false,
        autoRecordEnabled: false,
        dreamEnabled: false,
      },
      memories: [],
      dreamStatus: { isRunning: false },
    }),
  );

  let initialRequests = 0;
  let executionRequests = 0;
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON() as { newMessage?: string };
    if (body.newMessage?.startsWith("Use the tool results above")) {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseBody([
          { type: "content", content: `completed-${initialRequests}` },
          { type: "done" },
        ]),
      });
      return;
    }

    initialRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sseBody([
        {
          type: "tool_call",
          toolCall: {
            id: `delete-call-${initialRequests}`,
            name: "delete_record",
            args: {
              id: `record-${initialRequests}`,
              auth_token: sensitiveToolArg,
            },
            status: "pending",
          },
        },
        { type: "done" },
      ]),
    });
  });
  await page.route("**/api/plugins/execute", async (route) => {
    executionRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: { ok: true } }),
    });
  });

  await page.goto("/");
  await expect(page.locator('textarea[name="message"]')).toBeEnabled();

  await sendChatMessage(page, "deny this deletion");
  await expect(page.getByRole("button", { name: "Allow once" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(sensitiveToolArg);
  await expect(page.locator("body")).toContainText("[REDACTED]");
  await page.getByRole("button", { name: "Deny" }).click();
  await expect(page.getByText("completed-1", { exact: true })).toBeVisible();
  expect(executionRequests).toBe(0);

  await sendChatMessage(page, "allow this deletion once");
  await page.getByRole("button", { name: "Allow once" }).click();
  await expect(page.getByText("completed-2", { exact: true })).toBeVisible();
  expect(executionRequests).toBe(1);
  await expect(page.getByText("Allowed once", { exact: true })).toBeVisible();

  await sendChatMessage(page, "ask again before deleting");
  await expect(page.getByRole("button", { name: "Allow once" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Allow for this chat" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Deny" }).click();
  await expect(page.getByText("completed-3", { exact: true })).toBeVisible();
  expect(executionRequests).toBe(1);
  expect(initialRequests).toBe(3);
});

test("exports and restores a ZIP v3 backup without local credentials", async ({
  page,
}) => {
  const now = Date.now();
  const sessionId = "backup-session";
  const collectionId = "backup-knowledge";
  const sourceUrl =
    "opfs://knowledge-base/backup-knowledge/source/original.pdf";
  const contentUrl =
    "opfs://knowledge-base/backup-knowledge/content/extracted.txt";
  const providerSecret = "backup-provider-secret-never-export";

  await page.goto("/manifest.webmanifest");
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: "neo-chat-core-settings",
    value: persistedState({
      theme: "light",
      language: "en",
      providers: [
        {
          id: "backup-provider",
          name: "Backup Provider",
          type: "OpenAI Compatible",
          baseUrl: "https://backup-model.example.test/v1",
          apiKey: providerSecret,
          enabled: true,
          models: ["backup-model"],
          modelsList: ["backup-model"],
        },
      ],
      defaultModels: {},
    }),
  });
  await setIndexedDbValue(
    page,
    "neo-chat-settings",
    persistedState({
      system: {
        enableAutoTitle: false,
        enableRelatedQuestions: false,
      },
      rag: {
        enabled: false,
        url: "",
        token: "",
        topK: 10,
        chunkSize: 512,
        documentParseProvider: "mineru",
        mineruApiToken: "",
        llamaParseApiKey: "",
        useDefaultVectorStore: false,
        useDefaultDocumentProcessing: false,
      },
    }),
  );
  await setIndexedDbValue(
    page,
    "neo-chat-storage",
    persistedState({
      sessions: [
        {
          id: sessionId,
          title: "Backup Session",
          messageCount: 2,
          updatedAt: now,
          model: "backup-provider:backup-model",
          workspaceId: "backup-workspace",
        },
      ],
      workspaces: [
        {
          id: "backup-workspace",
          name: "Backup Workspace",
          systemPrompt: "Keep the restored workspace prompt.",
          knowledgeCollectionIds: [collectionId],
          files: [],
          createdAt: now - 1_000,
        },
      ],
      currentSessionId: sessionId,
      selectedModel: "backup-provider:backup-model",
      chatConfig: {
        useSearch: false,
        useReasoning: false,
        reasoningMode: "off",
        useRAG: false,
        temperature: 1,
      },
    }),
  );
  await setIndexedDbValue(page, `session_messages_${sessionId}`, {
    nodesById: {
      root: {
        id: "root",
        message: {
          id: "root",
          role: "user",
          content: "active backup message",
          timestamp: now - 2,
        },
        childMessageIds: ["active", "alternate"],
        activeChildMessageId: "active",
      },
      active: {
        id: "active",
        message: {
          id: "active",
          role: "model",
          content: "active restored answer",
          timestamp: now - 1,
        },
        parentMessageId: "root",
        childMessageIds: [],
      },
      alternate: {
        id: "alternate",
        message: {
          id: "alternate",
          role: "model",
          content: "non-active branch retained in backup",
          timestamp: now,
        },
        parentMessageId: "root",
        childMessageIds: [],
      },
    },
    rootMessageIds: ["root"],
    activeRootMessageId: "root",
  });
  await setIndexedDbValue(
    page,
    "knowledge-storage",
    persistedState({
      collections: [
        {
          id: collectionId,
          name: "Backup Knowledge",
          description: "Knowledge restored from ZIP.",
          icon: "BookOpen",
          color: "blue",
          updatedAt: now,
          files: [
            {
              id: "backup-pdf",
              name: "original.pdf",
              size: 23,
              type: "application/pdf",
              uploadedAt: now,
              status: "saved",
              sourcePath: sourceUrl,
              contentPath: contentUrl,
              path: contentUrl,
              contentKind: "extracted_text",
              contentSize: 30,
              storageStatus: "saved",
              indexStatus: "not_indexed",
            },
          ],
        },
      ],
    }),
  );
  await setIndexedDbValue(
    page,
    "neo-chat-memory",
    persistedState({
      settings: {
        enabled: false,
        searchEnabled: false,
        autoRecordEnabled: false,
        dreamEnabled: false,
      },
      memories: [],
      dreamStatus: { isRunning: false },
    }),
  );
  await writeOpfsFile(
    page,
    "knowledge-base/backup-knowledge/source/original.pdf",
    "%PDF-1.4 bundled original",
  );
  await writeOpfsFile(
    page,
    "knowledge-base/backup-knowledge/content/extracted.txt",
    "Bundled extracted knowledge text",
  );

  await page.goto("/?panel=settings&settingsTab=system");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export all local data" }).click();
  const backupDownload = await downloadPromise;
  const backupPath = await backupDownload.path();
  if (!backupPath) throw new Error("The generated backup was not persisted.");

  const archive = unzipSync(new Uint8Array(await readFile(backupPath)));
  const manifest = JSON.parse(strFromU8(archive["manifest.json"]));
  const exportedDataText = strFromU8(archive["data.json"]);
  expect(manifest).toMatchObject({
    format: "neo-chat-backup",
    exportVersion: 3,
    storageVersion: 5,
  });
  expect(manifest.files).toHaveLength(2);
  expect(exportedDataText).toContain("non-active branch retained in backup");
  expect(exportedDataText).not.toContain(providerSecret);

  await clearBrowserAppData(page);
  await page.goto("/?panel=settings&settingsTab=system");
  await expect(page.getByText("Backup Session", { exact: true })).toHaveCount(
    0,
  );

  await page
    .getByLabel("Select a neo-chat backup to restore")
    .setInputFiles(backupPath);
  const restoreButton = page.getByRole("button", {
    name: "Replace and Restore",
  });
  await expect(restoreButton).toBeVisible();
  await Promise.all([
    page.waitForEvent("framenavigated", { timeout: 30_000 }),
    restoreButton.click(),
  ]);
  await expect(page.getByText("Credential setup required")).toBeVisible({
    timeout: 30_000,
  });

  const restoredChatRaw = await getIndexedDbValue(page, "neo-chat-storage");
  const restoredChat =
    typeof restoredChatRaw === "string"
      ? JSON.parse(restoredChatRaw)
      : restoredChatRaw;
  expect(restoredChat).toMatchObject({
    state: {
      sessions: [{ id: sessionId, title: "Backup Session" }],
      workspaces: [{ id: "backup-workspace", name: "Backup Workspace" }],
    },
  });

  const restoredTree = (await getIndexedDbValue(
    page,
    `session_messages_${sessionId}`,
  )) as any;
  expect(restoredTree.nodesById.alternate.message.content).toBe(
    "non-active branch retained in backup",
  );

  const restoredKnowledgeRaw = await getIndexedDbValue(
    page,
    "knowledge-storage",
  );
  const restoredKnowledge =
    typeof restoredKnowledgeRaw === "string"
      ? JSON.parse(restoredKnowledgeRaw)
      : (restoredKnowledgeRaw as any);
  const restoredFile = restoredKnowledge.state.collections[0].files[0];
  expect(restoredKnowledge.state.collections[0].name).toBe("Backup Knowledge");
  expect(restoredFile.sourcePath).not.toBe(sourceUrl);
  expect(restoredFile.contentPath).not.toBe(contentUrl);
  expect(await readOpfsFile(page, restoredFile.sourcePath)).toBe(
    "%PDF-1.4 bundled original",
  );
  expect(await readOpfsFile(page, restoredFile.contentPath)).toBe(
    "Bundled extracted knowledge text",
  );

  const restoredCore = await page.evaluate(() =>
    localStorage.getItem("neo-chat-core-settings"),
  );
  expect(restoredCore).not.toContain(providerSecret);
  expect(restoredCore).not.toContain("apiKeySecret");
});
