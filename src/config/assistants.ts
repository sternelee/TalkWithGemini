/**
 * 内置助理配置
 * 定义系统预设的 AI 助理
 */

import { Assistant } from "@/types";

/**
 * 内置助理列表
 */
export const BUILT_IN_ASSISTANTS: Assistant[] = [
  {
    id: "taxbot",
    name: "TaxBot",
    description:
      "AI Tax Consultant: Provides global general tax information and guidance.",
    icon: "📊",
    color: "bg-blue-100 text-blue-600",
  },
  {
    id: "soccer",
    name: "Soccer Guru AI",
    description:
      "Expert on soccer discussions, real-time updates, player insights, and history.",
    icon: "⚽",
    color: "bg-green-100 text-green-600",
  },
  {
    id: "review",
    name: "Colleague Review Helper",
    description:
      "Give your colleagues a great review. Professional tone generator.",
    icon: "💯",
    color: "bg-red-100 text-red-600",
  },
  {
    id: "cloze",
    name: "Cloze Test Generator",
    description:
      "Generates perfect cloze tests (fill-in-the-blanks) for study.",
    icon: "🔠",
    color: "bg-gray-100 text-gray-600",
  },
];

/**
 * 助理分类
 */
export const ASSISTANT_CATEGORIES = {
  productivity: "Productivity",
  education: "Education",
  entertainment: "Entertainment",
  business: "Business",
  creative: "Creative",
  technical: "Technical",
} as const;

/**
 * 向后兼容的导出
 */
export const ASSISTANTS = BUILT_IN_ASSISTANTS;
