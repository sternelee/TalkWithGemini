"use client";
import React from "react";
import {
  FolderSearch,
  KeyRound,
  Globe,
  Zap,
  FileCode,
  Server,
  Layers,
  ExternalLink,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSettingsStore } from "@/store/core/settingsStore";
import { SecretInput, SimpleSwitch } from "./SettingsUI";
import { RAG_LIMITS } from "@/config/limits";
import {
  encryptLocalSecret,
  LOCAL_SECRET_CONTEXTS,
} from "@/lib/security/localSecrets";

const LLAMA_PARSE_KEY_URL = "https://cloud.llamaindex.ai/";
const UPSTASH_VECTOR_KEY_URL = "https://console.upstash.com/vector";

const RAGSettings = () => {
  const t = useTranslations("RAG");
  const { rag, updateRAGConfig } = useSettingsStore();
  const useDefaultDocumentProcessing = Boolean(
    rag.useDefaultDocumentProcessing && rag.serverDocumentProcessingAvailable,
  );
  const useDefaultVectorStore = Boolean(
    rag.useDefaultVectorStore && rag.serverVectorStoreAvailable,
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-foreground flex items-center gap-2">
            <FolderSearch
              size={20}
              className="text-blue-500"
              aria-hidden="true"
            />
            {t("title")}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs font-normal text-gray-500 dark:text-muted-foreground">
              {rag.enabled ? t("enabled") : t("disabled")}
            </span>
            <SimpleSwitch
              ariaLabel={t("enableAria")}
              name="ragEnabled"
              checked={rag.enabled}
              onChange={() => updateRAGConfig({ enabled: !rag.enabled })}
            />
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 flex gap-3">
          <Zap
            size={20}
            className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="text-xs text-blue-800 dark:text-blue-200">
            <p className="font-semibold mb-1">{t("supportTitle")}</p>
            <p className="opacity-80">{t("supportDesc")}</p>
          </div>
        </div>

        {/* Document Processing (LlamaParse) Section */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-foreground/85 border-b border-gray-100 dark:border-border pb-2">
            <FileCode
              size={16}
              className="text-purple-500"
              aria-hidden="true"
            />
            <span>{t("documentProcessing")}</span>
          </div>
          <div className="space-y-4">
            {rag.serverDocumentProcessingAvailable && (
              <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-900/40 dark:bg-blue-900/10">
                <div>
                  <div className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    {t("defaultDocumentProcessing")}
                  </div>
                  <div className="text-[10px] text-blue-600/80 dark:text-blue-300/80">
                    {t("defaultDocumentProcessingDesc")}
                  </div>
                </div>
                <SimpleSwitch
                  ariaLabel={t("defaultDocumentProcessing")}
                  name="ragDefaultDocumentProcessing"
                  checked={useDefaultDocumentProcessing}
                  onChange={() =>
                    updateRAGConfig({
                      useDefaultDocumentProcessing:
                        !useDefaultDocumentProcessing,
                    })
                  }
                />
              </div>
            )}

            {!useDefaultDocumentProcessing && (
              <div className="space-y-2">
                <label
                  htmlFor="rag-llamaparse-api-key"
                  className="text-sm font-medium text-gray-700 dark:text-foreground/85 flex items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-2">
                    <KeyRound size={16} aria-hidden="true" />{" "}
                    {t("llamaParseApiKey")}
                  </span>
                  <a
                    href={LLAMA_PARSE_KEY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                  >
                    {t("getKey")} <ExternalLink size={10} aria-hidden="true" />
                  </a>
                </label>
                <div className="relative">
                  <SecretInput
                    id="rag-llamaparse-api-key"
                    name="llamaParseApiKey"
                    maxLength={RAG_LIMITS.maxLlamaParseApiKeyChars}
                    placeholder={t("llamaParseKeyPlaceholder")}
                    hasSecret={Boolean(
                      rag.llamaParseApiKey || rag.llamaParseApiKeySecret,
                    )}
                    onSave={async (value) =>
                      updateRAGConfig({
                        llamaParseApiKey: "",
                        llamaParseApiKeySecret: await encryptLocalSecret(
                          value,
                          LOCAL_SECRET_CONTEXTS.llamaParseApiKey,
                        ),
                      })
                    }
                    onClear={() =>
                      updateRAGConfig({
                        llamaParseApiKey: "",
                        llamaParseApiKeySecret: undefined,
                      })
                    }
                  />
                </div>
                <p className="text-[10px] text-gray-500">
                  {t("llamaParseHelp")}
                </p>
              </div>
            )}

            {/* Document Chunking */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700 dark:text-foreground/85 flex items-center gap-2">
                <Layers size={16} aria-hidden="true" /> {t("documentChunking")}
              </div>
              <div className="bg-gray-50 dark:bg-muted/50 rounded-xl p-3 border border-gray-200 dark:border-border">
                <div className="flex justify-between text-sm text-gray-700 dark:text-foreground/85 mb-2">
                  <label
                    htmlFor="rag-chunk-size"
                    className="font-medium text-xs"
                  >
                    {t("chunkSize")}
                  </label>
                  <span className="font-mono bg-white dark:bg-card border border-gray-200 dark:border-border px-2 py-0.5 rounded text-xs">
                    {rag.chunkSize}
                  </span>
                </div>
                <input
                  id="rag-chunk-size"
                  name="ragChunkSize"
                  type="range"
                  min={RAG_LIMITS.minChunkSize}
                  max={RAG_LIMITS.maxChunkSize}
                  step="128"
                  value={rag.chunkSize}
                  onChange={(e) =>
                    updateRAGConfig({
                      chunkSize: parseInt(e.target.value, 10),
                    })
                  }
                  aria-describedby="rag-chunk-size-bounds rag-chunk-size-help"
                  className="w-full h-2 bg-gray-200 dark:bg-accent rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <div
                  id="rag-chunk-size-bounds"
                  className="flex justify-between text-[10px] text-gray-400 mt-1"
                >
                  <span>{RAG_LIMITS.minChunkSize}</span>
                  <span>{RAG_LIMITS.maxChunkSize}</span>
                </div>
                <p
                  id="rag-chunk-size-help"
                  className="text-[10px] text-gray-500 dark:text-muted-foreground mt-2"
                >
                  {t("chunkSizeHelp")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Vector Storage (Upstash) Section */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-foreground/85 border-b border-gray-100 dark:border-border pb-2">
            <Server size={16} className="text-blue-500" aria-hidden="true" />
            <span>{t("vectorStorage")}</span>
          </div>
          <div className="space-y-4">
            {rag.serverVectorStoreAvailable && (
              <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-900/40 dark:bg-blue-900/10">
                <div>
                  <div className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    {t("defaultVectorStorage")}
                  </div>
                  <div className="text-[10px] text-blue-600/80 dark:text-blue-300/80">
                    {t("defaultVectorStorageDesc")}
                  </div>
                </div>
                <SimpleSwitch
                  ariaLabel={t("defaultVectorStorage")}
                  name="ragDefaultVectorStorage"
                  checked={useDefaultVectorStore}
                  onChange={() =>
                    updateRAGConfig({
                      useDefaultVectorStore: !useDefaultVectorStore,
                      enabled: !useDefaultVectorStore ? true : rag.enabled,
                    })
                  }
                />
              </div>
            )}

            {!useDefaultVectorStore && (
              <>
                <div className="space-y-2">
                  <label
                    htmlFor="rag-base-url"
                    className="text-sm font-medium text-gray-700 dark:text-foreground/85 flex items-center gap-2"
                  >
                    <Globe size={16} aria-hidden="true" /> {t("baseUrl")}
                  </label>
                  <input
                    id="rag-base-url"
                    name="ragBaseUrl"
                    type="url"
                    inputMode="url"
                    value={rag.url}
                    onChange={(e) => updateRAGConfig({ url: e.target.value })}
                    maxLength={RAG_LIMITS.maxBaseUrlChars}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t("baseUrlPlaceholder")}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-[background-color,border-color,box-shadow,color] font-mono text-gray-800 dark:text-foreground"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="rag-token"
                    className="text-sm font-medium text-gray-700 dark:text-foreground/85 flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-2">
                      <KeyRound size={16} aria-hidden="true" /> {t("token")}
                    </span>
                    <a
                      href={UPSTASH_VECTOR_KEY_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                    >
                      {t("getKey")}{" "}
                      <ExternalLink size={10} aria-hidden="true" />
                    </a>
                  </label>
                  <div className="relative">
                    <SecretInput
                      id="rag-token"
                      name="ragToken"
                      maxLength={RAG_LIMITS.maxTokenChars}
                      placeholder={t("tokenPlaceholder")}
                      hasSecret={Boolean(rag.token || rag.tokenSecret)}
                      onSave={async (value) =>
                        updateRAGConfig({
                          token: "",
                          tokenSecret: await encryptLocalSecret(
                            value,
                            LOCAL_SECRET_CONTEXTS.ragToken,
                          ),
                        })
                      }
                      onClear={() =>
                        updateRAGConfig({
                          token: "",
                          tokenSecret: undefined,
                        })
                      }
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="space-y-2 pt-4 border-t border-gray-100 dark:border-border">
          <div className="flex justify-between text-sm text-gray-700 dark:text-foreground/85">
            <label htmlFor="rag-top-k" className="font-medium">
              {t("contextTopK")}
            </label>
            <span className="font-mono bg-gray-100 dark:bg-muted px-2 py-0.5 rounded text-xs">
              {rag.topK}
            </span>
          </div>
          <input
            id="rag-top-k"
            name="ragTopK"
            type="range"
            min={RAG_LIMITS.minTopK}
            max={RAG_LIMITS.maxTopK}
            step="1"
            value={rag.topK}
            onChange={(e) =>
              updateRAGConfig({ topK: parseInt(e.target.value, 10) })
            }
            aria-describedby="rag-top-k-bounds"
            className="w-full h-2 bg-gray-200 dark:bg-accent rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div
            id="rag-top-k-bounds"
            className="flex justify-between text-[10px] text-gray-400"
          >
            <span>{RAG_LIMITS.minTopK}</span>
            <span>{RAG_LIMITS.maxTopK}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RAGSettings;
