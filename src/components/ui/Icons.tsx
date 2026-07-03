import React from "react";

export const Logo = ({
  className = "w-6 h-6",
  ...props
}: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 192 192"
    className={className}
    {...props}
  >
    <g fill="none" fillRule="nonzero" fillOpacity="0.48">
      <path
        fill="#03B2DE"
        d="M153.922 153.905a81.95 81.95 0 0 1-60.896 24.045c-6.97-.231-8.715-8.546-5.409-13.553 14.276-21.582 60.322-22.395 80.644-47.835a44.84 44.84 0 0 0 8.42-17.444c.447-1.762 1.005-3.723 1.3-5.118a82.09 82.09 0 0 1-24.06 59.873z"
      />
      <path
        fill="#8E03FF"
        d="M153.887 153.957A81.99 81.99 0 0 0 177.95 93.03c-.231-6.982-8.56-8.72-13.563-5.412-16.86 11.15-21.016 41.677-34.18 64.201-7.532 12.92-20.68 24.86-36.207 26.16a82.05 82.05 0 0 0 59.887-24.023"
      />
      <path
        fill="#00DEB9"
        d="M38.089 38.104A81.93 81.93 0 0 1 98.972 14.05c6.985.231 8.713 8.557 5.408 13.558-14.265 21.59-60.31 22.403-80.628 47.853a44.9 44.9 0 0 0-8.418 17.45c-.446 1.731-.996 3.693-1.315 5.089a82.15 82.15 0 0 1 24.054-59.896z"
      />
      <path
        fill="#1D88E1"
        d="M38.095 38.077A81.97 81.97 0 0 0 14.05 98.971c.23 6.986 8.554 8.715 13.553 5.409 21.581-14.268 22.395-60.32 47.835-80.642a44.84 44.84 0 0 1 17.444-8.42c1.762-.446 3.723-.996 5.118-1.299a82.1 82.1 0 0 0-59.873 24.058z"
      />
      <path
        fill="#8E03FF"
        d="M48.738 163C23.3 119.092 192.788 97.645 163.61 50.455A82.2 82.2 0 0 0 142.616 29c20.471 35.158-79.222 54.83-110.031 84.44-8.96 8.6-10.07 20.893-2.86 30.966A82.3 82.3 0 0 0 48.738 163"
      />
      <path
        fill="#1D88E1"
        d="M163 48.997C122.252 25.373 101.81 166.47 61.997 167.992c-3.543.143-7.61-1.587-11.54-3.967A82.2 82.2 0 0 1 29 143.003C70.858 167.42 90.777 21.232 131.628 24.04c3.718.254 8.402 2.832 12.77 5.958A82.7 82.7 0 0 1 163 49.037z"
      />
    </g>
  </svg>
);

export const BubblesLoading = ({
  className = "",
  ...props
}: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 32 24"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <circle cx="0" cy="12" r="0" transform="translate(8 0)" fill="currentColor">
      <animate
        attributeName="r"
        begin="0"
        calcMode="spline"
        dur="1.2s"
        keySplines="0.2 0.2 0.4 0.8;0.2 0.6 0.4 0.8;0.2 0.6 0.4 0.8"
        keyTimes="0;0.2;0.7;1"
        repeatCount="indefinite"
        values="0; 4; 0; 0"
      />
    </circle>
    <circle
      cx="0"
      cy="12"
      r="0"
      transform="translate(16 0)"
      fill="currentColor"
    >
      <animate
        attributeName="r"
        begin="0.3"
        calcMode="spline"
        dur="1.2s"
        keySplines="0.2 0.2 0.4 0.8;0.2 0.6 0.4 0.8;0.2 0.6 0.4 0.8"
        keyTimes="0;0.2;0.7;1"
        repeatCount="indefinite"
        values="0; 4; 0; 0"
      />
    </circle>
    <circle
      cx="0"
      cy="12"
      r="0"
      transform="translate(24 0)"
      fill="currentColor"
    >
      <animate
        attributeName="r"
        begin="0.6"
        calcMode="spline"
        dur="1.2s"
        keySplines="0.2 0.2 0.4 0.8;0.2 0.6 0.4 0.8;0.2 0.6 0.4 0.8"
        keyTimes="0;0.2;0.7;1"
        repeatCount="indefinite"
        values="0; 4; 0; 0"
      />
    </circle>
  </svg>
);
