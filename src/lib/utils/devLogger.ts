const shouldLogInDevelopment = () => process.env.NODE_ENV !== "production";

export const logDevError = (...args: unknown[]) => {
  if (shouldLogInDevelopment()) {
    console.error(...args);
  }
};

export const logDevWarn = (...args: unknown[]) => {
  if (shouldLogInDevelopment()) {
    console.warn(...args);
  }
};

export const logDevInfo = (...args: unknown[]) => {
  if (shouldLogInDevelopment()) {
    console.log(...args);
  }
};
