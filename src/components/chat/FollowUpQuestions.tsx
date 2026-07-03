import React, { useId } from "react";
import { useTranslations } from "next-intl";

interface FollowUpQuestionsProps {
  questions: string[];
  onClick: (question: string) => void;
}

const FollowUpQuestions: React.FC<FollowUpQuestionsProps> = ({
  questions,
  onClick,
}) => {
  const t = useTranslations("FollowUp");
  const headingId = useId();
  const visibleQuestions = questions
    .map((question) => question.trim())
    .filter(Boolean);

  if (visibleQuestions.length === 0) return null;

  return (
    <section
      aria-labelledby={headingId}
      className="mb-2 flex flex-col px-3 py-1 animate-in fade-in slide-in-from-top-2 duration-500 motion-reduce:animate-none motion-reduce:duration-0 md:flex-row print:hidden"
    >
      <h2 id={headingId} className="sr-only">
        {t("heading")}
      </h2>
      {/* Placeholder for Avatar alignment to match MessageItem layout */}
      <div className="flex w-8 flex-shrink-0 items-center justify-center md:w-12" />

      <div className="min-w-0 flex-1 pl-1 md:pl-0">
        <ul className="flex flex-col divide-y divide-gray-100 dark:divide-border">
          {visibleQuestions.map((question, idx) => (
            <li key={`${question}-${idx}`} className="min-w-0">
              <button
                type="button"
                aria-label={t("askAria", { question })}
                onClick={() => onClick(question)}
                className="w-full rounded-md px-2 py-1 text-left text-sm leading-relaxed text-gray-400 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-muted-foreground/70 dark:hover:text-foreground dark:focus-visible:ring-blue-400/60 dark:focus-visible:ring-offset-background md:py-1.5"
              >
                <span className="block min-w-0 break-words">{question}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default FollowUpQuestions;
