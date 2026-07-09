import { PRODUCT_NAME } from "@/lib/product";

export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-screen w-full items-center justify-center bg-background text-sm text-muted-foreground"
    >
      Loading {PRODUCT_NAME}…
    </div>
  );
}
