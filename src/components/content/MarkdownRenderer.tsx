"use client";

import dynamic from "next/dynamic";
import type { MarkdownRendererProps } from "./MarkdownRendererClient";

const MarkdownRendererClient = dynamic<MarkdownRendererProps>(
  () => import("./MarkdownRendererClient"),
  {
    ssr: false,
  },
);

export type { MarkdownRendererProps };

export default function MarkdownRenderer(props: MarkdownRendererProps) {
  return <MarkdownRendererClient {...props} />;
}
