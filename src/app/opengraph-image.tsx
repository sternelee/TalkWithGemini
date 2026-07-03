import { ImageResponse } from "next/og";

import { getSeoScreenshotUrls } from "@/lib/seo";

export const alt = "Neo Chat desktop and mobile workspace screenshots";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image() {
  const [desktopScreenshotSrc, mobileScreenshotSrc] = getSeoScreenshotUrls();

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: "#0f172a",
      }}
    >
      <img
        src={desktopScreenshotSrc}
        alt=""
        width={1200}
        height={630}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 44,
          bottom: 34,
          width: 292,
          height: 520,
          display: "flex",
          overflow: "hidden",
          border: "6px solid #ffffff",
          borderRadius: 30,
          background: "#ffffff",
        }}
      >
        <img
          src={mobileScreenshotSrc}
          alt=""
          width={292}
          height={520}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </div>
    </div>,
    size,
  );
}
