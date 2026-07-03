export interface MobileMessageMetaTooltipInput {
  durationString: string | null;
  tokenText: string;
  labels: {
    duration: string;
    tokens: string;
  };
}

export function buildMobileMessageMetaTooltip({
  durationString,
  tokenText,
  labels,
}: MobileMessageMetaTooltipInput): string[] {
  return [
    ...(durationString ? [`${labels.duration}: ${durationString}`] : []),
    ...(tokenText ? [`${labels.tokens}: ${tokenText}`] : []),
  ];
}
