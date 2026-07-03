"use client";

import React, { useMemo, useState } from "react";
import { getSafeDisplayImageSrc } from "@/lib/security/clientUrl";

interface SafeImageProps extends Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src"
> {
  src?: string;
  fallback: React.ReactNode;
}

const SafeImage: React.FC<SafeImageProps> = ({
  src,
  fallback,
  decoding = "async",
  loading = "lazy",
  onError,
  alt = "",
  referrerPolicy = "no-referrer",
  ...props
}) => {
  const safeSrc = useMemo(() => getSafeDisplayImageSrc(src), [src]);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!safeSrc || failedSrc === safeSrc) {
    return <>{fallback}</>;
  }

  return (
    <img
      {...props}
      src={safeSrc}
      alt={alt}
      decoding={decoding}
      loading={loading}
      referrerPolicy={referrerPolicy}
      onError={(event) => {
        setFailedSrc(safeSrc);
        onError?.(event);
      }}
    />
  );
};

export default SafeImage;
