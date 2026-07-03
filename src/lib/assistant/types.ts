export interface LobeAgentMeta {
  avatar: string;
  description: string;
  tags: string[];
  title: string;
  category: string;
  systemRole?: string;
}

export interface LobeAgent {
  identifier: string;
  meta: LobeAgentMeta;
  createdAt: string;
  homepage: string;
  author: string;
  isCustom?: boolean;
}
