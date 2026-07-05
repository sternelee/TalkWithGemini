const SVG_ROOT_RE = /<svg\b([^>]*)>/i;
const SVG_VIEWBOX_RE = /\sviewBox=(["'])(.*?)\1/i;

const formatSvgSize = (value: number) =>
  Number.isInteger(value)
    ? String(value)
    : String(Math.round(value * 1000) / 1000);

function getSvgViewBoxSize(svg: string) {
  const match = svg.match(SVG_VIEWBOX_RE);
  if (!match) return null;
  const values = (match[2] || "")
    .trim()
    .split(/[\s,]+/u)
    .map((value) => Number.parseFloat(value));
  const width = values[2];
  const height = values[3];
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return { width: formatSvgSize(width), height: formatSvgSize(height) };
}

function hasSvgAttribute(attributes: string, name: string) {
  return new RegExp(`\\s${name}=`, "iu").test(attributes);
}

function mergeSvgClass(attributes: string, className: string) {
  if (!hasSvgAttribute(attributes, "class")) {
    return `${attributes} class="${className}"`;
  }

  return attributes.replace(
    /\sclass=(["'])(.*?)\1/iu,
    (match, quote: string, value: string) => {
      const classNames = value.split(/\s+/u).filter(Boolean);
      if (classNames.includes(className)) return match;
      return ` class=${quote}${[...classNames, className].join(" ")}${quote}`;
    },
  );
}

function ensureSvgAttribute(attributes: string, name: string, value: string) {
  return hasSvgAttribute(attributes, name)
    ? attributes
    : `${attributes} ${name}="${value}"`;
}

function removeSvgMaxWidthStyle(attributes: string) {
  return attributes.replace(
    /\sstyle=(["'])(.*?)\1/iu,
    (_match, quote: string, value: string) => {
      const cleaned = value
        .split(";")
        .map((item) => item.trim())
        .filter((item) => item && !/^max-width\s*:/iu.test(item))
        .join("; ");
      return cleaned ? ` style=${quote}${cleaned}${quote}` : "";
    },
  );
}

function stabilizeMermaidSvgSize(attributes: string, svg: string) {
  const size = getSvgViewBoxSize(svg);
  if (!size) return attributes;

  let nextAttributes = attributes.replace(
    /\swidth=(["'])100%\1/iu,
    ` width="${size.width}"`,
  );
  if (!hasSvgAttribute(nextAttributes, "width")) {
    nextAttributes = `${nextAttributes} width="${size.width}"`;
  }
  if (!hasSvgAttribute(nextAttributes, "height")) {
    nextAttributes = `${nextAttributes} height="${size.height}"`;
  }
  return removeSvgMaxWidthStyle(nextAttributes);
}

function normalizeSvgRoot(
  svg: string,
  {
    className,
    exportType,
    stabilizeSize = false,
  }: { className: string; exportType: string; stabilizeSize?: boolean },
) {
  return svg.replace(SVG_ROOT_RE, (_match, attributes: string) => {
    let nextAttributes = mergeSvgClass(attributes, className);
    nextAttributes = ensureSvgAttribute(
      nextAttributes,
      "data-diagram-export",
      exportType,
    );
    nextAttributes = ensureSvgAttribute(
      nextAttributes,
      "preserveAspectRatio",
      "xMidYMid meet",
    );
    if (stabilizeSize) {
      nextAttributes = stabilizeMermaidSvgSize(nextAttributes, svg);
    }
    return `<svg${nextAttributes}>`;
  });
}

export const normalizeMermaidSvg = (svg: string) =>
  normalizeSvgRoot(svg, {
    className: "markdown-mermaid-svg-snapshot",
    exportType: "mermaid",
    stabilizeSize: true,
  });

export const normalizeMindMapSvg = (svg: string) =>
  normalizeSvgRoot(
    svg.replace(
      /<rect width="100%" height="100%" fill="[^"]*"\/>/,
      '<rect width="100%" height="100%" fill="transparent"/>',
    ),
    {
      className: "markdown-mindmap-svg-snapshot",
      exportType: "mindmap",
    },
  );
